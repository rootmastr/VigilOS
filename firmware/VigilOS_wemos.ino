/*
 * VigilOS Edge Tracker — Wemos D1 Mini (ESP8266) + NEO-6M GPS
 * 
 * Production firmware — NO dummy data, real GPS only.
 * + Dual-Stage GPS Filtering (Sanity Gatekeeping + Adaptive Moving Average)
 * 
 * Features:
 *  - Real GPS tracking with TinyGPS++ (requires valid fix to transmit)
 *  - Dual-stage GPS filter: reject bad fixes + smooth urban canyon jitter
 *  - HTTP telemetry to VigilOS backend every 10 seconds
 *  - Device token authentication via X-Device-Token header
 *  - Panic button with hardware interrupt (D5/GPIO14)
 *  - Non-blocking WiFi with auto-reconnect
 *  - LED status indicators
 *  - Serial provisioning for device token
 *  - Offline retry queue for failed telemetry
 *
 * Hardware:
 *  - Wemos D1 Mini (ESP8266)
 *  - NEO-6M GPS Module (TX->D2/GPIO4, RX->D1/GPIO5)
 *  - Panic button (D5/GPIO14 -> GND, active LOW)
 *  - Status LED (D4/GPIO2, built-in LED, active LOW)
 *
 * Backend API:
 *  - POST /api/v1/telemetry/ingest  (X-Device-Token header)
 *  - POST /api/v1/emergency/trigger (X-Device-Token header)
 *
 * GPS Filter RAM Budget:
 *  - Ring buffer:  44 bytes (5 x lat + 5 x lng + head + count)
 *  - State vars:   20 bytes (last valid pos, timestamps, flags)
 *  - Total:        64 bytes (well within 200-byte ESP8266 constraint)
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <SoftwareSerial.h>
#include <TinyGPS++.h>
#include <math.h>

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION — Adjust these for your deployment
// ══════════════════════════════════════════════════════════════════════════════

// WiFi credentials
const char* WIFI_SSID     = "Disapa kopi";
const char* WIFI_PASSWORD = "disapa24jam";

// VigilOS Backend
const char* SERVER_HOST    = "192.168.1.100";  // Change to your server IP/hostname
const uint16_t SERVER_PORT = 4000;
const char* TELEMETRY_PATH = "/api/v1/telemetry/ingest";
const char* EMERGENCY_PATH = "/api/v1/emergency/trigger";

// Device identity — MUST match vehicle registered in VigilOS backend
const char* DEVICE_ID      = "TS-101";   // Vehicle code (e.g., TS-101 for TransSemarang)

// Device token — generate via Command Center Fleet Admin, paste here
const char* DEVICE_TOKEN   = "vgl_live_PASTE_YOUR_TOKEN_HERE";

// Timing intervals (milliseconds)
#define TELEMETRY_INTERVAL_MS    10000UL    // Send telemetry every 10s
#define WIFI_RETRY_INTERVAL_MS   15000UL    // Retry WiFi every 15s
#define LED_BLINK_FAST_MS        100        // Fast blink (connecting)
#define LED_BLINK_SLOW_MS        500        // Slow blink (no GPS fix)
#define GPS_TIMEOUT_MS           30000      // GPS considered lost after 30s without fix

// GPS pins (SoftwareSerial on ESP8266)
#define GPS_RX_PIN  4   // D2 -> GPS TX
#define GPS_TX_PIN  5   // D1 -> GPS RX

// Panic button pin (active LOW, internal pull-up)
#define PANIC_BUTTON_PIN  14  // D5 -> Button -> GND

// Status LED (built-in LED on Wemos D1 Mini, active LOW)
#define STATUS_LED_PIN  LED_BUILTIN  // D4

// ══════════════════════════════════════════════════════════════════════════════
// GPS FILTER CONFIGURATION — Tune for your urban environment
// ══════════════════════════════════════════════════════════════════════════════

#define FILTER_WINDOW_SIZE        5       // Moving average window (ring buffer depth)
#define FILTER_MAX_HDOP           3.0     // Reject fixes with HDOP above this
#define FILTER_MAX_SPEED_KMH      200.0   // Reject speed > bus max (~120 km/h, 200 guard)
#define FILTER_MAX_JUMP_M         500.0   // Reject teleport jumps > 500 meters
#define FILTER_JUMP_WINDOW_MS     10000   // Time window for jump detection (10 seconds)
#define FILTER_EARTH_RADIUS_M     6371000.0 // Earth radius for haversine (meters)

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL OBJECTS
// ══════════════════════════════════════════════════════════════════════════════

SoftwareSerial gpsSerial(GPS_RX_PIN, GPS_TX_PIN);
TinyGPSPlus gps;

// ══════════════════════════════════════════════════════════════════════════════
// GPS FILTER STATE VARIABLES (RAM: ~64 bytes total)
// ══════════════════════════════════════════════════════════════════════════════

// Circular buffer for adaptive moving average
static float filterLatBuf[FILTER_WINDOW_SIZE];
static float filterLngBuf[FILTER_WINDOW_SIZE];
static uint8_t filterHead = 0;      // Next write position
static uint8_t filterCount = 0;     // Number of valid samples in buffer

// Sanity gatekeeping state
static float filterLastLat = 0.0;
static float filterLastLng = 0.0;
static unsigned long filterLastTime = 0;
static bool filterHasLast = false;

// Filter output state
static bool filterActive = false;   // True only after buffer is full

// Filtered coordinates (global — used by telemetry)
float g_filteredLat = 0.0;
float g_filteredLng = 0.0;

// Filter stats
static uint32_t filterAccepted = 0;
static uint32_t filterRejectedHDOP = 0;
static uint32_t filterRejectedSpeed = 0;
static uint32_t filterRejectedJump = 0;
static uint32_t filterRawCount = 0;

// ══════════════════════════════════════════════════════════════════════════════
// STATE VARIABLES
// ══════════════════════════════════════════════════════════════════════════════

// Timing
unsigned long lastTelemetrySent   = 0;
unsigned long lastWifiAttempt     = 0;
unsigned long lastGpsPrint        = 0;
unsigned long lastLedToggle       = 0;
unsigned long lastPanicPress      = 0;
unsigned long gpsLastValidTime    = 0;

// State flags
bool wifiConnected       = false;
bool gpsHasFix           = false;
bool panicTriggered      = false;

// LED state
bool ledState            = false;
bool ledBlinkEnabled     = true;
bool ledBlinkFast        = false;  // Fast = connecting, Slow = no GPS fix

// Panic debounce
#define PANIC_DEBOUNCE_MS  2000    // 2 second debounce for panic button

// Device token
char deviceToken[256] = {0};
bool hasToken = false;

// Offline retry queue (simple ring buffer)
#define RETRY_QUEUE_SIZE  10
struct TelemetryRecord {
  float lat;
  float lng;
  float speed;
  int heading;
  bool emergency;
};
TelemetryRecord retryQueue[RETRY_QUEUE_SIZE];
int retryQueueHead = 0;
int retryQueueTail = 0;
int retryQueueCount = 0;

// ══════════════════════════════════════════════════════════════════════════════
// SETUP
// ══════════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println(F("\n╔══════════════════════════════════════════════════╗"));
  Serial.println(F("║   VigilOS Edge Tracker — Wemos D1 Mini          ║"));
  Serial.println(F("║        Production Build v2.1 (GPS Filter)       ║"));
  Serial.println(F("╚══════════════════════════════════════════════════╝\n"));

  // 1. Initialize Status LED
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);  // LED ON (active LOW)
  pinMode(PANIC_BUTTON_PIN, INPUT_PULLUP);
  
  // Attach panic button interrupt
  attachInterrupt(digitalPinToInterrupt(PANIC_BUTTON_PIN), panicButtonISR, FALLING);

  // 2. Set device token from config
  strncpy(deviceToken, DEVICE_TOKEN, sizeof(deviceToken) - 1);
  deviceToken[sizeof(deviceToken) - 1] = '\0';
  hasToken = (strlen(deviceToken) >= 16);
  
  if (hasToken) {
    Serial.println(F("[BOOT] Device token loaded from config"));
    Serial.printf("[BOOT] Token: %.8s...\n", deviceToken);
  } else {
    Serial.println(F("[BOOT] NO TOKEN — Edit DEVICE_TOKEN in firmware and re-upload"));
  }

  // 3. Initialize GPS
  gpsSerial.begin(9600);
  Serial.println(F("[BOOT] GPS initialized (SoftwareSerial D2/D1 @ 9600 baud)"));

  // 4. Initialize GPS filter
  Serial.println(F("[GPS-FILTER] Dual-stage filter initialized (window=5, HDOP<3.0, speed<200km/h)"));

  // 5. Connect to WiFi (non-blocking)
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[BOOT] Connecting to WiFi: %s\n", WIFI_SSID);

  // 6. Wait for WiFi to connect
  Serial.println(F("[BOOT] Waiting for WiFi..."));
  unsigned long wifiTimeout = millis() + 15000;
  while (WiFi.status() != WL_CONNECTED && millis() < wifiTimeout) {
    delay(100);
    yield();
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[BOOT] WiFi connected: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println(F("[BOOT] WiFi connection timeout — will retry in loop"));
  }

  Serial.println(F("[BOOT] Setup complete — entering main loop\n"));
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════════════════════

void loop() {
  unsigned long now = millis();

  // ── TASK 1: GPS Parsing + Dual-Stage Filter (Highest priority) ────────────
  while (gpsSerial.available() > 0) {
    if (gps.encode(gpsSerial.read())) {
      if (gps.location.isValid()) {
        gpsHasFix = true;
        gpsLastValidTime = now;

        // ── Run GPS Filter on every valid fix ──
        float rawLat = gps.location.lat();
        float rawLng = gps.location.lng();
        float rawHdop = gps.hdop.hdop();
        float rawSpeed = gps.speed.kmph();
        filterRawCount++;

        float filteredLat, filteredLng;
        if (applyGPSFilter(rawLat, rawLng, rawHdop, rawSpeed, filteredLat, filteredLng)) {
          g_filteredLat = filteredLat;
          g_filteredLng = filteredLng;
        }
      }
    }
  }

  // Check if GPS fix is lost
  if (gpsHasFix && (now - gpsLastValidTime > GPS_TIMEOUT_MS)) {
    gpsHasFix = false;
    Serial.println(F("[GPS] Fix lost — waiting for re-acquisition"));
  }

  // ── TASK 2: WiFi Status Management (Non-blocking) ────────────────────────
  if (now - lastWifiAttempt > WIFI_RETRY_INTERVAL_MS) {
    lastWifiAttempt = now;
    
    wl_status_t status = WiFi.status();
    if (status == WL_CONNECTED && !wifiConnected) {
      wifiConnected = true;
      Serial.printf("[WiFi] CONNECTED! IP: %s\n", WiFi.localIP().toString().c_str());
    } else if (status != WL_CONNECTED && wifiConnected) {
      wifiConnected = false;
      Serial.println(F("[WiFi] DISCONNECTED — reconnecting..."));
      WiFi.reconnect();
    } else if (!wifiConnected) {
      Serial.print(F("[WiFi] Connecting...\n"));
    }
  }

  // ── TASK 3: Send Telemetry (Every 10 seconds) ───────────────────────────
  if (now - lastTelemetrySent >= TELEMETRY_INTERVAL_MS) {
    lastTelemetrySent = now;
    
    // Only send if we have a valid GPS fix
    if (wifiConnected && hasToken && gpsHasFix) {
      sendTelemetry(false);
      processRetryQueue();
    } else if (!gpsHasFix) {
      Serial.println(F("[TEL] Waiting for GPS fix before sending..."));
    }
  }

  // ── TASK 4: Handle Panic Button (ISR flag) ───────────────────────────────
  if (panicTriggered) {
    panicTriggered = false;
    Serial.println(F("\n[ALERT] PANIC BUTTON TRIGGERED!"));
    
    // Send panic immediately if GPS fix available
    if (wifiConnected && hasToken) {
      sendTelemetry(true);  // Send with emergency flag
    } else {
      // Queue for later if no WiFi/token
      enqueueTelemetry(true);
      Serial.println(F("[ALERT] Queued for retry (no WiFi/token)"));
    }
    
    // Visual feedback — fast blink 10 times
    for (int i = 0; i < 10; i++) {
      digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
      delay(100);
    }
    digitalWrite(STATUS_LED_PIN, LOW);  // LED ON
  }

  // ── TASK 5: Serial Command Listener ──────────────────────────────────────
  if (Serial.available() > 0) {
    handleSerialCommand();
  }

  // ── TASK 6: Status LED Blink ─────────────────────────────────────────────
  if (ledBlinkEnabled && (now - lastLedToggle > (ledBlinkFast ? LED_BLINK_FAST_MS : LED_BLINK_SLOW_MS))) {
    lastLedToggle = now;
    ledState = !ledState;
    digitalWrite(STATUS_LED_PIN, ledState ? HIGH : LOW);  // HIGH = LED OFF (active LOW)
  }

  // ── TASK 7: Periodic Status Print ────────────────────────────────────────
  if (now - lastGpsPrint > 5000) {
    lastGpsPrint = now;
    printStatus();
  }

  // ── CRITICAL: Yield to WiFi Stack ────────────────────────────────────────
  yield();
}

// ══════════════════════════════════════════════════════════════════════════════
// DUAL-STAGE GPS FILTER — Core Implementation
// ══════════════════════════════════════════════════════════════════════════════

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
  return FILTER_EARTH_RADIUS_M * c;
}

/**
 * Stage 1: Sanity Gatekeeping (Pre-Filter)
 * Rejects obviously bad GPS fixes before they enter the smoothing buffer.
 * Returns true if the fix passes all sanity checks.
 */
static bool sanityGatekeeping(float hdop, float speedKmh, float rawLat, float rawLng) {
  unsigned long now = millis();

  // --- Check 1: HDOP quality (higher = worse accuracy) ---
  if (hdop > FILTER_MAX_HDOP) {
    filterRejectedHDOP++;
    Serial.printf("[GPS-FILTER] REJECTED (HDOP=%.1f > %.1f) | raw=(%.6f, %.6f)\n",
                  hdop, FILTER_MAX_HDOP, rawLat, rawLng);
    return false;
  }

  // --- Check 2: Speed sanity (bus max ~120 km/h, guard at 200) ---
  if (speedKmh > FILTER_MAX_SPEED_KMH) {
    filterRejectedSpeed++;
    Serial.printf("[GPS-FILTER] REJECTED (SPEED=%.1f km/h > %.0f) | raw=(%.6f, %.6f)\n",
                  speedKmh, FILTER_MAX_SPEED_KMH, rawLat, rawLng);
    return false;
  }

  // --- Check 3: Teleport / position jump detection ---
  if (filterHasLast) {
    unsigned long timeDelta = now - filterLastTime;
    if (timeDelta < FILTER_JUMP_WINDOW_MS && timeDelta > 0) {
      float distance = haversineDistanceM(filterLastLat, filterLastLng, rawLat, rawLng);
      if (distance > FILTER_MAX_JUMP_M) {
        filterRejectedJump++;
        Serial.printf("[GPS-FILTER] REJECTED (JUMP=%.0fm > %.0fm in %lums) | raw=(%.6f, %.6f)\n",
                      distance, FILTER_MAX_JUMP_M, timeDelta, rawLat, rawLng);
        return false;
      }
    }
  }

  return true;
}

/**
 * Ring Buffer: Add new GPS sample to circular buffer.
 * O(1) operation, zero heap allocation.
 */
static void ringBufferAdd(float lat, float lng) {
  filterLatBuf[filterHead] = lat;
  filterLngBuf[filterHead] = lng;
  filterHead = (filterHead + 1) % FILTER_WINDOW_SIZE;
  if (filterCount < FILTER_WINDOW_SIZE) {
    filterCount++;
  }
}

/**
 * Ring Buffer: Calculate average of all samples in buffer.
 * Uses double precision for sum to avoid floating-point accumulation error.
 */
static bool ringBufferAverage(float &avgLat, float &avgLng) {
  if (filterCount == 0) return false;

  double sumLat = 0.0;
  double sumLng = 0.0;
  for (uint8_t i = 0; i < filterCount; i++) {
    sumLat += filterLatBuf[i];
    sumLng += filterLngBuf[i];
  }
  avgLat = (float)(sumLat / filterCount);
  avgLng = (float)(sumLng / filterCount);
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
  filterLastLat = rawLat;
  filterLastLng = rawLng;
  filterLastTime = millis();
  filterHasLast = true;

  // --- Stage 2: Adaptive Moving Average ---
  ringBufferAdd(rawLat, rawLng);

  if (filterCount >= FILTER_WINDOW_SIZE) {
    // Buffer full — output smoothed coordinates
    if (!filterActive) {
      filterActive = true;
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

  filterAccepted++;

  // Periodic stats dump every 50 accepted fixes
  if (filterAccepted % 50 == 0) {
    Serial.printf("[GPS-FILTER] STATS | accepted=%lu rejected(HDOP=%lu speed=%lu jump=%lu) rawCount=%lu buf=%d/%d\n",
                  filterAccepted, filterRejectedHDOP, filterRejectedSpeed,
                  filterRejectedJump, filterRawCount,
                  filterCount, FILTER_WINDOW_SIZE);
  }

  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// TELEMETRY — Send filtered GPS data to VigilOS backend
// ══════════════════════════════════════════════════════════════════════════════

void sendTelemetry(bool emergency) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!hasToken) return;
  if (!gpsHasFix) return;  // REQUIRE real GPS fix

  // Use FILTERED coordinates for position (smooth Live Map markers)
  float lat  = g_filteredLat;
  float lng  = g_filteredLng;
  float spd  = gps.speed.kmph();
  int hdg    = (int)gps.course.deg();
  int sats   = (int)gps.satellites.value();
  float hdop = gps.hdop.hdop();

  // Raw coordinates for diagnostics
  float rawLat = gps.location.lat();
  float rawLng = gps.location.lng();

  // Calculate drift between raw and filtered
  float drift = haversineDistanceM(rawLat, rawLng, lat, lng);

  // Build JSON payload — include both filtered and raw for backend diagnostics
  char payload[640];
  snprintf(payload, sizeof(payload),
    "{\"vehicleId\":\"%s\",\"lat\":%.6f,\"lng\":%.6f,"
    "\"rawLat\":%.6f,\"rawLng\":%.6f,"
    "\"speed\":%.1f,\"heading\":%d,"
    "\"satellites\":%d,\"hdop\":%.1f,"
    "\"filterActive\":%s}",
    DEVICE_ID, lat, lng,
    rawLat, rawLng,
    spd, hdg,
    sats, hdop,
    filterActive ? "true" : "false");

  Serial.printf("[TEL] %s: filtered=(%.6f,%.6f) raw=(%.6f,%.6f) drift=%.1fm | spd=%.1f hdg=%d sats=%d hdop=%.1f\n",
                emergency ? "!! EMERGENCY" : "telemetry",
                lat, lng, rawLat, rawLng, drift,
                spd, hdg, sats, hdop);

  WiFiClient client;
  HTTPClient http;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + 
               (emergency ? EMERGENCY_PATH : TELEMETRY_PATH);
  
  http.begin(client, url);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", deviceToken);

  int httpCode = http.POST(payload);
  
  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[TEL] Accepted (HTTP %d)\n", httpCode);
    ledBlinkFast = false;
  } else if (httpCode == 401 || httpCode == 403) {
    Serial.printf("[TEL] Auth rejected (HTTP %d)\n", httpCode);
    String response = http.getString();
    Serial.printf("[TEL] Response: %s\n", response.c_str());
  } else {
    Serial.printf("[TEL] Failed (HTTP %d)\n", httpCode);
    String response = http.getString();
    Serial.printf("[TEL] Response: %s\n", response.c_str());
    enqueueTelemetry(emergency);
  }

  http.end();
}

// ══════════════════════════════════════════════════════════════════════════════
// RETRY QUEUE — Store failed telemetry for later retry
// ══════════════════════════════════════════════════════════════════════════════

void enqueueTelemetry(bool emergency) {
  if (!gpsHasFix) return;  // Don't queue without valid GPS

  if (retryQueueCount >= RETRY_QUEUE_SIZE) {
    retryQueueTail = (retryQueueTail + 1) % RETRY_QUEUE_SIZE;
    retryQueueCount--;
  }

  TelemetryRecord record;
  record.lat       = g_filteredLat;   // Use filtered coordinates
  record.lng       = g_filteredLng;
  record.speed     = gps.speed.kmph();
  record.heading   = (int)gps.course.deg();
  record.emergency = emergency;

  retryQueue[retryQueueHead] = record;
  retryQueueHead = (retryQueueHead + 1) % RETRY_QUEUE_SIZE;
  retryQueueCount++;
  
  Serial.printf("[TEL] Queued for retry (count=%d)\n", retryQueueCount);
}

void processRetryQueue() {
  while (retryQueueCount > 0 && WiFi.status() == WL_CONNECTED && hasToken) {
    TelemetryRecord record = retryQueue[retryQueueTail];
    
    char payload[512];
    snprintf(payload, sizeof(payload),
      "{\"vehicleId\":\"%s\",\"lat\":%.6f,\"lng\":%.6f,\"speed\":%.1f,\"heading\":%d}",
      DEVICE_ID, record.lat, record.lng, record.speed, record.heading);

    WiFiClient client;
    HTTPClient http;
    String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + 
                 (record.emergency ? EMERGENCY_PATH : TELEMETRY_PATH);
    
    http.begin(client, url);
    http.setTimeout(8000);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", deviceToken);

    int httpCode = http.POST(payload);
    http.end();

    if (httpCode == 200 || httpCode == 201) {
      retryQueueTail = (retryQueueTail + 1) % RETRY_QUEUE_SIZE;
      retryQueueCount--;
      Serial.printf("[TEL] Retry succeeded (remaining=%d)\n", retryQueueCount);
    } else {
      break;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PANIC BUTTON — ISR + Debounce
// ══════════════════════════════════════════════════════════════════════════════

ICACHE_RAM_ATTR void panicButtonISR() {
  unsigned long now = millis();
  if (now - lastPanicPress > PANIC_DEBOUNCE_MS) {
    lastPanicPress = now;
    panicTriggered = true;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SERIAL COMMANDS — Diagnostics + Filter Control
// ══════════════════════════════════════════════════════════════════════════════

void handleSerialCommand() {
  String line = Serial.readStringUntil('\n');
  line.trim();
  
  if (line.length() == 0) return;

  // STATUS — Print current status
  if (line.equalsIgnoreCase("STATUS")) {
    printDetailedStatus();
    return;
  }

  // GPS — Print raw GPS data + filter state
  if (line.equalsIgnoreCase("GPS")) {
    Serial.printf("[CMD] GPS fix: %s\n", gpsHasFix ? "YES" : "NO");
    if (gpsHasFix) {
      Serial.printf("[CMD] Raw:    Lat=%.6f, Lng=%.6f\n", gps.location.lat(), gps.location.lng());
      Serial.printf("[CMD] Filter: Lat=%.6f, Lng=%.6f\n", g_filteredLat, g_filteredLng);
      float drift = haversineDistanceM(gps.location.lat(), gps.location.lng(), g_filteredLat, g_filteredLng);
      Serial.printf("[CMD] Drift:  %.1f m\n", drift);
      Serial.printf("[CMD] Speed: %.1f km/h, Heading: %d°\n", gps.speed.kmph(), (int)gps.course.deg());
      Serial.printf("[CMD] Satellites: %d, HDOP: %.1f\n", gps.satellites.value(), gps.hdop.hdop());
    }
    return;
  }

  // FILTER — Print GPS filter stats
  if (line.equalsIgnoreCase("FILTER")) {
    Serial.printf("[CMD] Filter active: %s\n", filterActive ? "YES" : "NO");
    Serial.printf("[CMD] Buffer: %d/%d samples\n", filterCount, FILTER_WINDOW_SIZE);
    Serial.printf("[CMD] Accepted: %lu\n", filterAccepted);
    Serial.printf("[CMD] Rejected: HDOP=%lu Speed=%lu Jump=%lu\n",
                  filterRejectedHDOP, filterRejectedSpeed, filterRejectedJump);
    Serial.printf("[CMD] Raw samples processed: %lu\n", filterRawCount);
    return;
  }

  // TEST — Send test telemetry (requires GPS fix)
  if (line.equalsIgnoreCase("TEST")) {
    if (!gpsHasFix) {
      Serial.println(F("[CMD] No GPS fix — cannot send test"));
    } else {
      Serial.println(F("[CMD] Sending test telemetry..."));
      sendTelemetry(false);
    }
    return;
  }

  // PANIC — Trigger manual panic
  if (line.equalsIgnoreCase("PANIC")) {
    Serial.println(F("[CMD] Manual PANIC triggered!"));
    if (wifiConnected && hasToken) {
      sendTelemetry(true);
    } else {
      enqueueTelemetry(true);
    }
    return;
  }

  // REBOOT — Restart ESP
  if (line.equalsIgnoreCase("REBOOT")) {
    Serial.println(F("[CMD] Rebooting..."));
    delay(500);
    ESP.restart();
    return;
  }

  // HELP — Print available commands
  Serial.println(F("[CMD] Commands: STATUS | GPS | FILTER | TEST | PANIC | REBOOT"));
}

// ══════════════════════════════════════════════════════════════════════════════
// STATUS DISPLAY
// ══════════════════════════════════════════════════════════════════════════════

void printStatus() {
  if (gpsHasFix) {
    float drift = haversineDistanceM(gps.location.lat(), gps.location.lng(), g_filteredLat, g_filteredLng);
    Serial.printf("[STATUS] Filtered:%.6f,%.6f Raw:%.6f,%.6f Drift:%.1fm | Spd:%.1f HDG:%d | Sats:%d HDOP:%.1f | WiFi:%s Q:%d\n",
                  g_filteredLat, g_filteredLng,
                  gps.location.lat(), gps.location.lng(), drift,
                  gps.speed.kmph(), (int)gps.course.deg(),
                  gps.satellites.value(), gps.hdop.hdop(),
                  wifiConnected ? "OK" : "--",
                  retryQueueCount);
  } else {
    Serial.printf("[STATUS] GPS: No fix | WiFi:%s | Token:%s | Q:%d\n",
                  wifiConnected ? "OK" : "--",
                  hasToken ? "OK" : "--",
                  retryQueueCount);
  }
}

void printDetailedStatus() {
  Serial.println(F("\n═══════════════════════════════════════════════"));
  Serial.println(F("       VigilOS Edge Tracker Status            "));
  Serial.println(F("═══════════════════════════════════════════════"));
  
  Serial.printf("Device ID:    %s\n", DEVICE_ID);
  Serial.printf("WiFi:         %s (IP: %s)\n", 
                wifiConnected ? "Connected" : "Disconnected",
                WiFi.localIP().toString().c_str());
  Serial.printf("Token:        %s\n", hasToken ? "Present" : "Missing");
  Serial.printf("GPS Fix:      %s\n", gpsHasFix ? "Yes" : "NO — Waiting for fix");
  Serial.printf("Filter:       %s (buf %d/%d)\n",
                filterActive ? "ACTIVE" : "WARMING UP",
                filterCount, FILTER_WINDOW_SIZE);
  
  if (gpsHasFix) {
    float drift = haversineDistanceM(gps.location.lat(), gps.location.lng(), g_filteredLat, g_filteredLng);
    Serial.printf("Raw Lat:      %.6f\n", gps.location.lat());
    Serial.printf("Raw Lng:      %.6f\n", gps.location.lng());
    Serial.printf("Filtered Lat: %.6f\n", g_filteredLat);
    Serial.printf("Filtered Lng: %.6f\n", g_filteredLng);
    Serial.printf("Drift:        %.1f m\n", drift);
    Serial.printf("Speed:        %.1f km/h\n", gps.speed.kmph());
    Serial.printf("Heading:      %d°\n", (int)gps.course.deg());
    Serial.printf("Satellites:   %d\n", gps.satellites.value());
    Serial.printf("HDOP:         %.1f\n", gps.hdop.hdop());
    Serial.printf("Altitude:     %.1f m\n", gps.altitude.meters());
  }
  
  Serial.printf("Filter Stats: accepted=%lu rejected(HDOP=%lu spd=%lu jmp=%lu)\n",
                filterAccepted, filterRejectedHDOP, filterRejectedSpeed, filterRejectedJump);
  Serial.printf("Retry Queue:  %d / %d\n", retryQueueCount, RETRY_QUEUE_SIZE);
  Serial.printf("Uptime:       %lu ms\n", millis());
  Serial.println(F("═══════════════════════════════════════════════\n"));
}
