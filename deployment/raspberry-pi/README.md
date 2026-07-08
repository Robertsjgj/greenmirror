# GreenMirror — Raspberry Pi Backend Deployment

Production deployment guide for running the GreenMirror backend
(`raspberry-pi/server.js`) on a Raspberry Pi, 24/7, managed by
[PM2](https://pm2.keymetrics.io/).

## Architecture

| Component   | Where it runs            | Notes                                            |
|-------------|--------------------------|--------------------------------------------------|
| Frontend    | **Vercel**               | Reads data from Firestore (see [mobile-app/README.md](../../mobile-app/README.md)). |
| Database    | **Firestore** / Google Cloud | Backend writes readings here.                |
| Backend API | **Raspberry Pi** (this guide) | Receives ESP data on `POST /api/readings`. |
| ESP sensors | Greenhouse               | Post readings to the Pi (see last section).      |

Matches the project architecture: ESP32 → Raspberry Pi backend → Firebase
Firestore → Vercel frontend (see the [root README](../../README.md)).

The **same repo** supports two workflows simultaneously:

- **Laptop development** — `cd raspberry-pi && node index.js` (or `npm start`).
  See [raspberry-pi/README.md](../../raspberry-pi/README.md). Nothing here changes that.
- **Pi production** — PM2 runs `raspberry-pi/index.js` from the repo root using
  [`ecosystem.config.cjs`](ecosystem.config.cjs).

The backend loads `raspberry-pi/.env` and `firebase-service-account.json`
relative to its own files, so it behaves identically no matter which directory
it is started from.

---

## Current Deployment Architecture

The reference production environment:

**Hardware**
- Raspberry Pi Zero 2 W — runs the Raspberry Pi Backend
- ESP32 — sensor node(s)
- Firebase — cloud database (Firestore)
- Vercel — frontend hosting

**Software**
- Debian 13 (Raspberry Pi OS, 64-bit)
- Node.js 24 (LTS, via NodeSource)
- PM2 — process manager for the backend
- Firebase Admin SDK — backend → Firestore writes

**Git**
- Deployed from the `dev` branch (pull on the Pi; see
  [Git deployment workflow](#git-deployment-workflow))

**Networking**
- ESP32 Wi-Fi + backend URL provisioned at runtime via WiFiManager
- Backend listens on port `5000`; the Pi should have a static IP / DHCP reservation
- Firestore reachable over the internet from both the Pi and the Vercel Frontend

---

## 1. Prepare a fresh Raspberry Pi

1. Flash **Raspberry Pi OS (64-bit Lite)** with Raspberry Pi Imager. In the
   imager's advanced settings, enable **SSH** and set a hostname (e.g.
   `greenmirror`) and Wi-Fi if needed.
2. Boot the Pi, then SSH in from your laptop:
   ```bash
   ssh pi@greenmirror.local      # or ssh pi@<pi-ip>
   ```
3. Make sure the system clock is correct (Firestore auth needs it):
   ```bash
   timedatectl
   ```

## 2. Install Node.js, npm, git, PM2

You can do everything in section 2–6 automatically with the installer
([section 7](#7-automated-install-recommended)), or manually:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y git curl ca-certificates build-essential

# Node.js LTS (includes npm)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v

# PM2 process manager
sudo npm install -g pm2
```

## 3. Clone the GreenMirror repo

```bash
cd ~
git clone <your-repo-url> greenmirror
cd greenmirror
```

> Use the repo root (`~/greenmirror`) as your working directory for all
> deployment commands below.

## 4. Set up `raspberry-pi/.env`

The `.env` file is **git-ignored** and must be created on the Pi by hand:

```bash
cp raspberry-pi/.env.example raspberry-pi/.env
nano raspberry-pi/.env
```

Key settings (see `.env.example` for the full list):

```ini
PORT=5000
# USE_SIMULATION stays false in production (also forced by PM2).
```

Firebase credentials are optional in `.env` if you use the JSON file in the next
step. Without any credentials the backend still runs (in-memory only, no
Firestore writes).

## 5. Add `firebase-service-account.json`

This file is **git-ignored** and must be copied to the Pi by hand. From your
laptop:

```bash
scp firebase-service-account.json pi@greenmirror.local:~/greenmirror/raspberry-pi/
```

It must end up at exactly:

```
~/greenmirror/raspberry-pi/firebase-service-account.json
```

> ⚠️ Never commit `.env` or `firebase-service-account.json`. They are already in
> `.gitignore`.

## 6. Install backend dependencies

```bash
cd ~/greenmirror/raspberry-pi
npm ci          # or: npm install
cd ~/greenmirror
```

## 7. Automated install (recommended)

Instead of doing sections 2–6 by hand, run the idempotent installer. It is safe
to run multiple times, never overwrites secrets, and won't start the service
until the required secrets exist:

```bash
cd ~/greenmirror
bash deployment/raspberry-pi/install.sh
```

If `.env` or `firebase-service-account.json` are missing, it prints exactly what
to add and stops without starting PM2.

## 8. Run the backend manually (debug)

To check it works before handing it to PM2:

```bash
cd ~/greenmirror/raspberry-pi
node index.js           # or: npm start
```

You should see `🚀 GreenMirror API ready` and a `Network: http://<pi-ip>:5000`
line. Press `Ctrl+C` to stop.

## 9. Start the backend with PM2 (production)

```bash
cd ~/greenmirror
pm2 start deployment/raspberry-pi/ecosystem.config.cjs
pm2 save
```

To start automatically on boot (one-time):

```bash
pm2 startup        # then run the sudo command it prints
pm2 save
```

App name: **`greenmirror-backend`**. PM2 forces `NODE_ENV=production` and
`USE_SIMULATION=false`.

## 10. Deploy code updates

After pushing changes to the repo, on the Pi:

```bash
cd ~/greenmirror
bash deployment/raspberry-pi/update.sh
```

This pulls, reinstalls dependencies only if `package.json`/lockfile changed,
runs `npm run check` (syntax-checks the entry point, API, `services/`, and
`provisioning/`), and only then reloads the PM2 app. If a check fails, the
running backend is left untouched.

Manual equivalent:

```bash
cd ~/greenmirror
git pull
cd raspberry-pi && npm ci && npm run check
pm2 reload greenmirror-backend
```

## 11. Check logs & status

```bash
pm2 status                      # process list, uptime, restarts
pm2 logs greenmirror-backend    # live logs (Ctrl+C to exit)
pm2 logs greenmirror-backend --lines 200
pm2 restart greenmirror-backend
pm2 stop greenmirror-backend
```

## 12. Find the Pi's IP address

```bash
hostname -I        # first value is the LAN IP, e.g. 10.235.41.88
```

The backend also prints its LAN address on startup (`Network: http://<ip>:5000`).
Test the API from your laptop:

```bash
curl http://<pi-ip>:5000/          # -> "GreenMirror Pi API running"
```

A static IP or DHCP reservation on your router is recommended so the address
doesn't change.

## 13. Point ESP firmware at the Pi

**ESP32 — no code edit needed.** The ESP32 firmware provisions Wi-Fi and the
backend URL at runtime via the **WiFiManager** captive portal (no hardcoded
SSID/IP). When the device opens the `GreenMirror-Setup` portal, enter the backend
URL pointing at this Pi:

```
http://<pi-ip>:5000/api/readings
```

The URL is stored persistently on the device (Preferences) and survives reboots.

**Backend URL recommendation:** prefer the Pi's **static IP / DHCP reservation**
(reliable) over the `greenmirror-pi.local` mDNS default, which does not resolve on
all networks. Find the IP with `hostname -I` (section 12).

**ESP8266** still uses a hardcoded `API_URL` in `src/main.cpp` and must be
rebuilt/reflashed to change it.

Full firmware details, provisioning flow, and Wi-Fi reset steps are in
[esp-firmware/README.md](../../esp-firmware/README.md).

---

## Wi-Fi provisioning (NetworkManager)

Make the Pi deployable on **any** network without reflashing the SD card or
editing config files — the Linux counterpart to the ESP32's WiFiManager. When no
usable network is available, the backend opens a `GreenMirror-Setup` access point
with a web page, saves whatever the user enters via NetworkManager, and joins
that network permanently.

**Single process — no separate service.** The app bootstrap
(`raspberry-pi/index.js`) starts the backend and then provisioning, so it all
runs inside the one `greenmirror-backend` PM2 app. All nmcli work goes through the
reusable `services/wifi-manager.js`. There is **no** systemd unit and **no**
second process to install; the API keeps serving on port `5000` throughout.

### How it works

When the backend starts:

- **Usable network already present** (Wi-Fi *or* Ethernet) → nothing happens; the
  normal backend serves the API and writes to Firestore as usual.
- **No usable network** → the backend opens an **open** AP named
  `GreenMirror-Setup` and serves a setup page at **`http://192.168.4.1`** (own
  listener on port `80`) with **Wi-Fi SSID** and **Wi-Fi Password** fields and a
  **Save & Connect** button. On submit it saves the credentials with `nmcli`,
  drops the AP, and joins the network — the backend was never stopped.
- **Configured Wi-Fi later disappears** → the backend automatically re-opens the
  `GreenMirror-Setup` AP so a different network can be configured.

Credentials are stored by NetworkManager, so they survive reboots and can be
changed any number of times. All network changes go through `nmcli` — no
interface files are edited by hand. The setup page is also the foundation for a
future management dashboard (status, restart, logs, change Wi-Fi).

### Requirements & one-time privilege setup

The backend process needs two privileges to run setup mode. Grant them once:

1. **NetworkManager** managing the Wi-Fi interface (default on Raspberry Pi OS
   Bookworm / Debian 12+):
   ```bash
   sudo apt-get install -y network-manager
   sudo systemctl enable --now NetworkManager
   ```
2. **Run nmcli and bind port 80** as the pm2 user. Either run the PM2 app as
   root, **or** (keeping the existing non-root pm2 user) grant just what's needed:
   ```bash
   # Let node bind port 80 for the setup page
   sudo setcap 'cap_net_bind_service=+ep' "$(command -v node)"

   # Passwordless nmcli for the pm2 user (provisioning uses `sudo -n nmcli`)
   echo "$USER ALL=(root) NOPASSWD: $(command -v nmcli)" | \
     sudo tee /etc/sudoers.d/greenmirror-nmcli
   ```
   (The module auto-detects: it calls `nmcli` directly when root, else `sudo -n
   nmcli`. Override with `GREENMIRROR_NMCLI_MODE`.)

No provisioning-specific install step is required beyond the above — it starts
with the backend (`pm2 start deployment/raspberry-pi/ecosystem.config.cjs`).

### Operate

```bash
pm2 logs greenmirror-backend                 # look for [provision] lines (boot decision, AP, connect)
pm2 status                                    # the single GreenMirror app
```

To reconfigure Wi-Fi on demand, forget the current network so the AP re-opens:

```bash
sudo nmcli connection delete "<current-ssid>"   # AP re-opens within ~1 minute
```

Tunables are environment variables set in `raspberry-pi/.env`: the enable switch,
portal port, and timings are documented in `raspberry-pi/provisioning/config.js`;
the Wi-Fi/AP settings (`GREENMIRROR_AP_SSID`, `GREENMIRROR_AP_IP`,
`GREENMIRROR_WIFI_IFACE`, `GREENMIRROR_NMCLI_MODE`, …) in
`raspberry-pi/services/wifi-manager.js`.

---

## Git deployment workflow

Development happens on the `dev` branch; the Pi tracks the deployed branch and is
updated with `git pull`.

1. Develop and commit on `dev` (laptop), then push.
2. Merge into the branch the Pi tracks when ready to release.
3. On the Pi, pull and reload safely:
   ```bash
   cd ~/greenmirror
   bash deployment/raspberry-pi/update.sh
   ```
   This runs `git pull`, reinstalls dependencies only if they changed, runs
   syntax checks, and reloads PM2 only if the checks pass (see section 10).

---

## Security checklist

- ✅ `.env` and `firebase-service-account.json` are git-ignored — never commit them.
- ✅ Copy secrets to the Pi over `scp`/`nano`, not via git.
- ✅ `install.sh` never overwrites existing secrets.

## Manual steps that cannot be automated

- Copying `.env` and `firebase-service-account.json` onto the Pi (secrets).
- Running the `sudo` command printed by `pm2 startup` (boot persistence).
- Granting one-time provisioning privileges (NetworkManager, `setcap`, sudoers) — see [Wi-Fi provisioning](#wi-fi-provisioning-networkmanager).
- Reserving/Setting the Pi's IP on your router and provisioning the ESP firmware.

---

**Last updated:** June 2026

**Current architecture:**
✓ ESP32 WiFiManager provisioning ·
✓ Raspberry Pi Backend ·
✓ PM2 deployment ·
✓ Firebase Firestore ·
✓ Vercel Frontend

Part of [GreenMirror](../../README.md) · backend: [raspberry-pi/README.md](../../raspberry-pi/README.md)
