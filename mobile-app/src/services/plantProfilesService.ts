/**
 * Firestore-backed plant profile service.
 *
 * Syncs custom plant profiles (and any user-edited defaults) to the
 * `plantProfiles` collection so that all devices see the same profiles.
 *
 * Firestore structure:
 *   plantProfiles/{profile.id}   — one document per non-default or edited profile
 *     (all PlantProfile fields stored flat)
 *
 * Built-in default profiles (tomato, pepper, etc.) are stored here ONLY if
 * the user has edited them from their factory values. Unedited defaults are
 * always loaded from the hardcoded DEFAULT_PLANT_PROFILES list.
 *
 * All functions are no-ops when Firebase is not configured.
 */

import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from './firebase';
import type { PlantProfile } from '../plantProfiles';

/**
 * Subscribe to all custom/overridden plant profiles in Firestore.
 * Fires immediately with the current state, then on every change.
 * Returns null when Firebase is not configured.
 */
export function subscribeToCustomProfiles(
  onData: (profiles: PlantProfile[]) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) return null;

  return onSnapshot(
    collection(db, 'plantProfiles'),
    (snap) => {
      const profiles: PlantProfile[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (typeof data.id === 'string' && typeof data.name === 'string') {
          profiles.push(data as PlantProfile);
        }
      });
      console.info(
        `[GreenMirror] Firestore plantProfiles: ${profiles.length} profiles (${profiles.map((p) => p.id).join(', ') || 'none'})`,
      );
      onData(profiles);
    },
    (err) => {
      console.warn(
        '[GreenMirror] plantProfiles Firestore error:', err.message,
        '\n  Ensure Firestore rules allow read/write to the plantProfiles collection.',
        '\n  Recommended rule: match /plantProfiles/{id} { allow read, write: if true; }',
      );
    },
  );
}

/**
 * Write a plant profile to Firestore.
 * Called when a user creates a new profile or edits an existing one.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function writeCustomProfile(profile: PlantProfile): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await setDoc(doc(db, 'plantProfiles', profile.id), { ...profile });
    console.info(`[GreenMirror] Profile written to Firestore: "${profile.id}" (${profile.name})`);
  } catch (err) {
    console.warn('[GreenMirror] writeCustomProfile failed:', err);
  }
}

/**
 * Delete a plant profile from Firestore.
 * Called when a user deletes a profile or resets a default to factory values
 * (resetting removes the Firestore override, so the hardcoded default is used again).
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function deleteCustomProfile(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'plantProfiles', id));
    console.info(`[GreenMirror] Profile deleted from Firestore: "${id}"`);
  } catch (err) {
    console.warn('[GreenMirror] deleteCustomProfile failed:', err);
  }
}
