import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertsView } from './components/AlertsView';
import { EnvironmentView } from './components/EnvironmentView';
import { GreenhouseView } from './components/GreenhouseView';
import { PlantCare } from './components/PlantCare';
import { PlantEditorSheet } from './components/PlantEditorSheet';
import { SimpleRunoff } from './components/SimpleRunoff';
import { SiteSwitcherSheet } from './components/SiteSwitcherSheet';
import { ZoneDetailSheet } from './components/ZoneDetailSheet';
import { ActivityEntry, loadActivity, logActivity } from './activityLog';
import { LATEST_READING_URL } from './config';
import { firebaseEnabled } from './services/firebase';
import { subscribeToLatestReading } from './services/readingsService';
import {
  PlantProfile,
  ZoneAssignments,
  DEFAULT_PLANT_PROFILES,
  isDefaultPlantProfile,
  loadPlantProfiles,
  loadZoneAssignments,
  savePlantProfiles,
  saveZoneAssignments
} from './plantProfiles';
import { mapZonesToSydneyLayout } from './sydneyLayout';
import {
  LatestReading,
  LayoutSettings,
  VisualZone,
  createDefaultSettings,
  mapZonesToLayout,
  sanitizeSettings
} from './zoneLayout';

export type MapKind = 'truro' | 'sydney';

const LAYOUT_SETTINGS_KEY = 'greenmirror-map-layout-settings';

function loadStoredLayoutSettings(): LayoutSettings {
  try {
    const raw = window.localStorage.getItem(LAYOUT_SETTINGS_KEY);
    if (!raw) return createDefaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return createDefaultSettings();
  }
}

type Tab = 'plants' | 'greenhouse' | 'environment' | 'alerts' | 'runoff';

const MAP_KIND_KEY = 'greenmirror-map-kind';

function loadMapKind(): MapKind {
  if (typeof window === 'undefined') return 'truro';
  return window.localStorage.getItem(MAP_KIND_KEY) === 'sydney' ? 'sydney' : 'truro';
}

const SITE_INFO: Record<MapKind, { name: string; region: string }> = {
  sydney: { name: 'Sydney', region: 'Sydney, NSW' },
  truro: { name: 'Truro', region: 'Truro, Cornwall' }
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'plants',      label: 'Plants',  icon: '🌱' },
  { id: 'greenhouse',  label: 'Map',     icon: '🗺️' },
  { id: 'environment', label: 'Weather', icon: '☀️' },
  { id: 'alerts',      label: 'Alerts',  icon: '🔔' },
  { id: 'runoff',      label: 'Runoff',  icon: '💧' },
];

const TAB_GREETINGS: Record<Tab, { title: string; emoji: string; sub: (site: MapKind) => string }> = {
  plants:      { title: 'Good morning!',   emoji: '🌤',  sub: () => 'GreenMirror Garden' },
  greenhouse:  { title: 'Your garden',     emoji: '🗺️',  sub: (s) => `${SITE_INFO[s].name} layout` },
  environment: { title: "Today's weather", emoji: '☀️',  sub: (s) => `Inside ${SITE_INFO[s].name}` },
  alerts:      { title: 'Heads up!',       emoji: '🔔',  sub: () => 'Things to check' },
  runoff:      { title: 'Water tracker',   emoji: '💧',  sub: () => 'Where your water goes' },
};

// Greenhouse ID used as the Firestore document key for latestReadings.
// The backend writes `latestReadings/{reading.greenhouse_id || 'primary'}`.
const FIRESTORE_GH_ID = 'primary';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('plants');

  // ── Data sources (kept separate so priority logic stays explicit) ──────────
  // Firestore real-time reading — set by the onSnapshot listener below.
  const [firestoreReading, setFirestoreReading] = useState<LatestReading | null>(null);
  // API polling reading — set by fetchReading().
  const [apiReading, setApiReading] = useState<LatestReading | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // ── Derived reading state (Firestore wins when present) ────────────────────
  // These are what every downstream component receives — same interface as before.
  const latestReading: LatestReading | null = firestoreReading ?? apiReading;
  const loading: boolean = latestReading === null && apiLoading;
  const error: string | null = latestReading === null ? apiError : null;

  const [mapKind, setMapKind] = useState<MapKind>(loadMapKind);
  const [plantProfiles, setPlantProfiles] = useState<PlantProfile[]>(loadPlantProfiles);
  const [zoneAssignments, setZoneAssignments] = useState<ZoneAssignments>(loadZoneAssignments);
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(loadStoredLayoutSettings);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(loadActivity);
  const [siteSheetOpen, setSiteSheetOpen] = useState(false);
  const [zoneSheetZone, setZoneSheetZone] = useState<VisualZone | null>(null);
  const [editorProfile, setEditorProfile] = useState<PlantProfile | null | 'new'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── API polling (always runs; primary source when Firestore is absent) ──────
  const fetchReading = useCallback(async () => {
    setApiLoading(true);
    try {
      const res = await fetch(LATEST_READING_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      const reading: LatestReading | null = data?.zones?.length ? data : null;
      setApiReading(reading);
      setApiError(null);
      if (reading) {
        console.info(
          '[GreenMirror] API reading · zones:', reading.zones.length,
          '· ts:', reading.timestamp,
          firestoreReading ? '(Firestore active — API as heartbeat)' : '(API is primary source)',
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Fetch failed';
      setApiReading(null);
      setApiError(msg);
      console.warn('[GreenMirror] API polling failed:', msg,
        firestoreReading ? '— Firestore data still active' : '— no data available',
      );
    } finally {
      setApiLoading(false);
    }
  }, [firestoreReading]);

  useEffect(() => {
    fetchReading();
    const id = setInterval(fetchReading, 8000);
    return () => clearInterval(id);
  }, [fetchReading]);

  // ── Firestore real-time listener ────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseEnabled) {
      console.info(
        '[GreenMirror] Firestore disabled — API polling is the only data source.',
        '\n  To enable Firestore: set VITE_FIREBASE_* env vars in mobile-app/.env.local',
      );
      return;
    }

    console.info('[GreenMirror] Firestore listener starting for greenhouse "' + FIRESTORE_GH_ID + '"');

    const unsub = subscribeToLatestReading(
      FIRESTORE_GH_ID,
      (reading) => {
        console.info(
          '[GreenMirror] Firestore reading received · zones:', reading.zones?.length,
          '· ts:', reading.timestamp,
        );
        setFirestoreReading(reading);
      },
      (err) => {
        console.warn('[GreenMirror] Firestore listener error:', err.message,
          '— falling back to API polling',
        );
        // Don't touch firestoreReading — let it go stale naturally;
        // API polling keeps latestReading alive through apiReading.
      },
    );

    return () => { unsub?.(); };
  }, []); // Single subscription for the session — FIRESTORE_GH_ID is stable

  // ── Data source logging (fires only when source changes) ───────────────────
  const prevSourceRef = useRef<string>('offline');
  useEffect(() => {
    const src = firestoreReading ? 'firestore' : apiReading ? 'api' : 'offline';
    if (src !== prevSourceRef.current) {
      console.info('[GreenMirror] Active data source:', prevSourceRef.current, '→', src);
      prevSourceRef.current = src;
    }
  }, [firestoreReading, apiReading]);

  // Persist state
  useEffect(() => { savePlantProfiles(plantProfiles); }, [plantProfiles]);
  useEffect(() => { saveZoneAssignments(zoneAssignments); }, [zoneAssignments]);
  useEffect(() => { window.localStorage.setItem(MAP_KIND_KEY, mapKind); }, [mapKind]);
  useEffect(() => {
    window.localStorage.setItem(LAYOUT_SETTINGS_KEY, JSON.stringify(layoutSettings));
  }, [layoutSettings]);

  // Reset scroll on tab change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    setScrolled(false);
  }, [activeTab]);

  const profilesById = useMemo(
    () => new Map(plantProfiles.map((p) => [p.id, p])),
    [plantProfiles]
  );

  const resolvedZones = useMemo((): VisualZone[] => {
    if (mapKind === 'sydney') {
      return mapZonesToSydneyLayout(latestReading, zoneAssignments);
    }
    return mapZonesToLayout(latestReading, layoutSettings, zoneAssignments)
      .rows.flatMap((r) => r.zones);
  }, [mapKind, latestReading, layoutSettings, zoneAssignments]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // Plant profile CRUD
  const onAddProfile = useCallback((prefill?: string) => {
    if (prefill) {
      setEditorProfile({
        id: '',
        name: prefill,
        icon: '🌱',
        moistureMin: 50,
        moistureMax: 70,
        soilTempMin: 15,
        soilTempMax: 25
      });
    } else {
      setEditorProfile('new');
    }
  }, []);

  const onEditProfile = useCallback((p: PlantProfile) => {
    setEditorProfile(p);
  }, []);

  const onSaveProfile = useCallback((p: PlantProfile) => {
    setPlantProfiles((list) => {
      const idx = list.findIndex((x) => x.id === p.id);
      if (idx === -1) return [...list, p];
      const next = [...list];
      next[idx] = p;
      return next;
    });
    setEditorProfile(null);
    showToast(p.name ? `Saved ${p.name}` : 'Profile saved');
  }, [showToast]);

  const onDeleteProfile = useCallback((id: string) => {
    const p = plantProfiles.find((x) => x.id === id);
    setPlantProfiles((list) => list.filter((x) => x.id !== id));
    setZoneAssignments((a) => {
      const next = { ...a };
      Object.keys(next).forEach((k) => { if (next[k] === id) delete next[k]; });
      return next;
    });
    setEditorProfile(null);
    showToast(`Deleted ${p?.name ?? 'profile'}`);
  }, [plantProfiles, showToast]);

  const onResetProfile = useCallback((id: string) => {
    const def = DEFAULT_PLANT_PROFILES.find((p) => p.id === id);
    if (!def) return;
    setPlantProfiles((list) => list.map((p) => (p.id === id ? { ...def } : p)));
    setEditorProfile(null);
    showToast(`Reset ${def.name} to defaults`);
  }, [showToast]);

  const onWaterZone = useCallback((zone: VisualZone, amountMl: number) => {
    const plantName = zone.assignedPlant ? profilesById.get(zone.assignedPlant)?.name : undefined;
    const zoneName = zone.displayLabel ?? zone.visualLabel;
    logActivity({
      type: 'watering',
      visualZoneId: zone.visualLabel,
      backendZoneId: zone.backendZoneId,
      nodeId: zone.nodeId,
      plantName,
      amountMl,
      message: `Watered ${zoneName}${plantName ? ` (${plantName})` : ''} · ${amountMl}ml`,
    });
    setActivityLog(loadActivity());
    showToast(`💧 Watered ${zoneName} (${amountMl}ml)`);
  }, [profilesById, showToast]);

  const onAssignPlant = useCallback((zoneKey: string, plantId: string | null) => {
    setZoneAssignments((a) => {
      const next = { ...a };
      if (plantId) {
        next[zoneKey] = plantId;
      } else {
        delete next[zoneKey];
      }
      return next;
    });
    setZoneSheetZone((z) =>
      z && z.visualLabel === zoneKey
        ? {
            ...z,
            assignedPlant: plantId,
            assignedPlantProfile: plantId ? profilesById.get(plantId) ?? null : null,
            assignedPlantMissing: Boolean(plantId && !profilesById.has(plantId))
          }
        : z
    );
    const plantName = plantId ? profilesById.get(plantId)?.name : undefined;
    if (plantId) {
      logActivity({
        type: 'assignment',
        visualZoneId: zoneKey,
        plantName,
        message: `Assigned ${plantName ?? plantId} to ${zoneKey}`,
      });
    } else {
      logActivity({
        type: 'cleared',
        visualZoneId: zoneKey,
        message: `Cleared plant from ${zoneKey}`,
      });
    }
    setActivityLog(loadActivity());
  }, [profilesById]);

  const g = TAB_GREETINGS[activeTab];

  return (
    <div className="gm-app">
      {/* HEADER */}
      <header className={`gm-header${scrolled ? ' scrolled' : ''}`}>
        <div className="gm-brand">
          <h1>
            {g.title} <span style={{ fontSize: 20, lineHeight: 1 }}>{g.emoji}</span>
          </h1>
          <small>{g.sub(mapKind)}</small>
        </div>
        <button
          className="gm-avatar"
          onClick={() => setSiteSheetOpen(true)}
          aria-label="Switch greenhouse site"
        >
          👩‍🌾
        </button>
      </header>

      {/* SCROLL BODY */}
      <div
        className="gm-scroll"
        ref={scrollRef}
        onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 8)}
      >
        {activeTab === 'plants' && (
          <PlantCare
            zones={resolvedZones}
            loading={loading}
            error={error}
            plantProfiles={plantProfiles}
            profilesById={profilesById}
            onOpenZone={setZoneSheetZone}
            onAddProfile={onAddProfile}
            onEditProfile={onEditProfile}
            onToast={showToast}
            activityLog={activityLog}
            onWaterZone={onWaterZone}
          />
        )}
        {activeTab === 'greenhouse' && (
          <GreenhouseView
            latestReading={latestReading}
            loading={loading}
            error={error}
            mapKind={mapKind}
            setMapKind={setMapKind}
            profilesById={profilesById}
            zoneAssignments={zoneAssignments}
            onAssignPlant={onAssignPlant}
            onOpenZone={setZoneSheetZone}
            onToast={showToast}
            layoutSettings={layoutSettings}
            setLayoutSettings={setLayoutSettings}
          />
        )}
        {activeTab === 'environment' && <EnvironmentView site={mapKind} />}
        {activeTab === 'alerts' && (
          <AlertsView
            zones={resolvedZones}
            loading={loading}
            error={error}
            profilesById={profilesById}
            onOpenZone={setZoneSheetZone}
          />
        )}
        {activeTab === 'runoff' && <SimpleRunoff />}
      </div>

      {/* BOTTOM NAV */}
      <nav className="gm-tabbar" aria-label="Primary navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`gm-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="gm-tab-glyph" style={{ fontSize: 20 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* TOAST */}
      <div className={`gm-toast${toast ? ' show' : ''}`} aria-live="polite">
        <span style={{ fontSize: 16 }}>✓</span>
        <span>{toast}</span>
      </div>

      {/* SHEETS */}
      <SiteSwitcherSheet
        open={siteSheetOpen}
        onClose={() => setSiteSheetOpen(false)}
        site={mapKind}
        setSite={(s) => { setMapKind(s); setSiteSheetOpen(false); }}
      />

      <ZoneDetailSheet
        zone={zoneSheetZone}
        plantProfiles={plantProfiles}
        profilesById={profilesById}
        onAssignPlant={onAssignPlant}
        onClose={() => setZoneSheetZone(null)}
        onToast={showToast}
        onWaterZone={onWaterZone}
      />

      <PlantEditorSheet
        open={editorProfile !== null}
        profile={editorProfile === 'new' ? null : editorProfile}
        isDefault={editorProfile !== null && editorProfile !== 'new' && isDefaultPlantProfile((editorProfile as PlantProfile).id)}
        onClose={() => setEditorProfile(null)}
        onSave={onSaveProfile}
        onDelete={onDeleteProfile}
        onReset={onResetProfile}
      />
    </div>
  );
}
