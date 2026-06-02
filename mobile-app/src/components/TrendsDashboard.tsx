import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  useReadingsHistory,
  buildTrendData,
  TIME_RANGE_LABELS,
} from '../hooks/useReadingsHistory';
import type { TimeRange } from '../hooks/useReadingsHistory';
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
];

// Static hex colours — CSS vars don't resolve reliably inside SVG
const MOISTURE_COLOR = '#0ea5e9';
const TEMP_COLOR     = '#f59e0b';

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

  // Time-series history — only queries when dashboard is open (component mounted)
  const { trendData: firestoreTrends, loading: chartLoading } = useReadingsHistory(
    simHistory ? null : (open ? greenhouseId : null),
    range,
  );
  const trendData = useMemo(
    () => simHistory ? buildTrendData(simHistory, range) : firestoreTrends,
    [simHistory, firestoreTrends, range],
  );
  const isChartLoading = simHistory ? false : chartLoading;

  // Zone urgency list
  const sortedZones = useMemo(() => {
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

  const filteredZones = useMemo(() => {
    const q = zoneSearch.toLowerCase();
    if (!q) return sortedZones;
    return sortedZones.filter(({ zone, profile }) =>
      (zone.displayLabel ?? zone.visualLabel).toLowerCase().includes(q) ||
      profile?.name.toLowerCase().includes(q)
    );
  }, [sortedZones, zoneSearch]);

  // Plant groups
  const plantGroups = useMemo(() => {
    const groups = new Map<string, {
      profile: PlantProfile;
      count: number; totalMoisture: number; moistureCount: number;
      needsWater: number; tooWet: number; good: number;
    }>();
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

  // Zone status counts for overview
  const statusCounts = useMemo(() => {
    let needWater = 0, tooWet = 0, healthy = 0, noData = 0;
    (zones ?? []).forEach((z) => {
      if (!z.hasReading || z.soilMoisturePct === null) { noData++; return; }
      const profile = z.assignedPlant ? profilesById?.get(z.assignedPlant) ?? null : null;
      const m = z.soilMoisturePct;
      if (profile) {
        if (m < profile.moistureMin) needWater++;
        else if (m > profile.moistureMax) tooWet++;
        else healthy++;
      } else {
        if (m < 25) needWater++;
        else if (m > 80) tooWet++;
        else healthy++;
      }
    });
    return { needWater, tooWet, healthy, noData };
  }, [zones, profilesById]);

  const insight = useMemo(() => {
    const { needWater, tooWet, healthy, noData } = statusCounts;
    if (needWater > 0 && tooWet > 0) return `${needWater} zone${needWater > 1 ? 's' : ''} need water · ${tooWet} too wet.`;
    if (needWater > 0) return `${needWater} zone${needWater > 1 ? 's' : ''} need${needWater === 1 ? 's' : ''} water today.`;
    if (tooWet > 0) return `${tooWet} zone${tooWet > 1 ? 's are' : ' is'} above the target moisture range.`;
    if (healthy > 0) return `All ${healthy} zone${healthy > 1 ? 's' : ''} are within their ideal moisture range. 🎉`;
    if (noData > 0) return `${noData} zone${noData > 1 ? 's' : ''} waiting for sensor data.`;
    return 'Assign plants and connect sensors to start tracking.';
  }, [statusCounts]);

  // Watering events from activity logs
  const wateringEvents = useMemo(() => {
    const combined = [...(firestoreActivity.length > 0 ? firestoreActivity : activityLog)];
    return combined
      .filter((e) => e.type === 'watering')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [activityLog, firestoreActivity]);

  // Last watered per zone (for Zones tab)
  const lastWateredByZone = useMemo(() => {
    const map = new Map<string, string>();
    wateringEvents.forEach((e) => {
      if (e.visualZoneId && !map.has(e.visualZoneId)) map.set(e.visualZoneId, e.timestamp);
    });
    return map;
  }, [wateringEvents]);

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
        <button
          className="gm-icon-btn"
          onClick={onClose}
          aria-label="Back"
          style={{ fontSize: 20 }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 18, color: 'var(--ink)', lineHeight: 1.1 }}>
            Trends & Analysis 📈
          </div>
          {greenhouseName && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
              {greenhouseName}
            </div>
          )}
        </div>
        {/* Range picker */}
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              style={{
                padding: '5px 9px', borderRadius: 10,
                border: '1.5px solid',
                borderColor: range === r.id ? 'var(--primary)' : 'var(--line)',
                background: range === r.id ? 'var(--primary-soft)' : 'transparent',
                color: range === r.id ? 'var(--primary)' : 'var(--ink-3)',
                fontSize: 11, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', overflowX: 'auto', flexShrink: 0,
        background: 'var(--card)', borderBottom: '1px solid var(--line)',
        scrollbarWidth: 'none',
      }}>
        {DASH_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flexShrink: 0, padding: '10px 16px',
              fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
              border: 'none', borderBottom: activeTab === t.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              background: 'transparent',
              color: activeTab === t.id ? 'var(--primary)' : 'var(--ink-3)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ══ OVERVIEW ════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <OverviewSection
            statusCounts={statusCounts}
            insight={insight}
            topZones={sortedZones.slice(0, 3)}
            trendData={trendData}
            isLoading={isChartLoading}
            range={range}
            simHistory={simHistory}
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
          />
        )}

        {/* ══ PLANTS ══════════════════════════════════════════════════════════ */}
        {activeTab === 'plants' && (
          <PlantsSection plantGroups={plantGroups} />
        )}

        {/* ══ WATERING ════════════════════════════════════════════════════════ */}
        {activeTab === 'watering' && (
          <WateringSection wateringEvents={wateringEvents} />
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

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewSection({ statusCounts, insight, topZones, trendData, isLoading, range, simHistory }: {
  statusCounts: { needWater: number; tooWet: number; healthy: number; noData: number };
  insight: string;
  topZones: Array<{ zone: VisualZone; profile: PlantProfile | null; moisture: number; label: string; color: string }>;
  trendData: ReturnType<typeof buildTrendData>;
  isLoading: boolean;
  range: TimeRange;
  simHistory?: LatestReading[];
}) {
  const totalSamples = trendData.reduce((s, p) => s + p.sampleCount, 0);
  const bucketNoun   = range === '24h' ? 'hr' : 'day';
  return (
    <>
      {/* Status summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <StatChip value={statusCounts.needWater} label="Need water" color="#f59e0b" />
        <StatChip value={statusCounts.tooWet}    label="Too wet"    color="#0ea5e9" />
        <StatChip value={statusCounts.healthy}   label="Healthy"    color="#22c55e" />
      </div>

      {/* Insight */}
      <div className="gm-card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20 }}>💡</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>{insight}</div>
      </div>

      {/* Top urgent zones */}
      {topZones.length > 0 && (
        <div className="gm-card" style={{ padding: '0 14px' }}>
          <DashLabel>Top zones to watch</DashLabel>
          {topZones.map(({ zone, profile, moisture, label, color }, i) => (
            <div key={zone.visualLabel} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
              borderBottom: i < topZones.length - 1 ? '1px solid var(--line)' : 'none',
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: color + '18', display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>
                {profile?.icon ?? '🌱'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>
                  {zone.displayLabel ?? zone.visualLabel}
                  {profile && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {profile.name}</span>}
                </div>
                {profile && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                    Target {profile.moistureMin}–{profile.moistureMax}%
                    {zone.soilTempC !== null && ` · ${zone.soilTempC.toFixed(1)}°C`}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color }}>{moisture.toFixed(0)}%</div>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: color + '18', color }}>
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Moisture chart */}
      <div className="gm-card" style={{ padding: '12px 14px' }}>
        <DashLabel dot={MOISTURE_COLOR}>Average moisture — {TIME_RANGE_LABELS[range]}</DashLabel>
        {isLoading ? (
          <div style={{ height: 120, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 12, fontWeight: 600 }}>
            ⏳ Loading…
          </div>
        ) : trendData.length === 0 ? (
          <div style={{ height: 100, display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24 }}>📊</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                {simHistory ? 'Not enough simulation history yet' : 'No readings for this period'}
              </div>
            </div>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={trendData} margin={{ top: 4, right: 2, left: -28, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tickCount={3} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, 'Avg moisture']} labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }} />
                <Area type="monotone" dataKey="avgMoisture" stroke={MOISTURE_COLOR} strokeWidth={2.5} fill={MOISTURE_COLOR} fillOpacity={0.12} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: MOISTURE_COLOR }} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 4, fontWeight: 600 }}>
              {totalSamples} readings · {trendData.length} {bucketNoun}{trendData.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Zones ────────────────────────────────────────────────────────────────────

function ZonesSection({ filteredZones, allCount, search, onSearch, lastWateredByZone }: {
  filteredZones: Array<{ zone: VisualZone; profile: PlantProfile | null; moisture: number; label: string; color: string }>;
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
        {filteredZones.filter((z) => z.zone.hasReading).length < allCount && (
          <span> · {allCount - filteredZones.filter((z) => z.zone.hasReading).length} no data</span>
        )}
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
                  {/* Moisture bar */}
                  <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, moisture)}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color }}>{moisture.toFixed(0)}%</div>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: color + '18', color }}>
                    {label}
                  </span>
                  {zone.soilTempC !== null && (
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>
                      {zone.soilTempC.toFixed(1)}°C
                    </div>
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

function PlantsSection({ plantGroups }: {
  plantGroups: Array<{
    profile: PlantProfile; count: number; totalMoisture: number; moistureCount: number;
    needsWater: number; tooWet: number; good: number;
  }>;
}) {
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
                  <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
                    {g.profile.name}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 7, background: urgentColor + '18', color: urgentColor }}>
                    {urgentLabel}
                  </span>
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

            {/* Moisture bar with target range */}
            <div style={{ marginTop: 12, position: 'relative', height: 8, borderRadius: 4, background: 'var(--line)' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${g.profile.moistureMin}%`, width: `${g.profile.moistureMax - g.profile.moistureMin}%`, background: '#22c55e22', borderRadius: 4 }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.min(100, avg)}%`, background: urgentColor, borderRadius: 4, transition: 'width 0.4s' }} />
            </div>

            {/* Zone counts */}
            <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
              {g.needsWater > 0 && <CountPill value={g.needsWater} label="need water" color="#f59e0b" />}
              {g.tooWet > 0    && <CountPill value={g.tooWet}    label="too wet"    color="#0ea5e9" />}
              {g.good > 0      && <CountPill value={g.good}      label="healthy"    color="#22c55e" />}
            </div>

            {g.profile.notes && (
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10, fontStyle: 'italic', lineHeight: 1.4 }}>
                {g.profile.notes}
              </div>
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
            {e.amountMl && (
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0ea5e9', flexShrink: 0 }}>{e.amountMl}ml</div>
            )}
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
                {zoneId}
                {info.plantName && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {info.plantName}</span>}
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
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 12 }}>
          Dataset metrics
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ResearchStat label="Readings" value={totalSamples.toLocaleString()} sub={`in ${TIME_RANGE_LABELS[range]}`} />
          <ResearchStat label="Watering events" value={wateringCount.toLocaleString()} sub="logged" />
          <ResearchStat label="Plant types" value={uniquePlants.toString()} sub="tracked" />
          <ResearchStat label="Active zones" value={zonesWithReadings.toString()} sub="with readings" />
        </div>
      </div>

      <div className="gm-card" style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 8 }}>
          Export dataset
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, lineHeight: 1.5, marginBottom: 12 }}>
          Download your greenhouse data as CSV for research or analysis in external tools.
        </div>
        <button
          className="gm-btn ghost"
          style={{ width: '100%', opacity: 0.5 }}
          disabled
        >
          ↓ Export readings (coming soon)
        </button>
      </div>

      <div className="gm-card" style={{ padding: 14 }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 15, color: 'var(--ink)', marginBottom: 8 }}>
          About this data
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, lineHeight: 1.6 }}>
          Readings are collected via ESP32 sensors and stored in Firestore. Moisture percentages are calibrated from raw ADC values. Temperature readings use DS18B20 probes via OneWire. Data is timestamped at the server on ingestion.
        </div>
      </div>
    </>
  );
}

// ─── Small shared sub-components ─────────────────────────────────────────────

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="gm-card" style={{ padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Baloo 2', system-ui" }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700, marginTop: 2 }}>{label}</div>
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
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
