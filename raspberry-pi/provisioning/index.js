// GreenMirror Wi-Fi provisioning — controller module.
//
// This is NOT a standalone process. It is initialized by the app bootstrap
// (index.js) so GreenMirror stays a SINGLE PM2-managed application. It owns only
// the provisioning lifecycle + the setup web page; it never touches the API
// routes, Firestore, sensor parsing, or payloads — those keep running in the same
// process regardless of what happens here.
//
// All Wi-Fi/nmcli work is delegated to the WiFiManager (services/wifi-manager);
// this module contains no nmcli. Overall health is composed by system-status.
//
// Lifecycle (all inside the backend process):
//   • On start, wait for NetworkManager to auto-connect a saved network.
//       - Usable network (Wi-Fi or Ethernet) → do nothing; backend runs normally.
//       - No usable network → open the GreenMirror-Setup AP + setup page.
//   • Monitor the link. If Wi-Fi disappears for good, re-open setup mode.
//   • On credential submit: save + connect via the WiFiManager, drop the AP. The
//     backend was never stopped — it simply now has a network.

const config = require('./config');
const { createWifiManager } = require('../services/wifi-manager');
const { getSystemHealth } = require('../services/system-status');
const { startPortal } = require('./portal');

const wifi = createWifiManager();

// ─── State ──────────────────────────────────────────────────────────────────
let portal = null;       // active setup-server handle while in setup mode
let inSetupMode = false;  // true when the AP + setup page are up
let offlineStreak = 0;    // consecutive offline checks while in online mode
let busy = false;         // guards against overlapping monitor ticks
let started = false;      // guards against double-start

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[provision] ${msg}`);

// ─── Setup mode (AP + setup page) ─────────────────────────────────────────────

async function enterSetupMode() {
  if (inSetupMode) return;
  inSetupMode = true;
  offlineStreak = 0;
  const ap = wifi.getApInfo();
  log('No usable network — starting GreenMirror-Setup access point...');
  try {
    await wifi.startAccessPoint();
    log(`AP up. Join "${ap.ssid}" and open http://${ap.ip}.`);
  } catch (err) {
    log(`Failed to start AP: ${err.message}`);
  }
  if (!portal) {
    portal = startPortal(
      { onSubmit: handleCredentials, getStatus },
      { apIp: ap.ip, port: config.PORTAL_PORT },
    );
  }
}

async function exitSetupMode() {
  if (portal) {
    await portal.close().catch(() => {});
    portal = null;
  }
  await wifi.stopAccessPoint().catch(() => {});
  inSetupMode = false;
}

// Overall system health for the setup page (foundation for a future dashboard).
function getStatus() {
  return getSystemHealth(wifi, { setupMode: inSetupMode });
}

// ─── Credential submission handler ─────────────────────────────────────────────

// Called by the portal after the browser has been told "connecting…". The AP
// and client mode share one radio, so we must drop the AP before joining.
async function handleCredentials({ ssid, password }) {
  log(`Received credentials for "${ssid}". Switching to client mode...`);
  await wifi.stopAccessPoint().catch(() => {});

  try {
    await wifi.connect(ssid, password);
  } catch (err) {
    log(`Connect command failed: ${err.message}`);
  }

  const connected = await wifi.waitForConnection();

  if (connected) {
    log(`Connected to "${ssid}". Backend continues normally.`);
    await exitSetupMode();
  } else {
    log(`Could not connect to "${ssid}" — re-opening setup AP for another try.`);
    inSetupMode = false;     // allow enterSetupMode to re-run
    await enterSetupMode();  // portal server is still listening; just brings the AP back
  }
}

// ─── Monitor loop ──────────────────────────────────────────────────────────────

async function monitorTick() {
  if (busy) return;
  busy = true;
  try {
    const usable = await wifi.isNetworkUsable();

    if (inSetupMode) {
      // Came online by other means (e.g. Ethernet) while the AP was up.
      if (usable) {
        log('Network restored — leaving setup mode.');
        await exitSetupMode();
      }
      return;
    }

    if (usable) {
      offlineStreak = 0;
      return;
    }

    // Online-mode but currently offline — the saved network may just be flaky.
    // Give NetworkManager a few cycles to auto-reconnect before falling back.
    offlineStreak += 1;
    log(`Network down (${offlineStreak}/${config.OFFLINE_THRESHOLD}).`);
    if (offlineStreak >= config.OFFLINE_THRESHOLD) {
      await enterSetupMode();
    }
  } catch (err) {
    log(`monitor error: ${err.message}`);
  } finally {
    busy = false;
  }
}

// ─── Public entry point ─────────────────────────────────────────────────────────

// Called once by the bootstrap. Non-blocking and never throws — a provisioning
// fault must not take down the backend. Self-disables when it shouldn't run
// (non-Linux, no NetworkManager, or ENABLED=off).
async function startProvisioning() {
  if (started) return;
  started = true;

  try {
    if (config.ENABLED === 'off') {
      log('Disabled (GREENMIRROR_PROVISIONING=off).');
      return;
    }
    if (config.ENABLED !== 'on') {
      // 'auto': only run on Linux with NetworkManager available.
      if (process.platform !== 'linux' || !(await wifi.isAvailable())) {
        log('Not on a NetworkManager Linux host — provisioning disabled.');
        return;
      }
    }

    log('Provisioning enabled (single-process, inside the backend).');
    try {
      log(`Wi-Fi interface: ${await wifi.getInterface()}`);
    } catch (err) {
      log(err.message);
    }

    // Let NetworkManager auto-connect saved networks before we judge.
    log(`Waiting ${config.BOOT_GRACE_MS / 1000}s for auto-connect...`);
    await sleep(config.BOOT_GRACE_MS);

    if (await wifi.isNetworkUsable()) {
      log('Network already usable. Backend runs normally.');
    } else {
      await enterSetupMode();
    }

    setInterval(monitorTick, config.CHECK_INTERVAL_MS);
  } catch (err) {
    log(`startup error (provisioning disabled): ${err.message}`);
  }
}

module.exports = { startProvisioning };
