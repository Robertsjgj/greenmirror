# GreenMirror Mobile App

React/Vite frontend for the GreenMirror greenhouse dashboard. Mobile-first, responsive on desktop, installable as a PWA.

## Local development

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

**No IP configuration needed.** The app detects the backend automatically at runtime using `window.location.hostname` — it always targets port `5000` on the same host that served the frontend.

| Opened from | Backend used |
|---|---|
| `http://localhost:5174` | `http://localhost:5000` |
| `http://10.9.1.96:5174` | `http://10.9.1.96:5000` |
| `http://192.168.1.42:5174` | `http://192.168.1.42:5000` |

This works on any network without editing any files.

## Phone testing on local Wi-Fi

1. Start the backend (prints its LAN IP at startup):
   ```bash
   USE_SIMULATION=true node server.js
   ```
2. Start the frontend exposed on the network:
   ```bash
   npm run dev -- --host 0.0.0.0 --port 5174
   ```
3. Open the LAN URL from Vite's output on your phone, for example:
   ```
   http://10.9.1.96:5174
   ```

The app will automatically connect to the backend at `http://10.9.1.96:5000`. Phone and computer must be on the same Wi-Fi.

## Manual override

Only needed if the backend runs on a **different machine** than the frontend:

```bash
# bash / macOS / Linux
VITE_API_BASE_URL=http://192.168.1.10:5000 npm run dev
```

```powershell
# Windows PowerShell
$env:VITE_API_BASE_URL="http://192.168.1.10:5000"
npm run dev -- --host 0.0.0.0 --port 5174
```

`VITE_API_BASE_URL` is a build-time Vite variable. When set, it takes priority over the automatic detection.

## Production build

```bash
npm run build
```

For a production build targeting a fixed backend address, set `VITE_API_BASE_URL` before building. Otherwise the auto-detection logic will be included and will work as long as both frontend and backend are served from the same hostname.

The production app includes:

- `manifest.json` for install metadata
- theme color and mobile web app meta tags
- a simple service worker for shell caching
- safe-area viewport support for mobile devices
