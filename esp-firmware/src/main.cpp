#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ---------- WiFi / API ----------
const char* WIFI_SSID = "1661";
const char* WIFI_PASSWORD = "Henryboys";
const char* API_URL = "http://192.168.7.202:5000/api/readings";

// ---------- Pin Definitions ----------
#define ZONE_A_SOIL_PIN 34
#define ZONE_B_SOIL_PIN 35
#define ONE_WIRE_BUS 4

// ---------- Sensor Objects ----------
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature soilTempSensors(&oneWire);

// ---------- Identity ----------
const char* NODE_ID = "esp32-node-01";
const char* GREENHOUSE_ID = "greenhouse_1";

// ---------- Zone IDs ----------
const char* ZONE_A_ID = "zone_a";
const char* ZONE_B_ID = "zone_b";

// ---------- Soil Calibration ----------
// Update these after real calibration.
const int ZONE_A_SOIL_DRY = 3000;
const int ZONE_A_SOIL_WET = 1500;

const int ZONE_B_SOIL_DRY = 3000;
const int ZONE_B_SOIL_WET = 1500;

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
  zone["soil_moisture_raw"] = soilRaw;
  zone["soil_moisture_pct"] = soilPct;

  if (isnan(soilTempC)) {
    zone["soil_temp_c"] = nullptr;
    zone["soil_temp_status"] = "not_detected";
  } else {
    zone["soil_temp_c"] = soilTempC;
    zone["soil_temp_status"] = "ok";
  }
}

void connectWiFi();
void ensureWiFiConnected();

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12); // ESP32 ADC: 0-4095

  soilTempSensors.begin();

  Serial.println("GreenMirror ESP Node starting...");
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

  JsonArray zones = doc["zones"].to<JsonArray>();

  addZoneReading(
    zones,
    ZONE_A_ID,
    ZONE_A_SOIL_PIN,
    ZONE_A_SOIL_DRY,
    ZONE_A_SOIL_WET,
    0
  );

  addZoneReading(
    zones,
    ZONE_B_ID,
    ZONE_B_SOIL_PIN,
    ZONE_B_SOIL_DRY,
    ZONE_B_SOIL_WET,
    1
  );

  serializeJson(doc, Serial);
  Serial.println();

  ensureWiFiConnected();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Sending data...");

    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");

    String payload;
    serializeJson(doc, payload);

    int responseCode = http.POST(payload);
    if (responseCode > 0) {
      Serial.println("Send success");
      Serial.print("HTTP status: ");
      Serial.println(responseCode);
    } else {
      Serial.println("Send failed");
      Serial.print("HTTP error: ");
      Serial.println(http.errorToString(responseCode));
    }
    http.end();
  } else {
    Serial.println("Send failed: no WiFi");
  }

  delay(5000);
}