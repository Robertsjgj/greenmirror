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

// ---------- WiFi / API ----------
const char* WIFI_SSID = "1661";
const char* WIFI_PASSWORD = "Henryboys";
const char* API_URL = "http://192.168.7.202:5000/api/readings";

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

  // 12-bit ADC: 0-4095. Update after real calibration.
  const int ZONE_A_SOIL_DRY = 3000;
  const int ZONE_A_SOIL_WET = 1500;
  const int ZONE_B_SOIL_DRY = 3000;
  const int ZONE_B_SOIL_WET = 1500;

#elif defined(ESP8266)
  const char* BOARD_NAME = "ESP8266";
  const char* NODE_ID    = "esp8266-node-01";

  // ESP8266 has a single analog input (A0), so only one soil zone.
  #define ZONE_A_SOIL_PIN A0
  #define ONE_WIRE_BUS    D2     // D2 == GPIO4

  const char* ZONE_A_ID = "SYD-INSIDE-LEFT-03";

  // 10-bit ADC: 0-1023. Update after real calibration.
  const int ZONE_A_SOIL_DRY = 750;
  const int ZONE_A_SOIL_WET = 350;
#endif

// ---------- Common identity ----------
const char* GREENHOUSE_ID = "sydney-greenhouse";

// ---------- Sensor Objects ----------
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature soilTempSensors(&oneWire);

int rawToPercent(int rawValue, int dryValue, int wetValue) {
  int pct = map(rawValue, dryValue, wetValue, 0, 100);

  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;

  return pct;
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
  int tempSensorIndex
) {
  int soilRaw = analogRead(soilPin);
  int soilPct = rawToPercent(soilRaw, dryValue, wetValue);
  float soilTempC = readSoilTempByIndex(tempSensorIndex);

  JsonObject zone = zones.add<JsonObject>();
  zone["zone_id"] = zoneId;
  // node_id per-zone: the Pi counts online ESP nodes from zones[].node_id.
  zone["node_id"] = NODE_ID;
  zone["soil_moisture_raw"] = soilRaw;
  zone["soil_moisture_pct"] = soilPct;

  bool tempOk = !isnan(soilTempC);
  if (tempOk) {
    zone["soil_temp_c"] = soilTempC;
    zone["soil_temp_status"] = "ok";
  } else {
    zone["soil_temp_c"] = nullptr;
    zone["soil_temp_status"] = "not_detected";
  }

  // Per-zone debug line.
  Serial.print("  zone ");
  Serial.print(zoneId);
  Serial.print(" | raw=");
  Serial.print(soilRaw);
  Serial.print(" moisture=");
  Serial.print(soilPct);
  Serial.print("% | soil_temp=");
  if (tempOk) {
    Serial.print(soilTempC);
    Serial.println("C");
  } else {
    Serial.println("not_detected");
  }
}

void connectWiFi();
void ensureWiFiConnected();

void setup() {
  Serial.begin(115200);
  delay(1000);

#if defined(ESP32)
  analogReadResolution(12); // ESP32 ADC: 0-4095
#endif

  soilTempSensors.begin();

  Serial.println("GreenMirror ESP Node starting...");
  Serial.print("Board: ");
  Serial.println(BOARD_NAME);
  Serial.print("node_id: ");
  Serial.println(NODE_ID);
  Serial.print("greenhouse_id: ");
  Serial.println(GREENHOUSE_ID);
  Serial.print("API_URL: ");
  Serial.println(API_URL);
  Serial.print("Detected DS18B20 sensors: ");
  Serial.println(soilTempSensors.getDeviceCount());

  connectWiFi();
  Serial.println("System ready.");
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println("Connecting to WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  WiFi.setAutoReconnect(true);

  unsigned long startMillis = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMillis < 10000) {
    Serial.print('.');
    delay(500);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connect failed");
  }
}

void ensureWiFiConnected() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
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
    1
  );
#endif

  serializeJson(doc, Serial);
  Serial.println();

  ensureWiFiConnected();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Sending data...");

    HTTPClient http;
#if defined(ESP8266)
    // ESP8266HTTPClient requires an explicit WiFiClient.
    WiFiClient client;
    http.begin(client, API_URL);
#else
    http.begin(API_URL);
#endif
    http.addHeader("Content-Type", "application/json");

    String payload;
    serializeJson(doc, payload);

    int responseCode = http.POST(payload);
    if (responseCode > 0) {
      Serial.print("POST status: ");
      Serial.print(responseCode);
      Serial.println(responseCode == 200 ? " (OK)" : "");
    } else {
      Serial.print("POST failed: ");
      Serial.println(http.errorToString(responseCode));
    }
    http.end();
  } else {
    Serial.println("POST failed: no WiFi");
  }

  delay(5000);
}
