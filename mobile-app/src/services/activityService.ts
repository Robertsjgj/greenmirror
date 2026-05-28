/**
 * Firestore-backed activity log service.
 *
 * Reads and writes greenhouse-scoped activity events to the
 * `activityLogs` Firestore collection.
 *
 * All functions are no-ops when Firebase is not configured — the app
 * falls back to the localStorage activity log in activityLog.ts.
 *
 * Required Firestore composite index (create if Firestore prompts you):
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

export interface ActivityEventInput {
  type: ActivityType;
  greenhouseId: string;
  visualZoneId?: string;
  nodeId?: string;
  plantName?: string;
  amountMl?: number;
  message: string;
  source?: ActivitySource;
  metadata?: Record<string, string | number | boolean>;
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
      const entries: ActivityEntry[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: (data.type ?? 'watering') as ActivityType,
          greenhouseId: data.greenhouseId as string | undefined,
          visualZoneId: data.visualZoneId as string | undefined,
          backendZoneId: data.backendZoneId as string | undefined,
          nodeId: data.nodeId as string | undefined,
          plantName: data.plantName as string | undefined,
          amountMl: data.amountMl as number | undefined,
          message: (data.message ?? '') as string,
          timestamp: data.timestamp?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
          source: data.source as ActivitySource | undefined,
        };
      });
      onData(entries);
    },
    (err) => {
      // Composite index missing → Firestore surfaces an error with a link
      // to create it in the console. App continues on localStorage fallback.
      console.warn(
        '[activityService] Firestore listen error:', err.message,
        '\n  If this is an index error, create the composite index in the Firebase console:',
        '\n  Collection: activityLogs | Fields: greenhouseId ASC, timestamp DESC',
      );
    },
  );
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Write a greenhouse-scoped activity event to Firestore.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function writeActivityEvent(event: ActivityEventInput): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await addDoc(collection(db, 'activityLogs'), {
      ...event,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[activityService] writeActivityEvent failed:', err);
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
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const ts = serverTimestamp();
    // watering events collection (for later research queries)
    await addDoc(collection(db, 'wateringEvents'), {
      ...event,
      source: event.source ?? 'manual',
      timestamp: ts,
    });
    // activity log
    await addDoc(collection(db, 'activityLogs'), {
      type: 'watering',
      greenhouseId: event.greenhouseId,
      visualZoneId: event.visualZoneId,
      nodeId: event.nodeId,
      plantName: event.plantName,
      amountMl: event.amountMl,
      source: event.source ?? 'manual',
      message: `Watered ${event.visualZoneId}${event.plantName ? ` (${event.plantName})` : ''} · ${event.amountMl}ml`,
      timestamp: ts,
    });
  } catch (err) {
    console.warn('[activityService] writeWateringEvent failed:', err);
  }
}
