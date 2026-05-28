'use strict';

/**
 * Firestore writer — raspberry-pi backend (optional).
 *
 * Credential loading priority (first match wins):
 *
 *   1. firebase-service-account.json in the same directory as this file
 *      → Drop the JSON file there and it just works. No env vars needed.
 *
 *   2. Inline env vars in .env:
 *        FIREBASE_PROJECT_ID     your-project-id
 *        FIREBASE_CLIENT_EMAIL   firebase-adminsdk-xxx@...iam.gserviceaccount.com
 *        FIREBASE_PRIVATE_KEY    -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
 *        (the \n sequences are expanded automatically)
 *
 *   3. GOOGLE_APPLICATION_CREDENTIALS path + FIREBASE_PROJECT_ID
 *      → Points to any service account JSON file.
 *
 * If none of the above are found, Firestore writes are silently skipped
 * and the server continues normally.
 *
 * dotenv must be loaded BEFORE this module (done in server.js line 1).
 */

const path = require('path');
const fs   = require('fs');

let _saveReading    = async () => {};
let _firestoreEnabled = false;

// ─── Debug helpers ────────────────────────────────────────────────────────────

function present(val, label) {
  if (val) {
    console.log(`[Firestore]   ✅ ${label}: set (${String(val).slice(0, 40)}${String(val).length > 40 ? '...' : ''})`);
  } else {
    console.log(`[Firestore]   ❌ ${label}: NOT SET`);
  }
}

// ─── Initialisation ───────────────────────────────────────────────────────────

try {
  console.log('[Firestore] Initialising — checking credentials...');

  const admin = require('firebase-admin');

  if (admin.apps.length) {
    // Already initialised (e.g. during hot-reload in dev)
    const db = admin.firestore();
    _firestoreEnabled = true;
    console.log('[Firestore] Re-used existing Admin SDK instance.');
    attachSaveReading(admin, db);
  } else {
    // ── Option 1: service account JSON file in same directory ──────────────
    const saFilePath = path.join(__dirname, 'firebase-service-account.json');
    const saFileExists = fs.existsSync(saFilePath);

    console.log(`[Firestore]   JSON file (${saFilePath}): ${saFileExists ? '✅ found' : '❌ not found'}`);

    // ── Option 2: inline env vars ───────────────────────────────────────────
    const projectIdEnv    = process.env.FIREBASE_PROJECT_ID;
    const clientEmailEnv  = process.env.FIREBASE_CLIENT_EMAIL;
    const rawKeyEnv       = process.env.FIREBASE_PRIVATE_KEY;
    const privateKeyEnv   = rawKeyEnv ? rawKeyEnv.replace(/\\n/g, '\n') : undefined;

    console.log('[Firestore]   Env vars:');
    present(projectIdEnv,   'FIREBASE_PROJECT_ID');
    present(clientEmailEnv, 'FIREBASE_CLIENT_EMAIL');
    if (rawKeyEnv) {
      console.log(`[Firestore]   ✅ FIREBASE_PRIVATE_KEY: set (${rawKeyEnv.length} chars, starts: ${rawKeyEnv.slice(0, 27)}...)`);
    } else {
      console.log('[Firestore]   ❌ FIREBASE_PRIVATE_KEY: NOT SET');
    }

    // ── Option 3: GOOGLE_APPLICATION_CREDENTIALS ────────────────────────────
    const gacEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    console.log(`[Firestore]   GOOGLE_APPLICATION_CREDENTIALS: ${gacEnv || '❌ not set'}`);

    // ── Pick credential ─────────────────────────────────────────────────────
    let credential;
    let projectId;

    if (saFileExists) {
      console.log('[Firestore] Using credential: JSON file');
      const sa = JSON.parse(fs.readFileSync(saFilePath, 'utf8'));
      credential = admin.credential.cert(sa);
      projectId  = sa.project_id;
    } else if (projectIdEnv && clientEmailEnv && privateKeyEnv) {
      console.log('[Firestore] Using credential: inline env vars');
      credential = admin.credential.cert({
        projectId:   projectIdEnv,
        clientEmail: clientEmailEnv,
        privateKey:  privateKeyEnv,
      });
      projectId = projectIdEnv;
    } else if (gacEnv && projectIdEnv) {
      console.log('[Firestore] Using credential: GOOGLE_APPLICATION_CREDENTIALS');
      credential = admin.credential.applicationDefault();
      projectId  = projectIdEnv;
    } else {
      console.log(
        '[Firestore] ⚠️  No credentials found — Firestore disabled.\n' +
        '[Firestore]    Fix: drop firebase-service-account.json into raspberry-pi/\n' +
        '[Firestore]    OR set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env',
      );
      // Fall through — _firestoreEnabled stays false
      projectId = null;
    }

    if (credential && projectId) {
      admin.initializeApp({ credential, projectId });
      const db = admin.firestore();
      _firestoreEnabled = true;
      console.log(`[Firestore] ✅ Admin SDK connected (project: ${projectId})`);
      attachSaveReading(admin, db);
    }
  }
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.warn('[Firestore] ⚠️  firebase-admin not installed — run `npm install firebase-admin`');
  } else {
    console.warn('[Firestore] ⚠️  Initialisation failed (non-fatal):', err.message);
    if (process.env.FIRESTORE_VERBOSE === 'true') console.error(err);
  }
}

// ─── Write helper ─────────────────────────────────────────────────────────────

function attachSaveReading(admin, db) {
  _saveReading = async (reading) => {
    try {
      const ghId = reading.greenhouse_id || 'sydney-greenhouse';
      const batch = db.batch();

      const histRef   = db.collection('readings').doc();
      const latestRef = db.collection('latestReadings').doc(ghId);

      const payload = {
        ...reading,
        _savedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(histRef, payload);
      batch.set(latestRef, payload);

      await batch.commit();

      if (process.env.FIRESTORE_VERBOSE === 'true') {
        console.log(`[Firestore] ✅ Wrote latestReadings/${ghId} + readings history`);
      }
    } catch (err) {
      console.error('[Firestore] ❌ Write failed (non-fatal):', err.message);
    }
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  /** Save a reading to Firestore (no-op when not configured). */
  saveReading: _saveReading,
  /** True when Admin SDK initialised successfully. */
  firestoreEnabled: _firestoreEnabled,
};
