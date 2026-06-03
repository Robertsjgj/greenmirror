/**
 * Client-side simulation service for GreenMirror.
 *
 * Generates realistic fake greenhouse readings without any hardware.
 * Used by SimulationContext to drive all app features during
 * testing / demo / research before full hardware deployment.
 *
 * Physics:
 *  - Soil moisture dries at ~0.6% / tick (1 tick = 5 real seconds ≈ 5 sim-minutes)
 *  - Auto-watering fires when moisture < 18% → jumps to 50-70%
 *  - Soil temp follows a 24-hr sine wave with per-zone phase offsets
 */

import type { LatestReading, ZoneReading } from '../zoneLayout';

// ─── Zone IDs ─────────────────────────────────────────────────────────────────
// Mirrors the SYDNEY_BEDS IDs so mapZonesToSydneyLayout() maps them correctly.

const SYDNEY_ZONE_IDS: string[] = [
  'SYD-OUTDOOR-01', 'SYD-OUTDOOR-02', 'SYD-OUTDOOR-03', 'SYD-OUTDOOR-04',
  'SYD-OUTDOOR-05', 'SYD-OUTDOOR-06', 'SYD-OUTDOOR-07', 'SYD-OUTDOOR-08',
  'SYD-OUTDOOR-09', 'SYD-OUTDOOR-10',
  'SYD-GH-LEFT-01', 'SYD-GH-LEFT-02', 'SYD-GH-LEFT-03', 'SYD-GH-LEFT-04',
  'SYD-GH-LEFT-05', 'SYD-GH-LEFT-06', 'SYD-GH-LEFT-07', 'SYD-GH-LEFT-08',
  'SYD-GH-LEFT-09', 'SYD-GH-LEFT-10', 'SYD-GH-LEFT-11',
  'SYD-GH-MID-01',  'SYD-GH-MID-02',  'SYD-GH-MID-03',
  'SYD-GH-MID-04',  'SYD-GH-MID-05',  'SYD-GH-MID-06',
  'SYD-GH-RIGHT-01','SYD-GH-RIGHT-02','SYD-GH-RIGHT-03',
  'SYD-CORN-01',
  'SYD-PUMPKIN-01', 'SYD-PUMPKIN-02',
  'SYD-SHED-BED-01',
];

const TRURO_ZONE_IDS: string[] = [
  'TRU-POLY-01', 'TRU-POLY-02', 'TRU-POLY-03', 'TRU-POLY-04',
  'TRU-BED-01',  'TRU-BED-02',  'TRU-BED-03',  'TRU-BED-04',
  'TRU-BED-05',  'TRU-BED-06',  'TRU-BED-07',  'TRU-BED-08',
];

export function getSimZoneIds(mapKind: string): string[] {
  return mapKind === 'truro' ? TRURO_ZONE_IDS : SYDNEY_ZONE_IDS;
}

// ─── Zone simulation state ────────────────────────────────────────────────────

export interface ZoneSimState {
  moisture: number;  // 0-100 %
  temp: number;      // °C
  phase: number;     // per-zone temperature phase offset (0 – 2π)
}

export function initZoneStates(zoneIds: string[]): Map<string, ZoneSimState> {
  const states = new Map<string, ZoneSimState>();
  zoneIds.forEach((id, i) => {
    states.set(id, {
      // Spread initial moistures across zones so the chart has variety
      moisture: 30 + (i % 8) * 7 + Math.random() * 4,
      temp: 18 + (i % 4) * 1.5 + Math.random() * 1.5,
      phase: (i / zoneIds.length) * 2 * Math.PI,
    });
  });
  return states;
}

// ─── Physics tick ─────────────────────────────────────────────────────────────

const DRYING_RATE = 0.55;   // % moisture lost per tick
const BASE_TEMP   = 19;     // °C mean soil temp
const TEMP_SWING  = 4;      // ±°C daily swing amplitude

export function tickStates(
  states: Map<string, ZoneSimState>,
  nowMs: number,
): void {
  const hourOfDay = (nowMs / 3_600_000) % 24;
  // Coolest at 06:00, warmest at 18:00
  const tempBase = BASE_TEMP + TEMP_SWING * 0.5 * Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 2);

  states.forEach((s) => {
    // Dry out
    s.moisture = Math.max(6, s.moisture - DRYING_RATE);

    // Auto-water when critically dry
    if (s.moisture < 18) {
      s.moisture = 50 + Math.random() * 20;
    }

    // Temperature: base wave + per-zone offset + noise
    s.temp = parseFloat(
      (tempBase + 2 * Math.sin(s.phase) + (Math.random() - 0.5) * 0.5).toFixed(1),
    );
  });
}

// ─── Build a LatestReading snapshot ──────────────────────────────────────────

const isGHZone = (id: string) => {
  const u = id.toUpperCase();
  return u.startsWith('GH') || u.includes('-GH-');
};

export function buildReading(
  ghId: string,
  zoneIds: string[],
  states: Map<string, ZoneSimState>,
  timestamp: Date,
): LatestReading {
  const zones: ZoneReading[] = zoneIds.map((id) => {
    const s = states.get(id) ?? { moisture: 40, temp: 19, phase: 0 };
    return {
      zone_id: id,
      node_id: `sim-node-${id}`,
      greenhouse_id: ghId,
      soil_moisture_pct: parseFloat(s.moisture.toFixed(1)),
      soil_moisture_raw: Math.round(4095 - (s.moisture / 100) * 3000),
      soil_temp_c: s.temp,
      soil_temp_status: s.temp < 10 ? 'cold' : s.temp > 35 ? 'hot' : 'ok',
    };
  });

  // Simulate RPi ambient air sensor (peaks mid-afternoon, lowest overnight)
  const hourOfDay = (timestamp.getTime() / 3_600_000) % 24;
  const envTempC = parseFloat((
    23 + 3 * Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 3)
    + (Math.random() - 0.5) * 0.4
  ).toFixed(1));
  // Humidity inversely correlated with temp
  const envHumidityPct = parseFloat(Math.min(90, Math.max(50,
    68 - 8 * Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 3)
    + (Math.random() - 0.5) * 2
  )).toFixed(1));

  // Only emit env readings if the layout has inside-greenhouse zones
  const hasGHZones = zoneIds.some(isGHZone);

  return {
    greenhouse_id: ghId,
    timestamp: timestamp.toISOString(),
    mode: 'simulation',
    zone_count: zones.length,
    zones,
    ...(hasGHZones ? { env_temp_c: envTempC, env_humidity_pct: envHumidityPct } : {}),
  };
}

// ─── Manual zone watering ─────────────────────────────────────────────────────

/**
 * Immediately boost a zone's moisture as if manually watered.
 * Called by SimulationContext.waterSimZone when a user waters in sim mode.
 */
export function waterZoneState(
  states: Map<string, ZoneSimState>,
  zoneId: string,
  targetMoisture = 68,
): void {
  const s = states.get(zoneId);
  if (s) {
    s.moisture = Math.min(100, targetMoisture + Math.random() * 8);
  }
}

// ─── History seed ─────────────────────────────────────────────────────────────

const HISTORY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between readings

/**
 * Generate `hours` worth of fake historical readings, working forward
 * from (now - hours) to now.  Returns the reading array and the final
 * states so the live ticker can continue seamlessly from that point.
 */
export function generateHistory(
  ghId: string,
  zoneIds: string[],
  hours: number,
): { readings: LatestReading[]; finalStates: Map<string, ZoneSimState> } {
  const now    = Date.now();
  const startMs = now - hours * 3_600_000;
  const steps  = Math.floor((now - startMs) / HISTORY_INTERVAL_MS);

  const states = initZoneStates(zoneIds);
  const readings: LatestReading[] = [];

  for (let i = 0; i < steps; i++) {
    const ts = new Date(startMs + i * HISTORY_INTERVAL_MS);
    tickStates(states, ts.getTime());
    readings.push(buildReading(ghId, zoneIds, states, ts));
  }

  return { readings, finalStates: states };
}
