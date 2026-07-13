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
  wateringEventDocId,
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
): Promise<LatestReading[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const q = query(
      collection(db, 'readings'),
      where('greenhouse_id', '==', greenhouseId),
      where('timestamp', '>=', sinceIso),
      orderBy('timestamp', 'desc'),
      limit(RECENT_READINGS_LIMIT),
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
    if (snap && snap.exists()) {
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
