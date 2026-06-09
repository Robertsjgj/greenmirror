import { useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import {
  useReadingsHistory,
  buildTrendData,
  TIME_RANGE_LABELS,
} from '../hooks/useReadingsHistory';
import type { TimeRange, TrendPoint } from '../hooks/useReadingsHistory';
import type { VisualZone, LatestReading } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';
import type { ActivityEntry } from '../activityLog';

type DashTab = 'overview' | 'zones' | 'plants' | 'watering' | 'research';

const DASH_TABS: { id: DashTab; label: string }[] = [
  { id: 'overview',  label: '📊 Overview'  },
  { id: 'zones',     label: '🗺 Zones'      },
  { id: 'plants',    label: '🌿 Plants'     },
  { id: 'watering',  label: '💧 Watering'   },
  { id: 'research',  label: '🔬 Research'   },
];

const RANGE_OPTIONS: { id: TimeRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d',  label: '7D'  },
  { id: '30d', label: '30D' },
  { id: '3m',  label: '3M'  },
  { id: '1y',  label: '1Y'  },
];

// Static hex — CSS vars don't resolve reliably inside SVG/recharts
const MOISTURE_COLOR = '#0ea5e9';  // soil moisture — blue
const TEMP_COLOR     = '#22c55e';  // soil temp     — green

const TOOLTIP_LABELS: Record<string, { label: string; unit: string }> = {
  avgMoisture: { label: 'Avg moisture',  unit: '%'  },
  avgTemp:     { label: 'Avg soil temp', unit: '°C' },
};

// ─── Chart bucketing helpers (plants & watering tabs) ────────────────────────

function _p2(n: number) { return String(n).padStart(2, '0'); }

function _bKey(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === '24h') return `${d.getFullYear()}-${_p2(d.getMonth()+1)}-${_p2(d.getDate())}T${_p2(d.getHours())}`;
  if (range === '3m' || range === '1y') {
    const mon = new Date(d);
    mon.setDate(d.getDate() - (d.getDay() + 6) % 7);
    mon.setHours(0, 0, 0, 0);
    return `${mon.getFullYear()}-${_p2(mon.getMonth()+1)}-${_p2(mon.getDate())}`;
  }
  return `${d.getFullYear()}-${_p2(d.getMonth()+1)}-${_p2(d.getDate())}`;
}

function _bLabel(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === '24h') { const h = d.getHours(); return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`; }
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function buildPlantChartData(
  plantId: string,
  allZones: VisualZone[],
  readings: LatestReading[],
  range: TimeRange,
): Array<{ label: string; ts: number; moisture: number; temp: number | null }> {
  const backendIds = new Set(
    allZones.filter(z => z.assignedPlant === plantId && z.backendZoneId).map(z => z.backendZoneId!),
  );
  if (!backendIds.size) return [];
  type B = { mSum: number; mCount: number; tSum: number; tCount: number; ts: number; label: string };
  const buckets = new Map<string, B>();
  for (const r of readings) {
    if (!r.timestamp) continue;
    const ts = new Date(r.timestamp).getTime();
    if (!ts || isNaN(ts)) continue;
    for (const z of r.zones ?? []) {
      if (!backendIds.has(z.zone_id)) continue;
      const key = _bKey(ts, range);
      if (!buckets.has(key)) buckets.set(key, { mSum: 0, mCount: 0, tSum: 0, tCount: 0, ts, label: _bLabel(ts, range) });
      const b = buckets.get(key)!;
      b.ts = Math.max(b.ts, ts);
      const m = z.soil_moisture_pct;
      const t = z.soil_temp_c;
      if (typeof m === 'number' && isFinite(m) && m >= 0 && m <= 100) { b.mSum += m; b.mCount++; }
      if (typeof t === 'number' && isFinite(t) && t > -40 && t < 80 && t !== -127 && t !== 85) { b.tSum += t; b.tCount++; }
    }
  }
  return [...buckets.values()]
    .filter(b => b.mCount > 0)
    .map(b => ({ label: b.label, ts: b.ts, moisture: parseFloat((b.mSum / b.mCount).toFixed(1)), temp: b.tCount > 0 ? parseFloat((b.tSum / b.tCount).toFixed(1)) : null }))
    .sort((a, b) => a.ts - b.ts);
}

function buildWateringChartData(
  events: ActivityEntry[],
  range: TimeRange,
): Array<{ label: string; ts: number; count: number; totalMl: number }> {
  type B = { count: number; totalMl: number; ts: number; label: string };
  const buckets = new Map<string, B>();
  for (const e of events) {
    const ts = new Date(e.timestamp).getTime();
    if (!ts || isNaN(ts)) continue;
    const key = _bKey(ts, range);
    if (!buckets.has(key)) buckets.set(key, { count: 0, totalMl: 0, ts, label: _bLabel(ts, range) });
    const b = buckets.get(key)!;
    b.count++;
    b.totalMl += e.amountMl ?? 0;
    b.ts = Math.max(b.ts, ts);
  }
  return [...buckets.values()].sort((a, b) => a.ts - b.ts);
}

function tooltipFormatter(value: number, name: string): [string, string] {
  const info = TOOLTIP_LABELS[name] ?? { label: name, unit: '' };
  return [`${value}${info.unit}`, info.label];
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1.5px solid var(--line)',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 700,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function getMoistureStatus(moisture: number, profile: PlantProfile | null) {
  if (profile) {
    if (moisture < profile.moistureMin * 0.7) return { label: 'Critical', color: '#ef4444' };
    if (moisture < profile.moistureMin)         return { label: 'Dry',      color: '#f59e0b' };
    if (moisture > profile.moistureMax)         return { label: 'Too wet',  color: '#0ea5e9' };
    return { label: 'Good', color: '#22c55e' };
  }
  if (moisture < 25) return { label: 'Dry',     color: '#f59e0b' };
  if (moisture > 80) return { label: 'Too wet', color: '#0ea5e9' };
  return { label: 'Good', color: '#22c55e' };
}

// Friendly status used for zone rows + plant cards — plain words only
function getSimpleStatus(moisture: number | null, profile: PlantProfile | null) {
  if (moisture === null) return { label: 'No data', color: '#94a3b8' };
  if (profile) {
    if (moisture < profile.moistureMin) return { label: 'Needs water', color: '#f59e0b' };
    if (moisture > profile.moistureMax) return { label: 'Too wet',     color: '#0ea5e9' };
    return { label: 'Good', color: '#22c55e' };
  }
  if (moisture < 25) return { label: 'Needs water', color: '#f59e0b' };
  if (moisture > 80) return { label: 'Too wet',     color: '#0ea5e9' };
  return { label: 'Good', color: '#22c55e' };
}

// Simple moisture trend from a first→last delta over the period
type TrendInfo = { label: string; icon: string; color: string } | null;
function moistureTrend(delta: number | null, mode: 'zone' | 'plant' = 'zone'): TrendInfo {
  if (delta === null) return null;
  if (delta <= -3) return { label: mode === 'plant' ? 'Drying'    : 'Getting drier',  icon: '↓', color: '#f59e0b' };
  if (delta >= 3)  return { label: mode === 'plant' ? 'Improving' : 'Getting wetter', icon: '↑', color: '#0ea5e9' };
  return { label: 'Stable', icon: '→', color: '#22c55e' };
}

const RANGE_WORD: Record<TimeRange, string> = {
  '24h': 'last 24 hours', '7d': 'last week', '30d': 'last month', '3m': 'last 3 months', '1y': 'last year',
};

// First→last moisture delta from a zone's raw history
function historyDelta(history: Array<{ ts: number; moisture: number }> | undefined | null): number | null {
  if (!history || history.length < 2) return null;
  return parseFloat((history[history.length - 1].moisture - history[0].moisture).toFixed(1));
}

// Bucket one zone's raw readings into moisture-only chart points
function buildZoneChartData(
  backendId: string,
  readings: LatestReading[],
  range: TimeRange,
): Array<{ label: string; ts: number; moisture: number }> {
  const buckets = new Map<string, { sum: number; count: number; ts: number; label: string }>();
  for (const r of readings) {
    if (!r.timestamp) continue;
    const ts = new Date(r.timestamp).getTime();
    if (!ts || isNaN(ts)) continue;
    for (const z of r.zones ?? []) {
      if (z.zone_id !== backendId) continue;
      const m = z.soil_moisture_pct;
      if (typeof m !== 'number' || !isFinite(m) || m < 0 || m > 100) continue;
      const key = _bKey(ts, range);
      if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0, ts, label: _bLabel(ts, range) });
      const b = buckets.get(key)!;
      b.sum += m; b.count++; b.ts = Math.max(b.ts, ts);
    }
  }
  return [...buckets.values()]
    .map((b) => ({ label: b.label, ts: b.ts, moisture: parseFloat((b.sum / b.count).toFixed(1)) }))
    .sort((a, b) => a.ts - b.ts);
}

// Plain-language sentence for a selected zone
function zoneSentence(name: string, statusLabel: string, trend: TrendInfo, range: TimeRange): string {
  const word = RANGE_WORD[range];
  let s: string;
  if (!trend)                              s = `Not enough history yet for ${name}.`;
  else if (trend.label === 'Getting drier')  s = `${name} has been drying out over the ${word}.`;
  else if (trend.label === 'Getting wetter') s = `${name} has been getting wetter over the ${word}.`;
  else                                       s = `${name} has stayed steady over the ${word}.`;
  if (statusLabel === 'Needs water') s += ' It is below its target — time to water.';
  else if (statusLabel === 'Too wet') s += ' It is a little too wet right now.';
  else if (statusLabel === 'Good')    s += ' It is sitting comfortably in range.';
  return s;
}

// Plain-language sentence for a selected plant type
function plantSentence(name: string, statusLabel: string, trend: TrendInfo): string {
  if (statusLabel === 'Needs water') return `${name} are running dry — some beds need water.`;
  if (statusLabel === 'Too wet')     return `${name} are a little too wet right now.`;
  if (trend?.label === 'Drying')     return `${name} are slowly drying but still okay.`;
  if (trend?.label === 'Improving')  return `${name} are recovering nicely.`;
  return `${name} are mostly stable today.`;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

interface ZoneWithStats {
  zone: VisualZone;
  profile: PlantProfile | null;
  moisture: number;
  label: string;
  color: string;
  urgency: number;
}

interface PlantGroup {
  profile: PlantProfile;
  count: number;
  totalMoisture: number;
  moistureCount: number;
  needsWater: number;
  tooWet: number;
  good: number;
}

interface WateringResponse {
  event: ActivityEntry;
  zoneId: string;
  beforePct: number;
  peakPct: number | null;
  after6h: number | null;
  after12h: number | null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TrendsDashboardProps {
  open: boolean;
  greenhouseId: string;
  greenhouseName?: string;
  zones?: VisualZone[];
  profilesById?: Map<string, PlantProfile>;
  plantProfiles?: PlantProfile[];
  simHistory?: LatestReading[];
  activityLog?: ActivityEntry[];
  firestoreActivity?: ActivityEntry[];
  onClose: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrendsDashboard({
  open,
  greenhouseId,
  greenhouseName,
  zones,
  profilesById,
  simHistory,
  activityLog = [],
  firestoreActivity = [],
  onClose,
}: TrendsDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [range, setRange] = useState<TimeRange>('24h');
  const [zoneSearch, setZoneSearch] = useState('');

  // Time-series history — only queries when dashboard is open
  const { trendData: firestoreTrends, loading: chartLoading, readings: firestoreReadings } = useReadingsHistory(
    simHistory ? null : (open ? greenhouseId : null),
    range,
  );

  const trendData = useMemo(
    () => simHistory ? buildTrendData(simHistory, range) : firestoreTrends,
    [simHistory, firestoreTrends, range],
  );
  // Raw readings for zone-level history computation
  const readings = useMemo(
    () => simHistory ?? firestoreReadings,
    [simHistory, firestoreReadings],
  );
  const isChartLoading = simHistory ? false : chartLoading;

  // Per-zone moisture history from raw readings
  const zoneHistory = useMemo(() => {
    const map = new Map<string, Array<{ ts: number; moisture: number }>>();
    readings.forEach((r) => {
      if (!r.timestamp) return;
      const ts = new Date(r.timestamp).getTime();
      if (!ts || isNaN(ts)) return;
      (r.zones ?? []).forEach((z) => {
        const m = z.soil_moisture_pct;
        if (typeof m !== 'number' || !isFinite(m) || m < 0 || m > 100) return;
        if (!map.has(z.zone_id)) map.set(z.zone_id, []);
        map.get(z.zone_id)!.push({ ts, moisture: m });
      });
    });
    for (const arr of map.values()) arr.sort((a, b) => a.ts - b.ts);
    return map;
  }, [readings]);

  // Zone urgency list (sorted driest/most-urgent first)
  const sortedZones: ZoneWithStats[] = useMemo(() => {
    return (zones ?? [])
      .filter((z) => z.hasReading && z.soilMoisturePct !== null)
      .map((z) => {
        const profile = z.assignedPlant ? profilesById?.get(z.assignedPlant) ?? null : null;
        const moisture = z.soilMoisturePct ?? 0;
        const st = getMoistureStatus(moisture, profile);
        let urgency = 0;
        if (profile) {
          if (moisture < profile.moistureMin * 0.7) urgency = 4;
          else if (moisture < profile.moistureMin)  urgency = 3;
          else if (moisture > profile.moistureMax)  urgency = 2;
        } else if (moisture < 25) urgency = 1;
        return { zone: z, profile, moisture, urgency, ...st };
      })
      .sort((a, b) => b.urgency - a.urgency || a.moisture - b.moisture);
  }, [zones, profilesById]);

  // Plant groups
  const plantGroups: PlantGroup[] = useMemo(() => {
    const groups = new Map<string, PlantGroup>();
    (zones ?? []).forEach((z) => {
      if (!z.assignedPlant || !z.hasReading) return;
      const profile = profilesById?.get(z.assignedPlant);
      if (!profile) return;
      if (!groups.has(z.assignedPlant)) {
        groups.set(z.assignedPlant, { profile, count: 0, totalMoisture: 0, moistureCount: 0, needsWater: 0, tooWet: 0, good: 0 });
      }
      const g = groups.get(z.assignedPlant)!;
      g.count++;
      if (z.soilMoisturePct !== null) {
        g.totalMoisture += z.soilMoisturePct;
        g.moistureCount++;
        if (z.soilMoisturePct < profile.moistureMin)      g.needsWater++;
        else if (z.soilMoisturePct > profile.moistureMax) g.tooWet++;
        else                                               g.good++;
      }
    });
    return [...groups.values()]
      .sort((a, b) => (b.needsWater * 2 + b.tooWet) - (a.needsWater * 2 + a.tooWet));
  }, [zones, profilesById]);

  // Zone status counts — Critical / Watching / Healthy
  const statusCounts = useMemo(() => {
    let critical = 0, watching = 0, healthy = 0, noData = 0;
    (zones ?? []).forEach((z) => {
      if (!z.hasReading || z.soilMoisturePct === null) { noData++; return; }
      const profile = z.assignedPlant ? profilesById?.get(z.assignedPlant) ?? null : null;
      const m = z.soilMoisturePct;
      if (profile) {
        if (m < profile.moistureMin * 0.7)                           critical++;
        else if (m < profile.moistureMin || m > profile.moistureMax) watching++;
        else                                                          healthy++;
      } else {
        if (m < 15)               critical++;
        else if (m < 25 || m > 80) watching++;
        else                       healthy++;
      }
    });
    return { critical, watching, healthy, noData };
  }, [zones, profilesById]);

  // Historical status counts — first-period snapshot for trend delta
  const historicalStatusCounts = useMemo(() => {
    let prevCritical = 0, prevWatching = 0, prevHealthy = 0;
    sortedZones.forEach(({ zone, profile }) => {
      const backendId = zone.backendZoneId;
      if (!backendId) return;
      const history = zoneHistory.get(backendId);
      if (!history || history.length < 2) return;
      const m = history[0].moisture;
      if (profile) {
        if (m < profile.moistureMin * 0.7)                           prevCritical++;
        else if (m < profile.moistureMin || m > profile.moistureMax) prevWatching++;
        else                                                          prevHealthy++;
      } else {
        if (m < 15)               prevCritical++;
        else if (m < 25 || m > 80) prevWatching++;
        else                       prevHealthy++;
      }
    });
    const hasHistory = prevCritical + prevWatching + prevHealthy > 0;
    return hasHistory ? { prevCritical, prevWatching, prevHealthy } : null;
  }, [sortedZones, zoneHistory]);

  // Live greenhouse averages from current zone readings
  const { avgMoisturePct, avgTempC } = useMemo(() => {
    const ms: number[] = [], ts: number[] = [];
    (zones ?? []).forEach((z) => {
      if (z.hasReading && z.soilMoisturePct !== null) ms.push(z.soilMoisturePct);
      if (z.soilTempC !== null) ts.push(z.soilTempC);
    });
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    return { avgMoisturePct: avg(ms), avgTempC: avg(ts) };
  }, [zones]);

  // Watering events
  const wateringEvents = useMemo(() => {
    const combined = [...(firestoreActivity.length > 0 ? firestoreActivity : activityLog)];
    return combined
      .filter((e) => e.type === 'watering')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [activityLog, firestoreActivity]);

  // Watering responses — correlate events with zone-level readings
  const wateringResponses: WateringResponse[] = useMemo(() => {
    const results: WateringResponse[] = [];
    wateringEvents.slice(0, 5).forEach((event) => {
      if (!event.visualZoneId) return;
      const visualZone = (zones ?? []).find((z) => z.visualLabel === event.visualZoneId);
      const backendId = visualZone?.backendZoneId;
      if (!backendId) return;
      const history = zoneHistory.get(backendId);
      if (!history || history.length < 2) return;
      const eventTs = new Date(event.timestamp).getTime();

      const nearest = (targetTs: number, windowMs: number): number | null => {
        let best: number | null = null;
        let bestDiff = Infinity;
        for (const r of history) {
          const diff = Math.abs(r.ts - targetTs);
          if (diff < windowMs && diff < bestDiff) { bestDiff = diff; best = r.moisture; }
        }
        return best;
      };

      const beforePct = nearest(eventTs - 20 * 60_000, 90 * 60_000);
      if (beforePct === null) return;
      // Peak = highest reading within 2h after watering
      const postReadings = history.filter((r) => r.ts > eventTs && r.ts < eventTs + 2 * 3_600_000);
      const peakPct = postReadings.length > 0 ? Math.max(...postReadings.map((r) => r.moisture)) : null;
      const after6h  = nearest(eventTs + 6 * 3_600_000, 2 * 3_600_000);
      const after12h = nearest(eventTs + 12 * 3_600_000, 3 * 3_600_000);

      if (peakPct !== null || after6h !== null) {
        results.push({ event, zoneId: event.visualZoneId, beforePct, peakPct, after6h, after12h });
      }
    });
    return results.slice(0, 3);
  }, [wateringEvents, zoneHistory, zones]);

  // Last watered per zone
  const lastWateredByZone = useMemo(() => {
    const map = new Map<string, string>();
    wateringEvents.forEach((e) => {
      if (e.visualZoneId && !map.has(e.visualZoneId)) map.set(e.visualZoneId, e.timestamp);
    });
    return map;
  }, [wateringEvents]);

  // Chart insight derived from trendData
  const chartInsight = useMemo((): string | null => {
    if (trendData.length < 2) return null;
    const first = trendData[0];
    const last  = trendData[trendData.length - 1];
    const mDelta = last.avgMoisture - first.avgMoisture;
    if (mDelta < -12) return 'Moisture has been dropping. Check the dry zones — some beds may need water soon.';
    if (mDelta < -4)  return 'Moisture is slowly going down. Keep an eye on the drier zones.';
    if (mDelta > 10)  return 'Moisture has gone up — watering looks like it helped.';
    if (mDelta > 4)   return 'Moisture is rising. Things are getting better.';
    return 'Greenhouse moisture has stayed steady. Nothing needs attention right now.';
  }, [trendData]);

  // Research stats
  const totalSamples = trendData.reduce((s, p) => s + p.sampleCount, 0);
  const uniquePlants = new Set((zones ?? []).map((z) => z.assignedPlant).filter(Boolean)).size;
  const zonesWithReadings = (zones ?? []).filter((z) => z.hasReading).length;

  // Always computed — calling useMemoFilteredZones conditionally inside JSX breaks hooks rules
  const filteredZones = useMemoFilteredZones(sortedZones, zoneSearch);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg, #f8f5ef)',
      display: 'flex', flexDirection: 'column',
      overscrollBehavior: 'contain',
    }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px 10px',
        background: 'var(--card)',
        borderBottom: '1px solid var(--line)',
        flexShrink: 0,
      }}>
        <button className="gm-icon-btn" onClick={onClose} aria-label="Back" style={{ fontSize: 20 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 18, color: 'var(--ink)', lineHeight: 1.1 }}>
            Trends & Analysis 📈
          </div>
          {greenhouseName && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{greenhouseName}</div>
          )}
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', overflowX: 'auto', flexShrink: 0,
        background: 'var(--card)', borderBottom: '1px solid var(--line)',
        scrollbarWidth: 'none',
      }}>
        {DASH_TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flexShrink: 0, padding: '10px 16px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
            border: 'none', borderBottom: activeTab === t.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            background: 'transparent', color: activeTab === t.id ? 'var(--primary)' : 'var(--ink-3)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ══ OVERVIEW ═════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <OverviewSection
            statusCounts={statusCounts}
            historicalStatusCounts={historicalStatusCounts}
            avgMoisturePct={avgMoisturePct}
            avgTempC={avgTempC}
            trendData={trendData}
            isLoading={isChartLoading}
            range={range}
            onRangeChange={setRange}
            simHistory={simHistory}
            chartInsight={chartInsight}
          />
        )}

        {/* ══ ZONES ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'zones' && (
          <ZonesSection
            filteredZones={filteredZones}
            allCount={(zones ?? []).length}
            search={zoneSearch}
            onSearch={setZoneSearch}
            lastWateredByZone={lastWateredByZone}
            zoneHistory={zoneHistory}
            readings={readings}
            range={range}
            onRangeChange={setRange}
          />
        )}

        {/* ══ PLANTS ══════════════════════════════════════════════════════════ */}
        {activeTab === 'plants' && (
          <PlantsSection
            plantGroups={plantGroups}
            readings={readings}
            zones={zones ?? []}
            range={range}
            onRangeChange={setRange}
          />
        )}

        {/* ══ WATERING ════════════════════════════════════════════════════════ */}
        {activeTab === 'watering' && (
          <WateringSection
            wateringEvents={wateringEvents}
            wateringResponses={wateringResponses}
            range={range}
            onRangeChange={setRange}
          />
        )}

        {/* ══ RESEARCH ════════════════════════════════════════════════════════ */}
        {activeTab === 'research' && (
          <ResearchSection
            totalSamples={totalSamples}
            wateringCount={wateringEvents.length}
            uniquePlants={uniquePlants}
            zonesWithReadings={zonesWithReadings}
            range={range}
          />
        )}

        <div style={{ height: 64 }} />
      </div>
    </div>
  );
}

// Hoisted helper so it's not a conditional hook inside the component
function useMemoFilteredZones(sortedZones: ZoneWithStats[], search: string): ZoneWithStats[] {
  return useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return sortedZones;
    return sortedZones.filter(({ zone, profile }) =>
      (zone.displayLabel ?? zone.visualLabel).toLowerCase().includes(q) ||
      profile?.name.toLowerCase().includes(q),
    );
  }, [sortedZones, search]);
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────

interface OverviewSectionProps {
  statusCounts: { critical: number; watching: number; healthy: number; noData: number };
  historicalStatusCounts: { prevCritical: number; prevWatching: number; prevHealthy: number } | null;
  avgMoisturePct: number | null;
  avgTempC: number | null;
  trendData: TrendPoint[];
  isLoading: boolean;
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  simHistory?: LatestReading[];
  chartInsight: string | null;
}

function OverviewSection({
  statusCounts, historicalStatusCounts,
  avgMoisturePct, avgTempC,
  trendData, isLoading, range, onRangeChange, simHistory,
  chartInsight,
}: OverviewSectionProps) {
  const totalSamples = trendData.reduce((s, p) => s + p.sampleCount, 0);
  const bucketNoun   = range === '24h' ? 'hr' : (range === '3m' || range === '1y') ? 'wk' : 'day';
  const hasTrendData = trendData.length >= 2;
  const noHistory    = !hasTrendData && !isLoading;
  const hasTemp      = trendData.some((p) => p.avgTemp > 0);

  return (
    <>
      {/* ── Section 1: Health Snapshot ────────────────────────────────────── */}
      <div className="gm-card" style={{ padding: 16, flexShrink: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 800, color: 'var(--ink-3)',
          textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12,
        }}>
          Greenhouse Health
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          <HealthChip
            value={statusCounts.critical}
            label="Critical"
            color="#ef4444"
            prevValue={historicalStatusCounts?.prevCritical ?? null}
            higherIsBad
          />
          <HealthChip
            value={statusCounts.watching}
            label="Watching"
            color="#f59e0b"
            prevValue={historicalStatusCounts?.prevWatching ?? null}
            higherIsBad
          />
          <HealthChip
            value={statusCounts.healthy}
            label="Healthy"
            color="#22c55e"
            prevValue={historicalStatusCounts?.prevHealthy ?? null}
            higherIsBad={false}
          />
        </div>

        {(avgMoisturePct !== null || avgTempC !== null) && (
          <div style={{ display: 'flex', background: 'var(--bg-sub, #f1ede6)', borderRadius: 12, overflow: 'hidden' }}>
            {avgMoisturePct !== null && (
              <div style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, marginBottom: 3 }}>💧 Avg moisture</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: MOISTURE_COLOR, fontFamily: "'Baloo 2', system-ui" }}>
                  {avgMoisturePct.toFixed(0)}%
                </div>
              </div>
            )}
            {avgMoisturePct !== null && avgTempC !== null && (
              <div style={{ width: 1, background: 'var(--line)', margin: '8px 0' }} />
            )}
            {avgTempC !== null && (
              <div style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, marginBottom: 3 }}>🌡 Avg soil temp</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: TEMP_COLOR, fontFamily: "'Baloo 2', system-ui" }}>
                  {avgTempC.toFixed(1)}°C
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Main Greenhouse Trend Chart ────────────────────────── */}
      <div className="gm-card" style={{ padding: '16px 14px 20px', flexShrink: 0 }}>
        {/* Chart title + range picker */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
            Greenhouse Conditions
          </div>
        </div>
        {/* Range picker — scrollable row directly above chart */}
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 10 }}>
          {RANGE_OPTIONS.map((r) => (
            <button key={r.id} onClick={() => onRangeChange(r.id)} style={{
              flexShrink: 0, padding: '4px 10px', borderRadius: 8, border: '1.5px solid',
              borderColor: range === r.id ? 'var(--primary)' : 'var(--line)',
              background: range === r.id ? 'var(--primary-soft)' : 'transparent',
              color: range === r.id ? 'var(--primary)' : 'var(--ink-3)',
              fontSize: 11, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              {r.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ height: 270, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 12, fontWeight: 600 }}>
            ⏳ Loading greenhouse history…
          </div>
        ) : noHistory ? (
          <div style={{ paddingTop: 24, paddingBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 40 }}>📡</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui" }}>
              No history yet
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', textAlign: 'center', maxWidth: 240, lineHeight: 1.6 }}>
              {simHistory
                ? 'Run the simulation longer to build trend data.'
                : 'More history will appear as sensor data is collected.'}
            </div>
          </div>
        ) : (
          <>
            {/* One clean chart — avg moisture (+ optional avg soil temp). No dashed lines. */}
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ top: 8, right: hasTemp ? 6 : 4, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="pct"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                {hasTemp && (
                  <YAxis
                    yAxisId="temp"
                    orientation="right"
                    domain={[0, 'auto']}
                    width={40}
                    tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}°`}
                  />
                )}
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={tooltipFormatter}
                  labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }}
                />
                <Line yAxisId="pct" type="monotone" dataKey="avgMoisture" stroke={MOISTURE_COLOR} strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: MOISTURE_COLOR }} />
                {hasTemp && (
                  <Line yAxisId="temp" type="monotone" dataKey="avgTemp" stroke={TEMP_COLOR} strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: TEMP_COLOR }} />
                )}
              </LineChart>
            </ResponsiveContainer>

            {/* Simple legend — at most two lines */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 18px', marginTop: 10 }}>
              <LegendDot color={MOISTURE_COLOR} label="Avg moisture" />
              {hasTemp && <LegendDot color={TEMP_COLOR} label="Avg soil temp" />}
            </div>
            <div style={{ fontSize: 10, color: '#b0b8c1', fontWeight: 600, textAlign: 'right', marginTop: 6 }}>
              {totalSamples} readings · {trendData.length} {bucketNoun}{trendData.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>

      {/* ── Section 3: One plain-language insight card ──────────────────── */}
      {hasTrendData && chartInsight && (
        <div className="gm-card" style={{
          padding: '14px 16px', flexShrink: 0,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>💡</span>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--ink)',
            lineHeight: 1.65, flex: 1, minWidth: 0,
          }}>
            {chartInsight}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Zones ────────────────────────────────────────────────────────────────────

function ZonesSection({ filteredZones, allCount, search, onSearch, lastWateredByZone, zoneHistory, readings, range, onRangeChange }: {
  filteredZones: ZoneWithStats[];
  allCount: number;
  search: string;
  onSearch: (v: string) => void;
  lastWateredByZone: Map<string, string>;
  zoneHistory: Map<string, Array<{ ts: number; moisture: number }>>;
  readings: LatestReading[];
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // Selected zone — falls back to the first (most urgent) so a chart is always shown
  const selected = filteredZones.find((z) => z.zone.visualLabel === selectedLabel) ?? filteredZones[0] ?? null;

  return (
    <>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', fontSize: 14, color: 'var(--ink-3)' }}>🔍</div>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search zone or plant…"
          style={{
            width: '100%', padding: '12px 14px 12px 40px', boxSizing: 'border-box',
            background: 'var(--card)', border: '1.5px solid var(--line)', borderRadius: 14,
            fontSize: 13, outline: 'none', color: 'var(--ink)', fontFamily: 'inherit', fontWeight: 600,
          }}
        />
      </div>

      {/* ── Selected zone detail: header + one moisture chart + plain sentence ── */}
      {selected && (
        <ZoneDetailCard
          zs={selected}
          history={selected.zone.backendZoneId ? zoneHistory.get(selected.zone.backendZoneId) : null}
          readings={readings}
          range={range}
          onRangeChange={onRangeChange}
        />
      )}

      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, padding: '0 2px' }}>
        Tap a zone · {filteredZones.length} of {allCount} zone{allCount !== 1 ? 's' : ''}
      </div>
      {filteredZones.length === 0 ? (
        <EmptyCard icon="🗺️" title="No zones found" sub="Try a different search term." />
      ) : (
        <div className="gm-card" style={{ padding: '0 14px' }}>
          {filteredZones.map(({ zone, profile, moisture }, i) => {
            const status = getSimpleStatus(zone.hasReading ? moisture : null, profile);
            const trend = moistureTrend(historyDelta(zone.backendZoneId ? zoneHistory.get(zone.backendZoneId) : null));
            const lastWatered = zone.visualLabel ? lastWateredByZone.get(zone.visualLabel) : null;
            const isSel = selected?.zone.visualLabel === zone.visualLabel;
            return (
              <div
                key={zone.visualLabel}
                onClick={() => setSelectedLabel(zone.visualLabel)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', margin: '0 -8px',
                  cursor: 'pointer', borderRadius: 12,
                  background: isSel ? 'var(--primary-soft)' : 'transparent',
                  borderBottom: i < filteredZones.length - 1 ? '1px solid var(--line)' : 'none',
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 9, background: status.color + '18', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>
                  {profile?.icon ?? '🌱'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {zone.displayLabel ?? zone.visualLabel}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile ? `${profile.name} · target ${profile.moistureMin}–${profile.moistureMax}%` : 'No plant assigned'}
                    {lastWatered && ` · watered ${fmtRelative(lastWatered)}`}
                  </div>
                  {trend && (
                    <div style={{ fontSize: 10, fontWeight: 800, color: trend.color, marginTop: 3 }}>
                      {trend.icon} {trend.label}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: status.color, fontFamily: "'Baloo 2', system-ui" }}>
                    {zone.hasReading ? `${moisture.toFixed(0)}%` : '—'}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: status.color + '18', color: status.color, whiteSpace: 'nowrap', display: 'inline-block' }}>{status.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// One selected zone: header, single moisture line chart, soil-temp text, plain sentence
function ZoneDetailCard({ zs, history, readings, range, onRangeChange }: {
  zs: ZoneWithStats;
  history: Array<{ ts: number; moisture: number }> | null | undefined;
  readings: LatestReading[];
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}) {
  const { zone, profile, moisture } = zs;
  const name = zone.displayLabel ?? zone.visualLabel;
  const status = getSimpleStatus(zone.hasReading ? moisture : null, profile);
  const trend = moistureTrend(historyDelta(history));
  const chartData = useMemo(
    () => zone.backendZoneId ? buildZoneChartData(zone.backendZoneId, readings, range) : [],
    [zone.backendZoneId, readings, range],
  );
  const hasChart = chartData.length >= 2;

  return (
    <div className="gm-card" style={{ padding: '14px 14px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: status.color + '18', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>
          {profile?.icon ?? '🌱'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>
            {profile ? `${profile.name} · target ${profile.moistureMin}–${profile.moistureMax}%` : 'No plant assigned'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 25, fontWeight: 800, color: status.color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>
            {zone.hasReading ? `${moisture.toFixed(0)}%` : '—'}
          </div>
          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 5, background: status.color + '18', color: status.color }}>{status.label}</span>
        </div>
      </div>

      {/* Range picker */}
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 10 }}>
        {RANGE_OPTIONS.map((r) => (
          <button key={r.id} onClick={() => onRangeChange(r.id)} style={{
            flexShrink: 0, padding: '4px 10px', borderRadius: 8, border: '1.5px solid',
            borderColor: range === r.id ? 'var(--primary)' : 'var(--line)',
            background: range === r.id ? 'var(--primary-soft)' : 'transparent',
            color: range === r.id ? 'var(--primary)' : 'var(--ink-3)',
            fontSize: 11, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* One simple moisture chart — moisture only */}
      {hasChart ? (
        <>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [`${value}%`, 'Soil moisture']}
                labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 10 }}
              />
              {profile && <ReferenceArea y1={profile.moistureMin} y2={profile.moistureMax} fill="#22c55e" fillOpacity={0.09} />}
              <Line type="monotone" dataKey="moisture" stroke={status.color} strokeWidth={3} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: status.color }} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
            <LegendDot color={status.color} label="Soil moisture" />
            {profile && <LegendDot color="#22c55e" label={`Target ${profile.moistureMin}–${profile.moistureMax}%`} />}
          </div>
        </>
      ) : (
        <div style={{ padding: '18px 12px', display: 'grid', placeItems: 'center', background: 'var(--bg-sub)', borderRadius: 12, fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
          📡 More trends will appear as sensors collect data.
        </div>
      )}

      {/* Soil temp as plain text — not on the chart */}
      {zone.soilTempC !== null && (
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, marginTop: 8 }}>
          🌡 Soil temp now: <span style={{ color: 'var(--ink-2)' }}>{zone.soilTempC.toFixed(1)}°C</span>
        </div>
      )}

      {/* Plain-language sentence */}
      <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-sub, #f1ede6)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, lineHeight: 1.5 }}>
        {zoneSentence(name, status.label, trend, range)}
      </div>
    </div>
  );
}

// ─── Plants ───────────────────────────────────────────────────────────────────

function plantGroupStatus(g: PlantGroup) {
  if (g.needsWater > 0) return { label: 'Needs water', color: '#f59e0b' };
  if (g.tooWet > 0)     return { label: 'Too wet',     color: '#0ea5e9' };
  return { label: 'Good', color: '#22c55e' };
}

function PlantsSection({ plantGroups, readings, zones, range, onRangeChange }: {
  plantGroups: PlantGroup[];
  readings: LatestReading[];
  zones: VisualZone[];
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (plantGroups.length === 0) {
    return <EmptyCard icon="🌿" title="No plants assigned" sub="Assign plant profiles to zones in the Map tab." />;
  }

  const selected = plantGroups.find((g) => g.profile.id === selectedId) ?? plantGroups[0];

  return (
    <>
      {/* ── Selected plant: header + one moisture line + plain sentence ── */}
      <PlantDetailCard g={selected} readings={readings} zones={zones} range={range} onRangeChange={onRangeChange} />

      {/* ── Tappable plant list ── */}
      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, padding: '0 2px' }}>Tap a plant type</div>
      <div className="gm-card" style={{ padding: '0 14px' }}>
        {plantGroups.map((g, i) => {
          const avg = g.moistureCount > 0 ? g.totalMoisture / g.moistureCount : 0;
          const status = plantGroupStatus(g);
          const isSel = selected.profile.id === g.profile.id;
          return (
            <div
              key={g.profile.id}
              onClick={() => setSelectedId(g.profile.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '11px 8px', margin: '0 -8px',
                cursor: 'pointer', borderRadius: 12,
                background: isSel ? 'var(--primary-soft)' : 'transparent',
                borderBottom: i < plantGroups.length - 1 ? '1px solid var(--line)' : 'none',
              }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 19, flexShrink: 0 }}>
                {g.profile.icon ?? '🌱'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{g.profile.name}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                  {g.count} zone{g.count !== 1 ? 's' : ''} · target {g.profile.moistureMin}–{g.profile.moistureMax}%
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: status.color, fontFamily: "'Baloo 2', system-ui" }}>{avg.toFixed(0)}%</div>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: status.color + '18', color: status.color, whiteSpace: 'nowrap', display: 'inline-block' }}>{status.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// One selected plant type: header, single moisture line (one line only), plain sentence
function PlantDetailCard({ g, readings, zones, range, onRangeChange }: {
  g: PlantGroup;
  readings: LatestReading[];
  zones: VisualZone[];
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}) {
  const avg = g.moistureCount > 0 ? g.totalMoisture / g.moistureCount : 0;
  const status = plantGroupStatus(g);
  const chartData = useMemo(() => buildPlantChartData(g.profile.id, zones, readings, range), [g.profile.id, zones, readings, range]);
  const hasChart = chartData.length >= 2;
  const delta = chartData.length >= 2 ? chartData[chartData.length - 1].moisture - chartData[0].moisture : null;
  const trend = moistureTrend(delta, 'plant');

  return (
    <div className="gm-card" style={{ padding: '14px 14px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>
          {g.profile.icon ?? '🌱'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>{g.profile.name}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>
            {g.count} zone{g.count !== 1 ? 's' : ''} · target {g.profile.moistureMin}–{g.profile.moistureMax}%
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 25, fontWeight: 800, color: status.color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>{avg.toFixed(0)}%</div>
          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 5, background: status.color + '18', color: status.color }}>{status.label}</span>
        </div>
      </div>

      {/* Range picker */}
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 10 }}>
        {RANGE_OPTIONS.map((r) => (
          <button key={r.id} onClick={() => onRangeChange(r.id)} style={{
            flexShrink: 0, padding: '4px 10px', borderRadius: 8, border: '1.5px solid',
            borderColor: range === r.id ? 'var(--primary)' : 'var(--line)',
            background: range === r.id ? 'var(--primary-soft)' : 'transparent',
            color: range === r.id ? 'var(--primary)' : 'var(--ink-3)',
            fontSize: 11, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* One simple moisture line only (no temp, no dashed lines) */}
      {hasChart ? (
        <>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [`${value}%`, 'Avg moisture']}
                labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 10 }}
              />
              <ReferenceArea y1={g.profile.moistureMin} y2={g.profile.moistureMax} fill="#22c55e" fillOpacity={0.09} />
              <Line type="monotone" dataKey="moisture" stroke={status.color} strokeWidth={3} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: status.color }} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
            <LegendDot color={status.color} label="Avg moisture" />
            <LegendDot color="#22c55e" label={`Target ${g.profile.moistureMin}–${g.profile.moistureMax}%`} />
          </div>
        </>
      ) : (
        <div style={{ padding: '18px 12px', display: 'grid', placeItems: 'center', background: 'var(--bg-sub)', borderRadius: 12, fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
          📡 More trends will appear as sensors collect data.
        </div>
      )}

      {/* Zone status pills */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
        {g.needsWater > 0 && <CountPill value={g.needsWater} label="need water" color="#f59e0b" />}
        {g.tooWet > 0    && <CountPill value={g.tooWet}    label="too wet"    color="#0ea5e9" />}
        {g.good > 0      && <CountPill value={g.good}      label="healthy"    color="#22c55e" />}
      </div>

      {/* Plain-language sentence */}
      <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-sub, #f1ede6)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, lineHeight: 1.5 }}>
        {plantSentence(g.profile.name, status.label, trend)}
      </div>
    </div>
  );
}

// ─── Watering ─────────────────────────────────────────────────────────────────

function WateringSection({ wateringEvents, wateringResponses, range, onRangeChange }: {
  wateringEvents: ActivityEntry[];
  wateringResponses: WateringResponse[];
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}) {
  if (wateringEvents.length === 0) {
    return (
      <EmptyCard
        icon="💧"
        title="No watering events yet"
        sub="Water zones from Today's Tasks or from the Map tab to build your watering history."
      />
    );
  }

  const byZone = new Map<string, { count: number; lastTs: string; plantName?: string; totalMl: number }>();
  wateringEvents.forEach((e) => {
    const key = e.visualZoneId ?? 'unknown';
    if (!byZone.has(key)) byZone.set(key, { count: 0, lastTs: e.timestamp, plantName: e.plantName, totalMl: 0 });
    const z = byZone.get(key)!;
    z.count++;
    z.totalMl += e.amountMl ?? 0;
    if (new Date(e.timestamp) > new Date(z.lastTs)) z.lastTs = e.timestamp;
  });

  const chartData = buildWateringChartData(wateringEvents, range);
  const hasVol = wateringEvents.some(e => (e.amountMl ?? 0) > 0);
  const totalMl = wateringEvents.reduce((s, e) => s + (e.amountMl ?? 0), 0);

  return (
    <>
      {/* ── Did watering help? Before/after moisture cards ── */}
      <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', padding: '0 2px' }}>
        Did watering help? 💧
      </div>
      {wateringResponses.length > 0 ? (
        wateringResponses.map((r, i) => <WaterHelpCard key={r.event.id ?? i} r={r} />)
      ) : (
        <div className="gm-card" style={{ padding: '14px 16px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>📡</span>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Before/after results will appear here once sensors record moisture around your watering times.
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { val: wateringEvents.length, label: 'EVENTS',    color: '#0ea5e9' },
          { val: byZone.size,           label: 'ZONES',     color: '#0ea5e9' },
          { val: totalMl > 0 ? `${(totalMl / 1000).toFixed(1)}L` : '—', label: 'VOLUME', color: '#0ea5e9' },
        ].map(({ val, label, color }) => (
          <div key={label} style={{ background: 'var(--card)', border: '1.5px solid var(--line)', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 22, fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Range picker */}
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {RANGE_OPTIONS.map((r) => (
          <button key={r.id} onClick={() => onRangeChange(r.id)} style={{
            flexShrink: 0, padding: '4px 10px', borderRadius: 8, border: '1.5px solid',
            borderColor: range === r.id ? 'var(--primary)' : 'var(--line)',
            background: range === r.id ? 'var(--primary-soft)' : 'transparent',
            color: range === r.id ? 'var(--primary)' : 'var(--ink-3)',
            fontSize: 11, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
          }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Watering activity bar chart */}
      {chartData.length >= 1 && (
        <div className="gm-card" style={{ padding: '16px 14px 20px' }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 12 }}>
            Watering Activity
          </div>
          {chartData.length < 2 ? (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, padding: '12px 0' }}>
              Log watering events across multiple days to see the pattern chart.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => hasVol ? `${v}ml` : `${v}`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => {
                      if (name === 'totalMl') return [`${value}ml`, 'Volume watered'];
                      if (name === 'count')   return [value, 'Events'];
                      return [value, name];
                    }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 10 }}
                  />
                  <Bar
                    dataKey={hasVol ? 'totalMl' : 'count'}
                    name={hasVol ? 'totalMl' : 'count'}
                    fill="#0ea5e9" radius={[5, 5, 0, 0]} fillOpacity={0.85}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textAlign: 'center', marginTop: 4 }}>
                {hasVol ? 'Volume watered (ml) per period' : 'Watering events per period'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Last watered by zone */}
      <div className="gm-card" style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 12 }}>
          Last watered by zone
        </div>
        {[...byZone.entries()].map(([zoneId, info]) => {
          const barPct = Math.round((info.count / Math.max(...[...byZone.values()].map(v => v.count))) * 100);
          return (
            <div key={zoneId} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>
                  {zoneId}
                  {info.plantName && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)' }}> · {info.plantName}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {info.totalMl > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9' }}>{info.totalMl}ml</span>}
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-2)' }}>{info.count}×</span>
                </div>
              </div>
              <div style={{ height: 6, background: 'var(--line)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${barPct}%`, background: '#0ea5e9', borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>
                last {fmtRelative(info.lastTs)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent events */}
      <div className="gm-card" style={{ padding: '0 14px' }}>
        <DashLabel>Recent events</DashLabel>
        {wateringEvents.slice(0, 10).map((e, i) => (
          <div key={e.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
            borderBottom: i < Math.min(wateringEvents.length, 10) - 1 ? '1px solid var(--line)' : 'none',
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#e0f2fe', display: 'grid', placeItems: 'center', fontSize: 13, flexShrink: 0 }}>💧</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.visualZoneId ?? 'Zone'}
                {e.plantName && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {e.plantName}</span>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{fmtRelative(e.timestamp)}</div>
            </div>
            {e.amountMl && (
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0ea5e9', flexShrink: 0 }}>{e.amountMl}ml</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// One before/after watering result — answers "did watering help?" in plain words
function WaterHelpCard({ r }: { r: WateringResponse }) {
  const after = r.peakPct ?? r.after6h ?? r.after12h;
  const diff = after !== null ? after - r.beforePct : null;
  let result: { label: string; color: string; icon: string };
  if (diff === null)      result = { label: 'No reading yet', color: '#94a3b8', icon: '⏳' };
  else if (diff >= 8)     result = { label: 'Watering helped', color: '#22c55e', icon: '✅' };
  else if (diff >= 2)     result = { label: 'Small rise',      color: '#0ea5e9', icon: '💧' };
  else                    result = { label: 'Little change',   color: '#f59e0b', icon: '➖' };

  const plantName = r.event.plantName;
  return (
    <div className="gm-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>💧</span>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.zoneId}{plantName && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {plantName}</span>}
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 8, background: result.color + '18', color: result.color, whiteSpace: 'nowrap' }}>
          {result.icon} {result.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BeforeAfterTile label="Before watering" value={`${Math.round(r.beforePct)}%`} color="#94a3b8" />
        <span style={{ fontSize: 18, color: 'var(--ink-3)', fontWeight: 800 }}>→</span>
        <BeforeAfterTile label="After watering" value={after !== null ? `${Math.round(after)}%` : '—'} color={result.color} />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 8 }}>
        Watered {fmtRelative(r.event.timestamp)}
      </div>
    </div>
  );
}

function BeforeAfterTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-sub, #f1ede6)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', marginTop: 5 }}>{label}</div>
    </div>
  );
}

// ─── Research ─────────────────────────────────────────────────────────────────

function ResearchSection({ totalSamples, wateringCount, uniquePlants, zonesWithReadings, range }: {
  totalSamples: number; wateringCount: number; uniquePlants: number; zonesWithReadings: number; range: TimeRange;
}) {
  return (
    <>
      <div className="gm-card" style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 12 }}>Dataset metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ResearchStat label="Readings" value={totalSamples.toLocaleString()} sub={`in ${TIME_RANGE_LABELS[range]}`} />
          <ResearchStat label="Watering events" value={wateringCount.toLocaleString()} sub="logged" />
          <ResearchStat label="Plant types" value={uniquePlants.toString()} sub="tracked" />
          <ResearchStat label="Active zones" value={zonesWithReadings.toString()} sub="with readings" />
        </div>
      </div>
      <div className="gm-card" style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 8 }}>Export dataset</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, lineHeight: 1.5, marginBottom: 12 }}>
          Download your greenhouse data as CSV for research or analysis in external tools.
        </div>
        <button className="gm-btn ghost" style={{ width: '100%', opacity: 0.5 }} disabled>
          ↓ Export readings (coming soon)
        </button>
      </div>
      <div className="gm-card" style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 15, color: 'var(--ink)', marginBottom: 8 }}>About this data</div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, lineHeight: 1.6 }}>
          Readings are collected via ESP32 sensors and stored in Firestore. Moisture percentages are calibrated from raw ADC values. Temperature readings use DS18B20 probes via OneWire. Data is timestamped at the server on ingestion.
        </div>
      </div>
    </>
  );
}

// ─── Small shared sub-components ─────────────────────────────────────────────

function HealthChip({ value, label, color, prevValue, higherIsBad }: {
  value: number; label: string; color: string;
  prevValue: number | null; higherIsBad: boolean;
}) {
  const delta = prevValue !== null ? value - prevValue : null;
  const isUp = delta !== null && delta > 0;
  const isWorseDir = higherIsBad ? isUp : (delta !== null && delta < 0);
  const deltaColor = delta === null || delta === 0 ? '#94a3b8' : isWorseDir ? '#ef4444' : '#22c55e';
  return (
    <div style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--bg-sub, #f1ede6)', borderRadius: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Baloo 2', system-ui" }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, marginTop: 1 }}>{label}</div>
      {delta !== null && delta !== 0 && (
        <div style={{ fontSize: 9, fontWeight: 800, color: deltaColor, marginTop: 3 }}>
          {isUp ? `↑ +${delta}` : `↓ ${delta}`}
        </div>
      )}
      {delta === 0 && (
        <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', marginTop: 3 }}>→</div>
      )}
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {dashed ? (
        <svg width="18" height="10" viewBox="0 0 18 10" style={{ flexShrink: 0 }}>
          <line x1="0" y1="5" x2="18" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray="4 2" />
        </svg>
      ) : (
        <span style={{ width: 18, height: 2.5, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
      )}
      <span style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 700 }}>{label}</span>
    </div>
  );
}


function CountPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function ResearchStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--bg-sub)', borderRadius: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', fontFamily: "'Baloo 2', system-ui", marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{sub}</div>
    </div>
  );
}

function EmptyCard({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="gm-card" style={{ padding: 26, textAlign: 'center', color: 'var(--ink-3)' }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>{sub}</div>
    </div>
  );
}

function DashLabel({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--ink-3)', padding: '8px 0 6px',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block' }} />}
      {children}
    </div>
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function fmtRelative(isoTs: string): string {
  const diff = Date.now() - new Date(isoTs).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
