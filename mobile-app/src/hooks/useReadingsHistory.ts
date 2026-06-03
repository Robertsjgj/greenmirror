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
// Backend sends one reading every ~5 s in simulation mode.
const RANGE_LIMIT: Record<TimeRange, number> = {
  '24h': 200,
  '7d':  400,
  '30d': 600,
  '3m':  900,
  '1y':  1200,
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
  /** Combined avg soil moisture across all zones (fallback when no GH-prefix data) */
  avgMoisture: number;
  /** Combined avg soil temp across all zones (fallback when no GH-prefix data) */
  avgTemp: number;
  /** Avg soil moisture of inside-greenhouse zones (zone_id starts with "GH") */
  avgSoilMoistureIn: number | null;
  /** Avg soil moisture of outside zones */
  avgSoilMoistureOut: number | null;
  /** Avg soil temp of inside-greenhouse zones */
  avgSoilTempIn: number | null;
  /** Avg soil temp of outside zones */
  avgSoilTempOut: number | null;
  /** RPi ambient air temperature reading */
  envTempC: number | null;
  /** RPi ambient air humidity reading */
  envHumidityPct: number | null;
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

const isInsideZone = (zoneId: string): boolean => {
  const upper = (zoneId ?? '').toUpperCase();
  // Matches real hardware "GH-01" (starts with GH) and sim IDs "SYD-GH-LEFT-01" (contains -GH-)
  return upper.startsWith('GH') || upper.includes('-GH-');
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
        sampleCount: 0, ts,
      });
    }
    const b = buckets.get(key)!;
    b.sampleCount++;
    b.ts = Math.max(b.ts, ts);

    // RPi ambient readings (optional hardware)
    const et = reading.env_temp_c;
    if (typeof et === 'number' && isFinite(et) && et > -40 && et < 80) {
      b.envTempSum += et; b.envTempCount++;
    }
    const eh = reading.env_humidity_pct;
    if (typeof eh === 'number' && isFinite(eh) && eh >= 0 && eh <= 100) {
      b.envHumSum += eh; b.envHumCount++;
    }

    for (const zone of reading.zones ?? []) {
      const m = zone.soil_moisture_pct;
      const t = zone.soil_temp_c;
      const inside = isInsideZone(zone.zone_id);

      if (typeof m === 'number' && isFinite(m) && m >= 0 && m <= 100) {
        b.moistureSum += m; b.moistureCount++;
        if (inside) { b.moistureInSum += m;  b.moistureInCount++;  }
        else         { b.moistureOutSum += m; b.moistureOutCount++; }
      }
      // Skip DS18B20 error sentinels (-127 = disconnected, 85 = power-on default)
      if (typeof t === 'number' && isFinite(t) && t !== -127 && t !== 85 && t > -40 && t < 80) {
        b.tempSum += t; b.tempCount++;
        if (inside) { b.tempInSum += t;  b.tempInCount++;  }
        else         { b.tempOutSum += t; b.tempOutCount++; }
      }
    }
  }

  const nullableAvg = (sum: number, count: number): number | null =>
    count > 0 ? parseFloat((sum / count).toFixed(1)) : null;

  const points: TrendPoint[] = [];
  for (const [key, b] of buckets) {
    const hasAny = b.moistureCount > 0 || b.tempCount > 0 || b.envTempCount > 0 || b.envHumCount > 0;
    if (!hasAny) continue;
    points.push({
      label:              bucketLabel(key, range),
      ts:                 b.ts,
      avgMoisture:        b.moistureCount > 0 ? Math.round(b.moistureSum / b.moistureCount) : 0,
      avgTemp:            b.tempCount > 0 ? parseFloat((b.tempSum / b.tempCount).toFixed(1)) : 0,
      avgSoilMoistureIn:  nullableAvg(b.moistureInSum,  b.moistureInCount),
      avgSoilMoistureOut: nullableAvg(b.moistureOutSum, b.moistureOutCount),
      avgSoilTempIn:      nullableAvg(b.tempInSum,      b.tempInCount),
      avgSoilTempOut:     nullableAvg(b.tempOutSum,     b.tempOutCount),
      envTempC:           nullableAvg(b.envTempSum,     b.envTempCount),
      envHumidityPct:     nullableAvg(b.envHumSum,      b.envHumCount),
      zoneCount:          Math.max(b.moistureCount, b.tempCount),
      sampleCount:        b.sampleCount,
    });
  }

  // Sort oldest → newest for left-to-right chart rendering
  return points.sort((a, b) => a.ts - b.ts);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useReadingsHistory(
  greenhouseId: string | null,
  range: TimeRange,
): { readings: LatestReading[]; trendData: TrendPoint[]; loading: boolean } {
  const [allReadings, setAllReadings] = useState<LatestReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!greenhouseId) {
      setAllReadings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setAllReadings([]);

    const unsub = subscribeToReadingsHistory(
      greenhouseId,
      (r) => { setAllReadings(r); setLoading(false); },
      RANGE_LIMIT[range],
      () => { setLoading(false); }, // stop loading on Firestore error / missing index
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
