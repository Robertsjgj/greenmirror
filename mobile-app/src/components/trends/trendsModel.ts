/* ──────────────────────────────────────────────────────────────────────────
   trendsModel.ts — real-data adapter for the Trends redesign.

   Reproduces the prototype's `GM` data API (zone/plant series, current
   readings, watering aggregates) but sourced from REAL app data:
   live/sim readings history, zone assignments, plant profiles and the
   watering activity log. No mock/fabricated values.
   ────────────────────────────────────────────────────────────────────────── */

import type { VisualZone, LatestReading } from '../../zoneLayout';
import type { PlantProfile } from '../../plantProfiles';
import type { ActivityEntry } from '../../activityLog';
import type { TimeRange } from '../../hooks/useReadingsHistory';

const D = 86_400_000;

// ── Public shapes ──────────────────────────────────────────────────────────
export interface PlantLite {
  id: string;
  name: string;
  icon: string;
  moistureMin: number;
  moistureMax: number;
}

export interface ZoneLite {
  label: string;        // display label (e.g. "GH Left 06")
  backendId: string;    // sensor zone id (e.g. "SYD-GH-LEFT-06")
  visualLabel: string;  // visual label used by activity log
  plantId: string | null;
  indoor: boolean;
}

export interface SeriesPoint {
  t: number;
  label: string;
  tick: boolean;
  moisture: number;
  temp: number | null;
}

export interface CurrentReading {
  moisture: number;
  temp: number | null;
  plant: PlantLite | null;
  lastWater: number | null;
}

export interface MoistureStatus {
  label: string;
  color: string;
  tone: 'crit' | 'dry' | 'wet' | 'good';
}

export interface WateringEvt {
  id: string;
  zoneId: string;
  zoneLabel: string;
  plantName: string | null;
  t: number;
  amountMl: number;
}

export interface HeatCell {
  t: number; ml: number; n: number; level: number; future: boolean; date: string;
}
export interface HeatmapData { weeks: HeatCell[][]; monthCols: string[]; }

export interface ZoneWaterAgg {
  zoneId: string; label: string; plantName: string | null; n: number; ml: number; last: number;
}

export interface WateringStats {
  total: number; vol: number; thisWeek: number; lastWeek: number;
  longestGap: number; mostActive: { label: string; n: number }; activeDays: number; avgInterval: number;
}

export type MonthBar = { label: string; ml: number; n: number; [k: string]: number | string };

export interface GreenhouseModel {
  NOW: number;
  PLANTS: PlantLite[];
  PLANT_BY_ID: Record<string, PlantLite>;
  ZONES: ZoneLite[];
  ZONE_BY_ID: Record<string, ZoneLite>;
  SERIES_COLORS: string[];
  hasHistory: boolean;
  readingCount: number;
  genZoneSeries: (z: ZoneLite, range: TimeRange) => SeriesPoint[];
  genPlantSeries: (plantId: string, range: TimeRange) => SeriesPoint[];
  genGreenhouseSeries: (range: TimeRange) => SeriesPoint[];
  currentReading: (z: ZoneLite) => CurrentReading;
  WATERING: WateringEvt[];
  buildHeatmap: () => HeatmapData;
  buildMonthly: () => MonthBar[];
  wateringStats: () => WateringStats;
  wateringByZone: () => ZoneWaterAgg[];
}

// Distinct, harmonious overlay palette (matches prototype)
const SERIES_COLORS = ['#0ea5e9', '#16a34a', '#f59e0b', '#a855f7', '#ef4444',
                       '#14b8a6', '#ec4899', '#6366f1', '#84cc16', '#f97316'];

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WD_SHORT    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const r1 = (v: number) => Math.round(v * 10) / 10;

// ── Pure status + time helpers (used across charts + views) ─────────────────
export function moistureStatus(m: number, plant: PlantLite | null): MoistureStatus {
  if (plant) {
    if (m < plant.moistureMin * 0.7) return { label: 'Critical', color: '#ef4444', tone: 'crit' };
    if (m < plant.moistureMin)        return { label: 'Dry',      color: '#f59e0b', tone: 'dry'  };
    if (m > plant.moistureMax)        return { label: 'Too wet',  color: '#0ea5e9', tone: 'wet'  };
    return { label: 'Good', color: '#16a34a', tone: 'good' };
  }
  if (m < 15) return { label: 'Critical', color: '#ef4444', tone: 'crit' };
  if (m < 25) return { label: 'Dry',      color: '#f59e0b', tone: 'dry'  };
  if (m > 80) return { label: 'Too wet',  color: '#0ea5e9', tone: 'wet'  };
  return { label: 'Good', color: '#16a34a', tone: 'good' };
}

export function relTime(t: number, now: number = Date.now()): string {
  const diff = now - t, m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ── Bucketing ───────────────────────────────────────────────────────────────
function p2(n: number) { return String(n).padStart(2, '0'); }

function bucketKey(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === '24h') return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}`;
  if (range === '3m' || range === '1y') {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return `${monday.getFullYear()}-${p2(monday.getMonth()+1)}-${p2(monday.getDate())}`;
  }
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
}

function bucketLabel(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === '24h') { const h = d.getHours(); return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`; }
  if (range === '7d')  return WD_SHORT[d.getDay()];
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function withTicks(pts: { t: number; moisture: number; temp: number | null }[], range: TimeRange): SeriesPoint[] {
  const every = Math.max(1, Math.round(pts.length / 6));
  return pts.map((p, i) => ({
    ...p,
    label: bucketLabel(p.t, range),
    tick: i % every === 0 || i === pts.length - 1,
  }));
}

// ── Model builder ─────────────────────────────────────────────────────────--
export interface ModelInput {
  zones: VisualZone[];
  profilesById: Map<string, PlantProfile>;
  plantProfiles: PlantProfile[];
  readings: LatestReading[];
  wateringEvents: ActivityEntry[];   // already filtered to type 'watering'
}

export function buildGreenhouseModel(input: ModelInput): GreenhouseModel {
  const { zones, plantProfiles, readings, wateringEvents } = input;
  const NOW = Date.now();

  const toLite = (p: PlantProfile): PlantLite => ({
    id: p.id, name: p.name, icon: p.icon ?? '🌱', moistureMin: p.moistureMin, moistureMax: p.moistureMax,
  });

  // Sensor-backed zones that currently have a reading
  const ZONES: ZoneLite[] = zones
    .filter((z) => z.backendZoneId && z.hasReading)
    .map((z) => {
      const id = z.backendZoneId!;
      return {
        label: z.displayLabel ?? z.visualLabel,
        backendId: id,
        visualLabel: z.visualLabel,
        plantId: z.assignedPlant ?? null,
        indoor: !/(^|-)outdoor(-|$)/i.test(id),
      };
    });
  const ZONE_BY_ID: Record<string, ZoneLite> = {};
  ZONES.forEach((z) => { ZONE_BY_ID[z.backendId] = z; });

  // Plant types actually grown (assigned to at least one sensor zone)
  const grownIds = new Set(ZONES.map((z) => z.plantId).filter(Boolean) as string[]);
  const PLANTS: PlantLite[] = plantProfiles
    .filter((p) => grownIds.has(p.id))
    .map(toLite);
  const PLANT_BY_ID: Record<string, PlantLite> = {};
  PLANTS.forEach((p) => { PLANT_BY_ID[p.id] = p; });

  // Latest reading snapshot per backend zone (for current values + freshness)
  const latestByZone = new Map<string, { moisture: number | null; temp: number | null }>();
  zones.forEach((z) => {
    if (z.backendZoneId) latestByZone.set(z.backendZoneId, { moisture: z.soilMoisturePct, temp: z.soilTempC });
  });

  function bucketSeries(range: TimeRange, accept: (zoneId: string) => boolean): SeriesPoint[] {
    type B = { mSum: number; mCount: number; tSum: number; tCount: number; ts: number };
    const buckets = new Map<string, B>();
    for (const r of readings) {
      if (!r.timestamp) continue;
      const ts = new Date(r.timestamp).getTime();
      if (!ts || isNaN(ts)) continue;
      const key = bucketKey(ts, range);
      let b = buckets.get(key);
      if (!b) { b = { mSum: 0, mCount: 0, tSum: 0, tCount: 0, ts }; buckets.set(key, b); }
      b.ts = Math.max(b.ts, ts);
      for (const z of r.zones ?? []) {
        if (!accept(z.zone_id)) continue;
        const m = z.soil_moisture_pct;
        if (typeof m === 'number' && isFinite(m) && m >= 0 && m <= 100) { b.mSum += m; b.mCount++; }
        const t = z.soil_temp_c;
        if (typeof t === 'number' && isFinite(t) && t !== -127 && t !== 85 && t > -40 && t < 80) { b.tSum += t; b.tCount++; }
      }
    }
    const pts = [...buckets.values()]
      .filter((b) => b.mCount > 0)
      .sort((a, b) => a.ts - b.ts)
      .map((b) => ({ t: b.ts, moisture: r1(b.mSum / b.mCount), temp: b.tCount > 0 ? r1(b.tSum / b.tCount) : null }));
    return withTicks(pts, range);
  }

  const genZoneSeries = (z: ZoneLite, range: TimeRange) => bucketSeries(range, (id) => id === z.backendId);
  const genGreenhouseSeries = (range: TimeRange) => bucketSeries(range, () => true);
  const genPlantSeries = (plantId: string, range: TimeRange) => {
    const ids = new Set(ZONES.filter((z) => z.plantId === plantId).map((z) => z.backendId));
    if (!ids.size) return [];
    return bucketSeries(range, (id) => ids.has(id));
  };

  // Last watering timestamp per zone (match on visual label or backend id)
  function lastWaterFor(z: ZoneLite): number | null {
    let best: number | null = null;
    for (const e of wateringEvents) {
      if (e.visualZoneId === z.visualLabel || e.backendZoneId === z.backendId) {
        const ts = new Date(e.timestamp).getTime();
        if (ts && (best === null || ts > best)) best = ts;
      }
    }
    return best;
  }

  const currentReading = (z: ZoneLite): CurrentReading => {
    const latest = latestByZone.get(z.backendId);
    const plant = z.plantId ? PLANT_BY_ID[z.plantId] ?? null : null;
    return {
      moisture: latest?.moisture != null ? r1(latest.moisture) : 0,
      temp: latest?.temp != null ? r1(latest.temp) : null,
      plant,
      lastWater: lastWaterFor(z),
    };
  };

  // ── Watering aggregates ────────────────────────────────────────────────--
  const WATERING: WateringEvt[] = wateringEvents
    .map((e) => ({
      id: e.id,
      zoneId: e.visualZoneId ?? e.backendZoneId ?? 'unknown',
      zoneLabel: e.visualZoneId ?? e.backendZoneId ?? 'Zone',
      plantName: e.plantName ?? null,
      t: new Date(e.timestamp).getTime(),
      amountMl: e.amountMl ?? 0,
    }))
    .filter((e) => !!e.t && !isNaN(e.t))
    .sort((a, b) => a.t - b.t);

  const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };

  function buildHeatmap(): HeatmapData {
    const byDay: Record<string, { ml: number; n: number }> = {};
    WATERING.forEach((e) => {
      const k = dayKey(e.t);
      (byDay[k] || (byDay[k] = { ml: 0, n: 0 }));
      byDay[k].ml += e.amountMl; byDay[k].n += 1;
    });
    const end = new Date(NOW); end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + (6 - end.getDay()));            // Saturday of this week
    const start = new Date(end); start.setDate(start.getDate() - (53 * 7 - 1));
    const weeks: HeatCell[][] = [], monthCols: string[] = [];
    const cur = new Date(start);
    for (let w = 0; w < 53; w++) {
      const col: HeatCell[] = [], firstOfWeek = new Date(cur);
      for (let dd = 0; dd < 7; dd++) {
        const k = `${cur.getFullYear()}-${cur.getMonth()+1}-${cur.getDate()}`;
        const rec = byDay[k];
        const ml = rec ? rec.ml : 0, n = rec ? rec.n : 0;
        const future = cur.getTime() > NOW;
        const level = future ? -1 : ml === 0 ? 0 : ml < 250 ? 1 : ml < 600 ? 2 : ml < 1100 ? 3 : 4;
        col.push({ t: cur.getTime(), ml, n, level, future, date: `${cur.getMonth()+1}/${cur.getDate()}` });
        cur.setDate(cur.getDate() + 1);
      }
      monthCols.push(firstOfWeek.getDate() <= 7 ? MONTH_SHORT[firstOfWeek.getMonth()] : '');
      weeks.push(col);
    }
    return { weeks, monthCols };
  }

  function buildMonthly(): MonthBar[] {
    const out: MonthBar[] = [];
    for (let k = 11; k >= 0; k--) {
      const d = new Date(NOW); d.setDate(1); d.setMonth(d.getMonth() - k);
      const y = d.getFullYear(), m = d.getMonth();
      let ml = 0, n = 0;
      WATERING.forEach((e) => { const ed = new Date(e.t); if (ed.getFullYear() === y && ed.getMonth() === m) { ml += e.amountMl; n++; } });
      out.push({ label: MONTH_SHORT[m], ml, n });
    }
    return out;
  }

  function wateringByZone(): ZoneWaterAgg[] {
    const map: Record<string, ZoneWaterAgg> = {};
    WATERING.forEach((e) => {
      const m = map[e.zoneId] || (map[e.zoneId] = { zoneId: e.zoneId, label: e.zoneLabel, plantName: e.plantName, n: 0, ml: 0, last: 0 });
      m.n++; m.ml += e.amountMl; if (e.t > m.last) m.last = e.t;
    });
    return Object.values(map).sort((a, b) => b.ml - a.ml);
  }

  function wateringStats(): WateringStats {
    const total = WATERING.length;
    const vol = WATERING.reduce((s, e) => s + e.amountMl, 0);
    const inWindow = (startDaysAgo: number, endDaysAgo: number) => {
      const a = NOW - startDaysAgo * D, b = NOW - endDaysAgo * D;
      return WATERING.filter((e) => e.t > a && e.t <= b).length;
    };
    const thisWeek = inWindow(7, 0), lastWeek = inWindow(14, 7);
    const days: Record<string, number> = {};
    WATERING.forEach((e) => { days[dayKey(e.t)] = new Date(e.t).setHours(0, 0, 0, 0); });
    const dayTs = Object.values(days).sort((a, b) => a - b);
    let longestGap = 0;
    for (let i = 1; i < dayTs.length; i++) longestGap = Math.max(longestGap, Math.round((dayTs[i] - dayTs[i - 1]) / D));
    const mon = buildMonthly();
    let best = mon[0] ?? { label: '—', n: 0, ml: 0 };
    mon.forEach((m) => { if (m.n > best.n) best = m; });
    const activeDays = dayTs.length;
    const avgInterval = activeDays > 1 ? Math.round((dayTs[dayTs.length - 1] - dayTs[0]) / D / (activeDays - 1) * 10) / 10 : 0;
    return { total, vol, thisWeek, lastWeek, longestGap, mostActive: { label: best.label, n: best.n }, activeDays, avgInterval };
  }

  return {
    NOW, PLANTS, PLANT_BY_ID, ZONES, ZONE_BY_ID, SERIES_COLORS,
    hasHistory: readings.length > 0,
    readingCount: readings.length,
    genZoneSeries, genPlantSeries, genGreenhouseSeries, currentReading,
    WATERING, buildHeatmap, buildMonthly, wateringStats, wateringByZone,
  };
}
