import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertsView } from './components/AlertsView';
import { EnvironmentView } from './components/EnvironmentView';
import { GreenhouseSelector } from './components/GreenhouseSelector';
import { GreenhouseView } from './components/GreenhouseView';
import { PlantCare } from './components/PlantCare';
import { PlantEditorSheet } from './components/PlantEditorSheet';
import { SimpleRunoff } from './components/SimpleRunoff';
import { SiteSwitcherSheet } from './components/SiteSwitcherSheet';
import { ZoneDetailSheet } from './components/ZoneDetailSheet';
import {
  ActivityEntry,
  loadActivityForGh,
  saveActivityForGh,
  logActivityForGh,
} from './activityLog';
import { LATEST_READING_URL } from './config';
import { useGreenhouse } from './context/GreenhouseContext';
import { useSimulation } from './context/SimulationContext';
import { firebaseEnabled } from './services/firebase';
import { subscribeToActivityLog, writeActivityEvent, writeWateringEvent } from './services/activityService';
import { subscribeToLatestReading } from './services/readingsService';
import {
  subscribeToZoneAssignments,
  writeZoneAssignment,
  clearZoneAssignment,
} from './services/zoneAssignmentsService';
import {
  subscribeToCustomProfiles,
  writeCustomProfile,
  deleteCustomProfile,
} from './services/plantProfilesService';
import {
  PlantProfile,
  ZoneAssignments,
  DEFAULT_PLANT_PROFILES,
  isDefaultPlantProfile,
  loadPlantProfiles,
  savePlantProfiles,
  loadZoneAssignmentsForGh,
  saveZoneAssignmentsForGh,
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

// Re-exported so existing component imports (`import { MapKind } from '../App'`) keep working.
export type { MapKind } from './greenhouses';

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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'plants',      label: 'Plants',  icon: '🌱' },
  { id: 'greenhouse',  label: 'Map',     icon: '🗺️' },
  { id: 'environment', label: 'Weather', icon: '☀️' },
  { id: 'alerts',      label: 'Alerts',  icon: '🔔' },
  { id: 'runoff',      label: 'Runoff',  icon: '💧' },
];

const TAB_GREETINGS: Record<Tab, { title: string; emoji: string; sub: (name: string) => string }> = {
  plants:      { title: 'Good morning!',   emoji: '🌤',  sub: (n) => `${n} Greenhouse` },
  greenhouse:  { title: 'Your garden',     emoji: '🗺️',  sub: (n) => `${n} layout` },
  environment: { title: "Today's weather", emoji: '☀️',  sub: (n) => `Inside ${n}` },
  alerts:      { title: 'Heads up!',       emoji: '🔔',  sub: () => 'Things to check' },
  runoff:      { title: 'Water tracker',   emoji: '💧',  sub: () => 'Where your water goes' },
};

export function App() {
  // ── Greenhouse context ──────────────────────────────────────────────────────
  const { greenhouse, setGreenhouse } = useGreenhouse();

  // Derived helpers — safe to use once we've gated on greenhouse !== null below.
  const mapKind = greenhouse?.mapKind ?? 'sydney';
  const ghId    = greenhouse?.id     ?? null;

  // Ref always holds the current ghId — safe to read inside save effects
  // without adding ghId to their dependency arrays (avoids saving old data to new key).
  const ghIdRef = useRef<string | null>(ghId);
  ghIdRef.current = ghId;

  // ── Simulation context ──────────────────────────────────────────────────────
  const { isSimulating, simReading, simHistory, waterSimZone } = useSimulation();

  // ── Data sources (kept separate so priority logic stays explicit) ──────────
  const [firestoreReading, setFirestoreReading] = useState<LatestReading | null>(null);
  const [apiReading, setApiReading] = useState<LatestReading | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // ── Derived reading state ──────────────────────────────────────────────────
  // Simulation overrides everything; otherwise Firestore wins over API.
  const latestReading: LatestReading | null = isSimulating
    ? simReading
    : (firestoreReading ?? apiReading);
  const loading: boolean = isSimulating
    ? simReading === null
    : (latestReading === null && apiLoading);
  const error: string | null = isSimulating ? null : (latestReading === null ? apiError : null);

  const [activeTab, setActiveTab] = useState<Tab>('plants');
  const [plantProfiles, setPlantProfiles] = useState<PlantProfile[]>(loadPlantProfiles);
  const [zoneAssignments, setZoneAssignments] = useState<ZoneAssignments>(() =>
    ghId ? loadZoneAssignmentsForGh(ghId) : {},
  );
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(loadStoredLayoutSettings);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(() =>
    ghId ? loadActivityForGh(ghId) : [],
  );
  const [firestoreActivity, setFirestoreActivity] = useState<ActivityEntry[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(!firebaseEnabled);
  const [profilesFallback, setProfilesFallback] = useState(!firebaseEnabled);
  const [firestoreProfileCount, setFirestoreProfileCount] = useState(0);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(!firebaseEnabled);
  const [assignmentsFallback, setAssignmentsFallback] = useState(!firebaseEnabled);
  const [activityLoaded, setActivityLoaded] = useState(!firebaseEnabled);
  const [activityFallback, setActivityFallback] = useState(!firebaseEnabled);
  const [siteSheetOpen, setSiteSheetOpen] = useState(false);
  const [zoneSheetZone, setZoneSheetZone] = useState<VisualZone | null>(null);
  const [editorProfile, setEditorProfile] = useState<PlantProfile | null | 'new'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migratedActivityRef = useRef<Set<string>>(new Set());

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

  // ── Reload all greenhouse-scoped state when the active greenhouse changes ───
  useEffect(() => {
    if (!ghId) return;
    console.info(`[GreenMirror] Greenhouse switched to "${ghId}" — reloading scoped state`);
    const localAssignments = loadZoneAssignmentsForGh(ghId);
    if (Object.keys(localAssignments).length > 0) {
      console.info(
        `[GreenMirror] localStorage fallback: ${Object.keys(localAssignments).length} assignments for "${ghId}"`,
        '(will be overwritten by Firestore subscription)',
      );
    }
    setZoneAssignments(localAssignments);
    setActivityLog(loadActivityForGh(ghId));
    setFirestoreActivity([]);   // cleared until new subscription delivers
    setFirestoreReading(null);  // clear previous site's reading
    setAssignmentsLoaded(!firebaseEnabled);
    setAssignmentsFallback(!firebaseEnabled);
    setActivityLoaded(!firebaseEnabled);
    setActivityFallback(!firebaseEnabled);
  }, [ghId]);

  // ── Firestore zone assignments — cross-device sync ───────────────────────────
  useEffect(() => {
    if (!ghId) return;
    const currentGhId = ghId;
    setAssignmentsLoaded(false);
    setAssignmentsFallback(false);
    const unsub = subscribeToZoneAssignments(currentGhId, (assignments, docExists) => {
      if (!docExists) {
        // Document not yet created — migrate local assignments up to Firestore
        const local = loadZoneAssignmentsForGh(currentGhId);
        if (Object.keys(local).length > 0) {
          console.info(
            `[GreenMirror] Migrating ${Object.keys(local).length} local assignments to Firestore for "${currentGhId}"`,
          );
          Object.entries(local).forEach(([zoneKey, plantId]) => {
            writeZoneAssignment(currentGhId, zoneKey, plantId);
          });
          console.info(`[GreenMirror] localStorage -> Firestore assignment migration happened for "${currentGhId}"`);
        } else {
          setZoneAssignments({});
          saveZoneAssignmentsForGh(currentGhId, {});
        }
        setAssignmentsLoaded(true);
        setAssignmentsFallback(false);
        return; // keep current local state; Firestore write above will trigger a second callback
      }
      console.info(
        `[GreenMirror] Applying ${Object.keys(assignments).length} Firestore assignments to state for "${currentGhId}"`,
      );
      setZoneAssignments(assignments);
      saveZoneAssignmentsForGh(currentGhId, assignments);
      setAssignmentsLoaded(true);
      setAssignmentsFallback(false);
    }, (err) => {
      console.warn(`[GreenMirror] localStorage fallback used for assignments in "${currentGhId}":`, err.message);
      setZoneAssignments(loadZoneAssignmentsForGh(currentGhId));
      setAssignmentsLoaded(true);
      setAssignmentsFallback(true);
    });
    if (!unsub) {
      console.info(`[GreenMirror] localStorage fallback used for assignments in "${currentGhId}" because Firestore is unavailable`);
      setZoneAssignments(loadZoneAssignmentsForGh(currentGhId));
      setAssignmentsLoaded(true);
      setAssignmentsFallback(true);
    }
    return () => { unsub?.(); };
  }, [ghId]);

  // ── Firestore plant profiles — global cross-device sync ──────────────────────
  useEffect(() => {
    const unsub = subscribeToCustomProfiles((firestoreProfiles) => {
      setProfilesLoaded(true);
      setProfilesFallback(false);
      setFirestoreProfileCount(firestoreProfiles.length);
      console.info(`[GreenMirror] Firestore profile snapshot received: ${firestoreProfiles.length} profiles`);
      if (firestoreProfiles.length === 0) {
        setPlantProfiles((current) => {
          const customLocal = current.filter((p) => !p.isDefault);
          if (customLocal.length > 0) {
            console.info(`[GreenMirror] Migrating ${customLocal.length} local custom profiles to Firestore`);
            customLocal.forEach((p) => writeCustomProfile(p));
            console.info('[GreenMirror] localStorage -> Firestore profile migration happened');
          } else {
            console.info('[GreenMirror] Firestore plantProfiles empty — no local custom profiles to migrate');
          }
          return current; // keep current state until Firestore round-trip returns
        });
        return;
      }
      const firestoreById = new Map(firestoreProfiles.map((p) => [p.id, p]));
      setPlantProfiles(() => {
        const merged: PlantProfile[] = DEFAULT_PLANT_PROFILES.map((def) => {
          const override = firestoreById.get(def.id);
          return override ? { ...override, isDefault: true } : { ...def, isDefault: true };
        });
        firestoreProfiles
          .filter((p) => !DEFAULT_PLANT_PROFILES.some((d) => d.id === p.id))
          .forEach((p) => merged.push({ ...p, isDefault: false, isCustom: true }));
        console.info(
          `[GreenMirror] Applied ${firestoreProfiles.length} Firestore profiles — ${merged.length} total profiles`,
        );
        return merged;
      });
    }, (err) => {
      console.warn('[GreenMirror] localStorage fallback used for plant profiles:', err.message);
      setProfilesLoaded(true);
      setProfilesFallback(true);
      setFirestoreProfileCount(0);
    });
    if (!unsub) {
      console.info('[GreenMirror] localStorage fallback used for plant profiles because Firestore is unavailable');
      setProfilesLoaded(true);
      setProfilesFallback(true);
      setFirestoreProfileCount(0);
    }
    return () => { unsub?.(); };
  }, []);

  // ── Firestore activity log listener ─────────────────────────────────────────
  useEffect(() => {
    if (!ghId) return;
    const currentGhId = ghId;
    setActivityLoaded(false);
    setActivityFallback(false);
    const unsub = subscribeToActivityLog(currentGhId, (entries) => {
      let migratedLocalActivity = false;
      if (entries.length === 0 && !migratedActivityRef.current.has(currentGhId)) {
        const local = loadActivityForGh(currentGhId);
        if (local.length > 0) {
          migratedLocalActivity = true;
          migratedActivityRef.current.add(currentGhId);
          console.info(`[GreenMirror] Migrating ${local.length} local activity entries to Firestore for "${currentGhId}"`);
          local.slice(0, 30).forEach((entry) => {
            writeActivityEvent({
              type: entry.type,
              greenhouseId: currentGhId,
              visualZoneId: entry.visualZoneId,
              nodeId: entry.nodeId,
              plantName: entry.plantName,
              amountMl: entry.amountMl,
              message: entry.message,
              source: entry.source,
            });
          });
          console.info('[GreenMirror] localStorage -> Firestore activity migration happened');
        }
      }
      setFirestoreActivity(entries);
      if (!migratedLocalActivity) saveActivityForGh(currentGhId, entries);
      setActivityLoaded(true);
      setActivityFallback(false);
    }, 30, (err) => {
      console.warn(`[GreenMirror] localStorage fallback used for activity in "${currentGhId}":`, err.message);
      setFirestoreActivity([]);
      setActivityLog(loadActivityForGh(currentGhId));
      setActivityLoaded(true);
      setActivityFallback(true);
    });
    if (!unsub) {
      console.info(`[GreenMirror] localStorage fallback used for activity in "${currentGhId}" because Firestore is unavailable`);
      setFirestoreActivity([]);
      setActivityLog(loadActivityForGh(currentGhId));
      setActivityLoaded(true);
      setActivityFallback(true);
    }
    return () => { unsub?.(); };
  }, [ghId]);

  // ── Firestore real-time listener — re-subscribes when greenhouse changes ────
  useEffect(() => {
    if (!ghId) return; // no greenhouse selected yet

    if (!firebaseEnabled) {
      console.info(
        '[GreenMirror] Firestore disabled — API polling is the only data source.',
        '\n  To enable Firestore: set VITE_FIREBASE_* env vars in mobile-app/.env.local',
      );
      return;
    }

    console.info('[GreenMirror] Firestore listener starting for greenhouse "' + ghId + '"');
    setFirestoreReading(null); // clear previous site's reading on switch

    const unsub = subscribeToLatestReading(
      ghId,
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
      },
    );

    return () => { unsub?.(); };
  }, [ghId]); // Re-subscribe whenever the active greenhouse changes

  // ── Data source logging (fires only when source changes) ───────────────────
  const prevSourceRef = useRef<string>('offline');
  useEffect(() => {
    const src = firestoreReading ? 'firestore' : apiReading ? 'api' : 'offline';
    if (src !== prevSourceRef.current) {
      console.info('[GreenMirror] Active data source:', prevSourceRef.current, '→', src);
      prevSourceRef.current = src;
    }
  }, [firestoreReading, apiReading]);

  // ── Persist state ───────────────────────────────────────────────────────────
  useEffect(() => { savePlantProfiles(plantProfiles); }, [plantProfiles]);

  // Greenhouse-scoped saves: use ghIdRef so we always write to the current
  // greenhouse's key even if ghId changes mid-flight.
  useEffect(() => {
    const id = ghIdRef.current;
    if (id) saveZoneAssignmentsForGh(id, zoneAssignments);
  }, [zoneAssignments]); // intentionally omits ghId — ref handles it

  useEffect(() => {
    const id = ghIdRef.current;
    if (id) saveActivityForGh(id, activityLog);
  }, [activityLog]); // intentionally omits ghId — ref handles it

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

  const localStorageFallbackActive = profilesFallback || assignmentsFallback || activityFallback;
  const syncStatusLabel = localStorageFallbackActive
    ? 'Offline fallback'
    : (profilesLoaded && assignmentsLoaded && activityLoaded ? 'Connected' : 'Syncing');

  useEffect(() => {
    if (!ghId) return;
    console.info('[GreenMirror] diagnostics', {
      greenhouseId: ghId,
      firestoreProfiles: firestoreProfileCount,
      assignmentKeys: Object.keys(zoneAssignments).length,
      activityLogs: activityLoaded && !activityFallback ? firestoreActivity.length : activityLog.length,
      localStorageFallbackActive,
      syncStatus: syncStatusLabel,
    });
  }, [
    ghId,
    firestoreProfileCount,
    zoneAssignments,
    activityLoaded,
    activityFallback,
    firestoreActivity.length,
    activityLog.length,
    localStorageFallbackActive,
    syncStatusLabel,
  ]);

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
    writeCustomProfile(p); // sync to Firestore for cross-device consistency
    if (ghId) {
      writeActivityEvent({
        type: 'profile-update',
        greenhouseId: ghId,
        plantName: p.name,
        message: `Saved plant profile ${p.name}`,
      });
    }
    setEditorProfile(null);
    showToast(p.name ? `Saved ${p.name}` : 'Profile saved');
  }, [ghId, showToast]);

  const onDeleteProfile = useCallback((id: string) => {
    const p = plantProfiles.find((x) => x.id === id);
    const assignedZoneKeys = Object.entries(zoneAssignments)
      .filter(([, plantId]) => plantId === id)
      .map(([zoneKey]) => zoneKey);
    setPlantProfiles((list) => list.filter((x) => x.id !== id));
    setZoneAssignments((a) => {
      const next = { ...a };
      Object.keys(next).forEach((k) => { if (next[k] === id) delete next[k]; });
      return next;
    });
    deleteCustomProfile(id); // remove from Firestore
    if (ghId) {
      assignedZoneKeys.forEach((zoneKey) => clearZoneAssignment(ghId, zoneKey));
      writeActivityEvent({
        type: 'profile-update',
        greenhouseId: ghId,
        plantName: p?.name,
        message: `Deleted plant profile ${p?.name ?? id}`,
      });
    }
    setEditorProfile(null);
    showToast(`Deleted ${p?.name ?? 'profile'}`);
  }, [ghId, plantProfiles, showToast, zoneAssignments]);

  const onResetProfile = useCallback((id: string) => {
    const def = DEFAULT_PLANT_PROFILES.find((p) => p.id === id);
    if (!def) return;
    setPlantProfiles((list) => list.map((p) => (p.id === id ? { ...def } : p)));
    deleteCustomProfile(id); // remove Firestore override so hardcoded default is used on all devices
    if (ghId) {
      writeActivityEvent({
        type: 'profile-update',
        greenhouseId: ghId,
        plantName: def.name,
        message: `Reset ${def.name} profile to defaults`,
      });
    }
    setEditorProfile(null);
    showToast(`Reset ${def.name} to defaults`);
  }, [ghId, showToast]);

  const onWaterZone = useCallback((zone: VisualZone, amountMl: number) => {
    const plantName = zone.assignedPlant ? profilesById.get(zone.assignedPlant)?.name : undefined;
    const zoneName  = zone.displayLabel ?? zone.visualLabel;
    if (isSimulating) {
      // In simulation mode: update physics immediately, skip Firestore
      waterSimZone(zone.backendZoneId ?? zone.visualLabel);
      if (ghId) {
        logActivityForGh(ghId, {
          type: 'watering',
          visualZoneId: zone.visualLabel,
          plantName,
          amountMl,
          message: `[Sim] Watered ${zoneName}${plantName ? ` (${plantName})` : ''} · ${amountMl}ml`,
          source: 'manual',
        });
        setActivityLog(loadActivityForGh(ghId));
      }
    } else {
      if (ghId) {
        logActivityForGh(ghId, {
          type: 'watering',
          visualZoneId: zone.visualLabel,
          backendZoneId: zone.backendZoneId,
          nodeId: zone.nodeId,
          plantName,
          amountMl,
          message: `Watered ${zoneName}${plantName ? ` (${plantName})` : ''} · ${amountMl}ml`,
          source: 'manual',
        });
        setActivityLog(loadActivityForGh(ghId));
        writeWateringEvent({
          greenhouseId: ghId,
          visualZoneId: zone.visualLabel,
          amountMl,
          plantName,
          nodeId: zone.nodeId ?? undefined,
          source: 'manual',
        });
      }
    }
    showToast(`💧 Watered ${zoneName} (${amountMl}ml)`);
  }, [ghId, isSimulating, waterSimZone, profilesById, showToast]);

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
    if (ghId) {
      // Firestore write for cross-device sync
      if (plantId) {
        writeZoneAssignment(ghId, zoneKey, plantId);
        logActivityForGh(ghId, {
          type: 'assignment',
          visualZoneId: zoneKey,
          plantName,
          message: `Assigned ${plantName ?? plantId} to ${zoneKey}`,
        });
        writeActivityEvent({
          type: 'assignment',
          greenhouseId: ghId,
          visualZoneId: zoneKey,
          plantName,
          message: `Assigned ${plantName ?? plantId} to ${zoneKey}`,
          source: 'manual',
        });
      } else {
        clearZoneAssignment(ghId, zoneKey);
        logActivityForGh(ghId, {
          type: 'cleared',
          visualZoneId: zoneKey,
          message: `Cleared plant from ${zoneKey}`,
        });
        writeActivityEvent({
          type: 'cleared',
          greenhouseId: ghId,
          visualZoneId: zoneKey,
          message: `Cleared plant from ${zoneKey}`,
          source: 'manual',
        });
      }
      setActivityLog(loadActivityForGh(ghId));
    }
  }, [ghId, profilesById]);

  // ── ALL HOOKS ABOVE THIS LINE ───────────────────────────────────────────────
  // Gate: show onboarding if no greenhouse selected yet.
  if (!greenhouse) {
    return <GreenhouseSelector onSelect={setGreenhouse} />;
  }

  const ghName = greenhouse.name;
  const g = TAB_GREETINGS[activeTab];

  return (
    <div className="gm-app">
      {/* HEADER */}
      <header className={`gm-header${scrolled ? ' scrolled' : ''}`}>
        <div className="gm-brand">
          <h1>
            {g.title} <span style={{ fontSize: 20, lineHeight: 1 }}>{g.emoji}</span>
          </h1>
          <small>{g.sub(ghName)}</small>
        </div>
        <button
          className="gm-avatar"
          onClick={() => setSiteSheetOpen(true)}
          aria-label="Switch greenhouse"
        >
          👩‍🌾
        </button>
      </header>

      {/* SIMULATION BANNER */}
      {isSimulating && (
        <div style={{
          background: '#fffbeb',
          borderBottom: '2px solid #f59e0b',
          color: '#92400e',
          padding: '5px 16px',
          fontSize: 11,
          fontWeight: 800,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          letterSpacing: '0.07em',
          flexShrink: 0,
        }}>
          ⚗️ SIMULATION MODE — tap 👩‍🌾 to disable
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '6px 16px',
        borderBottom: '1px solid var(--line)',
        background: localStorageFallbackActive ? '#fff7ed' : '#ecfdf5',
        color: localStorageFallbackActive ? '#9a3412' : '#166534',
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        <span>Database: {syncStatusLabel}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {ghId} · profiles {firestoreProfileCount} · zones {Object.keys(zoneAssignments).length} · activity {activityLoaded && !activityFallback ? firestoreActivity.length : activityLog.length}
        </span>
      </div>

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
            greenhouseId={ghId ?? ''}
            firestoreActivity={firestoreActivity}
            activityLoaded={activityLoaded}
            activityFallback={activityFallback}
            assignmentsLoaded={assignmentsLoaded}
            simHistory={isSimulating ? simHistory : undefined}
          />
        )}
        {activeTab === 'greenhouse' && (
          <GreenhouseView
            latestReading={latestReading}
            loading={loading}
            error={error}
            mapKind={mapKind}
            setMapKind={setGreenhouse}
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
