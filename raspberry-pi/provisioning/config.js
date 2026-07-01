// Configuration for the provisioning lifecycle.
//
// Provisioning runs INSIDE the main GreenMirror backend process (started by the
// bootstrap in index.js). It is not a separate service. Wi-Fi/AP/nmcli settings
// live with the WiFiManager (services/wifi-manager.js); this file holds only the
// provisioning-level tunables. Every value can be overridden via env in
// raspberry-pi/.env.

module.exports = {
  // ─── Master switch ──────────────────────────────────────────────────────────
  // 'auto' (default): enable only on Linux with nmcli present (i.e. on the Pi);
  // disable silently everywhere else (laptop dev, simulation).
  // 'off': never run provisioning. 'on': force it (mainly for testing).
  ENABLED: process.env.GREENMIRROR_PROVISIONING || 'auto',

  // ─── Setup web page ─────────────────────────────────────────────────────────
  // Port 80 so the user only types http://192.168.4.1. This is a separate
  // listener from the API (which stays on PORT/5000) and only runs during setup
  // mode. Binding 80 needs privilege — see the deployment README.
  PORTAL_PORT: Number(process.env.GREENMIRROR_PORTAL_PORT || 80),

  // ─── Timing ─────────────────────────────────────────────────────────────────
  // Give NetworkManager time to auto-connect saved networks on boot before we
  // decide there is no usable network and open the setup AP.
  BOOT_GRACE_MS:     Number(process.env.GREENMIRROR_BOOT_GRACE_MS     || 30000),
  // How often the monitor loop re-checks connectivity.
  CHECK_INTERVAL_MS: Number(process.env.GREENMIRROR_CHECK_INTERVAL_MS || 15000),
  // Consecutive offline checks before falling back to the setup AP.
  OFFLINE_THRESHOLD: Number(process.env.GREENMIRROR_OFFLINE_THRESHOLD || 4),
};
