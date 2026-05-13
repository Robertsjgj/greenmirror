import { VisualZone } from './zoneLayout';

export interface PlantProfile {
  id: string;
  name: string;
  moistureMin: number;
  moistureMax: number;
  soilTempMin: number;
  soilTempMax: number;
  notes?: string;
}

export type ZoneAssignments = Record<string, string>;

export const PLANT_PROFILES_STORAGE_KEY = 'greenmirror-plant-profiles';
export const ZONE_ASSIGNMENTS_STORAGE_KEY = 'greenmirror-zone-assignments';

export const DEFAULT_PLANT_PROFILES: PlantProfile[] = [
  {
    id: 'tomato',
    name: 'Tomato',
    moistureMin: 55,
    moistureMax: 75,
    soilTempMin: 18,
    soilTempMax: 29,
    notes: 'Keep soil consistently moist and warm.'
  },
  {
    id: 'pepper',
    name: 'Pepper',
    moistureMin: 50,
    moistureMax: 70,
    soilTempMin: 20,
    soilTempMax: 30,
    notes: 'Prefers warm soil and moderate moisture.'
  },
  {
    id: 'carrot',
    name: 'Carrot',
    moistureMin: 45,
    moistureMax: 65,
    soilTempMin: 10,
    soilTempMax: 24,
    notes: 'Even moisture helps roots size cleanly.'
  },
  {
    id: 'lettuce',
    name: 'Lettuce',
    moistureMin: 60,
    moistureMax: 80,
    soilTempMin: 7,
    soilTempMax: 22,
    notes: 'Likes cooler soil and steady water.'
  },
  {
    id: 'kale',
    name: 'Kale',
    moistureMin: 50,
    moistureMax: 75,
    soilTempMin: 7,
    soilTempMax: 24,
    notes: 'Tolerates cool soil but dislikes drying out.'
  },
  {
    id: 'spinach',
    name: 'Spinach',
    moistureMin: 55,
    moistureMax: 80,
    soilTempMin: 5,
    soilTempMax: 20,
    notes: 'Best in cool, moist conditions.'
  },
  {
    id: 'cucumber',
    name: 'Cucumber',
    moistureMin: 60,
    moistureMax: 80,
    soilTempMin: 18,
    soilTempMax: 30,
    notes: 'Needs warm soil and generous moisture.'
  },
  {
    id: 'onion',
    name: 'Onion',
    moistureMin: 40,
    moistureMax: 60,
    soilTempMin: 10,
    soilTempMax: 24,
    notes: 'Prefers moderate moisture with good drainage.'
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
    moistureMin: Math.min(moistureMin, moistureMax),
    moistureMax: Math.max(moistureMin, moistureMax),
    soilTempMin: Math.min(soilTempMin, soilTempMax),
    soilTempMax: Math.max(soilTempMin, soilTempMax),
    notes: profile.notes?.trim() || undefined
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

    return [...DEFAULT_PLANT_PROFILES, ...dedupeProfiles(customProfiles)];
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
  if (!profile) return zone.alerts;

  const messages: string[] = [];

  if (zone.soilMoisturePct !== null) {
    if (zone.soilMoisturePct < profile.moistureMin) {
      messages.push(`${profile.name} needs more water`);
    } else if (zone.soilMoisturePct > profile.moistureMax) {
      messages.push(`${profile.name} soil is too wet`);
    } else {
      messages.push(`Soil moisture is ideal for ${profile.name}`);
    }
  }

  if (zone.soilTempC !== null) {
    if (zone.soilTempC < profile.soilTempMin) {
      messages.push(`Soil temperature is too low for ${profile.name}`);
    } else if (zone.soilTempC > profile.soilTempMax) {
      messages.push(`Soil temperature is too high for ${profile.name}`);
    } else {
      messages.push(`Soil temperature is ideal for ${profile.name}`);
    }
  }

  return messages.length > 0 ? messages : [`Waiting for live sensor data for ${profile.name}`];
}

export function getPlantTone(zone: VisualZone, profile: PlantProfile | null) {
  if (!profile || !zone.hasReading) return null;

  if (
    (zone.soilTempC !== null && (zone.soilTempC < profile.soilTempMin || zone.soilTempC > profile.soilTempMax)) ||
    (zone.soilMoisturePct !== null &&
      (zone.soilMoisturePct < profile.moistureMin || zone.soilMoisturePct > profile.moistureMax))
  ) {
    if (zone.soilMoisturePct !== null && zone.soilMoisturePct > profile.moistureMax) return 'wet' as const;
    if (zone.soilMoisturePct !== null && zone.soilMoisturePct < profile.moistureMin) return 'dry' as const;
    return 'alert' as const;
  }

  return 'good' as const;
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
