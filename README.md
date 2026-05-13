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

## Phone Testing

Start the backend in simulation mode, then start the frontend from `mobile-app/` with:

```bash
npm run dev -- --host 0.0.0.0
```

Open the app on a phone using the computer IP and Vite port, for example:

```text
http://192.168.7.202:5173
```

The phone and computer must be on the same Wi-Fi, and the backend must be reachable at:

```text
http://192.168.7.202:5000
```

Set `VITE_API_BASE_URL` in `mobile-app/` to point at a different backend:

```bash
VITE_API_BASE_URL=http://192.168.7.202:5000 npm run dev
```
