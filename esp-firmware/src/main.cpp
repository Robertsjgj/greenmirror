#include <Arduino.h>

// ---------- Board-specific networking includes ----------
#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <ESPmDNS.h>
  #include <WiFiManager.h>   // tzapu/WiFiManager — runtime WiFi provisioning (captive portal)
  #include <Preferences.h>   // persistent storage for the backend URL (NVS)
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <ESP8266mDNS.h>
#else
  #error "Unsupported board: build with env esp32dev or nodemcuv2"
#endif

#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ---------- WiFi provisioning / backend URL ----------
// ESP32 provisions WiFi at runtime with WiFiManager (a captive portal), so no
// SSID/password is hardcoded. The backend URL is an extra portal field stored
// persistently with Preferences. ESP8266 keeps the simple hardcoded profile
// scan (this target has no WiFiManager/Preferences setup here).

// Per-request HTTP timeout so a dead backend address fails quickly.
const uint32_t HTTP_TIMEOUT_MS = 2000;

// Active backend URL used by loop(); set during networking setup.
String g_backendUrl;

#if defined(ESP32)
  // Captive-portal SSID shown when WiFi is unconfigured or the saved network fails.
  const char* SETUP_AP_NAME = "GreenMirror-Setup";
  // Default backend URL — pre-filled in the portal and used until the user changes it.
  const char* DEFAULT_BACKEND_URL = "http://greenmirror-pi.local:5000/api/readings";
  // Persistent (NVS) store for the backend URL.
  Preferences prefs;
#elif defined(ESP8266)
  // How long to wait for a single WiFi profile to connect.
  const uint32_t WIFI_CONNECT_TIMEOUT_MS = 5000;

  struct WifiProfile {
    const char* ssid;
    const char* password;
  };

  static const WifiProfile WIFI_PROFILES[] = {
    // Home
    { "1661", "Henryboys" },
    // Greenhouse
    { "GreenMirror24", "greenmirror" },
    // Phone Hotspot
    { "NASSUS MEKUNA", "D1D71DFAD1C6" },
  };
  static const int WIFI_PROFILE_COUNT = sizeof(WIFI_PROFILES) / sizeof(WIFI_PROFILES[0]);

  // Single hardcoded backend URL for the ESP8266 target.
  static const char* API_URL = "http://10.194.224.61:5000/api/readings";

  // Remember which WiFi profile last worked so we try it first next time.
  int currentWifiIndex = -1;  // -1 = none connected yet
#endif

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

void setupNetworking();
void ensureWiFiConnected();
void startMdnsOnce();
int  postToUrl(const char* url, const String& payload);
#if defined(ESP8266)
bool tryWifiProfile(int idx);
void connectWiFi();
#endif

void setup() {
  Serial.begin(115200);
  delay(1000);

#if defined(ESP32)
  analogReadResolution(12); // ESP32 ADC: 0-4095
#endif

  soilTempSensors.begin();

  Serial.println("---------------------------------");
  Serial.println("GreenMirror ESP");
  Serial.print("Board: ");
  Serial.println(BOARD_NAME);
  Serial.print("Node: ");
  Serial.println(NODE_ID);
  Serial.print("greenhouse_id: ");
  Serial.println(GREENHOUSE_ID);
  Serial.print("Detected DS18B20 sensors: ");
  Serial.println(soilTempSensors.getDeviceCount());
  Serial.println("---------------------------------");

  setupNetworking();
  Serial.println("Ready.");
}

// Start the mDNS responder once after WiFi is up (lets the node be reached by
// name on supporting networks).
void startMdnsOnce() {
  static bool started = false;
  if (started) return;
  if (MDNS.begin(NODE_ID)) {
    started = true;
    Serial.print("mDNS responder started: ");
    Serial.print(NODE_ID);
    Serial.println(".local");
  }
}

#if defined(ESP32)
// ESP32: provision WiFi with WiFiManager and load/save the backend URL.
//
// On boot WiFiManager tries the saved WiFi credentials. If they are missing or
// the connection fails, it starts a captive portal named GreenMirror-Setup
// where the user enters WiFi SSID, WiFi password, and the backend URL. The
// backend URL is stored in Preferences so it survives reboots.
void setupNetworking() {
  prefs.begin("greenmirror", false);
  String savedUrl = prefs.getString("backend_url", DEFAULT_BACKEND_URL);

  WiFiManager wm;
  wm.setConfigPortalTimeout(180);  // give up the portal after 3 min so sensors keep running

  // Extra captive-portal field for the backend URL, pre-filled with the saved
  // (or default) value so the user can keep or change it.
  WiFiManagerParameter backendParam(
    "backend", "Backend URL (http://host:port/api/readings)", savedUrl.c_str(), 128);
  wm.addParameter(&backendParam);

  // Log when the setup portal opens.
  wm.setAPCallback([](WiFiManager* mgr) {
    (void)mgr;
    Serial.print("Setup portal started: ");
    Serial.println(SETUP_AP_NAME);
    Serial.print("  Join WiFi \"");
    Serial.print(SETUP_AP_NAME);
    Serial.print("\", then open http://");
    Serial.println(WiFi.softAPIP());
  });

  Serial.println("Trying saved WiFi credentials...");
  bool connected = wm.autoConnect(SETUP_AP_NAME);

  // Persist the backend URL the user may have entered in the portal.
  String enteredUrl = backendParam.getValue();
  enteredUrl.trim();
  if (enteredUrl.length() == 0) enteredUrl = DEFAULT_BACKEND_URL;
  if (enteredUrl != savedUrl) {
    prefs.putString("backend_url", enteredUrl);
    Serial.println("Backend URL updated and saved to Preferences.");
  }
  g_backendUrl = enteredUrl;

  if (connected) {
    WiFi.setAutoReconnect(true);
    Serial.print("Saved WiFi connected: ");
    Serial.println(WiFi.SSID());
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    startMdnsOnce();
  } else {
    Serial.println("WiFi not connected (no credentials or portal timed out).");
  }

  Serial.print("Backend URL in use: ");
  Serial.println(g_backendUrl);
}

void ensureWiFiConnected() {
  // The WiFi stack auto-reconnects; nudge it if it has dropped.
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
  }
}

#elif defined(ESP8266)
// ESP8266: simple hardcoded WiFi profile scan (unchanged behavior).

// Try a single WiFi profile for up to WIFI_CONNECT_TIMEOUT_MS. Returns true on success.
bool tryWifiProfile(int idx) {
  const WifiProfile& p = WIFI_PROFILES[idx];

  Serial.print("Trying WiFi: ");
  Serial.println(p.ssid);

  WiFi.disconnect(true);   // clean slate before each attempt
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(p.ssid, p.password);

  unsigned long startMillis = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMillis < WIFI_CONNECT_TIMEOUT_MS) {
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
      startMdnsOnce();
      return;
    }
  }

  // Otherwise scan every configured profile in order.
  for (int i = 0; i < WIFI_PROFILE_COUNT; i++) {
    if (i == currentWifiIndex) continue;   // already tried above
    if (tryWifiProfile(i)) {
      currentWifiIndex = i;
      startMdnsOnce();
      return;
    }
  }

  // None connected — keep running sensors. Do NOT reboot, do NOT block forever.
  currentWifiIndex = -1;
  Serial.print("No configured WiFi available. Attempted: ");
  for (int i = 0; i < WIFI_PROFILE_COUNT; i++) {
    Serial.print(WIFI_PROFILES[i].ssid);
    if (i < WIFI_PROFILE_COUNT - 1) Serial.print(", ");
  }
  Serial.println();
}

void setupNetworking() {
  g_backendUrl = API_URL;
  connectWiFi();
  Serial.print("Backend URL in use: ");
  Serial.println(g_backendUrl);
}

void ensureWiFiConnected() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
}
#endif

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
  http.setConnectTimeout(HTTP_TIMEOUT_MS);  // fail fast on dead addresses (ESP32)
#endif
  http.setTimeout(HTTP_TIMEOUT_MS);         // per-request timeout
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  http.end();
  return code;
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

    int code = postToUrl(g_backendUrl.c_str(), payload);
    if (code == 200) {
      Serial.println("POST status: 200 (OK)");
    } else if (code > 0) {
      Serial.print("POST failed: HTTP ");
      Serial.println(code);
    } else {
      Serial.print("POST failed: ");
      Serial.println(HTTPClient::errorToString(code));
    }
  } else {
    Serial.println("POST failed: no WiFi");
  }

  delay(5000);
}
