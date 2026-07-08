# GreenMirror ESP Firmware

One codebase, two build targets — **ESP32** and **ESP8266** — both POST the same
JSON payload to the Raspberry Pi backend at `POST /api/readings`. The board is
selected at build time via the PlatformIO environment; `src/main.cpp` switches
pins, `node_id`, and zone count with `#if defined(ESP32)` / `#if defined(ESP8266)`
guards. Part of the [GreenMirror project](../README.md).

| Board | Env | node_id (default) | Zones (default) | Identity |
|-------|-----|---------|-------|----------|
| ESP32 (esp32dev) | `esp32dev` | `esp32-node-01` | `SYD-INSIDE-LEFT-01`, `SYD-INSIDE-LEFT-02` | **Runtime** (setup portal → Preferences) |
| ESP8266 (NodeMCU v2) | `nodemcuv2` | `esp8266-node-01` | `SYD-INSIDE-LEFT-03` | Compile-time (edit `src/main.cpp`) |

Both default to `greenhouse_id = sydney-greenhouse`.

> **ESP32: one binary, many boards.** The ESP32 no longer hardcodes its identity.
> The **same firmware** is flashed to every ESP32; each board is then configured
> at runtime through the setup portal (see
> [ESP32 device configuration](#esp32-device-configuration-node-id--zones)). The
> values above are only defaults used until a board is configured.

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
Load identity from Preferences (node/greenhouse/zone IDs + backend URL; defaults if unset)
   ↓
BOOT button held?  ──► yes ──► Launch GreenMirror-Setup captive portal
   ↓ no
Load saved Wi-Fi
   ↓   (if it fails)
Try fallback Wi-Fi (GreenMirror24)
   ↓   (if it fails)
Launch GreenMirror-Setup captive portal
   ↓
Store Wi-Fi + identity (Preferences)
   ↓
Begin sensor readings
   ↓
POST to Raspberry Pi Backend  (/api/readings)  using saved identity
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

### ESP32 device configuration (node ID + zones)

Every ESP32 runs the **same binary**. Each board's identity is entered in the
setup portal and stored with the ESP32 **Preferences** API (NVS), so it survives
reboots and re-provisioning. The portal exposes these custom fields (each
pre-filled with the current value — leave a field blank to keep it unchanged):

| Field | Meaning | Default |
|-------|---------|---------|
| **Backend URL** | Where readings are POSTed (`http://host:port/api/readings`) | `http://greenmirror-pi.local:5000/api/readings` |
| **Node ID** | This board's `node_id` — unique per physical board (telemetry / node count) | `esp32-node-01` |
| **Greenhouse ID** | Site this board belongs to (`greenhouse_id`) | `sydney-greenhouse` |
| **Zone A ID** | `zone_id` reported for the GPIO34 soil sensor | `SYD-INSIDE-LEFT-01` |
| **Zone B ID** | `zone_id` reported for the GPIO35 soil sensor | `SYD-INSIDE-LEFT-02` |

> ⚠️ **Every ESP must have UNIQUE zone IDs.** Zone IDs are the join key for the
> whole system — the map bed, the plant assignment, and inside/outside averages
> all key on `zone_id`. If two boards report the same zone ID they collide onto
> one bed and their live values flip-flop. `node_id` does **not** disambiguate
> them — the zone IDs themselves must differ. Use IDs that exist in the frontend
> zone registry (`SYD-INSIDE-LEFT/CENTER/RIGHT-NN`, `SYD-OUTSIDE-NN`); an unknown
> ID still works but shows as its raw string instead of a friendly bed name.

**Example — configuring Node 01** (first two greenhouse beds):

```
Backend URL:   http://10.235.41.88:5000/api/readings
Node ID:       esp32-node-01
Greenhouse ID: sydney-greenhouse
Zone A ID:     SYD-INSIDE-LEFT-01
Zone B ID:     SYD-INSIDE-LEFT-02
```

Node 02 would then use `esp32-node-02` with `SYD-INSIDE-LEFT-03` / `-04`, and so
on — each board a unique node ID and a unique pair of zone IDs.

**Backend URL tip:** if `greenmirror-pi.local` does not resolve on your network
(mDNS is not always reliable), enter the Pi's LAN IP instead, e.g.
`http://10.235.41.88:5000/api/readings`. A static IP / DHCP reservation for the Pi
is recommended. See [deployment/raspberry-pi/README.md](../deployment/raspberry-pi/README.md).

### Expected serial output (ESP32)

```
Loaded saved identity from Preferences.
---------------------------------
GreenMirror ESP
Board: ESP32
Active identity:
  node_id:       esp32-node-01
  greenhouse_id: sydney-greenhouse
  zone_a_id:     SYD-INSIDE-LEFT-01
  zone_b_id:     SYD-INSIDE-LEFT-02
  backend_url:   http://greenmirror-pi.local:5000/api/readings
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
Posting to backend URL: http://greenmirror-pi.local:5000/api/readings
POST status: 200 (OK)
```

On a board that has never been configured, the first line is instead
`No saved identity in Preferences — using default identity values.` If no saved
or fallback network connects, you will also see
`Starting setup portal: GreenMirror-Setup` followed by the AP join hint.

### Reconfigure a board (change identity or Wi-Fi)

**Option A — force the setup portal with the BOOT button (recommended).** You can
reopen the portal even when Wi-Fi is already saved, without erasing anything:

1. Power/reset the board, then **press and hold the `BOOT` button (GPIO0)** during
   the first second of startup — hold it until the serial log prints
   `BOOT button held — forcing setup portal.`
   (Hold it *after* the board starts running, not during the reset itself —
   holding GPIO0 through a reset puts the ESP32 into flash-download mode instead.)
2. Join `GreenMirror-Setup`, open `http://192.168.4.1`, change any field(s), and
   save. Blank fields keep their current value; the rest persist to Preferences.

The force-portal pin is `FORCE_PORTAL_PIN` (GPIO0) in `src/main.cpp`.

**Option B — full erase.** To wipe *everything* (saved Wi-Fi, backend URL, and all
identity) back to defaults, erase the ESP32 flash (NVS) and re-flash:

```bash
cd esp-firmware
pio run -e esp32dev -t erase
pio run -e esp32dev -t upload
```

On the next boot, nothing is saved, so the device uses the default identity, tries
the fallback profile, and then opens the `GreenMirror-Setup` portal.

### Troubleshooting (ESP32)

| Symptom | Fix |
|---------|-----|
| Portal never opens | Saved or fallback Wi-Fi connected. Hold `BOOT` (GPIO0) at startup to force it, or erase flash (above). |
| Need to change node/zone IDs | Force the portal with `BOOT` (Option A above) — no reflash needed. |
| Two beds show the same live values | Duplicate zone IDs — give each board **unique** Zone A/B IDs via the portal. |
| `POST failed` but Wi-Fi connected | Backend URL wrong/unreachable. Re-provision with the Pi's IP. |
| `greenmirror-pi.local` not reaching the Pi | mDNS not resolving — use the Pi's LAN IP in the portal. |
| Can't find the AP | Look for `GreenMirror-Setup` in Wi-Fi networks; it appears only when both saved and fallback Wi-Fi fail (or when forced with `BOOT`). |

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
