import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

const USERNAME_DOMAIN = "greenmirror.local";

function noopUnsubscribe(): void {
  return undefined;
}

export function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase();

  if (!clean) {
    throw new Error("Username is required");
  }

  // Allows admins to paste a real email if needed,
  // but normal users will use username/password.
  if (clean.includes("@")) return clean;

  return `${clean}@${USERNAME_DOMAIN}`;
}

export async function loginWithUsername(
  username: string,
  password: string,
): Promise<User> {
  const auth = getFirebaseAuth();

  if (!auth) {
    throw new Error("Firebase Auth is not configured.");
  }

  const email = usernameToEmail(username);
  const credential = await signInWithEmailAndPassword(auth, email, password);

  return credential.user;
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth();

  if (!auth) return;

  await signOut(auth);
}

export function listenToAuthState(
  callback: (user: User | null) => void,
): () => void {
  const auth = getFirebaseAuth();

  if (!auth) {
    callback(null);
    return noopUnsubscribe;
  }

  return onAuthStateChanged(auth, callback);
}
