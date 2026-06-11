import { useEffect, useMemo, useState } from 'react';
import { useReadingsHistory } from '../hooks/useReadingsHistory';
import type { TimeRange } from '../hooks/useReadingsHistory';
import { useDataMode } from '../hooks/useDataMode';
import { genMockDataset } from '../mockData';
import { buildGreenhouseModel } from './trends/trendsModel';
import { GreenhouseHealthCard, GreenhouseTrendCard } from './trends/TrendsViews';
import type { LatestReading, VisualZone } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';

interface TrendsPreviewProps {
  zones?: VisualZone[];
  profilesById?: Map<string, PlantProfile>;
  /** Full plant profile list — needed to build the trend model in live mode. */
  plantProfiles?: PlantProfile[];
  /** Greenhouse ID — drives the trend model / chart. */
  greenhouseId?: string;
  /** Simulation history — when present, the model uses this instead of Firestore. */
  simHistory?: LatestReading[];
  onOpenDashboard: () => void;
}

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

  // Build the SAME model the Trends dashboard uses, so the Home Sensor Trends
  // section renders the EXACT same cards as the Overview tab (greenhouse health
  // report card + greenhouse trend chart).
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

  // Temporary diagnostics for the Home Sensor Trends preview.
  useEffect(() => {
    console.info('[TrendsPreview] home', {
      dataMode,
      greenhouseId: greenhouseId ?? '(none)',
      source: isDummy ? 'mock' : simHistory ? 'simHistory' : 'firestore',
      range,
      readings: readings.length,
      readingCount: gm.readingCount,
    });
  }, [dataMode, isDummy, greenhouseId, simHistory, range, readings.length, gm.readingCount]);

  return (
    <div>
      {/* Header */}
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

      {/* Clear, unmissable banner whenever the cards below are NOT real data. */}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {/* Exact same cards as the Trends → Overview tab */}
        <GreenhouseHealthCard gm={gm} range={range} />
        <GreenhouseTrendCard gm={gm} range={range} setRange={setRange} loading={chartLoading} />

        {/* Primary call to action — open the full dashboard */}
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
