import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
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

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;

  if (!user) {
    throw new Error("You must be signed in to change your password.");
  }

  if (!user.email) {
    throw new Error("This account does not have an email login.");
  }

  if (!currentPassword) {
    throw new Error("Current password is required.");
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters.");
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);

  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
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
