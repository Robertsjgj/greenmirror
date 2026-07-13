import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "./firebase";

export type UserRole = "admin" | "user";

export interface GreenMirrorUserProfile {
  uid: string;
  username: string;
  displayName: string;
  role: UserRole;
  greenhouseId: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
}

export async function getUserProfile(
  uid: string,
): Promise<GreenMirrorUserProfile | null> {
  const db = getDb();

  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data() as GreenMirrorUserProfile;

  return {
    ...data,
    uid: data.uid || uid,
  };
}

export async function upsertUserProfile(
  profile: GreenMirrorUserProfile,
): Promise<void> {
  const db = getDb();

  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  await setDoc(
    doc(db, "users", profile.uid),
    {
      ...profile,
      updatedAt: serverTimestamp(),
      createdAt: profile.createdAt ?? serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateUserActiveStatus(
  uid: string,
  active: boolean,
): Promise<void> {
  const db = getDb();

  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  await updateDoc(doc(db, "users", uid), {
    active,
    updatedAt: serverTimestamp(),
  });
}
