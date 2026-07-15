/**
 * AI-estimated plant profiles — shared types and the validator.
 *
 * The workbook (`plantRequirements.ts`) is authoritative for the 23 plants it
 * contains. For anything else, GreenMirror asks Claude to research the plant on
 * the web and place it on the GreenMirror sensor scale by anchoring it to the
 * closest workbook crop. That estimate is NEVER treated as verified:
 *
 *  - it must name a workbook plant it was anchored to (no free-floating numbers);
 *  - it must cite at least one source it actually read;
 *  - it must fall inside the workbook's own scale (moisture max never above 100,
 *    which is field capacity);
 *  - it is always labelled "AI-estimated starting range — please review" and
 *    carries requiresUserReview, so the user confirms before it drives guidance.
 *
 * Anything that fails those checks is rejected and the user enters ranges by
 * hand. A rejected estimate is a better outcome than an invented one.
 *
 * This module is pure (no network, no Firebase) so the serverless endpoint and
 * the unit tests share exactly one validator.
 */

import { PLANT_REQUIREMENTS, normalizeRequirementName, type PlantRequirementProfile } from './plantRequirements';

/** Plausible soil-temperature bounds — the workbook's own range, with headroom. */
const SOIL_TEMP_FLOOR_C = -5;
const SOIL_TEMP_CEILING_C = 45;

export interface AiProfileSource {
  title: string;
  url: string;
}

/** The raw shape Claude is asked to return. Every field is treated as untrusted. */
export interface AiProfileCandidate {
  recognized?: unknown;
  canonicalName?: unknown;
  moistureMin?: unknown;
  moistureMax?: unknown;
  soilTempMin?: unknown;
  soilTempMax?: unknown;
  basedOn?: unknown;
  rationale?: unknown;
  limitations?: unknown;
  sources?: unknown;
}

export interface AiProfileResult {
  profile: PlantRequirementProfile;
  sources: AiProfileSource[];
}

export type AiProfileRejection =
  | 'not_recognized'
  | 'no_anchor_plant'
  | 'no_sources'
  | 'implausible_moisture'
  | 'implausible_temperature'
  | 'missing_name';

export type AiProfileValidation =
  | { ok: true; value: AiProfileResult }
  | { ok: false; reason: AiProfileRejection };

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Resolve the anchor the model claims it used to a real workbook plant. */
function resolveAnchor(value: unknown): PlantRequirementProfile | null {
  const key = normalizeRequirementName(text(value));
  if (!key) return null;
  return PLANT_REQUIREMENTS.find(
    (plant) => plant.id === key || normalizeRequirementName(plant.canonicalName) === key,
  ) ?? null;
}

function readSources(value: unknown): AiProfileSource[] {
  if (!Array.isArray(value)) return [];
  const out: AiProfileSource[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const url = text((entry as AiProfileSource).url);
    if (!/^https?:\/\/\S+$/i.test(url)) continue;
    out.push({ title: text((entry as AiProfileSource).title) || url, url });
  }
  return out;
}

/**
 * Turn a model response into a provisional profile, or say why it can't be used.
 * Rejection is always safe — the caller falls back to manual entry.
 */
export function validateAiPlantProfile(
  candidate: AiProfileCandidate,
  requestedName: string,
): AiProfileValidation {
  if (candidate.recognized === false) return { ok: false, reason: 'not_recognized' };

  const canonicalName = text(candidate.canonicalName) || text(requestedName);
  if (!canonicalName) return { ok: false, reason: 'missing_name' };

  // Must be anchored to a plant GreenMirror already has — that anchor is what
  // ties a web figure to this sensor's scale.
  const anchor = resolveAnchor(candidate.basedOn);
  if (!anchor) return { ok: false, reason: 'no_anchor_plant' };

  // Must have actually read something.
  const sources = readSources(candidate.sources);
  if (sources.length === 0) return { ok: false, reason: 'no_sources' };

  const { moistureMin, moistureMax, soilTempMin, soilTempMax } = candidate;
  // 100 is field capacity — the workbook never goes above it, so neither does an
  // estimate. The 110% wet-side tolerance is a reading allowance, not a target.
  if (!isInt(moistureMin) || !isInt(moistureMax)) return { ok: false, reason: 'implausible_moisture' };
  if (moistureMin < 0 || moistureMax > 100 || moistureMin >= moistureMax) {
    return { ok: false, reason: 'implausible_moisture' };
  }

  if (!isInt(soilTempMin) || !isInt(soilTempMax)) return { ok: false, reason: 'implausible_temperature' };
  if (soilTempMin < SOIL_TEMP_FLOOR_C || soilTempMax > SOIL_TEMP_CEILING_C || soilTempMin >= soilTempMax) {
    return { ok: false, reason: 'implausible_temperature' };
  }

  const rationale = text(candidate.rationale)
    || `Estimated from the closest GreenMirror crop, ${anchor.canonicalName}.`;
  const limitations = text(candidate.limitations)
    || 'This range was estimated from online sources and has not been verified against this greenhouse.';

  return {
    ok: true,
    value: {
      sources,
      profile: {
        id: `ai-${normalizeRequirementName(canonicalName).replace(/\s+/g, '-')}`,
        canonicalName,
        aliases: [canonicalName],
        moistureMin,
        moistureMax,
        soilTempMin,
        soilTempMax,
        profileSource: 'provisional_estimate',
        sourcePlantName: anchor.canonicalName,
        requiresUserReview: true,
        provisionalBasis: anchor.canonicalName,
        provisionalReason: rationale,
        notes: [
          rationale,
          limitations,
          `${canonicalName} is not in the GreenMirror plant table. Review these values before using them for guidance.`,
        ],
      },
    },
  };
}

/**
 * The workbook table handed to the model as its calibration reference.
 *
 * Each row pairs a plant's volumetric water content (VWC) in loam — a real,
 * soil-science figure the model can find for a new plant on the web — with the
 * GreenMirror sensor range that VWC was calibrated to. That pairing is the
 * translation key: the model matches the new plant's VWC to the workbook plant
 * with the closest VWC, then reads across to the GreenMirror range. Loam is
 * used because greenhouse beds are typically loam-based; the ladder (higher VWC
 * → higher GreenMirror %) holds regardless of exact soil.
 */
export function workbookAnchorTable(): string {
  return PLANT_REQUIREMENTS.map((plant) => {
    const hasVwc = typeof plant.loamSoilVwcMin === 'number' && typeof plant.loamSoilVwcMax === 'number';
    const vwc = hasVwc ? `loam VWC ${plant.loamSoilVwcMin}-${plant.loamSoilVwcMax}%` : 'loam VWC unavailable';
    return `${plant.id} | ${plant.canonicalName} | ${vwc} -> GreenMirror moisture ${plant.moistureMin}-${plant.moistureMax}% | soil temp ${plant.soilTempMin}-${plant.soilTempMax}C`;
  }).join('\n');
}
