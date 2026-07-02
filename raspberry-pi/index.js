// GreenMirror Raspberry Pi — application bootstrap (entry point).
//
// This is the ONE process PM2 manages. It wires together the app's services and
// nothing else; each service owns its own logic:
//   • backend       — the Express API (server.js): ESP ingest, Firestore, routes.
//   • provisioning   — Wi-Fi setup/recovery + the setup page (provisioning/).
//   • future services go here too (camera, AI, etc.) — one line each.
//
// Keeping orchestration here means server.js stays purely about the API, and new
// services don't require touching backend logic.

// Load .env FIRST — before requiring modules that read process.env at import
// time. Resolve it from this file's own directory so it works whether started as
// `node index.js` (from raspberry-pi/) or `node raspberry-pi/index.js` (repo root).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const backend = require('./server');
const { startProvisioning } = require('./provisioning');

// 1. Backend API — must come up regardless of network state.
backend.start();

// 2. Wi-Fi provisioning — fire-and-forget; self-disables off-Pi and never throws
//    into the backend. Runs inside this same process (no separate service).
startProvisioning();

// 3. Future services initialize here.
