// PM2 process definition for the GreenMirror Raspberry Pi backend.
//
// Start it from anywhere with:
//   pm2 start deployment/raspberry-pi/ecosystem.config.cjs
//
// The backend itself loads raspberry-pi/.env and firebase-service-account.json
// relative to its own files, so it runs correctly regardless of cwd. We still
// pin cwd to the repo root so the `script` path below resolves predictably and
// PM2's log/relative paths are stable.

const path = require('path');

// This file is at <repo>/deployment/raspberry-pi/ — repo root is two levels up.
const repoRoot = path.resolve(__dirname, '..', '..');

module.exports = {
  apps: [
    {
      name: 'greenmirror-backend',
      script: 'raspberry-pi/server.js',
      cwd: repoRoot,

      // Production: live ESP data, no simulator. PORT and FIREBASE_* come from
      // raspberry-pi/.env (loaded by server.js itself).
      env: {
        NODE_ENV: 'production',
        USE_SIMULATION: 'false',
      },

      // Keep it alive 24/7, but back off if it crash-loops on startup.
      autorestart: true,
      max_restarts: 10,
      min_uptime: '15s',
      restart_delay: 2000,

      // Single long-running API process — clustering would double Firestore
      // writes and break the in-memory latest-reading cache.
      instances: 1,
      exec_mode: 'fork',

      // Timestamped, merged logs (see them with `pm2 logs greenmirror-backend`).
      time: true,
      merge_logs: true,
    },
  ],
};
