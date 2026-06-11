/**
 * Firestore rollups service — frontend.
 *
 * Reads pre-computed hourly / daily summaries from `readingsRollups` instead
 * of the raw `readings` collection for long trend ranges (7D / 30D / 3M / 1Y).
 * The backend (raspberry-pi/rollups.js) writes one compact doc per hour/day,
 * so a year of history is ~365 reads instead of thousands of raw readings.
 *
 * Rollup docs are shaped like a LatestReading (greenhouse_id, timestamp,
 * zones[], summary, environment, external_weather), so callers can feed them
 * straight into the same bucketing code used for raw readings.
 *
 * All functions no-op (and signal an empty result) when Firebase is not
 * configured, so the rest of the app is unaffected.
 */

import {
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

export type RollupPeriod = 'hourly' | 'daily';

/**
 * Subscribe to greenhouse-scoped rollups of a given period.
 *
 * Requires composite index (Firestore prompts with a console link if missing):
 *   readingsRollups / greenhouse_id ASC, period ASC, timestamp DESC
 *
 * @param cutoffTimestamp  ISO 8601 — only rollups at or after this time.
 * @returns Firestore unsubscribe fn, or null if Firebase is not configured.
 */
export function subscribeToRollups(
  greenhouseId: string,
  period: RollupPeriod,
  onData: (rollups: LatestReading[]) => void,
  limitCount = 400,
  onError?: () => void,
  cutoffTimestamp?: string,
): Unsubscribe | null {
  const db = getDb();
  if (!db) {
    // Firebase not configured — signal empty so callers don't hang on loading.
    onData([]);
    return null;
  }

  const constraints = [
    where('greenhouse_id', '==', greenhouseId),
    where('period', '==', period),
    ...(cutoffTimestamp ? [where('timestamp', '>=', cutoffTimestamp)] : []),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  ] as const;

  const q = query(collection(db, 'readingsRollups'), ...constraints);

  return onSnapshot(
    q,
    (snap) => {
      const rollups = snap.docs.map((d) => d.data() as LatestReading);
      console.info(
        `[rollupsService] ${period} snapshot: ${rollups.length} rollups for ${greenhouseId}`,
      );
      onData(rollups);
    },
    (err) => {
      console.warn(
        '[rollupsService] listen error:', err.message,
        '\n  If this is an index error, create the composite index in the Firebase console:',
        '\n  Collection: readingsRollups | Fields: greenhouse_id ASC, period ASC, timestamp DESC',
      );
      // Signal loading-done even on error — prevents an infinite loading state.
      onData([]);
      onError?.();
    },
  );
}
