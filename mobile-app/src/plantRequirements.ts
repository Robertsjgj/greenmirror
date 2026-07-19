export type PlantProfileSource =
  | 'greenmirror_spreadsheet'
  | 'alias_match'
  | 'provisional_estimate'
  | 'custom';

export interface PlantRequirementProfile {
  id: string;
  canonicalName: string;
  aliases: string[];
  moistureMin: number;
  moistureMax: number;
  soilTempMin: number;
  soilTempMax: number;
  preferredSoilTempMin?: number;
  preferredSoilTempMax?: number;
  toleratedSoilTempMin?: number;
  toleratedSoilTempMax?: number;
  sandySoilVwcMin?: number;
  sandySoilVwcMax?: number;
  loamSoilVwcMin?: number;
  loamSoilVwcMax?: number;
  claySoilVwcMin?: number;
  claySoilVwcMax?: number;
  profileSource: PlantProfileSource;
  sourcePlantName?: string;
  requiresUserReview: boolean;
  notes?: string[];
  provisionalBasis?: string;
  provisionalReason?: string;
}

type Row = [string, string, string[], number, number, number, number, number, number, number, number, number, number, string[]?];

function spreadsheetProfile(row: Row): PlantRequirementProfile {
  const [id, canonicalName, aliases, moistureMin, moistureMax, soilTempMin, soilTempMax,
    sandySoilVwcMin, sandySoilVwcMax, loamSoilVwcMin, loamSoilVwcMax,
    claySoilVwcMin, claySoilVwcMax, notes] = row;
  return {
    id, canonicalName, aliases, moistureMin, moistureMax, soilTempMin, soilTempMax,
    sandySoilVwcMin, sandySoilVwcMax, loamSoilVwcMin, loamSoilVwcMax,
    claySoilVwcMin, claySoilVwcMax, profileSource: 'greenmirror_spreadsheet',
    sourcePlantName: canonicalName, requiresUserReview: false, notes,
  };
}

/** Exact rows imported from GreenMirror Plants.xlsx (cross-checked with its CSV export). */
export const PLANT_REQUIREMENTS: readonly PlantRequirementProfile[] = [
  spreadsheetProfile(['bell-peppers', 'Bell peppers', ['bell pepper', 'bell peppers', 'pepper', 'peppers'], 66, 100, 18, 35, 13.8, 20, 26.3, 40, 33.8, 50]),
  { ...spreadsheetProfile(['tomatoes', 'Tomatoes', ['tomato', 'tomatoes'], 66, 100, 16, 35, 13.8, 20, 26.3, 40, 33.8, 50, ['21–29°C preferred; 16–35°C tolerated.']]), preferredSoilTempMin: 21, preferredSoilTempMax: 29, toleratedSoilTempMin: 16, toleratedSoilTempMax: 35 },
  spreadsheetProfile(['lettuce', 'Lettuce', ['lettuce', 'lettuces'], 73, 100, 4, 27, 15, 20, 29, 40, 37, 50]),
  { ...spreadsheetProfile(['cabbage', 'Cabbage', ['cabbage', 'cabbages'], 73, 100, 7, 29, 15, 20, 29, 40, 37, 50, ['7–29°C is identified as preferred.']]), preferredSoilTempMin: 7, preferredSoilTempMax: 29 },
  spreadsheetProfile(['carrots', 'Carrots', ['carrot', 'carrots'], 66, 100, 7, 29, 13.8, 20, 26.3, 40, 33.8, 50]),
  spreadsheetProfile(['beets', 'Beets', ['beet', 'beets'], 47, 100, 10, 29, 10, 20, 18, 40, 24, 50]),
  spreadsheetProfile(['corn', 'Corn', ['corn', 'sweet corn'], 66, 100, 16, 35, 13.8, 20, 26.3, 40, 33.8, 50]),
  spreadsheetProfile(['cucumbers', 'Cucumbers', ['cucumber', 'cucumbers'], 66, 100, 16, 35, 13.8, 20, 26.3, 40, 33.8, 50]),
  spreadsheetProfile(['summer-squash', 'Squash, summer', ['summer squash', 'squash summer'], 80, 100, 21, 35, 16.3, 20, 31.8, 40, 40.3, 50]),
  spreadsheetProfile(['winter-squash', 'Squash, winter', ['winter squash', 'squash winter'], 61, 100, 21, 35, 12.5, 20, 23.5, 40, 30.5, 50]),
  spreadsheetProfile(['hungarian-peppers', 'Hungarian peppers', ['hungarian pepper', 'hungarian peppers'], 66, 100, 18, 35, 13.8, 20, 26.3, 40, 33.8, 50]),
  spreadsheetProfile(['parsley', 'Parsley', ['parsley'], 66, 100, 10, 29, 13.8, 20, 26.3, 40, 33.8, 50]),
  spreadsheetProfile(['kale', 'Kale', ['kale'], 80, 100, 7, 29, 16.3, 20, 31.8, 40, 40.3, 50]),
  spreadsheetProfile(['cauliflower', 'Cauliflower', ['cauliflower'], 73, 100, 7, 29, 15, 20, 29, 40, 37, 50]),
  { ...spreadsheetProfile(['onions', 'Onions', ['onion', 'onions'], 80, 100, 10, 29, 16.3, 20, 31.8, 40, 40.3, 50, ['10–29°C is identified as preferred.']]), preferredSoilTempMin: 10, preferredSoilTempMax: 29 },
  spreadsheetProfile(['strawberries', 'Strawberries', ['strawberry', 'strawberries'], 50, 100, 10, 26, 10, 20, 20, 40, 25, 50, ['The spreadsheet qualifies 50–100% as a minimum sensor range.']]),
  spreadsheetProfile(['broccoli', 'Broccoli', ['broccoli'], 80, 100, 7, 29, 16.3, 20, 31.8, 40, 40.3, 50]),
  spreadsheetProfile(['radishes', 'Radishes', ['radish', 'radishes'], 80, 100, 7, 32, 16.3, 20, 31.8, 40, 40.3, 50]),
  spreadsheetProfile(['watermelon', 'Watermelon', ['watermelon', 'watermelons'], 61, 100, 21, 35, 12.5, 20, 23.5, 40, 30.5, 50]),
  spreadsheetProfile(['zucchini', 'Zucchini', ['zucchini', 'courgette', 'courgettes'], 80, 100, 21, 35, 16.3, 20, 31.8, 40, 40.3, 50]),
  spreadsheetProfile(['eggplants', 'Eggplants', ['eggplant', 'eggplants', 'aubergine', 'aubergines'], 66, 100, 24, 32, 13.8, 20, 26.3, 40, 33.8, 50]),
  spreadsheetProfile(['garlic', 'Garlic', ['garlic'], 80, 100, 10, 24, 16.3, 20, 31.8, 40, 40.3, 50, ['~10°C for fall planting; 10–24°C active growth.', 'Use 80–100% during growth; reduce moisture before harvest.']]),
  spreadsheetProfile(['pumpkin-patches', 'Pumpkin patches', ['pumpkin', 'pumpkins', 'pumpkin patch', 'pumpkin patches'], 61, 100, 21, 32, 12.5, 20, 23.5, 40, 30.5, 50]),
] as const;

export const FIELD_CAPACITY_UPPER_TOLERANCE_PCT = 110;
export const MAX_PLAUSIBLE_SENSOR_PCT = 150;
export type MoistureTargetStatus = 'below_target' | 'within_target' | 'above_target_tolerated' | 'too_wet' | 'sensor_check';

export function normalizeRequirementName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[,_-]+/g, ' ').replace(/\s+/g, ' ');
}

const requirementsByAlias = new Map<string, PlantRequirementProfile>();
for (const profile of PLANT_REQUIREMENTS) {
  for (const alias of [profile.canonicalName, ...profile.aliases]) {
    requirementsByAlias.set(normalizeRequirementName(alias), profile);
  }
}

export function findPlantRequirementByName(value: string): PlantRequirementProfile | null {
  return requirementsByAlias.get(normalizeRequirementName(value)) ?? null;
}

const ICON_REQUIREMENT_IDS: Readonly<Record<string, string>> = {
  tomato: 'tomatoes', pepper: 'bell-peppers', carrot: 'carrots', lettuce: 'lettuce', kale: 'kale',
  cucumber: 'cucumbers', onion: 'onions', strawberry: 'strawberries', broccoli: 'broccoli', corn: 'corn',
  eggplant: 'eggplants', garlic: 'garlic', watermelon: 'watermelon', pumpkin: 'pumpkin-patches',
  // 🫑 sweet pepper / capsicum is the same crop as the workbook's Bell peppers.
  'sweet-pepper': 'bell-peppers',
};

export function findPlantRequirementByIcon(iconId: string): PlantRequirementProfile | null {
  const requirementId = ICON_REQUIREMENT_IDS[iconId];
  return requirementId ? PLANT_REQUIREMENTS.find((profile) => profile.id === requirementId) ?? null : null;
}

const PROVISIONAL_CATEGORIES: Readonly<Record<string, { basedOn: string; reason: string }>> = {
  spinach: { basedOn: 'lettuce', reason: 'Spinach is explicitly configured in the leafy-greens category, using Lettuce only as a conservative starting reference.' },
};

export function findProvisionalPlantRequirement(value: string): PlantRequirementProfile | null {
  const match = PROVISIONAL_CATEGORIES[normalizeRequirementName(value)];
  if (!match) return null;
  const basis = PLANT_REQUIREMENTS.find((profile) => profile.id === match.basedOn);
  if (!basis) return null;
  return {
    ...basis,
    id: `provisional-${normalizeRequirementName(value).replace(/\s+/g, '-')}`,
    canonicalName: value.trim(), aliases: [value.trim()], profileSource: 'provisional_estimate',
    sourcePlantName: basis.canonicalName, requiresUserReview: true,
    provisionalBasis: basis.canonicalName, provisionalReason: match.reason,
    notes: [
      match.reason,
      'This plant is not in the current GreenMirror plant table. Review the values before using them for guidance.',
    ],
  };
}

export function classifyMoistureAgainstTarget(value: unknown, min: number, max: number): MoistureTargetStatus {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_PLAUSIBLE_SENSOR_PCT || min > max) return 'sensor_check';
  if (value < min) return 'below_target';
  if (value <= max) return 'within_target';
  if (value <= FIELD_CAPACITY_UPPER_TOLERANCE_PCT) return 'above_target_tolerated';
  return 'too_wet';
}

export function moistureChartCeiling(values: Array<number | null | undefined>): number {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return Math.max(FIELD_CAPACITY_UPPER_TOLERANCE_PCT, Math.ceil(((Math.max(100, ...valid) + 5) / 10)) * 10);
}

export function moistureChartBands(profile: { moistureMin: number; moistureMax: number }) {
  return {
    target: { from: profile.moistureMin, to: profile.moistureMax, label: 'Target range' },
    tolerance: { from: profile.moistureMax, to: FIELD_CAPACITY_UPPER_TOLERANCE_PCT, label: 'Above target — monitor' },
  } as const;
}

export function requirementRangesMatch(profile: { moistureMin?: number; moistureMax?: number; soilTempMin?: number; soilTempMax?: number }, requirement: PlantRequirementProfile): boolean {
  return profile.moistureMin === requirement.moistureMin && profile.moistureMax === requirement.moistureMax
    && profile.soilTempMin === requirement.soilTempMin && profile.soilTempMax === requirement.soilTempMax;
}
