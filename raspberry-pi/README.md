# GreenMirror Backend (Raspberry Pi)

Node/Express backend for GreenMirror. It receives sensor readings from the ESP
nodes, normalises and analyses them, serves them over an HTTP API, and writes
them to Firebase Firestore. In production it runs 24/7 on a Raspberry Pi under
PM2; the same code runs on a laptop for development. Part of the
[GreenMirror project](../README.md).

## Folder overview

| File | Purpose |
|------|---------|
| `index.js` | **Entry point** — app bootstrap; starts the backend, then provisioning |
| `server.js` | Express API — routes, ESP ingest, simulator wiring; exports `{ app, start }` |
| `snapshot.js` | Normalises raw ESP payloads into the stored reading shape |
| `firestore.js` | Firestore writer + write throttling (quota protection) |
| `rollups.js` | Hourly/daily aggregates written to `readingsRollups` |
| `simulator.js` | Generates simulated sensor data (`USE_SIMULATION=true`) |
| `weather.js` | Cached external weather (Open-Meteo) |
| `services/` | Reusable services — `wifi-manager.js` (nmcli), `system-status.js` (health), `environment/` (DHT11 sensing) |
| `provisioning/` | Wi-Fi provisioning lifecycle + setup page, started by the bootstrap |
| `.env.example` | Documented environment variables (copy to `.env`) |

Everything runs in **one process** (`index.js`, the single PM2 app). `index.js`
starts the API (`server.js`) and then provisioning; `provisioning/` uses the
`services/wifi-manager.js` abstraction rather than calling nmcli itself. This
keeps the Pi deployable anywhere without reflashing — see
[Wi-Fi provisioning](#wi-fi-provisioning).

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | Health check (`GreenMirror Pi API running`) |
| `POST` | `/api/readings` | Ingest an ESP reading (used by the firmware) |
| `GET`  | `/api/latest` | Latest snapshot (polled by the frontend) |
| `GET`  | `/api/history` | In-memory reading history |

## Multi-node aggregation

The greenhouse runs many ESP nodes (e.g. 15 boards × 2 zones). Each node POSTs
**independently** to `POST /api/readings` with only its own 1–2 zones. If the
backend simply wrote each POST to `latestReadings`, the dashboard would show only
the last node to post. Instead the backend **merges** them ([aggregator.js](aggregator.js)):

- It keeps an in-memory map of the latest zones per `node_id` (scoped by
  `greenhouse_id`) with a `lastSeen` timestamp.
- On every POST it updates that node, drops any node not seen within
  `NODE_STALE_TIMEOUT_MS` (default 60s), then rebuilds a **combined snapshot with
  the zones from all still-active nodes**.
- `latestReadings/{greenhouse_id}` therefore contains every active bed, and
  `system.esp_nodes_online` counts the distinct active `node_id`s.
- A stale node's beds simply stop appearing (rather than freezing on old values)
  once it misses posts for longer than the timeout.

**Zone IDs must be unique per node.** Zone placement, plant assignment, and
averages all key on `zone_id`. If two active nodes report the same `zone_id`, the
backend logs a clear warning (`[aggregator] ⚠️ duplicate zone_id …`) — configure
each ESP with unique zone IDs (see [esp-firmware/README.md](../esp-firmware/README.md#esp32-device-configuration-node-id--zones)).

The POST payload format is unchanged, so no firmware change is required. Each POST
logs the received `node_id`, active node count, combined zone count, and any stale
nodes removed. **Simulation mode is unaffected** — the simulator already emits one
combined multi-node reading, so it bypasses the aggregator.

## Environment variables

Copy `.env.example` to `.env` and adjust as needed. All Firebase variables are
**optional** — without them the backend runs in-memory only and skips Firestore
writes.

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `5000`) |
| `USE_SIMULATION` | `true` to run the built-in sensor simulator |
| `GREENHOUSE_ID` | Greenhouse identifier (default `sydney-greenhouse`) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Inline Firebase credentials |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a service-account JSON (alternative to inline) |
| `FIRESTORE_LIVE_WRITE_INTERVAL_MS` / `FIRESTORE_HISTORY_WRITE_INTERVAL_MS` | Write-throttle intervals |
| `FIRESTORE_VERBOSE` | Log every successful Firestore write |
| `ENVIRONMENT_ENABLED` / `ENVIRONMENT_SENSOR_TYPE` / `ENVIRONMENT_DHT_GPIO` / `ENVIRONMENT_REFRESH_SECONDS` / `ENVIRONMENT_STALE_SECONDS` | Greenhouse DHT11 air temp/humidity — see [Greenhouse environment sensor](#greenhouse-environment-sensor-dht11) |

Firestore credentials can also be supplied as a `firebase-service-account.json`
file in this folder. `.env` and `firebase-service-account.json` are git-ignored —
never commit them. The data model is documented in
[docs/firestore-schema.md](../docs/firestore-schema.md).

## Greenhouse environment sensor (DHT11)

ESP nodes report soil only; the greenhouse **air temperature and humidity** come
from a **DHT11 wired to the Raspberry Pi**. When enabled, the backend reads it in
the background and injects the values into every live snapshot as
`environment.air_temp_c` / `environment.humidity_pct` (plus the top-level
`env_temp_c` / `env_humidity_pct` mirrors). The existing **frontend Environment
view works automatically** — no frontend changes. There is **no light sensor**, so
`light_lux` and `brightness_pct` stay `null` ("Light: Not available").

Off by default: with `ENVIRONMENT_ENABLED` unset, live environment stays
"unavailable" exactly as before.

### Wiring

| DHT11 pin | Raspberry Pi |
|-----------|--------------|
| VCC | 3.3V |
| DATA | **GPIO4 (BCM 4 = physical pin 7)** |
| GND | Ground |

A 10kΩ pull-up between VCC and DATA is recommended (many DHT11 breakout boards
have it on-board).

### How it reads (Linux IIO — no native modules, no Python)

The DHT one-wire protocol is microsecond-timed, which the JS event loop can't meet
reliably. So the **Linux kernel** does the timed decode via its `dht11` IIO driver
(enabled with a device-tree overlay), and Node simply reads the resulting sysfs
files with `fs.readFile` — **no npm native addon, no build toolchain, no Python**.
The service [`services/environment/index.js`](services/environment/index.js) owns
polling, caching, staleness, status, and logging.

#### 1. Enable the kernel overlay (one-time, on the Pi)

Edit `/boot/firmware/config.txt` and add:

```
dtoverlay=dht11,gpiopin=4
```

Then reboot:

```bash
sudo reboot
```

#### 2. Verify the sensor appears as an IIO device

```bash
for d in /sys/bus/iio/devices/iio:device*; do echo "$d -> $(cat $d/name)"; done
#   expect a line ending in "-> dht11"
```

Then test a raw read (values are in milli-units; DHT11 is rate-limited to ~1 read
every 2s and may return an I/O error occasionally — that's normal, just retry):

```bash
cat /sys/bus/iio/devices/iio:device0/in_temp_input             # e.g. 21000  = 21.0 °C
cat /sys/bus/iio/devices/iio:device0/in_humidityrelative_input # e.g. 55000  = 55.0 %RH
```

(Use the actual `iio:deviceX` number from step 1. Node finds it automatically by
the device **name** `dht11`, so the number doesn't need to be configured.)

#### 3. Configure and restart

In `.env` (see `.env.example`):

```ini
ENVIRONMENT_ENABLED=true
ENVIRONMENT_SENSOR_TYPE=dht11
ENVIRONMENT_REFRESH_SECONDS=30       # background read cadence
ENVIRONMENT_STALE_SECONDS=120        # after this long with no good read, values go null
ENVIRONMENT_DHT_GPIO=4               # DOCUMENTATION ONLY — the pin is set by the overlay above
```

> `ENVIRONMENT_DHT_GPIO` is **documentation only**. The GPIO pin is configured by
> the device-tree overlay (`gpiopin=4`), not by Node — Node locates the sensor by
> its IIO device name and never touches the pin.

Then restart the backend (`pm2 restart greenmirror-backend`). Watch the logs:

```
[environment] starting — dht11 via IIO sysfs · refresh 30s · stale 120s
[environment] read OK — 21.4°C · 55%
```

The service reads in the **background only** — every ESP POST reads from the cache
(`getEnvironmentCached()`), so ingest is never blocked or slowed. Reads are
retried on the kernel's occasional checksum error (EIO); the last good value is
served until `ENVIRONMENT_STALE_SECONDS`, after which the values go `null` (status
`stale`). The cached object carries a `status` of `ok` / `stale` / `error` /
`disabled`; `getEnvironmentStatus()` exposes
`{ enabled, sensor, status, lastRead, lastSuccess, lastError, refreshSeconds }`
for diagnostics / the future management dashboard.

### Troubleshooting

| Symptom | Check |
|---------|-------|
| Air temp/humidity stay "Unavailable" | `ENVIRONMENT_ENABLED=true`? Backend restarted? `pm2 logs greenmirror-backend` for `[environment]` lines |
| `read failed: no IIO device named "dht11"` | Overlay not applied — add `dtoverlay=dht11,gpiopin=4` to `/boot/firmware/config.txt` and reboot; confirm with the `for d in ...` command above |
| Intermittent `read failed` then recovers | Normal for DHT11 (transient checksum/EIO) — the service retries and the cache holds the last good value |
| Values look frozen | A stuck sensor; readings older than `ENVIRONMENT_STALE_SECONDS` report `null` with status `stale` |
| Permission error reading sysfs | Ensure the backend user can read `/sys/bus/iio/devices/...` (add a udev rule, or run PM2 as a user with access) |
| Wrong wiring | `gpiopin=4` in the overlay = **BCM GPIO4 = physical pin 7** |

### Swapping sensors later

The service is sensor-agnostic behind `getEnvironmentCached()`. A DHT22 uses the
**same** `dht11` IIO driver. An I²C sensor (e.g. BME280) exposes the **same** IIO
sysfs channels (`in_temp_input`, `in_humidityrelative_input`) under a different
device name — point the service at that name; `server.js`, `snapshot.js`,
Firestore, and the frontend need no changes.

## Install

```bash
cd raspberry-pi
npm install
```

## Run locally

Simulation mode (no hardware needed):

```powershell
# Windows PowerShell
$env:USE_SIMULATION="true"
node index.js
```

```bash
# bash / macOS / Linux
USE_SIMULATION=true node index.js
```

Live mode (ESP32 Sensors posting real data) — omit `USE_SIMULATION` or set it to
`false`, then `node index.js` (or `npm start`). The backend binds to `0.0.0.0`
and prints both its local and LAN URLs at startup; the LAN URL is the address the
ESP firmware should target. `index.js` is the app bootstrap — it starts the API
and then provisioning (which self-disables off-Pi, so dev is unaffected).

npm scripts:

- `npm start` — `node index.js` (bootstrap: backend + provisioning)
- `npm run check` — syntax-check the backend, `services/`, and `provisioning/` files

## Daily Development Workflow

Develop on a laptop, deploy to the Raspberry Pi Backend over Git. Work happens on
the `dev` branch.

### Laptop

1. **Make changes** — edit the backend code.
2. **Test locally** — run in simulation or live mode (above) so problems are
   caught before they reach the Raspberry Pi.
3. **`git add .`** — stage the changes.
4. **`git commit`** — record them with a clear message.
5. **`git push origin dev`** — publish so the Raspberry Pi can pull them.

### Raspberry Pi

1. **`ssh` into the Pi** — you deploy from the device itself.
2. **`cd ~/greenmirror`** — the repo root, where Git and the deploy scripts live.
3. **`git pull origin dev`** — fetch the changes you just pushed.
4. **`cd raspberry-pi`** — the backend package directory.
5. **`npm install`** — *only if `package.json` changed*; reinstalling otherwise
   wastes time on the Pi's limited hardware.
6. **`pm2 restart greenmirror-backend`** — load the new code into the running
   process.

> The [`update.sh`](../deployment/raspberry-pi/README.md) script automates steps
> 2–6 (pull → conditional install → syntax check → PM2 reload) and is the
> recommended way to deploy.

## PM2

[PM2](https://pm2.keymetrics.io/) is the process manager that keeps the Raspberry
Pi Backend running unattended in production. It is used because the backend must
stay available 24/7 with no operator present.

- **Automatic restart after crashes** — if the backend throws and exits, PM2
  restarts it immediately, so a transient fault doesn't take the system offline.
- **Automatic start after reboot** — once `pm2 startup` + `pm2 save` are
  configured, PM2 relaunches the backend after a power cut or Pi reboot.
- **Centralised logs** — PM2 captures stdout/stderr so you can inspect what the
  backend is doing without attaching a terminal to the process.

Common commands and why you use them:

| Command | Purpose |
|---------|---------|
| `pm2 start deployment/raspberry-pi/ecosystem.config.cjs` | First-time start (app name `greenmirror-backend`) |
| `pm2 status` | Check the backend is online, plus uptime and restart count |
| `pm2 logs greenmirror-backend` | Watch live logs to confirm readings/Firestore writes or diagnose errors |
| `pm2 restart greenmirror-backend` | Load new code after a `git pull` |
| `pm2 save` | Persist the process list so it survives reboots |

Full setup, secrets, boot persistence, and the Git deployment workflow are in the
**[Raspberry Pi deployment guide](../deployment/raspberry-pi/README.md)**.

## Wi-Fi provisioning

The Pi provisions its own Wi-Fi at runtime — like the ESP32's WiFiManager, but
built for Linux with **NetworkManager**. This makes the Pi deployable on any
network **without reflashing the SD card or editing config files**.

**It is part of this backend — not a separate service.** The app bootstrap
(`index.js`) starts the API and then provisioning, so GreenMirror stays a
**single PM2-managed process** (`greenmirror-backend`). The API keeps running on
port `5000` the entire time; provisioning only manages networking and the setup
page, and all nmcli work goes through the reusable `services/wifi-manager.js`.

On startup, inside the backend process:

1. It waits for NetworkManager to auto-connect a saved network.
   - **Usable network** (Wi-Fi *or* Ethernet) → nothing happens; the normal
     backend keeps serving the API and writing to Firestore.
   - **No usable network** → it opens an open access point named
     **`GreenMirror-Setup`** and serves a setup page at **`http://192.168.4.1`**.
2. On the page (fields: **Wi-Fi SSID**, **Wi-Fi Password**; button **Save &
   Connect**) the user submits credentials. The module saves them permanently via
   `nmcli`, drops the AP, and joins the network. The backend was never stopped —
   it simply now has a network.
3. If the configured Wi-Fi later disappears for good, the module automatically
   re-opens the `GreenMirror-Setup` AP so a new network can be configured.

Saved credentials survive reboots and can be changed any number of times — no
reflashing is ever required again. The module self-disables on non-Linux hosts
and where NetworkManager is absent (so laptop/simulation dev is unaffected).

The pieces (started by the bootstrap, controlled by the provisioning controller):

| File | Purpose |
|------|---------|
| `services/wifi-manager.js` | **WiFiManager** — the only nmcli caller: `scanNetworks / connect / disconnect / status / listSavedNetworks / forgetNetwork` + AP helpers. Reusable by the future dashboard |
| `services/system-status.js` | `getSystemHealth()` — composes overall health (Wi-Fi now; Firebase/ESP/backend/etc. stubs) |
| `provisioning/index.js` | Controller — `startProvisioning()`, boot check, monitor loop, setup mode |
| `provisioning/portal.js` | Setup web server (own express listener; route registry for the future dashboard) |
| `provisioning/public/setup.html` | The **GreenMirror Manager** setup page (v1) |
| `provisioning/config.js` | Provisioning tunables (enable switch, portal port, timings) via env vars |

The setup page is **version 1 of the GreenMirror Manager** — `portal.js`
registers routes in one place and serves `GET /api/status` (backed by
`system-status.js`), and the UI is a panel layout, so Wi-Fi/Firebase/ESP/backend
status, restart, logs, and change-Wi-Fi can be added without changing the
lifecycle code. Because the WiFiManager already exposes `scanNetworks`,
`listSavedNetworks`, and `forgetNetwork`, a "change Wi-Fi" panel is mostly a UI
addition.

There is **no separate process to install** — provisioning starts with the
backend. The Pi only needs the privileges to manage NetworkManager and bind port
`80`; see the
[deployment guide](../deployment/raspberry-pi/README.md#wi-fi-provisioning-networkmanager).

## Troubleshooting

| Problem | Check |
|---------|-------|
| ESP32 Sensors get a POST timeout | Backend running (`pm2 status`); ESP32 on the same Wi-Fi; backend URL on the device matches the Pi's IP/port |
| No Firestore updates | `pm2 logs greenmirror-backend` for write errors; Firebase credentials present (`.env` or `firebase-service-account.json`); `FIRESTORE_VERBOSE=true` to confirm writes |
| `/api/latest` returns 404 | No readings received yet — confirm an ESP32 (or the simulator) is posting to `POST /api/readings` |
| Frontend shows stale data | `latestReadings` is being written (backend logs); Firestore reachable; backend reachable on the LAN |
| `GreenMirror-Setup` AP never appears | `pm2 logs greenmirror-backend` for `[provision]` lines; confirm NetworkManager is active, the Pi has a wifi interface, and `nmcli`/port-80 privileges are granted |
| Setup page saved Wi-Fi but the Pi didn't join | Wrong SSID/password — the AP re-opens automatically after ~1 min; check `pm2 logs greenmirror-backend` |

---

**Last updated:** June 2026

**Current architecture:**
✓ ESP32 WiFiManager provisioning ·
✓ Raspberry Pi Backend ·
✓ PM2 deployment ·
✓ Firebase Firestore ·
✓ Vercel Frontend

Part of [GreenMirror](../README.md).
