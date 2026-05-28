/**
 * Firestore-backed zone assignment service.
 *
 * Reads and writes greenhouse-scoped plant→zone assignments to
 * `zoneAssignments/{greenhouseId}` in Firestore.
 *
 * This makes assignments sync across devices in real time.
 * localStorage is used as a read-through cache (via plantProfiles.ts helpers).
 *
 * Firestore document structure:
 *   zoneAssignments/{greenhouseId}
 *     assignments: { [zoneKey: string]: plantId }
 *
 * All functions are no-ops when Firebase is not configured.
 */

import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteField,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from './firebase';
import type { ZoneAssignments } from '../plantProfiles';

/**
 * Subscribe to real-time zone assignments for a greenhouse.
 * Fires immediately with current data, then on every remote change.
 * Returns null when Firebase is not configured.
 */
export function subscribeToZoneAssignments(
  greenhouseId: string,
  onData: (assignments: ZoneAssignments) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) return null;

  const ref = doc(db, 'zoneAssignments', greenhouseId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData({});
        return;
      }
      const raw = (snap.data()?.assignments ?? {}) as Record<string, unknown>;
      const cleaned: ZoneAssignments = Object.fromEntries(
        Object.entries(raw).filter(
          (e): e is [string, string] =>
            typeof e[0] === 'string' && typeof e[1] === 'string',
        ),
      );
      onData(cleaned);
    },
    (err) => {
      console.warn('[zoneAssignmentsService] Firestore error:', err.message);
    },
  );
}

/**
 * Write a single zone→plant assignment to Firestore.
 * Uses setDoc with merge:true so other zones in the document are untouched.
 */
export async function writeZoneAssignment(
  greenhouseId: string,
  zoneKey: string,
  plantId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await setDoc(
      doc(db, 'zoneAssignments', greenhouseId),
      { assignments: { [zoneKey]: plantId } },
      { merge: true },
    );
    console.info(`[zoneAssignmentsService] ${zoneKey} → ${plantId} saved for ${greenhouseId}`);
  } catch (err) {
    console.warn('[zoneAssignmentsService] write failed:', err);
  }
}

/**
 * Remove a single zone assignment from Firestore.
 * Uses updateDoc with deleteField() to surgically remove one key.
 * If the document doesn't exist yet the error is silently ignored.
 */
export async function clearZoneAssignment(
  greenhouseId: string,
  zoneKey: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await updateDoc(
      doc(db, 'zoneAssignments', greenhouseId),
      { [`assignments.${zoneKey}`]: deleteField() },
    );
    console.info(`[zoneAssignmentsService] ${zoneKey} cleared from ${greenhouseId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "No document to update" is expected if no assignments have been written yet.
    if (!msg.includes('No document to update')) {
      console.warn('[zoneAssignmentsService] clear failed:', msg);
    }
  }
}
