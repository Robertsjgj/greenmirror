import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertsView } from './components/AlertsView';
import { ZoneAlert, evaluateAllAlerts } from './alertRules';
import { EnvironmentView } from './components/EnvironmentView';
import { GreenhouseSelector } from './components/GreenhouseSelector';
import { GreenhouseView } from './components/GreenhouseView';
import { PlantCare } from './components/PlantCare';
import { PlantEditorSheet } from './components/PlantEditorSheet';
import { TrendsDashboard } from './components/TrendsDashboard';
import { SimpleRunoff } from './components/SimpleRunoff';
import { SiteSwitcherSheet } from './components/SiteSwitcherSheet';
import { ZoneDetailSheet } from './components/ZoneDetailSheet';
import {
  ActivityEntry,
  loadActivityForGh,
  saveActivityForGh,
  logActivityForGh,
} from "./activityLog";
import { LATEST_READING_URL } from "./config";
import { useGreenhouse } from "./context/GreenhouseContext";
import { useSimulation } from "./context/SimulationContext";
import { firebaseEnabled } from "./services/firebase";
import {
  subscribeToActivityLog,
  writeActivityEvent,
  writeWateringEvent,
} from "./services/activityService";
import { subscribeToLatestReading } from "./services/readingsService";
import {
  NotificationDoc,
  NotificationInput,
  subscribeToNotifications,
  upsertActiveNotification,
  resolveNotification,
} from './services/notificationsService';
import {
  subscribeToZoneAssignments,
  writeZoneAssignment,
  clearZoneAssignment,
} from "./services/zoneAssignmentsService";
import {
  subscribeToCustomProfiles,
  writeCustomProfile,
  deleteCustomProfile,
} from "./services/plantProfilesService";
import {
  PlantProfile,
  ZoneAssignments,
  DEFAULT_PLANT_PROFILES,
  isDefaultPlantProfile,
  loadPlantProfiles,
  savePlantProfiles,
  loadZoneAssignmentsForGh,
  saveZoneAssignmentsForGh,
} from "./plantProfiles";
import { mapZonesToSydneyLayout } from "./sydneyLayout";
import { resolveZoneId } from "./zoneRegistry";
import {
  LatestReading,
  LayoutSettings,
  VisualZone,
  createDefaultSettings,
  mapZonesToLayout,
  sanitizeSettings,
} from "./zoneLayout";
import { LoginView } from "./components/LoginView";
import { useAuth } from "./context/AuthContext";
import { AdminUsersView } from "./components/AdminUsersView";
import { ChangePasswordSheet } from "./components/ChangePasswordSheet";
import { WateringScheduleView } from "./components/WateringScheduleView";
import { ActivityHistoryView } from "./components/ActivityHistoryView";

// Re-exported so existing component imports (`import { MapKind } from '../App'`) keep working.
export type { MapKind } from "./greenhouses";

const LAYOUT_SETTINGS_KEY = "greenmirror-map-layout-settings";

// Canonical zone ID for a visual zone: prefer the backend reading's zone_id
// (stable, backend-owned); fall back to the bed's canonical visualLabel when
// there is no reading yet. Resolved so legacy IDs collapse to the canonical
// form. Never uses the friendly display name.
function zoneCanonicalId(z: VisualZone): string {
  return resolveZoneId(z.backendZoneId ?? z.visualLabel);
}

function loadStoredLayoutSettings(): LayoutSettings {
  try {
    const raw = window.localStorage.getItem(LAYOUT_SETTINGS_KEY);
    if (!raw) return createDefaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return createDefaultSettings();
  }
}

// ── Bell badge acknowledgement (local-only, per greenhouse) ─────────────────
// Set of alert IDs the user has already viewed — drives the "unread only" bell
// badge. Resolution is handled separately and automatically (see below).
const ALERTS_SEEN_KEY = (ghId: string) => `greenmirror-alerts-seen-${ghId}`;

function loadIdSet(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, set: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* ignore quota/serialization errors — acknowledgement is best-effort */
  }
}

// ── Notifications history store ─────────────────────────────────────────────
// Notifications persist to the Firestore `notifications` collection. When
// Firebase is not configured we fall back to this per-greenhouse localStorage
// mirror so the resolved/history flow still works offline.
const NOTIFICATIONS_KEY = (ghId: string) => `greenmirror-notifications-${ghId}`;

function loadLocalNotifications(ghId: string): NotificationDoc[] {
  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_KEY(ghId));
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? (arr as NotificationDoc[]) : [];
  } catch {
    return [];
  }
}

function saveLocalNotifications(ghId: string, docs: NotificationDoc[]) {
  try {
    // Keep active + the most recent resolved so history stays bounded.
    const active = docs.filter((d) => d.status === 'active');
    const resolved = docs
      .filter((d) => d.status === 'resolved')
      .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
      .slice(0, 100);
    window.localStorage.setItem(NOTIFICATIONS_KEY(ghId), JSON.stringify([...active, ...resolved]));
  } catch {
    /* ignore */
  }
}

// Build a Firestore/local notification snapshot from a live alert.
function alertToNotificationInput(a: ZoneAlert): NotificationInput {
  return {
    alertId: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    message: a.message,
    action: a.action,
    zoneId: a.zoneId,
    displayLabel: a.displayLabel,
    plantName: a.plantName,
  };
}

type Tab = 'plants' | 'greenhouse' | 'environment' | 'runoff';

// Bottom-nav items. `trends` is not a Tab — it opens the existing Trends &
// Analysis sheet (same destination as the Home "Open Trends & Analysis" card)
// rather than swapping the tab body.
type NavId = 'plants' | 'greenhouse' | 'environment' | 'trends' | 'runoff';

const NAV_ITEMS: { id: NavId; label: string; icon: string }[] = [
  { id: 'plants',      label: 'Home',    icon: '🏠' },
  { id: 'greenhouse',  label: 'Map',     icon: '🗺️' },
  { id: 'environment', label: 'Weather', icon: '☀️' },
  { id: 'trends',      label: 'Trends',  icon: '📈' },
  { id: 'runoff',      label: 'Runoff',  icon: '💧' },
];

// The landing tab — the hardware Back button steps here before leaving the site.
const HOME_TAB: Tab = 'plants';

const GREENHOUSE_TIME_ZONE = "America/Halifax";

function getHourInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value;
  return hour ? Number(hour) : date.getHours();
}

function getGreetingForTime(date: Date) {
  const hour = getHourInTimeZone(date, GREENHOUSE_TIME_ZONE);

  if (hour >= 5 && hour < 12) {
    return { title: "Good morning", emoji: "🌤️" };
  }

  if (hour >= 12 && hour < 17) {
    return { title: "Good afternoon", emoji: "☀️" };
  }

  if (hour >= 17 && hour < 21) {
    return { title: "Good evening", emoji: "🌇" };
  }

  return { title: "Good night", emoji: "🌙" };
}

function getFirstName(displayName?: string): string {
  return displayName?.trim().split(/\s+/)[0] || "there";
}

const TAB_GREETINGS: Record<Tab, { title: string; emoji: string; sub: (name: string) => string }> = {
  plants:      { title: 'Good morning!',   emoji: '🌤',  sub: (n) => `${n} Greenhouse` },
  greenhouse:  { title: 'Your garden',     emoji: '🗺️',  sub: (n) => `${n} layout` },
  environment: { title: "Today's weather", emoji: '☀️',  sub: (n) => `Inside ${n}` },
  runoff:      { title: 'Water tracker',   emoji: '💧',  sub: () => 'Where your water goes' },
};

export function App() {
  // ── Greenhouse context ──────────────────────────────────────────────────────
  const {
    greenhouse: selectedGreenhouse,
    setGreenhouse,
    clearGreenhouse,
  } = useGreenhouse();

  const {
    firebaseUser,
    profile,
    loading: authLoading,
    error: authError,
    logout,
    isAdmin,
  } = useAuth();

  // Keep the selected greenhouse for the login screen.
  // But only allow data loading after the logged-in profile matches it.
  const selectedMapKind = selectedGreenhouse?.mapKind ?? "sydney";
  const selectedGhId = selectedGreenhouse?.id ?? null;

  const accessGranted = Boolean(
    firebaseUser &&
    profile &&
    selectedGhId &&
    profile.greenhouseId === selectedGhId,
  );

  // Existing App code should use these gated values.
  // This prevents Firestore/API greenhouse-scoped effects from running before login.
  const greenhouse = accessGranted ? selectedGreenhouse : null;
  const mapKind = accessGranted ? selectedMapKind : "sydney";
  const ghId = accessGranted ? selectedGhId : null;

  // Ref always holds the current ghId — safe to read inside save effects
  // without adding ghId to their dependency arrays (avoids saving old data to new key).
  const ghIdRef = useRef<string | null>(ghId);
  ghIdRef.current = ghId;

  // ── Simulation context ──────────────────────────────────────────────────────
  const { isSimulating, simReading, simHistory, waterSimZone } =
    useSimulation();

  // ── Data sources (kept separate so priority logic stays explicit) ──────────
  const [firestoreReading, setFirestoreReading] =
    useState<LatestReading | null>(null);
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
    : latestReading === null && apiLoading;
  const error: string | null = isSimulating
    ? null
    : latestReading === null
      ? apiError
      : null;

  const [activeTab, setActiveTab] = useState<Tab>("plants");
  const [plantProfiles, setPlantProfiles] =
    useState<PlantProfile[]>(loadPlantProfiles);
  const [zoneAssignments, setZoneAssignments] = useState<ZoneAssignments>(() =>
    ghId ? loadZoneAssignmentsForGh(ghId) : {},
  );
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(
    loadStoredLayoutSettings,
  );
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(() =>
    ghId ? loadActivityForGh(ghId) : [],
  );
  const [firestoreActivity, setFirestoreActivity] = useState<ActivityEntry[]>(
    [],
  );
  const [profilesLoaded, setProfilesLoaded] = useState(!firebaseEnabled);
  const [profilesFallback, setProfilesFallback] = useState(!firebaseEnabled);
  const [firestoreProfileCount, setFirestoreProfileCount] = useState(0);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(!firebaseEnabled);
  const [assignmentsFallback, setAssignmentsFallback] =
    useState(!firebaseEnabled);
  const [activityLoaded, setActivityLoaded] = useState(!firebaseEnabled);
  const [activityFallback, setActivityFallback] = useState(!firebaseEnabled);
  const [siteSheetOpen, setSiteSheetOpen] = useState(false);
  const [trendsOpen, setTrendsOpen] = useState(false);
  // Alerts opens as a full standalone page (own header + back button, no bottom
  // nav). Kept separate from `activeTab` so closing it returns to the previous
  // screen (the tab that was showing when the bell was tapped).
  const [alertsOpen, setAlertsOpen] = useState(false);
  // `seen` drives the unread-only bell badge (local, per greenhouse).
  const [seenAlertIds, setSeenAlertIds] = useState<Set<string>>(new Set());
  // Notification history (active + auto-resolved) — Firestore, with a
  // localStorage fallback. Resolution is automatic; there is no manual resolve.
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  // The sheet stores only the canonical zone ID so it always derives the latest
  // zone object from live readings (never a stale snapshot). Canonical = the
  // backend zone_id, not the friendly display name.
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editorProfile, setEditorProfile] = useState<
    PlantProfile | null | "new"
  >(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [toast, setToast] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [adminUsersOpen, setAdminUsersOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [wateringScheduleOpen, setWateringScheduleOpen] = useState(false);
  const [activityHistoryOpen, setActivityHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migratedActivityRef = useRef<Set<string>>(new Set());

  // ── Hardware / browser Back button (app-wide) ───────────────────────────────
  // The Back button must never just close the site. We keep a single sentinel
  // history entry; each Back press unwinds ONE UI layer — open editor → zone
  // sheet → site sheet → alerts → trends (detail → list → close) → non-home tab
  // → home — then re-arms the sentinel. Only when there is nothing left to
  // unwind do we let the browser navigate away (toward the empty new-tab page).
  const trendsBackRef = useRef<(() => boolean) | null>(null);
  const backStateRef = useRef({
    editorProfile,
    selectedZoneId,
    siteSheetOpen,
    alertsOpen,
    changePasswordOpen,
    wateringScheduleOpen,
    activityHistoryOpen,
    adminUsersOpen,
    trendsOpen,
    activeTab,
  });
  backStateRef.current = {
    editorProfile,
    selectedZoneId,
    siteSheetOpen,
    alertsOpen,
    changePasswordOpen,
    wateringScheduleOpen,
    activityHistoryOpen,
    adminUsersOpen,
    trendsOpen,
    activeTab,
  };

  useEffect(() => {
    window.history.pushState({ gmBack: true }, "");
    const onPop = () => {
      const s = backStateRef.current;
      let handled = true;
      if (s.editorProfile !== null) setEditorProfile(null);
      else if (s.selectedZoneId !== null) setSelectedZoneId(null);
      else if (s.siteSheetOpen) setSiteSheetOpen(false);
      else if (s.alertsOpen) setAlertsOpen(false);
      else if (s.changePasswordOpen) setChangePasswordOpen(false);
      else if (s.wateringScheduleOpen) setWateringScheduleOpen(false);
      else if (s.activityHistoryOpen) setActivityHistoryOpen(false);
      else if (s.adminUsersOpen) setAdminUsersOpen(false);
      else if (s.trendsOpen) {
        if (!(trendsBackRef.current && trendsBackRef.current()))
          setTrendsOpen(false);
      } else if (s.activeTab !== HOME_TAB) setActiveTab(HOME_TAB);
      else handled = false;

      if (handled)
        window.history.pushState({ gmBack: true }, ""); // re-arm sentinel
      else window.history.back(); // nothing left → leave the site
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
          "[GreenMirror] API reading · zones:",
          reading.zones.length,
          "· ts:",
          reading.timestamp,
          firestoreReading
            ? "(Firestore active — API as heartbeat)"
            : "(API is primary source)",
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Fetch failed";
      setApiReading(null);
      setApiError(msg);
      console.warn(
        "[GreenMirror] API polling failed:",
        msg,
        firestoreReading
          ? "— Firestore data still active"
          : "— no data available",
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
    console.info(
      `[GreenMirror] Greenhouse switched to "${ghId}" — reloading scoped state`,
    );
    const localAssignments = loadZoneAssignmentsForGh(ghId);
    if (Object.keys(localAssignments).length > 0) {
      console.info(
        `[GreenMirror] localStorage fallback: ${Object.keys(localAssignments).length} assignments for "${ghId}"`,
        "(will be overwritten by Firestore subscription)",
      );
    }
    setZoneAssignments(localAssignments);
    setActivityLog(loadActivityForGh(ghId));
    setFirestoreActivity([]); // cleared until new subscription delivers
    setFirestoreReading(null); // clear previous site's reading
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
    const unsub = subscribeToZoneAssignments(
      currentGhId,
      (assignments, docExists) => {
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
            console.info(
              `[GreenMirror] localStorage -> Firestore assignment migration happened for "${currentGhId}"`,
            );
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
      },
      (err) => {
        console.warn(
          `[GreenMirror] localStorage fallback used for assignments in "${currentGhId}":`,
          err.message,
        );
        setZoneAssignments(loadZoneAssignmentsForGh(currentGhId));
        setAssignmentsLoaded(true);
        setAssignmentsFallback(true);
      },
    );
    if (!unsub) {
      console.info(
        `[GreenMirror] localStorage fallback used for assignments in "${currentGhId}" because Firestore is unavailable`,
      );
      setZoneAssignments(loadZoneAssignmentsForGh(currentGhId));
      setAssignmentsLoaded(true);
      setAssignmentsFallback(true);
    }
    return () => {
      unsub?.();
    };
  }, [ghId]);

  // ── Firestore plant profiles — global cross-device sync ──────────────────────
  useEffect(() => {
    const unsub = subscribeToCustomProfiles(
      (firestoreProfiles) => {
        setProfilesLoaded(true);
        setProfilesFallback(false);
        setFirestoreProfileCount(firestoreProfiles.length);
        console.info(
          `[GreenMirror] Firestore profile snapshot received: ${firestoreProfiles.length} profiles`,
        );
        if (firestoreProfiles.length === 0) {
          setPlantProfiles((current) => {
            const customLocal = current.filter((p) => !p.isDefault);
            if (customLocal.length > 0) {
              console.info(
                `[GreenMirror] Migrating ${customLocal.length} local custom profiles to Firestore`,
              );
              customLocal.forEach((p) => writeCustomProfile(p));
              console.info(
                "[GreenMirror] localStorage -> Firestore profile migration happened",
              );
            } else {
              console.info(
                "[GreenMirror] Firestore plantProfiles empty — no local custom profiles to migrate",
              );
            }
            return current; // keep current state until Firestore round-trip returns
          });
          return;
        }
        const firestoreById = new Map(firestoreProfiles.map((p) => [p.id, p]));
        setPlantProfiles(() => {
          const merged: PlantProfile[] = DEFAULT_PLANT_PROFILES.map((def) => {
            const override = firestoreById.get(def.id);
            return override
              ? { ...override, isDefault: true }
              : { ...def, isDefault: true };
          });
          firestoreProfiles
            .filter((p) => !DEFAULT_PLANT_PROFILES.some((d) => d.id === p.id))
            .forEach((p) =>
              merged.push({ ...p, isDefault: false, isCustom: true }),
            );
          console.info(
            `[GreenMirror] Applied ${firestoreProfiles.length} Firestore profiles — ${merged.length} total profiles`,
          );
          return merged;
        });
      },
      (err) => {
        console.warn(
          "[GreenMirror] localStorage fallback used for plant profiles:",
          err.message,
        );
        setProfilesLoaded(true);
        setProfilesFallback(true);
        setFirestoreProfileCount(0);
      },
    );
    if (!unsub) {
      console.info(
        "[GreenMirror] localStorage fallback used for plant profiles because Firestore is unavailable",
      );
      setProfilesLoaded(true);
      setProfilesFallback(true);
      setFirestoreProfileCount(0);
    }
    return () => {
      unsub?.();
    };
  }, []);

  // ── Firestore activity log listener ─────────────────────────────────────────
  useEffect(() => {
    if (!ghId) return;
    const currentGhId = ghId;
    setActivityLoaded(false);
    setActivityFallback(false);
    const unsub = subscribeToActivityLog(
      currentGhId,
      (entries) => {
        let migratedLocalActivity = false;
        if (
          entries.length === 0 &&
          !migratedActivityRef.current.has(currentGhId)
        ) {
          const local = loadActivityForGh(currentGhId);
          if (local.length > 0) {
            migratedLocalActivity = true;
            migratedActivityRef.current.add(currentGhId);
            console.info(
              `[GreenMirror] Migrating ${local.length} local activity entries to Firestore for "${currentGhId}"`,
            );
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
                actorUserId: entry.actorUserId ?? "system",
                actorName: entry.actorName ?? "System activity",
                actorUsername: entry.actorUsername,
              });
            });
            console.info(
              "[GreenMirror] localStorage -> Firestore activity migration happened",
            );
          }
        }
        setFirestoreActivity(entries);
        if (!migratedLocalActivity) saveActivityForGh(currentGhId, entries);
        setActivityLoaded(true);
        setActivityFallback(false);
      },
      200,
      (err) => {
        console.warn(
          `[GreenMirror] localStorage fallback used for activity in "${currentGhId}":`,
          err.message,
        );
        setFirestoreActivity([]);
        setActivityLog(loadActivityForGh(currentGhId));
        setActivityLoaded(true);
        setActivityFallback(true);
      },
    );
    if (!unsub) {
      console.info(
        `[GreenMirror] localStorage fallback used for activity in "${currentGhId}" because Firestore is unavailable`,
      );
      setFirestoreActivity([]);
      setActivityLog(loadActivityForGh(currentGhId));
      setActivityLoaded(true);
      setActivityFallback(true);
    }
    return () => {
      unsub?.();
    };
  }, [ghId]);

  // ── Firestore real-time listener — re-subscribes when greenhouse changes ────
  useEffect(() => {
    if (!ghId) return; // no greenhouse selected yet

    if (!firebaseEnabled) {
      console.info(
        "[GreenMirror] Firestore disabled — API polling is the only data source.",
        "\n  To enable Firestore: set VITE_FIREBASE_* env vars in mobile-app/.env.local",
      );
      return;
    }

    console.info(
      '[GreenMirror] Firestore listener starting for greenhouse "' + ghId + '"',
    );
    setFirestoreReading(null); // clear previous site's reading on switch

    const unsub = subscribeToLatestReading(
      ghId,
      (reading) => {
        console.info(
          "[GreenMirror] Firestore reading received · zones:",
          reading.zones?.length,
          "· ts:",
          reading.timestamp,
        );
        setFirestoreReading(reading);
      },
      (err) => {
        console.warn(
          "[GreenMirror] Firestore listener error:",
          err.message,
          "— falling back to API polling",
        );
      },
    );

    return () => {
      unsub?.();
    };
  }, [ghId]); // Re-subscribe whenever the active greenhouse changes

  // ── Data source logging (fires only when source changes) ───────────────────
  const prevSourceRef = useRef<string>("offline");
  useEffect(() => {
    const src = firestoreReading ? "firestore" : apiReading ? "api" : "offline";
    if (src !== prevSourceRef.current) {
      console.info(
        "[GreenMirror] Active data source:",
        prevSourceRef.current,
        "→",
        src,
      );
      prevSourceRef.current = src;
    }
  }, [firestoreReading, apiReading]);

  // ── Persist state ───────────────────────────────────────────────────────────
  useEffect(() => {
    savePlantProfiles(plantProfiles);
  }, [plantProfiles]);

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
    window.localStorage.setItem(
      LAYOUT_SETTINGS_KEY,
      JSON.stringify(layoutSettings),
    );
  }, [layoutSettings]);

  // Reset scroll on tab change (and when entering/leaving the alerts/trends pages)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
    setScrolled(false);
  }, [activeTab, alertsOpen, trendsOpen]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60_000);

    return () => window.clearInterval(id);
  }, []);

  const profilesById = useMemo(
    () => new Map(plantProfiles.map((p) => [p.id, p])),
    [plantProfiles],
  );

  const resolvedZones = useMemo((): VisualZone[] => {
    if (mapKind === "sydney") {
      return mapZonesToSydneyLayout(
        latestReading,
        zoneAssignments,
        profilesById,
      );
    }
    return mapZonesToLayout(
      latestReading,
      layoutSettings,
      zoneAssignments,
      profilesById,
    ).rows.flatMap((r) => r.zones);
  }, [mapKind, latestReading, layoutSettings, zoneAssignments, profilesById]);

  // Derive the open sheet's zone from the LIVE zone array (recomputed each time
  // readings update, ~5s) by matching the canonical ID — so it never shows a
  // stale snapshot. Beds are always present in the layout, so this resolves even
  // when a zone has no reading (the sheet then shows its existing no-data state).
  const zoneSheetZone = useMemo(
    () =>
      selectedZoneId
        ? (resolvedZones.find((z) => zoneCanonicalId(z) === selectedZoneId) ??
          null)
        : null,
    [selectedZoneId, resolvedZones],
  );
  const openZone = useCallback((zone: VisualZone) => {
    setSelectedZoneId(zoneCanonicalId(zone));
  }, []);

  // Live (active) alerts — same source AlertsView uses. The bell badge counts
  // only UNREAD alerts: currently active and not yet marked seen.
  const allAlerts = useMemo(
    () => evaluateAllAlerts(resolvedZones, profilesById),
    [resolvedZones, profilesById]
  );
  const unreadAlertCount = useMemo(
    () => allAlerts.filter((a) => !seenAlertIds.has(a.id)).length,
    [allAlerts, seenAlertIds]
  );
  // Load/persist the seen set per greenhouse (bell badge only).
  useEffect(() => {
    if (!ghId) { setSeenAlertIds(new Set()); return; }
    setSeenAlertIds(loadIdSet(ALERTS_SEEN_KEY(ghId)));
  }, [ghId]);
  useEffect(() => {
    const id = ghIdRef.current;
    if (id) saveIdSet(ALERTS_SEEN_KEY(id), seenAlertIds);
  }, [seenAlertIds]);

  // Viewing the Notifications page marks every currently-active alert as seen,
  // so the bell badge resets and only reappears when a NEW alert arrives.
  useEffect(() => {
    if (!alertsOpen) return;
    setSeenAlertIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      allAlerts.forEach((a) => { if (!next.has(a.id)) { next.add(a.id); changed = true; } });
      return changed ? next : prev;
    });
  }, [alertsOpen, allAlerts]);

  // Notification history — subscribe to Firestore (real-time), else load the
  // localStorage fallback. Re-subscribes when the greenhouse changes.
  useEffect(() => {
    if (!ghId) { setNotifications([]); return; }
    if (firebaseEnabled) {
      const unsub = subscribeToNotifications(
        ghId,
        setNotifications,
        () => setNotifications(loadLocalNotifications(ghId)),
      );
      if (unsub) return () => unsub();
    }
    setNotifications(loadLocalNotifications(ghId));
  }, [ghId]);

  // Auto-resolve: reconcile live alerts against stored notifications. A live
  // alert that is new (or was resolved) becomes 'active'; a stored 'active'
  // notification whose alert is no longer live is marked 'resolved'. Gated on
  // real data so a transient empty reading never falsely resolves everything.
  useEffect(() => {
    if (!ghId || loading || !latestReading) return;

    const liveIds = new Set(allAlerts.map((a) => a.id));
    const byAlertId = new Map(notifications.map((n) => [n.alertId, n]));
    const toActivate = allAlerts.filter((a) => {
      const existing = byAlertId.get(a.id);
      return !existing || existing.status !== 'active';
    });
    const toResolve = notifications.filter(
      (n) => n.status === 'active' && !liveIds.has(n.alertId),
    );
    if (toActivate.length === 0 && toResolve.length === 0) return;

    if (firebaseEnabled) {
      toActivate.forEach((a) =>
        upsertActiveNotification(ghId, alertToNotificationInput(a), !byAlertId.has(a.id)));
      toResolve.forEach((n) => resolveNotification(ghId, n.alertId));
      // The Firestore subscription reflects these writes back into state.
    } else {
      setNotifications((prev) => {
        const map = new Map(prev.map((n) => [n.alertId, n]));
        const now = new Date().toISOString();
        toActivate.forEach((a) => {
          const e = map.get(a.id);
          const input = alertToNotificationInput(a);
          map.set(a.id, {
            id: `${ghId}__${a.id}`,
            greenhouseId: ghId,
            ...input,
            status: 'active',
            createdAt: e?.createdAt ?? now,
            updatedAt: now,
            resolvedAt: undefined,
          });
        });
        toResolve.forEach((n) => {
          const e = map.get(n.alertId);
          if (e) map.set(n.alertId, { ...e, status: 'resolved', resolvedAt: now, updatedAt: now });
        });
        const next = [...map.values()];
        saveLocalNotifications(ghId, next);
        return next;
      });
    }
  }, [allAlerts, notifications, ghId, loading, latestReading]);

  const localStorageFallbackActive = profilesFallback || assignmentsFallback || activityFallback;
  const syncStatusLabel = localStorageFallbackActive
    ? "Offline fallback"
    : profilesLoaded && assignmentsLoaded && activityLoaded
      ? "Connected"
      : "Syncing";

  useEffect(() => {
    if (!ghId) return;
    console.info("[GreenMirror] diagnostics", {
      greenhouseId: ghId,
      firestoreProfiles: firestoreProfileCount,
      assignmentKeys: Object.keys(zoneAssignments).length,
      activityLogs:
        activityLoaded && !activityFallback
          ? firestoreActivity.length
          : activityLog.length,
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

  const activityActor = useMemo(
    () => ({
      actorUserId: firebaseUser?.uid,
      actorName: profile?.displayName ?? profile?.username ?? firebaseUser?.displayName ?? undefined,
      actorUsername: profile?.username ?? undefined,
    }),
    [firebaseUser?.displayName, firebaseUser?.uid, profile?.displayName, profile?.username],
  );

  // Plant profile CRUD
  const onAddProfile = useCallback((prefill?: string) => {
    if (prefill) {
      setEditorProfile({
        id: "",
        name: prefill,
        icon: "🌱",
        moistureMin: 50,
        moistureMax: 70,
        soilTempMin: 15,
        soilTempMax: 25,
      });
    } else {
      setEditorProfile("new");
    }
  }, []);

  const onEditProfile = useCallback((p: PlantProfile) => {
    setEditorProfile(p);
  }, []);

  const onSaveProfile = useCallback(
    async (p: PlantProfile) => {
      setEditorProfile(null);
      if (firebaseEnabled) {
        console.info(
          `[GreenMirror] Writing profile to Firestore: plantProfiles/${p.id} (${p.name})`,
        );
        const ok = await writeCustomProfile(p);
        if (!ok) {
          showToast(
            "⚠ Could not save — Firestore write failed. Check plantProfiles rules.",
          );
          return;
        }
        // Subscription fires on all devices and drives setPlantProfiles — no local optimistic update needed.
      } else {
        setPlantProfiles((list) => {
          const idx = list.findIndex((x) => x.id === p.id);
          if (idx === -1) return [...list, p];
          const next = [...list];
          next[idx] = p;
          return next;
        });
      }
      if (ghId) {
        writeActivityEvent({
          type: "profile-update",
          greenhouseId: ghId,
          plantName: p.name,
          message: `Saved plant profile ${p.name}`,
          source: "manual",
          ...activityActor,
        });
      }
      showToast(p.name ? `Saved ${p.name}` : "Profile saved");
    },
    [activityActor, ghId, showToast],
  );

  const onDeleteProfile = useCallback(
    async (id: string) => {
      const p = plantProfiles.find((x) => x.id === id);
      const assignedZoneKeys = Object.entries(zoneAssignments)
        .filter(([, plantId]) => plantId === id)
        .map(([zoneKey]) => zoneKey);
      setEditorProfile(null);
      if (firebaseEnabled) {
        console.info(
          `[GreenMirror] Deleting profile from Firestore: plantProfiles/${id}`,
        );
        const ok = await deleteCustomProfile(id);
        if (!ok) {
          showToast(
            "⚠ Could not delete — Firestore write failed. Check plantProfiles rules.",
          );
          return;
        }
        // Subscription fires and removes the profile from state on all devices.
      } else {
        setPlantProfiles((list) => list.filter((x) => x.id !== id));
        setZoneAssignments((a) => {
          const next = { ...a };
          Object.keys(next).forEach((k) => {
            if (next[k] === id) delete next[k];
          });
          return next;
        });
      }
      if (ghId) {
        assignedZoneKeys.forEach((zoneKey) =>
          clearZoneAssignment(ghId, zoneKey),
        );
        writeActivityEvent({
          type: "profile-update",
          greenhouseId: ghId,
          plantName: p?.name,
          message: `Deleted plant profile ${p?.name ?? id}`,
          source: "manual",
          ...activityActor,
        });
      }
      showToast(`Deleted ${p?.name ?? "profile"}`);
    },
    [activityActor, ghId, plantProfiles, showToast, zoneAssignments],
  );

  const onResetProfile = useCallback(
    async (id: string) => {
      const def = DEFAULT_PLANT_PROFILES.find((p) => p.id === id);
      if (!def) return;
      setEditorProfile(null);
      if (firebaseEnabled) {
        console.info(
          `[GreenMirror] Resetting profile in Firestore: deleting plantProfiles/${id} override`,
        );
        const ok = await deleteCustomProfile(id);
        if (!ok) {
          showToast(
            "⚠ Could not reset — Firestore write failed. Check plantProfiles rules.",
          );
          return;
        }
        // Subscription fires; merge logic will restore the default since Firestore no longer has an override.
      } else {
        setPlantProfiles((list) =>
          list.map((p) => (p.id === id ? { ...def } : p)),
        );
      }
      if (ghId) {
        writeActivityEvent({
          type: "profile-update",
          greenhouseId: ghId,
          plantName: def.name,
          message: `Reset ${def.name} profile to defaults`,
          source: "manual",
          ...activityActor,
        });
      }
      showToast(`Reset ${def.name} to defaults`);
    },
    [activityActor, ghId, showToast],
  );

  const onWaterZone = useCallback(
    (zone: VisualZone, amountMl: number) => {
      const plantName = zone.assignedPlant
        ? profilesById.get(zone.assignedPlant)?.name
        : undefined;
      const zoneName = zone.displayLabel ?? zone.visualLabel;
      if (isSimulating) {
        // In simulation mode: update physics immediately, skip Firestore
        waterSimZone(zone.backendZoneId ?? zone.visualLabel);
        if (ghId) {
          logActivityForGh(ghId, {
            type: "watering",
            visualZoneId: zone.visualLabel,
            plantName,
            amountMl,
            message: `[Sim] Watered ${zoneName}${plantName ? ` (${plantName})` : ""} · ${amountMl}ml`,
            source: "manual",
            ...activityActor,
          });
          setActivityLog(loadActivityForGh(ghId));
        }
      } else {
        if (ghId) {
          logActivityForGh(ghId, {
            type: "watering",
            visualZoneId: zone.visualLabel,
            backendZoneId: zone.backendZoneId,
            nodeId: zone.nodeId,
            plantName,
            amountMl,
            message: `Watered ${zoneName}${plantName ? ` (${plantName})` : ""} · ${amountMl}ml`,
            source: "manual",
            ...activityActor,
          });
          setActivityLog(loadActivityForGh(ghId));
          writeWateringEvent({
            greenhouseId: ghId,
            visualZoneId: zone.visualLabel,
            amountMl,
            plantName,
            nodeId: zone.nodeId ?? undefined,
            source: "manual",
            ...activityActor,
          });
        }
      }
      showToast(`💧 Watered ${zoneName} (${amountMl}ml)`);
    },
    [activityActor, ghId, isSimulating, waterSimZone, profilesById, showToast],
  );

  const onAssignPlant = useCallback(
    (zoneKey: string, plantId: string | null) => {
      setZoneAssignments((a) => {
        const next = { ...a };
        if (plantId) {
          next[zoneKey] = plantId;
        } else {
          delete next[zoneKey];
        }
        return next;
      });
      // The open sheet's zone is derived from resolvedZones, which depends on
      // zoneAssignments — so the assignment change is reflected automatically.
      const plantName = plantId ? profilesById.get(plantId)?.name : undefined;
      if (ghId) {
        // Firestore write for cross-device sync
        if (plantId) {
          writeZoneAssignment(ghId, zoneKey, plantId);
          logActivityForGh(ghId, {
            type: "assignment",
            visualZoneId: zoneKey,
            plantName,
            message: `Assigned ${plantName ?? plantId} to ${zoneKey}`,
            source: "manual",
            ...activityActor,
          });
          writeActivityEvent({
            type: "assignment",
            greenhouseId: ghId,
            visualZoneId: zoneKey,
            plantName,
            message: `Assigned ${plantName ?? plantId} to ${zoneKey}`,
            source: "manual",
            ...activityActor,
          });
        } else {
          clearZoneAssignment(ghId, zoneKey);
          logActivityForGh(ghId, {
            type: "cleared",
            visualZoneId: zoneKey,
            message: `Cleared plant from ${zoneKey}`,
            source: "manual",
            ...activityActor,
          });
          writeActivityEvent({
            type: "cleared",
            greenhouseId: ghId,
            visualZoneId: zoneKey,
            message: `Cleared plant from ${zoneKey}`,
            source: "manual",
            ...activityActor,
          });
        }
        setActivityLog(loadActivityForGh(ghId));
      }
    },
    [activityActor, ghId, profilesById],
  );

  // ── ALL HOOKS ABOVE THIS LINE ───────────────────────────────────────────────
  // Gate: show onboarding if no greenhouse selected yet.
  // ── ALL HOOKS ABOVE THIS LINE ───────────────────────────────────────────────
  // First-time browser/device gate: user must choose a greenhouse first.
  if (!selectedGreenhouse) {
    return <GreenhouseSelector onSelect={setGreenhouse} />;
  }

  // Once a greenhouse is selected, show a greenhouse-specific login screen.
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white flex items-center justify-center p-4">
        <div className="text-sm font-bold text-emerald-700">
          Loading GreenMirror…
        </div>
      </div>
    );
  }

  if (!firebaseUser || !profile) {
    return (
      <LoginView greenhouse={selectedGreenhouse} onBack={clearGreenhouse} />
    );
  }

  // Logged in, but selected greenhouse does not match user's assigned greenhouse.
  if (profile.greenhouseId !== selectedGreenhouse.id) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 via-white to-white p-4 flex items-center justify-center">
        <div className="w-full max-w-md bg-white border border-red-100 rounded-sm shadow-xl p-6">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Wrong greenhouse selected
          </h1>
          <p className="text-sm text-slate-600 mb-4">
            You selected <strong>{selectedGreenhouse.name} Greenhouse</strong>,
            but this account is assigned to{" "}
            <strong>{profile.greenhouseId}</strong>.
          </p>

          {authError && (
            <div className="mb-4 rounded-sm border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">
              {authError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={clearGreenhouse}
              className="flex-1 rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Choose again
            </button>

            <button
              type="button"
              onClick={logout}
              className="flex-1 rounded-sm bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Profile matched selected greenhouse, but gated greenhouse value has not settled yet.
  if (!greenhouse) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white flex items-center justify-center p-4">
        <div className="text-sm font-bold text-emerald-700">
          Opening your greenhouse…
        </div>
      </div>
    );
  }

  const ghName = greenhouse.name;
  const g = TAB_GREETINGS[activeTab];

  const homeGreeting = getGreetingForTime(currentTime);
  const displayName = profile.displayName || profile.username;
  const firstName = getFirstName(displayName);

  const headerTitle =
    activeTab === "plants" ? `${homeGreeting.title}, ${firstName}!` : g.title;

  const headerEmoji = activeTab === "plants" ? homeGreeting.emoji : g.emoji;

  const headerSubtitle =
    activeTab === "plants" ? `${ghName} Greenhouse` : g.sub(ghName);

  if (activityHistoryOpen) {
    const activityHistoryEntries = activityLoaded && !activityFallback ? firestoreActivity : activityLog;

    return (
      <ActivityHistoryView
        onBack={() => setActivityHistoryOpen(false)}
        greenhouseName={ghName}
        activities={activityHistoryEntries}
        loading={!activityLoaded}
      />
    );
  }

  if (wateringScheduleOpen) {
    return (
      <WateringScheduleView
        onBack={() => setWateringScheduleOpen(false)}
        greenhouseId={ghId ?? ""}
        greenhouseName={ghName}
        isAdmin={isAdmin}
        currentUserId={firebaseUser.uid}
        currentUserName={displayName}
        currentUsername={profile.username}
        latestReading={latestReading}
        zones={resolvedZones}
        onToast={showToast}
      />
    );
  }

  if (adminUsersOpen) {
    return (
      <AdminUsersView
        onBack={() => setAdminUsersOpen(false)}
        greenhouseId={ghId ?? ""}
        greenhouseName={ghName}
      />
    );
  }

  // Database connection status drives the profile-icon color: connected =>
  // green button + wave animation (default); disconnected => red, no wave.
  const dbConnected = !localStorageFallbackActive;

  const avatarButton = (
    <button
      className={`gm-avatar${dbConnected ? '' : ' offline'}`}
      onClick={() => setSiteSheetOpen(true)}
      aria-label="Switch greenhouse"
      title={dbConnected ? 'Database connected' : 'Database disconnected'}
    >
      👩‍🌾
    </button>
  );

  const bellButton = (
    <button
      className="gm-bell"
      // Close Trends first — the render checks `trendsOpen` before `alertsOpen`,
      // so without this the bell appeared to do nothing while on the Trends page.
      onClick={() => { setTrendsOpen(false); setAlertsOpen(true); }}
      aria-label={unreadAlertCount > 0 ? `Notifications — ${unreadAlertCount} new` : 'Notifications'}
    >
      🔔
      {unreadAlertCount > 0 && (
        <span className="gm-bell-badge">
          {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
        </span>
      )}
    </button>
  );

  const bottomNav = (
    <nav className="gm-tabbar" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => {
        // Trends opens the Trends & Analysis page; every other item swaps the
        // tab body (and closes Trends if it was open).
        const active = item.id === 'trends' ? trendsOpen : (!trendsOpen && activeTab === item.id);
        return (
          <button
            key={item.id}
            className={`gm-tab${active ? ' active' : ''}`}
            onClick={() => {
              if (item.id === 'trends') setTrendsOpen(true);
              else { setTrendsOpen(false); setActiveTab(item.id as Tab); }
            }}
          >
            <span className="gm-tab-glyph" style={{ fontSize: 20 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="gm-app">
      {trendsOpen ? (
        /* ── TRENDS & ANALYSIS — standard app bar + scroll body + bottom nav,
              matching every other main page. ──────────────────────────────── */
        <>
          <header className={`gm-header${scrolled ? ' scrolled' : ''}`}>
            <div className="gm-brand">
              <h1>
                Trends &amp; Analysis <span style={{ fontSize: 20, lineHeight: 1 }}>📈</span>
              </h1>
              <small>{ghName}</small>
            </div>
            <div className="gm-header-actions">
              {bellButton}
              {avatarButton}
            </div>
          </header>
          <div
            className="gm-scroll"
            ref={scrollRef}
            onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 8)}
          >
            <TrendsDashboard
              open={trendsOpen}
              greenhouseId={ghId ?? ''}
              greenhouseName={greenhouse?.name}
              zones={resolvedZones}
              profilesById={profilesById}
              plantProfiles={plantProfiles}
              simHistory={isSimulating ? simHistory : undefined}
              activityLog={activityLog}
              firestoreActivity={firestoreActivity}
              onClose={() => setTrendsOpen(false)}
              scrollRef={scrollRef}
              backRef={trendsBackRef}
            />
          </div>
          {bottomNav}
        </>
      ) : alertsOpen ? (
        /* ── ALERTS / NOTIFICATIONS — full standalone page: back button in the
              top-left, no bottom nav. ──────────────────────────────────────── */
        <>
          <header className={`gm-header${scrolled ? ' scrolled' : ''}`}>
            <button
              onClick={() => setAlertsOpen(false)}
              aria-label="Back"
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: 'var(--primary-soft)', border: '1.5px solid var(--primary)',
                color: 'var(--primary)', fontSize: 20, fontWeight: 800,
                display: 'grid', placeItems: 'center', cursor: 'pointer',
              }}
            >
              ←
            </button>
            <div className="gm-brand">
              <h1>
                Notifications <span style={{ fontSize: 20, lineHeight: 1 }}>🔔</span>
              </h1>
              <small>Things to check</small>
            </div>
            <div className="gm-header-actions">{avatarButton}</div>
          </header>
          <div
            className="gm-scroll"
            ref={scrollRef}
            onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 8)}
          >
            <AlertsView
              zones={resolvedZones}
              loading={loading}
              error={error}
              profilesById={profilesById}
              onOpenZone={openZone}
              notifications={notifications}
            />
          </div>
        </>
      ) : (
        /* ── NORMAL TABS (Home · Map · Weather · Runoff) ─────────────────────── */
        <>
          {/* HEADER */}
          <header className={`gm-header${scrolled ? ' scrolled' : ''}`}>
            <div className="gm-brand">
              <h1>
                {headerTitle} <span style={{ fontSize: 20, lineHeight: 1 }}>{headerEmoji}</span>
              </h1>
              <small>{headerSubtitle}</small>
            </div>
            <div className="gm-header-actions">
              {bellButton}
              {avatarButton}
            </div>
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
                onOpenZone={openZone}
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
                firestoreProfileCount={firestoreProfileCount}
                onOpenTrends={() => setTrendsOpen(true)}
                onOpenActivityHistory={() => setActivityHistoryOpen(true)}
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
                onOpenZone={openZone}
                onToast={showToast}
                layoutSettings={layoutSettings}
                setLayoutSettings={setLayoutSettings}
              />
            )}
            {activeTab === 'environment' && (
              <EnvironmentView
                site={mapKind}
                greenhouse={greenhouse}
                latestReading={latestReading}
              />
            )}
            {activeTab === 'runoff' && <SimpleRunoff />}
          </div>

          {bottomNav}
        </>
      )}

      {/* TOAST */}
      <div className={`gm-toast${toast ? " show" : ""}`} aria-live="polite">
        <span style={{ fontSize: 16 }}>✓</span>
        <span>{toast}</span>
      </div>

      {/* SHEETS */}
      <SiteSwitcherSheet
        open={siteSheetOpen}
        onClose={() => setSiteSheetOpen(false)}
        currentUserName={displayName}
        currentUserRole={profile.role}
        isAdmin={isAdmin}
        onLogout={logout}
        onOpenWateringSchedule={() => {
          setSiteSheetOpen(false);
          setWateringScheduleOpen(true);
        }}
        onOpenChangePassword={() => {
          setSiteSheetOpen(false);
          setChangePasswordOpen(true);
        }}
        onOpenAdminUsers={() => {
          setSiteSheetOpen(false);
          setAdminUsersOpen(true);
        }}
      />

      <ChangePasswordSheet
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      <ZoneDetailSheet
        zone={zoneSheetZone}
        plantProfiles={plantProfiles}
        profilesById={profilesById}
        onAssignPlant={onAssignPlant}
        onClose={() => setSelectedZoneId(null)}
        onToast={showToast}
        onWaterZone={onWaterZone}
      />

      <PlantEditorSheet
        open={editorProfile !== null}
        profile={editorProfile === "new" ? null : editorProfile}
        isDefault={
          editorProfile !== null &&
          editorProfile !== "new" &&
          isDefaultPlantProfile((editorProfile as PlantProfile).id)
        }
        onClose={() => setEditorProfile(null)}
        onSave={onSaveProfile}
        onDelete={onDeleteProfile}
        onReset={onResetProfile}
      />
    </div>
  );
}
