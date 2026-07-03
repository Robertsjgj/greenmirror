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
  // Single fallback WiFi profile tried before opening the setup portal (testing).
  const char* FALLBACK_WIFI_SSID = "GreenMirror24";
  const char* FALLBACK_WIFI_PASS = "greenmirror";
  // How long to wait for one WiFi connection attempt (saved or fallback).
  const uint32_t WIFI_CONNECT_TIMEOUT_MS = 10000;
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
    // { "1661", "Henryboys" },
    // Greenhouse
    { "GreenMirror24", "greenmirror" },
    // Phone Hotspot
    // { "NASSUS MEKUNA", "D1D71DFAD1C6" },
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

  // ── Runtime identity DEFAULTS ────────────────────────────────────────────
  // The SAME firmware binary is flashed to every ESP32. Per-board identity
  // (node_id, greenhouse_id, zone_a_id, zone_b_id, backend_url) is provisioned
  // at runtime through the setup portal and stored in Preferences (NVS). These
  // constants are only the fallbacks used when nothing is saved yet.
  const char* DEFAULT_NODE_ID   = "esp32-node-01";
  const char* DEFAULT_ZONE_A_ID = "SYD-INSIDE-LEFT-01";
  const char* DEFAULT_ZONE_B_ID = "SYD-INSIDE-LEFT-02";

  // Hold the BOOT button (GPIO0) at power-up to force the setup portal open even
  // when Wi-Fi is already saved (see README "Reconfigure a board").
  const int FORCE_PORTAL_PIN = 0;

  #define ZONE_A_SOIL_PIN 34
  #define ZONE_B_SOIL_PIN 35
  #define ONE_WIRE_BUS    4      // GPIO4

  // Zone IDs are provisioned at runtime — see DEFAULT_ZONE_A_ID / DEFAULT_ZONE_B_ID
  // above; the active values live in g_zoneAId / g_zoneBId (loaded by loadIdentity).

  // Which zones physically have a soil sensor wired. Set true once a sensor is
  // connected; an unwired zone reports soil_moisture_status = "not_connected"
  // and a null moisture %.
  const bool ZONE_A_SOIL_CONNECTED = true;   // sensor wired on GPIO34
  const bool ZONE_B_SOIL_CONNECTED = true;   // sensor wired on GPIO35

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
// Default greenhouse (fallback). On ESP32 the active greenhouse_id comes from
// Preferences; on ESP8266 it stays this compile-time default.
const char* DEFAULT_GREENHOUSE_ID = "sydney-greenhouse";

// Active runtime identity, resolved at boot by loadIdentity(). On ESP32 these
// load from Preferences (defaults when unset); on ESP8266 they come from the
// compile-time constants. Using globals keeps the SAME binary usable on every
// ESP32 board — each is configured at runtime via the setup portal.
String g_nodeId;
String g_greenhouseId;
String g_zoneAId;
#if defined(ESP32)
String g_zoneBId;   // ESP32 has a second soil zone; ESP8266 does not.
#endif

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
  zone["node_id"] = g_nodeId;
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
void loadIdentity();
void printIdentity();
#if defined(ESP8266)
bool tryWifiProfile(int idx);
void connectWiFi();
#endif

// Print the active runtime identity — the exact values used in the payload.
void printIdentity() {
  Serial.print("  node_id:       "); Serial.println(g_nodeId);
  Serial.print("  greenhouse_id: "); Serial.println(g_greenhouseId);
  Serial.print("  zone_a_id:     "); Serial.println(g_zoneAId);
#if defined(ESP32)
  Serial.print("  zone_b_id:     "); Serial.println(g_zoneBId);
#endif
  Serial.print("  backend_url:   "); Serial.println(g_backendUrl);
}

// Resolve per-board identity into the g_* globals.
#if defined(ESP32)
// ESP32: load from Preferences (NVS), falling back to the DEFAULT_* constants.
void loadIdentity() {
  prefs.begin("greenmirror", false);   // NVS namespace; opened once for the run
  const bool haveSaved = prefs.isKey("node_id");

  g_nodeId       = prefs.getString("node_id",       DEFAULT_NODE_ID);
  g_greenhouseId = prefs.getString("greenhouse_id", DEFAULT_GREENHOUSE_ID);
  g_zoneAId      = prefs.getString("zone_a_id",     DEFAULT_ZONE_A_ID);
  g_zoneBId      = prefs.getString("zone_b_id",     DEFAULT_ZONE_B_ID);
  g_backendUrl   = prefs.getString("backend_url",   DEFAULT_BACKEND_URL);

  if (haveSaved) Serial.println("Loaded saved identity from Preferences.");
  else           Serial.println("No saved identity in Preferences — using default identity values.");
}
#elif defined(ESP8266)
// ESP8266: no Preferences/portal on this target — keep compile-time identity.
void loadIdentity() {
  g_nodeId       = NODE_ID;
  g_greenhouseId = DEFAULT_GREENHOUSE_ID;
  g_zoneAId      = ZONE_A_ID;
  g_backendUrl   = API_URL;
  Serial.println("Using compile-time identity (ESP8266 target).");
}
#endif

void setup() {
  Serial.begin(115200);
  delay(1000);

#if defined(ESP32)
  analogReadResolution(12); // ESP32 ADC: 0-4095
#endif

  soilTempSensors.begin();

  loadIdentity();   // resolve node_id / greenhouse_id / zone ids / backend_url

  Serial.println("---------------------------------");
  Serial.println("GreenMirror ESP");
  Serial.print("Board: ");
  Serial.println(BOARD_NAME);
  Serial.println("Active identity:");
  printIdentity();
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
  if (MDNS.begin(g_nodeId.c_str())) {
    started = true;
    Serial.print("mDNS responder started: ");
    Serial.print(g_nodeId);
    Serial.println(".local");
  }
}

#if defined(ESP32)
// Wait up to timeoutMs for the current WiFi.begin() attempt to connect.
static bool waitForWifi(uint32_t timeoutMs) {
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

// Persist one identity field entered in the portal.
//   key     — Preferences (NVS) key
//   entered — raw value from the portal field (may be empty)
//   target  — the g_* global to update (its current value is the fallback)
//   def     — default used only if both entered and current are empty
// A blank field means "keep the current value", so users can change just one
// field without clearing the rest.
static void saveIdentityField(const char* key, const char* entered, String& target, const char* def) {
  String value = entered ? String(entered) : String("");
  value.trim();
  if (value.length() == 0) value = target.length() ? target : String(def);
  if (value != target) {
    prefs.putString(key, value);
    target = value;
  }
}

// Open the WiFiManager captive portal so the user can enter WiFi + full device
// identity (backend URL, node/greenhouse/zone IDs). Returns true if WiFi
// connected through the portal. All identity fields are persisted to Preferences
// here and mirrored into the g_* globals.
static bool runSetupPortal(const String& savedUrl) {
  (void)savedUrl;  // current values come from the g_* globals below
  Serial.print("Starting setup portal: ");
  Serial.println(SETUP_AP_NAME);
  Serial.println("Setup portal started — configure WiFi and device identity.");

  WiFiManager wm;
  wm.setConfigPortalTimeout(180);  // give up the portal after 3 min so sensors keep running

  // Extra captive-portal fields, each pre-filled with the current value so the
  // user can keep or change it. Blank = keep current (see saveIdentityField).
  WiFiManagerParameter backendParam("backend",       "Backend URL (http://host:port/api/readings)", g_backendUrl.c_str(),  128);
  WiFiManagerParameter nodeParam(   "node_id",       "Node ID (e.g. esp32-node-01)",                g_nodeId.c_str(),       64);
  WiFiManagerParameter ghParam(     "greenhouse_id", "Greenhouse ID (e.g. sydney-greenhouse)",      g_greenhouseId.c_str(), 64);
  WiFiManagerParameter zoneAParam(  "zone_a_id",     "Zone A ID (e.g. SYD-INSIDE-LEFT-01)",         g_zoneAId.c_str(),      64);
  WiFiManagerParameter zoneBParam(  "zone_b_id",     "Zone B ID (e.g. SYD-INSIDE-LEFT-02)",         g_zoneBId.c_str(),      64);
  wm.addParameter(&backendParam);
  wm.addParameter(&nodeParam);
  wm.addParameter(&ghParam);
  wm.addParameter(&zoneAParam);
  wm.addParameter(&zoneBParam);

  wm.setAPCallback([](WiFiManager* mgr) {
    (void)mgr;
    Serial.print("  Join WiFi \"");
    Serial.print(SETUP_AP_NAME);
    Serial.print("\", then open http://");
    Serial.println(WiFi.softAPIP());
  });

  bool connected = wm.startConfigPortal(SETUP_AP_NAME);

  // Persist every identity field the user may have entered.
  saveIdentityField("backend_url",   backendParam.getValue(), g_backendUrl,   DEFAULT_BACKEND_URL);
  saveIdentityField("node_id",       nodeParam.getValue(),    g_nodeId,       DEFAULT_NODE_ID);
  saveIdentityField("greenhouse_id", ghParam.getValue(),      g_greenhouseId, DEFAULT_GREENHOUSE_ID);
  saveIdentityField("zone_a_id",     zoneAParam.getValue(),   g_zoneAId,      DEFAULT_ZONE_A_ID);
  saveIdentityField("zone_b_id",     zoneBParam.getValue(),   g_zoneBId,      DEFAULT_ZONE_B_ID);

  Serial.println("Identity values saved to Preferences:");
  printIdentity();
  return connected;
}

// ESP32 connection flow (Wi-Fi behavior unchanged):
//   0. If the BOOT button is held at power-up, open the setup portal first
//      (lets you reconfigure identity/WiFi even when WiFi is already saved).
//   1. Try saved WiFi credentials (stored by WiFiManager in NVS).
//   2. If they fail, try the single fallback profile (GreenMirror24).
//   3. If the fallback fails too, open the GreenMirror-Setup captive portal.
// Identity (backend URL, node/greenhouse/zone IDs) is already loaded from
// Preferences by loadIdentity() in setup(); the portal updates it if used.
void setupNetworking() {
  String savedUrl = g_backendUrl;  // identity already loaded in setup()

  // Force-portal check: hold BOOT (GPIO0) at power-up to reconfigure on demand.
  pinMode(FORCE_PORTAL_PIN, INPUT_PULLUP);
  delay(50);
  const bool forcePortal = digitalRead(FORCE_PORTAL_PIN) == LOW;
  if (forcePortal) Serial.println("BOOT button held — forcing setup portal.");

  WiFi.mode(WIFI_STA);

  bool connected = false;

  // 0. Forced portal (button held) — reconfigure identity/WiFi.
  if (forcePortal) {
    connected = runSetupPortal(savedUrl);
  }

  // 1. Saved credentials.
  if (!connected) {
    Serial.println("Trying saved WiFi credentials...");
    WiFi.begin();  // reconnect using credentials stored in flash
    connected = waitForWifi(WIFI_CONNECT_TIMEOUT_MS);
  }

  // 2. Fallback profile.
  if (!connected) {
    Serial.println("Saved WiFi failed.");
    Serial.print("Trying fallback WiFi: ");
    Serial.println(FALLBACK_WIFI_SSID);
    WiFi.begin(FALLBACK_WIFI_SSID, FALLBACK_WIFI_PASS);
    if (waitForWifi(WIFI_CONNECT_TIMEOUT_MS)) {
      connected = true;
      Serial.print("Connected to fallback WiFi: ");
      Serial.println(FALLBACK_WIFI_SSID);
    }
  }

  // 3. Captive portal (skip if the button already forced it above).
  if (!connected && !forcePortal) {
    connected = runSetupPortal(savedUrl);
  }

  if (connected) {
    WiFi.setAutoReconnect(true);
    Serial.print("WiFi connected: ");
    Serial.println(WiFi.SSID());
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    startMdnsOnce();
  } else {
    Serial.println("WiFi not connected (portal timed out). Sensors keep running.");
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

  doc["node_id"] = g_nodeId;
  doc["greenhouse_id"] = g_greenhouseId;

  Serial.println("---- reading ----");
  Serial.print("board=");
  Serial.print(BOARD_NAME);
  Serial.print(" | greenhouse_id=");
  Serial.print(g_greenhouseId);
  Serial.print(" | node_id=");
  Serial.println(g_nodeId);

  JsonArray zones = doc["zones"].to<JsonArray>();

  addZoneReading(
    zones,
    g_zoneAId.c_str(),
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
    g_zoneBId.c_str(),
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
    Serial.print("Posting to backend URL: ");
    Serial.println(g_backendUrl);

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
