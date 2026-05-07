const GREENHOUSE_ID = "greenmirror-demo";
const NODE_COUNT = 15;
const UPDATE_INTERVAL_MS = 5000;

function padNodeNumber(index) {
  return String(index + 1).padStart(2, "0");
}

function createInitialNodes() {
  return Array.from({ length: NODE_COUNT }, (_, index) => {
    const zoneCount = index % 3 === 0 ? 2 : 1;

    return {
      node_id: `esp32-node-${padNodeNumber(index)}`,
      greenhouse_id: GREENHOUSE_ID,
      zones: Array.from({ length: zoneCount }, (__, zoneIndex) => {
        const baseMoisture = 35 + ((index * 7 + zoneIndex * 13) % 45);
        const baseTemp = 16 + ((index * 3 + zoneIndex * 4) % 12);

        return {
          zone_id: `zone-${padNodeNumber(index)}-${zoneIndex + 1}`,
          soil_moisture_raw: moisturePctToRaw(baseMoisture),
          soil_moisture_pct: baseMoisture,
          soil_temp_c: baseTemp,
          soil_temp_status: "ok"
        };
      })
    };
  });
}

function moisturePctToRaw(moisturePct) {
  // Match a common ESP capacitive sensor scale: wetter soil means lower raw ADC.
  return Math.round(4095 - moisturePct * 30);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateZone(zone, tick, nodeIndex, zoneIndex) {
  const moistureWave = Math.sin((tick + nodeIndex * 2 + zoneIndex) / 4) * 3;
  const tempWave = Math.cos((tick + nodeIndex + zoneIndex * 2) / 5) * 0.8;
  const dryingDrift = tick % 6 === 0 ? -1 : 0;

  const soilMoisturePct = clamp(
    Math.round(zone.soil_moisture_pct + moistureWave + dryingDrift),
    12,
    92
  );
  const soilTempC = Number(clamp(zone.soil_temp_c + tempWave, 6, 34).toFixed(1));

  return {
    ...zone,
    soil_moisture_raw: moisturePctToRaw(soilMoisturePct),
    soil_moisture_pct: soilMoisturePct,
    soil_temp_c: soilTempC,
    soil_temp_status: soilTempC < 10 ? "cold" : "ok"
  };
}

function createSimulator({ analyzeZone, onSystemState }) {
  let tick = 0;
  let nodes = createInitialNodes();
  let interval = null;

  const buildSystemState = () => {
    tick += 1;
    const timestamp = new Date().toISOString();

    nodes = nodes.map((node, nodeIndex) => ({
      ...node,
      zones: node.zones.map((zone, zoneIndex) => {
        const updatedZone = updateZone(zone, tick, nodeIndex, zoneIndex);

        return {
          ...updatedZone,
          alerts: analyzeZone(updatedZone)
        };
      })
    }));

    const zones = nodes.flatMap((node) =>
      node.zones.map((zone) => ({
        ...zone,
        node_id: node.node_id,
        greenhouse_id: node.greenhouse_id
      }))
    );

    return {
      mode: "simulation",
      greenhouse_id: GREENHOUSE_ID,
      node_count: nodes.length,
      zone_count: zones.length,
      nodes,
      zones,
      timestamp
    };
  };

  const start = () => {
    const publish = () => onSystemState(buildSystemState());

    publish();
    interval = setInterval(publish, UPDATE_INTERVAL_MS);
  };

  const stop = () => {
    if (interval) clearInterval(interval);
  };

  return { start, stop };
}

module.exports = {
  createSimulator,
  UPDATE_INTERVAL_MS
};
