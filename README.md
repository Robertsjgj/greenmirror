# GreenMirror

GreenMirror is a modular greenhouse monitoring and automation system.

## Architecture

- ESP32 nodes: collect soil data (moisture, temperature)
- Raspberry Pi: local hub (data processing, plant logic, API)
- Mobile app: React/Vite dashboard for monitoring, plant profiles, and zone assignments

## Structure

- `esp-firmware/` -> ESP32 code
- `raspberry-pi/` -> backend and data processing
- `mobile-app/` -> responsive web app and installable PWA
- `docs/` -> system design and notes

## How local networking works

The frontend automatically detects the correct backend URL at runtime using `window.location.hostname`. No IP addresses need to be configured or hardcoded.

| Frontend URL | API auto-detected as |
|---|---|
| `http://localhost:5174` | `http://localhost:5000` |
| `http://192.168.1.42:5174` | `http://192.168.1.42:5000` |
| `http://10.9.1.96:5174` | `http://10.9.1.96:5000` |

The backend binds to `0.0.0.0` and prints both the local and LAN URLs at startup.

## Quick start

**Backend** (from `raspberry-pi/`):
```powershell
cd raspberry-pi
$env:USE_SIMULATION="true"
node server.js
```

**Frontend** (from `mobile-app/`):
```powershell
cd mobile-app
npm run dev -- --host 0.0.0.0 --port 5174
```

That's it. Open `http://localhost:5174` in a browser, or use the LAN IP printed by Vite to open the app on a phone.

## Phone testing

1. Start the backend — it prints the LAN IP at startup (e.g. `http://10.9.1.96:5000`).
2. Start the frontend with `--host 0.0.0.0` so Vite is reachable on the network.
3. Open the LAN URL on your phone (e.g. `http://10.9.1.96:5174`).
4. The app automatically targets the backend at the same IP on port 5000.

Phone and computer must be on the same Wi-Fi. No env vars or config edits required.

## Manual override

If the backend runs on a different machine than the frontend, set `VITE_API_BASE_URL` before building or running dev:

```powershell
$env:VITE_API_BASE_URL="http://192.168.1.10:5000"
npm run dev -- --host 0.0.0.0 --port 5174
```
