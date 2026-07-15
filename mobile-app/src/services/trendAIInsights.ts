/**
 * Contextual, explainable AI insights for the Trends & Analysis screens.
 *
 * Shapes the deterministic output of `aiInsights.ts` into the section model the
 * contextual sheet renders (what is happening → why → based on → what this
 * means → learn → suggested action → confidence → limitations).
 *
 * Rules this module must never break:
 *  - never claim a planned volume was delivered, and never estimate litres;
 *  - never describe a pending watering record as verified;
 *  - never invent plant facts — educational text is either neutral sensor
 *    education or a note already saved on the plant profile;
 *  - omit a section entirely when the data behind it is unavailable.
 */

import type { VisualZone } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';
import type { ZoneVerificationState } from './wateringVerification';
import type { AIConfidence, AIInsightAction, ZoneAIInsight } from './aiInsights';
import { classifyMoistureAgainstTarget } from '../plantRequirements';

export type ContextualInsightKind = 'zone' | 'plant' | 'watering';

export interface ContextualConfidence {
  level: AIConfidence;
  /** Why the evidence supports this level — never a probability. */
  reason: string;
}

export interface ContextualInsight {
  id: string;
  kind: ContextualInsightKind;
  /** Sheet title — the zone or plant the user tapped. */
  title: string;
  subtitle?: string;
  /** "What is happening?" — one sentence. */
  happening: string;
  /** "Why?" — short evidence bullets. */
  why: string[];
  /** "Based on" — the data GreenMirror actually read. */
  basedOn: string[];
  /** "What this means" — one sentence. */
  meaning?: string;
  /** "Learn" — one or two neutral sentences. */
  learn?: string;
  /** "Suggested action" — one sentence. */
  action?: string;
  confidence?: ContextualConfidence;
  limitations: string[];
}

// ─── Educational content ─────────────────────────────────────────────────────
// Neutral, general soil/sensor education only. Nothing here is plant-specific;
// plant-specific wording may only come from a saved plant profile note.

const LEARN = {
  dry: 'Roots take up water from the spaces between soil particles. As soil dries out, there is less water there for the roots to absorb.',
  wet: 'Plant roots need both water and air. Soil that stays very wet for a long time leaves less air around the roots.',
  steady: 'Soil moisture changes because of heat, drainage, watering, and how much water the plant uses. A pattern across several readings tells you more than a single reading.',
  sensor: 'One sensor reading on its own is less useful than a pattern across several readings, so GreenMirror waits for fresh data before giving guidance.',
  range: 'Different plants prefer different moisture ranges, so GreenMirror compares each bed with the plant profile saved for it.',
  watering: 'Soil takes time to soak up water, so moisture is usually read again a while after watering rather than straight away.',
  fieldCapacity: 'Field capacity describes how much water soil retains after excess water has drained. Readings above the calibrated field-capacity point may occur shortly after watering or when soil is very wet.',
} as const;

/** Educational text for an action, plus the plant's saved note when there is one. */
function learnFor(action: AIInsightAction | undefined, profile?: PlantProfile | null): string | undefined {
  const general =
    action === 'water_soon' || action === 'check_today' ? LEARN.dry
    : action === 'monitor' || action === 'review_plant' ? LEARN.wet
    : action === 'check_sensor' ? LEARN.sensor
    : action === 'no_watering_needed' ? LEARN.steady
    : undefined;
  const note = profile?.notes?.trim() || profile?.careNotes?.trim();
  if (!general) return note ? `${LEARN.range} Saved note for ${profile?.name}: ${note}` : undefined;
  return note ? `${general} Saved note for ${profile?.name}: ${note}` : general;
}

// ─── Shared wording ──────────────────────────────────────────────────────────

function meaningFor(action: AIInsightAction, hasPlant: boolean): string {
  switch (action) {
    case 'water_soon':
      return hasPlant
        ? 'The soil is drier than the assigned plant prefers.'
        : 'The soil is dry by general standards.';
    case 'check_today':
      return hasPlant
        ? 'The soil is close to the lower end of the range the assigned plant prefers.'
        : 'The soil is on the drier side and worth checking.';
    case 'monitor':
      return 'Conditions are worth watching, but no watering is needed right now.';
    case 'no_watering_needed':
      return hasPlant
        ? 'The soil currently has enough moisture for the assigned plant.'
        : 'The soil currently holds a reasonable amount of moisture.';
    case 'check_sensor':
      return 'GreenMirror cannot judge this bed until a fresh, valid reading arrives.';
    case 'review_plant':
      return 'The conditions recorded here do not closely match the assigned plant profile.';
    default:
      return 'Recent readings are worth reviewing.';
  }
}

const ACTION_TEXT: Record<AIInsightAction, string> = {
  water_soon: 'Water this bed soon, then check the trend again after the soil has had time to soak.',
  check_today: 'Check this bed today before deciding whether to water.',
  monitor: 'No watering is needed right now. Check the bed again later.',
  no_watering_needed: 'No watering is needed right now. Keep monitoring the trend.',
  check_sensor: 'Check the sensor and its connection before relying on this guidance.',
  review_plant: 'Review the plant assigned to this bed and keep monitoring the readings.',
  view_trends: 'Keep monitoring this bed in Trends & Analysis.',
};

function evidenceBullets(insight: ZoneAIInsight): string[] {
  return insight.evidence.map((item) => `${item.label}: ${item.value}`);
}

function joinList(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * Confidence explains EVIDENCE QUALITY. The reason lists only evidence that is
 * genuinely present — never a made-up reading count.
 */
function confidenceFor(insight: ZoneAIInsight, readingCount?: number): ContextualConfidence {
  const parts: string[] = [];
  if (typeof readingCount === 'number' && readingCount > 0) {
    parts.push(`${readingCount.toLocaleString()} recent reading${readingCount === 1 ? '' : 's'}`);
  }
  const trend = insight.evidence.find((item) => /trend/i.test(item.label));
  if (trend && !/not enough history/i.test(trend.value)) parts.push('a recent moisture trend');
  if (insight.plantName) parts.push(`the saved profile for ${insight.plantName}`);

  return {
    level: insight.confidence,
    reason: parts.length
      ? `GreenMirror used ${joinList(parts)}.`
      : 'GreenMirror has limited evidence for this bed right now.',
  };
}

function limitationsOf(insight: ZoneAIInsight | undefined, extra: string[] = []): string[] {
  const all = [...(insight?.limitations ?? []), ...extra];
  return all.length ? [...new Set(all)] : ['Conditions can change between sensor readings.'];
}

/**
 * The engine and the watering sheet both carry an unmetered-hose caveat. Keep
 * exactly one, in the sheet's wording, so the user never reads the same
 * limitation twice.
 */
function withoutHoseCaveat(limitations: string[]): string[] {
  return limitations.filter((item) => !/hose/i.test(item));
}

/** The data sources GreenMirror actually read for this zone. */
function basedOnFor(insight: ZoneAIInsight, readingCount?: number): string[] {
  const out: string[] = [];
  out.push(
    typeof readingCount === 'number' && readingCount > 0
      ? `Soil sensor readings recorded for this bed (${readingCount.toLocaleString()})`
      : 'The latest soil sensor reading for this bed',
  );
  if (insight.plantName) out.push(`The saved plant profile for ${insight.plantName}`);
  if (insight.evidence.some((item) => /last watering/i.test(item.label))) {
    out.push('Watering actions recorded in GreenMirror');
  }
  return out;
}

// ─── Zone insight ────────────────────────────────────────────────────────────

export interface ZoneInsightContext {
  /** Sensor readings held for this zone — drives the confidence wording. */
  readingCount?: number;
  /** Used only for the plant's saved note; never for invented plant facts. */
  profile?: PlantProfile | null;
}

export function buildZoneContextualInsight(
  insight: ZoneAIInsight,
  context: ZoneInsightContext = {},
): ContextualInsight {
  const hasPlant = Boolean(insight.plantName);
  const sensorProblem = insight.action === 'check_sensor';

  return {
    id: `zone-${insight.zoneId}`,
    kind: 'zone',
    title: insight.zoneLabel,
    subtitle: insight.plantName,
    happening: insight.summary,
    why: evidenceBullets(insight),
    basedOn: basedOnFor(insight, context.readingCount),
    meaning: meaningFor(insight.action, hasPlant),
    learn: insight.evidence.some((item) => /field capacity/i.test(item.label))
      ? LEARN.fieldCapacity
      : learnFor(insight.action, context.profile),
    action: hasPlant
      ? ACTION_TEXT[insight.action]
      : sensorProblem
        ? ACTION_TEXT.check_sensor
        : 'Assign a plant profile from the Map so GreenMirror can compare this bed with a preferred range.',
    confidence: confidenceFor(insight, context.readingCount),
    limitations: limitationsOf(insight, context.profile?.profileSource === 'provisional_estimate' || context.profile?.requiresUserReview
      ? ['This plant’s range is an AI-estimated starting point and has not yet been confirmed by the user.']
      : []),
  };
}

// ─── Plant insight ───────────────────────────────────────────────────────────

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export interface PlantInsightInput {
  profile: PlantProfile;
  /** Zones this plant is assigned to. */
  zones: VisualZone[];
  /** Zone insights keyed by canonical zone id, for trend + freshness evidence. */
  insightByZone: Map<string, ZoneAIInsight>;
  /** Canonical id for a zone — injected so this module stays registry-free. */
  zoneKey: (zone: VisualZone) => string;
}

/**
 * Whether the zones growing this plant currently sit inside the plant's saved
 * preferred ranges. Never ranks or compares plants against each other.
 */
export function buildPlantContextualInsight(input: PlantInsightInput): ContextualInsight {
  const { profile, zones, insightByZone, zoneKey } = input;
  const label = zones.length === 1 ? (zones[0].displayLabel ?? zones[0].visualLabel) : `${zones.length} beds`;

  const moistures = zones.map((z) => z.soilMoisturePct).filter(isNum);
  const temps = zones.map((z) => z.soilTempC).filter(isNum);
  const insights = zones.map((z) => insightByZone.get(zoneKey(z))).filter((i): i is ZoneAIInsight => Boolean(i));

  const why: string[] = [];
  const limitations: string[] = [];
  const basedOn: string[] = [];

  // No usable moisture → say so, do not guess.
  if (moistures.length === 0) {
    return {
      id: `plant-${profile.id}`,
      kind: 'plant',
      title: profile.name,
      subtitle: label,
      happening: `GreenMirror cannot check ${profile.name} against its saved range right now.`,
      why: ['Current soil moisture: not available'],
      basedOn: [`The saved plant profile for ${profile.name}`],
      learn: LEARN.sensor,
      action: 'Check the sensor for this bed and look again once a fresh reading arrives.',
      confidence: { level: 'low', reason: 'GreenMirror has no usable moisture reading for this plant right now.' },
      limitations: ['Plant conditions cannot be assessed without a valid moisture reading.'],
    };
  }

  const avgMoisture = Math.round(moistures.reduce((a, b) => a + b, 0) / moistures.length);
  const avgTemp = temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null;
  const moistureState = classifyMoistureAgainstTarget(avgMoisture, profile.moistureMin, profile.moistureMax);
  const moistureLow = moistureState === 'below_target';
  const moistureHigh = moistureState === 'above_target_tolerated' || moistureState === 'too_wet';
  const tempOutside = avgTemp !== null && (avgTemp < profile.soilTempMin || avgTemp > profile.soilTempMax);

  why.push(
    zones.length > 1
      ? `Average moisture across ${zones.length} beds: ${avgMoisture}%`
      : `Current moisture: ${avgMoisture}%`,
  );
  why.push(`Preferred range: ${profile.moistureMin}–${profile.moistureMax}%`);
  if (avgTemp !== null) {
    why.push(`Soil temperature: ${avgTemp}°C (preferred ${profile.soilTempMin}–${profile.soilTempMax}°C)`);
  } else {
    limitations.push('Soil temperature is unavailable, so only moisture was compared.');
  }
  const trend = insights.map((i) => i.evidence.find((e) => /trend/i.test(e.label))).find(Boolean);
  if (trend && !/not enough history/i.test(trend.value)) why.push(`${trend.label}: ${trend.value}`);

  basedOn.push(zones.length > 1
    ? `The latest soil readings from the ${zones.length} beds growing ${profile.name}`
    : 'The latest soil reading from this bed');
  basedOn.push(`The saved plant profile for ${profile.name}`);

  const matches = !moistureLow && !moistureHigh && !tempOutside;
  const happening = moistureLow
    ? `${profile.name} is drier than its saved moisture range.`
    : moistureHigh
      ? `${profile.name} is wetter than its saved moisture range.`
      : tempOutside
        ? `${profile.name} is within its moisture range, but the soil temperature sits outside its saved range.`
        : `${profile.name} is currently within its saved moisture range.`;

  const meaning = moistureLow
    ? 'The soil holds less water than this plant’s profile asks for.'
    : moistureHigh
      ? 'The soil holds more water than this plant’s profile asks for.'
      : tempOutside
        ? 'Moisture is fine, but soil temperature is the factor to watch.'
        : 'The plant currently has enough soil moisture.';

  const note = profile.notes?.trim() || profile.careNotes?.trim();
  const general = moistureLow ? LEARN.dry : moistureHigh ? LEARN.wet : LEARN.range;
  const learn = note ? `${general} Saved note for ${profile.name}: ${note}` : general;

  limitations.push(...insights.flatMap((i) => i.limitations));
  if (profile.profileSource === 'provisional_estimate' || profile.requiresUserReview) {
    limitations.push('This plant’s range is an AI-estimated starting point and has not yet been confirmed by the user.');
  }

  return {
    id: `plant-${profile.id}`,
    kind: 'plant',
    title: profile.name,
    subtitle: label,
    happening,
    why,
    basedOn,
    meaning,
    learn,
    action: moistureLow
      ? 'Review watering for this plant, then check the trend again later.'
      : moistureHigh
        ? 'Do not water again immediately. Keep monitoring the trend.'
        : 'Keep monitoring the trend. No change is needed right now.',
    confidence: {
      level: insights[0]?.confidence ?? (avgTemp !== null ? 'moderate' : 'low'),
      reason: matches || moistureLow || moistureHigh
        ? `GreenMirror compared ${moistures.length} current reading${moistures.length === 1 ? '' : 's'} with the saved profile for ${profile.name}.`
        : `GreenMirror used the readings available for ${profile.name}.`,
    },
    limitations: limitations.length ? [...new Set(limitations)] : ['Conditions can change between sensor readings.'],
  };
}

// ─── Watering insight ────────────────────────────────────────────────────────

export interface WateringInsightInput {
  zone: VisualZone;
  zoneId: string;
  insight?: ZoneAIInsight;
  verification?: ZoneVerificationState;
  readingCount?: number;
  profile?: PlantProfile | null;
}

/** Never claims delivered volume, and never describes a pending record as verified. */
export function buildWateringContextualInsight(input: WateringInsightInput): ContextualInsight {
  const { zone, zoneId, insight, verification, readingCount, profile } = input;
  const label = zone.displayLabel ?? zone.visualLabel;
  const hoseLimit = 'GreenMirror cannot measure how much water was applied using the hose.';

  if (verification?.status === 'pending_verification') {
    return {
      id: `watering-${zoneId}`,
      kind: 'watering',
      title: label,
      subtitle: profile?.name,
      happening: `A watering action was recorded for ${label}. GreenMirror is still waiting for sensor evidence.`,
      why: [
        ...(insight ? evidenceBullets(insight) : []),
        'Verification status: pending — not yet confirmed by the sensor',
      ],
      basedOn: ['The watering action recorded in GreenMirror', 'Soil sensor readings taken since that record'],
      meaning: 'GreenMirror has not yet seen enough sensor evidence to say what changed after the recorded watering.',
      learn: LEARN.watering,
      action: 'Wait for the next few sensor readings before watering this bed again.',
      confidence: {
        level: 'low',
        reason: 'GreenMirror is still collecting readings taken after the watering record.',
      },
      limitations: [
        'This watering record is not verified.',
        hoseLimit,
      ],
    };
  }

  if (!insight) {
    return {
      id: `watering-${zoneId}`,
      kind: 'watering',
      title: label,
      subtitle: profile?.name,
      happening: `GreenMirror does not have enough current evidence to assess watering for ${label}.`,
      why: ['Current sensor evidence: not available'],
      basedOn: ['Soil sensor readings recorded for this bed'],
      learn: LEARN.sensor,
      action: 'Check the sensor for this bed and look again once a fresh reading arrives.',
      confidence: { level: 'low', reason: 'No usable current reading is available for this bed.' },
      limitations: ['Watering guidance is paused until a valid, fresh reading is available.', hoseLimit],
    };
  }

  const needsWater = insight.action === 'water_soon' || insight.action === 'check_today';
  const happening = needsWater
    ? `${label} is drier than preferred, so watering may be needed soon.`
    : insight.action === 'check_sensor'
      ? `GreenMirror cannot assess watering for ${label} — the latest reading is stale or unavailable.`
      : insight.action === 'no_watering_needed'
        ? `${label} does not need watering right now.`
        : `${label} is worth monitoring before any watering.`;

  return {
    id: `watering-${zoneId}`,
    kind: 'watering',
    title: label,
    subtitle: profile?.name,
    happening,
    why: evidenceBullets(insight),
    basedOn: basedOnFor(insight, readingCount),
    meaning: meaningFor(insight.action, Boolean(insight.plantName)),
    learn: needsWater ? LEARN.dry : learnFor(insight.action, profile) ?? LEARN.watering,
    action: needsWater
      ? `Review watering for ${label}, then check the trend again after the soil has had time to soak.`
      : ACTION_TEXT[insight.action],
    confidence: confidenceFor(insight, readingCount),
    limitations: [...withoutHoseCaveat(limitationsOf(insight)), hoseLimit],
  };
}
