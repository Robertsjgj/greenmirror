import { LatestReading, VisualZone } from './zoneLayout';
import type { PlantProfile } from './plantProfiles';

interface SydneyBed {
  id: string;
  label: string;
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
  { id: 'SYD-OUTDOOR-01', label: 'Outdoor 01', x: 9, y: 12, width: 9, height: 8, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-02', label: 'Outdoor 02', x: 21, y: 12, width: 9, height: 8, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-03', label: 'Outdoor 03', referenceCrop: 'Watermelon', x: 13, y: 25, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-04', label: 'Outdoor 04', referenceCrop: 'Squash', x: 13, y: 34, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-05', label: 'Outdoor 05', referenceCrop: 'Zucchini', x: 13, y: 43, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-06', label: 'Outdoor 06', referenceCrop: 'Eggplants', x: 13, y: 52, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-07', label: 'Outdoor 07', referenceCrop: 'Garlic', x: 13, y: 61, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-08', label: 'Outdoor 08', x: 13, y: 70, width: 13, height: 6, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-09', label: 'Outdoor 09', x: 9, y: 84, width: 10, height: 12, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-OUTDOOR-10', label: 'Outdoor 10', x: 21, y: 84, width: 10, height: 12, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-GH-LEFT-01', label: 'GH Left 01', referenceCrop: 'Veggies', x: 37, y: 11, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-LEFT-02', label: 'GH Left 02', referenceCrop: 'Veggies', x: 43, y: 11, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-LEFT-03', label: 'GH Left 03', referenceCrop: 'Veggies', x: 37, y: 17, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-LEFT-04', label: 'GH Left 04', referenceCrop: 'Veggies', x: 43, y: 17, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-LEFT-05', label: 'GH Left 05', referenceCrop: 'Beans', x: 37, y: 27, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-LEFT-06', label: 'GH Left 06', referenceCrop: 'Peppers', x: 37, y: 37, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-LEFT-07', label: 'GH Left 07', referenceCrop: 'Carrots', x: 37, y: 47, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-LEFT-08', label: 'GH Left 08', referenceCrop: 'Onions', x: 37, y: 57, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-LEFT-09', label: 'GH Left 09', referenceCrop: 'Strawberries', x: 37, y: 67, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-LEFT-10', label: 'GH Left 10', referenceCrop: 'Broccoli', x: 37, y: 77, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-LEFT-11', label: 'GH Left 11', referenceCrop: 'Broccoli', x: 37, y: 87, width: 13, height: 7, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-MID-01', label: 'GH Mid 01', referenceCrop: 'Cucumbers', x: 62, y: 50, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-MID-02', label: 'GH Mid 02', referenceCrop: 'Cucumbers', x: 68, y: 50, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-MID-03', label: 'GH Mid 03', referenceCrop: 'Cucumbers', x: 62, y: 57, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-MID-04', label: 'GH Mid 04', referenceCrop: 'Cucumbers', x: 68, y: 57, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-MID-05', label: 'GH Mid 05', referenceCrop: 'Cucumbers', x: 62, y: 64, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-MID-06', label: 'GH Mid 06', referenceCrop: 'Cucumbers', x: 68, y: 64, width: 5, height: 5, area: 'greenhouse', shape: 'circle' },
  { id: 'SYD-GH-RIGHT-01', label: 'GH Right 01', referenceCrop: 'Radishes', x: 88, y: 11, width: 8, height: 14, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-RIGHT-02', label: 'GH Right 02', x: 88, y: 30, width: 8, height: 14, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-GH-RIGHT-03', label: 'GH Right 03', x: 88, y: 49, width: 8, height: 14, area: 'greenhouse', shape: 'rect' },
  { id: 'SYD-CORN-01', label: 'Corn Bed', referenceCrop: 'Corn', x: 75, y: 86, width: 18, height: 4, area: 'outdoor', shape: 'rect' },
  { id: 'SYD-PUMPKIN-01', label: 'Pumpkin 01', referenceCrop: 'Pumpkin Patch', x: 20, y: 94, width: 6, height: 16, area: 'pumpkin', shape: 'rect' },
  { id: 'SYD-PUMPKIN-02', label: 'Pumpkin 02', referenceCrop: 'Pumpkin Patch', x: 38, y: 91, width: 14, height: 5, area: 'pumpkin', shape: 'rect' },
  { id: 'SYD-SHED-BED-01', label: 'Shed Bed', x: 38, y: 101, width: 27, height: 10, area: 'utility', shape: 'rect' }
];

export function mapZonesToSydneyLayout(
  latestReading: LatestReading | null,
  zoneAssignments: Record<string, string> = {},
  profilesById?: Map<string, PlantProfile>
): SydneyVisualZone[] {
  const readingsByZone = new Map(
    (latestReading?.zones ?? []).map((zone) => [normalizeZoneId(zone.zone_id), zone])
  );
  const orderedReadings = latestReading?.zones ?? [];

  return SYDNEY_BEDS.map((bed, index) => {
    const reading = readingsByZone.get(normalizeZoneId(bed.id)) ?? orderedReadings[index];
    const assignedPlant = zoneAssignments[bed.id] ?? null;
    const assignedPlantProfile = assignedPlant && profilesById ? profilesById.get(assignedPlant) ?? null : null;

    return {
      id: reading ? `${reading.node_id ?? 'node'}-${reading.zone_id}-${bed.id}` : `empty-${bed.id}`,
      visualLabel: bed.id,
      displayLabel: bed.label,
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

function normalizeZoneId(zoneId: string | undefined) {
  return (zoneId ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
