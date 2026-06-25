#include <Arduino.h>

// ---------- Board-specific networking includes ----------
#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
#else
  #error "Unsupported board: build with env esp32dev or nodemcuv2"
#endif

#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ---------- WiFi profiles / API URLs ----------
// Portable across test locations: multiple WiFi networks and multiple backend
// URLs. The connection logic tries the last-successful entry first, then scans
// the rest, so moving between sites needs no code changes.
struct WifiProfile {
  const char* ssid;
  const char* password;
};

static const WifiProfile WIFI_PROFILES[] = {
  { "1661", "Henryboys" },
  { "GreenMirror", "GreenMirror2026" },
  { "YOUR_SECOND_WIFI", "PASSWORD" },
};
static const int WIFI_PROFILE_COUNT = sizeof(WIFI_PROFILES) / sizeof(WIFI_PROFILES[0]);

static const char* API_URLS[] = {
  "http://192.168.7.202:5000/api/readings",
  "http://192.168.2.14:5000/api/readings",
  "http://192.168.0.14:5000/api/readings",
  "http://192.168.1.14:5000/api/readings",
};
static const int API_URL_COUNT = sizeof(API_URLS) / sizeof(API_URLS[0]);

// Remember which profile / URL last worked so we try them first next time.
int currentWifiIndex = -1;  // -1 = none connected yet
int currentApiIndex  = 0;   // start by trying the first backend

// ---------- Board identity, pins, zones (compile-time per target) ----------
//
// Both boards send the SAME JSON payload shape. The only differences are the
// board label, node_id, ADC pins, and how many zones each board reports.
#if defined(ESP32)
  const char* BOARD_NAME = "ESP32";
  const char* NODE_ID    = "esp32-node-01";

  #define ZONE_A_SOIL_PIN 34
  #define ZONE_B_SOIL_PIN 35
  #define ONE_WIRE_BUS    4      // GPIO4

  const char* ZONE_A_ID = "SYD-INSIDE-LEFT-01";
  const char* ZONE_B_ID = "SYD-INSIDE-LEFT-02";

  // Which zones physically have a soil sensor wired. Set true once a sensor is
  // connected; an unwired zone reports soil_moisture_status = "not_connected"
  // and a null moisture %.
  const bool ZONE_A_SOIL_CONNECTED = true;   // sensor wired on GPIO34
  const bool ZONE_B_SOIL_CONNECTED = false;  // no sensor on GPIO35 yet

  // ── Soil moisture calibration (12-bit ADC: 0-4095) ──────────────────────
  // Capacitive sensor: drier soil = HIGHER raw value, wetter = LOWER.
  //
  // THESE ARE TEMPORARY ESTIMATED CALIBRATION VALUES based on typical
  // capacitive soil moisture sensor behavior. Real calibration should be done
  // using dry soil, moist soil, and saturated soil before final deployment —
  // read the raw value in each condition (Serial Monitor) and update the
  // *_REFERENCE constants below. Both ESP32 sensors use these defaults until
  // physical calibration is done.
  //
  // Typical raw reference points (educated estimates):
  //   ~3300 = sensor in air / very dry
  //   ~3000 = dry soil            → 0%
  //   ~1700 = good wet soil       → 100%
  //   ~1200 or lower = saturated / overwatered
  const int SOIL_RAW_AIR_DRY        = 3300;
  const int SOIL_RAW_DRY_SOIL       = 3000;
  const int SOIL_RAW_GOOD_WET_SOIL  = 1700;
  const int SOIL_RAW_SATURATED      = 1200;

  // Calibration constants used by the moisture formula (see rawToPercent):
  //   moisture_pct = (DRY_REFERENCE - raw) / (DRY_REFERENCE - WET_REFERENCE_100) * 100
  const int DRY_REFERENCE       = 3000;  // raw at 0%
  const int WET_REFERENCE_100   = 1700;  // raw at 100%
  const int SATURATED_REFERENCE = 1200;  // raw at ~138% (overwatered marker)

  // Both ESP32 soil zones share the same starting calibration for now.
  const int ZONE_A_SOIL_DRY = DRY_REFERENCE;
  const int ZONE_A_SOIL_WET = WET_REFERENCE_100;
  const int ZONE_B_SOIL_DRY = DRY_REFERENCE;
  const int ZONE_B_SOIL_WET = WET_REFERENCE_100;

  // Plausible raw window for a CONNECTED sensor. A floating/disconnected ADC
  // pin tends to sit at the rails (near 0 or near 4095); readings outside this
  // window are treated as "not_connected".
  const int SOIL_RAW_CONNECTED_MIN = 200;
  const int SOIL_RAW_CONNECTED_MAX = 4090;

#elif defined(ESP8266)
  const char* BOARD_NAME = "ESP8266";
  const char* NODE_ID    = "esp8266-node-01";

  // ESP8266 has a single analog input (A0), so only one soil zone.
  #define ZONE_A_SOIL_PIN A0
  #define ONE_WIRE_BUS    D2     // D2 == GPIO4

  const char* ZONE_A_ID = "SYD-INSIDE-LEFT-03";

  const bool ZONE_A_SOIL_CONNECTED = true;   // sensor wired on A0

  // ── Soil moisture calibration (10-bit ADC: 0-1023) ──────────────────────
  // THESE ARE TEMPORARY ESTIMATED CALIBRATION VALUES based on typical
  // capacitive soil moisture sensor behavior. Real calibration should be done
  // using dry soil, moist soil, and saturated soil before final deployment.
  //
  // Typical raw reference points (educated estimates):
  //   ~820 = sensor in air / very dry
  //   ~750 = dry soil            → 0%
  //   ~420 = good wet soil       → 100%
  //   ~300 or lower = saturated / overwatered
  const int SOIL_RAW_AIR_DRY        = 820;
  const int SOIL_RAW_DRY_SOIL       = 750;
  const int SOIL_RAW_GOOD_WET_SOIL  = 420;
  const int SOIL_RAW_SATURATED      = 300;

  // Calibration constants used by the moisture formula (see rawToPercent):
  //   moisture_pct = (DRY_REFERENCE - raw) / (DRY_REFERENCE - WET_REFERENCE_100) * 100
  const int DRY_REFERENCE       = 750;  // raw at 0%
  const int WET_REFERENCE_100   = 420;  // raw at 100%
  const int SATURATED_REFERENCE = 300;  // raw at saturated marker

  const int ZONE_A_SOIL_DRY = DRY_REFERENCE;
  const int ZONE_A_SOIL_WET = WET_REFERENCE_100;

  const int SOIL_RAW_CONNECTED_MIN = 20;
  const int SOIL_RAW_CONNECTED_MAX = 1010;
#endif

// ---------- Common identity ----------
const char* GREENHOUSE_ID = "sydney-greenhouse";

// ---------- Sensor Objects ----------
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature soilTempSensors(&oneWire);

int rawToPercent(int rawValue, int dryReference, int wetReference100) {
  // moisture_pct = (DRY_REFERENCE - raw) / (DRY_REFERENCE - WET_REFERENCE_100) * 100
  // Not capped at 100 — wetter-than-"100%" soil reads above 100 (overwatered).
  // Clamp only: below 0 → 0, above 200 → 200.
  float pct = ((float)(dryReference - rawValue) /
               (float)(dryReference - wetReference100)) * 100.0f;

  if (pct < 0)   pct = 0;
  if (pct > 200) pct = 200;

  return (int)(pct + 0.5f);  // round to nearest integer
}

float readSoilTempByIndex(int index) {
  float tempC = soilTempSensors.getTempCByIndex(index);

  // DallasTemperature returns -127 if sensor is disconnected/not found
  if (tempC == DEVICE_DISCONNECTED_C) {
    return NAN;
  }

  return tempC;
}

void addZoneReading(
  JsonArray zones,
  const char* zoneId,
  int soilPin,
  int dryValue,
  int wetValue,
  bool soilWired,
  int tempSensorIndex
) {
  int soilRaw = analogRead(soilPin);
  float soilTempC = readSoilTempByIndex(tempSensorIndex);

  // Moisture sensor status: "ok" | "not_connected".
  //   • not wired                         → not_connected
  //   • raw sits at the rails (floating)  → not_connected
  const char* soilStatus;
  bool soilConnected;
  if (!soilWired) {
    soilStatus = "not_connected";
    soilConnected = false;
  } else if (soilRaw < SOIL_RAW_CONNECTED_MIN || soilRaw > SOIL_RAW_CONNECTED_MAX) {
    soilStatus = "not_connected";
    soilConnected = false;
  } else {
    soilStatus = "ok";
    soilConnected = true;
  }

  JsonObject zone = zones.add<JsonObject>();
  zone["zone_id"] = zoneId;
  // node_id per-zone: the Pi counts online ESP nodes from zones[].node_id.
  zone["node_id"] = NODE_ID;
  // Always log raw for debugging; pct is null when the sensor isn't connected.
  zone["soil_moisture_raw"] = soilRaw;
  if (soilConnected) {
    zone["soil_moisture_pct"] = rawToPercent(soilRaw, dryValue, wetValue);
  } else {
    zone["soil_moisture_pct"] = nullptr;
  }
  zone["soil_moisture_status"] = soilStatus;

  bool tempOk = !isnan(soilTempC);
  if (tempOk) {
    zone["soil_temp_c"] = soilTempC;
    zone["soil_temp_status"] = "ok";
  } else {
    zone["soil_temp_c"] = nullptr;
    zone["soil_temp_status"] = "not_detected";
  }

  // Per-zone debug line (also useful for calibrating DRY/WET raw values).
  Serial.print("  zone ");
  Serial.print(zoneId);
  Serial.print(" | raw=");
  Serial.print(soilRaw);
  Serial.print(" moisture=");
  if (soilConnected) {
    Serial.print(rawToPercent(soilRaw, dryValue, wetValue));
    Serial.print("%");
  } else {
    Serial.print("--");
  }
  Serial.print(" [");
  Serial.print(soilStatus);
  Serial.print("] | soil_temp=");
  if (tempOk) {
    Serial.print(soilTempC);
    Serial.println("C");
  } else {
    Serial.println("not connected");
  }
}

bool tryWifiProfile(int idx);
void connectWiFi();
void ensureWiFiConnected();
int  postToUrl(const char* url, const String& payload);
bool sendToBackend(const String& payload);

void setup() {
  Serial.begin(115200);
  delay(1000);

#if defined(ESP32)
  analogReadResolution(12); // ESP32 ADC: 0-4095
#endif

  soilTempSensors.begin();

  Serial.println("GreenMirror ESP");
  Serial.print("Board: ");
  Serial.println(BOARD_NAME);
  Serial.print("Node ID: ");
  Serial.println(NODE_ID);
  Serial.print("greenhouse_id: ");
  Serial.println(GREENHOUSE_ID);
  Serial.print("Configured WiFi profiles: ");
  Serial.println(WIFI_PROFILE_COUNT);
  Serial.print("Configured API URLs: ");
  Serial.println(API_URL_COUNT);
  Serial.print("Detected DS18B20 sensors: ");
  Serial.println(soilTempSensors.getDeviceCount());

  connectWiFi();
  Serial.println("Ready.");
}

// Try a single WiFi profile for up to 10 seconds. Returns true on success.
bool tryWifiProfile(int idx) {
  const WifiProfile& p = WIFI_PROFILES[idx];

  Serial.print("Trying WiFi: ");
  Serial.println(p.ssid);

  WiFi.disconnect(true);   // clean slate before each attempt
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(p.ssid, p.password);

  unsigned long startMillis = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMillis < 10000) {
    Serial.print('.');
    delay(500);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Connected to: ");
    Serial.println(p.ssid);
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("...failed");
  WiFi.disconnect(true);   // disconnect cleanly before the next profile
  delay(100);
  return false;
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  // Try the last-successful profile first to avoid scanning the whole list.
  if (currentWifiIndex >= 0 && currentWifiIndex < WIFI_PROFILE_COUNT) {
    if (tryWifiProfile(currentWifiIndex)) {
      return;
    }
  }

  // Otherwise scan every configured profile in order.
  for (int i = 0; i < WIFI_PROFILE_COUNT; i++) {
    if (i == currentWifiIndex) continue;   // already tried above
    if (tryWifiProfile(i)) {
      currentWifiIndex = i;
      return;
    }
  }

  // None connected — keep running sensors. Do NOT reboot, do NOT block forever.
  currentWifiIndex = -1;
  Serial.println("No configured WiFi available.");
}

void ensureWiFiConnected() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
}

// POST a payload to one backend URL. Returns the HTTP status code (>0) or a
// negative HTTPClient error code on failure.
int postToUrl(const char* url, const String& payload) {
  HTTPClient http;
#if defined(ESP8266)
  // ESP8266HTTPClient requires an explicit WiFiClient.
  WiFiClient client;
  http.begin(client, url);
#else
  http.begin(url);
#endif
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  http.end();
  return code;
}

// Send the payload with automatic backend fallback: try the last-successful URL
// first, then every remaining URL. The first HTTP 200 becomes the active API.
// Returns true on success; never crashes or blocks forever.
bool sendToBackend(const String& payload) {
  // 1) Last-successful backend first.
  Serial.print("Trying backend: ");
  Serial.println(API_URLS[currentApiIndex]);
  int code = postToUrl(API_URLS[currentApiIndex], payload);
  if (code == 200) {
    Serial.print("Active API: ");
    Serial.println(API_URLS[currentApiIndex]);
    return true;
  }
  Serial.print("  failed (");
  Serial.print(code);
  Serial.println(")");

  // 2) Fall back through every other configured URL.
  for (int i = 0; i < API_URL_COUNT; i++) {
    if (i == currentApiIndex) continue;   // already tried above
    Serial.print("Trying backend: ");
    Serial.println(API_URLS[i]);
    code = postToUrl(API_URLS[i], payload);
    if (code == 200) {
      currentApiIndex = i;
      Serial.print("Active API: ");
      Serial.println(API_URLS[i]);
      return true;
    }
    Serial.print("  failed (");
    Serial.print(code);
    Serial.println(")");
  }

  Serial.println("No backend reachable.");
  return false;
}

void loop() {
  soilTempSensors.requestTemperatures();

  JsonDocument doc;

  doc["node_id"] = NODE_ID;
  doc["greenhouse_id"] = GREENHOUSE_ID;

  Serial.println("---- reading ----");
  Serial.print("board=");
  Serial.print(BOARD_NAME);
  Serial.print(" | greenhouse_id=");
  Serial.print(GREENHOUSE_ID);
  Serial.print(" | node_id=");
  Serial.println(NODE_ID);

  JsonArray zones = doc["zones"].to<JsonArray>();

  addZoneReading(
    zones,
    ZONE_A_ID,
    ZONE_A_SOIL_PIN,
    ZONE_A_SOIL_DRY,
    ZONE_A_SOIL_WET,
    ZONE_A_SOIL_CONNECTED,
    0
  );

#if defined(ESP32)
  // ESP32 has a second analog zone; ESP8266 has only A0 so it reports one zone.
  addZoneReading(
    zones,
    ZONE_B_ID,
    ZONE_B_SOIL_PIN,
    ZONE_B_SOIL_DRY,
    ZONE_B_SOIL_WET,
    ZONE_B_SOIL_CONNECTED,
    1
  );
#endif

  serializeJson(doc, Serial);
  Serial.println();

  ensureWiFiConnected();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Sending data...");

    String payload;
    serializeJson(doc, payload);

    // Backend fallback handles failures internally; retried next transmission.
    sendToBackend(payload);
  } else {
    Serial.println("POST failed: no WiFi");
  }

  delay(5000);
}
