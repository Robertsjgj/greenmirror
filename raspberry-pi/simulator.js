'use strict';

/**
 * Hardware simulator — runs inside server.js when USE_SIMULATION=true.
 *
 * Zone IDs use the canonical scheme (must match the frontend zone registry):
 *   SYD-INSIDE-LEFT/CENTER/RIGHT-NN — inside greenhouse zones
 *   SYD-OUTSIDE-NN                  — outside / garden zones
 *
 * The first 5 inside nodes with index % 3 === 0 get 2 zones each.
 */

const UPDATE_INTERVAL_MS = 5000;

function padNum(n) {
  return String(n).padStart(2, '0');
}

// Canonical zone-ID pools (kept in sync with mobile-app/src/zoneRegistry.ts).
const INSIDE_ZONE_IDS = [
  ...Array.from({ length: 11 }, (_, i) => `SYD-INSIDE-LEFT-${padNum(i + 1)}`),
  ...Array.from({ length: 6 },  (_, i) => `SYD-INSIDE-CENTER-${padNum(i + 1)}`),
  ...Array.from({ length: 3 },  (_, i) => `SYD-INSIDE-RIGHT-${padNum(i + 1)}`),
];
const OUTSIDE_ZONE_IDS = Array.from({ length: 10 }, (_, i) => `SYD-OUTSIDE-${padNum(i + 1)}`);

function moisturePctToRaw(pct) {
  // Capacitive sensor: wetter = lower ADC value
  return Math.round(4095 - pct * 30);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Build the initial node/zone list.
 * Nodes 0–9  → inside  (canonical SYD-INSIDE-* IDs)
 * Nodes 10–14 → outside (canonical SYD-OUTSIDE-* IDs)
 * Zone IDs are drawn in order from the canonical pools so each maps 1:1 to a
 * registry bed (no duplicates).
 */
function createInitialNodes(greenhouseId) {
  const NODE_COUNT = 15;
  let insideIdx = 0;
  let outsideIdx = 0;

  return Array.from({ length: NODE_COUNT }, (_, i) => {
    const isOutside = i >= 10;

    // Two zones for every third node, one for the rest
    const zoneCount = i % 3 === 0 ? 2 : 1;

    return {
      node_id:       `esp32-node-${padNum(i + 1)}`,
      greenhouse_id: greenhouseId,
      zones: Array.from({ length: zoneCount }, (__, zi) => {
        const baseMoisture = 35 + ((i * 7 + zi * 13) % 45);
        const baseTemp     = 16 + ((i * 3 + zi * 4)  % 12);
        const zoneId = isOutside
          ? OUTSIDE_ZONE_IDS[outsideIdx++ % OUTSIDE_ZONE_IDS.length]
          : INSIDE_ZONE_IDS[insideIdx++ % INSIDE_ZONE_IDS.length];

        return {
          zone_id:           zoneId,
          zone_name:         zoneId,
          soil_moisture_raw: moisturePctToRaw(baseMoisture),
          soil_moisture_pct: baseMoisture,
          soil_temp_c:       baseTemp,
          soil_temp_status:  'ok',
        };
      }),
    };
  });
}

function updateZone(zone, tick, nodeIndex, zoneIndex) {
  const moistureWave  = Math.sin((tick + nodeIndex * 2 + zoneIndex) / 4) * 3;
  const tempWave      = Math.cos((tick + nodeIndex + zoneIndex * 2) / 5) * 0.8;
  const dryingDrift   = tick % 6 === 0 ? -1 : 0;

  const moisture = clamp(
    Math.round(zone.soil_moisture_pct + moistureWave + dryingDrift),
    12, 92,
  );
  const temp = Number(clamp(zone.soil_temp_c + tempWave, 6, 34).toFixed(1));

  return {
    ...zone,
    soil_moisture_raw: moisturePctToRaw(moisture),
    soil_moisture_pct: moisture,
    soil_temp_c:       temp,
    soil_temp_status:  temp < 10 ? 'cold' : 'ok',
  };
}

/**
 * @param {object} opts
 * @param {string}   [opts.greenhouseId]   defaults to 'sydney-greenhouse'
 * @param {Function} opts.analyzeZone      zone → string[]
 * @param {Function} opts.onSystemState    async (systemState) => void
 */
function createSimulator({ greenhouseId = 'sydney-greenhouse', analyzeZone, onSystemState }) {
  let tick  = 0;
  let nodes = createInitialNodes(greenhouseId);
  let interval = null;

  const buildSystemState = () => {
    tick += 1;
    const timestamp = new Date().toISOString();

    nodes = nodes.map((node, ni) => ({
      ...node,
      zones: node.zones.map((zone, zi) => {
        const updated = updateZone(zone, tick, ni, zi);
        return { ...updated, alerts: analyzeZone(updated) };
      }),
    }));

    const zones = nodes.flatMap((node) =>
      node.zones.map((zone) => ({
        ...zone,
        node_id:       node.node_id,
        greenhouse_id: node.greenhouse_id,
      })),
    );

    return {
      greenhouse_id: greenhouseId,
      node_count:    nodes.length,
      zone_count:    zones.length,
      nodes,
      zones,
      timestamp,
      // environment is NOT set here — server.js buildSnapshot generates it
      // so that the same logic applies to both live and simulation modes.
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

module.exports = { createSimulator, UPDATE_INTERVAL_MS };
