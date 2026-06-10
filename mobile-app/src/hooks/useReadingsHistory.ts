/**
 * Hook: subscribe to greenhouse-scoped Firestore readings history
 * and apply a client-side time-range filter.
 *
 * Returns raw readings (newest first) within the selected window,
 * plus a loading flag.  Component calls buildTrendData() to bucket
 * them into chart-ready points.
 */

import { useEffect, useMemo, useState } from 'react';
import { subscribeToReadingsHistory } from '../services/readingsService';
import type { LatestReading } from '../zoneLayout';

export type TimeRange = '24h' | '7d' | '30d' | '3m' | '1y';

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '24h': 'Last 24h',
  '7d':  'Last 7 days',
  '30d': 'Last 30 days',
  '3m':  'Last 3 months',
  '1y':  'Last year',
};

// How many readings to request from Firestore per range.
// Charts bucket readings into ~30 points, so we don't need every raw sample —
// modest caps keep the first paint fast (no long "loading history" wait).
const RANGE_LIMIT: Record<TimeRange, number> = {
  '24h': 1500,
  '7d':  2500,
  '30d': 4000,
  '3m':  6000,
  '1y':  9000,
};

const RANGE_HOURS: Record<TimeRange, number> = {
  '24h': 24,
  '7d':  168,
  '30d': 720,
  '3m':  2160,
  '1y':  8760,
};

export interface TrendPoint {
  /** X-axis label shown in chart */
  label: string;
  /** Unix ms — used for sorting */
  ts: number;
  /** Combined avg soil moisture across all zones (used for insight text) */
  avgMoisture: number;
  /** Combined avg soil temp across all zones (used for insight text) */
  avgTemp: number;
  /** Avg soil moisture of GH-prefix zones — 0 when no such zones exist */
  avgSoilMoistureIn: number;
  /** Avg soil moisture of OUTDOOR-prefix zones — 0 when no such zones exist */
  avgSoilMoistureOut: number;
  /** Avg soil temp of GH-prefix zones — 0 when no such zones exist */
  avgSoilTempIn: number;
  /** Avg soil temp of OUTDOOR-prefix zones — 0 when no such zones exist */
  avgSoilTempOut: number;
  /** RPi ambient air temperature — 0 when sensor not present */
  envTempC: number;
  /** RPi ambient air humidity — 0 when sensor not present */
  envHumidityPct: number;
  /** External city weather temperature (Open-Meteo) — 0 when unavailable */
  externalWeatherTempC: number;
  /** External city weather humidity (Open-Meteo) — 0 when unavailable */
  externalWeatherHumidityPct: number;
  /** Number of zones that contributed readings for this bucket */
  zoneCount: number;
  /** Number of raw readings collapsed into this bucket */
  sampleCount: number;
}

// ─── Bucketing helpers ────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function bucketKey(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === '24h') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
  }
  if (range === '3m' || range === '1y') {
    // Snap to the Monday of the current ISO week (local time)
    const daysFromMonday = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  }
  // 7d / 30d: bucket by calendar day
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function bucketLabel(key: string, range: TimeRange): string {
  if (range === '24h') {
    const h = parseInt(key.slice(11), 10);
    const suffix = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 || 12;
    return `${h12}${suffix}`;
  }
  const d = new Date(key + 'T12:00:00Z');
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// Zone classification: inside = GH-prefix, outside = OUTDOOR-prefix
// Handles both bare prefixes (real hardware: "GH-01", "OUTDOOR-01") and
// compound IDs (simulation: "SYD-GH-LEFT-01", "SYD-OUTDOOR-05").
const isInsideZone = (zoneId: string): boolean => {
  const upper = (zoneId ?? '').toUpperCase();
  return upper.startsWith('GH') || upper.includes('-GH-');
};

const isOutsideZone = (zoneId: string): boolean => {
  const upper = (zoneId ?? '').toUpperCase();
  return upper.startsWith('OUTDOOR') || upper.includes('-OUTDOOR-');
};

/** Collapse an array of LatestReading into bucketed TrendPoint[]. */
export function buildTrendData(readings: LatestReading[], range: TimeRange): TrendPoint[] {
  const buckets = new Map<string, {
    moistureSum: number;    moistureCount: number;
    tempSum: number;        tempCount: number;
    moistureInSum: number;  moistureInCount: number;
    moistureOutSum: number; moistureOutCount: number;
    tempInSum: number;      tempInCount: number;
    tempOutSum: number;     tempOutCount: number;
    envTempSum: number;     envTempCount: number;
    envHumSum: number;      envHumCount: number;
    extTempSum: number;     extTempCount: number;
    extHumSum: number;      extHumCount: number;
    sampleCount: number;    ts: number;
  }>();

  for (const reading of readings) {
    if (!reading.timestamp) continue;
    const ts = new Date(reading.timestamp).getTime();
    if (!ts || isNaN(ts)) continue;
    const key = bucketKey(ts, range);

    if (!buckets.has(key)) {
      buckets.set(key, {
        moistureSum: 0, moistureCount: 0,
        tempSum: 0,     tempCount: 0,
        moistureInSum: 0, moistureInCount: 0,
        moistureOutSum: 0, moistureOutCount: 0,
        tempInSum: 0,   tempInCount: 0,
        tempOutSum: 0,  tempOutCount: 0,
        envTempSum: 0,  envTempCount: 0,
        envHumSum: 0,   envHumCount: 0,
        extTempSum: 0,  extTempCount: 0,
        extHumSum: 0,   extHumCount: 0,
        sampleCount: 0, ts,
      });
    }
    const b = buckets.get(key)!;
    b.sampleCount++;
    b.ts = Math.max(b.ts, ts);

    // RPi ambient readings (optional hardware)
    const et = reading.environment?.air_temp_c ?? reading.env_temp_c;
    if (typeof et === 'number' && isFinite(et) && et > -40 && et < 80) {
      b.envTempSum += et; b.envTempCount++;
    }
    const eh = reading.environment?.humidity_pct ?? reading.env_humidity_pct;
    if (typeof eh === 'number' && isFinite(eh) && eh >= 0 && eh <= 100) {
      b.envHumSum += eh; b.envHumCount++;
    }

    // External weather (Open-Meteo, embedded by backend in each snapshot)
    const xt = reading.external_weather?.temp_c;
    if (typeof xt === 'number' && isFinite(xt) && xt > -60 && xt < 60) {
      b.extTempSum += xt; b.extTempCount++;
    }
    const xh = reading.external_weather?.humidity_pct;
    if (typeof xh === 'number' && isFinite(xh) && xh >= 0 && xh <= 100) {
      b.extHumSum += xh; b.extHumCount++;
    }

    let classifiedMoistureIn = false;
    let classifiedMoistureOut = false;
    let classifiedTempIn = false;
    let classifiedTempOut = false;

    for (const zone of reading.zones ?? []) {
      const m = zone.soil_moisture_pct;
      const t = zone.soil_temp_c;
      const inside  = isInsideZone(zone.zone_id);
      const outside = isOutsideZone(zone.zone_id);

      if (typeof m === 'number' && isFinite(m) && m >= 0 && m <= 100) {
        b.moistureSum += m; b.moistureCount++;
        if (inside)  { b.moistureInSum  += m; b.moistureInCount++;  classifiedMoistureIn  = true; }
        if (outside) { b.moistureOutSum += m; b.moistureOutCount++; classifiedMoistureOut = true; }
      }
      // Skip DS18B20 error sentinels (-127 = disconnected, 85 = power-on default)
      if (typeof t === 'number' && isFinite(t) && t !== -127 && t !== 85 && t > -40 && t < 80) {
        b.tempSum += t; b.tempCount++;
        if (inside)  { b.tempInSum  += t; b.tempInCount++;  classifiedTempIn  = true; }
        if (outside) { b.tempOutSum += t; b.tempOutCount++; classifiedTempOut = true; }
      }
    }

    // Fallback for old readings whose zone IDs (e.g. "zone-01-1") don't match
    // GH / OUTDOOR patterns — use pre-computed summary averages instead.
    const sm = reading.summary;
    if (!classifiedMoistureIn) {
      const v = sm?.avg_inside_soil_moisture_pct ?? sm?.avg_all_soil_moisture_pct;
      if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 100) {
        b.moistureInSum += v; b.moistureInCount++;
      }
    }
    if (!classifiedMoistureOut) {
      const v = sm?.avg_outside_soil_moisture_pct;
      if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 100) {
        b.moistureOutSum += v; b.moistureOutCount++;
      }
    }
    if (!classifiedTempIn) {
      const v = sm?.avg_inside_soil_temp_c ?? sm?.avg_all_soil_temp_c;
      if (typeof v === 'number' && isFinite(v) && v > -40 && v < 80) {
        b.tempInSum += v; b.tempInCount++;
      }
    }
    if (!classifiedTempOut) {
      const v = sm?.avg_outside_soil_temp_c;
      if (typeof v === 'number' && isFinite(v) && v > -40 && v < 80) {
        b.tempOutSum += v; b.tempOutCount++;
      }
    }
  }

  // Returns 0 when no samples — line sits at 0 on chart to signal "no sensor data yet"
  const zeroOrAvg = (sum: number, count: number): number =>
    count > 0 ? parseFloat((sum / count).toFixed(1)) : 0;

  const points: TrendPoint[] = [];
  for (const [key, b] of buckets) {
    const hasAny = b.moistureCount > 0 || b.tempCount > 0 || b.envTempCount > 0 || b.envHumCount > 0;
    if (!hasAny) continue;
    points.push({
      label:              bucketLabel(key, range),
      ts:                 b.ts,
      avgMoisture:        b.moistureCount > 0 ? Math.round(b.moistureSum / b.moistureCount) : 0,
      avgTemp:            b.tempCount > 0 ? parseFloat((b.tempSum / b.tempCount).toFixed(1)) : 0,
      avgSoilMoistureIn:  zeroOrAvg(b.moistureInSum,  b.moistureInCount),
      avgSoilMoistureOut: zeroOrAvg(b.moistureOutSum, b.moistureOutCount),
      avgSoilTempIn:      zeroOrAvg(b.tempInSum,      b.tempInCount),
      avgSoilTempOut:     zeroOrAvg(b.tempOutSum,     b.tempOutCount),
      envTempC:           zeroOrAvg(b.envTempSum,     b.envTempCount),
      envHumidityPct:     zeroOrAvg(b.envHumSum,      b.envHumCount),
      externalWeatherTempC:        zeroOrAvg(b.extTempSum, b.extTempCount),
      externalWeatherHumidityPct:  zeroOrAvg(b.extHumSum,  b.extHumCount),
      zoneCount:          Math.max(b.moistureCount, b.tempCount),
      sampleCount:        b.sampleCount,
    });
  }

  // Sort oldest → newest for left-to-right chart rendering
  return points.sort((a, b) => a.ts - b.ts);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Session cache of the last snapshot per greenhouse+range. Re-selecting a range
// you've already viewed paints instantly from cache while the live subscription
// refreshes it in the background — so switching ranges feels immediate and the
// "loading" state only shows the first time a range is opened.
const readingsCache = new Map<string, LatestReading[]>();
const cacheKeyOf = (ghId: string | null, range: TimeRange) => (ghId ? `${ghId}|${range}` : '');

export function useReadingsHistory(
  greenhouseId: string | null,
  range: TimeRange,
): { readings: LatestReading[]; trendData: TrendPoint[]; loading: boolean } {
  const initialKey = cacheKeyOf(greenhouseId, range);
  const [allReadings, setAllReadings] = useState<LatestReading[]>(() => readingsCache.get(initialKey) ?? []);
  const [loading, setLoading] = useState<boolean>(() => !!greenhouseId && !readingsCache.has(initialKey));

  useEffect(() => {
    if (!greenhouseId) {
      setAllReadings([]);
      setLoading(false);
      return;
    }

    const key = cacheKeyOf(greenhouseId, range);
    const cached = readingsCache.get(key);
    if (cached) {
      // Instant paint from cache; subscription below keeps it fresh.
      setAllReadings(cached);
      setLoading(false);
    } else {
      setAllReadings([]);
      setLoading(true);
    }

    const cutoffMs = Date.now() - RANGE_HOURS[range] * 3_600_000;
    const cutoffISO = new Date(cutoffMs).toISOString();

    const unsub = subscribeToReadingsHistory(
      greenhouseId,
      (r) => { readingsCache.set(key, r); setAllReadings(r); setLoading(false); },
      RANGE_LIMIT[range],
      () => { setLoading(false); }, // stop loading on Firestore error / missing index
      cutoffISO,
    );

    return () => { unsub?.(); };
  }, [greenhouseId, range]);

  // Client-side time-range filter (belt-and-suspenders — Firestore already limits by count)
  const cutoff = useMemo(
    () => Date.now() - RANGE_HOURS[range] * 3_600_000,
    [range],
  );

  const readings = useMemo(
    () => allReadings.filter((r) => {
      if (!r.timestamp) return false;
      return new Date(r.timestamp).getTime() >= cutoff;
    }),
    [allReadings, cutoff],
  );

  const trendData = useMemo(() => buildTrendData(readings, range), [readings, range]);

  return { readings, trendData, loading };
}
