# GreenMirror Backend (Raspberry Pi)

Node/Express backend for GreenMirror. It receives sensor readings from the ESP
nodes, normalises and analyses them, serves them over an HTTP API, and writes
them to Firebase Firestore. In production it runs 24/7 on a Raspberry Pi under
PM2; the same code runs on a laptop for development. Part of the
[GreenMirror project](../README.md).

## Folder overview

| File | Purpose |
|------|---------|
| `server.js` | Entry point — Express app, routes, simulator wiring |
| `snapshot.js` | Normalises raw ESP payloads into the stored reading shape |
| `firestore.js` | Firestore writer + write throttling (quota protection) |
| `rollups.js` | Hourly/daily aggregates written to `readingsRollups` |
| `simulator.js` | Generates simulated sensor data (`USE_SIMULATION=true`) |
| `weather.js` | Cached external weather (Open-Meteo) |
| `.env.example` | Documented environment variables (copy to `.env`) |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | Health check (`GreenMirror Pi API running`) |
| `POST` | `/api/readings` | Ingest an ESP reading (used by the firmware) |
| `GET`  | `/api/latest` | Latest snapshot (polled by the frontend) |
| `GET`  | `/api/history` | In-memory reading history |

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

Firestore credentials can also be supplied as a `firebase-service-account.json`
file in this folder. `.env` and `firebase-service-account.json` are git-ignored —
never commit them. The data model is documented in
[docs/firestore-schema.md](../docs/firestore-schema.md).

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
node server.js
```

```bash
# bash / macOS / Linux
USE_SIMULATION=true node server.js
```

Live mode (ESP32 Sensors posting real data) — omit `USE_SIMULATION` or set it to
`false`, then `node server.js` (or `npm start`). The backend binds to `0.0.0.0`
and prints both its local and LAN URLs at startup; the LAN URL is the address the
ESP firmware should target.

npm scripts:

- `npm start` — `node server.js`
- `npm run check` — syntax-check `server.js`, `firestore.js`, `snapshot.js`

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

## Troubleshooting

| Problem | Check |
|---------|-------|
| ESP32 Sensors get a POST timeout | Backend running (`pm2 status`); ESP32 on the same Wi-Fi; backend URL on the device matches the Pi's IP/port |
| No Firestore updates | `pm2 logs greenmirror-backend` for write errors; Firebase credentials present (`.env` or `firebase-service-account.json`); `FIRESTORE_VERBOSE=true` to confirm writes |
| `/api/latest` returns 404 | No readings received yet — confirm an ESP32 (or the simulator) is posting to `POST /api/readings` |
| Frontend shows stale data | `latestReadings` is being written (backend logs); Firestore reachable; backend reachable on the LAN |

---

**Last updated:** June 2026

**Current architecture:**
✓ ESP32 WiFiManager provisioning ·
✓ Raspberry Pi Backend ·
✓ PM2 deployment ·
✓ Firebase Firestore ·
✓ Vercel Frontend

Part of [GreenMirror](../README.md).
