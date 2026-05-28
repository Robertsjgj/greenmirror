/**
 * Firestore readings service — frontend.
 *
 * Provides real-time subscriptions to the latest sensor reading and
 * recent readings history.  All functions return null / no-op when
 * Firebase is not configured, so the rest of the app is unaffected.
 */

import {
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from './firebase';
import type { LatestReading } from '../zoneLayout';

export type { Unsubscribe };

/**
 * Subscribe to real-time latest sensor reading for a greenhouse.
 *
 * The backend writes to `latestReadings/{greenhouseId}` on every
 * POST /api/readings — this listener picks it up within milliseconds.
 *
 * @returns Firestore unsubscribe fn, or null if Firebase is not configured.
 */
export function subscribeToLatestReading(
  greenhouseId: string,
  onData: (reading: LatestReading) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) return null;

  const ref = doc(db, 'latestReadings', greenhouseId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as LatestReading;
      if (Array.isArray(data?.zones) && data.zones.length > 0) {
        onData(data);
      }
    },
    (err) => {
      console.error('[readingsService] Firestore listen error:', err);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    },
  );
}

/**
 * Subscribe to recent readings history for a specific greenhouse.
 *
 * Filters by greenhouse_id in Firestore (requires composite index:
 * readings / greenhouse_id ASC + timestamp DESC — Firestore will prompt
 * with a console link to create it on first run if missing).
 *
 * @returns Firestore unsubscribe fn, or null if Firebase is not configured.
 */
export function subscribeToReadingsHistory(
  greenhouseId: string,
  onData: (readings: LatestReading[]) => void,
  limitCount = 200,
  onError?: () => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) {
    // Firebase not configured — signal empty result immediately so
    // callers don't stay in a loading state forever.
    onData([]);
    return null;
  }

  const q = query(
    collection(db, 'readings'),
    where('greenhouse_id', '==', greenhouseId),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  );

  return onSnapshot(
    q,
    (snap) => {
      const readings = snap.docs.map((d) => d.data() as LatestReading);
      console.info(
        `[readingsService] history snapshot: ${readings.length} readings for ${greenhouseId}`,
      );
      onData(readings);
    },
    (err) => {
      console.warn(
        '[readingsService] history listen error:', err.message,
        '\n  If this is an index error, create the composite index in the Firebase console:',
        '\n  Collection: readings | Fields: greenhouse_id ASC, timestamp DESC',
      );
      // Signal that loading is done even on error — prevents infinite loading state.
      onData([]);
      onError?.();
    },
  );
}
