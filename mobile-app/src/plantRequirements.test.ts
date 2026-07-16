import { describe, expect, it } from 'vitest';
import { autofillPlantIcon, autofillPlantName } from './plantProfileAutofill';
import { normalizeExistingProfileWithRequirements } from './plantProfiles';
import { moistureStatus, statusOf } from './components/trends/trendsModel';
import type { PlantLite } from './components/trends/trendsModel';
import { computeMoistureBaseline } from './services/wateringVerificationCore';
import type { LatestReading } from './zoneLayout';
import {
  FIELD_CAPACITY_UPPER_TOLERANCE_PCT,
  PLANT_REQUIREMENTS,
  classifyMoistureAgainstTarget,
  findPlantRequirementByIcon,
  findPlantRequirementByName,
  findProvisionalPlantRequirement,
  moistureChartBands,
  moistureChartCeiling,
} from './plantRequirements';

// Tomatoes, straight from the workbook: target 66–100%, so 100 is field
// capacity and 101–110 is the tolerated wet side.
const TOMATO_LITE: PlantLite = { id: 'tomato', name: 'Tomatoes', icon: '🍅', moistureMin: 66, moistureMax: 100 };

describe('Trends uses the shared wet-side tolerance', () => {
  it('never calls a reading above the saved maximum "Good"', () => {
    expect(statusOf(101, TOMATO_LITE).label).not.toBe('Good');
    expect(statusOf(130, TOMATO_LITE).label).not.toBe('Good');
    expect(statusOf(100, TOMATO_LITE).label).toBe('Good'); // 100 is still within target
  });

  it('separates the tolerated wet side (101–110) from too wet (>110)', () => {
    expect(moistureStatus(106, TOMATO_LITE).label).toBe('Above target');
    expect(moistureStatus(110, TOMATO_LITE).label).toBe('Above target');
    expect(moistureStatus(111, TOMATO_LITE).label).toBe('Too wet');
    // Both are things to watch, never "healthy".
    expect(statusOf(106, TOMATO_LITE).kind).toBe('wet');
    expect(statusOf(111, TOMATO_LITE).kind).toBe('wet');
  });

  it('flags an implausible reading as a sensor check rather than healthy', () => {
    expect(moistureStatus(999, TOMATO_LITE).label).toBe('Check sensor');
    expect(statusOf(999, TOMATO_LITE).kind).not.toBe('healthy');
  });

  it('still reports dry beds below the workbook minimum', () => {
    expect(statusOf(60, TOMATO_LITE).kind).toBe('need'); // below the 66% minimum
    expect(statusOf(80, TOMATO_LITE).kind).toBe('healthy');
  });
});

describe('watering baseline honours the wet-side tolerance', () => {
  const CANONICAL = 'SYD-INSIDE-RIGHT-01';
  const NOW = Date.parse('2026-07-14T12:00:00.000Z');
  const reading = (msAgo: number, pct: number | null): LatestReading => ({
    greenhouse_id: 'gh-1',
    timestamp: new Date(NOW - msAgo).toISOString(),
    zones: [{ zone_id: CANONICAL, soil_moisture_pct: pct }],
  }) as LatestReading;

  it('accepts a reading above field capacity — soil is wettest right after watering', () => {
    const b = computeMoistureBaseline({
      canonicalZoneId: CANONICAL, recentReadings: [reading(60_000, 106)], latestReading: null, now: NOW,
    });
    expect(b.baselineMoisture).toBe(106);
    expect(b.baselineSource).toBe('recent_history_median');
  });

  it('still rejects an implausible reading', () => {
    const b = computeMoistureBaseline({
      canonicalZoneId: CANONICAL, recentReadings: [reading(60_000, 999)], latestReading: null, now: NOW,
    });
    expect(b.baselineSource).toBe('unavailable');
  });
});

describe('sweet pepper icon', () => {
  it('loads the Bell peppers profile for the capsicum icon', () => {
    expect(findPlantRequirementByIcon('sweet-pepper')).toMatchObject({
      canonicalName: 'Bell peppers', moistureMin: 66, moistureMax: 100, soilTempMin: 18, soilTempMax: 35,
    });
  });
});

describe('GreenMirror spreadsheet plant requirements', () => {
  it('imports every spreadsheet plant', () => expect(PLANT_REQUIREMENTS).toHaveLength(23));

  it('parses Bell peppers exactly', () => {
    const profile = findPlantRequirementByName('pepper');
    expect(profile).toMatchObject({ canonicalName: 'Bell peppers', moistureMin: 66, moistureMax: 100, soilTempMin: 18, soilTempMax: 35 });
  });

  it('preserves Tomatoes preferred and tolerated temperatures', () => {
    expect(findPlantRequirementByName('tomatoes')).toMatchObject({
      moistureMin: 66, moistureMax: 100, soilTempMin: 16, soilTempMax: 35,
      preferredSoilTempMin: 21, preferredSoilTempMax: 29,
      toleratedSoilTempMin: 16, toleratedSoilTempMax: 35,
    });
  });

  it('parses Lettuce exactly', () => {
    expect(findPlantRequirementByName('lettuce')).toMatchObject({ moistureMin: 73, moistureMax: 100, soilTempMin: 4, soilTempMax: 27 });
  });

  it('preserves Garlic active-growth, fall-planting, and harvest qualifications', () => {
    const garlic = findPlantRequirementByName('garlic');
    expect(garlic).toMatchObject({ moistureMin: 80, moistureMax: 100, soilTempMin: 10, soilTempMax: 24 });
    expect(garlic?.notes?.join(' ')).toMatch(/fall planting/i);
    expect(garlic?.notes?.join(' ')).toMatch(/reduce moisture before harvest/i);
  });

  it.each([['tomato', 'Tomatoes'], ['tomatoes', 'Tomatoes'], ['pepper', 'Bell peppers'], ['bell peppers', 'Bell peppers'], ['carrot', 'Carrots'], ['carrots', 'Carrots']])(
    'resolves alias %s to %s', (alias, expected) => expect(findPlantRequirementByName(alias)?.canonicalName).toBe(expected),
  );

  it('keeps soil-type VWC metadata separate from sensor targets', () => {
    const peppers = findPlantRequirementByName('pepper');
    expect(peppers).toMatchObject({ moistureMin: 66, sandySoilVwcMin: 13.8, loamSoilVwcMin: 26.3, claySoilVwcMin: 33.8 });
    expect(peppers?.moistureMin).not.toBe(peppers?.sandySoilVwcMin);
  });

  it('marks spreadsheet profiles as reviewed source data', () => {
    expect(PLANT_REQUIREMENTS.every((profile) => profile.profileSource === 'greenmirror_spreadsheet' && !profile.requiresUserReview)).toBe(true);
  });
});

describe('automatic profile filling and migration', () => {
  const empty = { name: '', icon: '🪴' };

  it('typing a known name selects its icon and fills exact ranges', () => {
    expect(autofillPlantName(empty, ' tomatoes ', false).draft).toMatchObject({ name: 'Tomatoes', moistureMin: 66, moistureMax: 100, soilTempMin: 16, soilTempMax: 35 });
  });

  it('selecting a known icon fills canonical name and ranges', () => {
    expect(autofillPlantIcon(empty, 'pepper', false).draft).toMatchObject({ name: 'Bell peppers', moistureMin: 66, moistureMax: 100, soilTempMin: 18, soilTempMax: 35 });
  });

  it('does not silently overwrite user-edited ranges', () => {
    const edited = { name: 'My crop', moistureMin: 12, moistureMax: 34, soilTempMin: 5, soilTempMax: 20 };
    const result = autofillPlantName(edited, 'tomatoes', true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.draft).toMatchObject({ moistureMin: 12, moistureMax: 34, soilTempMin: 5, soilTempMax: 20 });
  });

  it('switches untouched auto-filled values to the new plant', () => {
    const tomato = autofillPlantName(empty, 'tomatoes', false).draft;
    expect(autofillPlantName(tomato, 'lettuce', false).draft).toMatchObject({ moistureMin: 73, moistureMax: 100, soilTempMin: 4, soilTempMax: 27 });
  });

  it('creates a labelled provisional profile only for an explicit category match', () => {
    expect(findProvisionalPlantRequirement('spinach')).toMatchObject({ profileSource: 'provisional_estimate', requiresUserReview: true, provisionalBasis: 'Lettuce' });
    expect(findProvisionalPlantRequirement('mystery herb')).toBeNull();
    expect(autofillPlantName(empty, 'mystery herb', false).draft).toMatchObject({ moistureMin: undefined, moistureMax: undefined, soilTempMin: undefined, soilTempMax: undefined });
  });

  it('preserves existing manual overrides while identifying exact defaults', () => {
    const manual = normalizeExistingProfileWithRequirements({ name: 'Tomatoes', moistureMin: 40, moistureMax: 70, soilTempMin: 15, soilTempMax: 30 });
    expect(manual).toMatchObject({ moistureMin: 40, moistureMax: 70, profileSource: 'custom' });
    const exact = normalizeExistingProfileWithRequirements({ name: 'Tomatoes', moistureMin: 66, moistureMax: 100, soilTempMin: 16, soilTempMax: 35 });
    expect(exact.profileSource).toBe('greenmirror_spreadsheet');
  });
});

describe('field-capacity tolerance and chart behavior', () => {
  it('classifies target and wet-side readings separately', () => {
    expect(FIELD_CAPACITY_UPPER_TOLERANCE_PCT).toBe(110);
    expect(classifyMoistureAgainstTarget(100, 66, 100)).toBe('within_target');
    expect(classifyMoistureAgainstTarget(101, 66, 100)).toBe('above_target_tolerated');
    expect(classifyMoistureAgainstTarget(110, 66, 100)).toBe('above_target_tolerated');
    expect(classifyMoistureAgainstTarget(111, 66, 100)).toBe('too_wet');
    expect(classifyMoistureAgainstTarget(999, 66, 100)).toBe('sensor_check');
  });

  it('keeps the green target band at the saved maximum', () => {
    const bands = moistureChartBands({ moistureMin: 66, moistureMax: 100 });
    expect(bands.target).toMatchObject({ from: 66, to: 100 });
    expect(bands.tolerance).toMatchObject({ from: 100, to: 110, label: 'Above target — monitor' });
  });

  it('keeps readings above 100 visible with a dynamic ceiling', () => {
    expect(moistureChartCeiling([95, 106])).toBeGreaterThanOrEqual(110);
    expect(moistureChartCeiling([118])).toBeGreaterThan(118);
  });
});
