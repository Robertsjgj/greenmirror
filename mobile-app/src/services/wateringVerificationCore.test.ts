import { describe, it, expect } from 'vitest';
import { resolveZoneId } from '../zoneRegistry';
import type { LatestReading, ZoneReading } from '../zoneLayout';
import {
  buildScheduledWateringEvent,
  computeMoistureBaseline,
  median,
  normalizeRoundVerificationStatus,
  sanitizeFirestoreId,
  wateringEventDocId,
} from './wateringVerificationCore';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-07-13T12:00:00.000Z');
const iso = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();

function zone(
  zone_id: string,
  pct: number | null,
  status: string = 'ok',
): Partial<ZoneReading> {
  return { zone_id, soil_moisture_pct: pct, soil_moisture_status: status };
}

function reading(tsISO: string, zones: Partial<ZoneReading>[]): LatestReading {
  return {
    greenhouse_id: 'sydney-greenhouse',
    timestamp: tsISO,
    zones: zones as ZoneReading[],
  } as LatestReading;
}

const CANONICAL = resolveZoneId('SYD-INSIDE-RIGHT-01');

// ─── 1. Scheduled task creates one watering event ─────────────────────────────

describe('buildScheduledWateringEvent', () => {
  const ev = buildScheduledWateringEvent({
    greenhouseId: 'sydney-greenhouse',
    scheduleId: 'sydney-greenhouse__2026-07-13',
    roundId: 'morning',
    bed: { zoneId: 'SYD-INSIDE-RIGHT-01', plantName: 'Radishes', litres: 6, hoseMinutes: 0.75 },
    canonicalZoneId: CANONICAL,
    actor: { uid: 'u1', displayName: 'Gabriel', username: 'gabe' },
    markedWateredAt: iso(0),
    baseline: {
      baselineMoisture: 40,
      baselineReadingTimestamp: iso(-60_000),
      baselineSource: 'recent_history_median',
    },
  });

  it('produces a pending scheduled event with canonical + visual zone ids', () => {
    expect(ev.source).toBe('scheduled');
    expect(ev.verificationStatus).toBe('pending_verification');
    expect(ev.zoneId).toBe('SYD-INSIDE-RIGHT-01'); // canonical, sensor-matchable
    expect(ev.visualZoneId).toBe('SYD-INSIDE-RIGHT-01');
    expect(ev.taskId).toBe('SYD-INSIDE-RIGHT-01');
    expect(ev.plantName).toBe('Radishes');
    expect(ev.baselineMoisture).toBe(40);
    expect(ev.baselineSource).toBe('recent_history_median');
  });

  it('keeps planned litres/minutes as guidance ONLY (never delivered)', () => {
    expect(ev.plannedLitres).toBe(6);
    expect(ev.plannedMinutes).toBe(0.75);
    // Unmetered hose: the event must never assert an actual/delivered amount.
    expect('actualLitres' in ev).toBe(false);
    expect('deliveredLitres' in ev).toBe(false);
    expect('amountMl' in ev).toBe(false);
  });

  it('omits planned litres when the bed has none (no invented water)', () => {
    const bare = buildScheduledWateringEvent({
      greenhouseId: 'g',
      scheduleId: 's',
      roundId: 'morning',
      bed: { zoneId: 'SYD-INSIDE-RIGHT-01' },
      canonicalZoneId: CANONICAL,
      actor: {},
      markedWateredAt: iso(0),
      baseline: { baselineMoisture: null, baselineReadingTimestamp: null, baselineSource: 'unavailable' },
    });
    expect(bare.plannedLitres).toBeUndefined();
    expect(bare.plannedMinutes).toBeUndefined();
  });
});

// ─── 2. Duplicate action does not duplicate the event (deterministic id) ───────

describe('wateringEventDocId / sanitizeFirestoreId', () => {
  it('is deterministic for identical inputs (idempotency)', () => {
    const a = wateringEventDocId('sydney-greenhouse', 's__2026-07-13', 'morning', 'SYD-INSIDE-RIGHT-01');
    const b = wateringEventDocId('sydney-greenhouse', 's__2026-07-13', 'morning', 'SYD-INSIDE-RIGHT-01');
    expect(a).toBe(b);
  });

  it('differs per bed / round', () => {
    const bed1 = wateringEventDocId('g', 's', 'morning', 'SYD-INSIDE-RIGHT-01');
    const bed2 = wateringEventDocId('g', 's', 'morning', 'SYD-INSIDE-RIGHT-02');
    const evening = wateringEventDocId('g', 's', 'evening', 'SYD-INSIDE-RIGHT-01');
    expect(bed1).not.toBe(bed2);
    expect(bed1).not.toBe(evening);
  });

  it('produces Firestore-safe ids (no "/", no bare dots)', () => {
    expect(sanitizeFirestoreId('a/b c#d')).toBe('a_b_c_d');
    expect(sanitizeFirestoreId('.')).not.toBe('.');
    expect(sanitizeFirestoreId('..')).not.toBe('..');
    expect(wateringEventDocId('g', 's', 'morning', 'SYD/INSIDE')).not.toContain('/');
  });
});

// ─── 3–7. Moisture baseline capture ───────────────────────────────────────────

describe('computeMoistureBaseline', () => {
  it('uses the median of valid readings in the recent window', () => {
    const recent = [
      reading(iso(-2 * 60_000), [zone('SYD-INSIDE-RIGHT-01', 30)]),
      reading(iso(-4 * 60_000), [zone('SYD-INSIDE-RIGHT-01', 50)]),
      reading(iso(-6 * 60_000), [zone('SYD-INSIDE-RIGHT-01', 40)]),
    ];
    const b = computeMoistureBaseline({ canonicalZoneId: CANONICAL, recentReadings: recent, latestReading: null, now: NOW });
    expect(b.baselineSource).toBe('recent_history_median');
    expect(b.baselineMoisture).toBe(40); // median(30,40,50)
    expect(b.baselineReadingTimestamp).toBe(iso(-2 * 60_000)); // newest contributor
  });

  it('falls back to the latest reading when there is no recent history', () => {
    const latest = reading(iso(0), [zone('SYD-INSIDE-RIGHT-01', 55)]);
    const b = computeMoistureBaseline({ canonicalZoneId: CANONICAL, recentReadings: [], latestReading: latest, now: NOW });
    expect(b.baselineSource).toBe('latest_reading');
    expect(b.baselineMoisture).toBe(55);
  });

  it('treats readings outside the window as stale and falls back', () => {
    const stale = [reading(iso(-30 * 60_000), [zone('SYD-INSIDE-RIGHT-01', 20)])];
    const latest = reading(iso(0), [zone('SYD-INSIDE-RIGHT-01', 60)]);
    const b = computeMoistureBaseline({ canonicalZoneId: CANONICAL, recentReadings: stale, latestReading: latest, now: NOW });
    expect(b.baselineSource).toBe('latest_reading');
    expect(b.baselineMoisture).toBe(60);
  });

  it('is unavailable when no valid readings exist anywhere', () => {
    const b = computeMoistureBaseline({ canonicalZoneId: CANONICAL, recentReadings: [], latestReading: null, now: NOW });
    expect(b.baselineMoisture).toBeNull();
    expect(b.baselineReadingTimestamp).toBeNull();
    expect(b.baselineSource).toBe('unavailable');
  });

  it('matches sensor zones via canonical id, including legacy GH ids', () => {
    const recent = [reading(iso(-1 * 60_000), [zone('SYD-GH-RIGHT-01', 45)])]; // legacy id → canonical
    const b = computeMoistureBaseline({ canonicalZoneId: CANONICAL, recentReadings: recent, latestReading: null, now: NOW });
    expect(b.baselineSource).toBe('recent_history_median');
    expect(b.baselineMoisture).toBe(45);
  });

  it('excludes disconnected / invalid / out-of-range moisture', () => {
    const recent = [
      reading(iso(-1 * 60_000), [zone('SYD-INSIDE-RIGHT-01', 40)]),
      reading(iso(-2 * 60_000), [zone('SYD-INSIDE-RIGHT-01', null, 'not_connected')]),
      reading(iso(-3 * 60_000), [zone('SYD-INSIDE-RIGHT-01', 999)]),
      reading(iso(-4 * 60_000), [zone('SYD-INSIDE-RIGHT-01', 60, 'invalid')]),
    ];
    const b = computeMoistureBaseline({ canonicalZoneId: CANONICAL, recentReadings: recent, latestReading: null, now: NOW });
    expect(b.baselineMoisture).toBe(40); // only the single valid sample survives
  });
});

describe('median', () => {
  it('handles odd and even counts', () => {
    expect(median([40])).toBe(40);
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([])).toBeNull();
  });
});

// ─── 8. Legacy schedule normalization ─────────────────────────────────────────

describe('normalizeRoundVerificationStatus', () => {
  it('maps absent/false completed → "due"', () => {
    expect(normalizeRoundVerificationStatus({}).status).toBe('due');
    expect(normalizeRoundVerificationStatus({ completed: false }).status).toBe('due');
  });

  it('preserves legacy completed WITHOUT falsely marking it verified', () => {
    const legacy = normalizeRoundVerificationStatus({ completed: true });
    expect(legacy.legacyCompleted).toBe(true);
    expect(legacy.status).toBeNull();
    expect(legacy.status).not.toBe('verified');
  });

  it('passes an explicit status through unchanged', () => {
    const pending = normalizeRoundVerificationStatus({ completed: true, status: 'pending_verification' });
    expect(pending.status).toBe('pending_verification');
    expect(pending.legacyCompleted).toBe(false);
  });
});

// ─── 9. Manual watering remains distinguishable / functional ──────────────────

describe('scheduled vs manual distinction', () => {
  it('scheduled events never masquerade as manual', () => {
    const ev = buildScheduledWateringEvent({
      greenhouseId: 'g',
      scheduleId: 's',
      roundId: 'morning',
      bed: { zoneId: 'SYD-INSIDE-RIGHT-01' },
      canonicalZoneId: CANONICAL,
      actor: {},
      markedWateredAt: iso(0),
      baseline: { baselineMoisture: null, baselineReadingTimestamp: null, baselineSource: 'unavailable' },
    });
    expect(ev.source).toBe('scheduled');
    // The manual path (writeWateringEvent) is untouched: source 'manual' + amountMl.
    const manualLike = { source: 'manual' as const, amountMl: 500 };
    expect(manualLike.source).not.toBe(ev.source);
    expect('amountMl' in ev).toBe(false);
  });
});
