import { describe, it, expect } from 'vitest';
import type { LatestReading, VisualZone } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';
import {
  buildAllZoneInsights,
  buildZoneInsight,
  computeZoneTrends,
  summarizeGreenhouse,
  type ZoneAIInsight,
  type ZoneTrendInfo,
} from './aiInsights';
import { aiFeedbackDocId } from './aiFeedbackService';

const NOW = Date.parse('2026-07-13T12:00:00.000Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function plant(over: Partial<PlantProfile> = {}): PlantProfile {
  return {
    id: 'tomato',
    name: 'Tomato',
    icon: '🍅',
    moistureMin: 35,
    moistureMax: 55,
    soilTempMin: 15,
    soilTempMax: 30,
    ...over,
  } as PlantProfile;
}

function zone(over: Partial<VisualZone> = {}): VisualZone {
  return {
    id: 'z',
    visualLabel: 'SYD-INSIDE-RIGHT-01',
    displayLabel: 'Bed 7',
    rowLabel: 'greenhouse',
    rowIndex: 0,
    section: 1,
    backendZoneId: 'SYD-INSIDE-RIGHT-01',
    soilMoistureRaw: 1500,
    soilMoisturePct: 40,
    soilMoistureStatus: 'ok',
    soilTempC: 21,
    soilTempStatus: 'ok',
    alerts: [],
    timestamp: iso(-30_000), // fresh
    hasReading: true,
    assignedPlant: 'tomato',
    assignedPlantProfile: plant(),
    ...over,
  };
}

const TREND = (over: Partial<ZoneTrendInfo> = {}): ZoneTrendInfo => ({
  direction: 'stable',
  deltaPct: 0,
  sampleCount: 5,
  windowHours: 6,
  ...over,
});

function build(z: VisualZone, trend: ZoneTrendInfo, lastWateringAt: number | null = null) {
  return buildZoneInsight({ greenhouseId: 'sydney-greenhouse', zone: z, trend, lastWateringAt, now: NOW });
}

// ─── 1. Dry below plant range → water_soon ───────────────────────────────────
describe('recommendation rules', () => {
  it('dry zone well below plant range recommends water_soon (urgent)', () => {
    const i = build(zone({ soilMoisturePct: 18 }), TREND({ direction: 'falling', deltaPct: -8 }), NOW - 2 * 86_400_000);
    expect(i.action).toBe('water_soon');
    expect(i.severity).toBe('urgent');
  });

  // 2. Within range → monitor or no_watering_needed
  it('within range and stable recommends no_watering_needed', () => {
    const i = build(zone({ soilMoisturePct: 45 }), TREND({ direction: 'stable' }));
    expect(i.action).toBe('no_watering_needed');
    expect(i.severity).toBe('good');
  });

  it('within range but falling recommends monitor', () => {
    const i = build(zone({ soilMoisturePct: 45 }), TREND({ direction: 'falling', deltaPct: -4 }));
    expect(i.action).toBe('monitor');
  });

  // 3. Falling near the lower boundary → check_today
  it('near the lower boundary and drying recommends check_today', () => {
    const i = build(zone({ soilMoisturePct: 40 }), TREND({ direction: 'falling', deltaPct: -5 }));
    expect(i.action).toBe('check_today');
    expect(i.severity).toBe('attention');
  });

  // 4 + 5. Stale / disconnected → check_sensor
  it('stale reading produces check_sensor', () => {
    const i = build(zone({ timestamp: iso(-60 * 60_000) }), TREND());
    expect(i.action).toBe('check_sensor');
    expect(i.confidence).toBe('low');
  });

  it('disconnected sensor produces check_sensor', () => {
    const i = build(zone({ soilMoistureStatus: 'not_connected', soilMoisturePct: null }), TREND());
    expect(i.action).toBe('check_sensor');
    expect(i.severity).toBe('unknown');
  });

  // 6. No plant → general guidance + limitation
  it('no plant assignment gives general guidance and a limitation', () => {
    const i = build(zone({ assignedPlant: null, assignedPlantProfile: null, soilMoisturePct: 15 }), TREND());
    expect(i.action).toBe('water_soon');
    expect(i.plantName).toBeUndefined();
    expect(i.limitations.some((l) => /no plant/i.test(l))).toBe(true);
  });
});

// ─── 7 + 8. Confidence ───────────────────────────────────────────────────────
describe('confidence', () => {
  it('missing history lowers confidence below high', () => {
    const i = build(zone({ soilMoisturePct: 45 }), TREND({ direction: 'unknown', deltaPct: null, sampleCount: 0 }));
    expect(i.confidence).not.toBe('high');
  });

  it('strong evidence (plant + history + clear) yields high confidence', () => {
    const i = build(zone({ soilMoisturePct: 18 }), TREND({ direction: 'falling', deltaPct: -8, sampleCount: 6 }));
    expect(i.confidence).toBe('high');
  });

  it('no plant caps confidence at low', () => {
    const i = build(zone({ assignedPlant: null, assignedPlantProfile: null, soilMoisturePct: 50 }), TREND({ sampleCount: 6 }));
    expect(i.confidence).toBe('low');
  });
});

// ─── 9–12. Explanations / evidence / limitations / no litres ─────────────────
describe('explainability & constraints', () => {
  it('every actionable insight has reasons and evidence', () => {
    const cases = [
      build(zone({ soilMoisturePct: 18 }), TREND({ direction: 'falling', deltaPct: -8 })),
      build(zone({ soilMoisturePct: 45 }), TREND()),
      build(zone({ soilMoisturePct: 40 }), TREND({ direction: 'falling', deltaPct: -5 })),
    ];
    for (const i of cases) {
      expect(i.reasons.length).toBeGreaterThan(0);
      expect(i.evidence.length).toBeGreaterThan(0);
    }
  });

  it('missing data appears in limitations (no history)', () => {
    const i = build(zone({ soilMoisturePct: 45 }), TREND({ direction: 'unknown', deltaPct: null, sampleCount: 0 }));
    expect(i.limitations.some((l) => /history/i.test(l))).toBe(true);
  });

  it('never generates delivered litres/volume in any field', () => {
    const i = build(zone({ soilMoisturePct: 18 }), TREND({ direction: 'falling', deltaPct: -8 }), NOW - 2 * 86_400_000);
    const blob = JSON.stringify(i).toLowerCase();
    expect(blob).not.toContain('litre');
    expect(blob).not.toContain('liter');
    expect(blob).not.toContain(' ml');
    // The one place volume is referenced is the honest limitation:
    expect(i.limitations.some((l) => /not measured/i.test(l))).toBe(true);
  });

  it('explanations do not claim certainty', () => {
    const texts = [
      build(zone({ soilMoisturePct: 18 }), TREND({ direction: 'falling', deltaPct: -8 })),
      build(zone({ soilMoisturePct: 45 }), TREND()),
    ]
      .map((i) => `${i.explanation} ${i.summary}`.toLowerCase())
      .join(' ');
    expect(texts).not.toMatch(/guarantee|definitely|certainly|will definitely|proven/);
  });
});

// ─── 13–15. Summary ───────────────────────────────────────────────────────────
describe('greenhouse summary', () => {
  const urgent = build(zone({ displayLabel: 'Bed 7', soilMoisturePct: 18 }), TREND({ direction: 'falling', deltaPct: -8 }));
  const sensor = build(zone({ displayLabel: 'Bed 4', timestamp: iso(-60 * 60_000) }), TREND());
  const good = build(zone({ displayLabel: 'Bed 2', soilMoisturePct: 45 }), TREND());

  it('prioritizes urgent zones in the summary', () => {
    const s = summarizeGreenhouse([good, sensor, urgent]);
    expect(s.top[0].severity).toBe('urgent');
    expect(s.headline.toLowerCase()).toContain('attention');
  });

  it('mentions sensor issues in the summary', () => {
    const s = summarizeGreenhouse([good, sensor]);
    expect(s.headline.toLowerCase()).toMatch(/sensor/);
  });

  it('summary stays concise (<= 3 sentences)', () => {
    const s = summarizeGreenhouse([urgent, sensor, good]);
    const sentenceCount = s.headline.split('. ').filter(Boolean).length;
    expect(sentenceCount).toBeLessThanOrEqual(3);
  });

  it('all-good greenhouse reports positively', () => {
    const s = summarizeGreenhouse([good]);
    expect(s.headline.toLowerCase()).toMatch(/within|preferred|range/);
    expect(s.counts.good).toBe(1);
  });
});

// ─── computeZoneTrends + buildAllZoneInsights integration ─────────────────────
describe('history-derived trend', () => {
  it('computes a falling trend from reading history via canonical id', () => {
    const readings: LatestReading[] = [
      { greenhouse_id: 'g', timestamp: iso(-5 * 60_000), zones: [{ zone_id: 'SYD-GH-RIGHT-01', soil_moisture_pct: 50, soil_moisture_status: 'ok' }] },
      { greenhouse_id: 'g', timestamp: iso(-1 * 60_000), zones: [{ zone_id: 'SYD-GH-RIGHT-01', soil_moisture_pct: 40, soil_moisture_status: 'ok' }] },
    ] as LatestReading[];
    const trends = computeZoneTrends(readings, NOW);
    const t = trends.get('SYD-INSIDE-RIGHT-01'); // legacy id resolves to canonical
    expect(t?.direction).toBe('falling');
    expect(t?.sampleCount).toBe(2);
  });

  it('buildAllZoneInsights skips never-connected empty beds', () => {
    const insights = buildAllZoneInsights({
      greenhouseId: 'g',
      zones: [zone(), zone({ id: 'empty', hasReading: false })],
      historyReadings: [],
      activities: [],
      now: NOW,
    });
    expect(insights.length).toBe(1);
  });
});

// ─── 16 + 17. Feedback scoping + dedup ────────────────────────────────────────
describe('AI feedback identity', () => {
  it('is greenhouse-scoped and stable (idempotent → no duplicates)', () => {
    const a = aiFeedbackDocId({ greenhouseId: 'gh1', insightType: 'zone_recommendation', zoneId: 'SYD-INSIDE-RIGHT-01', userId: 'u1' });
    const b = aiFeedbackDocId({ greenhouseId: 'gh1', insightType: 'zone_recommendation', zoneId: 'SYD-INSIDE-RIGHT-01', userId: 'u1' });
    expect(a).toBe(b);
    expect(a).toContain('gh1');
  });

  it('differs across greenhouses, zones, users, and insight types', () => {
    const base = { insightType: 'zone_recommendation' as const, zoneId: 'z1', userId: 'u1' };
    expect(aiFeedbackDocId({ ...base, greenhouseId: 'gh1' })).not.toBe(aiFeedbackDocId({ ...base, greenhouseId: 'gh2' }));
    expect(aiFeedbackDocId({ greenhouseId: 'gh1', ...base })).not.toBe(aiFeedbackDocId({ greenhouseId: 'gh1', ...base, zoneId: 'z2' }));
    expect(aiFeedbackDocId({ greenhouseId: 'gh1', ...base })).not.toBe(aiFeedbackDocId({ greenhouseId: 'gh1', ...base, userId: 'u2' }));
    expect(aiFeedbackDocId({ greenhouseId: 'gh1', insightType: 'greenhouse_summary', userId: 'u1' }))
      .not.toBe(aiFeedbackDocId({ greenhouseId: 'gh1', insightType: 'zone_recommendation', userId: 'u1' }));
  });
});

// ─── 18. Shared utilities still importable (no breakage of existing modules) ──
describe('existing module integrity', () => {
  it('reuses resolveZoneId + existing types without redefining them', () => {
    const i: ZoneAIInsight = build(zone(), TREND());
    expect(i.zoneId).toBe('SYD-INSIDE-RIGHT-01');
    expect(i.insightVersion).toBe('greenmirror-ai-v1');
  });
});
