# GreenMirror ESP Firmware

One codebase, two build targets — **ESP32** and **ESP8266** — both POST the same
JSON payload to the Raspberry Pi backend at `/api/readings`. The board is selected
at build time via the PlatformIO environment; `src/main.cpp` switches pins, node_id
and zone count with `#if defined(ESP32)` / `#if defined(ESP8266)` guards.

| Board | Env | node_id | Zones |
|-------|-----|---------|-------|
| ESP32 (esp32dev) | `esp32dev` | `esp32-node-01` | `SYD-GH-LEFT-01`, `SYD-GH-LEFT-02` |
| ESP8266 (NodeMCU v2) | `nodemcuv2` | `esp8266-node-01` | `SYD-GH-LEFT-03` |

Both use `greenhouse_id = sydney-greenhouse`.

## Wiring

### ESP32
- Soil A AOUT → GPIO34
- Soil B AOUT → GPIO35
- DS18B20 data → GPIO4

### ESP8266 (NodeMCU v2)
- Soil A AOUT → A0
- DS18B20 data → D2 (GPIO4)

### Both
- Sensor VCC → 3.3V
- Sensor GND → GND
- DS18B20: 4.7k pull-up resistor between data and 3.3V  (required)

> A single soil sensor + single DS18B20 is enough for a first test. On the ESP32
> the unused zone B will report `0%` / `not_detected`.

## Configure (change only if your network differs)

In `src/main.cpp`:
- `WIFI_SSID` / `WIFI_PASSWORD`
- `API_URL` — must point at the Pi's LAN IP, e.g. `http://192.168.7.202:5000/api/readings`

## Build & upload

### ESP32
```
cd esp-firmware
pio run -e esp32dev -t upload
pio device monitor
```

### ESP8266
```
cd esp-firmware
pio run -e nodemcuv2 -t upload
pio device monitor
```

Compile without flashing by dropping `-t upload`.

## Start the Pi backend (live mode — NOT simulation)

```
cd raspberry-pi
npm install        # first time only
node server.js
```
Note the printed `Network: http://<pi-ip>:5000` — that IP must match `API_URL`.
(Firestore is optional; the server runs in-memory and prints "Firestore disabled"
if no credentials are present.)

## What the Serial Monitor should show

```
GreenMirror ESP Node starting...
Board: ESP32
node_id: esp32-node-01
greenhouse_id: sydney-greenhouse
API_URL: http://192.168.7.202:5000/api/readings
Detected DS18B20 sensors: 1
Connecting to WiFi...
....
WiFi connected
IP address: 192.168.7.xxx
System ready.
---- reading ----
board=ESP32 | greenhouse_id=sydney-greenhouse | node_id=esp32-node-01
  zone SYD-GH-LEFT-01 | raw=2100 moisture=60% | soil_temp=19.50C
  zone SYD-GH-LEFT-02 | raw=4095 moisture=0% | soil_temp=not_detected
Sending data...
POST status: 200 (OK)
```
(The ESP8266 prints `Board: ESP8266`, `node_id: esp8266-node-01`, and a single
`SYD-GH-LEFT-03` zone.)

## Verify the round-trip

On the Pi console:
```
📡 Received data from ESP: { ... }
[server] latestReadings write: sydney-greenhouse · 1 zones
```
Then query the latest snapshot from any LAN machine:
```
http://<pi-ip>:5000/api/latest
```
Success = the same values appear in all three places (ESP Serial → Pi log →
`/api/latest`), with `system.esp_nodes_online: 1` and zones classified `inside`.
