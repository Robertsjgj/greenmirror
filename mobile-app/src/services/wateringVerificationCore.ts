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
