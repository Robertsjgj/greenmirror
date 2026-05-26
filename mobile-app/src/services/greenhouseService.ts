/**
 * Firestore greenhouse service — frontend.
 *
 * Manages the greenhouses collection and related metadata.
 * All functions are no-ops when Firebase is not configured.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { getDb } from './firebase';

export interface GreenhouseDoc {
  id: string;
  name: string;
  region: string;
  timezone?: string;
  createdAt?: DocumentData;
  updatedAt?: DocumentData;
}

export interface ZoneAssignmentDoc {
  greenhouseId: string;
  visualZoneId: string;
  plantProfileId: string;
  assignedAt: DocumentData;
}

/**
 * Ensure a greenhouse document exists.  Creates it if missing.
 */
export async function ensureGreenhouseDoc(
  id: string,
  name: string,
  region: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const ref = doc(db, 'greenhouses', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id,
        name,
        region,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('[greenhouseService] ensureGreenhouseDoc failed:', err);
  }
}

/**
 * Write a zone→plant assignment to Firestore.
 * Called alongside the existing localStorage write.
 */
export async function saveZoneAssignment(
  greenhouseId: string,
  visualZoneId: string,
  plantProfileId: string | null,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const id = `${greenhouseId}__${visualZoneId}`;
    const ref = doc(db, 'zoneAssignments', id);
    if (plantProfileId) {
      await setDoc(ref, {
        greenhouseId,
        visualZoneId,
        plantProfileId,
        assignedAt: serverTimestamp(),
      });
    } else {
      // Use updateDoc with a sentinel to mark cleared rather than deleting the doc,
      // so history is preserved.
      await setDoc(ref, {
        greenhouseId,
        visualZoneId,
        plantProfileId: null,
        clearedAt: serverTimestamp(),
      }, { merge: true });
    }
  } catch (err) {
    console.warn('[greenhouseService] saveZoneAssignment failed:', err);
  }
}

/**
 * Write a watering event to Firestore.
 */
export async function saveWateringEvent(event: {
  greenhouseId: string;
  visualZoneId: string;
  amountMl: number;
  plantName?: string;
  source?: 'manual' | 'automated';
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const ref = doc(db, 'wateringEvents', `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    await setDoc(ref, {
      ...event,
      source: event.source ?? 'manual',
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[greenhouseService] saveWateringEvent failed:', err);
  }
}

/**
 * Write an activity log entry to Firestore.
 */
export async function saveActivityLog(entry: {
  type: 'watering' | 'assignment' | 'cleared' | 'profile-update';
  greenhouseId?: string;
  visualZoneId?: string;
  plantName?: string;
  amountMl?: number;
  message: string;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const ref = doc(db, 'activityLogs', `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    await setDoc(ref, {
      ...entry,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[greenhouseService] saveActivityLog failed:', err);
  }
}

/**
 * Write or update a plant profile in Firestore.
 */
export async function savePlantProfileToFirestore(profile: {
  id: string;
  name: string;
  icon?: string;
  moistureMin: number;
  moistureMax: number;
  soilTempMin: number;
  soilTempMax: number;
  notes?: string;
  isDefault?: boolean;
  isCustom?: boolean;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const ref = doc(db, 'plantProfiles', profile.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { ...profile, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  } catch (err) {
    console.warn('[greenhouseService] savePlantProfileToFirestore failed:', err);
  }
}
