/**
 * Watering verification — pure core (no Firebase, no DOM).
 *
 * Phase 1 of the sensor-verified watering workflow. This module holds ONLY
 * deterministic, side-effect-free logic so it can be unit-tested in a plain
 * Node environment and reused by both the frontend and (later) the Pi:
 *
 *   - verification status vocabulary
 *   - the persisted `wateringEvents` document shape (scheduled source)
 *   - moisture baseline capture (median of recent history, with fallbacks)
 *   - deterministic + Firestore-safe document IDs (idempotency)
 *   - legacy schedule/round normalization
 *
 * IMPORTANT (project constraint): the greenhouse uses an UNMETERED hose. We
 * never record actual/delivered litres. Planned litres/minutes may travel with
 * an event but are labelled `planned*` only. This module does NOT decide whether
 * watering was verified — it only captures a baseline and builds a PENDING
 * record for a later verification engine to evaluate.
 */

import { resolveZoneId } from '../zoneRegistry';
import { MAX_PLAUSIBLE_SENSOR_PCT } from '../plantRequirements';
import type { LatestReading, ZoneReading } from '../zoneLayout';

// ─── Verification status vocabulary ─────────────────────────────────────────

export type WateringVerificationStatus =
  | 'due'
  | 'pending_verification'
  | 'verified'
  | 'not_verified'
  | 'sensor_unavailable';

/** Status a freshly persisted event may carry (never "due" — that's a UI-only state). */
export type PersistedVerificationStatus = Exclude<WateringVerificationStatus, 'due'>;

export type BaselineSource = 'recent_history_median' | 'latest_reading' | 'unavailable';

export interface BaselineResult {
  baselineMoisture: number | null;
  baselineReadingTimestamp: string | null;
  baselineSource: BaselineSource;
}

/**
 * The persisted `wateringEvents` document for a scheduled watering action.
 * Deliberately has NO actualLitres / deliveredLitres — water is unmetered.
 */
export interface ScheduledWateringEventData {
  greenhouseId: string;
  scheduleId: string;
  roundId: string;
  taskId: string;

  /** Canonical zone id — matches latestReadings.zones[].zone_id via resolveZoneId. */
  zoneId: string;
  /** Stable visual/bed label as shown in the schedule. */
  visualZoneId: string;
  nodeId?: string;
  plantName?: string;

  actorUserId?: string;
  actorName?: string;
  actorUsername?: string;

  markedWateredAt: string;
  source: 'scheduled';

  /** Guidance only — NOT a measured/delivered amount. */
  plannedLitres?: number;
  plannedMinutes?: number;

  verificationStatus: PersistedVerificationStatus;

  baselineMoisture: number | null;
  baselineReadingTimestamp: string | null;
  baselineSource: BaselineSource;
}

// ─── Firestore-safe deterministic IDs (idempotency) ─────────────────────────

/**
 * Make an arbitrary string safe as a Firestore document ID. Firestore IDs may
 * not contain "/", may not be "." or "..", and are capped at 1500 bytes. We
 * replace every character outside [A-Za-z0-9_-] with "_" so the result is both
 * safe and deterministic (same input → same id → no duplicate documents).
 */
export function sanitizeFirestoreId(raw: string): string {
  const cleaned = (raw ?? '').replace(/[^A-Za-z0-9_-]/g, '_');
  const trimmed = cleaned.slice(0, 1400);
  if (!trimmed || trimmed === '.' || trimmed === '..') return `_${trimmed}`;
  return trimmed;
}

/** Deterministic id for one bed within one round of one schedule. */
export function wateringEventDocId(
  greenhouseId: string,
  scheduleId: string,
  roundId: string,
  taskId: string,
): string {
  return sanitizeFirestoreId(`${greenhouseId}__${scheduleId}__${roundId}__${taskId}`);
}

// ─── Moisture baseline capture ──────────────────────────────────────────────

const DEFAULT_BASELINE_WINDOW_MS = 10 * 60 * 1000; // ~previous 10 minutes

function roundTo(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * A moisture reading counts only if the sensor is connected and the value is
 * plausible. 100% is field capacity, not the ceiling — soil can read above it
 * shortly after watering, which is exactly when a baseline matters most, so the
 * bound is the shared plausibility limit rather than 100.
 */
function isUsableMoisture(zone: ZoneReading): boolean {
  const status = zone.soil_moisture_status;
  if (status === 'not_connected' || status === 'invalid') return false;
  const m = zone.soil_moisture_pct;
  return typeof m === 'number' && Number.isFinite(m) && m >= 0 && m <= MAX_PLAUSIBLE_SENSOR_PCT;
}

/** Find this reading's entry for the canonical zone (reconciles legacy ids). */
function zoneEntry(reading: LatestReading, canonicalZoneId: string): ZoneReading | null {
  for (const zone of reading.zones ?? []) {
    if (resolveZoneId(zone.zone_id) === canonicalZoneId) return zone;
  }
  return null;
}

/**
 * Capture an initial moisture baseline for a zone at the moment "Watered" is
 * tapped. Preference order:
 *   1. Median of valid readings in the previous ~5–10 minutes  (recent_history_median)
 *   2. The latest valid reading                                (latest_reading)
 *   3. null                                                    (unavailable)
 *
 * Null / stale (outside the window) / disconnected / invalid / out-of-range
 * readings are excluded. This does NOT decide verification — baseline only.
 */
export function computeMoistureBaseline(params: {
  canonicalZoneId: string;
  recentReadings: LatestReading[];
  latestReading: LatestReading | null;
  now?: number;
  windowMs?: number;
}): BaselineResult {
  const { canonicalZoneId, recentReadings, latestReading } = params;
  const now = params.now ?? Date.now();
  const windowMs = params.windowMs ?? DEFAULT_BASELINE_WINDOW_MS;
  const cutoff = now - windowMs;

  const samples: { pct: number; ts: number; iso: string }[] = [];
  for (const reading of recentReadings ?? []) {
    if (!reading?.timestamp) continue;
    const ts = new Date(reading.timestamp).getTime();
    if (!Number.isFinite(ts) || ts < cutoff || ts > now) continue; // stale / future excluded
    const zone = zoneEntry(reading, canonicalZoneId);
    if (!zone || !isUsableMoisture(zone)) continue;
    samples.push({ pct: zone.soil_moisture_pct as number, ts, iso: reading.timestamp });
  }

  if (samples.length > 0) {
    const med = median(samples.map((s) => s.pct));
    const newest = samples.reduce((a, b) => (b.ts > a.ts ? b : a));
    return {
      baselineMoisture: med === null ? null : roundTo(med, 1),
      baselineReadingTimestamp: newest.iso,
      baselineSource: 'recent_history_median',
    };
  }

  if (latestReading) {
    const zone = zoneEntry(latestReading, canonicalZoneId);
    if (zone && isUsableMoisture(zone)) {
      return {
        baselineMoisture: roundTo(zone.soil_moisture_pct as number, 1),
        baselineReadingTimestamp: latestReading.timestamp ?? null,
        baselineSource: 'latest_reading',
      };
    }
  }

  return { baselineMoisture: null, baselineReadingTimestamp: null, baselineSource: 'unavailable' };
}

// ─── Event builder ──────────────────────────────────────────────────────────

export interface ScheduledBed {
  zoneId: string; // visual/bed label (e.g. "SYD-INSIDE-RIGHT-01")
  zoneName?: string;
  plantName?: string;
  litres?: number;       // planned only
  hoseMinutes?: number;  // planned only
}

export interface BuildScheduledEventInput {
  greenhouseId: string;
  scheduleId: string;
  roundId: string;
  bed: ScheduledBed;
  /** resolveZoneId(bed.zoneId) — passed in so callers share one canonicalization. */
  canonicalZoneId: string;
  nodeId?: string;
  actor: { uid?: string; displayName?: string; username?: string };
  markedWateredAt: string;
  baseline: BaselineResult;
}

/**
 * Build the PENDING scheduled watering event document (no server timestamps —
 * the I/O layer adds createdAt/updatedAt). Never emits actual/delivered litres.
 */
export function buildScheduledWateringEvent(
  input: BuildScheduledEventInput,
): ScheduledWateringEventData {
  const { greenhouseId, scheduleId, roundId, bed, canonicalZoneId, nodeId, actor, markedWateredAt, baseline } =
    input;

  return {
    greenhouseId,
    scheduleId,
    roundId,
    taskId: bed.zoneId,
    zoneId: canonicalZoneId,
    visualZoneId: bed.zoneId,
    nodeId,
    plantName: bed.plantName,
    actorUserId: actor.uid,
    actorName: actor.displayName,
    actorUsername: actor.username,
    markedWateredAt,
    source: 'scheduled',
    plannedLitres: typeof bed.litres === 'number' ? bed.litres : undefined,
    plannedMinutes: typeof bed.hoseMinutes === 'number' ? bed.hoseMinutes : undefined,
    verificationStatus: 'pending_verification',
    baselineMoisture: baseline.baselineMoisture,
    baselineReadingTimestamp: baseline.baselineReadingTimestamp,
    baselineSource: baseline.baselineSource,
  };
}

// ─── Verification engine (Phase 2) ──────────────────────────────────────────
//
// Decides whether a PENDING watering was borne out by the soil sensor. It is
// deliberately FORGIVING, not forensic: a small, believable moisture rise (or a
// bed that is already wet) counts as verified, and a negative verdict is only
// reached after the soil has had hours to respond. The goal is to stop claiming
// "done" the instant a button is tapped — not to punish a good watering because
// the sensor was noisy.

/** A single usable moisture sample for a zone, in chronological terms. */
export interface MoistureSample {
  pct: number;
  ts: number; // epoch ms
}

/** Lenient defaults — see module note. All are overridable for tests / tuning. */
export const DEFAULT_MIN_RISE_PCT = 2;               // a +2pp bump is enough
export const DEFAULT_SETTLE_WINDOW_MS = 3 * 60 * 60 * 1000; // wait ~3h before a negative verdict
export const DEFAULT_WET_ENOUGH_PCT = 85;            // already near field capacity → accept

export interface EvaluateWateringInput {
  /** Moisture at the moment "Watered" was tapped; null when none was captured. */
  baselineMoisture: number | null;
  /** When the user marked it watered (epoch ms). */
  markedWateredAt: number;
  /** Every usable moisture sample GreenMirror has for this bed (any time). */
  samples: MoistureSample[];
  now?: number;
  minRisePct?: number;
  settleWindowMs?: number;
  wetEnoughPct?: number;
}

export interface WateringVerdict {
  status: WateringVerificationStatus; // 'pending_verification' | 'verified' | 'not_verified' | 'sensor_unavailable'
  /** Highest moisture seen after watering, when any reading exists. */
  peakMoisture: number | null;
  /** peak − baseline, when both are known. */
  rise: number | null;
}

/**
 * Evaluate one pending watering. Pure and deterministic.
 *
 *  - a rise ≥ minRise, OR a bed already at/above wetEnough → verified
 *  - no evidence yet, still inside the settle window          → stay pending
 *  - settle window elapsed with valid readings but no rise    → not_verified
 *  - settle window elapsed with no usable reading at all      → sensor_unavailable
 */
export function evaluateWateringVerification(input: EvaluateWateringInput): WateringVerdict {
  const now = input.now ?? Date.now();
  const minRise = input.minRisePct ?? DEFAULT_MIN_RISE_PCT;
  const settleWindow = input.settleWindowMs ?? DEFAULT_SETTLE_WINDOW_MS;
  const wetEnough = input.wetEnoughPct ?? DEFAULT_WET_ENOUGH_PCT;

  const post = input.samples
    .filter((s) => Number.isFinite(s.pct) && Number.isFinite(s.ts) && s.ts > input.markedWateredAt)
    .sort((a, b) => a.ts - b.ts);

  const elapsed = now - input.markedWateredAt;
  const settled = elapsed >= settleWindow;

  if (post.length === 0) {
    // Nothing since the tap. Give the sensor time before saying it went quiet.
    return { status: settled ? 'sensor_unavailable' : 'pending_verification', peakMoisture: null, rise: null };
  }

  const peak = post.reduce((m, s) => (s.pct > m ? s.pct : m), post[0].pct);

  if (input.baselineMoisture != null) {
    const rise = Math.round((peak - input.baselineMoisture) * 10) / 10;
    if (rise >= minRise || peak >= wetEnough) {
      return { status: 'verified', peakMoisture: peak, rise };
    }
    return { status: settled ? 'not_verified' : 'pending_verification', peakMoisture: peak, rise };
  }

  // No baseline to compare against — we can only accept an already-wet bed.
  if (peak >= wetEnough) return { status: 'verified', peakMoisture: peak, rise: null };
  return { status: settled ? 'sensor_unavailable' : 'pending_verification', peakMoisture: peak, rise: null };
}

/**
 * Collect the usable post-watering moisture samples for one canonical zone from
 * a batch of readings. Mirrors the baseline sampler's validity rules so both
 * ends of the verification use the same definition of a trustworthy reading.
 */
export function collectZoneSamples(
  readings: LatestReading[],
  canonicalZoneId: string,
): MoistureSample[] {
  const out: MoistureSample[] = [];
  for (const reading of readings ?? []) {
    if (!reading?.timestamp) continue;
    const ts = new Date(reading.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    const zone = zoneEntry(reading, canonicalZoneId);
    if (!zone || !isUsableMoisture(zone)) continue;
    out.push({ pct: zone.soil_moisture_pct as number, ts });
  }
  return out;
}

/**
 * Fold several beds' verdicts into one round-level status, leniently: a round
 * counts as verified if ANY of its beds showed the sensor responding, because
 * the user watered the whole round and sparse sensors need not all agree.
 *
 *  - any bed verified                                  → verified
 *  - any bed still pending (inside its window)          → pending_verification
 *  - all settled, at least one not_verified             → not_verified
 *  - all settled, only sensor_unavailable               → sensor_unavailable
 */
export function foldRoundVerdict(statuses: WateringVerificationStatus[]): WateringVerificationStatus {
  if (statuses.length === 0) return 'pending_verification';
  if (statuses.includes('verified')) return 'verified';
  if (statuses.includes('pending_verification')) return 'pending_verification';
  if (statuses.includes('not_verified')) return 'not_verified';
  return 'sensor_unavailable';
}

// ─── SDK-agnostic verification planner ───────────────────────────────────────
//
// The one place the "look at pending waterings + readings → decide" logic lives.
// It takes plain data and returns plain instructions, so the browser (client
// Firestore SDK) and the scheduled server job (firebase-admin SDK) run byte-for-
// byte the same decisions — only the read/write plumbing differs between them.

/** A pending watering event reduced to the fields the planner needs. */
export interface PendingWateringLite {
  id: string;
  scheduleId: string;
  roundId: string;
  zoneId: string; // raw or canonical — resolved internally
  markedWateredAt: string; // ISO
  baselineMoisture: number | null;
}

/** "Write this terminal status onto this event." */
export interface EventVerdictUpdate {
  id: string;
  status: WateringVerificationStatus; // never 'pending_verification'
  peakMoisture: number | null;
  rise: number | null;
}

/** "This round has settled — advance it to this terminal status." */
export interface RoundVerdictDecision {
  scheduleId: string;
  roundId: string;
  folded: WateringVerificationStatus; // never 'pending_verification'
}

export interface VerificationPlan {
  eventUpdates: EventVerdictUpdate[];
  roundDecisions: RoundVerdictDecision[];
}

export interface PlanVerificationParams {
  pending: PendingWateringLite[];
  readings: LatestReading[];
  now?: number;
  minRisePct?: number;
  settleWindowMs?: number;
  wetEnoughPct?: number;
}

/**
 * Decide, for a batch of pending waterings, which events and rounds have
 * settled. Events still inside their window produce no update; rounds still
 * waiting on any bed produce no decision. Pure and deterministic.
 */
export function planWateringVerification(params: PlanVerificationParams): VerificationPlan {
  const now = params.now ?? Date.now();
  const eventUpdates: EventVerdictUpdate[] = [];
  const rounds = new Map<string, { scheduleId: string; roundId: string; statuses: WateringVerificationStatus[] }>();

  for (const e of params.pending) {
    const verdict = evaluateWateringVerification({
      baselineMoisture: e.baselineMoisture,
      markedWateredAt: Date.parse(e.markedWateredAt),
      samples: collectZoneSamples(params.readings, resolveZoneId(e.zoneId)),
      now,
      minRisePct: params.minRisePct,
      settleWindowMs: params.settleWindowMs,
      wetEnoughPct: params.wetEnoughPct,
    });

    const key = `${e.scheduleId}__${e.roundId}`;
    if (!rounds.has(key)) rounds.set(key, { scheduleId: e.scheduleId, roundId: e.roundId, statuses: [] });
    rounds.get(key)!.statuses.push(verdict.status);

    if (verdict.status !== 'pending_verification') {
      eventUpdates.push({ id: e.id, status: verdict.status, peakMoisture: verdict.peakMoisture, rise: verdict.rise });
    }
  }

  const roundDecisions: RoundVerdictDecision[] = [];
  for (const { scheduleId, roundId, statuses } of rounds.values()) {
    const folded = foldRoundVerdict(statuses);
    if (folded !== 'pending_verification') roundDecisions.push({ scheduleId, roundId, folded });
  }

  return { eventUpdates, roundDecisions };
}

/** The exact round fields to write for a settled verdict. Shared by both callers. */
export interface RoundStatePatch {
  status: WateringVerificationStatus;
  completed: boolean;
  completedAt: string | null;
  verifiedAt: string | null;
  verifiedBySensor: boolean;
}

export function roundPatchFor(folded: WateringVerificationStatus, nowIso: string): RoundStatePatch {
  if (folded === 'verified') {
    return { status: 'verified', completed: true, completedAt: nowIso, verifiedAt: nowIso, verifiedBySensor: true };
  }
  // not_verified / sensor_unavailable — leave the round incomplete and re-actionable.
  return { status: folded, completed: false, completedAt: null, verifiedAt: null, verifiedBySensor: false };
}

// ─── Legacy normalization ───────────────────────────────────────────────────

export interface RoundVerificationView {
  /** Verification status, or null when the round predates this feature (legacy). */
  status: WateringVerificationStatus | null;
  /** True for legacy rounds completed before verification existed. Never "verified". */
  legacyCompleted: boolean;
}

/**
 * Map a round (which may only have a legacy `completed` boolean) onto the
 * verification model WITHOUT corrupting it:
 *   - explicit `status` present            → use it
 *   - completed === true, no status        → legacy completed (NOT "verified")
 *   - completed === false / absent         → "due"
 */
export function normalizeRoundVerificationStatus(round: {
  status?: WateringVerificationStatus;
  completed?: boolean;
}): RoundVerificationView {
  if (round.status) return { status: round.status, legacyCompleted: false };
  if (round.completed) return { status: null, legacyCompleted: true };
  return { status: 'due', legacyCompleted: false };
}
