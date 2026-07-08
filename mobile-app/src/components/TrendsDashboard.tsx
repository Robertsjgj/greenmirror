/* ──────────────────────────────────────────────────────────────────────────
   TrendsDashboard.tsx — Trends & Analysis page body.
   Renders inside the app's standard page shell (app bar + scroll + bottom nav
   are provided by App.tsx). A simple Overview landing shows the greenhouse
   health + trend, with "Explore" buttons that open the Zones, Plants and
   Watering sections one at a time — no tabs, minimal on-screen complexity.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useReadingsHistory } from '../hooks/useReadingsHistory';
import type { TimeRange } from '../hooks/useReadingsHistory';
import type { VisualZone, LatestReading } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';
import type { ActivityEntry } from '../activityLog';
import { buildGreenhouseModel } from './trends/trendsModel';
import {
  GreenhouseHealthCard, GreenhouseTrendCard, ZonesView, PlantsView, WateringView,
} from './trends/TrendsViews';
import { BackButton } from './trends/TrendsCharts';

type Section = 'overview' | 'zones' | 'plants' | 'watering';

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
  /** The app's scroll container (gm-scroll) — used to scroll to top on entering
   *  a section and restore the Explore scroll position on Back. */
  scrollRef?: RefObject<HTMLDivElement>;
  /** App-wide back handler hook: consumes one internal back step
   *  (detail → list → overview) and returns true, else returns false. */
  backRef?: { current: (() => boolean) | null };
}

// Big tappable cards on the Overview landing that open each section.
function SectionNav({ go, zones, plants, waterings }: {
  go: (s: Section) => void; zones: number; plants: number; waterings: number;
}) {
  const items: { id: Section; icon: string; label: string; sub: string }[] = [
    { id: 'zones',    icon: '🗺️', label: 'Zones',    sub: `${zones} bed${zones !== 1 ? 's' : ''}` },
    { id: 'plants',   icon: '🌿', label: 'Plants',   sub: `${plants} group${plants !== 1 ? 's' : ''}` },
    { id: 'watering', icon: '💧', label: 'Waterings', sub: `${waterings} record${waterings !== 1 ? 's' : ''}` },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', padding: '2px 2px 0' }}>
        Explore
      </div>
      {items.map((it) => (
        <button key={it.id} onClick={() => go(it.id)} className="gm-card" style={{
          padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', textAlign: 'left', width: '100%',
        }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 21, flexShrink: 0 }}>
            {it.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', fontFamily: "'Baloo 2', system-ui" }}>{it.label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{it.sub}</div>
          </div>
          <span style={{ fontSize: 22, color: 'var(--ink-3)', fontWeight: 700, flexShrink: 0 }}>›</span>
        </button>
      ))}
    </div>
  );
}

// Wraps a section's existing view; shows the big Back button at list level.
function SectionWrap({ showBack, onBack, children }: {
  showBack: boolean; onBack: () => void; children: ReactNode;
}) {
  return (
    <>
      {showBack && (
        <div style={{ padding: '12px 16px 2px' }}>
          <BackButton onClick={onBack} />
        </div>
      )}
      {children}
    </>
  );
}

export function TrendsDashboard({
  open,
  greenhouseId,
  zones,
  profilesById,
  plantProfiles = [],
  simHistory,
  activityLog = [],
  firestoreActivity = [],
  scrollRef,
  backRef,
}: TrendsDashboardProps) {
  const [section, setSection] = useState<Section>('overview');
  const [range, setRange] = useState<TimeRange>('24h');
  const [selZone, setSelZone] = useState<string | null>(null);
  const [selPlant, setSelPlant] = useState<string | null>(null);

  // Scroll bookkeeping: remember the Explore scroll position when opening a
  // section, so Back can restore it; new sections open scrolled to the top.
  const overviewScrollTop = useRef(0);
  const pendingScroll = useRef<number | null>(null);

  // Time-series history — Firestore quota protection: pass null (→ no listener)
  // unless the page is open. Always uses the greenhouse's real (or sim) data.
  const { readings: firestoreReadings, loading } = useReadingsHistory(
    simHistory ? null : (open ? greenhouseId : null),
    range,
  );
  const readings = useMemo(
    () => (simHistory ?? firestoreReadings),
    [simHistory, firestoreReadings],
  );
  const chartLoading = simHistory ? false : loading;

  // Watering events (full history — model aggregates the stats itself)
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

  // Apply the pending scroll after the new view renders: top when entering a
  // section or a zone/plant detail, and the saved Explore position on Back.
  useLayoutEffect(() => {
    const el = scrollRef?.current;
    if (el && pendingScroll.current != null) {
      el.scrollTop = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [section, selZone, selPlant, scrollRef]);

  // ── Hardware/browser Back button ──────────────────────────────────────────
  // The app-wide back handler (App.tsx) owns the single popstate listener. Here
  // we consume one internal step at a time: detail → list → overview. Only when
  // already on the overview do we return false so the app closes Trends.
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (selZone || selPlant) { pendingScroll.current = 0; setSelZone(null); setSelPlant(null); return true; }
      if (section !== 'overview') { pendingScroll.current = overviewScrollTop.current; setSection('overview'); return true; }
      return false;
    };
    return () => { backRef.current = null; };
    // backRef is a stable ref-like object, intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selZone, selPlant, section]);

  if (!open) return null;

  const goSection = (s: Section) => {
    overviewScrollTop.current = scrollRef?.current?.scrollTop ?? 0;
    pendingScroll.current = 0;                 // open section scrolled to top
    setSelZone(null); setSelPlant(null); setSection(s);
  };
  const backToOverview = () => {
    pendingScroll.current = overviewScrollTop.current;  // restore Explore position
    setSelZone(null); setSelPlant(null); setSection('overview');
  };
  const baseProps = { gm, range, setRange, loading: chartLoading };

  return (
    <div style={{ paddingBottom: 8 }}>
      {section === 'overview' ? (
        <div style={{ padding: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {/* Short description of what this section shows */}
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, lineHeight: 1.5, padding: '0 2px' }}>
            See how your greenhouse is doing over time — soil moisture, temperature, plant
            health and watering history. Pick a section below to explore the details.
          </div>
          <GreenhouseHealthCard gm={gm} range={range} />
          <GreenhouseTrendCard gm={gm} range={range} setRange={setRange} loading={chartLoading} />
          <SectionNav
            go={goSection}
            zones={gm.zoneList().length}
            plants={gm.plantList().length}
            waterings={gm.WATERING.length}
          />
        </div>
      ) : section === 'zones' ? (
        <SectionWrap showBack={!selZone} onBack={backToOverview}>
          <ZonesView {...baseProps} selected={selZone}
            onSelect={(id) => { pendingScroll.current = 0; setSelZone(id); }}
            onBack={() => { pendingScroll.current = 0; setSelZone(null); }} />
        </SectionWrap>
      ) : section === 'plants' ? (
        <SectionWrap showBack={!selPlant} onBack={backToOverview}>
          <PlantsView {...baseProps} selected={selPlant}
            onSelect={(id) => { pendingScroll.current = 0; setSelPlant(id); }}
            onBack={() => { pendingScroll.current = 0; setSelPlant(null); }} />
        </SectionWrap>
      ) : (
        <SectionWrap showBack onBack={backToOverview}>
          <WateringView gm={gm} />
        </SectionWrap>
      )}
    </div>
  );
}
