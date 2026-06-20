# GreenMirror ESP32 Firmware

ESP32 sensor node: reads 2 capacitive soil-moisture sensors + DS18B20 soil-temperature
probes, then HTTP POSTs them to the Raspberry Pi backend at `/api/readings`.

## First real hardware test

### 1. Wiring

Soil moisture sensor A:
- VCC  → ESP32 3.3V
- GND  → ESP32 GND
- AOUT → GPIO34

Soil moisture sensor B (optional for first test):
- VCC  → ESP32 3.3V
- GND  → ESP32 GND
- AOUT → GPIO35

DS18B20 soil temperature probe:
- VCC  → 3.3V
- GND  → GND
- DATA → GPIO4
- 4.7k resistor between GPIO4 and 3.3V   (pull-up — required)

A single soil sensor + single DS18B20 is enough for the first test; the second
zone will simply report `0%` / `not_detected`.

### 2. Configure (already set, change only if your network differs)

In `src/main.cpp`:
- `WIFI_SSID` / `WIFI_PASSWORD`
- `API_URL` — must point at the Pi's LAN IP, e.g. `http://192.168.7.202:5000/api/readings`

### 3. Build & upload

```
cd esp-firmware
pio run            # compile only
pio run -t upload  # compile + flash
pio device monitor # open Serial Monitor at 115200 baud
```

### 4. Start the Pi backend (live mode — NOT simulation)

```
cd raspberry-pi
npm install        # first time only
node server.js
```
Note the printed `Network: http://<pi-ip>:5000` — that IP must match `API_URL`.
(Firestore is optional; the server runs in-memory and prints "Firestore disabled"
if no credentials are present.)

### 5. What the Serial Monitor should show

```
GreenMirror ESP Node starting...
Detected DS18B20 sensors: 1
Connecting to WiFi...
....
WiFi connected
IP address: 192.168.7.xxx
System ready.
---- reading ----
greenhouse_id=sydney-greenhouse | node_id=esp32-node-01
  zone SYD-GH-LEFT-01 | raw=2100 moisture=60% | soil_temp=19.50C
  zone SYD-GH-LEFT-02 | raw=4095 moisture=0% | soil_temp=not_detected
Sending data...
POST status: 200 (OK)
```

### 6. Verify the round-trip

On the Pi console you should see:
```
📡 Received data from ESP: { ... }
[server] latestReadings write: sydney-greenhouse · 2 zones
```

Then query the latest snapshot from any machine on the LAN:
```
http://<pi-ip>:5000/api/latest
```
Success = the same soil-moisture / temperature values appear in all three places
(ESP Serial → Pi log → `/api/latest`), with `system.esp_nodes_online: 1` and the
zones classified as `inside`.
