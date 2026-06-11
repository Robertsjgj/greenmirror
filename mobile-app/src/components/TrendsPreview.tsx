import { useEffect, useMemo, useState } from 'react';
import { useReadingsHistory } from '../hooks/useReadingsHistory';
import type { TimeRange } from '../hooks/useReadingsHistory';
import { useDataMode } from '../hooks/useDataMode';
import { genMockDataset } from '../mockData';
import { buildGreenhouseModel } from './trends/trendsModel';
import { GreenhouseTrendCard } from './trends/TrendsViews';
import type { LatestReading, VisualZone } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';

interface TrendsPreviewProps {
  zones?: VisualZone[];
  profilesById?: Map<string, PlantProfile>;
  /** Full plant profile list — needed to build the trend model in live mode. */
  plantProfiles?: PlantProfile[];
  /** Greenhouse ID — drives the moisture trend preview chart. */
  greenhouseId?: string;
  /** Simulation history — when present, the chart uses this instead of Firestore. */
  simHistory?: LatestReading[];
  onOpenDashboard: () => void;
}

// ─── Health classification ─────────────────────────────────────────────────--
// Three plain-language buckets for the at-a-glance snapshot.
//   need     — below the plant's target moisture (or generically dry)
//   watch    — near a target boundary, or holding too much water
//   healthy  — comfortably inside the target range
type Health = 'need' | 'watch' | 'healthy';

// How close to a boundary (percentage points) still counts as "Watching".
const WATCH_MARGIN = 5;

function classifyHealth(moisture: number, profile: PlantProfile | null): Health {
  if (profile) {
    if (moisture < profile.moistureMin) return 'need';
    if (moisture > profile.moistureMax) return 'watch';
    if (moisture <= profile.moistureMin + WATCH_MARGIN) return 'watch';
    if (moisture >= profile.moistureMax - WATCH_MARGIN) return 'watch';
    return 'healthy';
  }
  if (moisture < 25) return 'need';
  if (moisture < 30 || moisture > 75) return 'watch';
  return 'healthy';
}

const NEED_COLOR = '#ef4444';
const WATCH_COLOR = '#f59e0b';
const GOOD_COLOR  = '#22c55e';

export function TrendsPreview({
  zones, profilesById, plantProfiles, greenhouseId, simHistory, onOpenDashboard,
}: TrendsPreviewProps) {
  const [range, setRange] = useState<TimeRange>('24h');
  const [dataMode, setDataMode] = useDataMode();
  const isDummy = dataMode === 'dummy';

  // Dummy (sample) data is the default. In dummy mode every value below comes
  // from one self-consistent mock greenhouse (discrete-time readings → same
  // pipeline as real). The header toggle flips between mock and real data.
  const mock = useMemo(() => (isDummy ? genMockDataset(range) : null), [isDummy, range]);
  const effZones = useMemo(() => (mock ? mock.zones : (zones ?? [])), [mock, zones]);
  const effProfiles = useMemo(
    () => (mock ? mock.profilesById : (profilesById ?? new Map<string, PlantProfile>())),
    [mock, profilesById],
  );

  // ── Greenhouse health snapshot (current readings) ──────────────────────────
  const health = useMemo(() => {
    let need = 0, watch = 0, healthy = 0;
    effZones.forEach((z) => {
      if (!z.hasReading || z.soilMoisturePct === null) return;
      const profile = z.assignedPlant ? effProfiles.get(z.assignedPlant) ?? null : null;
      const cls = classifyHealth(z.soilMoisturePct, profile);
      if (cls === 'need') need++;
      else if (cls === 'watch') watch++;
      else healthy++;
    });
    return { need, watch, healthy, total: need + watch + healthy };
  }, [effZones, effProfiles]);

  // ── Plant groups (only used to phrase insights) ─────────────────────────────
  const plantGroups = useMemo(() => {
    const groups = new Map<string, { name: string; count: number; needsWater: number; tooWet: number }>();
    effZones.forEach((z) => {
      if (!z.assignedPlant || !z.hasReading || z.soilMoisturePct === null) return;
      const profile = effProfiles.get(z.assignedPlant);
      if (!profile) return;
      if (!groups.has(z.assignedPlant)) {
        groups.set(z.assignedPlant, { name: profile.name, count: 0, needsWater: 0, tooWet: 0 });
      }
      const g = groups.get(z.assignedPlant)!;
      g.count++;
      if (z.soilMoisturePct < profile.moistureMin) g.needsWater++;
      else if (z.soilMoisturePct > profile.moistureMax) g.tooWet++;
    });
    return [...groups.values()];
  }, [effZones, effProfiles]);

  // ── Greenhouse trend model ──────────────────────────────────────────────────
  // Build the SAME model the Trends dashboard uses, so the Home preview can
  // render the exact Overview "Greenhouse Trend" chart (GreenhouseTrendCard).
  const { readings: fsReadings, loading } = useReadingsHistory(
    simHistory || isDummy ? null : (greenhouseId ?? null),
    range,
  );
  const readings = useMemo(() => (mock ? mock.readings : (simHistory ?? fsReadings)), [mock, simHistory, fsReadings]);
  const gm = useMemo(() => buildGreenhouseModel({
    zones: effZones,
    profilesById: effProfiles,
    plantProfiles: mock ? mock.plantProfiles : (plantProfiles ?? []),
    readings,
    wateringEvents: mock ? mock.wateringEvents : [],
  }), [effZones, effProfiles, plantProfiles, mock, readings]);
  const chartLoading = isDummy || simHistory ? false : loading;

  // Trend direction (from the same model) → phrases insight #1.
  const moistureDelta = gm.ghDelta(range).moisture;
  const healthDisplay = health;

  // Temporary diagnostics for the Home Sensor Trends preview chart.
  useEffect(() => {
    console.info('[TrendsPreview] home chart', {
      dataMode,
      greenhouseId: greenhouseId ?? '(none)',
      source: isDummy ? 'mock' : simHistory ? 'simHistory' : 'firestore',
      range,
      readings: readings.length,
      readingCount: gm.readingCount,
      zonesWithReadings: effZones.filter((z) => z.hasReading && z.soilMoisturePct !== null).length,
    });
  }, [dataMode, isDummy, greenhouseId, simHistory, range, readings.length, gm.readingCount, effZones]);

  // ── Insights (2–3 plain sentences derived from the data above) ──────────────
  const insights = useMemo(() => {
    const out: string[] = [];

    // 1) Overall direction
    if (moistureDelta <= -4) out.push('Moisture is slipping across the greenhouse — some beds may need water soon.');
    else if (moistureDelta >= 4) out.push('Moisture has improved across most zones recently.');
    else if (gm.hasHistory) out.push('Most zones stayed steady over this period.');

    // 2) Driest / wettest plant group
    const driest = [...plantGroups].sort((a, b) => b.needsWater - a.needsWater)[0];
    const wettest = [...plantGroups].sort((a, b) => b.tooWet - a.tooWet)[0];
    if (driest && driest.needsWater > 0) {
      out.push(`${driest.name} ${driest.needsWater === 1 ? 'bed is' : 'beds are'} drying faster than the others.`);
    } else if (wettest && wettest.tooWet > 0) {
      out.push(`${wettest.name} ${wettest.tooWet === 1 ? 'bed is' : 'beds are'} holding a lot of water.`);
    }

    // 3) Right-now health summary
    if (health.need > 0) {
      out.push(`${health.need} zone${health.need === 1 ? '' : 's'} need watering right now.`);
    } else if (health.total > 0) {
      out.push('Every zone is sitting in a healthy range right now.');
    }

    return out.slice(0, 3);
  }, [moistureDelta, gm.hasHistory, plantGroups, health]);

  // In dummy mode we always have data to show. In real mode, fall back to the
  // empty state only when there are genuinely no readings.
  const hasData = isDummy || healthDisplay.total > 0 || gm.hasHistory;

  return (
    <div>
      {/* Header (unchanged) */}
      <div style={{ padding: '0 2px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h2 className="gm-h2">Sensor Trends 📈</h2>
          <div className="gm-sub">Moisture, temperature, and plant health</div>
        </div>
        <button
          className="gm-btn ghost"
          style={{ fontSize: 12, padding: '7px 12px', flexShrink: 0 }}
          onClick={onOpenDashboard}
        >
          Full analysis →
        </button>
      </div>

      {/* Data-source toggle — sample (dummy) vs live (real Firebase) data. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 2px 10px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>
          {isDummy ? 'Showing sample data' : 'Showing live data'}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <ModeButton active={isDummy} onClick={() => setDataMode('dummy')}>Sample</ModeButton>
          <ModeButton active={!isDummy} onClick={() => setDataMode('real')}>Live</ModeButton>
        </div>
      </div>

      {/* Clear, unmissable banner whenever the charts below are NOT real data. */}
      {isDummy && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', marginBottom: 10, borderRadius: 12,
          background: '#fef3c7', border: '1.5px solid #fcd34d',
        }}>
          <span style={{ fontSize: 15 }}>🧪</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', lineHeight: 1.35 }}>
            Sample data — not from your greenhouse. Tap “Live” to use real sensor data.
          </span>
        </div>
      )}

      {!hasData ? (
        <div className="gm-card" style={{ padding: 22, textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
          <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>
            No sensor data yet
          </div>
          <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
            Connect your ESP32 and assign plants to zones to see trends.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ── CARD 1: Greenhouse health snapshot ─────────────────────────── */}
          {healthDisplay.total > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <SnapshotCard emoji="🔴" label="Need water" count={healthDisplay.need} color={NEED_COLOR} />
              <SnapshotCard emoji="🟡" label="Watching"   count={healthDisplay.watch} color={WATCH_COLOR} />
              <SnapshotCard emoji="🟢" label="Healthy"    count={healthDisplay.healthy} color={GOOD_COLOR} />
            </div>
          )}

          {/* ── CARD 2: Greenhouse trend — the exact Overview chart ───────────── */}
          <GreenhouseTrendCard gm={gm} range={range} setRange={setRange} loading={chartLoading} />

          {/* ── CARD 3: Insights ───────────────────────────────────────────── */}
          {insights.length > 0 && (
            <div className="gm-card" style={{ padding: '12px 14px' }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 8,
              }}>
                What&apos;s happening
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {insights.map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)',
                      marginTop: 6, flexShrink: 0,
                    }} />
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, lineHeight: 1.4 }}>
                      {text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CARD 4: Open full analysis (primary call to action) ────────── */}
          <button
            onClick={onOpenDashboard}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              width: '100%', padding: '16px 18px', textAlign: 'left', cursor: 'pointer',
              background: 'var(--primary-soft)', border: '1.5px solid var(--primary)', borderRadius: 16,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div>
              <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 15, color: 'var(--primary)' }}>
                Open Trends &amp; Analysis
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 3, fontWeight: 600, lineHeight: 1.4 }}>
                View zone history, plant trends, watering impact, and greenhouse insights.
              </div>
            </div>
            <span style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'var(--primary)', color: '#fff', fontSize: 18,
              display: 'grid', placeItems: 'center',
            }}>
              →
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────--

function ModeButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 11px', borderRadius: 9, border: '1.5px solid',
        borderColor: active ? 'var(--primary)' : 'var(--line)',
        background: active ? 'var(--primary-soft)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--ink-3)',
        fontSize: 11, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function SnapshotCard({ emoji, label, count, color }: {
  emoji: string; label: string; count: number; color: string;
}) {
  return (
    <div className="gm-card" style={{
      padding: '12px 8px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    }}>
      <div style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1.1 }}>
        {count}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  );
}
