/**
 * The AI estimate is the one place GreenMirror produces a number that did not
 * come from the workbook or the user. These tests pin down what it is allowed
 * to produce — and, more importantly, what it must refuse to produce.
 */

import { describe, expect, it } from 'vitest';
import { validateAiPlantProfile, workbookAnchorTable, type AiProfileCandidate } from './plantAiProfile';
import { classifyMoistureAgainstTarget } from './plantRequirements';

function candidate(overrides: Partial<AiProfileCandidate> = {}): AiProfileCandidate {
  return {
    recognized: true,
    canonicalName: 'Potatoes',
    basedOn: 'carrots',
    rationale: 'Potatoes are a root crop with similar soil-moisture needs to carrots.',
    moistureMin: 60,
    moistureMax: 95,
    soilTempMin: 10,
    soilTempMax: 24,
    limitations: 'Estimated from general growing guides, not from this greenhouse.',
    sources: [{ title: 'RHS — Potatoes', url: 'https://www.rhs.org.uk/vegetables/potatoes' }],
    ...overrides,
  };
}

describe('AI plant profile estimation', () => {
  it('accepts a sourced estimate anchored to a workbook plant', () => {
    const result = validateAiPlantProfile(candidate(), 'potato');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.profile).toMatchObject({
      canonicalName: 'Potatoes',
      moistureMin: 60,
      moistureMax: 95,
      soilTempMin: 10,
      soilTempMax: 24,
      profileSource: 'provisional_estimate',
      sourcePlantName: 'Carrots',
      requiresUserReview: true,
    });
    expect(result.value.sources[0].url).toBe('https://www.rhs.org.uk/vegetables/potatoes');
  });

  it('always requires user review and never claims to be verified', () => {
    const result = validateAiPlantProfile(candidate(), 'potato');
    if (!result.ok) throw new Error('expected a valid estimate');
    expect(result.value.profile.requiresUserReview).toBe(true);
    expect(JSON.stringify(result.value)).not.toMatch(/verified|scientifically validated|confirmed/i);
    expect(result.value.profile.notes?.join(' ')).toContain('Review these values before using them');
  });

  it('rejects an estimate that is not anchored to a plant GreenMirror already has', () => {
    expect(validateAiPlantProfile(candidate({ basedOn: 'dragonfruit' }), 'x'))
      .toEqual({ ok: false, reason: 'no_anchor_plant' });
    expect(validateAiPlantProfile(candidate({ basedOn: '' }), 'x'))
      .toEqual({ ok: false, reason: 'no_anchor_plant' });
  });

  it('rejects an ungrounded estimate — no real source, no profile', () => {
    expect(validateAiPlantProfile(candidate({ sources: [] }), 'x'))
      .toEqual({ ok: false, reason: 'no_sources' });
    // A fabricated, non-http "source" is not a source.
    expect(validateAiPlantProfile(candidate({ sources: [{ title: 'General knowledge', url: 'n/a' }] }), 'x'))
      .toEqual({ ok: false, reason: 'no_sources' });
  });

  it('rejects a moisture range that leaves the GreenMirror sensor scale', () => {
    // 100 is field capacity — a target range never sits above it.
    expect(validateAiPlantProfile(candidate({ moistureMax: 110 }), 'x'))
      .toEqual({ ok: false, reason: 'implausible_moisture' });
    expect(validateAiPlantProfile(candidate({ moistureMin: 80, moistureMax: 60 }), 'x'))
      .toEqual({ ok: false, reason: 'implausible_moisture' });
    expect(validateAiPlantProfile(candidate({ moistureMin: 'wet' }), 'x'))
      .toEqual({ ok: false, reason: 'implausible_moisture' });
  });

  it('rejects an implausible soil temperature', () => {
    expect(validateAiPlantProfile(candidate({ soilTempMax: 90 }), 'x'))
      .toEqual({ ok: false, reason: 'implausible_temperature' });
    expect(validateAiPlantProfile(candidate({ soilTempMin: 30, soilTempMax: 20 }), 'x'))
      .toEqual({ ok: false, reason: 'implausible_temperature' });
  });

  it('accepts the model saying it does not know, rather than inventing a plant', () => {
    expect(validateAiPlantProfile(candidate({ recognized: false }), 'asdfgh'))
      .toEqual({ ok: false, reason: 'not_recognized' });
  });

  it('produces a range the rest of the app classifies the same way as a workbook range', () => {
    const result = validateAiPlantProfile(candidate(), 'potato');
    if (!result.ok) throw new Error('expected a valid estimate');
    const { moistureMin, moistureMax } = result.value.profile;
    expect(classifyMoistureAgainstTarget(50, moistureMin, moistureMax)).toBe('below_target');
    expect(classifyMoistureAgainstTarget(80, moistureMin, moistureMax)).toBe('within_target');
    expect(classifyMoistureAgainstTarget(105, moistureMin, moistureMax)).toBe('above_target_tolerated');
    expect(classifyMoistureAgainstTarget(120, moistureMin, moistureMax)).toBe('too_wet');
  });
});

describe('the anchor table given to the model', () => {
  it('hands over every workbook plant with its GreenMirror scale', () => {
    const table = workbookAnchorTable();
    expect(table.split('\n')).toHaveLength(23);
    expect(table).toContain('tomatoes | Tomatoes | loam VWC 26.3-40% -> GreenMirror moisture 66-100% | soil temp 16-35C');
    expect(table).toContain('bell-peppers | Bell peppers | loam VWC 26.3-40% -> GreenMirror moisture 66-100% | soil temp 18-35C');
  });

  it('pairs each plant\'s loam VWC with its GreenMirror range, so the model translates rather than copies', () => {
    const table = workbookAnchorTable();
    // Every row must carry the VWC -> GreenMirror mapping that is the whole point.
    for (const row of table.split('\n')) {
      expect(row).toMatch(/loam VWC .+ -> GreenMirror moisture \d+-\d+%/);
    }
  });
});
