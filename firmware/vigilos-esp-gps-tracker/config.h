/**
 * VigilOS Edge Tracker — Configuration
 * Adjust these values to match your deployment.
 */

#pragma once

// ---------------------------------------------------------------------------
// Device identity — MUST match the vehicle/device registered in VigilOS backend
// ---------------------------------------------------------------------------
#define VIGIL_DEVICE_ID           "BUS-101"
#if defined(ARDUINO_ARCH_ESP32)
  #define VIGIL_BOARD_NAME        "ESP32 DevKit"
#else
  #define VIGIL_BOARD_NAME        "Wemos D1 Mini"
#endif
#define VIGIL_FW_VERSION          "1.1.0"

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------
#define VIGIL_WIFI_SSID           "VigilOS-4G-Router"
#define VIGIL_WIFI_PASSWORD       "change-me"

// ---------------------------------------------------------------------------
// VigilOS Backend API Gateway (see vigil-server/src/server.js)
// ---------------------------------------------------------------------------
#define VIGIL_SERVER_HOST         "your.vigilos.backend"   // or LAN IP e.g. "192.168.1.50"
#define VIGIL_SERVER_PORT         4000
#define VIGIL_INGEST_PATH         "/api/v1/telemetry/ingest"

// ---------------------------------------------------------------------------
// Telemetry cadence (PRD: default 10s, backend may scale to 1s on anomalies)
// ---------------------------------------------------------------------------
#define TELEMETRY_INTERVAL_MS     10000UL

// ---------------------------------------------------------------------------
// GPS wiring
// ESP32:  TX2(17) -> GPS RX,  RX2(16) -> GPS TX (HardwareSerial2)
// ESP8266: D2(GPIO4) -> GPS TX, D1(GPIO5) -> GPS RX (SoftwareSerial)
// ---------------------------------------------------------------------------
#define GPS_RX_PIN                16
#define GPS_TX_PIN                17

// Fallback coordinates (Semarang BRT corridor) used until a GPS fix is parsed
#define VIGIL_FALLBACK_LAT        -6.9666
#define VIGIL_FALLBACK_LNG        110.4196

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------
#define PROVISION_TIMEOUT_MS      120000UL    // 2 minutes to accept TOKEN: over serial

// ---------------------------------------------------------------------------
// MQTT (optional — uncomment VIGIL_ENABLE_MQTT to enable token-auth MQTT control)
// ---------------------------------------------------------------------------
// #define VIGIL_ENABLE_MQTT
#define VIGIL_MQTT_HOST           "mqtt.vigilos.local"
#define VIGIL_MQTT_PORT           8883
