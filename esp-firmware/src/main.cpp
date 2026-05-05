#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

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

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12); // ESP32 ADC: 0-4095

  soilTempSensors.begin();

  Serial.println("GreenMirror ESP Node starting...");
  Serial.print("Detected DS18B20 sensors: ");
  Serial.println(soilTempSensors.getDeviceCount());

  Serial.println("System ready.");
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

  delay(5000);
}