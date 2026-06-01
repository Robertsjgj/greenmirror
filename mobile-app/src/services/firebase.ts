/**
 * Firebase client initialisation for GreenMirror.
 *
 * Guarded by env vars — the app continues working with API polling alone
 * when VITE_FIREBASE_PROJECT_ID is absent.
 *
 * Required env vars (in .env.local):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

function missingFirebaseEnv(): string[] {
  return REQUIRED_FIREBASE_ENV.filter((key) => !import.meta.env[key]);
}

function isFirebaseConfigured(): boolean {
  return missingFirebaseEnv().length === 0;
}

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (_app) return _app;

  try {
    _app = getApps().length === 0
      ? initializeApp({
          apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
          storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId:             import.meta.env.VITE_FIREBASE_APP_ID,
        })
      : getApps()[0];
    console.info('[GreenMirror] Firebase initialised (project:', import.meta.env.VITE_FIREBASE_PROJECT_ID + ')');
  } catch (err) {
    console.error('[GreenMirror] Firebase init failed:', err);
    return null;
  }

  return _app;
}

export function getDb(): Firestore | null {
  if (_db) return _db;
  const app = getFirebaseApp();
  if (!app) {
    if (!_warnedOnce) {
      const missing = missingFirebaseEnv();
      console.info(
        '[GreenMirror] Firestore disabled — set VITE_FIREBASE_* env vars in mobile-app/.env.local to enable cloud sync.',
        missing.length ? `Missing: ${missing.join(', ')}` : '',
      );
      _warnedOnce = true;
    }
    return null;
  }
  try {
    _db = getFirestore(app);
  } catch (err) {
    console.error('[GreenMirror] Could not get Firestore instance:', err);
    return null;
  }
  return _db;
}

let _warnedOnce = false;

/** True when Firebase env vars are present and the SDK initialised successfully. */
export const firebaseEnabled: boolean = isFirebaseConfigured();
