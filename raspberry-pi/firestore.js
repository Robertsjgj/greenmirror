'use strict';

/**
 * Firestore writer — raspberry-pi backend (optional).
 *
 * The server starts and operates normally without this module being
 * fully initialised.  All failures are caught and logged; they never
 * crash the server.
 *
 * Configuration via environment variables (set in .env or system env):
 *
 *   Option A — explicit service account credentials:
 *     FIREBASE_PROJECT_ID     your-project-id
 *     FIREBASE_CLIENT_EMAIL   firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
 *     FIREBASE_PRIVATE_KEY    -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
 *
 *   Option B — service account JSON file:
 *     GOOGLE_APPLICATION_CREDENTIALS   /path/to/service-account.json
 *     FIREBASE_PROJECT_ID              your-project-id
 *
 * If none of the above are present, Firestore writes are silently skipped.
 */

let _saveReading = async () => {};
let _firestoreEnabled = false;

try {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    console.log(
      '[Firestore] FIREBASE_PROJECT_ID not set — Firestore writes disabled. Set env vars to enable.'
    );
  } else {
    // require() inside try/catch: if firebase-admin is not installed,
    // we get MODULE_NOT_FOUND which is caught below — server keeps running.
    const admin = require('firebase-admin');

    if (!admin.apps.length) {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const rawKey      = process.env.FIREBASE_PRIVATE_KEY;
      const privateKey  = rawKey ? rawKey.replace(/\\n/g, '\n') : undefined;

      const credential = clientEmail && privateKey
        ? admin.credential.cert({ projectId, clientEmail, privateKey })
        : admin.credential.applicationDefault();   // uses GOOGLE_APPLICATION_CREDENTIALS

      admin.initializeApp({ credential, projectId });
    }

    const db = admin.firestore();
    _firestoreEnabled = true;
    console.log(`[Firestore] Admin SDK connected (project: ${projectId})`);

    /**
     * Write one reading to:
     *   - readings/{auto-id}            (append history)
     *   - latestReadings/{greenhouse_id} (overwrite for real-time listeners)
     */
    _saveReading = async (reading) => {
      try {
        const ghId = reading.greenhouse_id || 'primary';

        const batch = db.batch();

        const histRef = db.collection('readings').doc();
        batch.set(histRef, {
          ...reading,
          _savedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const latestRef = db.collection('latestReadings').doc(ghId);
        batch.set(latestRef, {
          ...reading,
          _savedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();
        // Verbose log only in debug mode
        if (process.env.FIRESTORE_VERBOSE === 'true') {
          console.log(`[Firestore] Saved reading for greenhouse "${ghId}"`);
        }
      } catch (err) {
        console.error('[Firestore] Write failed (non-fatal):', err.message);
      }
    };
  }
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.warn(
      '[Firestore] firebase-admin not installed — run `npm install firebase-admin` in raspberry-pi/ to enable.'
    );
  } else {
    console.warn('[Firestore] Initialisation failed (non-fatal):', err.message);
  }
}

module.exports = {
  /** Save a sensor reading to Firestore (no-op if not configured). */
  saveReading: _saveReading,
  /** True when Firestore Admin SDK initialised successfully. */
  firestoreEnabled: _firestoreEnabled,
};
