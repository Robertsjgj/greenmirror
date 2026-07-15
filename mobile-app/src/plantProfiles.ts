import type { VisualZone } from './zoneLayout';
import { findPlantIconByName } from './plantIconRegistry';
import {
  classifyMoistureAgainstTarget,
  findPlantRequirementByName,
  findProvisionalPlantRequirement,
  requirementRangesMatch,
  type PlantProfileSource,
  type PlantRequirementProfile,
} from './plantRequirements';

export interface PlantProfile {
  id: string;
  name: string;
  icon?: string;
  moistureMin: number;
  moistureMax: number;
  soilTempMin: number;
  soilTempMax: number;
  notes?: string;
  careNotes?: string;
  isDefault?: boolean;
  isCustom?: boolean;
  profileSource?: PlantProfileSource;
  sourcePlantName?: string;
  requiresUserReview?: boolean;
  requirementNotes?: string[];
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
}

export type ZoneAssignments = Record<string, string>;

export type ZoneOverallStatus =
  | 'good'
  | 'needs-water'
  | 'too-wet'
  | 'too-cold'
  | 'too-hot'
  | 'sensor-offline'
  | 'no-data'
  | 'unassigned'
  | 'missing-profile';

export interface ZonePlantEvaluation {
  overallStatus: ZoneOverallStatus;
  messages: string[];
  moistureStatus: 'good' | 'needs-water' | 'too-wet' | 'no-data' | 'unassigned' | 'missing-profile';
  temperatureStatus: 'good' | 'too-cold' | 'too-hot' | 'no-data' | 'unassigned' | 'missing-profile';
  tone: 'good' | 'dry' | 'wet' | 'alert' | 'no-data';
  label: string;
}

export const PLANT_PROFILES_STORAGE_KEY = 'greenmirror-plant-profiles';
export const ZONE_ASSIGNMENTS_STORAGE_KEY = 'greenmirror-zone-assignments';

function profileFromRequirement(id: string, name: string): PlantProfile {
  const requirement = findPlantRequirementByName(name) ?? findProvisionalPlantRequirement(name);
  if (!requirement) throw new Error(`Missing configured GreenMirror plant requirement for ${name}`);
  return applyRequirementToPlantProfile({ id, name, icon: findPlantIconByName(name)?.icon }, requirement, true);
}

export const DEFAULT_PLANT_PROFILES: PlantProfile[] = [
  profileFromRequirement('tomato', 'Tomatoes'),
  profileFromRequirement('pepper', 'Bell peppers'),
  profileFromRequirement('carrot', 'Carrots'),
  profileFromRequirement('lettuce', 'Lettuce'),
  profileFromRequirement('kale', 'Kale'),
  profileFromRequirement('spinach', 'Spinach'),
  profileFromRequirement('cucumber', 'Cucumbers'),
  profileFromRequirement('onion', 'Onions'),
];

export function applyRequirementToPlantProfile(
  profile: Partial<PlantProfile>,
  requirement: PlantRequirementProfile,
  isDefault = false,
): PlantProfile {
  const name = requirement.profileSource === 'provisional_estimate'
    ? (profile.name?.trim() || requirement.canonicalName)
    : requirement.canonicalName;
  const normalized: PlantProfile = {
    ...profile,
    id: profile.id?.trim() || requirement.id,
    name,
    icon: profile.icon ?? findPlantIconByName(name)?.icon,
    moistureMin: requirement.moistureMin,
    moistureMax: requirement.moistureMax,
    soilTempMin: requirement.soilTempMin,
    soilTempMax: requirement.soilTempMax,
    profileSource: requirement.profileSource,
    sourcePlantName: requirement.sourcePlantName,
    requiresUserReview: requirement.requiresUserReview,
    requirementNotes: requirement.notes,
    preferredSoilTempMin: requirement.preferredSoilTempMin,
    preferredSoilTempMax: requirement.preferredSoilTempMax,
    toleratedSoilTempMin: requirement.toleratedSoilTempMin,
    toleratedSoilTempMax: requirement.toleratedSoilTempMax,
    sandySoilVwcMin: requirement.sandySoilVwcMin,
    sandySoilVwcMax: requirement.sandySoilVwcMax,
    loamSoilVwcMin: requirement.loamSoilVwcMin,
    loamSoilVwcMax: requirement.loamSoilVwcMax,
    claySoilVwcMin: requirement.claySoilVwcMin,
    claySoilVwcMax: requirement.claySoilVwcMax,
    isDefault,
    isCustom: !isDefault,
  };
  return normalized;
}

/** Preserves existing values; fills only missing ranges and labels matching defaults safely. */
export function normalizeExistingProfileWithRequirements(profile: Partial<PlantProfile>): Partial<PlantProfile> {
  const requirement = findPlantRequirementByName(profile.name ?? '');
  if (!requirement) return { ...profile, profileSource: profile.profileSource ?? 'custom' };
  const rangeKeys = ['moistureMin', 'moistureMax', 'soilTempMin', 'soilTempMax'] as const;
  const hasMissing = rangeKeys.some((key) => typeof profile[key] !== 'number' || !Number.isFinite(profile[key]));
  if (hasMissing) return applyRequirementToPlantProfile(profile, requirement, Boolean(profile.isDefault));
  if (requirementRangesMatch(profile, requirement)) {
    return { ...profile, profileSource: profile.profileSource ?? 'greenmirror_spreadsheet', sourcePlantName: requirement.sourcePlantName, requiresUserReview: false };
  }
  return { ...profile, profileSource: 'custom', sourcePlantName: requirement.sourcePlantName, requiresUserReview: false };
}

const DEFAULT_PROFILE_IDS = new Set(DEFAULT_PLANT_PROFILES.map((profile) => profile.id));

export function isDefaultPlantProfile(profileId: string) {
  return DEFAULT_PROFILE_IDS.has(profileId);
}

export function normalizePlantProfile(profile: Partial<PlantProfile>): PlantProfile | null {
  const name = profile.name?.trim();
  if (!name) return null;

  const id = profile.id?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) return null;

  const prepared = normalizeExistingProfileWithRequirements({ ...profile, id, name });

  const moistureMin = normalizeRangeValue(prepared.moistureMin, 0, 100);
  const moistureMax = normalizeRangeValue(prepared.moistureMax, 0, 100);
  const soilTempMin = normalizeRangeValue(prepared.soilTempMin, -10, 45);
  const soilTempMax = normalizeRangeValue(prepared.soilTempMax, -10, 45);

  const normalized: PlantProfile = {
    id,
    name,
    icon: prepared.icon?.trim() || undefined,
    moistureMin: Math.min(moistureMin, moistureMax),
    moistureMax: Math.max(moistureMin, moistureMax),
    soilTempMin: Math.min(soilTempMin, soilTempMax),
    soilTempMax: Math.max(soilTempMin, soilTempMax),
    notes: prepared.notes?.trim() || prepared.careNotes?.trim() || undefined,
    careNotes: prepared.careNotes?.trim() || prepared.notes?.trim() || undefined,
    isDefault: DEFAULT_PROFILE_IDS.has(id),
    isCustom: !DEFAULT_PROFILE_IDS.has(id),
    profileSource: prepared.profileSource,
    sourcePlantName: prepared.sourcePlantName,
    requiresUserReview: prepared.requiresUserReview ?? false,
    requirementNotes: Array.isArray(prepared.requirementNotes) ? prepared.requirementNotes.filter((note): note is string => typeof note === 'string') : undefined,
    preferredSoilTempMin: prepared.preferredSoilTempMin,
    preferredSoilTempMax: prepared.preferredSoilTempMax,
    toleratedSoilTempMin: prepared.toleratedSoilTempMin,
    toleratedSoilTempMax: prepared.toleratedSoilTempMax,
    sandySoilVwcMin: prepared.sandySoilVwcMin,
    sandySoilVwcMax: prepared.sandySoilVwcMax,
    loamSoilVwcMin: prepared.loamSoilVwcMin,
    loamSoilVwcMax: prepared.loamSoilVwcMax,
    claySoilVwcMin: prepared.claySoilVwcMin,
    claySoilVwcMax: prepared.claySoilVwcMax,
  };
  return normalizeExistingProfileWithRequirements(normalized) as PlantProfile;
}

export function loadPlantProfiles(): PlantProfile[] {
  const defaultsById = new Map(DEFAULT_PLANT_PROFILES.map((profile) => [profile.id, profile]));

  if (typeof window === 'undefined') return DEFAULT_PLANT_PROFILES;

  try {
    const raw = window.localStorage.getItem(PLANT_PROFILES_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const storedProfiles = Array.isArray(stored)
      ? stored
          .map((profile) => normalizePlantProfile(profile))
          .filter((profile): profile is PlantProfile => Boolean(profile))
      : [];
    const storedById = new Map(storedProfiles.map((profile) => [profile.id, profile]));
    const defaults = DEFAULT_PLANT_PROFILES.map((profile) => storedById.get(profile.id) ?? { ...profile, isDefault: true });
    const customProfiles = storedProfiles.filter((profile) => !defaultsById.has(profile.id));
    return [...defaults, ...dedupeProfiles(customProfiles)];
  } catch {
    return DEFAULT_PLANT_PROFILES;
  }
}

export function savePlantProfiles(profiles: PlantProfile[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLANT_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

export function loadZoneAssignments(): ZoneAssignments {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(ZONE_ASSIGNMENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string'
      )
    );
  } catch {
    return {};
  }
}

export function saveZoneAssignments(assignments: ZoneAssignments) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ZONE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
}

// ─── Greenhouse-scoped zone-assignment helpers ────────────────────────────────

function scopedAssignmentsKey(ghId: string): string {
  return `${ZONE_ASSIGNMENTS_STORAGE_KEY}-${ghId}`;
}

/**
 * Load zone assignments for a specific greenhouse.
 * Migrates the global key on first access so existing assignments are preserved.
 */
export function loadZoneAssignmentsForGh(ghId: string): ZoneAssignments {
  if (typeof window === 'undefined') return {};
  try {
    const scopedRaw = window.localStorage.getItem(scopedAssignmentsKey(ghId));
    if (scopedRaw !== null) {
      const parsed = JSON.parse(scopedRaw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (e): e is [string, string] => typeof e[0] === 'string' && typeof e[1] === 'string',
        ),
      );
    }
    // One-time migration from global key → scoped key
    const global = loadZoneAssignments();
    if (Object.keys(global).length > 0) {
      try { window.localStorage.setItem(scopedAssignmentsKey(ghId), JSON.stringify(global)); } catch { /* storage full */ }
      return global;
    }
  } catch { /* storage unavailable */ }
  return {};
}

export function saveZoneAssignmentsForGh(ghId: string, assignments: ZoneAssignments): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(scopedAssignmentsKey(ghId), JSON.stringify(assignments));
  } catch { /* storage full */ }
}

export function getPlantStatusMessages(zone: VisualZone, profile: PlantProfile | null) {
  return evaluateZoneAgainstPlant(zone, profile).messages;
}

/**
 * Moisture is the required sensor for evaluating a bed's watering / plant
 * health. When it is disconnected or invalid the bed cannot be judged, so the
 * evaluation must report "Sensor Offline" instead of a health verdict —
 * temperature alone must never make a bed read as healthy.
 */
export function hasRequiredSensors(zone: VisualZone): boolean {
  const moistureOffline =
    zone.soilMoistureStatus === 'not_connected' ||
    zone.soilMoistureStatus === 'invalid' ||
    zone.soilMoisturePct === null ||
    zone.soilMoisturePct === undefined;
  return !moistureOffline;
}

export function evaluateZoneAgainstPlant(zone: VisualZone, profile: PlantProfile | null): ZonePlantEvaluation {
  const hasAssignedPlant = Boolean(zone.assignedPlant);

  if (!zone.hasReading || (zone.soilMoisturePct === null && zone.soilTempC === null)) {
    return {
      overallStatus: 'no-data',
      messages: hasAssignedPlant
        ? [`Waiting for live sensor data for ${profile?.name ?? 'the assigned plant'}.`]
        : ['No live sensor reading for this zone yet.'],
      moistureStatus: 'no-data',
      temperatureStatus: 'no-data',
      tone: 'no-data',
      label: 'No data'
    };
  }

  // Required-sensor gate (highest priority — above critical/wet/dry/good).
  // Without moisture data a bed cannot be evaluated for watering or plant
  // health, so it must read "Sensor Offline" no matter what the temperature
  // probe reports. Temperature continues to be shown elsewhere from the raw
  // reading; it just cannot, on its own, declare the bed healthy.
  if (!hasRequiredSensors(zone)) {
    return {
      overallStatus: 'sensor-offline',
      messages: [
        'Unable to evaluate this bed because one or more required sensors are disconnected.',
        'Reconnect the moisture sensor to receive watering recommendations.'
      ],
      moistureStatus: 'no-data',
      temperatureStatus: 'no-data',
      tone: 'no-data',
      label: 'Sensor Offline'
    };
  }

  if (hasAssignedPlant && !profile) {
    return {
      overallStatus: 'missing-profile',
      messages: ['Assigned plant profile is missing. Clear or choose a new plant profile.'],
      moistureStatus: 'missing-profile',
      temperatureStatus: 'missing-profile',
      tone: 'alert',
      label: 'Plant missing'
    };
  }

  if (!profile) {
    const fallbackMessages = zone.alerts.length > 0
      ? zone.alerts.map((alert) => `${zone.displayLabel ?? zone.visualLabel}: ${alert}`)
      : ['No plant assigned. Generic sensor status is being used.'];
    const genericTone = getGenericTone(zone);

    return {
      overallStatus: 'unassigned',
      messages: fallbackMessages,
      moistureStatus: 'unassigned',
      temperatureStatus: 'unassigned',
      tone: genericTone,
      label: genericTone === 'good' ? 'Unassigned' : fallbackLabel(genericTone)
    };
  }

  const messages: string[] = [];
  let moistureStatus: ZonePlantEvaluation['moistureStatus'] = 'no-data';
  let temperatureStatus: ZonePlantEvaluation['temperatureStatus'] = 'no-data';

  if (zone.soilMoisturePct !== null) {
    if (zone.soilMoisturePct < profile.moistureMin) {
      moistureStatus = 'needs-water';
      messages.push(`${profile.name} needs water in ${zone.displayLabel ?? zone.visualLabel}.`);
    } else if (classifyMoistureAgainstTarget(zone.soilMoisturePct, profile.moistureMin, profile.moistureMax) === 'above_target_tolerated') {
      moistureStatus = 'too-wet';
      messages.push(`${profile.name} is wetter than the preferred range in ${zone.displayLabel ?? zone.visualLabel} — monitor.`);
    } else if (classifyMoistureAgainstTarget(zone.soilMoisturePct, profile.moistureMin, profile.moistureMax) === 'too_wet') {
      moistureStatus = 'too-wet';
      messages.push(`Soil appears substantially wetter than the preferred range for ${profile.name}.`);
    } else {
      moistureStatus = 'good';
      // Good moisture — no actionable message needed
    }
  }

  if (zone.soilTempC !== null) {
    if (zone.soilTempC < profile.soilTempMin) {
      temperatureStatus = 'too-cold';
      messages.push(`${profile.name} soil is too cold (${zone.soilTempC.toFixed(1)}°C).`);
    } else if (zone.soilTempC > profile.soilTempMax) {
      temperatureStatus = 'too-hot';
      messages.push(`${profile.name} soil is too warm (${zone.soilTempC.toFixed(1)}°C).`);
    } else {
      temperatureStatus = 'good';
      // Good temperature — no actionable message needed
    }
  }

  const overallStatus = getOverallStatus(moistureStatus, temperatureStatus);
  const tone = toneFromOverall(overallStatus);

  return {
    overallStatus,
    messages,
    moistureStatus,
    temperatureStatus,
    tone,
    label: labelFromOverall(overallStatus)
  };
}

export function getPlantTone(zone: VisualZone, profile: PlantProfile | null) {
  if (!profile && !zone.assignedPlant) return null;
  return evaluateZoneAgainstPlant(zone, profile).tone;
}

function getGenericTone(zone: VisualZone): ZonePlantEvaluation['tone'] {
  if (!zone.hasReading) return 'no-data';
  if (zone.alerts.includes('too cold') || zone.alerts.length > 1) return 'alert';
  if (zone.alerts.includes('too wet') || (zone.soilMoisturePct ?? 0) > 80) return 'wet';
  if (zone.alerts.includes('too dry') || (zone.soilMoisturePct ?? 100) < 30) return 'dry';
  return 'good';
}

function fallbackLabel(tone: ZonePlantEvaluation['tone']) {
  if (tone === 'dry') return 'Getting dry';
  if (tone === 'wet') return 'Too wet';
  if (tone === 'alert') return 'Alert';
  if (tone === 'no-data') return 'No data';
  return 'Good';
}

function getOverallStatus(
  moistureStatus: ZonePlantEvaluation['moistureStatus'],
  temperatureStatus: ZonePlantEvaluation['temperatureStatus']
): ZoneOverallStatus {
  if (moistureStatus === 'needs-water') return 'needs-water';
  if (moistureStatus === 'too-wet') return 'too-wet';
  if (temperatureStatus === 'too-cold') return 'too-cold';
  if (temperatureStatus === 'too-hot') return 'too-hot';
  if (moistureStatus === 'no-data' && temperatureStatus === 'no-data') return 'no-data';
  return 'good';
}

function toneFromOverall(status: ZoneOverallStatus): ZonePlantEvaluation['tone'] {
  if (status === 'needs-water') return 'dry';
  if (status === 'too-wet') return 'wet';
  if (status === 'too-cold' || status === 'too-hot' || status === 'missing-profile') return 'alert';
  if (status === 'sensor-offline' || status === 'no-data') return 'no-data';
  return 'good';
}

function labelFromOverall(status: ZoneOverallStatus) {
  if (status === 'needs-water') return 'Needs water';
  if (status === 'too-wet') return 'Too wet';
  if (status === 'too-cold') return 'Too cold';
  if (status === 'too-hot') return 'Too hot';
  if (status === 'missing-profile') return 'Plant missing';
  if (status === 'sensor-offline') return 'Sensor Offline';
  if (status === 'no-data') return 'No data';
  return 'Good';
}

function normalizeRangeValue(value: unknown, min: number, max: number) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numberValue)) return min;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

function dedupeProfiles(profiles: PlantProfile[]) {
  const seen = new Set<string>();
  return profiles.filter((profile) => {
    if (seen.has(profile.id)) return false;
    seen.add(profile.id);
    return true;
  });
}
