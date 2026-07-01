// System status / health aggregator.
//
// Composes an overall GreenMirror health snapshot from the individual services.
// Today only the Wi-Fi section is real (sourced from the WiFiManager); the other
// sections are intentional stubs so the future management dashboard can fill them
// in without changing this shape or its callers.
//
// Keeping this here (rather than reading nmcli directly) means the dashboard and
// the provisioning setup page share ONE definition of "system health".

// Build the health object.
//   wifi  — a WiFiManager instance (from services/wifi-manager).
//   extra — caller-supplied context, e.g. { setupMode: true }.
async function getSystemHealth(wifi, extra = {}) {
  const w = await wifi.status().catch(() => ({ available: false }));

  return {
    generatedAt: new Date().toISOString(),

    // Real today.
    wifi: {
      available: w.available !== false,
      connected: !!w.connected,
      ssid: w.ssid || null,
      ip: w.ip || null,
      connectivity: w.connectivity || 'unknown',
    },

    provisioning: {
      setupMode: !!extra.setupMode,
    },

    // Stubs for the future dashboard — populated later, shape stays stable:
    //   internet: { online, latencyMs }
    //   firebase: { configured, reachable }
    //   backend:  { pm2, uptimeS }
    //   esp:      { nodesOnline, lastSeen }
    //   ai:       { enabled, status }
    //   camera:   { present, streaming }
  };
}

module.exports = { getSystemHealth };
