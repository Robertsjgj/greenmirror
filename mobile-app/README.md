# GreenMirror Mobile App

React/Vite frontend for the GreenMirror greenhouse dashboard. The app is mobile-first, responsive on desktop, and includes a basic PWA manifest/service worker so it can be installed from supported mobile browsers.

## Local Development

```bash
npm install
npm run dev
```

By default the frontend reads the backend from:

```text
http://192.168.7.202:5000
```

Override it with `VITE_API_BASE_URL`:

```bash
VITE_API_BASE_URL=http://192.168.7.202:5000 npm run dev
```

On Windows PowerShell:

```powershell
$env:VITE_API_BASE_URL="http://192.168.7.202:5000"; npm.cmd run dev
```

## Phone Testing On Local Wi-Fi

1. Start the Raspberry Pi backend in simulation mode so it serves live-looking zone data on port `5000`.
2. Start the frontend on all network interfaces:

```bash
npm run dev -- --host 0.0.0.0
```

3. Find your computer's LAN IP address.
4. Open the Vite URL from your phone, for example:

```text
http://192.168.7.202:5173
```

Your phone and computer must be on the same Wi-Fi network. The backend must also be reachable from the phone/browser at:

```text
http://192.168.7.202:5000
```

If your backend IP is different, set `VITE_API_BASE_URL` before starting Vite.

## Production Build

```bash
npm run build
```

The production app includes:

- `manifest.json` for install metadata
- theme color and mobile web app meta tags
- a simple service worker for shell caching
- safe-area viewport support for mobile devices
