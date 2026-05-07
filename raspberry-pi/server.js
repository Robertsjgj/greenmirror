const express = require("express");
const cors = require("cors");
const { createSimulator, UPDATE_INTERVAL_MS } = require("./simulator");

const app = express();
const PORT = process.env.PORT || 5000;
const USE_SIMULATION = process.env.USE_SIMULATION === "true";

// enable CORS for mobile app requests
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

  latestReading = {
    ...req.body,
    mode: "real",
    zones,
    timestamp: new Date().toISOString()
  };

  readingsHistory.push(latestReading);

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
      latestSystemState = systemState;
      readingsHistory.push(systemState);
      console.log(
        `Simulated ${systemState.node_count} nodes / ${systemState.zone_count} zones at ${systemState.timestamp}`
      );
    }
  });

  simulator.start();
  console.log(`Simulation mode ON; updating every ${UPDATE_INTERVAL_MS / 1000}s`);
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
