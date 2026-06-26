// Load .env FIRST — must happen before any other require() reads process.env.
// Resolve it from this file's own directory (not process.cwd()) so the server
// loads the same raspberry-pi/.env whether started with `cd raspberry-pi &&
// node server.js` (laptop dev) or `node raspberry-pi/server.js` from the repo
// root (PM2 production).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require("express");
const cors    = require("cors");
const os      = require("os");

const { createSimulator, UPDATE_INTERVAL_MS } = require("./simulator");
const { saveReading, firestoreEnabled }        = require("./firestore");
const { buildGreenhouseReadingSnapshot }        = require("./snapshot");
const { getWeatherCached }                      = require("./weather");

function getLanIp() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

const app            = express();
const PORT           = process.env.PORT || 5000;
const USE_SIMULATION = process.env.USE_SIMULATION === "true";
const GREENHOUSE_ID  = process.env.GREENHOUSE_ID  || "sydney-greenhouse";

app.use(cors());
app.use(express.json());

// In-memory snapshots
let latestReading    = null;
let latestSystemState = null;
let readingsHistory  = [];

// ─── Zone alert analysis ───────────────────────────────────────────────────────

function analyzeZone(zone) {
  const alerts = [];

  // Sensor-status alerts take priority — a disconnected sensor must NOT produce
  // dry/wet/watering alerts (its reading isn't real).
  const moistureDisconnected =
    zone.soil_moisture_status === 'not_connected' || zone.soil_moisture_status === 'invalid';
  const tempDisconnected =
    zone.soil_temp_status === 'not_detected' || zone.soil_temp_status === 'not_connected';

  if (moistureDisconnected) alerts.push('moisture sensor not connected');
  if (tempDisconnected)     alerts.push('temperature sensor not connected');

  if (!moistureDisconnected && typeof zone.soil_moisture_pct === 'number') {
    if (zone.soil_moisture_pct < 30) alerts.push("too dry");
    if (zone.soil_moisture_pct > 80) alerts.push("too wet");
  }
  if (!tempDisconnected && typeof zone.soil_temp_c === 'number' && zone.soil_temp_c < 10) {
    alerts.push("too cold");
  }
  return alerts;
}

// ─── Build a full reading snapshot ────────────────────────────────────────────

/**
 * Creates the unified Firestore document from raw input.
 *
 * mode "real"       — live ESP data; RPi environment if present in body; real weather from API.
 * mode "simulation" — simulated ESP data; generated environment; real weather from API.
 */
async function buildSnapshot(rawReading, mode) {
  // Raw zones with alert strings
  const rawZones = (rawReading.zones || []).map((z) => ({
    ...z,
    alerts: analyzeZone(z),
  }));

  // RPi environment sensor (live mode: from request body; sim mode: from simulator)
  // In live mode, if no environment fields arrive, source becomes 'unavailable'.
  const rawEnv = rawReading.environment || null;
  let environment = null;
  if (rawEnv) {
    environment = {
      source:         rawEnv.source || 'rpi',
      air_temp_c:     rawEnv.air_temp_c     ?? rawEnv.env_temp_c     ?? null,
      humidity_pct:   rawEnv.humidity_pct   ?? rawEnv.env_humidity_pct ?? null,
      light_lux:      rawEnv.light_lux      ?? null,
      brightness_pct: rawEnv.brightness_pct ?? null,
    };
  } else if (mode === 'simulation') {
    // Generate realistic sim environment when no real sensor is present
    const hourOfDay = (Date.now() / 3_600_000) % 24;
    environment = {
      source:         'simulation',
      air_temp_c:     Number((22 + 4 * Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 3)).toFixed(1)),
      humidity_pct:   Number(Math.min(90, Math.max(50,
                        65 - 8 * Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 3)
                        + (Math.random() - 0.5) * 2
                      )).toFixed(1)),
      brightness_pct: Math.round(Math.min(95, Math.max(10,
                        55 + 35 * Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 2)
                      ))),
      light_lux:      null,
    };
  }
  // In live mode with no env data: environment stays null → snapshot marks source 'unavailable'

  // External weather — cached, refreshed every 10 minutes
  const externalWeather = await getWeatherCached(GREENHOUSE_ID);

  // System status
  // Prefer per-zone node_id (firmware sends it on every zone). Fall back to a
  // top-level node_id so older/simpler payloads still count as one node online.
  const nodeIds = new Set(rawZones.map(z => z.node_id).filter(Boolean));
  if (nodeIds.size === 0 && rawReading.node_id) nodeIds.add(rawReading.node_id);
  const nodeCount = rawReading.node_count || nodeIds.size;
  const system     = {
    rpi_online:         true,
    esp_nodes_online:   nodeCount,
    esp_nodes_expected: nodeCount,
    missing_nodes:      [],
    battery_status:     null,
  };

  return buildGreenhouseReadingSnapshot({
    greenhouseId: rawReading.greenhouse_id || GREENHOUSE_ID,
    mode,
    rawZones,
    environment,
    externalWeather,
    system,
    nodeCount,
    timestamp: rawReading.timestamp || new Date().toISOString(),
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.send("GreenMirror Pi API running");
});

// Receive ESP sensor data
app.post("/api/readings", async (req, res) => {
  console.log("📡 Received data from ESP:", JSON.stringify(req.body, null, 2));
  try {
    latestReading = await buildSnapshot(
      { ...req.body, timestamp: new Date().toISOString() },
      "live",
    );
    readingsHistory.push(latestReading);
    if (firestoreEnabled) saveReading(latestReading);
    console.log('[server] latestReadings write:', latestReading.greenhouse_id, '·', latestReading.zones.length, 'zones');
    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error('[server] Failed to build reading snapshot:', err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/latest", (req, res) => {
  const latest = USE_SIMULATION ? latestSystemState : latestReading;
  if (!latest) return res.status(404).json({ error: "No readings available" });
  res.json(latest);
});

app.get("/api/history", (req, res) => {
  res.json(readingsHistory);
});

// ─── Simulation mode ──────────────────────────────────────────────────────────

if (USE_SIMULATION) {
  const simulator = createSimulator({
    greenhouseId: GREENHOUSE_ID,
    analyzeZone,
    onSystemState: async (rawSystemState) => {
      try {
        const snapshot = await buildSnapshot(rawSystemState, "simulation");
        latestSystemState = snapshot;
        readingsHistory.push(snapshot);
        if (firestoreEnabled) saveReading(snapshot);
        console.log(
          `[sim] Snapshot built — ${snapshot.zones.length} zones · env: ${snapshot.environment.source}`,
          `· weather: ${snapshot.external_weather.temp_c !== null ? snapshot.external_weather.temp_c + '°C' : 'N/A'}`,
        );
      } catch (err) {
        console.error('[sim] Snapshot build failed:', err.message);
      }
    },
  });

  simulator.start();
  console.log(`Simulation mode ON; updating every ${UPDATE_INTERVAL_MS / 1000}s`);
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  const lan = getLanIp();
  console.log(`🚀 GreenMirror API ready`);
  console.log(`   Greenhouse: ${GREENHOUSE_ID}`);
  console.log(`   Local:      http://localhost:${PORT}`);
  console.log(`   Network:    http://${lan}:${PORT}`);
});
