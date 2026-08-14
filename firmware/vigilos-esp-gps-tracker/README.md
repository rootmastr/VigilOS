# VigilOS Edge Tracker Firmware (ESP8266 / ESP32)

Secure device-token authentication module for VigilOS GPS trackers
(implements `PRDtoken.md` section 3.2).

## Architecture

```
┌──────────────────────────┐      X-Device-Token header       ┌──────────────────────────┐
│  ESP32 / ESP8266         │ ───────────────────────────────► │  VigilOS API Gateway      │
│  · LittleFS /token.txt   │   POST /api/v1/telemetry/ingest  │  · validateDeviceToken    │
│  · GPS (NEO-6M)          │ ◄─────────────────────────────── │  · 401 / 403 on failure   │
│  · MQTT control channel  │        HTTP 200 OK               │  · audit security events  │
└──────────────────────────┘                                  └──────────────────────────┘
```

## Requirements

- Arduino IDE (or PlatformIO) with **ESP32** / **ESP8266** board support.
- LittleFS file system upload support (Arduino >1.9 default for ESP32).
- Libraries (optional):
  - `PubSubClient` — only if `VIGIL_ENABLE_MQTT` is enabled in `config.h`.
  - `TinyGPS++` — for live GPS parsing (replace the sensor stubs in the sketch).

## Files

| File                        | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `vigilos_esp_gps_tracker.ino` | Main loop: token boot-load, WiFi, telemetry ingest, provisioning |
| `token_store.h`             | Non-volatile token store (LittleFS `/token.txt`, EEPROM fallback) |
| `config.h`                  | Device ID, WiFi, backend endpoint, telemetry cadence            |

## Provisioning Workflow

1. **Backend**: In the Command Center go to **Fleet Admin → Device Tokens**
   and press **Generate Device Token**. Select the target vehicle/device
   (e.g. `BUS-101`). The backend returns a 32-character token bound to that
   device ID.
2. **Firmware**: Edit `config.h` so `VIGIL_DEVICE_ID` matches the bound device
   (e.g. `BUS-101`) and point `VIGIL_SERVER_HOST` / `VIGIL_SERVER_PORT` at the
   VigilOS API Gateway.
3. **Flash** the sketch. On first boot the device prints:
   ```
   [VigilOS] NO TOKEN FOUND. Awaiting provisioning over Serial.
   [VigilOS] Send:  TOKEN:<token-string>
   ```
4. Open the **Serial Monitor** (115200 baud) and send:
   ```
   TOKEN:vgl_live_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c
   ```
   The token is validated (32+ alphanumeric chars), written to
   LittleFS `/token.txt`, and the board reboots into normal operation.
5. The device now boots, loads the token from LittleFS, and pushes telemetry
   every `TELEMETRY_INTERVAL_MS` (default 10 s) with the
   `X-Device-Token: <token>` header.

## Authentication Failure Handling

If the backend returns **401** (missing/expired) or **403** (invalid/revoked /
binding mismatch), the firmware:
1. Logs the rejection reason.
2. Erases the token from LittleFS (`token_store.erase()`).
3. Enters provisioning mode for a replacement token.

## MQTT (optional)

Set `#define VIGIL_ENABLE_MQTT` in `config.h` to enable the MQTT control
channel. The device connects as `clientId = VIGIL_DEVICE_ID` with the device
token as the MQTT password, and subscribes to `fleet/{device_id}/control` —
the broker uses the credential to enforce per-topic ACLs (PRD 3.2).

## Serial Console Commands

| Command                | Action                                           |
| ---------------------- | ------------------------------------------------ |
| `TOKEN:<token-string>` | Validate & persist a device token to LittleFS    |
| `STATUS`               | Print device ID, WiFi state, token presence      |
