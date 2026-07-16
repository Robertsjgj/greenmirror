/**
 * GET /api/cron/verify-waterings — the server-side watering-verification tick.
 *
 * Runs on a Vercel Cron schedule (see vercel.json), so pending waterings get
 * verified even when NOBODY has the app open. It runs the exact same decision
 * logic the browser runs (`planWateringVerification` in the shared core) — only
 * the plumbing differs: this uses firebase-admin, which also means it is not
 * bound by the per-user Firestore rules, so it can complete any assigned round.
 *
 * It never touches the Raspberry Pi or how readings are produced: it only reads
 * the readings the Pi already writes, and compares them to the moisture baseline
 * GreenMirror captured when "Watered" was tapped.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminDb, FieldValue } from '../_firebaseAdmin';
import {
  planWateringVerification,
  roundPatchFor,
  type PendingWateringLite,
  type WateringVerificationStatus,
} from '../../src/services/wateringVerificationCore';
import type { LatestReading } from '../../src/zoneLayout';

const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const READINGS_LIMIT = 500;
const PENDING_LIMIT = 500;

const VERDICT_ACTIVITY: Partial<Record<WateringVerificationStatus, { source: 'sensor' | 'system'; verb: string }>> = {
  verified: { source: 'sensor', verb: 'confirmed the soil sensor detected more moisture after' },
  not_verified: { source: 'system', verb: 'has not yet detected a moisture increase for' },
};

/**
 * Only Vercel's scheduler (which sets `x-vercel-cron`, a header clients cannot
 * forge) or a caller holding CRON_SECRET may run this.
 */
function authorized(req: VercelRequest): boolean {
  if (req.headers['x-vercel-cron']) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

interface PendingRow extends PendingWateringLite {
  greenhouseId: string;
}

/** Read every pending scheduled watering across all greenhouses. */
async function loadPending(): Promise<PendingRow[]> {
  const snap = await adminDb
    .collection('wateringEvents')
    .where('verificationStatus', '==', 'pending_verification')
    .limit(PENDING_LIMIT)
    .get();

  const rows: PendingRow[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (
      d.source !== 'scheduled' ||
      typeof d.zoneId !== 'string' ||
      typeof d.markedWateredAt !== 'string' ||
      typeof d.greenhouseId !== 'string' ||
      typeof d.scheduleId !== 'string' ||
      typeof d.roundId !== 'string'
    ) {
      continue;
    }
    rows.push({
      id: doc.id,
      greenhouseId: d.greenhouseId,
      scheduleId: d.scheduleId,
      roundId: d.roundId,
      zoneId: d.zoneId,
      markedWateredAt: d.markedWateredAt,
      baselineMoisture: typeof d.baselineMoisture === 'number' ? d.baselineMoisture : null,
    });
  }
  return rows;
}

async function fetchReadings(greenhouseId: string, sinceIso: string): Promise<LatestReading[]> {
  const snap = await adminDb
    .collection('readings')
    .where('greenhouse_id', '==', greenhouseId)
    .where('timestamp', '>=', sinceIso)
    .orderBy('timestamp', 'desc')
    .limit(READINGS_LIMIT)
    .get();
  return snap.docs.map((d) => d.data() as LatestReading);
}

/** Verify one greenhouse's pending waterings; returns how many events/rounds moved. */
async function processGreenhouse(
  greenhouseId: string,
  pending: PendingRow[],
  now: number,
): Promise<{ updatedEvents: number; updatedRounds: number }> {
  const nowIso = new Date(now).toISOString();

  let earliest = now;
  for (const e of pending) {
    const t = Date.parse(e.markedWateredAt);
    if (Number.isFinite(t)) earliest = Math.min(earliest, t);
  }
  const sinceIso = new Date(Math.max(earliest, now - MAX_LOOKBACK_MS)).toISOString();
  const readings = await fetchReadings(greenhouseId, sinceIso);

  const plan = planWateringVerification({ pending, readings, now });

  // Event verdicts.
  if (plan.eventUpdates.length > 0) {
    const batch = adminDb.batch();
    for (const u of plan.eventUpdates) {
      batch.update(adminDb.collection('wateringEvents').doc(u.id), {
        verificationStatus: u.status,
        verifiedAt: u.status === 'verified' ? nowIso : null,
        observedPeakMoisture: u.peakMoisture,
        observedRise: u.rise,
        verificationCheckedAt: nowIso,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  // Round completions/closures.
  const bySchedule = new Map<string, typeof plan.roundDecisions>();
  for (const d of plan.roundDecisions) {
    const list = bySchedule.get(d.scheduleId) ?? [];
    list.push(d);
    bySchedule.set(d.scheduleId, list);
  }

  let updatedRounds = 0;
  for (const [scheduleId, decisions] of bySchedule) {
    const ref = adminDb.collection('wateringSchedules').doc(scheduleId);
    const sSnap = await ref.get().catch(() => null);
    if (!sSnap || !sSnap.exists) continue;
    const schedule = sSnap.data() as { rounds?: Record<string, unknown>[] };
    if (!Array.isArray(schedule.rounds)) continue;

    const activity: { label: string; folded: WateringVerificationStatus }[] = [];
    let changed = false;

    const newRounds = schedule.rounds.map((r) => {
      const decision = decisions.find((d) => d.roundId === r.id);
      if (!decision || r.status !== 'pending_verification') return r;
      changed = true;
      activity.push({ label: String(r.label ?? 'Watering round'), folded: decision.folded });
      return { ...r, ...roundPatchFor(decision.folded, nowIso) };
    });

    if (!changed) continue;
    await ref.update({ rounds: newRounds });
    updatedRounds += activity.length;

    for (const a of activity) {
      const meta = VERDICT_ACTIVITY[a.folded];
      if (!meta) continue;
      await adminDb
        .collection('activityLogs')
        .add({
          type: 'watering',
          greenhouseId,
          source: meta.source,
          actorName: 'GreenMirror',
          message: `GreenMirror ${meta.verb} ${a.label}.`,
          metadata: { scheduleId, wateringSource: 'scheduled', verificationStatus: a.folded },
          timestamp: FieldValue.serverTimestamp(),
        })
        .catch(() => undefined); // activity trail is best-effort
    }
  }

  return { updatedEvents: plan.eventUpdates.length, updatedRounds };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pending = await loadPending();
    if (pending.length === 0) {
      return res.status(200).json({ pending: 0, updatedEvents: 0, updatedRounds: 0 });
    }

    // Group by greenhouse so readings are fetched once per greenhouse.
    const byGreenhouse = new Map<string, PendingRow[]>();
    for (const row of pending) {
      const list = byGreenhouse.get(row.greenhouseId) ?? [];
      list.push(row);
      byGreenhouse.set(row.greenhouseId, list);
    }

    const now = Date.now();
    let updatedEvents = 0;
    let updatedRounds = 0;
    for (const [greenhouseId, rows] of byGreenhouse) {
      const result = await processGreenhouse(greenhouseId, rows, now);
      updatedEvents += result.updatedEvents;
      updatedRounds += result.updatedRounds;
    }

    return res.status(200).json({
      greenhouses: byGreenhouse.size,
      pending: pending.length,
      updatedEvents,
      updatedRounds,
    });
  } catch (err) {
    console.error('[cron/verify-waterings] failed:', err);
    return res.status(500).json({ error: 'Verification run failed' });
  }
}
