import { useMemo, useState } from 'react';
import {
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  useReadingsHistory,
  buildTrendData,
  TIME_RANGE_LABELS,
} from '../hooks/useReadingsHistory';
import type { TimeRange } from '../hooks/useReadingsHistory';
import type { LatestReading, VisualZone } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';

interface TrendsSectionProps {
  greenhouseId: string;
  /** When provided (simulation mode), Firestore subscription is bypassed. */
  simHistory?: LatestReading[];
  /** Current zone snapshots — drives Zone and Plant-group views. */
  zones?: VisualZone[];
  /** Profile lookup — needed to compare against thresholds. */
  profilesById?: Map<string, PlantProfile>;
}

type TrendsView = 'zones' | 'plants' | 'time';

const VIEWS: { id: TrendsView; label: string }[] = [
  { id: 'zones',  label: 'Zones'  },
  { id: 'plants', label: 'Plants' },
  { id: 'time',   label: 'Charts' },
];

const RANGES: TimeRange[] = ['24h', '7d', '30d'];

// Static hex colours — CSS custom properties don't reliably resolve inside SVG fill/stroke
const MOISTURE_COLOR = '#0ea5e9';
const TEMP_COLOR     = '#f59e0b';

export function TrendsSection({ greenhouseId, simHistory, zones, profilesById }: TrendsSectionProps) {
  const [view, setView] = useState<TrendsView>('zones');
  const [range, setRange] = useState<TimeRange>('24h');

  // Time-series history — always subscribed so Charts tab is instant when tapped
  const { trendData: firestoreTrends, loading } = useReadingsHistory(
    simHistory ? null : greenhouseId,
    range,
  );

  const trendData = useMemo(
    () => simHistory ? buildTrendData(simHistory, range) : firestoreTrends,
    [simHistory, firestoreTrends, range],
  );
  const isLoading = simHistory ? false : loading;

  // Zone snapshot list — sorted driest first so critical zones appear at top
  const zonesWithData = useMemo(
    () => (zones ?? [])
      .filter((z) => z.hasReading && z.soilMoisturePct !== null)
      .sort((a, b) => (a.soilMoisturePct ?? 0) - (b.soilMoisturePct ?? 0)),
    [zones],
  );

  // Plant-group stats — group zones by assigned plant, compute averages
  const plantGroups = useMemo(() => {
    const groups = new Map<string, {
      profile: PlantProfile;
      zones: VisualZone[];
      totalMoisture: number;
      moistureCount: number;
      needsWater: number;
      tooWet: number;
    }>();

    (zones ?? []).forEach((z) => {
      if (!z.assignedPlant || !z.hasReading) return;
      const profile = profilesById?.get(z.assignedPlant);
      if (!profile) return;

      if (!groups.has(z.assignedPlant)) {
        groups.set(z.assignedPlant, {
          profile,
          zones: [],
          totalMoisture: 0,
          moistureCount: 0,
          needsWater: 0,
          tooWet: 0,
        });
      }
      const g = groups.get(z.assignedPlant)!;
      g.zones.push(z);
      if (z.soilMoisturePct !== null) {
        g.totalMoisture += z.soilMoisturePct;
        g.moistureCount++;
        if (z.soilMoisturePct < profile.moistureMin) g.needsWater++;
        else if (z.soilMoisturePct > profile.moistureMax) g.tooWet++;
      }
    });

    // Sort: groups with most urgent needs first (dry → wet → ok)
    return [...groups.values()].sort((a, b) => {
      const scoreA = a.needsWater * 2 + a.tooWet;
      const scoreB = b.needsWater * 2 + b.tooWet;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.profile.name.localeCompare(b.profile.name);
    });
  }, [zones, profilesById]);

  const totalSamples = trendData.reduce((s, p) => s + p.sampleCount, 0);
  const bucketNoun   = range === '24h' ? 'hr' : 'day';

  return (
    <div>
      {/* Header + view tab switcher */}
      <div style={{
        padding: '0 2px 10px',
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', gap: 8,
      }}>
        <div>
          <h2 className="gm-h2">Sensor Trends 📈</h2>
          <div className="gm-sub">Moisture, temperature, and plant health</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              style={{
                padding: '5px 9px',
                borderRadius: 10,
                border: '1.5px solid',
                borderColor: view === v.id ? 'var(--primary)' : 'var(--line)',
                background: view === v.id ? 'var(--primary-soft)' : 'transparent',
                color: view === v.id ? 'var(--primary)' : 'var(--ink-3)',
                fontSize: 11,
                fontWeight: 800,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Zone Snapshot ──────────────────────────────────────────────────── */}
      {view === 'zones' && (
        zonesWithData.length === 0 ? (
          <div className="gm-card" style={{ padding: 26, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
            <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>
              No zone readings yet
            </div>
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
              Readings appear once your greenhouse is sending data.
            </div>
          </div>
        ) : (
          <div className="gm-card" style={{ padding: '2px 14px' }}>
            {zonesWithData.map((z, i) => {
              const profile = z.assignedPlant ? profilesById?.get(z.assignedPlant) ?? null : null;
              const moisture = z.soilMoisturePct ?? 0;
              const dotColor = getMoistureColor(moisture, profile);
              const statusLabel = getStatusLabel(moisture, profile);
              return (
                <div
                  key={z.visualLabel}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 0',
                    borderBottom: i < zonesWithData.length - 1 ? '1px solid var(--line)' : 'none',
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: 'var(--bg-sub)',
                    display: 'grid', placeItems: 'center', fontSize: 14,
                  }}>
                    {profile?.icon ?? '🌱'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>
                        {z.displayLabel ?? z.visualLabel}
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5,
                        background: dotColor + '22',
                        color: dotColor,
                        flexShrink: 0,
                      }}>
                        {statusLabel}
                      </span>
                    </div>
                    {profile && (
                      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                        {profile.name} · target {profile.moistureMin}–{profile.moistureMax}%
                      </div>
                    )}
                    <div style={{ marginTop: 5, height: 5, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, moisture)}%`,
                        background: dotColor,
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: dotColor }}>
                      {moisture.toFixed(0)}%
                    </div>
                    {z.soilTempC !== null && (
                      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                        {z.soilTempC.toFixed(1)}°C
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Plant Group View ───────────────────────────────────────────────── */}
      {view === 'plants' && (
        plantGroups.length === 0 ? (
          <div className="gm-card" style={{ padding: 26, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🌿</div>
            <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>
              No plants assigned yet
            </div>
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
              Assign plant profiles in the Map tab to see group trends.
            </div>
          </div>
        ) : (
          <div className="gm-card" style={{ padding: '2px 14px' }}>
            {plantGroups.map((g, i) => {
              const avgMoisture = g.moistureCount > 0 ? g.totalMoisture / g.moistureCount : 0;
              const dotColor = getMoistureColor(avgMoisture, g.profile);
              const hasIssue = g.needsWater > 0 || g.tooWet > 0;
              const chipText = g.needsWater > 0
                ? `${g.needsWater} need water`
                : g.tooWet > 0
                  ? `${g.tooWet} too wet`
                  : 'All good';
              const chipBg  = g.needsWater > 0 ? '#fef3c7' : g.tooWet > 0 ? '#eff6ff' : '#dcfce7';
              const chipFg  = g.needsWater > 0 ? '#92400e' : g.tooWet > 0 ? '#1e40af' : '#166534';
              return (
                <div
                  key={g.profile.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 0',
                    borderBottom: i < plantGroups.length - 1 ? '1px solid var(--line)' : 'none',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: hasIssue ? chipBg : 'var(--primary-soft)',
                    display: 'grid', placeItems: 'center', fontSize: 20,
                  }}>
                    {g.profile.icon ?? '🌱'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>
                        {g.profile.name}
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                        background: chipBg, color: chipFg, flexShrink: 0,
                      }}>
                        {chipText}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                      {g.zones.length} zone{g.zones.length !== 1 ? 's' : ''} · target {g.profile.moistureMin}–{g.profile.moistureMax}%
                    </div>

                    {/* Moisture bar with range indicator */}
                    <div style={{ marginTop: 5, position: 'relative', height: 6, borderRadius: 3, background: 'var(--line)' }}>
                      {/* Target range shading */}
                      <div style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${g.profile.moistureMin}%`,
                        width: `${g.profile.moistureMax - g.profile.moistureMin}%`,
                        background: '#22c55e22',
                        borderRadius: 3,
                      }} />
                      {/* Actual fill */}
                      <div style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0,
                        width: `${Math.min(100, avgMoisture)}%`,
                        background: dotColor,
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3, fontWeight: 600 }}>
                      Avg {avgMoisture.toFixed(0)}% moisture
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: dotColor }}>
                      {avgMoisture.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                      avg
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Greenhouse Charts (Time Series) ───────────────────────────────── */}
      {view === 'time' && (
        <>
          {/* Range picker */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 10,
                  border: '1.5px solid',
                  borderColor: range === r ? 'var(--primary)' : 'var(--line)',
                  background: range === r ? 'var(--primary-soft)' : 'transparent',
                  color: range === r ? 'var(--primary)' : 'var(--ink-3)',
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="gm-card" style={{ padding: 26, textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 24 }}>⏳</div>
              <div style={{ fontSize: 13, marginTop: 6, fontWeight: 600 }}>Loading trends…</div>
            </div>
          ) : trendData.length === 0 ? (
            <div className="gm-card" style={{ padding: 26, textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
              <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>
                No data for {TIME_RANGE_LABELS[range]}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                Readings appear once your greenhouse is sending data.
              </div>
            </div>
          ) : (
            <div className="gm-card" style={{ padding: '14px 14px 10px' }}>
              <ChartSection label="Avg soil moisture % (all zones)" dot={MOISTURE_COLOR}>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={trendData} margin={{ top: 4, right: 2, left: -28, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickCount={3}
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [`${v}%`, 'Avg moisture']}
                      labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="avgMoisture"
                      stroke={MOISTURE_COLOR}
                      strokeWidth={2.5}
                      fill={MOISTURE_COLOR}
                      fillOpacity={0.12}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: MOISTURE_COLOR }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartSection>

              <div style={{ height: 1, background: 'var(--line)', margin: '12px 0' }} />

              <ChartSection label="Avg soil temperature °C (all zones)" dot={TEMP_COLOR}>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData} margin={{ top: 4, right: 2, left: -28, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [`${v}°C`, 'Avg temp']}
                      labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgTemp"
                      stroke={TEMP_COLOR}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: TEMP_COLOR }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartSection>

              <div style={{
                fontSize: 10, color: '#94a3b8', marginTop: 8, fontWeight: 600,
                textAlign: 'right', letterSpacing: '0.02em',
              }}>
                {totalSamples} readings · {trendData.length} {bucketNoun}{trendData.length !== 1 ? 's' : ''} · {TIME_RANGE_LABELS[range]}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMoistureColor(moisture: number, profile: PlantProfile | null): string {
  if (!profile) {
    if (moisture < 25) return '#f59e0b'; // no profile, generic dry threshold
    if (moisture > 80) return '#0ea5e9';
    return '#22c55e';
  }
  if (moisture < profile.moistureMin) return '#f59e0b'; // below target → dry/amber
  if (moisture > profile.moistureMax) return '#0ea5e9'; // above target → wet/blue
  return '#22c55e'; // within range → green
}

function getStatusLabel(moisture: number, profile: PlantProfile | null): string {
  if (!profile) {
    if (moisture < 25) return 'dry';
    if (moisture > 80) return 'wet';
    return 'ok';
  }
  if (moisture < profile.moistureMin) return 'dry';
  if (moisture > profile.moistureMax) return 'wet';
  return 'good';
}

function ChartSection({
  label, dot, children,
}: { label: string; dot: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
        color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dot, display: 'inline-block', flexShrink: 0,
        }} />
        {label}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1.5px solid var(--line)',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 700,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};
