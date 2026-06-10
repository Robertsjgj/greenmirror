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
export type WeekBar = { label: string; n: number; ml: number; [k: string]: number | string };

export interface SimpleStatus { kind: 'need' | 'wet' | 'healthy'; label: string; color: string; }
export interface Trend { label: string; arrow: string; color: string; dir: 'down' | 'up' | 'flat'; }
export interface HealthCounts { need: number; watching: number; healthy: number; }
export interface GhDelta { moisture: number; temp: number | null; }
export interface ZoneListItem { zone: ZoneLite; cur: CurrentReading; status: SimpleStatus; trend: Trend; }
export interface ZoneDetailStats { trendPct: number; ratePerHour: number | null; readingCount: number; }
export interface PlantAgg { count: number; moisture: number; temp: number | null; need: number; wet: number; good: number; }
export interface PlantListItem { plant: PlantLite; agg: PlantAgg; status: SimpleStatus; trend: Trend; }
export interface WaterWeekSummary { count: number; totalMl: number; zones: number; }
export interface WaterResult {
  id: string; zoneId: string; zoneLabel: string; plantName: string | null;
  t: number; before: number; after: number | null; amountMl: number;
  result: { label: string; color: string };
}

const NEED_COLOR = '#ef4444', WATCH_COLOR = '#f59e0b', GOOD_COLOR = '#16a34a', WET_COLOR = '#0ea5e9';

export function statusOf(m: number, plant: PlantLite | null): SimpleStatus {
  const s = moistureStatus(m, plant);
  if (s.tone === 'crit' || s.tone === 'dry') return { kind: 'need', label: 'Needs water', color: NEED_COLOR };
  if (s.tone === 'wet')                       return { kind: 'wet',  label: 'Too wet',     color: WET_COLOR };
  return { kind: 'healthy', label: 'Good', color: GOOD_COLOR };
}

export function trendOf(deltaPct: number | null, mode: 'zone' | 'plant'): Trend {
  if (deltaPct === null) return { label: 'No data', arrow: '–', color: 'var(--ink-3)', dir: 'flat' };
  if (deltaPct <= -3) return { label: mode === 'plant' ? 'Drying'    : 'Getting drier',  arrow: '↓', color: NEED_COLOR, dir: 'down' };
  if (deltaPct >= 3)  return { label: mode === 'plant' ? 'Improving' : 'Getting wetter', arrow: '↑', color: WET_COLOR,  dir: 'up' };
  return { label: 'Stable', arrow: '→', color: GOOD_COLOR, dir: 'flat' };
}

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
  healthCounts: () => HealthCounts;
  prevHealthCounts: () => HealthCounts | null;
  avgMoisture: number;
  avgTemp: number | null;
  ghDelta: (range: TimeRange) => GhDelta;
  zoneList: () => ZoneListItem[];
  zoneDetailStats: (z: ZoneLite, range: TimeRange) => ZoneDetailStats;
  plantList: () => PlantListItem[];
  WATERING: WateringEvt[];
  buildHeatmap: () => HeatmapData;
  buildMonthly: () => MonthBar[];
  buildWeekly: (n?: number) => WeekBar[];
  wateringStats: () => WateringStats;
  wateringByZone: () => ZoneWaterAgg[];
  waterThisWeek: () => WaterWeekSummary;
  waterResults: (limit?: number) => WaterResult[];
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

  // ── Per-zone raw moisture history (for trend / rate / readings count) ────--
  const zoneHist = new Map<string, { ts: number; moisture: number }[]>();
  for (const r of readings) {
    if (!r.timestamp) continue;
    const ts = new Date(r.timestamp).getTime();
    if (!ts || isNaN(ts)) continue;
    for (const z of r.zones ?? []) {
      const m = z.soil_moisture_pct;
      if (typeof m !== 'number' || !isFinite(m) || m < 0 || m > 100) continue;
      if (!zoneHist.has(z.zone_id)) zoneHist.set(z.zone_id, []);
      zoneHist.get(z.zone_id)!.push({ ts, moisture: m });
    }
  }
  for (const arr of zoneHist.values()) arr.sort((a, b) => a.ts - b.ts);

  const histDelta = (id: string): number | null => {
    const h = zoneHist.get(id);
    if (!h || h.length < 2) return null;
    return r1(h[h.length - 1].moisture - h[0].moisture);
  };

  // ── Greenhouse health (report-card counts + yesterday deltas) ────────────--
  function countAt(pick: (id: string) => number | null): HealthCounts {
    let need = 0, watching = 0, healthy = 0;
    ZONES.forEach((z) => {
      const m = pick(z.backendId);
      if (m === null) return;
      const s = statusOf(m, z.plantId ? PLANT_BY_ID[z.plantId] ?? null : null);
      if (s.kind === 'need') need++; else if (s.kind === 'wet') watching++; else healthy++;
    });
    return { need, watching, healthy };
  }
  const healthCounts = () => countAt((id) => latestByZone.get(id)?.moisture ?? null);
  const prevHealthCounts = (): HealthCounts | null => {
    const counts = countAt((id) => { const h = zoneHist.get(id); return h && h.length >= 2 ? h[0].moisture : null; });
    return (counts.need + counts.watching + counts.healthy) > 0 ? counts : null;
  };

  // Live greenhouse averages
  let mSum = 0, mN = 0, tSum = 0, tN = 0;
  ZONES.forEach((z) => {
    const l = latestByZone.get(z.backendId);
    if (l?.moisture != null) { mSum += l.moisture; mN++; }
    if (l?.temp != null) { tSum += l.temp; tN++; }
  });
  const avgMoisture = mN ? Math.round(mSum / mN) : 0;
  const avgTemp = tN ? Math.round(tSum / tN * 10) / 10 : null;

  const ghDelta = (range: TimeRange): GhDelta => {
    const s = bucketSeries(range, () => true);
    if (s.length < 2) return { moisture: 0, temp: null };
    const f = s[0], l = s[s.length - 1];
    return { moisture: Math.round(l.moisture - f.moisture), temp: (f.temp != null && l.temp != null) ? r1(l.temp - f.temp) : null };
  };

  const zoneList = (): ZoneListItem[] => ZONES.map((zone) => {
    const cur = currentReading(zone);
    return { zone, cur, status: statusOf(cur.moisture, cur.plant), trend: trendOf(histDelta(zone.backendId), 'zone') };
  });

  const zoneDetailStats = (z: ZoneLite): ZoneDetailStats => {
    const h = zoneHist.get(z.backendId);
    const readingCount = h?.length ?? 0;
    if (!h || h.length < 2) return { trendPct: 0, ratePerHour: null, readingCount };
    const delta = h[h.length - 1].moisture - h[0].moisture;
    const hours = (h[h.length - 1].ts - h[0].ts) / 3_600_000;
    return { trendPct: Math.round(delta), ratePerHour: hours >= 0.1 ? r1(delta / hours) : null, readingCount };
  };

  const plantAgg = (plant: PlantLite): PlantAgg => {
    const members = ZONES.filter((z) => z.plantId === plant.id);
    let ms = 0, ts = 0, tc = 0, need = 0, wet = 0, good = 0, n = 0;
    members.forEach((z) => {
      const c = currentReading(z); ms += c.moisture; n++;
      if (c.temp != null) { ts += c.temp; tc++; }
      if (c.moisture < plant.moistureMin) need++; else if (c.moisture > plant.moistureMax) wet++; else good++;
    });
    return { count: members.length, moisture: n ? Math.round(ms / n) : 0, temp: tc ? r1(ts / tc) : null, need, wet, good };
  };

  const plantList = (): PlantListItem[] => PLANTS.map((plant) => {
    const agg = plantAgg(plant);
    const ids = ZONES.filter((z) => z.plantId === plant.id).map((z) => z.backendId);
    const deltas = ids.map(histDelta).filter((d): d is number => d !== null);
    const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
    const status: SimpleStatus = agg.need > 0
      ? { kind: 'need', label: 'Needs water', color: NEED_COLOR }
      : agg.wet > 0
        ? { kind: 'wet', label: 'Too wet', color: WET_COLOR }
        : { kind: 'healthy', label: 'Good', color: GOOD_COLOR };
    return { plant, agg, status, trend: trendOf(avgDelta, 'plant') };
  });

  // ── Watering aggregates ────────────────────────────────────────────────--
  const visualToBackend = new Map<string, string>();
  ZONES.forEach((z) => visualToBackend.set(z.visualLabel, z.backendId));

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

  function buildWeekly(n = 8): WeekBar[] {
    const out: WeekBar[] = [];
    for (let k = n - 1; k >= 0; k--) {
      const end = new Date(NOW); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - k * 7);
      const start = new Date(end); start.setDate(start.getDate() - 6);
      let ml = 0, ct = 0;
      WATERING.forEach((e) => { if (e.t >= start.getTime() && e.t <= end.getTime() + D) { ml += e.amountMl; ct++; } });
      out.push({ label: `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}`, n: ct, ml });
    }
    return out;
  }

  function waterThisWeek(): WaterWeekSummary {
    const since = NOW - 7 * D;
    const recent = WATERING.filter((e) => e.t > since);
    return { count: recent.length, totalMl: recent.reduce((s, e) => s + e.amountMl, 0), zones: new Set(recent.map((e) => e.zoneId)).size };
  }

  function waterResults(limit = 6): WaterResult[] {
    const sorted = [...wateringEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const out: WaterResult[] = [];
    for (const e of sorted) {
      if (out.length >= limit) break;
      const backendId = e.backendZoneId ?? (e.visualZoneId ? visualToBackend.get(e.visualZoneId) : undefined);
      const h = backendId ? zoneHist.get(backendId) : null;
      if (!h || h.length < 2) continue;
      const evtTs = new Date(e.timestamp).getTime();
      const nearest = (target: number, win: number): number | null => {
        let best: number | null = null, bd = Infinity;
        for (const r of h) { const d = Math.abs(r.ts - target); if (d < win && d < bd) { bd = d; best = r.moisture; } }
        return best;
      };
      const before = nearest(evtTs - 20 * 60_000, 90 * 60_000);
      if (before === null) continue;
      const post = h.filter((r) => r.ts > evtTs && r.ts < evtTs + 2 * 3_600_000);
      const peak = post.length ? Math.max(...post.map((r) => r.moisture)) : null;
      const after = peak ?? nearest(evtTs + 6 * 3_600_000, 2 * 3_600_000);
      if (after === null) continue;
      const diff = after - before;
      const result = diff >= 8 ? { label: 'Watering helped', color: GOOD_COLOR }
        : diff >= 2 ? { label: 'Small improvement', color: WATCH_COLOR }
        : { label: 'No clear change', color: 'var(--ink-3)' };
      out.push({
        id: e.id, zoneId: e.visualZoneId ?? backendId ?? 'Zone', zoneLabel: e.visualZoneId ?? backendId ?? 'Zone',
        plantName: e.plantName ?? null, t: evtTs, before: Math.round(before), after: Math.round(after),
        amountMl: e.amountMl ?? 0, result,
      });
    }
    return out;
  }

  return {
    NOW, PLANTS, PLANT_BY_ID, ZONES, ZONE_BY_ID, SERIES_COLORS,
    hasHistory: readings.length > 0,
    readingCount: readings.length,
    genZoneSeries, genPlantSeries, genGreenhouseSeries, currentReading,
    healthCounts, prevHealthCounts, avgMoisture, avgTemp, ghDelta,
    zoneList, zoneDetailStats, plantList,
    WATERING, buildHeatmap, buildMonthly, buildWeekly, wateringStats, wateringByZone,
    waterThisWeek, waterResults,
  };
}
