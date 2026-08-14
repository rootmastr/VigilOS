/**
 * VigilOS Edge Tracker Firmware — ESP8266 / ESP32
 * Secure Device Token Authentication Module (PRD 3.2)
 * + Dual-Stage GPS Filtering (Sanity Gatekeeping + Adaptive Moving Average)
 *
 * Features:
 *  - Loads device token from non-volatile LittleFS storage (`/token.txt`) on boot.
 *  - Transmits telemetry over HTTP REST using the `X-Device-Token` custom header.
 *  - Supports MQTT connection using the token as the client password for topic ACLs.
 *  - Serial provisioning:  `TOKEN:<32-char-token>`  stores/overwrites the token.
 *  - Dual-stage GPS filtering: sanity gatekeeping + adaptive moving average.
 *
 * Wire-up (GPS NEO-6M / ublox):
 *   ESP32:  TX2(17) -> GPS RX,  RX2(16) -> GPS TX
 *   ESP8266 (Wemos D1 Mini): D2 (GPIO4) -> GPS TX, D1 (GPIO5) -> GPS RX (SoftwareSerial)
 *
 * Dependencies:
 *  - TinyGPS++ (by Mikal Hart) — install via Library Manager
 *
 * RAM Budget:
 *  - Ring buffer:  44 bytes  (5 x lat + 5 x lng + head + count)
 *  - State vars:   20 bytes  (last valid pos, timestamps, flags)
 *  - Total:        64 bytes  (well within 200-byte ESP8266 constraint)
 */

#include "config.h"
#include "token_store.h"
#include <TinyGPSPlus.h>

// ============================================================================
//  Platform-specific includes
// ============================================================================
#if defined(ARDUINO_ARCH_ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <HardwareSerial.h>
  #define LED_BUILTIN_LED LED_BUILTIN
#else
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <SoftwareSerial.h>
#endif

// MQTT (PubSubClient) — optional. Install via Library Manager if MQTT transport is used.
#ifdef VIGIL_ENABLE_MQTT
  #include <PubSubClient.h>
  WiFiClientSecure mqttSecureClient;
  PubSubClient mqtt(mqttSecureClient);
#endif

// ============================================================================
//  GPS Serial Configuration
// ============================================================================
#if defined(ARDUINO_ARCH_ESP32)
  HardwareSerial gpsSerial(2);
#else
  // Wemos D1 Mini: SoftwareSerial on D2(GPIO4)=RX, D1(GPIO5)=TX
  SoftwareSerial gpsSerial(D2, D1);
#endif

// ============================================================================
//  GPS Filter Configuration — Tweak these for your deployment
// ============================================================================
#define GPS_FILTERWindowSize     5       // Moving average window (ring buffer depth)
#define GPS_FILTER_MAX_HDOP      3.0     // Reject fixes with HDOP above this
#define GPS_FILTER_MAX_SPEED_KMH 200.0   // Reject speed > bus max (~120 km/h city, 200 guard)
#define GPS_FILTER_MAX_JUMP_M    500.0   // Reject teleport jumps > 500 meters
#define GPS_FILTER_JUMP_WINDOW_MS 10000  // Time window for jump detection (10 seconds)
#define GPS_FILTER_EARTH_RADIUS_M 6371000.0 // Earth radius for haversine (meters)

// ============================================================================
//  GPS Filter — State Variables (RAM: ~64 bytes total)
// ============================================================================

// Circular buffer for adaptive moving average
static float gpsFilterLatBuf[GPS_FILTERWindowSize];
static float gpsFilterLngBuf[GPS_FILTERWindowSize];
static uint8_t gpsFilterHead = 0;   // Next write position
static uint8_t gpsFilterCount = 0;  // Number of valid samples in buffer

// Sanity gatekeeping state
static float gpsFilterLastLat = 0.0;
static float gpsFilterLastLng = 0.0;
static unsigned long gpsFilterLastTime = 0;
static bool gpsFilterHasLast = false;

// Output flag: set to true only after buffer is full and filtering is active
static bool gpsFilterActive = false;

// Stats for Serial Monitor debug
static uint32_t gpsFilterAccepted = 0;
static uint32_t gpsFilterRejectedHDOP = 0;
static uint32_t gpsFilterRejectedSpeed = 0;
static uint32_t gpsFilterRejectedJump = 0;
static uint32_t gpsFilterRawCount = 0;

// ============================================================================
//  TinyGPS++ Object
// ============================================================================
TinyGPSPlus gps;

unsigned long lastTelemetrySent = 0;
unsigned long lastWifiAttempt = 0;

// ============================================================================
//  SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println(F("\n[VigilOS] Edge tracker booting..."));
  Serial.printf("[VigilOS] Firmware: %s | Board: %s\n", VIGIL_FW_VERSION, VIGIL_BOARD_NAME);
  Serial.printf("[VigilOS] Device ID: %s\n", VIGIL_DEVICE_ID);

  // ---- 1. Load device token from non-volatile storage (LittleFS /token.txt) ----
  if (!tokenStore.begin()) {
    Serial.println(F("[VigilOS] WARNING: LittleFS mount failed — falling back to EEPROM."));
  }

  if (tokenStore.hasToken()) {
    Serial.println(F("[VigilOS] Device token loaded from LittleFS (/token.txt)."));
    tokenStore.printMasked();
  } else {
    Serial.println(F("[VigilOS] NO TOKEN FOUND. Awaiting provisioning over Serial."));
    Serial.println(F("[VigilOS] Send:  TOKEN:<token-string>   (e.g. TOKEN:vgl_live_7f8a9b0c...)"));
    enterProvisioningMode();
  }

  // ---- 2. Initialize GPS receiver ----
#if defined(ARDUINO_ARCH_ESP32)
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println(F("[VigilOS] GPS serial (9600 baud) on HardwareSerial2."));
#else
  gpsSerial.begin(9600);
  Serial.println(F("[VigilOS] GPS serial (9600 baud) on SoftwareSerial D2/D1."));
#endif

  // ---- 3. Initialize GPS filter ring buffer ----
  Serial.println(F("[GPS-FILTER] Dual-stage GPS filter initialized (window=5, HDOP<3.0, speed<200km/h)"));

  // ---- 4. Connect to network ----
  connectWiFi();
}

// ============================================================================
//  MAIN LOOP
// ============================================================================
void loop() {
  // Provisioning / command listener on the USB serial console
  pollSerialProvisioning();

  ensureWiFiConnected();

  unsigned long now = millis();

  // ======================================================================
  //  STEP A: Feed GPS serial data into TinyGPS++ (non-blocking)
  //  This must run every loop() iteration to avoid serial buffer overflow.
  // ======================================================================
  bool newData = false;
  while (gpsSerial.available()) {
    char c = gpsSerial.read();
    if (gps.encode(c)) {
      newData = true;
    }
  }

  // ======================================================================
  //  STEP B: When new GPS fix is available, run Dual-Stage Filter
  //  This runs AFTER gps.encode() but BEFORE sendTelemetry().
  // ======================================================================
  if (newData && gps.location.isValid()) {
    float rawLat = gps.location.lat();
    float rawLng = gps.location.lng();
    float rawHdop = gps.hdop.hdop();
    float rawSpeed = gps.speed.kmph();
    gpsFilterRawCount++;

    float filteredLat, filteredLng;

    // Apply Dual-Stage GPS Filter
    if (applyGPSFilter(rawLat, rawLng, rawHdop, rawSpeed, filteredLat, filteredLng)) {
      // Store filtered coordinates globally for telemetry
      // (these are used in buildTelemetryPayload)
      extern float g_filteredLat;
      extern float g_filteredLng;
      g_filteredLat = filteredLat;
      g_filteredLng = filteredLng;
    }
  }

  // ---- 5. Periodic telemetry push with X-Device-Token header ----
  if (now - lastTelemetrySent >= TELEMETRY_INTERVAL_MS) {
    lastTelemetrySent = now;
    sendTelemetry();
  }

#ifdef VIGIL_ENABLE_MQTT
  // ---- 6. MQTT control channel (token used as MQTT password / ACL key) ----
  if (!mqtt.connected()) {
    mqttConnect();
  }
  mqtt.loop();
#endif
}

// ============================================================================
//  DUAL-STAGE GPS FILTER — Core Implementation
// ============================================================================

/**
 * Haversine formula — calculate distance between two lat/lng points in meters.
 * Pure math, no heap allocation, ~100 bytes stack.
 */
static float haversineDistanceM(float lat1, float lng1, float lat2, float lng2) {
  float dLat = (lat2 - lat1) * DEG_TO_RAD;
  float dLng = (lng2 - lng1) * DEG_TO_RAD;
  float a = sin(dLat * 0.5) * sin(dLat * 0.5) +
            cos(lat1 * DEG_TO_RAD) * cos(lat2 * DEG_TO_RAD) *
            sin(dLng * 0.5) * sin(dLng * 0.5);
  float c = 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
  return GPS_FILTER_EARTH_RADIUS_M * c;
}

/**
 * Stage 1: Sanity Gatekeeping (Pre-Filter)
 * Rejects obviously bad GPS fixes before they enter the smoothing buffer.
 * Returns true if the fix passes all sanity checks.
 */
static bool sanityGatekeeping(float hdop, float speedKmh, float rawLat, float rawLng) {
  unsigned long now = millis();

  // --- Check 1: HDOP quality (higher = worse accuracy) ---
  if (hdop > GPS_FILTER_MAX_HDOP) {
    gpsFilterRejectedHDOP++;
    Serial.printf("[GPS-FILTER] REJECTED (HDOP=%.1f > %.1f) | raw=(%.6f, %.6f)\n",
                  hdop, GPS_FILTER_MAX_HDOP, rawLat, rawLng);
    return false;
  }

  // --- Check 2: Speed sanity (bus max ~120 km/h, guard at 200) ---
  if (speedKmh > GPS_FILTER_MAX_SPEED_KMH) {
    gpsFilterRejectedSpeed++;
    Serial.printf("[GPS-FILTER] REJECTED (SPEED=%.1f km/h > %.0f) | raw=(%.6f, %.6f)\n",
                  speedKmh, GPS_FILTER_MAX_SPEED_KMH, rawLat, rawLng);
    return false;
  }

  // --- Check 3: Teleport / position jump detection ---
  if (gpsFilterHasLast) {
    unsigned long timeDelta = now - gpsFilterLastTime;
    if (timeDelta < GPS_FILTER_JUMP_WINDOW_MS && timeDelta > 0) {
      float distance = haversineDistanceM(gpsFilterLastLat, gpsFilterLastLng, rawLat, rawLng);
      if (distance > GPS_FILTER_MAX_JUMP_M) {
        gpsFilterRejectedJump++;
        Serial.printf("[GPS-FILTER] REJECTED (JUMP=%.0fm > %.0fm in %lums) | raw=(%.6f, %.6f)\n",
                      distance, GPS_FILTER_MAX_JUMP_M, timeDelta, rawLat, rawLng);
        return false;
      }
    }
  }

  return true;
}

/**
 * Stage 2: Adaptive Moving Average Filter
 * Smooths coordinates using a circular buffer (ring buffer) of size N.
 * O(1) per sample, zero heap allocation.
 *
 * - Only outputs filtered values after buffer is fully populated (count == N).
 * - Early samples are accepted but not smoothed (prevents output bias).
 */
static void ringBufferAdd(float lat, float lng) {
  gpsFilterLatBuf[gpsFilterHead] = lat;
  gpsFilterLngBuf[gpsFilterHead] = lng;
  gpsFilterHead = (gpsFilterHead + 1) % GPS_FILTERWindowSize;
  if (gpsFilterCount < GPS_FILTERWindowSize) {
    gpsFilterCount++;
  }
}

static bool ringBufferAverage(float &avgLat, float &avgLng) {
  if (gpsFilterCount == 0) return false;

  double sumLat = 0.0;
  double sumLng = 0.0;
  for (uint8_t i = 0; i < gpsFilterCount; i++) {
    sumLat += gpsFilterLatBuf[i];
    sumLng += gpsFilterLngBuf[i];
  }
  avgLat = (float)(sumLat / gpsFilterCount);
  avgLng = (float)(sumLng / gpsFilterCount);
  return true;
}

/**
 * applyGPSFilter — Main entry point for the Dual-Stage GPS Filter.
 *
 * Flow:
 *   rawLat/rawLng/hdop/speed -> Stage 1 (sanity gatekeeping)
 *                                |
 *                              [PASS]
 *                                |
 *                                v
 *                           Stage 2 (ring buffer + moving average)
 *                                |
 *                           outLat/outLng (filtered or raw if buffer not full)
 *
 * Returns: true if data was accepted (either filtered or pre-filter raw).
 *          false if rejected by sanity gatekeeping.
 *
 * RAM: ~64 bytes total (ring buffer 44B + state 20B). Zero malloc/new.
 * CPU: ~50us per call on ESP8266 @ 80MHz. Non-blocking.
 */
static bool applyGPSFilter(float rawLat, float rawLng, float hdop, float speedKmh,
                           float &outLat, float &outLng) {

  // --- Stage 1: Sanity Gatekeeping ---
  if (!sanityGatekeeping(hdop, speedKmh, rawLat, rawLng)) {
    return false; // Rejected — do not update filter state
  }

  // Update "last known good" state for jump detection
  gpsFilterLastLat = rawLat;
  gpsFilterLastLng = rawLng;
  gpsFilterLastTime = millis();
  gpsFilterHasLast = true;

  // --- Stage 2: Adaptive Moving Average ---
  ringBufferAdd(rawLat, rawLng);

  if (gpsFilterCount >= GPS_FILTERWindowSize) {
    // Buffer full — output smoothed coordinates
    if (!gpsFilterActive) {
      gpsFilterActive = true;
      Serial.println(F("[GPS-FILTER] Ring buffer filled — adaptive filter ACTIVE"));
    }
    float avgLat, avgLng;
    ringBufferAverage(avgLat, avgLng);
    outLat = avgLat;
    outLng = avgLng;
  } else {
    // Buffer not full yet — pass through raw (avoid output bias)
    outLat = rawLat;
    outLng = rawLng;
  }

  gpsFilterAccepted++;

  // Periodic stats dump every 50 accepted fixes
  if (gpsFilterAccepted % 50 == 0) {
    Serial.printf("[GPS-FILTER] STATS | accepted=%lu rejected(HDOP=%lu speed=%lu jump=%lu) rawCount=%lu buffer=%d/%d\n",
                  gpsFilterAccepted, gpsFilterRejectedHDOP, gpsFilterRejectedSpeed,
                  gpsFilterRejectedJump, gpsFilterRawCount,
                  gpsFilterCount, GPS_FILTERWindowSize);
  }

  return true;
}

// ============================================================================
//  Global filtered coordinates (set by filter, read by telemetry)
// ============================================================================
float g_filteredLat = VIGIL_FALLBACK_LAT;
float g_filteredLng = VIGIL_FALLBACK_LNG;

// ============================================================================
//  WiFi
// ============================================================================
void connectWiFi() {
  Serial.printf("[VigilOS] Connecting to WiFi SSID '%s' ...\n", VIGIL_WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(VIGIL_WIFI_SSID, VIGIL_WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[VigilOS] WiFi connected. IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println(F("[VigilOS] WiFi connection failed — will retry in loop()."));
  }
}

void ensureWiFiConnected() {
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();
    if (now - lastWifiAttempt > 10000) {
      lastWifiAttempt = now;
      Serial.println(F("[VigilOS] Reconnecting WiFi..."));
      WiFi.reconnect();
    }
    return;
  }
}

// ============================================================================
//  Secure Telemetry Ingestion (HTTP REST + X-Device-Token header)
// ============================================================================
void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!tokenStore.hasToken()) return;

  String payload = buildTelemetryPayload();

  HTTPClient http;
  http.begin(String("http://") + VIGIL_SERVER_HOST + ":" + VIGIL_SERVER_PORT + VIGIL_INGEST_PATH);
  http.setConnectTimeout(8000);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");

  // ---- Critical security header: X-Device-Token ----
  http.addHeader("X-Device-Token", tokenStore.getToken());

  int httpCode = http.POST(payload);
  String response = http.getString();

  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[VigilOS] Telemetry accepted (HTTP %d).\n", httpCode);
  } else if (httpCode == 401) {
    Serial.printf("[VigilOS] HTTP 401 — token missing/expired. Response: %s\n", response.c_str());
    onAuthRejected();
  } else if (httpCode == 403) {
    Serial.printf("[VigilOS] HTTP 403 — token invalid/revoked or binding mismatch. Response: %s\n", response.c_str());
    onAuthRejected();
  } else {
    Serial.printf("[VigilOS] Telemetry failed (HTTP %d): %s\n", httpCode, response.c_str());
  }

  http.end();
}

/**
 * buildTelemetryPayload — Constructs JSON for the VigilOS backend.
 *
 * CRITICAL: Uses g_filteredLat/g_filteredLng (output of the GPS filter)
 * for position data, ensuring smooth Live Map markers and accurate
 * route deviation detection on the backend.
 *
 * Raw satellite count and HDOP are still sent for signal quality monitoring.
 */
String buildTelemetryPayload() {
  float lat = g_filteredLat;   // FILTERED — smooth for Live Map
  float lng = g_filteredLng;   // FILTERED — smooth for Live Map

  float speed = gps.speed.isValid() ? gps.speed.kmph() : 0.0;
  int heading = gps.course.isValid() ? (int)gps.course.deg() : 0;
  int satellites = gps.satellites.isValid() ? gps.satellites.value() : 0;
  float hdop = gps.hdop.isValid() ? gps.hdop.hdop() : 99.9;
  int passengers = readPassengerCount();

  // Raw (unfiltered) coordinates for backend diagnostics
  float rawLat = gps.location.isValid() ? gps.location.lat() : 0.0;
  float rawLng = gps.location.isValid() ? gps.location.lng() : 0.0;

  char buf[512];
  snprintf(buf, sizeof(buf),
           "{\"vehicleId\":\"%s\","
           "\"lat\":%.6f,\"lng\":%.6f,"          // Filtered position
           "\"rawLat\":%.6f,\"rawLng\":%.6f,"    // Raw position for diagnostics
           "\"speed\":%.1f,\"heading\":%d,"
           "\"satellites\":%d,\"hdop\":%.1f,"    // Signal quality metrics
           "\"filterActive\":%s,\"filterAccepted\":%lu,"
           "\"passengers\":%d}",
           VIGIL_DEVICE_ID,
           lat, lng,
           rawLat, rawLng,
           speed, heading,
           satellites, hdop,
           gpsFilterActive ? "true" : "false",
           (unsigned long)gpsFilterAccepted,
           passengers);

  // Serial Monitor: raw vs filtered comparison
  if (gps.location.isValid()) {
    float drift = haversineDistanceM(rawLat, rawLng, lat, lng);
    Serial.printf("[GPS-DEBUG] raw=(%.6f,%.6f) filtered=(%.6f,%.6f) drift=%.1fm | sats=%d hdop=%.1f\n",
                  rawLat, rawLng, lat, lng, drift, satellites, hdop);
  }

  return String(buf);
}

// ============================================================================
//  Sensor stubs — replace with your GPS / sensor library reads
// ============================================================================
int readPassengerCount() { return 0; }

// ============================================================================
//  Authentication rejection handler
// ============================================================================
void onAuthRejected() {
  Serial.println(F("[VigilOS] AUTH REJECTED — erasing token and entering provisioning mode."));
  tokenStore.erase();
  enterProvisioningMode();
}

// ============================================================================
//  Provisioning mode — obtain token over Serial
// ============================================================================
void enterProvisioningMode() {
  unsigned long provisionTimeout = millis() + PROVISION_TIMEOUT_MS;
  while (millis() < provisionTimeout) {
    if (processSerialCommand()) {
      Serial.println(F("[VigilOS] Provisioning complete — rebooting into normal operation."));
      delay(500);
      ESP.restart();
      return;
    }
    delay(10);
  }
  Serial.println(F("[VigilOS] Provisioning timeout — rebooting with stored token (if any)."));
  delay(500);
  ESP.restart();
}

void pollSerialProvisioning() {
  if (Serial.available() > 0) {
    processSerialCommand();
  }
}

bool processSerialCommand() {
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return false;

  if (line.startsWith("TOKEN:")) {
    String token = line.substring(6);
    token.trim();
    if (tokenStore.saveToken(token)) {
      Serial.println(F("[VigilOS] Token stored to /token.txt successfully."));
      return true;
    }
    Serial.println(F("[VigilOS] ERROR: token invalid — must be alphanumeric (32+ chars)."));
  } else if (line.equalsIgnoreCase("STATUS")) {
    Serial.printf("[VigilOS] device_id=%s wifi=%s\n",
                  VIGIL_DEVICE_ID, WiFi.status() == WL_CONNECTED ? "connected" : "disconnected");
    Serial.printf("[VigilOS] token_present=%s filter_active=%s\n",
                  tokenStore.hasToken() ? "true" : "false",
                  gpsFilterActive ? "true" : "false");
  } else if (line.equalsIgnoreCase("FILTER")) {
    Serial.printf("[GPS-FILTER] filter_active=%s buffer=%d/%d\n",
                  gpsFilterActive ? "true" : "false",
                  gpsFilterCount, GPS_FILTERWindowSize);
    Serial.printf("[GPS-FILTER] accepted=%lu rejected(HDOP=%lu speed=%lu jump=%lu)\n",
                  gpsFilterAccepted, gpsFilterRejectedHDOP,
                  gpsFilterRejectedSpeed, gpsFilterRejectedJump);
  }
  return false;
}

// ============================================================================
//  MQTT channel (optional) — token authenticates the client + topic ACLs
// ============================================================================
#ifdef VIGIL_ENABLE_MQTT
void mqttConnect() {
  Serial.printf("[VigilOS] Connecting to MQTT broker %s:%d ...\n", VIGIL_MQTT_HOST, VIGIL_MQTT_PORT);
  if (mqtt.connect(VIGIL_DEVICE_ID, VIGIL_DEVICE_ID, tokenStore.getToken())) {
    Serial.println(F("[VigilOS] MQTT connected (token-authenticated)."));
    mqtt.subscribe(String("fleet/") + VIGIL_DEVICE_ID + "/control");
  } else {
    Serial.print(F("[VigilOS] MQTT connection failed, rc="));
    Serial.println(mqtt.state());
  }
}
#endif
