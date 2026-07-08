/**
 * Mock / sample data for charts.
 *
 * While the real Firebase pipeline is being finished, charts default to this
 * sample data so the UI is never blank. It is always clearly labelled as
 * sample data in the UI (see useDataMode + the "Sample" badges).
 *
 * Design goal: the mock must look like REAL sensor data, not a smooth synthetic
 * curve. Real readings are discrete samples taken at specific times, and soil
 * moisture follows a saw-tooth: it dries down gradually, then jumps back up when
 * a zone is watered. So instead of a pre-bucketed line, we generate a full mock
 * greenhouse — zones, plants, discrete-time raw readings, and watering events —
 * that flows through the SAME buildTrendData / buildGreenhouseModel pipeline as
 * real data. Every Trends view (Overview / Zones / Plants / Watering) and the
 * Home preview therefore render identically whether the data is mock or real.
 */

import type { TimeRange } from './hooks/useReadingsHistory';
import type { LatestReading, VisualZone, ZoneReading } from './zoneLayout';
import type { PlantProfile } from './plantProfiles';
import type { ActivityEntry } from './activityLog';
import { getZoneArea, getZoneDisplayName } from './zoneRegistry';

const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface MockDataset {
  zones: VisualZone[];
  profilesById: Map<string, PlantProfile>;
  plantProfiles: PlantProfile[];
  readings: LatestReading[];
  wateringEvents: ActivityEntry[];
}

// ─── Static greenhouse definition ─────────────────────────────────────────────

const MOCK_PLANTS: PlantProfile[] = [
  { id: 'tomato',  name: 'Tomato',  icon: '🍅', moistureMin: 40, moistureMax: 70, soilTempMin: 15, soilTempMax: 30, isDefault: true },
  { id: 'lettuce', name: 'Lettuce', icon: '🥬', moistureMin: 50, moistureMax: 75, soilTempMin: 10, soilTempMax: 24, isDefault: true },
  { id: 'pepper',  name: 'Pepper',  icon: '🌶️', moistureMin: 40, moistureMax: 65, soilTempMin: 16, soilTempMax: 30, isDefault: true },
  { id: 'carrot',  name: 'Carrot',  icon: '🥕', moistureMin: 35, moistureMax: 60, soilTempMin: 8,  soilTempMax: 24, isDefault: true },
];

interface ZoneDef { id: string; plant: string | null; }

// Canonical zone IDs (see zoneRegistry). Display names come from the registry.
const MOCK_ZONE_DEFS: ZoneDef[] = [
  { id: 'SYD-INSIDE-LEFT-01',   plant: 'tomato'  },
  { id: 'SYD-INSIDE-LEFT-02',   plant: 'tomato'  },
  { id: 'SYD-INSIDE-LEFT-03',   plant: 'lettuce' },
  { id: 'SYD-INSIDE-CENTER-01', plant: 'pepper'  },
  { id: 'SYD-INSIDE-CENTER-02', plant: 'pepper'  },
  { id: 'SYD-INSIDE-CENTER-03', plant: 'lettuce' },
  { id: 'SYD-INSIDE-RIGHT-01',  plant: 'carrot'  },
  { id: 'SYD-INSIDE-RIGHT-02',  plant: 'carrot'  },
  { id: 'SYD-OUTSIDE-01',       plant: 'tomato'  },
  { id: 'SYD-OUTSIDE-02',       plant: null      },
];

const zoneLabel = (id: string) => getZoneDisplayName(id);
const isOutdoor = (id: string) => getZoneArea(id) === 'outside';

// Per-zone physics parameters, derived deterministically from the index so the
// dataset is stable across re-renders and across ranges.
function zoneParams(i: number, plant: PlantProfile | null) {
  const high = (plant ? plant.moistureMax : 70) - 2;          // moisture right after watering
  const dryRatePerH = 0.45 + (i % 4) * 0.08;                  // %/hour dry-down
  const intervalH = 36 + (i % 3) * 18;                        // watering cadence (36/54/72h)
  const phase = (i * 7.3) % intervalH;                       // stagger watering across zones
  return { high, dryRatePerH, intervalH, phase };
}

// Most recent watering time at/just before t for a given zone cadence.
function lastWaterBefore(t: number, intervalH: number, phaseH: number): number {
  const interval = intervalH * HOUR;
  const phase = phaseH * HOUR;
  const k = Math.floor((t - phase) / interval);
  return k * interval + phase;
}

function moistureAt(t: number, i: number, p: ReturnType<typeof zoneParams>): number {
  const lastWater = lastWaterBefore(t, p.intervalH, p.phase);
  const hoursSince = (t - lastWater) / HOUR;
  let m = p.high - p.dryRatePerH * hoursSince;
  // Gentle non-repeating noise so lines aren't perfectly straight between waterings.
  m += 1.6 * Math.sin(t / (5.5 * HOUR) + i);
  return Math.max(8, Math.min(96, Math.round(m * 10) / 10));
}

function soilTempAt(t: number, i: number, outdoor: boolean): number {
  const hod = (t / HOUR) % 24;
  const base = outdoor ? 15 : 20;
  const swing = outdoor ? 6 : 3;
  const v = base + swing * Math.sin((hod / 24) * 2 * Math.PI - Math.PI / 2) + (i % 3) * 0.4;
  return Math.round(v * 10) / 10;
}

function ambientAt(t: number): { air: number; hum: number } {
  const hod = (t / HOUR) % 24;
  const air = 22 + 4 * Math.sin((hod / 24) * 2 * Math.PI - Math.PI / 3);
  const hum = 62 - 8 * Math.sin((hod / 24) * 2 * Math.PI - Math.PI / 3);
  return { air: Math.round(air * 10) / 10, hum: Math.round(hum) };
}

// ─── Sampling cadence per range (discrete reading timestamps) ─────────────────
const RANGE_SPAN: Record<TimeRange, number> = {
  '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '3m': 90 * DAY, '1y': 365 * DAY,
};
const RANGE_SAMPLES: Record<TimeRange, number> = {
  '24h': 48, '7d': 168, '30d': 180, '3m': 180, '1y': 240,
};

// ─── Dataset builder ──────────────────────────────────────────────────────────

let cache: { range: TimeRange; at: number; data: MockDataset } | null = null;

/**
 * Build a self-consistent mock greenhouse for the given range. Cached briefly so
 * repeated reads within a screen are cheap while still refreshing "now".
 */
export function genMockDataset(range: TimeRange, greenhouseId = 'sample-greenhouse'): MockDataset {
  const now = Date.now();
  if (cache && cache.range === range && now - cache.at < 60_000) return cache.data;

  const profilesById = new Map<string, PlantProfile>();
  MOCK_PLANTS.forEach((p) => profilesById.set(p.id, p));

  const params = MOCK_ZONE_DEFS.map((z, i) => zoneParams(i, z.plant ? profilesById.get(z.plant) ?? null : null));

  // Current snapshot zones (values at "now") — drive the Zones/Plants/health views.
  const zones: VisualZone[] = MOCK_ZONE_DEFS.map((z, i) => {
    const moisture = moistureAt(now, i, params[i]);
    const temp = soilTempAt(now, i, isOutdoor(z.id));
    return {
      id: z.id,
      visualLabel: z.id,
      displayLabel: zoneLabel(z.id),
      rowLabel: isOutdoor(z.id) ? 'Outdoor' : 'Greenhouse',
      rowIndex: i,
      section: i,
      backendZoneId: z.id,
      greenhouseId,
      soilMoistureRaw: null,
      soilMoisturePct: moisture,
      soilTempC: temp,
      soilTempStatus: 'ok',
      alerts: [],
      timestamp: new Date(now).toISOString(),
      hasReading: true,
      assignedPlant: z.plant,
    };
  });

  // Discrete raw readings across the window — last sample lands exactly on "now"
  // so snapshot values above match the end of the time series.
  const span = RANGE_SPAN[range];
  const N = RANGE_SAMPLES[range];
  const step = span / (N - 1);
  const readings: LatestReading[] = [];
  for (let s = 0; s < N; s++) {
    const t = now - (N - 1 - s) * step;
    const zoneReadings: ZoneReading[] = MOCK_ZONE_DEFS.map((z, i) => ({
      zone_id: z.id,
      zone_name: zoneLabel(z.id),
      location_type: isOutdoor(z.id) ? 'outside' : 'inside',
      soil_moisture_pct: moistureAt(t, i, params[i]),
      soil_temp_c: soilTempAt(t, i, isOutdoor(z.id)),
    }));
    const amb = ambientAt(t);
    readings.push({
      greenhouse_id: greenhouseId,
      timestamp: new Date(t).toISOString(),
      zones: zoneReadings,
      environment: { source: 'simulation', air_temp_c: amb.air, humidity_pct: amb.hum },
      external_weather: { source: 'Open-Meteo', temp_c: Math.round((amb.air - 2) * 10) / 10, humidity_pct: amb.hum + 5 },
      env_temp_c: amb.air,
      env_humidity_pct: amb.hum,
    });
  }

  // Watering events across the last year (independent of range) so the watering
  // heatmap / monthly views are populated. Each event matches a moisture jump.
  const wateringEvents: ActivityEntry[] = [];
  const evStart = now - 365 * DAY;
  MOCK_ZONE_DEFS.forEach((z, i) => {
    const p = params[i];
    const plant = z.plant ? profilesById.get(z.plant) ?? null : null;
    const interval = p.intervalH * HOUR;
    let wt = lastWaterBefore(now, p.intervalH, p.phase);
    let k = 0;
    while (wt >= evStart) {
      wateringEvents.push({
        id: `mock-water-${z.id}-${k}`,
        type: 'watering',
        greenhouseId,
        visualZoneId: z.id,
        backendZoneId: z.id,
        plantName: plant?.name,
        amountMl: 200 + (k % 3) * 80,
        message: `Watered ${zoneLabel(z.id)}${plant ? ` (${plant.name})` : ''}`,
        timestamp: new Date(wt).toISOString(),
        source: k % 4 === 0 ? 'manual' : 'system',
      });
      wt -= interval;
      k++;
    }
  });
  wateringEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const data: MockDataset = { zones, profilesById, plantProfiles: MOCK_PLANTS, readings, wateringEvents };
  cache = { range, at: now, data };
  return data;
}
