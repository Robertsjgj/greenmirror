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
 * Strip undefined values before writing to Firestore.
 * Firestore rejects documents containing undefined — optional PlantProfile
 * fields (notes, careNotes, icon, isDefault, isCustom) must be replaced with
 * safe fallbacks before calling setDoc().
 */
function sanitizePlantProfileForFirestore(profile: PlantProfile): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: profile.id,
    name: profile.name,
    icon: profile.icon ?? '🌱',
    moistureMin: profile.moistureMin,
    moistureMax: profile.moistureMax,
    soilTempMin: profile.soilTempMin,
    soilTempMax: profile.soilTempMax,
    notes: profile.notes ?? '',
    careNotes: profile.careNotes ?? '',
    isDefault: profile.isDefault ?? false,
    isCustom: profile.isCustom ?? false,
    updatedAt: now,
    createdAt: now,
  };
}

/**
 * Subscribe to all custom/overridden plant profiles in Firestore.
 * Fires immediately with the current state, then on every change.
 * Returns null when Firebase is not configured.
 */
export function subscribeToCustomProfiles(
  onData: (profiles: PlantProfile[]) => void,
  onError?: (err: Error) => void,
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
      onError?.(err instanceof Error ? err : new Error(String(err)));
    },
  );
}

/**
 * Write a plant profile to Firestore.
 * Called when a user creates a new profile or edits an existing one.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function writeCustomProfile(profile: PlantProfile): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const path = `plantProfiles/${profile.id}`;
  const sanitized = sanitizePlantProfileForFirestore(profile);
  console.info(`[GreenMirror] Writing profile → ${path}`, sanitized);
  try {
    await setDoc(doc(db, 'plantProfiles', profile.id), sanitized);
    console.info(`[GreenMirror] Firestore write success: ${path} (${profile.name})`);
    return true;
  } catch (err) {
    console.warn(`[GreenMirror] Firestore write failure: ${path}`, err);
    return false;
  }
}

/**
 * Delete a plant profile from Firestore.
 * Called when a user deletes a profile or resets a default to factory values
 * (resetting removes the Firestore override, so the hardcoded default is used again).
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function deleteCustomProfile(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await deleteDoc(doc(db, 'plantProfiles', id));
    console.info(`[GreenMirror] Firestore write success: deleted profile "${id}"`);
    return true;
  } catch (err) {
    console.warn('[GreenMirror] Firestore write failure: delete profile', err);
    return false;
  }
}
