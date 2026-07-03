// Load .env defensively — the bootstrap (index.js) loads it first, but server.js
// also reads process.env at import time, so loading it here too means requiring
// this module directly still works. Resolved from this file's own directory (not
// process.cwd()) so the same raspberry-pi/.env is used regardless of cwd.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require("express");
const cors    = require("cors");
const os      = require("os");

const { createSimulator, UPDATE_INTERVAL_MS } = require("./simulator");
const { saveReading, firestoreEnabled }        = require("./firestore");
const { buildGreenhouseReadingSnapshot }        = require("./snapshot");
const { getWeatherCached }                      = require("./weather");
const { recordNodeReading, NODE_STALE_TIMEOUT_MS } = require("./aggregator");

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

// Receive ESP sensor data.
//
// Multiple ESP nodes POST independently, each with its own 1–2 zones. Rather than
// overwrite latestReadings with the last node to post, we merge the latest zones
// from every ACTIVE node into one snapshot per greenhouse (see aggregator.js), so
// the dashboard shows all beds. The POST payload format is unchanged.
app.post("/api/readings", async (req, res) => {
  try {
    const body         = req.body || {};
    const greenhouseId = body.greenhouse_id || GREENHOUSE_ID;
    const rawZones     = Array.isArray(body.zones) ? body.zones : [];
    const nodeId       = body.node_id
      || (rawZones.find(z => z && z.node_id) || {}).node_id
      || "unknown-node";

    console.log(`📡 Received from node: ${nodeId} · ${rawZones.length} zone(s) · greenhouse ${greenhouseId}`);

    // Merge this node's zones with all other currently-active nodes.
    const agg = recordNodeReading({
      greenhouseId,
      nodeId,
      zones: rawZones,
      environment: body.environment || null,
    });

    // Warn on zone_id collisions between active nodes (their beds would overlap).
    for (const dup of agg.duplicateZoneIds) {
      console.warn(
        `[aggregator] ⚠️  duplicate zone_id "${dup.zone_id}" reported by nodes [${dup.nodes.join(', ')}] — ` +
        `these beds collide on the dashboard. Give each ESP unique zone IDs.`,
      );
    }

    // Build the combined snapshot from ALL active nodes' zones.
    latestReading = await buildSnapshot(
      {
        greenhouse_id: greenhouseId,
        zones:         agg.combinedZones,
        environment:   agg.environment,
        node_count:    agg.activeNodeCount,
        timestamp:     new Date().toISOString(),
      },
      "live",
    );
    readingsHistory.push(latestReading);
    if (firestoreEnabled) saveReading(latestReading);

    console.log(
      `[aggregator] active nodes=${agg.activeNodeCount} [${agg.activeNodeIds.join(', ')}] · ` +
      `combined zones=${agg.combinedZones.length}` +
      (agg.staleRemoved.length
        ? ` · stale removed=${agg.staleRemoved.length} [${agg.staleRemoved.join(', ')}]`
        : ''),
    );
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

// Start the API server. Called by the app bootstrap (index.js) — this module no
// longer listens on require, so startup orchestration (backend + provisioning +
// future services) lives in one place without changing any API logic above.
function start() {
  return app.listen(PORT, "0.0.0.0", () => {
    const lan = getLanIp();
    console.log(`🚀 GreenMirror API ready`);
    console.log(`   Greenhouse: ${GREENHOUSE_ID}`);
    console.log(`   Local:      http://localhost:${PORT}`);
    console.log(`   Network:    http://${lan}:${PORT}`);
    console.log(`   Multi-node: merging active ESP nodes; stale after ${NODE_STALE_TIMEOUT_MS / 1000}s`);
  });
}

module.exports = { app, start };
