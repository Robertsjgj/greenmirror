import type { VisualZone } from './zoneLayout';

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
}

export type ZoneAssignments = Record<string, string>;

export type ZoneOverallStatus =
  | 'good'
  | 'needs-water'
  | 'too-wet'
  | 'too-cold'
  | 'too-hot'
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

export const DEFAULT_PLANT_PROFILES: PlantProfile[] = [
  {
    id: 'tomato',
    name: 'Tomato',
    icon: '🍅',
    moistureMin: 55,
    moistureMax: 75,
    soilTempMin: 18,
    soilTempMax: 29,
    notes: 'Keep soil consistently moist and warm.',
    isDefault: true
  },
  {
    id: 'pepper',
    name: 'Pepper',
    icon: '🌶️',
    moistureMin: 50,
    moistureMax: 70,
    soilTempMin: 20,
    soilTempMax: 30,
    notes: 'Prefers warm soil and moderate moisture.',
    isDefault: true
  },
  {
    id: 'carrot',
    name: 'Carrot',
    icon: '🥕',
    moistureMin: 45,
    moistureMax: 65,
    soilTempMin: 10,
    soilTempMax: 24,
    notes: 'Even moisture helps roots size cleanly.',
    isDefault: true
  },
  {
    id: 'lettuce',
    name: 'Lettuce',
    icon: '🥬',
    moistureMin: 60,
    moistureMax: 80,
    soilTempMin: 7,
    soilTempMax: 22,
    notes: 'Likes cooler soil and steady water.',
    isDefault: true
  },
  {
    id: 'kale',
    name: 'Kale',
    icon: '🌿',
    moistureMin: 50,
    moistureMax: 75,
    soilTempMin: 7,
    soilTempMax: 24,
    notes: 'Tolerates cool soil but dislikes drying out.',
    isDefault: true
  },
  {
    id: 'spinach',
    name: 'Spinach',
    icon: '🌱',
    moistureMin: 55,
    moistureMax: 80,
    soilTempMin: 5,
    soilTempMax: 20,
    notes: 'Best in cool, moist conditions.',
    isDefault: true
  },
  {
    id: 'cucumber',
    name: 'Cucumber',
    icon: '🥒',
    moistureMin: 60,
    moistureMax: 80,
    soilTempMin: 18,
    soilTempMax: 30,
    notes: 'Needs warm soil and generous moisture.',
    isDefault: true
  },
  {
    id: 'onion',
    name: 'Onion',
    icon: '🧅',
    moistureMin: 40,
    moistureMax: 60,
    soilTempMin: 10,
    soilTempMax: 24,
    notes: 'Prefers moderate moisture with good drainage.',
    isDefault: true
  }
];

const DEFAULT_PROFILE_IDS = new Set(DEFAULT_PLANT_PROFILES.map((profile) => profile.id));

export function isDefaultPlantProfile(profileId: string) {
  return DEFAULT_PROFILE_IDS.has(profileId);
}

export function normalizePlantProfile(profile: Partial<PlantProfile>): PlantProfile | null {
  const name = profile.name?.trim();
  if (!name) return null;

  const id = profile.id?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) return null;

  const moistureMin = normalizeRangeValue(profile.moistureMin, 0, 100);
  const moistureMax = normalizeRangeValue(profile.moistureMax, 0, 100);
  const soilTempMin = normalizeRangeValue(profile.soilTempMin, -10, 45);
  const soilTempMax = normalizeRangeValue(profile.soilTempMax, -10, 45);

  return {
    id,
    name,
    icon: profile.icon?.trim() || undefined,
    moistureMin: Math.min(moistureMin, moistureMax),
    moistureMax: Math.max(moistureMin, moistureMax),
    soilTempMin: Math.min(soilTempMin, soilTempMax),
    soilTempMax: Math.max(soilTempMin, soilTempMax),
    notes: profile.notes?.trim() || profile.careNotes?.trim() || undefined,
    careNotes: profile.careNotes?.trim() || profile.notes?.trim() || undefined,
    isDefault: DEFAULT_PROFILE_IDS.has(id),
    isCustom: !DEFAULT_PROFILE_IDS.has(id)
  };
}

export function loadPlantProfiles(): PlantProfile[] {
  const defaultsById = new Map(DEFAULT_PLANT_PROFILES.map((profile) => [profile.id, profile]));

  if (typeof window === 'undefined') return DEFAULT_PLANT_PROFILES;

  try {
    const raw = window.localStorage.getItem(PLANT_PROFILES_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    const customProfiles = Array.isArray(stored)
      ? stored
          .map((profile) => normalizePlantProfile(profile))
          .filter((profile): profile is PlantProfile => Boolean(profile))
          .filter((profile) => !defaultsById.has(profile.id))
      : [];

    return [...DEFAULT_PLANT_PROFILES.map((profile) => ({ ...profile, isDefault: true })), ...dedupeProfiles(customProfiles)];
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

export function getPlantStatusMessages(zone: VisualZone, profile: PlantProfile | null) {
  return evaluateZoneAgainstPlant(zone, profile).messages;
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
    } else if (zone.soilMoisturePct > profile.moistureMax) {
      moistureStatus = 'too-wet';
      messages.push(`${profile.name} may be too wet in ${zone.displayLabel ?? zone.visualLabel}.`);
    } else {
      moistureStatus = 'good';
      messages.push(`${profile.name} moisture is good.`);
    }
  }

  if (zone.soilTempC !== null) {
    if (zone.soilTempC < profile.soilTempMin) {
      temperatureStatus = 'too-cold';
      messages.push(`${profile.name} soil is too cold.`);
    } else if (zone.soilTempC > profile.soilTempMax) {
      temperatureStatus = 'too-hot';
      messages.push(`${profile.name} soil is too warm.`);
    } else {
      temperatureStatus = 'good';
      messages.push(`${profile.name} soil temperature is good.`);
    }
  }

  const overallStatus = getOverallStatus(moistureStatus, temperatureStatus);
  const tone = toneFromOverall(overallStatus);

  return {
    overallStatus,
    messages: messages.length > 0 ? messages : [`Waiting for live sensor data for ${profile.name}.`],
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
  if (status === 'no-data') return 'no-data';
  return 'good';
}

function labelFromOverall(status: ZoneOverallStatus) {
  if (status === 'needs-water') return 'Needs water';
  if (status === 'too-wet') return 'Too wet';
  if (status === 'too-cold') return 'Too cold';
  if (status === 'too-hot') return 'Too hot';
  if (status === 'missing-profile') return 'Plant missing';
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
