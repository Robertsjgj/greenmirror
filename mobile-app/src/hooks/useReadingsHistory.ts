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

export type TimeRange = '24h' | '7d' | '30d';

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '24h': 'Last 24h',
  '7d':  'Last 7 days',
  '30d': 'Last 30 days',
};

// How many readings to request from Firestore per range.
// Backend sends one reading every ~5 s in simulation mode.
// These limits are intentionally conservative to avoid large reads.
const RANGE_LIMIT: Record<TimeRange, number> = {
  '24h': 200,
  '7d':  400,
  '30d': 600,
};

const RANGE_HOURS: Record<TimeRange, number> = {
  '24h': 24,
  '7d':  168,
  '30d': 720,
};

export interface TrendPoint {
  /** X-axis label shown in chart */
  label: string;
  /** Unix ms — used for sorting */
  ts: number;
  /** Average soil moisture % across all zones for this bucket */
  avgMoisture: number;
  /** Average soil temp °C across all zones for this bucket */
  avgTemp: number;
  /** Number of zones that contributed readings for this bucket */
  zoneCount: number;
  /** Number of raw readings collapsed into this bucket */
  sampleCount: number;
}

// ─── Bucketing helpers ────────────────────────────────────────────────────────

function bucketKey(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === '24h') {
    // bucket by hour
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
  }
  // 7d / 30d: bucket by calendar day
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
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

/** Collapse an array of LatestReading into bucketed TrendPoint[]. */
export function buildTrendData(readings: LatestReading[], range: TimeRange): TrendPoint[] {
  // Map<bucketKey, { moistureSum, tempSum, zoneCount, sampleCount, ts }>
  const buckets = new Map<string, {
    moistureSum: number; tempSum: number;
    moistureCount: number; tempCount: number;
    sampleCount: number; ts: number;
  }>();

  for (const reading of readings) {
    if (!reading.timestamp) continue;
    const ts = new Date(reading.timestamp).getTime();
    if (!ts || isNaN(ts)) continue;
    const key = bucketKey(ts, range);

    if (!buckets.has(key)) {
      buckets.set(key, { moistureSum: 0, tempSum: 0, moistureCount: 0, tempCount: 0, sampleCount: 0, ts });
    }
    const b = buckets.get(key)!;
    b.sampleCount++;
    b.ts = Math.max(b.ts, ts); // keep the latest ts in the bucket for sorting

    for (const zone of reading.zones ?? []) {
      const m = zone.soil_moisture_pct;
      const t = zone.soil_temp_c;
      // Skip DS18B20 error sentinels (-127 = disconnected, 85 = power-on default)
      if (typeof m === 'number' && isFinite(m) && m >= 0 && m <= 100) {
        b.moistureSum += m;
        b.moistureCount++;
      }
      if (typeof t === 'number' && isFinite(t) && t !== -127 && t !== 85 && t > -40 && t < 80) {
        b.tempSum += t;
        b.tempCount++;
      }
    }
  }

  const points: TrendPoint[] = [];
  for (const [key, b] of buckets) {
    if (b.moistureCount === 0 && b.tempCount === 0) continue;
    points.push({
      label: bucketLabel(key, range),
      ts: b.ts,
      avgMoisture: b.moistureCount > 0 ? Math.round(b.moistureSum / b.moistureCount) : 0,
      avgTemp: b.tempCount > 0 ? parseFloat((b.tempSum / b.tempCount).toFixed(1)) : 0,
      zoneCount: Math.max(b.moistureCount, b.tempCount),
      sampleCount: b.sampleCount,
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
