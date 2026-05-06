const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

// enable CORS for mobile app requests
app.use(cors());

// allow JSON
app.use(express.json());

// in-memory storage for readings
let readingsHistory = [];
let latestReading = null;

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
    zones,
    timestamp: new Date().toISOString()
  };

  readingsHistory.push(latestReading);

  res.status(200).json({ status: "ok" });
});

app.get("/api/latest", (req, res) => {
  if (!latestReading) {
    return res.status(404).json({ error: "No readings available" });
  }

  res.json(latestReading);
});

app.get("/api/history", (req, res) => {
  res.json(readingsHistory);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});