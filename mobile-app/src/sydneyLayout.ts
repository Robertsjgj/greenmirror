import { LatestReading, VisualZone } from './zoneLayout';
import type { PlantProfile } from './plantProfiles';
import { getZoneDisplayName, resolveZoneId, resolveAssignmentKeys } from './zoneRegistry';

interface SydneyBed {
  id: string;
  referenceCrop?: string;
  area: 'greenhouse' | 'outdoor' | 'pumpkin' | 'utility';
  shape: 'rect' | 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SydneyVisualZone extends VisualZone {
  area: SydneyBed['area'];
  shape: SydneyBed['shape'];
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SYDNEY_BEDS: SydneyBed[] = [
  { id: 'SYD-OUTSIDE-01', x: 9, y: 12, width: 9, height: 8, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-02', x: 21, y: 12, width: 9, height: 8, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-03', referenceCrop: 'Watermelon', x: 13, y: 25, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-04', referenceCrop: 'Squash', x: 13, y: 34, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-05', referenceCrop: 'Zucchini', x: 13, y: 43, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-06', referenceCrop: 'Eggplants', x: 13, y: 52, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-07', referenceCrop: 'Garlic', x: 13, y: 61, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-08', x: 13, y: 70, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-09', x: 9, y: 84, width: 10, height: 12, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTSIDE-10', x: 21, y: 84, width: 10, height: 12, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-INSIDE-LEFT-01', referenceCrop: 'Veggies', x: 37, y: 11, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-LEFT-02', referenceCrop: 'Veggies', x: 43, y: 11, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-LEFT-03', referenceCrop: 'Veggies', x: 37, y: 17, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-LEFT-04', referenceCrop: 'Veggies', x: 43, y: 17, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-LEFT-05', referenceCrop: 'Beans', x: 37, y: 27, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-LEFT-06', referenceCrop: 'Peppers', x: 37, y: 37, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-LEFT-07', referenceCrop: 'Carrots', x: 37, y: 47, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-LEFT-08', referenceCrop: 'Onions', x: 37, y: 57, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-LEFT-09', referenceCrop: 'Strawberries', x: 37, y: 67, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-LEFT-10', referenceCrop: 'Broccoli', x: 37, y: 77, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-LEFT-11', referenceCrop: 'Broccoli', x: 37, y: 87, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-CENTER-01', referenceCrop: 'Cucumbers', x: 62, y: 50, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-CENTER-02', referenceCrop: 'Cucumbers', x: 68, y: 50, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-CENTER-03', referenceCrop: 'Cucumbers', x: 62, y: 57, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-CENTER-04', referenceCrop: 'Cucumbers', x: 68, y: 57, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-CENTER-05', referenceCrop: 'Cucumbers', x: 62, y: 64, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-CENTER-06', referenceCrop: 'Cucumbers', x: 68, y: 64, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-INSIDE-RIGHT-01', referenceCrop: 'Radishes', x: 88, y: 11, width: 8, height: 14, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-RIGHT-02', x: 88, y: 30, width: 8, height: 14, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-INSIDE-RIGHT-03', x: 88, y: 49, width: 8, height: 14, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-CORN-01', referenceCrop: 'Corn', x: 75, y: 86, width: 18, height: 4, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-PUMPKIN-01', referenceCrop: 'Pumpkin Patch', x: 20, y: 94, width: 6, height: 16, area: 'pumpkin', shape: 'rect' },
  { id: 'SYD-PUMPKIN-02', referenceCrop: 'Pumpkin Patch', x: 38, y: 91, width: 14, height: 5, area: 'pumpkin', shape: 'rect' },
  { id: 'SYD-SHED-BED-01', x: 38, y: 101, width: 27, height: 10, area: 'utility', shape: 'rect' }
];

export function mapZonesToSydneyLayout(
  latestReading: LatestReading | null,
  zoneAssignments: Record<string, string> = {},
  profilesById?: Map<string, PlantProfile>
): SydneyVisualZone[] {
  // Match readings to beds by canonical ID so legacy IDs (SYD-GH-LEFT-01) line
  // up with the new bed IDs (SYD-INSIDE-LEFT-01).
  const readingsByZone = new Map(
    (latestReading?.zones ?? []).map((zone) => [canonicalKey(zone.zone_id), zone])
  );
  const orderedReadings = latestReading?.zones ?? [];
  const assignments = resolveAssignmentKeys(zoneAssignments);

  return SYDNEY_BEDS.map((bed, index) => {
    const reading = readingsByZone.get(canonicalKey(bed.id)) ?? orderedReadings[index];
    const assignedPlant = assignments[bed.id] ?? null;
    const assignedPlantProfile = assignedPlant && profilesById ? profilesById.get(assignedPlant) ?? null : null;

    return {
      id: reading ? `${reading.node_id ?? 'node'}-${reading.zone_id}-${bed.id}` : `empty-${bed.id}`,
      visualLabel: bed.id,
      displayLabel: getZoneDisplayName(bed.id),
      referenceCrop: bed.referenceCrop,
      rowLabel: bed.area,
      rowIndex: index,
      section: index + 1,
      nodeId: reading?.node_id,
      backendZoneId: reading?.zone_id,
      greenhouseId: reading?.greenhouse_id,
      soilMoistureRaw: reading?.soil_moisture_raw ?? null,
      soilMoisturePct: reading?.soil_moisture_pct ?? null,
      soilTempC: reading?.soil_temp_c ?? null,
      soilTempStatus: reading?.soil_temp_status ?? null,
      alerts: reading?.alerts ?? [],
      timestamp: latestReading?.timestamp,
      hasReading: Boolean(reading),
      assignedPlant,
      assignedPlantProfile,
      assignedPlantMissing: Boolean(assignedPlant && profilesById && !assignedPlantProfile),
      area: bed.area,
      shape: bed.shape,
      x: bed.x,
      y: bed.y,
      width: bed.width,
      height: bed.height
    };
  });
}

// Canonical match key: migrate legacy IDs, then strip separators/case.
function canonicalKey(zoneId: string | undefined) {
  return resolveZoneId(zoneId).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
