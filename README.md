# GreenMirror

GreenMirror is a modular greenhouse monitoring and automation system. Sensor
nodes measure soil moisture and temperature, a Raspberry Pi backend processes
and stores the readings, and a web/PWA frontend visualises everything and manages
plant profiles, zones, and watering.

## Quick navigation

[Frontend](mobile-app/README.md) ·
[Raspberry Pi Backend](raspberry-pi/README.md) ·
[ESP Firmware](esp-firmware/README.md) ·
[Production deployment](deployment/raspberry-pi/README.md) ·
[Firestore data model](docs/firestore-schema.md)

## Architecture

```
        ESP32 Sensors
              │
              ▼
     Raspberry Pi Backend
        (Node.js + PM2)
              │
              ▼
      Firebase Firestore
              │
              ▼
       Vercel Frontend
              │
              ▼
            Users
```

- **ESP32 Sensors** POST soil readings to the Raspberry Pi Backend at `POST /api/readings`.
- **Raspberry Pi Backend** (Node.js/Express under PM2) serves live readings over
  HTTP and writes them to Firebase Firestore (`latestReadings`, `readings`,
  `readingsRollups`).
- **Firebase Firestore** is the cloud datastore for real-time state, history, and
  pre-aggregated trends.
- **Vercel Frontend** reads data from Firestore in production; during local/LAN
  development it polls the Raspberry Pi Backend directly on the same host.
- **Users** view live status and manage plant profiles, zones, and watering.

## Repository structure

| Folder | Purpose | Documentation |
|--------|---------|---------------|
| `esp-firmware/` | ESP32/ESP8266 sensor firmware (PlatformIO) | [esp-firmware/README.md](esp-firmware/README.md) |
| `raspberry-pi/` | Backend API and data processing (Node/Express) | [raspberry-pi/README.md](raspberry-pi/README.md) |
| `mobile-app/` | React/Vite frontend and installable PWA | [mobile-app/README.md](mobile-app/README.md) |
| `deployment/` | Production deployment guide and scripts | [deployment/raspberry-pi/README.md](deployment/raspberry-pi/README.md) |
| `docs/` | System design reference | [docs/firestore-schema.md](docs/firestore-schema.md) |

## Quick start (local development)

Run the backend and frontend on the same machine. The frontend auto-detects the
backend on the same hostname (port `5000`), so no IP configuration is required.

**Backend** — simulation mode, no hardware needed (from `raspberry-pi/`):

```powershell
cd raspberry-pi
npm install
$env:USE_SIMULATION="true"
node server.js
```

**Frontend** (from `mobile-app/`):

```powershell
cd mobile-app
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

Open `http://localhost:5174`, or the LAN URL Vite prints to test on a phone on
the same Wi-Fi. See [mobile-app/README.md](mobile-app/README.md) and
[raspberry-pi/README.md](raspberry-pi/README.md) for details.

## Deployment

- **Backend** on a Raspberry Pi with PM2 — [deployment/raspberry-pi/README.md](deployment/raspberry-pi/README.md)
- **Frontend** on Vercel — [mobile-app/README.md](mobile-app/README.md#vercel-deployment)

## Documentation index

- [mobile-app/README.md](mobile-app/README.md) — frontend development and Vercel deployment
- [raspberry-pi/README.md](raspberry-pi/README.md) — backend API and local run
- [esp-firmware/README.md](esp-firmware/README.md) — firmware and Wi-Fi provisioning
- [deployment/raspberry-pi/README.md](deployment/raspberry-pi/README.md) — production deployment
- [docs/firestore-schema.md](docs/firestore-schema.md) — Firestore data model

---

**Last updated:** June 2026

**Current architecture:**
✓ ESP32 WiFiManager provisioning ·
✓ Raspberry Pi Backend ·
✓ PM2 deployment ·
✓ Firebase Firestore ·
✓ Vercel Frontend
