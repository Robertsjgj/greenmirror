# GreenMirror ESP Firmware

One codebase, two build targets — **ESP32** and **ESP8266** — both POST the same
JSON payload to the Raspberry Pi backend at `POST /api/readings`. The board is
selected at build time via the PlatformIO environment; `src/main.cpp` switches
pins, `node_id`, and zone count with `#if defined(ESP32)` / `#if defined(ESP8266)`
guards. Part of the [GreenMirror project](../README.md).

| Board | Env | node_id | Zones |
|-------|-----|---------|-------|
| ESP32 (esp32dev) | `esp32dev` | `esp32-node-01` | `SYD-INSIDE-LEFT-01`, `SYD-INSIDE-LEFT-02` |
| ESP8266 (NodeMCU v2) | `nodemcuv2` | `esp8266-node-01` | `SYD-INSIDE-LEFT-03` |

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
- DS18B20: 4.7k pull-up resistor between data and 3.3V (required)

> A single soil sensor + single DS18B20 is enough for a first test. On the ESP32
> the unused zone B reports `not_connected` / null moisture.

## Build & upload

Uses [PlatformIO](https://platformio.org/). Library dependencies (ArduinoJson,
OneWire, DallasTemperature, and — for ESP32 — `tzapu/WiFiManager`) are declared in
`platformio.ini` and fetched automatically.

### ESP32
```bash
cd esp-firmware
pio run -e esp32dev -t upload
pio device monitor
```

### ESP8266
```bash
cd esp-firmware
pio run -e nodemcuv2 -t upload
pio device monitor
```

Compile without flashing by dropping `-t upload`.

---

## Firmware Boot Flow (ESP32)

```
Power On
   ↓
Load saved Wi-Fi
   ↓   (if it fails)
Try fallback Wi-Fi (GreenMirror24)
   ↓   (if it fails)
Launch GreenMirror-Setup captive portal
   ↓
Store Wi-Fi + backend URL (Preferences)
   ↓
Begin sensor readings
   ↓
POST to Raspberry Pi Backend  (/api/readings)
```

The provisioning steps are detailed below; sensor and POST behaviour is the same
regardless of how Wi-Fi was obtained.

---

## ESP32 — Wi-Fi provisioning (WiFiManager)

The ESP32 provisions Wi-Fi at runtime — **no SSID or password is hardcoded**. On
boot it connects in this order:

1. **Saved credentials** — the network stored in flash from a previous setup.
2. **Fallback Wi-Fi** — a single built-in test profile (`GreenMirror24`). If it
   connects, the setup portal does **not** open.
3. **Captive portal** — if both fail, the device starts an access point named
   **`GreenMirror-Setup`**. Join it from a phone/laptop and a captive portal opens
   where you enter:
   - Wi-Fi SSID
   - Wi-Fi password
   - **Backend URL**

The portal times out after 3 minutes; if nobody configures it, the device keeps
reading sensors and retries Wi-Fi.

### Backend URL configuration & persistence

The backend URL is a custom field in the captive portal, stored persistently with
the ESP32 **Preferences** API (NVS), so it survives reboots and re-provisioning.

- **Default:** `http://greenmirror-pi.local:5000/api/readings`
- It is pre-filled in the portal; change it there, never in source code.

**Recommendation:** if `greenmirror-pi.local` does not resolve on your network
(mDNS is not always reliable), enter the Pi's LAN IP instead, e.g.
`http://10.235.41.88:5000/api/readings`. A static IP / DHCP reservation for the Pi
is recommended. See [deployment/raspberry-pi/README.md](../deployment/raspberry-pi/README.md).

### Expected serial output (ESP32)

```
---------------------------------
GreenMirror ESP
Board: ESP32
Node: esp32-node-01
greenhouse_id: sydney-greenhouse
Detected DS18B20 sensors: 1
---------------------------------
Trying saved WiFi credentials...
Saved WiFi failed.
Trying fallback WiFi: GreenMirror24
Connected to fallback WiFi: GreenMirror24
WiFi connected: GreenMirror24
IP: 10.235.41.xx
Backend URL in use: http://greenmirror-pi.local:5000/api/readings
Ready.
---- reading ----
board=ESP32 | greenhouse_id=sydney-greenhouse | node_id=esp32-node-01
  zone SYD-INSIDE-LEFT-01 | raw=2100 moisture=60% [ok] | soil_temp=19.50C
  zone SYD-INSIDE-LEFT-02 | raw=4095 moisture=-- [not_connected] | soil_temp=not connected
Sending data...
POST status: 200 (OK)
```

If no saved or fallback network connects, you will instead see
`Starting setup portal: GreenMirror-Setup` followed by the AP join hint.

### Reset Wi-Fi / backend URL

There is no UI button to reset. To clear the saved Wi-Fi credentials and the
stored backend URL, erase the ESP32 flash (NVS) and re-flash:

```bash
cd esp-firmware
pio run -e esp32dev -t erase
pio run -e esp32dev -t upload
```

On the next boot, saved credentials are gone, so the device tries the fallback
profile and then opens the `GreenMirror-Setup` portal.

### Troubleshooting (ESP32)

| Symptom | Fix |
|---------|-----|
| Portal never opens | Saved or fallback Wi-Fi connected. Erase flash (above) to force the portal. |
| `POST failed` but Wi-Fi connected | Backend URL wrong/unreachable. Re-provision with the Pi's IP. |
| `greenmirror-pi.local` not reaching the Pi | mDNS not resolving — use the Pi's LAN IP in the portal. |
| Can't find the AP | Look for `GreenMirror-Setup` in Wi-Fi networks; it appears only when both saved and fallback Wi-Fi fail. |

> Note: because the ESP32 persists Wi-Fi credentials, if saved Wi-Fi fails and the
> fallback `GreenMirror24` connects, the fallback becomes the new saved network on
> the next boot.

---

## ESP8266 — hardcoded configuration

The ESP8266 target does **not** use WiFiManager/Preferences. It scans a small
hardcoded Wi-Fi profile list and posts to a hardcoded `API_URL`. To change them,
edit the `#if defined(ESP8266)` block in `src/main.cpp`:

- `WIFI_PROFILES[]` — the Wi-Fi network(s) to try
- `API_URL` — the Pi backend, e.g. `http://<pi-ip>:5000/api/readings`

Then rebuild and upload with `pio run -e nodemcuv2 -t upload`.

---

## Typical deployment workflow

1. **Modify** the firmware in `src/main.cpp`.
2. **Build** — `pio run -e esp32dev` (compile-check before flashing).
3. **Upload** — `pio run -e esp32dev -t upload`.
4. **Open the Serial Monitor** — `pio device monitor`.
5. **Verify Wi-Fi** — confirm `WiFi connected: <ssid>` and an IP address
   (provision via the captive portal if needed).
6. **Verify POST 200** — confirm `POST status: 200 (OK)` each cycle.
7. **Verify the Raspberry Pi Backend receives data** — see the round-trip check
   below.

## Verify the round-trip

Start the Raspberry Pi Backend in live mode first — see
[raspberry-pi/README.md](../raspberry-pi/README.md). In the backend logs you
should see:

```
📡 Received data from ESP: { ... }
[server] latestReadings write: sydney-greenhouse · 1 zones
```

Then query the latest snapshot from any LAN machine:

```
http://<pi-ip>:5000/api/latest
```

Success = the same values appear in the ESP serial output, the Raspberry Pi
Backend logs, and `/api/latest`, with `system.esp_nodes_online: 1`.

---

**Last updated:** June 2026

**Current architecture:**
✓ ESP32 WiFiManager provisioning ·
✓ Raspberry Pi Backend ·
✓ PM2 deployment ·
✓ Firebase Firestore ·
✓ Vercel Frontend

Part of [GreenMirror](../README.md).
