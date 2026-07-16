/**
 * Watering verification — Firestore I/O (Phase 1).
 *
 * Turns a "user tapped Watered on a scheduled round" action into persistent,
 * verification-ready `wateringEvents` documents, one per bed, each carrying a
 * moisture baseline for a LATER verification engine to evaluate. Also writes a
 * single round-level activity entry that says verification is pending.
 *
 * All heavy/pure logic lives in wateringVerificationCore.ts (unit-tested). This
 * module only does Firestore reads/writes and orchestration.
 *
 * Idempotency: each bed event uses a deterministic document id, so repeated
 * clicks / refreshes / retries can never create duplicates and the original
 * baseline + claim are preserved.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from './firebase';
import { resolveZoneId } from '../zoneRegistry';
import { writeActivityEvent } from './activityService';
import type { LatestReading } from '../zoneLayout';
import type { WateringRound, WateringSchedule } from './wateringScheduleService';
import {
  buildScheduledWateringEvent,
  computeMoistureBaseline,
  planWateringVerification,
  roundPatchFor,
  wateringEventDocId,
  type WateringVerificationStatus,
} from './wateringVerificationCore';

const BASELINE_WINDOW_MS = 10 * 60 * 1000; // previous ~10 minutes
const RECENT_READINGS_LIMIT = 60;

/**
 * One-shot fetch of recent `readings` for baseline capture. Reuses the existing
 * composite index (readings: greenhouse_id ASC, timestamp DESC). Returns [] when
 * Firestore is unavailable or the query fails — the baseline then falls back to
 * the live latestReading.
 */
export async function fetchRecentReadings(
  greenhouseId: string,
  sinceIso: string,
  max: number = RECENT_READINGS_LIMIT,
): Promise<LatestReading[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const q = query(
      collection(db, 'readings'),
      where('greenhouse_id', '==', greenhouseId),
      where('timestamp', '>=', sinceIso),
      orderBy('timestamp', 'desc'),
      limit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as LatestReading);
  } catch (err) {
    console.warn(
      '[wateringVerification] recent readings fetch failed (non-fatal, using fallback):',
      (err as Error).message,
    );
    return [];
  }
}

export interface ZoneVerificationState {
  status: string;
  markedWateredAt?: string | null;
}

/**
 * Latest scheduled-watering verification state per canonical zone (read-only,
 * for AI Insights display). Equality-only query → no composite index required.
 */
export async function fetchZoneVerificationStates(
  greenhouseId: string,
): Promise<Map<string, ZoneVerificationState>> {
  const out = new Map<string, ZoneVerificationState>();
  const db = getDb();
  if (!db) return out;
  try {
    const q = query(
      collection(db, 'wateringEvents'),
      where('greenhouseId', '==', greenhouseId),
      limit(200),
    );
    const snap = await getDocs(q);
    const rows = snap.docs
      .map((d) => d.data() as Record<string, unknown>)
      .filter((r) => r.source === 'scheduled' && typeof r.zoneId === 'string')
      .sort((a, b) =>
        String(b.markedWateredAt ?? '').localeCompare(String(a.markedWateredAt ?? '')),
      );
    for (const row of rows) {
      const key = resolveZoneId(row.zoneId as string);
      if (!out.has(key)) {
        out.set(key, {
          status: (row.verificationStatus as string) ?? 'pending_verification',
          markedWateredAt: (row.markedWateredAt as string | null) ?? null,
        });
      }
    }
  } catch (err) {
    console.warn('[wateringVerification] verification states fetch failed (non-fatal):', (err as Error).message);
  }
  return out;
}

function nodeIdForZone(
  latestReading: LatestReading | null,
  canonicalZoneId: string,
): string | undefined {
  for (const zone of latestReading?.zones ?? []) {
    if (resolveZoneId(zone.zone_id) === canonicalZoneId) return zone.node_id ?? undefined;
  }
  return undefined;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export interface RecordScheduledRoundInput {
  schedule: WateringSchedule;
  roundId: WateringRound['id'];
  actor: { uid: string; displayName: string; username?: string };
  latestReading: LatestReading | null;
  greenhouseName: string;
  /** Injectable for tests / to share one timestamp across beds. Defaults to now. */
  markedWateredAt?: string;
}

export interface RecordScheduledRoundResult {
  created: number;
  alreadyRecorded: number;
  total: number;
}

/**
 * Record a scheduled round as "watered" → creates one PENDING wateringEvents
 * document per bed (idempotent) plus a single activity entry. Does NOT mark the
 * schedule doc — the caller does that via markWateringRoundComplete so the
 * user's claim persists even if event writes partially fail.
 */
export async function recordScheduledRoundWatered(
  input: RecordScheduledRoundInput,
): Promise<RecordScheduledRoundResult> {
  const db = getDb();
  if (!db) throw new Error('Firestore is not configured.');

  const { schedule, roundId, actor, latestReading, greenhouseName } = input;
  const round = schedule.rounds.find((item) => item.id === roundId);
  if (!round) throw new Error(`Round "${roundId}" not found on schedule ${schedule.id}.`);

  const beds = schedule.beds ?? [];
  const markedWateredAt = input.markedWateredAt ?? new Date().toISOString();
  const now = Date.now();
  const sinceIso = new Date(now - BASELINE_WINDOW_MS).toISOString();
  const recentReadings = await fetchRecentReadings(schedule.greenhouseId, sinceIso);

  // Resolve refs + canonical zone ids up front.
  const targets = beds.map((bed) => {
    const canonicalZoneId = resolveZoneId(bed.zoneId);
    const id = wateringEventDocId(schedule.greenhouseId, schedule.id, roundId, bed.zoneId);
    return { bed, canonicalZoneId, ref: doc(db, 'wateringEvents', id) };
  });

  // Existence checks in parallel → idempotency (never overwrite an existing claim).
  const snaps = await Promise.all(
    targets.map((t) => getDoc(t.ref).catch(() => null)),
  );

  const batch = writeBatch(db);
  let created = 0;
  let alreadyRecorded = 0;

  targets.forEach((target, i) => {
    const snap = snaps[i];
    const existing = snap && snap.exists() ? (snap.data() as { verificationStatus?: string }) : null;
    // Idempotent for an active claim, but a bed that failed verification (or had
    // no sensor) is re-armed on a fresh tap: capture a NEW baseline and set it
    // back to pending so the engine evaluates the new watering.
    const retryable =
      existing?.verificationStatus === 'not_verified' ||
      existing?.verificationStatus === 'sensor_unavailable';
    if (existing && !retryable) {
      alreadyRecorded += 1;
      return;
    }

    const baseline = computeMoistureBaseline({
      canonicalZoneId: target.canonicalZoneId,
      recentReadings,
      latestReading,
      now,
      windowMs: BASELINE_WINDOW_MS,
    });

    const eventData = buildScheduledWateringEvent({
      greenhouseId: schedule.greenhouseId,
      scheduleId: schedule.id,
      roundId,
      bed: target.bed,
      canonicalZoneId: target.canonicalZoneId,
      nodeId: nodeIdForZone(latestReading, target.canonicalZoneId),
      actor: { uid: actor.uid, displayName: actor.displayName, username: actor.username },
      markedWateredAt,
      baseline,
    });

    batch.set(
      target.ref,
      stripUndefined({
        ...eventData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    created += 1;
  });

  if (created > 0) {
    await batch.commit();

    // One round-level activity entry. Wording makes clear verification is PENDING
    // — never claims "verified" (that is the later engine's job). No amountMl:
    // the hose is unmetered, so we do not assert a delivered volume.
    await writeActivityEvent({
      type: 'watering',
      greenhouseId: schedule.greenhouseId,
      message: `${actor.displayName} marked ${round.label} as watered for ${greenhouseName}. GreenMirror is checking the soil sensor.`,
      source: 'manual',
      actorUserId: actor.uid,
      actorName: actor.displayName,
      actorUsername: actor.username,
      metadata: {
        scheduleId: schedule.id,
        roundId,
        wateringSource: 'scheduled',
        verificationStatus: 'pending_verification',
        bedsRecorded: created,
      },
    });
  }

  return { created, alreadyRecorded, total: beds.length };
}

// ─── Verification engine — evaluate pending events (Phase 2) ──────────────────

const EVAL_MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000; // don't chase waterings older than a day
const EVAL_READINGS_LIMIT = 500;                  // enough post-watering samples to see a rise

export interface EvaluationResult {
  pending: number;
  updatedEvents: number;
  updatedRounds: number;
}

// A run touches shared Firestore state; a module flag stops concurrent ticks
// (interval + view mount) from doing the same work twice.
let evaluating = false;

const VERDICT_ACTIVITY: Partial<Record<WateringVerificationStatus, { source: 'sensor' | 'system'; verb: string }>> = {
  verified: { source: 'sensor', verb: 'confirmed the soil sensor detected more moisture after' },
  not_verified: { source: 'system', verb: 'has not yet detected a moisture increase for' },
};

/**
 * Look at every PENDING scheduled watering, compare the soil sensor's later
 * readings against the baseline captured at tap time, and advance the ones the
 * evidence has settled: a bed that got wetter (or is already wet) becomes
 * `verified`; one that stayed dry past the settle window becomes `not_verified`;
 * one with no usable reading becomes `sensor_unavailable`. Rounds are completed
 * ONLY when the sensor verifies them. Safe to call often — it no-ops when there
 * is nothing pending, and never throws to the caller.
 */
export async function evaluatePendingWateringEvents(greenhouseId: string): Promise<EvaluationResult> {
  const empty: EvaluationResult = { pending: 0, updatedEvents: 0, updatedRounds: 0 };
  const db = getDb();
  if (!db || !greenhouseId || evaluating) return empty;
  evaluating = true;

  try {
    // 1. All pending scheduled events for this greenhouse (equality-only query).
    const snap = await getDocs(
      query(collection(db, 'wateringEvents'), where('greenhouseId', '==', greenhouseId), limit(300)),
    );
    const pending = snap.docs
      .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
      .filter(
        (e) =>
          e.data.source === 'scheduled' &&
          e.data.verificationStatus === 'pending_verification' &&
          typeof e.data.zoneId === 'string' &&
          typeof e.data.markedWateredAt === 'string',
      );
    if (pending.length === 0) return empty;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // 2. Fetch readings since the earliest pending tap (bounded to a day).
    let earliest = now;
    for (const e of pending) {
      const t = Date.parse(e.data.markedWateredAt as string);
      if (Number.isFinite(t)) earliest = Math.min(earliest, t);
    }
    const sinceIso = new Date(Math.max(earliest, now - EVAL_MAX_LOOKBACK_MS)).toISOString();
    const readings = await fetchRecentReadings(greenhouseId, sinceIso, EVAL_READINGS_LIMIT);

    // 3. Ask the shared planner what has settled (same logic the server cron runs).
    const plan = planWateringVerification({
      pending: pending.map((e) => ({
        id: e.id,
        scheduleId: String(e.data.scheduleId ?? ''),
        roundId: String(e.data.roundId ?? ''),
        zoneId: e.data.zoneId as string,
        markedWateredAt: e.data.markedWateredAt as string,
        baselineMoisture: typeof e.data.baselineMoisture === 'number' ? e.data.baselineMoisture : null,
      })),
      readings,
      now,
    });

    // 4. Apply the settled event verdicts.
    if (plan.eventUpdates.length > 0) {
      const batch = writeBatch(db);
      for (const u of plan.eventUpdates) {
        batch.update(
          doc(db, 'wateringEvents', u.id),
          stripUndefined({
            verificationStatus: u.status,
            verifiedAt: u.status === 'verified' ? nowIso : null,
            observedPeakMoisture: u.peakMoisture ?? undefined,
            observedRise: u.rise ?? undefined,
            verificationCheckedAt: nowIso,
            updatedAt: serverTimestamp(),
          }),
        );
      }
      await batch.commit();
    }

    // 5. Complete/close the settled rounds on their schedules.
    const bySchedule = new Map<string, typeof plan.roundDecisions>();
    for (const d of plan.roundDecisions) {
      const list = bySchedule.get(d.scheduleId) ?? [];
      list.push(d);
      bySchedule.set(d.scheduleId, list);
    }

    let updatedRounds = 0;
    for (const [scheduleId, decisions] of bySchedule) {
      const ref = doc(db, 'wateringSchedules', scheduleId);
      const sSnap = await getDoc(ref).catch(() => null);
      if (!sSnap || !sSnap.exists()) continue;
      const schedule = sSnap.data() as WateringSchedule;

      const activity: { label: string; folded: WateringVerificationStatus }[] = [];
      let changed = false;

      const newRounds: WateringRound[] = schedule.rounds.map((r) => {
        const decision = decisions.find((d) => d.roundId === r.id);
        // Only advance a round that is still pending — never override a manual state.
        if (!decision || r.status !== 'pending_verification') return r;
        changed = true;
        activity.push({ label: r.label, folded: decision.folded });
        return { ...r, ...roundPatchFor(decision.folded, nowIso) };
      });

      if (!changed) continue;
      await updateDoc(ref, { rounds: newRounds });
      updatedRounds += activity.length;

      // A quiet activity trail for the meaningful transitions (skip sensor_unavailable).
      for (const a of activity) {
        const meta = VERDICT_ACTIVITY[a.folded];
        if (!meta) continue;
        await writeActivityEvent({
          type: 'watering',
          greenhouseId,
          source: meta.source,
          message: `GreenMirror ${meta.verb} ${a.label}.`,
          metadata: { scheduleId, wateringSource: 'scheduled', verificationStatus: a.folded },
        });
      }
    }

    return { pending: pending.length, updatedEvents: plan.eventUpdates.length, updatedRounds };
  } catch (err) {
    console.warn('[wateringVerification] evaluation failed (non-fatal):', (err as Error).message);
    return empty;
  } finally {
    evaluating = false;
  }
}
