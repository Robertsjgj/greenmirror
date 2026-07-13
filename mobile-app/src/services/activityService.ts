/**
 * Firestore-backed activity log service.
 *
 * Reads and writes greenhouse-scoped activity events to the
 * `activityLogs` Firestore collection.
 *
 * All functions are no-ops when Firebase is not configured — the app
 * falls back to the localStorage activity log in activityLog.ts.
 *
 * Required Firestore composite index if Firestore prompts you:
 *   Collection: activityLogs
 *   Fields: greenhouseId ASC, timestamp DESC
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from './firebase';
import type { ActivityEntry, ActivityType, ActivitySource } from '../activityLog';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActivityActorInput {
  actorUserId?: string;
  actorName?: string;
  actorUsername?: string;
}

export interface ActivityEventInput extends ActivityActorInput {
  type: ActivityType;
  greenhouseId: string;
  visualZoneId?: string;
  backendZoneId?: string;
  nodeId?: string;
  plantName?: string;
  amountMl?: number;
  message: string;
  source?: ActivitySource;
  metadata?: Record<string, string | number | boolean>;
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);

    if (proto !== Object.prototype && proto !== null) {
      return value;
    }

    const cleaned: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      if (nested === undefined) return;
      cleaned[key] = removeUndefinedDeep(nested);
    });

    return cleaned as T;
  }

  return value;
}

function activityFromData(id: string, data: Record<string, unknown>): ActivityEntry {
  const timestampValue = data.timestamp as { toDate?: () => Date } | string | undefined;
  const timestamp =
    typeof timestampValue === 'string'
      ? timestampValue
      : timestampValue?.toDate?.()?.toISOString?.() ?? new Date().toISOString();

  return {
    id,
    type: (data.type ?? 'watering') as ActivityType,
    greenhouseId: data.greenhouseId as string | undefined,
    visualZoneId: data.visualZoneId as string | undefined,
    backendZoneId: data.backendZoneId as string | undefined,
    nodeId: data.nodeId as string | undefined,
    plantName: data.plantName as string | undefined,
    amountMl: data.amountMl as number | undefined,
    message: (data.message ?? '') as string,
    timestamp,
    source: data.source as ActivitySource | undefined,
    actorUserId: data.actorUserId as string | undefined,
    actorName: (data.actorName as string | undefined) ?? 'System activity',
    actorUsername: data.actorUsername as string | undefined,
    metadata: data.metadata as Record<string, string | number | boolean> | undefined,
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the greenhouse-scoped activity log in real time.
 * Returns the most recent `limitCount` events, newest first.
 *
 * Returns null (and silently no-ops) when Firebase is not configured.
 */
export function subscribeToActivityLog(
  greenhouseId: string,
  onData: (entries: ActivityEntry[]) => void,
  limitCount = 30,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) return null;

  const q = query(
    collection(db, 'activityLogs'),
    where('greenhouseId', '==', greenhouseId),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  );

  return onSnapshot(
    q,
    (snap) => {
      const entries: ActivityEntry[] = snap.docs.map((d) =>
        activityFromData(d.id, d.data() as Record<string, unknown>),
      );
      console.info(`[GreenMirror] Firestore activity snapshot received: ${entries.length} entries for "${greenhouseId}"`);
      onData(entries);
    },
    (err) => {
      console.warn(
        '[activityService] Firestore listen error:', err.message,
        '\n  If this is an index error, create the composite index in the Firebase console:',
        '\n  Collection: activityLogs | Fields: greenhouseId ASC, timestamp DESC',
      );
      onError?.(err instanceof Error ? err : new Error(String(err)));
    },
  );
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Write a greenhouse-scoped activity event to Firestore.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function writeActivityEvent(event: ActivityEventInput): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await addDoc(collection(db, 'activityLogs'), removeUndefinedDeep({
      ...event,
      actorName: event.actorName ?? 'System activity',
      timestamp: serverTimestamp(),
    }));
    console.info(`[GreenMirror] Firestore write success: activity ${event.type} for ${event.greenhouseId}`);
    return true;
  } catch (err) {
    console.warn('[GreenMirror] Firestore write failure: activity', err);
    return false;
  }
}

/**
 * Write a watering event to the dedicated `wateringEvents` collection
 * AND to `activityLogs` in a single compound call.
 */
export async function writeWateringEvent(event: {
  greenhouseId: string;
  visualZoneId: string;
  amountMl: number;
  plantName?: string;
  nodeId?: string;
  source?: 'manual' | 'automated';
  actorUserId?: string;
  actorName?: string;
  actorUsername?: string;
}): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const ts = serverTimestamp();
    const cleanEvent = removeUndefinedDeep({
      ...event,
      actorName: event.actorName ?? 'System activity',
      source: event.source ?? 'manual',
      timestamp: ts,
    });

    // watering events collection (for later research queries)
    await addDoc(collection(db, 'wateringEvents'), cleanEvent);

    // activity log
    await addDoc(collection(db, 'activityLogs'), removeUndefinedDeep({
      type: 'watering',
      greenhouseId: event.greenhouseId,
      visualZoneId: event.visualZoneId,
      nodeId: event.nodeId,
      plantName: event.plantName,
      amountMl: event.amountMl,
      source: event.source ?? 'manual',
      actorUserId: event.actorUserId,
      actorName: event.actorName ?? 'System activity',
      actorUsername: event.actorUsername,
      message: `Watered ${event.visualZoneId}${event.plantName ? ` (${event.plantName})` : ''} · ${event.amountMl}ml`,
      timestamp: ts,
    }));
    console.info(`[GreenMirror] Firestore write success: watering event for ${event.greenhouseId}/${event.visualZoneId}`);
    return true;
  } catch (err) {
    console.warn('[GreenMirror] Firestore write failure: watering event', err);
    return false;
  }
}
