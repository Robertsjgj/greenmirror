// Load .env FIRST — must happen before any other require() reads process.env
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const os = require("os");
const { createSimulator, UPDATE_INTERVAL_MS } = require("./simulator");
const { saveReading, firestoreEnabled } = require("./firestore");

function getLanIp() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

const app = express();
const PORT = process.env.PORT || 5000;
const USE_SIMULATION = process.env.USE_SIMULATION === "true";

// Open CORS — allows any origin (localhost, LAN IPs, phone browsers on same Wi-Fi).
// Fine for local/embedded use; tighten if this ever faces the public internet.
app.use(cors());

// allow JSON
app.use(express.json());

// in-memory storage for readings
let readingsHistory = [];
let latestReading = null;
let latestSystemState = null;

// basic zone analysis logic
function analyzeZone(zone) {
  const alerts = [];

  if (typeof zone.soil_moisture_pct === 'number') {
    if (zone.soil_moisture_pct < 30) alerts.push("too dry");
    if (zone.soil_moisture_pct > 80) alerts.push("too wet");
  }

  if (typeof zone.soil_temp_c === 'number' && zone.soil_temp_c < 10) {
    alerts.push("too cold");
  }

  return alerts;
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildEnvironment(input) {
  const source = input && typeof input === "object" ? input : {};
  const env = {
    air_temp_c: toFiniteNumber(source.air_temp_c ?? source.env_temp_c),
    humidity_pct: toFiniteNumber(source.humidity_pct ?? source.env_humidity_pct),
    light_lux: toFiniteNumber(source.light_lux),
    brightness_pct: toFiniteNumber(source.brightness_pct),
    source: source.source || "rpi"
  };

  const hasSensorValue = [
    env.air_temp_c,
    env.humidity_pct,
    env.light_lux,
    env.brightness_pct
  ].some((value) => typeof value === "number");

  if (!hasSensorValue) return null;
  return env;
}

function isOutsideZone(zone) {
  const id = String(zone.zone_id || "").toUpperCase();
  return id.includes("OUTDOOR") || id.includes("OUTSIDE") || id.includes("OUT");
}

function avg(values) {
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return null;
  return Number((nums.reduce((sum, value) => sum + value, 0) / nums.length).toFixed(1));
}

function buildSummary(zones) {
  const inside = zones.filter((zone) => !isOutsideZone(zone));
  const outside = zones.filter(isOutsideZone);

  return {
    avg_inside_soil_moisture_pct: avg(inside.map((zone) => zone.soil_moisture_pct)),
    avg_outside_soil_moisture_pct: avg(outside.map((zone) => zone.soil_moisture_pct)),
    avg_inside_soil_temp_c: avg(inside.map((zone) => zone.soil_temp_c)),
    avg_outside_soil_temp_c: avg(outside.map((zone) => zone.soil_temp_c))
  };
}

function enrichReading(reading, mode) {
  const simulationEnvironment = mode === "simulation"
    ? {
        air_temp_c: Number((21 + Math.sin(Date.now() / 3_600_000) * 3).toFixed(1)),
        humidity_pct: Number((62 + Math.cos(Date.now() / 2_700_000) * 8).toFixed(1)),
        brightness_pct: Math.max(15, Math.min(95, Number((60 + Math.sin(Date.now() / 1_800_000) * 30).toFixed(0)))),
        source: "rpi"
      }
    : null;
  const environment = buildEnvironment(reading.environment ?? reading)
    || simulationEnvironment;
  const enriched = {
    ...reading,
    mode,
    summary: buildSummary(reading.zones || []),
    ...(environment ? {
      environment,
      env_temp_c: environment.air_temp_c,
      env_humidity_pct: environment.humidity_pct
    } : {})
  };

  console.log("[Environment] Firestore environment object:", environment || "unavailable");
  return enriched;
}

// test route
app.get("/", (req, res) => {
  res.send("GreenMirror Pi API running");
});

// receive ESP data
app.post("/api/readings", (req, res) => {
  console.log("📡 Received data from ESP:");
  console.log(JSON.stringify(req.body, null, 2));

  const zones = Array.isArray(req.body.zones)
    ? req.body.zones.map((zone) => ({
        ...zone,
        alerts: analyzeZone(zone)
      }))
    : [];

  latestReading = enrichReading({
    ...req.body,
    zones,
    timestamp: new Date().toISOString()
  }, "real");

  readingsHistory.push(latestReading);

  // Write to Firestore if configured (non-blocking, non-fatal)
  if (firestoreEnabled) saveReading(latestReading);

  res.status(200).json({ status: "ok" });
});

app.get("/api/latest", (req, res) => {
  const latest = USE_SIMULATION ? latestSystemState : latestReading;

  if (!latest) {
    return res.status(404).json({ error: "No readings available" });
  }

  res.json(latest);
});

app.get("/api/history", (req, res) => {
  res.json(readingsHistory);
});

if (USE_SIMULATION) {
  const simulator = createSimulator({
    analyzeZone,
    onSystemState: (systemState) => {
      // Simulated ticks behave like incoming ESP readings and are kept in history.
      const enrichedSystemState = enrichReading(systemState, "simulation");
      latestSystemState = enrichedSystemState;
      readingsHistory.push(enrichedSystemState);
      if (firestoreEnabled) saveReading(enrichedSystemState);
      console.log(
        `Simulated ${enrichedSystemState.node_count} nodes / ${enrichedSystemState.zone_count} zones at ${enrichedSystemState.timestamp}`
      );
    }
  });

  simulator.start();
  console.log(`Simulation mode ON; updating every ${UPDATE_INTERVAL_MS / 1000}s`);
}

app.listen(PORT, "0.0.0.0", () => {
  const lan = getLanIp();
  console.log(`🚀 GreenMirror API ready`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${lan}:${PORT}`);
  console.log(`   Frontend on the same machine will auto-detect http://${lan}:5174`);
});
