import { useMemo, useState } from 'react';
import {
  LineChart, Line, CartesianGrid,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
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
const MOISTURE_IN_COLOR  = '#0ea5e9';  // soil moisture inside GH — solid blue
const MOISTURE_OUT_COLOR = '#93c5fd';  // soil moisture outside  — light blue dashed
const TEMP_IN_COLOR      = '#22c55e';  // soil temp inside GH    — solid green
const TEMP_OUT_COLOR     = '#86efac';  // soil temp outside       — light green dashed
const ENV_TEMP_COLOR     = '#f59e0b';  // RPi air temp            — amber
const ENV_HUM_COLOR      = '#a855f7';  // RPi air humidity        — purple
// Aliases used by health/stats sections
const MOISTURE_COLOR = MOISTURE_IN_COLOR;
const TEMP_COLOR     = TEMP_IN_COLOR;

const TOOLTIP_LABELS: Record<string, { label: string; unit: string }> = {
  avgMoisture:        { label: 'Avg moisture',       unit: '%'  },
  avgTemp:            { label: 'Avg soil temp',      unit: '°C' },
  avgSoilMoistureIn:  { label: 'Moisture (inside)',  unit: '%'  },
  avgSoilMoistureOut: { label: 'Moisture (outside)', unit: '%'  },
  avgSoilTempIn:      { label: 'Soil temp (inside)', unit: '°C' },
  avgSoilTempOut:     { label: 'Soil temp (outside)',unit: '°C' },
  envTempC:           { label: 'Air temp (RPi)',     unit: '°C' },
  envHumidityPct:     { label: 'Humidity (RPi)',     unit: '%'  },
};

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

// ─── Shared types ─────────────────────────────────────────────────────────────

interface ZoneWithStats {
  zone: VisualZone;
  profile: PlantProfile | null;
  moisture: number;
  label: string;
  color: string;
  urgency: number;
}

interface ZoneWithChange extends ZoneWithStats {
  delta: number | null;           // moisture change over period (negative = drying)
  ratePerHour: number | null;     // %/hour (negative = drying)
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

  // Zone changes — sorted by absolute rate of change
  const zoneChanges: ZoneWithChange[] = useMemo(() => {
    return sortedZones
      .map((zs) => {
        const backendId = zs.zone.backendZoneId;
        const history = backendId ? zoneHistory.get(backendId) : null;
        let delta: number | null = null;
        let ratePerHour: number | null = null;
        if (history && history.length >= 2) {
          const first = history[0];
          const last  = history[history.length - 1];
          const hours = (last.ts - first.ts) / 3_600_000;
          if (hours >= 0.1) {
            delta = last.moisture - first.moisture;
            ratePerHour = delta / hours;
          }
        }
        return { ...zs, delta, ratePerHour };
      })
      .sort((a, b) => {
        // Primary: fastest drying first; secondary: urgency
        const rA = a.ratePerHour ?? 0;
        const rB = b.ratePerHour ?? 0;
        // Zones with no rate data go last
        if (a.ratePerHour === null && b.ratePerHour === null) return b.urgency - a.urgency;
        if (a.ratePerHour === null) return 1;
        if (b.ratePerHour === null) return -1;
        return Math.abs(rB) - Math.abs(rA);
      });
  }, [sortedZones, zoneHistory]);

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
    const tDelta = last.avgTemp - first.avgTemp;
    if (mDelta < -15 && tDelta > 2) return 'Temperature rose while moisture dropped — heat is accelerating drying.';
    if (mDelta < -15) return 'Significant moisture loss over this period. Zones may need attention soon.';
    if (mDelta < -5)  return 'Steady moisture decline. Monitor closely and consider watering soon.';
    if (mDelta > 12)  return 'Moisture levels recovered — likely following a recent watering event.';
    if (mDelta > 4)   return 'Gradual moisture rise detected. Conditions are improving.';
    return 'Conditions remained relatively stable across this period.';
  }, [trendData]);

  // Greenhouse insights
  const ghInsights = useMemo((): string[] => {
    const result: string[] = [];
    // Fastest-drying zone
    const drying = zoneChanges.find((z) => z.ratePerHour !== null && z.ratePerHour < -1.5);
    if (drying) {
      result.push(
        `${drying.zone.displayLabel ?? drying.zone.visualLabel} is drying fastest` +
        ` (${Math.abs(drying.ratePerHour!).toFixed(1)}%/hr).`,
      );
    }
    // Plant group needing most water
    const dryGroup = plantGroups.find((g) => g.needsWater > 0);
    if (dryGroup) {
      result.push(
        `${dryGroup.profile.name} zones need attention — ` +
        `${dryGroup.needsWater} of ${dryGroup.count} below target moisture.`,
      );
    }
    // Stable plant group
    const stable = plantGroups.find((g) => g.needsWater === 0 && g.tooWet === 0 && g.good > 0);
    if (stable) {
      result.push(`${stable.profile.name} is stable — all ${stable.good} zone${stable.good > 1 ? 's' : ''} within range.`);
    }
    // Temp/moisture trend correlation
    if (trendData.length >= 3) {
      const first = trendData[0];
      const last  = trendData[trendData.length - 1];
      const mDrop = first.avgMoisture - last.avgMoisture;
      const tRise = last.avgTemp - first.avgTemp;
      if (mDrop > 8 && tRise > 1.5) {
        result.push('Temperature increases are correlating with faster moisture loss.');
      }
    }
    // Watering effect
    if (wateringResponses.length > 0) {
      const r = wateringResponses[0];
      if (r.peakPct !== null && r.peakPct - r.beforePct > 10) {
        result.push(`Watering ${r.zoneId} raised moisture by ${Math.round(r.peakPct - r.beforePct)}%.`);
      }
    }
    if (result.length === 0 && statusCounts.healthy > 0) {
      result.push('All tracked zones are within their target moisture ranges. Well done!');
    }
    if (result.length === 0) {
      result.push('Collect more sensor history to unlock greenhouse behavior insights.');
    }
    return result.slice(0, 5);
  }, [zoneChanges, plantGroups, trendData, wateringResponses, statusCounts]);

  // Research stats
  const totalSamples = trendData.reduce((s, p) => s + p.sampleCount, 0);
  const uniquePlants = new Set((zones ?? []).map((z) => z.assignedPlant).filter(Boolean)).size;
  const zonesWithReadings = (zones ?? []).filter((z) => z.hasReading).length;

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
            ghInsights={ghInsights}
          />
        )}

        {/* ══ ZONES ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'zones' && (
          <ZonesSection
            filteredZones={useMemoFilteredZones(sortedZones, zoneSearch)}
            allCount={(zones ?? []).length}
            search={zoneSearch}
            onSearch={setZoneSearch}
            lastWateredByZone={lastWateredByZone}
          />
        )}

        {/* ══ PLANTS ══════════════════════════════════════════════════════════ */}
        {activeTab === 'plants' && <PlantsSection plantGroups={plantGroups} />}

        {/* ══ WATERING ════════════════════════════════════════════════════════ */}
        {activeTab === 'watering' && <WateringSection wateringEvents={wateringEvents} />}

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
  ghInsights: string[];
}

function OverviewSection({
  statusCounts, historicalStatusCounts,
  avgMoisturePct, avgTempC,
  trendData, isLoading, range, onRangeChange, simHistory,
  chartInsight, ghInsights,
}: OverviewSectionProps) {
  const totalSamples = trendData.reduce((s, p) => s + p.sampleCount, 0);
  const bucketNoun   = range === '24h' ? 'hr' : (range === '3m' || range === '1y') ? 'wk' : 'day';
  const hasTrendData = trendData.length >= 2;
  const noHistory    = !hasTrendData && !isLoading;
  const insights     = ghInsights.slice(0, 3);

  // Detect which split series have data
  const hasMoistureIn  = trendData.some((p) => p.avgSoilMoistureIn  !== null);
  const hasMoistureOut = trendData.some((p) => p.avgSoilMoistureOut !== null);
  const hasTempIn      = trendData.some((p) => p.avgSoilTempIn      !== null);
  const hasTempOut     = trendData.some((p) => p.avgSoilTempOut     !== null);
  const hasEnvTemp     = trendData.some((p) => p.envTempC           !== null);
  const hasEnvHum      = trendData.some((p) => p.envHumidityPct     !== null);

  // Fall back to combined lines when no GH-prefix zone data (simulation mode uses zone-0X-Y IDs)
  const hasAnySplit    = hasMoistureIn || hasMoistureOut || hasTempIn || hasTempOut;
  const showCombined   = !hasAnySplit;
  const hasCombinedTemp = trendData.some((p) => p.avgTemp > 0);
  const showRightAxis  = hasEnvTemp || hasTempIn || hasTempOut || (showCombined && hasCombinedTemp);

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
            {/* Multi-series chart — left Y=pct, right Y=°C */}
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData} margin={{ top: 8, right: showRightAxis ? 4 : 8, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                {/* Left axis: moisture % and humidity % */}
                <YAxis
                  yAxisId="pct"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                {/* Right axis: temperature °C */}
                {showRightAxis && (
                  <YAxis
                    yAxisId="temp"
                    orientation="right"
                    domain={['auto', 'auto']}
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

                {showCombined ? (
                  <>
                    <Line yAxisId="pct"  type="monotone" dataKey="avgMoisture" stroke={MOISTURE_IN_COLOR} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: MOISTURE_IN_COLOR }} />
                    {hasCombinedTemp && <Line yAxisId="temp" type="monotone" dataKey="avgTemp" stroke={TEMP_IN_COLOR} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: TEMP_IN_COLOR }} />}
                  </>
                ) : (
                  <>
                    {hasMoistureIn  && <Line yAxisId="pct"  type="monotone" dataKey="avgSoilMoistureIn"  stroke={MOISTURE_IN_COLOR}  strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: MOISTURE_IN_COLOR }}  />}
                    {hasMoistureOut && <Line yAxisId="pct"  type="monotone" dataKey="avgSoilMoistureOut" stroke={MOISTURE_OUT_COLOR} strokeWidth={2.5} dot={false} strokeDasharray="5 3" activeDot={{ r: 5, strokeWidth: 0, fill: MOISTURE_OUT_COLOR }} />}
                    {hasTempIn      && <Line yAxisId="temp" type="monotone" dataKey="avgSoilTempIn"      stroke={TEMP_IN_COLOR}      strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: TEMP_IN_COLOR }}      />}
                    {hasTempOut     && <Line yAxisId="temp" type="monotone" dataKey="avgSoilTempOut"     stroke={TEMP_OUT_COLOR}     strokeWidth={2.5} dot={false} strokeDasharray="5 3" activeDot={{ r: 5, strokeWidth: 0, fill: TEMP_OUT_COLOR }}     />}
                  </>
                )}
                {hasEnvTemp && <Line yAxisId="temp" type="monotone" dataKey="envTempC"       stroke={ENV_TEMP_COLOR} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: ENV_TEMP_COLOR }} />}
                {hasEnvHum  && <Line yAxisId="pct"  type="monotone" dataKey="envHumidityPct" stroke={ENV_HUM_COLOR}  strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: ENV_HUM_COLOR  }} />}
              </LineChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 14px', marginTop: 10, marginBottom: 2 }}>
              {showCombined ? (
                <>
                  <LegendDot color={MOISTURE_IN_COLOR} label="Avg moisture" />
                  {hasCombinedTemp && <LegendDot color={TEMP_IN_COLOR} label="Avg soil temp" />}
                </>
              ) : (
                <>
                  {hasMoistureIn  && <LegendDot color={MOISTURE_IN_COLOR}  label="Moisture (in)"  />}
                  {hasMoistureOut && <LegendDot color={MOISTURE_OUT_COLOR} label="Moisture (out)" dashed />}
                  {hasTempIn      && <LegendDot color={TEMP_IN_COLOR}      label="Soil temp (in)"  />}
                  {hasTempOut     && <LegendDot color={TEMP_OUT_COLOR}     label="Soil temp (out)" dashed />}
                </>
              )}
              {hasEnvTemp && <LegendDot color={ENV_TEMP_COLOR} label="Air temp (RPi)"     />}
              {hasEnvHum  && <LegendDot color={ENV_HUM_COLOR}  label="Humidity (RPi)"     />}
            </div>

            {/* Chart insight + reading count */}
            {chartInsight && (
              <div style={{
                marginTop: 10, padding: '8px 12px',
                background: 'var(--bg-sub, #f1ede6)', borderRadius: 10,
                fontSize: 12, color: 'var(--ink-2)', fontWeight: 600,
                lineHeight: 1.5, fontStyle: 'italic',
              }}>
                {chartInsight}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#b0b8c1', fontWeight: 600, textAlign: 'right', marginTop: 6 }}>
              {totalSamples} readings · {trendData.length} {bucketNoun}{trendData.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>

      {/* ── Section 3: Insight Summary — one card per insight ───────────── */}
      {insights.map((text, i) => (
        <div key={i} className="gm-card" style={{
          padding: '14px 16px', flexShrink: 0,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
            {i === 0 ? '💡' : i === 1 ? '🌿' : '📊'}
          </span>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--ink)',
            lineHeight: 1.65, flex: 1, minWidth: 0,
          }}>
            {text}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Zones ────────────────────────────────────────────────────────────────────

function ZonesSection({ filteredZones, allCount, search, onSearch, lastWateredByZone }: {
  filteredZones: ZoneWithStats[];
  allCount: number;
  search: string;
  onSearch: (v: string) => void;
  lastWateredByZone: Map<string, string>;
}) {
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
      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700, padding: '0 2px' }}>
        {filteredZones.length} of {allCount} zone{allCount !== 1 ? 's' : ''}
      </div>
      {filteredZones.length === 0 ? (
        <EmptyCard icon="🗺️" title="No zones found" sub="Try a different search term." />
      ) : (
        <div className="gm-card" style={{ padding: '0 14px' }}>
          {filteredZones.map(({ zone, profile, moisture, label, color }, i) => {
            const lastWatered = zone.visualLabel ? lastWateredByZone.get(zone.visualLabel) : null;
            return (
              <div key={zone.visualLabel} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                borderBottom: i < filteredZones.length - 1 ? '1px solid var(--line)' : 'none',
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: color + '18', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>
                  {profile?.icon ?? '🌱'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {zone.displayLabel ?? zone.visualLabel}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                    {profile ? `${profile.name} · target ${profile.moistureMin}–${profile.moistureMax}%` : 'No plant assigned'}
                    {lastWatered && ` · watered ${fmtRelative(lastWatered)}`}
                  </div>
                  <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, moisture)}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color }}>{moisture.toFixed(0)}%</div>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: color + '18', color }}>{label}</span>
                  {zone.soilTempC !== null && (
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{zone.soilTempC.toFixed(1)}°C</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Plants ───────────────────────────────────────────────────────────────────

function PlantsSection({ plantGroups }: { plantGroups: PlantGroup[] }) {
  if (plantGroups.length === 0) {
    return <EmptyCard icon="🌿" title="No plants assigned" sub="Assign plant profiles to zones in the Map tab." />;
  }
  return (
    <>
      {plantGroups.map((g) => {
        const avg = g.moistureCount > 0 ? g.totalMoisture / g.moistureCount : 0;
        const urgentColor = g.needsWater > 0 ? '#f59e0b' : g.tooWet > 0 ? '#0ea5e9' : '#22c55e';
        const urgentLabel = g.needsWater > 0 ? 'Drying fast' : g.tooWet > 0 ? 'Too wet' : 'Stable';
        return (
          <div key={g.profile.id} className="gm-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>
                {g.profile.icon ?? '🌱'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>{g.profile.name}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 7, background: urgentColor + '18', color: urgentColor }}>{urgentLabel}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>
                  {g.count} zone{g.count !== 1 ? 's' : ''} · target {g.profile.moistureMin}–{g.profile.moistureMax}%
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: urgentColor }}>{avg.toFixed(0)}%</div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600 }}>avg</div>
              </div>
            </div>
            <div style={{ marginTop: 12, position: 'relative', height: 8, borderRadius: 4, background: 'var(--line)' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${g.profile.moistureMin}%`, width: `${g.profile.moistureMax - g.profile.moistureMin}%`, background: '#22c55e22', borderRadius: 4 }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.min(100, avg)}%`, background: urgentColor, borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
              {g.needsWater > 0 && <CountPill value={g.needsWater} label="need water" color="#f59e0b" />}
              {g.tooWet > 0    && <CountPill value={g.tooWet}    label="too wet"    color="#0ea5e9" />}
              {g.good > 0      && <CountPill value={g.good}      label="healthy"    color="#22c55e" />}
            </div>
            {g.profile.notes && (
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10, fontStyle: 'italic', lineHeight: 1.4 }}>{g.profile.notes}</div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Watering ─────────────────────────────────────────────────────────────────

function WateringSection({ wateringEvents }: { wateringEvents: ActivityEntry[] }) {
  if (wateringEvents.length === 0) {
    return (
      <>
        <EmptyCard icon="💧" title="No watering events yet" sub="Water zones from Today's Tasks or from the Map tab to build your watering history." />
        <div className="gm-card" style={{ padding: 14 }}>
          <DashLabel>Watering response</DashLabel>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, lineHeight: 1.5 }}>
            Recovery curves (before → 1h → 6h → 24h) will appear here once you have watering events and live sensor readings in the same time window.
          </div>
        </div>
      </>
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
  return (
    <>
      <div className="gm-card" style={{ padding: '0 14px' }}>
        <DashLabel>Recent watering events</DashLabel>
        {wateringEvents.slice(0, 10).map((e, i) => (
          <div key={e.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
            borderBottom: i < Math.min(wateringEvents.length, 10) - 1 ? '1px solid var(--line)' : 'none',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>💧</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.visualZoneId ?? 'Zone'}
                {e.plantName && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {e.plantName}</span>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{fmtRelative(e.timestamp)}</div>
            </div>
            {e.amountMl && <div style={{ fontSize: 12, fontWeight: 800, color: '#0ea5e9', flexShrink: 0 }}>{e.amountMl}ml</div>}
          </div>
        ))}
      </div>
      <div className="gm-card" style={{ padding: '0 14px' }}>
        <DashLabel>By zone</DashLabel>
        {[...byZone.entries()].map(([zoneId, info], i, arr) => (
          <div key={zoneId} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
            borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none',
          }}>
            <span style={{ fontSize: 16 }}>🗺️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>
                {zoneId}{info.plantName && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {info.plantName}</span>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                {info.count} event{info.count !== 1 ? 's' : ''} · last {fmtRelative(info.lastTs)}
                {info.totalMl > 0 && ` · ${info.totalMl}ml total`}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="gm-card" style={{ padding: 14 }}>
        <DashLabel>Watering response curves</DashLabel>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, lineHeight: 1.5 }}>
          Before → 1h → 6h → 24h recovery charts require correlated moisture readings in the same time window as watering events. Ensure your ESP32 is sending readings continuously.
        </div>
      </div>
    </>
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
