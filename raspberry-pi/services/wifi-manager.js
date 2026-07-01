// WiFiManager — the single abstraction over Wi-Fi / NetworkManager.
//
// This is the ONLY module in the app that executes nmcli. Provisioning today —
// and the GreenMirror management dashboard tomorrow — go through this API instead
// of shelling out. That keeps all network behaviour (and its quirks) in one place.
//
// Public API (client Wi-Fi):
//   scanNetworks()        list visible networks
//   connect(ssid, pw)     join + permanently save a network (autoconnect on reboot)
//   disconnect()          drop the current Wi-Fi association
//   status()              current Wi-Fi/connectivity snapshot
//   listSavedNetworks()   saved NetworkManager Wi-Fi profiles
//   forgetNetwork(ssid)   delete a saved profile
//
// Plus setup-mode helpers (also nmcli, so they live here too):
//   startAccessPoint() / stopAccessPoint() / isNetworkUsable() /
//   waitForConnection() / isAvailable() / getInterface() / getApInfo()
//
// Everything runs via execFile (no shell), so a user-supplied SSID/password with
// spaces or shell metacharacters is passed as one safe argument.

const { execFile } = require('child_process');

const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0;

// Resolve config from explicit overrides, then env, then sensible defaults. A
// zero-arg createWifiManager() therefore "just works" for the future dashboard.
function resolveConfig(overrides = {}) {
  const env = process.env;
  return {
    apSsid:          overrides.apSsid          || env.GREENMIRROR_AP_SSID     || 'GreenMirror-Setup',
    apConName:       overrides.apConName       || env.GREENMIRROR_AP_CON_NAME || 'GreenMirror-Setup',
    apIp:            overrides.apIp            || env.GREENMIRROR_AP_IP       || '192.168.4.1',
    apCidr:          overrides.apCidr          || env.GREENMIRROR_AP_CIDR     || '192.168.4.1/24',
    iface:           overrides.iface           || env.GREENMIRROR_WIFI_IFACE  || '',
    nmcliMode:       overrides.nmcliMode       || env.GREENMIRROR_NMCLI_MODE  || 'auto',
    connectTimeout:  Number(overrides.connectTimeout || env.GREENMIRROR_CONNECT_TIMEOUT_MS || 45000),
  };
}

// Split an nmcli terse (`-t`) line on unescaped colons and unescape the fields.
function splitTerse(line) {
  return line
    .split(/(?<!\\):/)
    .map((f) => f.replace(/\\(.)/g, '$1'));
}

function createWifiManager(overrides = {}) {
  const cfg = resolveConfig(overrides);

  // Decide how to invoke nmcli: direct as root, else `sudo -n` (non-interactive,
  // fails fast rather than hanging on a password prompt). See deployment README.
  function nmcliCommand(args) {
    const useSudo = cfg.nmcliMode === 'sudo' || (cfg.nmcliMode === 'auto' && !runningAsRoot);
    return useSudo
      ? { cmd: 'sudo', argv: ['-n', 'nmcli', ...args] }
      : { cmd: 'nmcli', argv: args };
  }

  function nmcli(args, { timeout = 60000 } = {}) {
    const { cmd, argv } = nmcliCommand(args);
    return new Promise((resolve, reject) => {
      execFile(cmd, argv, { timeout }, (err, stdout, stderr) => {
        if (err) {
          err.message = `nmcli ${args.join(' ')} failed: ${(stderr || err.message).trim()}`;
          return reject(err);
        }
        resolve((stdout || '').trim());
      });
    });
  }

  async function nmcliQuiet(args) {
    try { return await nmcli(args); } catch { return null; }
  }

  // ─── Availability & discovery ───────────────────────────────────────────────

  // True if nmcli is callable — lets callers self-disable on non-NM hosts.
  function isAvailable() {
    return new Promise((resolve) => {
      execFile('nmcli', ['--version'], { timeout: 5000 }, (err) => resolve(!err));
    });
  }

  async function getInterface() {
    if (cfg.iface) return cfg.iface;
    const out = await nmcli(['-t', '-f', 'DEVICE,TYPE', 'device']);
    for (const line of out.split('\n')) {
      const [device, type] = splitTerse(line);
      if (type === 'wifi' && device) return device;
    }
    throw new Error('No wifi interface found (nmcli shows no type=wifi device)');
  }

  // ─── Client Wi-Fi API ───────────────────────────────────────────────────────

  // List visible networks, strongest signal first, de-duplicated by SSID.
  async function scanNetworks() {
    const iface = await getInterface();
    await nmcliQuiet(['device', 'wifi', 'rescan', 'ifname', iface]);
    const out = await nmcli(['-t', '-f', 'IN-USE,SIGNAL,SECURITY,SSID', 'device', 'wifi', 'list', 'ifname', iface]);

    const bySsid = new Map();
    for (const line of out.split('\n').filter(Boolean)) {
      const [inUse, signal, security, ssid] = splitTerse(line);
      if (!ssid) continue; // skip hidden networks
      const entry = {
        ssid,
        signal: Number(signal) || 0,
        security: security || 'open',
        active: inUse === '*',
      };
      const existing = bySsid.get(ssid);
      if (!existing || entry.signal > existing.signal) bySsid.set(ssid, entry);
    }
    return [...bySsid.values()].sort((a, b) => b.signal - a.signal);
  }

  // Connect to and permanently save a network (autoconnect on reboot). Pass an
  // empty/absent password for open networks. The caller must stop the AP first
  // (AP and client mode share one radio).
  async function connect(ssid, password) {
    const iface = await getInterface();
    await nmcliQuiet(['device', 'wifi', 'rescan', 'ifname', iface]);

    const args = ['device', 'wifi', 'connect', ssid];
    if (password) args.push('password', password);
    args.push('ifname', iface);

    try {
      await nmcli(args, { timeout: cfg.connectTimeout });
    } catch (err) {
      // A failed attempt can leave a broken profile named after the SSID; remove
      // it so it doesn't shadow a later correct attempt or auto-connect.
      await nmcliQuiet(['connection', 'delete', ssid]);
      throw err;
    }
  }

  async function disconnect() {
    const iface = await getInterface();
    await nmcli(['device', 'disconnect', iface]);
  }

  // Current Wi-Fi / connectivity snapshot — the raw material for system health.
  async function status() {
    const conn = (await nmcliQuiet(['-t', '-f', 'CONNECTIVITY', 'general', 'status'])) || 'unknown';
    let iface = null;
    try { iface = await getInterface(); } catch { /* no wifi device */ }

    let connected = false;
    let ssid = null;
    let ip = null;

    if (iface) {
      const dev = await nmcliQuiet(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device']);
      for (const line of (dev || '').split('\n')) {
        const [device, type, state, connection] = splitTerse(line);
        if (device === iface && type === 'wifi') {
          connected = state === 'connected';
          ssid = connected ? (connection || null) : null;
        }
      }
      const ipOut = await nmcliQuiet(['-t', '-f', 'IP4.ADDRESS', 'device', 'show', iface]);
      const ipLine = (ipOut || '').split('\n').find((l) => l.startsWith('IP4.ADDRESS'));
      if (ipLine) ip = splitTerse(ipLine)[1]?.split('/')[0] || null;
    }

    return { available: true, interface: iface, connected, ssid, ip, connectivity: conn };
  }

  async function listSavedNetworks() {
    const out = await nmcli(['-t', '-f', 'NAME,TYPE', 'connection', 'show']);
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => splitTerse(line))
      .filter(([name, type]) => type === '802-11-wireless' && name !== cfg.apConName)
      .map(([name]) => name);
  }

  async function forgetNetwork(ssid) {
    await nmcli(['connection', 'delete', ssid]);
  }

  // ─── Setup-mode (access point) helpers ──────────────────────────────────────

  // Bring up the open GreenMirror-Setup AP at apIp. Idempotent: any stale profile
  // with the same name is removed first, then re-created cleanly.
  async function startAccessPoint() {
    const iface = await getInterface();
    await nmcliQuiet(['connection', 'down', cfg.apConName]);
    await nmcliQuiet(['connection', 'delete', cfg.apConName]);

    // Open AP (no 802-11-wireless-security = no password) using NM's shared IPv4
    // mode, which also runs DHCP/DNS for connecting clients.
    await nmcli([
      'connection', 'add',
      'type', 'wifi',
      'ifname', iface,
      'con-name', cfg.apConName,
      'autoconnect', 'no',
      'ssid', cfg.apSsid,
      '802-11-wireless.mode', 'ap',
      '802-11-wireless.band', 'bg',
      'ipv4.method', 'shared',
      'ipv4.addresses', cfg.apCidr,
    ]);
    await nmcli(['connection', 'up', cfg.apConName]);
  }

  async function stopAccessPoint() {
    await nmcliQuiet(['connection', 'down', cfg.apConName]);
  }

  // ─── Convenience ────────────────────────────────────────────────────────────

  // True when the Pi has a usable network by ANY means — full internet, a Wi-Fi
  // association (even without internet), or another interface (e.g. Ethernet).
  // Only when this is false does provisioning open the setup AP.
  async function isNetworkUsable() {
    const s = await status();
    if (['full', 'limited', 'portal'].includes(s.connectivity)) return true;
    return s.connected;
  }

  // Poll until Wi-Fi association succeeds or the timeout elapses.
  async function waitForConnection(timeoutMs = cfg.connectTimeout) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = await status();
      if (s.connected) return true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return (await status()).connected;
  }

  function getApInfo() {
    return { ssid: cfg.apSsid, ip: cfg.apIp };
  }

  return {
    isAvailable,
    getInterface,
    scanNetworks,
    connect,
    disconnect,
    status,
    listSavedNetworks,
    forgetNetwork,
    startAccessPoint,
    stopAccessPoint,
    isNetworkUsable,
    waitForConnection,
    getApInfo,
  };
}

module.exports = { createWifiManager };
