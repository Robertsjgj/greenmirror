export type ActivityType = 'watering' | 'assignment' | 'cleared' | 'profile-update';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  visualZoneId?: string;
  backendZoneId?: string;
  nodeId?: string;
  plantName?: string;
  amountMl?: number;
  message: string;
  timestamp: string;
}

const STORAGE_KEY = 'greenmirror-activity-log';
const MAX_ENTRIES = 50;

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
