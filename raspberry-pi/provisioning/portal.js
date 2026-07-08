// Setup web server — "GreenMirror Manager, version 1".
//
// Runs INSIDE the main backend process as a second, short-lived express listener
// (the API keeps its own listener on PORT/5000). It is only up while the Pi is in
// setup mode, and reuses the express dependency the backend already has — no
// extra packages.
//
// Today it serves the Wi-Fi setup page and a status feed. It is deliberately the
// seed of the future GreenMirror management dashboard: routes are registered in
// one place (registerRoutes) so new endpoints — Wi-Fi/Firebase/ESP/backend
// status, restart, logs, change-Wi-Fi — slot in without touching lifecycle code.
// It never executes nmcli: all network work is delegated to the caller's handlers
// (which use the WiFiManager).

const express = require('express');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const SETUP_PAGE = path.join(PUBLIC_DIR, 'setup.html');

// Register all setup/dashboard routes on an express app.
//   handlers.onSubmit({ ssid, password }) — async; performs AP-teardown + connect.
//   handlers.getStatus() — optional; returns a JSON-able system-health object.
function registerRoutes(app, handlers) {
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/assets', express.static(PUBLIC_DIR));

  // The setup page, served for the root and common captive-portal probe paths so
  // it is easy to reach at http://192.168.4.1.
  const sendSetup = (req, res) => res.sendFile(SETUP_PAGE);
  app.get('/', sendSetup);
  app.get('/setup', sendSetup);

  // System-health feed — today the Wi-Fi/setup snapshot, tomorrow the dashboard's
  // full data source. Safe to extend without touching lifecycle code.
  app.get('/api/status', async (req, res) => {
    try {
      const status = handlers.getStatus ? await handlers.getStatus() : {};
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save & Connect.
  app.post('/save', async (req, res) => {
    const ssid = (req.body.ssid || '').trim();
    const password = req.body.password || '';

    if (!ssid) {
      return res.status(400).json({ ok: false, message: 'Wi-Fi SSID is required.' });
    }

    // Respond BEFORE tearing down the AP: once we switch the radio to the new
    // network the client loses this connection, so the reply must go out first.
    res.json({ ok: true, message: `Credentials saved. Connecting to "${ssid}"…` });

    // Kick off the connect attempt after the response has flushed.
    setTimeout(() => {
      Promise.resolve()
        .then(() => handlers.onSubmit({ ssid, password }))
        .catch((err) => console.error(`[portal] onSubmit failed: ${err.message}`));
    }, 1500);
  });

  // Future dashboard routes go here, e.g.:
  //   app.post('/api/restart-backend', ...)
  //   app.get('/api/logs', ...)
  //   app.post('/api/wifi', ...)   // change network from the dashboard
}

// Start the setup server. Returns { server, close() }.
//   handlers — see registerRoutes.
//   options  — { apIp, port } where to bind (from the WiFiManager + config).
function startPortal(handlers, options = {}) {
  const apIp = options.apIp || '192.168.4.1';
  const port = options.port || 80;

  const app = express();
  registerRoutes(app, handlers);

  const server = app.listen(port, apIp, () => {
    console.log(`[portal] Setup page at http://${apIp}:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRNOTAVAIL') {
      // AP interface may not have its IP yet — bind all interfaces instead.
      console.warn(`[portal] ${apIp} not available yet — binding 0.0.0.0.`);
      server.listen(port, '0.0.0.0');
    } else if (err.code === 'EACCES') {
      console.error(
        `[portal] Permission denied binding port ${port}. Either run the backend ` +
        `with privilege, or grant node the capability once:\n` +
        `    sudo setcap 'cap_net_bind_service=+ep' "$(command -v node)"`,
      );
    } else {
      console.error(`[portal] server error: ${err.message}`);
    }
  });

  return {
    server,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { startPortal, registerRoutes };
