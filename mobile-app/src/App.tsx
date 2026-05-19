import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertsView } from './components/AlertsView';
import { EnvironmentView } from './components/EnvironmentView';
import { GreenhouseView } from './components/GreenhouseView';
import { PlantCare } from './components/PlantCare';
import { PlantEditorSheet } from './components/PlantEditorSheet';
import { SimpleRunoff } from './components/SimpleRunoff';
import { SiteSwitcherSheet } from './components/SiteSwitcherSheet';
import { ZoneDetailSheet } from './components/ZoneDetailSheet';
import { LATEST_READING_URL } from './config';
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

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('plants');
  const [latestReading, setLatestReading] = useState<LatestReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapKind, setMapKind] = useState<MapKind>(loadMapKind);
  const [plantProfiles, setPlantProfiles] = useState<PlantProfile[]>(loadPlantProfiles);
  const [zoneAssignments, setZoneAssignments] = useState<ZoneAssignments>(loadZoneAssignments);
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(loadStoredLayoutSettings);
  const [siteSheetOpen, setSiteSheetOpen] = useState(false);
  const [zoneSheetZone, setZoneSheetZone] = useState<import('./zoneLayout').VisualZone | null>(null);
  const [editorProfile, setEditorProfile] = useState<PlantProfile | null | 'new'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // API polling
  const fetchReading = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(LATEST_READING_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      setLatestReading(data?.zones?.length ? data : null);
      setError(null);
    } catch (e: unknown) {
      setLatestReading(null);
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReading();
    const id = setInterval(fetchReading, 8000);
    return () => clearInterval(id);
  }, [fetchReading]);

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
      return mapZonesToSydneyLayout(latestReading, zoneAssignments, profilesById);
    }
    return mapZonesToLayout(latestReading, layoutSettings, zoneAssignments, profilesById)
      .rows.flatMap((r) => r.zones);
  }, [mapKind, latestReading, layoutSettings, zoneAssignments, profilesById]);

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
            plantProfiles={plantProfiles}
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
        zoneAssignments={zoneAssignments}
        onAssignPlant={onAssignPlant}
        onClose={() => setZoneSheetZone(null)}
        onToast={showToast}
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
