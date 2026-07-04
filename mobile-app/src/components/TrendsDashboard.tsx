/* ──────────────────────────────────────────────────────────────────────────
   TrendsDashboard.tsx — full-screen Trends & Analysis shell.
   Builds the real-data model and renders the redesigned tabs
   (Overview · Zones · Plants · Watering · Research).
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react';
import { useReadingsHistory } from '../hooks/useReadingsHistory';
import type { TimeRange } from '../hooks/useReadingsHistory';
import { useDataMode } from '../hooks/useDataMode';
import { genMockDataset } from '../mockData';
import type { VisualZone, LatestReading } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';
import type { ActivityEntry } from '../activityLog';
import { buildGreenhouseModel } from './trends/trendsModel';
import {
  OverviewView, ZonesView, PlantsView, WateringView,
} from './trends/TrendsViews';

type DashTab = 'overview' | 'zones' | 'plants' | 'watering';

const DASH_TABS: { id: DashTab; label: string }[] = [
  { id: 'overview',  label: '📊 Overview'  },
  { id: 'zones',     label: '🗺 Zones'      },
  { id: 'plants',    label: '🌿 Plants'     },
  { id: 'watering',  label: '💧 Watering'   },
];

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
  /** App-wide back handler hook: set to a fn that consumes one internal back
   *  step (detail → list) and returns true, else returns false. */
  backRef?: { current: (() => boolean) | null };
}

function DashModeButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 9, border: '1.5px solid',
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

export function TrendsDashboard({
  open,
  greenhouseId,
  greenhouseName,
  zones,
  profilesById,
  plantProfiles = [],
  simHistory,
  activityLog = [],
  firestoreActivity = [],
  onClose,
  backRef,
}: TrendsDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [range, setRange] = useState<TimeRange>('24h');
  const [selZone, setSelZone] = useState<string | null>(null);
  const [selPlant, setSelPlant] = useState<string | null>(null);
  const [dataMode, setDataMode] = useDataMode();
  const isDummy = dataMode === 'dummy';

  // Dummy (sample) data is the default. In dummy mode the whole model is built
  // from one self-consistent mock greenhouse, so every tab below renders sample
  // data that looks exactly like real readings.
  const mock = useMemo(() => (isDummy ? genMockDataset(range, greenhouseId) : null), [isDummy, range, greenhouseId]);

  // Time-series history — Firestore quota protection: pass null (→ no listener,
  // no reads) unless the dashboard is actually open and using real data, so
  // history loads only when needed and detaches the moment Trends closes.
  const { readings: firestoreReadings, loading } = useReadingsHistory(
    simHistory || isDummy ? null : (open ? greenhouseId : null),
    range,
  );
  const readings = useMemo(
    () => (mock ? mock.readings : (simHistory ?? firestoreReadings)),
    [mock, simHistory, firestoreReadings],
  );
  const chartLoading = isDummy || simHistory ? false : loading;

  // Watering events (full history — model aggregates the heatmap/stats itself)
  const wateringEvents = useMemo(() => {
    if (mock) return mock.wateringEvents;
    const src = firestoreActivity.length > 0 ? firestoreActivity : activityLog;
    return src.filter((e) => e.type === 'watering');
  }, [mock, activityLog, firestoreActivity]);

  const gm = useMemo(() => buildGreenhouseModel({
    zones: mock ? mock.zones : (zones ?? []),
    profilesById: mock ? mock.profilesById : (profilesById ?? new Map()),
    plantProfiles: mock ? mock.plantProfiles : plantProfiles,
    readings,
    wateringEvents,
  }), [mock, zones, profilesById, plantProfiles, readings, wateringEvents]);

  // ── Hardware/browser Back button ──────────────────────────────────────────
  // The app-wide back handler (App.tsx) owns the single popstate listener and
  // history sentinel. Here we just register an internal back step: when a zone
  // or plant detail is open, Back returns to its list instead of closing the
  // dashboard. Returning false lets the app handler close the dashboard, then
  // step through tabs, etc. Header ← and in-app back links call goBack() =
  // history.back(), which routes through that same handler.
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (selZone || selPlant) {
        setSelZone(null);
        setSelPlant(null);
        return true;
      }
      return false;
    };
    return () => { backRef.current = null; };
    // backRef is a stable ref-like object, intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selZone, selPlant]);

  if (!open) return null;

  // Header ← and in-app back links: step detail → list → close the dashboard.
  const goBack = () => {
    if (selZone || selPlant) { setSelZone(null); setSelPlant(null); }
    else onClose();
  };
  const selectTab = (id: DashTab) => { setSelZone(null); setSelPlant(null); setActiveTab(id); };
  const baseProps = { gm, range, setRange, loading: chartLoading };

  return (
    <div style={{
      flex: 1, minHeight: 0,
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 18, color: 'var(--ink)', lineHeight: 1.1 }}>
            Trends & Analysis 📈
          </div>
          {greenhouseName && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{greenhouseName}</div>
          )}
        </div>
        {/* Sample (dummy) vs Live (real) data toggle */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <DashModeButton active={isDummy} onClick={() => setDataMode('dummy')}>Sample</DashModeButton>
          <DashModeButton active={!isDummy} onClick={() => setDataMode('real')}>Live</DashModeButton>
        </div>
      </div>

      {/* Clear banner whenever these views are sample data, not the real greenhouse. */}
      {isDummy && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: '8px 16px', background: '#fef3c7', borderBottom: '1px solid #fcd34d',
        }}>
          <span style={{ fontSize: 14 }}>🧪</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e' }}>
            Sample data — not from your greenhouse. Tap “Live” to use real sensor data.
          </span>
        </div>
      )}

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', overflowX: 'auto', flexShrink: 0,
        background: 'var(--card)', borderBottom: '1px solid var(--line)',
        scrollbarWidth: 'none',
      }}>
        {DASH_TABS.map((t) => (
          <button key={t.id} onClick={() => selectTab(t.id)} style={{
            flexShrink: 0, padding: '10px 16px', fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
            border: 'none', borderBottom: activeTab === t.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            background: 'transparent', color: activeTab === t.id ? 'var(--primary)' : 'var(--ink-3)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Scrollable body — plain scroll container (no flex, so cards keep
            their natural height and never get shrink-clipped) ─────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
        {activeTab === 'overview' && <OverviewView {...baseProps} />}
        {activeTab === 'zones'    && <ZonesView    {...baseProps} selected={selZone}  onSelect={setSelZone}  onBack={goBack} />}
        {activeTab === 'plants'   && <PlantsView   {...baseProps} selected={selPlant} onSelect={setSelPlant} onBack={goBack} />}
        {activeTab === 'watering' && <WateringView gm={gm} />}
      </div>
    </div>
  );
}
