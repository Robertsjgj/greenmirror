# GreenMirror Mobile App

React/Vite frontend for the GreenMirror greenhouse dashboard. Mobile-first,
responsive on desktop, and installable as a PWA. Part of the
[GreenMirror project](../README.md).

## Backend connection (automatic)

The app derives the backend URL at runtime from the host that served it, always
targeting port `5000`:

| Opened from | Backend used |
|---|---|
| `http://localhost:5174` | `http://localhost:5000` |
| `http://10.9.1.96:5174` | `http://10.9.1.96:5000` |
| `http://192.168.1.42:5174` | `http://192.168.1.42:5000` |

This works on any network with no configuration. There is **no manual override**:
`VITE_API_BASE_URL` is consulted only as a non-browser (SSR/build) fallback and is
**ignored in the browser**, so runtime detection always wins. This prevents
stale-IP bugs after a network change.

**Where data comes from:**

- **Local/LAN development** — live readings are polled from the backend API
  (`GET /api/latest`, every 8 s) on the same host.
- **Production (Vercel)** — the backend is not on the same host, so the app reads
  live state, history, and trends from **Firestore** (configure Firebase below).

## Local development

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

Open the printed local or LAN URL. To test on a phone, open the LAN URL on a
device on the same Wi-Fi. Start the backend too — see
[raspberry-pi/README.md](../raspberry-pi/README.md).

## Firebase configuration (optional)

Firestore sync is optional. Without it the app works via API polling alone. To
enable real-time Firestore sync (and data in production), copy `.env.example` to
`.env.local` and fill in your Firebase web-app credentials:

```ini
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=   # optional
```

Find these in Firebase Console → Project settings → Your apps → Web app.
`.env.local` is git-ignored and never committed. The data model is documented in
[docs/firestore-schema.md](../docs/firestore-schema.md).

## Production build

```bash
npm run build
```

Output goes to `dist/` and includes the PWA manifest, theme/meta tags, a simple
shell-caching service worker, and safe-area viewport support.

## Vercel deployment

The frontend is hosted on Vercel (connect the repo; deploys run on push).

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variables:** set the `VITE_FIREBASE_*` variables (above) in the
  Vercel project settings so the production app can read from Firestore.

For the backend deployment, see
[deployment/raspberry-pi/README.md](../deployment/raspberry-pi/README.md).

## Troubleshooting

| Problem | Check |
|---------|-------|
| Frontend shows stale or no data | **Local/LAN dev:** the Raspberry Pi Backend is running and reachable on the same host at port `5000`. **Production:** the `VITE_FIREBASE_*` variables are set in Vercel and Firestore `latestReadings` is updating |
| Console warns `VITE_API_BASE_URL is ... IGNORED` | Expected — runtime detection is used in the browser by design |
| No real-time updates in production | Firebase not configured — set the `VITE_FIREBASE_*` variables (above) in Vercel |

---

**Last updated:** June 2026

**Current architecture:**
✓ ESP32 WiFiManager provisioning ·
✓ Raspberry Pi Backend ·
✓ PM2 deployment ·
✓ Firebase Firestore ·
✓ Vercel Frontend

Part of [GreenMirror](../README.md).
