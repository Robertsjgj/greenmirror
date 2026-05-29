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
 *
 * The second argument to onData, `docExists`, distinguishes:
 *   false — the Firestore document has never been written for this greenhouse
 *            (caller should migrate local data to Firestore rather than wiping state)
 *   true  — the document exists; use `assignments` as the source of truth,
 *            even if the map is empty (all assignments were cleared)
 *
 * Returns null when Firebase is not configured.
 */
export function subscribeToZoneAssignments(
  greenhouseId: string,
  onData: (assignments: ZoneAssignments, docExists: boolean) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) return null;

  const ref = doc(db, 'zoneAssignments', greenhouseId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        console.info(
          `[GreenMirror] No zoneAssignments document for "${greenhouseId}" — will migrate local data if present.`,
        );
        onData({}, false);
        return;
      }
      const raw = (snap.data()?.assignments ?? {}) as Record<string, unknown>;
      const cleaned: ZoneAssignments = Object.fromEntries(
        Object.entries(raw).filter(
          (e): e is [string, string] =>
            typeof e[0] === 'string' && typeof e[1] === 'string',
        ),
      );
      console.info(
        `[GreenMirror] Firestore assignments for "${greenhouseId}":`,
        Object.keys(cleaned).length, 'zones —',
        JSON.stringify(cleaned),
      );
      onData(cleaned, true);
    },
    (err) => {
      console.warn(
        '[GreenMirror] zoneAssignments Firestore error:', err.message,
        '\n  Ensure Firestore rules allow read/write to the zoneAssignments collection.',
        '\n  Recommended rule: match /zoneAssignments/{id} { allow read, write: if true; }',
      );
      onError?.(err instanceof Error ? err : new Error(String(err)));
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
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await setDoc(
      doc(db, 'zoneAssignments', greenhouseId),
      { assignments: { [zoneKey]: plantId } },
      { merge: true },
    );
    console.info(`[GreenMirror] Firestore write success: assignment ${greenhouseId}/${zoneKey} -> ${plantId}`);
    return true;
  } catch (err) {
    console.warn('[GreenMirror] Firestore write failure: assignment', err);
    return false;
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
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await updateDoc(
      doc(db, 'zoneAssignments', greenhouseId),
      { [`assignments.${zoneKey}`]: deleteField() },
    );
    console.info(`[GreenMirror] Firestore write success: cleared assignment ${greenhouseId}/${zoneKey}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "No document to update" is expected if no assignments have been written yet.
    if (!msg.includes('No document to update')) {
      console.warn('[GreenMirror] Firestore write failure: clear assignment', msg);
      return false;
    }
    return true;
  }
}
