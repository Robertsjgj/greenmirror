/* ──────────────────────────────────────────────────────────────────────────
   TrendsDashboard.tsx — full-screen Trends & Analysis shell.
   Builds the real-data model and renders the redesigned tabs
   (Overview · Zones · Plants · Watering · Research).
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react';
import { useReadingsHistory } from '../hooks/useReadingsHistory';
import type { TimeRange } from '../hooks/useReadingsHistory';
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
}: TrendsDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [range, setRange] = useState<TimeRange>('24h');

  // Time-series history — only queries Firestore while the dashboard is open
  const { readings: firestoreReadings } = useReadingsHistory(
    simHistory ? null : (open ? greenhouseId : null),
    range,
  );
  const readings = useMemo(() => simHistory ?? firestoreReadings, [simHistory, firestoreReadings]);

  // Watering events (full history — model aggregates the heatmap/stats itself)
  const wateringEvents = useMemo(() => {
    const src = firestoreActivity.length > 0 ? firestoreActivity : activityLog;
    return src.filter((e) => e.type === 'watering');
  }, [activityLog, firestoreActivity]);

  const gm = useMemo(() => buildGreenhouseModel({
    zones: zones ?? [],
    profilesById: profilesById ?? new Map(),
    plantProfiles,
    readings,
    wateringEvents,
  }), [zones, profilesById, plantProfiles, readings, wateringEvents]);

  if (!open) return null;

  const tabProps = { gm, range, setRange };

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

      {/* ── Scrollable body — plain scroll container (no flex, so cards keep
            their natural height and never get shrink-clipped) ─────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
        {activeTab === 'overview' && <OverviewView {...tabProps} />}
        {activeTab === 'zones'    && <ZonesView    {...tabProps} />}
        {activeTab === 'plants'   && <PlantsView   {...tabProps} />}
        {activeTab === 'watering' && <WateringView gm={gm} />}
      </div>
    </div>
  );
}
