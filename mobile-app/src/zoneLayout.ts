import type { PlantProfile } from './plantProfiles';

export interface ZoneReading {
  zone_id: string;
  zone_name?: string | null;
  location_type?: 'inside' | 'outside' | 'unknown';
  node_id?: string;
  greenhouse_id?: string;
  plant_profile_id?: string | null;
  plant_name?: string | null;
  soil_moisture_raw?: number | null;
  soil_moisture_pct?: number | null;
  soil_moisture_status?: 'ok' | 'not_connected' | 'invalid' | string | null;
  soil_temp_c?: number | null;
  soil_temp_status?: string | null;
  moisture_status?: 'dry' | 'ok' | 'wet' | 'unknown';
  runoff_risk?: 'low' | 'medium' | 'high' | 'unknown';
  alerts?: string[];
}

export interface EnvironmentReading {
  source?: 'rpi' | 'simulation' | 'unavailable' | string;
  air_temp_c?: number | null;
  humidity_pct?: number | null;
  light_lux?: number | null;
  brightness_pct?: number | null;
}

/** External weather snapshot fetched from Open-Meteo by the backend. */
export interface ExternalWeatherReading {
  source?: string;
  temp_c?: number | null;
  humidity_pct?: number | null;
  wind_speed_kmh?: number | null;
  condition?: string | null;
  fetched_at?: string | null;
}

/** Geographic location metadata embedded in each reading. */
export interface LocationMeta {
  city?: string;
  province?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

/** System/hardware status block. */
export interface SystemStatus {
  rpi_online?: boolean;
  esp_nodes_online?: number;
  esp_nodes_expected?: number;
  missing_nodes?: string[];
  battery_status?: string | null;
}

export interface ReadingSummary {
  // Core inside/outside averages (old + new shape)
  avg_inside_soil_moisture_pct?: number | null;
  avg_outside_soil_moisture_pct?: number | null;
  avg_inside_soil_temp_c?: number | null;
  avg_outside_soil_temp_c?: number | null;
  // Extended fields (new schema)
  avg_all_soil_moisture_pct?: number | null;
  avg_all_soil_temp_c?: number | null;
  zone_count?: number;
  active_zone_count?: number;
  zones_need_water?: number;
  zones_too_wet?: number;
  zones_healthy?: number;
  runoff_risk?: 'low' | 'medium' | 'high' | 'unknown';
}

export interface LatestReading {
  greenhouse_id: string;
  greenhouse_name?: string;
  location?: LocationMeta | null;
  mode?: string;
  node_id?: string;
  node_count?: number;
  zone_count?: number;
  timestamp?: string;
  zones: ZoneReading[];
  environment?: EnvironmentReading | null;
  external_weather?: ExternalWeatherReading | null;
  summary?: ReadingSummary;
  system?: SystemStatus | null;
  // Legacy RPi ambient fields — kept for older readings and existing chart code.
  env_temp_c?: number | null;
  env_humidity_pct?: number | null;
}

export interface LayoutSettings {
  rows: number;
  sectionsPerRow: number;
}

export interface LayoutSlot {
  rowIndex: number;
  sectionIndex: number;
  rowLabel: string;
  visualLabel: string;
}

export interface VisualZone {
  id: string;
  visualLabel: string;
  displayLabel?: string;
  referenceCrop?: string;
  rowLabel: string;
  rowIndex: number;
  section: number;
  nodeId?: string;
  backendZoneId?: string;
  greenhouseId?: string;
  soilMoistureRaw: number | null;
  soilMoisturePct: number | null;
  soilMoistureStatus?: string | null;
  soilTempC: number | null;
  soilTempStatus: string | null;
  alerts: string[];
  timestamp?: string;
  hasReading: boolean;
  assignedPlant?: string | null;
  assignedPlantProfile?: PlantProfile | null;
  assignedPlantMissing?: boolean;
}

export interface LayoutResult {
  slots: LayoutSlot[];
  rows: Array<{
    rowLabel: string;
    zones: VisualZone[];
  }>;
  overflowZones: VisualZone[];
}

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function createDefaultSettings(): LayoutSettings {
  return {
    rows: 5,
    sectionsPerRow: 6
  };
}

export function sanitizeSettings(settings: Partial<LayoutSettings> | null | undefined): LayoutSettings {
  const defaults = createDefaultSettings();

  return {
    rows: clampNumber(settings?.rows, defaults.rows, 1, 26),
    sectionsPerRow: clampNumber(settings?.sectionsPerRow, defaults.sectionsPerRow, 1, 20)
  };
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function buildLayoutSlots(settings: LayoutSettings): LayoutSlot[] {
  const slots: LayoutSlot[] = [];

  for (let rowIndex = 0; rowIndex < settings.rows; rowIndex += 1) {
    const rowLabel = ROW_LETTERS[rowIndex] ?? `R${rowIndex + 1}`;

    for (let sectionIndex = 0; sectionIndex < settings.sectionsPerRow; sectionIndex += 1) {
      slots.push({
        rowIndex,
        sectionIndex,
        rowLabel,
        visualLabel: `R${rowLabel}-${sectionIndex + 1}`
      });
    }
  }

  return slots;
}

function normalizeZoneId(zoneId: string | undefined) {
  return (zoneId ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function createEmptyVisualZone(slot: LayoutSlot): VisualZone {
  return {
    id: `empty-${slot.visualLabel}`,
    visualLabel: slot.visualLabel,
    rowLabel: slot.rowLabel,
    rowIndex: slot.rowIndex,
    section: slot.sectionIndex + 1,
    soilMoistureRaw: null,
    soilMoisturePct: null,
    soilTempC: null,
    soilTempStatus: null,
    alerts: [],
    hasReading: false,
    assignedPlant: null
  };
}

function createVisualZone(slot: LayoutSlot, zone: ZoneReading, timestamp?: string): VisualZone {
  return {
    id: `${zone.node_id ?? 'node'}-${zone.zone_id}-${slot.visualLabel}`,
    visualLabel: slot.visualLabel,
    rowLabel: slot.rowLabel,
    rowIndex: slot.rowIndex,
    section: slot.sectionIndex + 1,
    nodeId: zone.node_id,
    backendZoneId: zone.zone_id,
    greenhouseId: zone.greenhouse_id,
    soilMoistureRaw: zone.soil_moisture_raw ?? null,
    soilMoisturePct: zone.soil_moisture_pct ?? null,
    soilMoistureStatus: zone.soil_moisture_status ?? null,
    soilTempC: zone.soil_temp_c ?? null,
    soilTempStatus: zone.soil_temp_status ?? null,
    alerts: zone.alerts ?? [],
    timestamp,
    hasReading: true,
    assignedPlant: null
  };
}

export function mapZonesToLayout(
  latestReading: LatestReading | null,
  settings: LayoutSettings,
  zoneAssignments: Record<string, string> = {},
  profilesById?: Map<string, PlantProfile>
): LayoutResult {
  const slots = buildLayoutSlots(settings);
  const zones = latestReading?.zones ?? [];
  const slotByNormalizedLabel = new Map(
    slots.map((slot) => [normalizeZoneId(slot.visualLabel), slot])
  );
  const assignedByLabel = new Map<string, VisualZone>();
  const unmatchedZones: ZoneReading[] = [];
  const usedLabels = new Set<string>();

  zones.forEach((zone) => {
    const matchingSlot = slotByNormalizedLabel.get(normalizeZoneId(zone.zone_id));
    if (matchingSlot && !usedLabels.has(matchingSlot.visualLabel)) {
      assignedByLabel.set(
        matchingSlot.visualLabel,
        withAssignment(createVisualZone(matchingSlot, zone, latestReading?.timestamp), zoneAssignments, profilesById)
      );
      usedLabels.add(matchingSlot.visualLabel);
      return;
    }

    unmatchedZones.push(zone);
  });

  let unmatchedIndex = 0;

  slots.forEach((slot) => {
    if (assignedByLabel.has(slot.visualLabel)) return;

    const zone = unmatchedZones[unmatchedIndex];
    if (!zone) return;

    assignedByLabel.set(
      slot.visualLabel,
      withAssignment(createVisualZone(slot, zone, latestReading?.timestamp), zoneAssignments, profilesById)
    );
    unmatchedIndex += 1;
  });

  const rows = Array.from({ length: settings.rows }, (_, rowIndex) => {
    const rowLabel = ROW_LETTERS[rowIndex] ?? `R${rowIndex + 1}`;
    const zonesForRow = Array.from({ length: settings.sectionsPerRow }, (__, sectionIndex) => {
      const slot = slots[rowIndex * settings.sectionsPerRow + sectionIndex];
      return assignedByLabel.get(slot.visualLabel) ?? withAssignment(createEmptyVisualZone(slot), zoneAssignments, profilesById);
    });

    return {
      rowLabel,
      zones: zonesForRow
    };
  });

  const overflowZones = unmatchedZones
    .slice(unmatchedIndex)
    .map((zone, index) =>
      withAssignment(
        {
          id: `${zone.node_id ?? 'node'}-${zone.zone_id}-overflow-${index}`,
          visualLabel: zone.zone_id,
          rowLabel: 'Overflow',
          rowIndex: settings.rows,
          section: index + 1,
          nodeId: zone.node_id,
          backendZoneId: zone.zone_id,
          greenhouseId: zone.greenhouse_id,
          soilMoistureRaw: zone.soil_moisture_raw ?? null,
          soilMoisturePct: zone.soil_moisture_pct ?? null,
          soilMoistureStatus: zone.soil_moisture_status ?? null,
          soilTempC: zone.soil_temp_c ?? null,
          soilTempStatus: zone.soil_temp_status ?? null,
          alerts: zone.alerts ?? [],
          timestamp: latestReading?.timestamp,
          hasReading: true,
          assignedPlant: null
        },
        zoneAssignments,
        profilesById
      )
    );

  return {
    slots,
    rows,
    overflowZones
  };
}

function withAssignment(
  zone: VisualZone,
  zoneAssignments: Record<string, string>,
  profilesById?: Map<string, PlantProfile>
): VisualZone {
  const assignedPlant = zoneAssignments[zone.visualLabel] ?? null;
  const assignedPlantProfile = assignedPlant && profilesById ? profilesById.get(assignedPlant) ?? null : null;

  return {
    ...zone,
    assignedPlant,
    assignedPlantProfile,
    assignedPlantMissing: Boolean(assignedPlant && profilesById && !assignedPlantProfile)
  };
}

export function getZoneStatus(zone: VisualZone) {
  if (!zone.hasReading) {
    return {
      tone: 'no-data' as const,
      label: 'No data'
    };
  }

  // Disconnected moisture sensor: never show dry/wet/healthy — stay neutral.
  if (zone.soilMoistureStatus === 'not_connected' || zone.soilMoistureStatus === 'invalid' || zone.soilMoisturePct === null) {
    return {
      tone: 'no-data' as const,
      label: 'Sensor not connected'
    };
  }

  if (zone.alerts.includes('too cold') || zone.alerts.length > 1) {
    return {
      tone: 'alert' as const,
      label: zone.alerts[0] ?? 'Alert'
    };
  }

  if (zone.alerts.includes('too wet') || (zone.soilMoisturePct ?? 0) > 80) {
    return {
      tone: 'wet' as const,
      label: 'Too wet'
    };
  }

  if (zone.alerts.includes('too dry') || (zone.soilMoisturePct ?? 100) < 30) {
    return {
      tone: 'dry' as const,
      label: 'Getting dry'
    };
  }

  return {
    tone: 'good' as const,
    label: 'Good'
  };
}
