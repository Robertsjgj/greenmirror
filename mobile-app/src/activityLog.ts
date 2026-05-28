export type ActivityType =
  | 'watering'
  | 'assignment'
  | 'cleared'
  | 'profile-update'
  | 'sensor-failure'
  | 'sensor-recovered'
  | 'stale-node'
  | 'moisture-alert'
  | 'greenhouse-switch';

export type ActivitySource = 'manual' | 'system' | 'sensor';

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
}

const STORAGE_KEY = 'greenmirror-activity-log';
const MAX_ENTRIES = 100;

// ─── Greenhouse-scoped storage helpers ────────────────────────────────────────

function scopedActivityKey(ghId: string): string {
  return `greenmirror-activity-log-${ghId}`;
}

/**
 * Load activity entries for a specific greenhouse.
 * Migrates global data on first access so returning users keep history.
 */
export function loadActivityForGh(ghId: string): ActivityEntry[] {
  try {
    const scopedRaw = window.localStorage.getItem(scopedActivityKey(ghId));
    if (scopedRaw !== null) {
      const parsed = JSON.parse(scopedRaw);
      return Array.isArray(parsed) ? parsed : [];
    }
    // One-time migration from global key → scoped key
    const globalRaw = window.localStorage.getItem(STORAGE_KEY);
    if (globalRaw) {
      const parsed = JSON.parse(globalRaw);
      const data: ActivityEntry[] = Array.isArray(parsed) ? parsed : [];
      try { window.localStorage.setItem(scopedActivityKey(ghId), JSON.stringify(data.slice(0, MAX_ENTRIES))); } catch { /* storage full */ }
      return data;
    }
  } catch { /* storage unavailable */ }
  return [];
}

export function saveActivityForGh(ghId: string, entries: ActivityEntry[]): void {
  try {
    window.localStorage.setItem(scopedActivityKey(ghId), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch { /* storage full */ }
}

/** Log an entry scoped to a specific greenhouse. */
export function logActivityForGh(
  ghId: string,
  entry: Omit<ActivityEntry, 'id' | 'timestamp'>,
): ActivityEntry {
  const newEntry: ActivityEntry = {
    ...entry,
    greenhouseId: ghId,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  const existing = loadActivityForGh(ghId);
  saveActivityForGh(ghId, [newEntry, ...existing]);
  return newEntry;
}

export function loadActivity(): ActivityEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveActivity(entries: ActivityEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch { /* storage full or unavailable */ }
}

export function logActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry {
  const newEntry: ActivityEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  const existing = loadActivity();
  saveActivity([newEntry, ...existing]);
  return newEntry;
}

export function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Filter entries down to the ones useful in a "Recent Activity" feed. */
export function filterUsefulActivity(entries: ActivityEntry[]): ActivityEntry[] {
  const useful: ActivityType[] = [
    'watering',
    'sensor-failure',
    'sensor-recovered',
    'stale-node',
    'moisture-alert',
    'assignment',
  ];
  return entries.filter((e) => useful.includes(e.type));
}
