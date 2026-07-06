export type ActivityType =
  | "watering"
  | "assignment"
  | "cleared"
  | "profile-update"
  | "sensor-failure"
  | "sensor-recovered"
  | "stale-node"
  | "moisture-alert"
  | "greenhouse-switch";

export type ActivitySource = "manual" | "system" | "sensor";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  greenhouseId?: string;
  visualZoneId?: string;
  backendZoneId?: string;
  nodeId?: string;
  plantName?: string;
  amountMl?: number;
  message: string;
  timestamp: string;
  source?: ActivitySource;
  actorUserId?: string;
  actorName?: string;
  actorUsername?: string;
  metadata?: Record<string, string | number | boolean>;
}

const STORAGE_KEY = "greenmirror-activity-log";
const MAX_ENTRIES = 100;

// ─── Greenhouse-scoped storage helpers ────────────────────────────────────────

function scopedActivityKey(ghId: string): string {
  return `greenmirror-activity-log-${ghId}`;
}

function normalizeActivityEntry(entry: ActivityEntry): ActivityEntry {
  return {
    ...entry,
    actorName: entry.actorName ?? "System activity",
  };
}

function normalizeActivityList(value: unknown): ActivityEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is ActivityEntry =>
      Boolean(entry && typeof entry === "object"),
    )
    .map(normalizeActivityEntry);
}

/**
 * Load activity entries for a specific greenhouse.
 * Migrates global data on first access so returning users keep history.
 */
export function loadActivityForGh(ghId: string): ActivityEntry[] {
  try {
    const scopedRaw = window.localStorage.getItem(scopedActivityKey(ghId));
    if (scopedRaw !== null) {
      return normalizeActivityList(JSON.parse(scopedRaw));
    }
    // One-time migration from global key → scoped key
    const globalRaw = window.localStorage.getItem(STORAGE_KEY);
    if (globalRaw) {
      const data = normalizeActivityList(JSON.parse(globalRaw));
      try {
        window.localStorage.setItem(
          scopedActivityKey(ghId),
          JSON.stringify(data.slice(0, MAX_ENTRIES)),
        );
      } catch {
        /* storage full */
      }
      return data;
    }
  } catch {
    /* storage unavailable */
  }
  return [];
}

export function saveActivityForGh(
  ghId: string,
  entries: ActivityEntry[],
): void {
  try {
    const normalized = entries.map(normalizeActivityEntry);
    window.localStorage.setItem(
      scopedActivityKey(ghId),
      JSON.stringify(normalized.slice(0, MAX_ENTRIES)),
    );
  } catch {
    /* storage full */
  }
}

/** Log an entry scoped to a specific greenhouse. */
export function logActivityForGh(
  ghId: string,
  entry: Omit<ActivityEntry, "id" | "timestamp">,
): ActivityEntry {
  const newEntry: ActivityEntry = normalizeActivityEntry({
    ...entry,
    greenhouseId: ghId,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  });
  const existing = loadActivityForGh(ghId);
  saveActivityForGh(ghId, [newEntry, ...existing]);
  return newEntry;
}

export function loadActivity(): ActivityEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeActivityList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveActivity(entries: ActivityEntry[]): void {
  try {
    const normalized = entries.map(normalizeActivityEntry);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalized.slice(0, MAX_ENTRIES)),
    );
  } catch {
    /* storage full or unavailable */
  }
}

export function logActivity(
  entry: Omit<ActivityEntry, "id" | "timestamp">,
): ActivityEntry {
  const newEntry: ActivityEntry = normalizeActivityEntry({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  });
  const existing = loadActivity();
  saveActivity([newEntry, ...existing]);
  return newEntry;
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeText(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Compact timestamp for activity feeds.
 * Examples: Today, 2:35 PM · Yesterday, 9:10 AM · Jul 3, 2026, 4:22 PM
 */
export function formatActivityDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDate(date, now)) return `Today, ${timeText(date)}`;
  if (sameDate(date, yesterday)) return `Yesterday, ${timeText(date)}`;

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Kept for existing imports; now always includes a useful date/time label. */
export function formatActivityTime(timestamp: string): string {
  return formatActivityDateTime(timestamp);
}

export function getActivityActorName(entry: ActivityEntry): string {
  const displayName = entry.actorName?.trim();

  if (displayName) {
    return displayName;
  }

  const username = entry.actorUsername?.trim();

  if (username) {
    return username;
  }

  return "System activity";
}

export function getActivityTypeLabel(type: ActivityType): string {
  switch (type) {
    case "watering":
      return "Watering";
    case "assignment":
      return "Plant assignment";
    case "cleared":
      return "Cleared plant";
    case "profile-update":
      return "Plant profile";
    case "sensor-failure":
      return "Sensor issue";
    case "sensor-recovered":
      return "Sensor recovered";
    case "stale-node":
      return "Stale sensor";
    case "moisture-alert":
      return "Moisture alert";
    case "greenhouse-switch":
      return "Greenhouse switch";
    default:
      return "Activity";
  }
}

export const ACTIVITY_TYPE_ORDER: ActivityType[] = [
  "watering",
  "assignment",
  "cleared",
  "profile-update",
  "sensor-failure",
  "sensor-recovered",
  "stale-node",
  "moisture-alert",
  "greenhouse-switch",
];

/** Filter entries down to the ones useful in a "Recent Activity" feed. */
export function filterUsefulActivity(
  entries: ActivityEntry[],
): ActivityEntry[] {
  const useful: ActivityType[] = [
    "watering",
    "sensor-failure",
    "sensor-recovered",
    "stale-node",
    "moisture-alert",
    "assignment",
    "cleared",
    "profile-update",
  ];
  return entries.filter((e) => useful.includes(e.type));
}
