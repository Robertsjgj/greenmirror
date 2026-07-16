/**
 * The grounding contract for the Greenhouse Health "Explain with AI" button.
 *
 * The prompt is the only thing the model may lean on, so these tests pin that
 * every fact reaches it and nothing invites invention, and that the cache
 * signature is stable for an unchanged state but moves when the state does.
 */

import { describe, expect, it } from 'vitest';
import {
  buildHealthPrompt, healthSignature, HEALTH_OUTPUT_SCHEMA, type HealthSnapshot,
} from './healthExplain';

const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  rangeLabel: 'today',
  counts: { healthy: 1, watching: 1, need: 4 },
  prevCounts: { healthy: 2, watching: 1, need: 3 },
  avgMoisture: 48,
  avgTemp: 22.5,
  moistureDelta: -6,
  tempDelta: 1.5,
  totalZones: 6,
  zones: [
    { label: 'Greenhouse Bed 6', status: 'need', statusLabel: 'Needs water', moisture: 31, temp: 23, plant: 'Tomato', trend: 'Getting drier' },
    { label: 'Greenhouse Bed 1', status: 'healthy', statusLabel: 'Good', moisture: 62, temp: 22, plant: null, trend: 'Stable' },
  ],
  ...over,
});

describe('buildHealthPrompt', () => {
  it('hands the model every fact it is allowed to use', () => {
    const p = buildHealthPrompt(snapshot());
    expect(p).toContain('1 healthy, 1 to monitor, 4 needing attention');
    expect(p).toContain('Yesterday: 2 healthy, 1 to monitor, 3 needing attention');
    expect(p).toContain('Average soil moisture: 48% (-6% today)');
    expect(p).toContain('Average soil temperature: 22.5°C');
    expect(p).toContain('Greenhouse Bed 6: Needs water (31% moisture, 23°C, Getting drier) — Tomato');
    expect(p).toContain('Greenhouse Bed 1: Good (62% moisture, 22°C, Stable) — no plant assigned');
  });

  it('forbids invented numbers and prescribed watering volumes', () => {
    const p = buildHealthPrompt(snapshot()).toLowerCase();
    expect(p).toContain('do not invent');
    expect(p).toContain('do not recommend a specific amount of water');
    expect(p).toContain('cannot measure how much water is applied by hose');
  });

  it('states plainly when there is no yesterday comparison or temperature', () => {
    const p = buildHealthPrompt(snapshot({ prevCounts: null, avgTemp: null, tempDelta: null }));
    expect(p).toContain('No comparison against yesterday is available');
    expect(p).toContain('Average soil temperature is not available');
  });
});

describe('healthSignature', () => {
  it('is identical for the same state regardless of bed ordering', () => {
    const a = snapshot();
    const b = snapshot({ zones: [...snapshot().zones].reverse() });
    expect(healthSignature(a)).toBe(healthSignature(b));
  });

  it('moves when the counts change', () => {
    expect(healthSignature(snapshot())).not.toBe(
      healthSignature(snapshot({ counts: { healthy: 2, watching: 1, need: 3 } })),
    );
  });

  it('moves when a bed changes status', () => {
    const other = snapshot();
    other.zones[0] = { ...other.zones[0], status: 'healthy', trend: 'Improving' };
    expect(healthSignature(snapshot())).not.toBe(healthSignature(other));
  });
});

describe('HEALTH_OUTPUT_SCHEMA', () => {
  it('requires every section the sheet renders', () => {
    expect(HEALTH_OUTPUT_SCHEMA.required).toEqual(
      expect.arrayContaining(['happening', 'why', 'basedOn', 'meaning', 'action', 'confidence', 'limitations']),
    );
  });
});
