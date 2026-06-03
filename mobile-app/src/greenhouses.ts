/**
 * Canonical greenhouse site definitions.
 *
 * Single source of truth for greenhouse IDs, display names, and map kinds.
 * All Firestore reads/writes must use these IDs — never bare strings.
 *
 * Official IDs:
 *   sydney-greenhouse   -> Sydney, Nova Scotia, Canada (default / simulation target)
 *   truro-greenhouse    -> Truro, Nova Scotia, Canada
 */

export type MapKind = 'truro' | 'sydney';

export interface GreenhouseMeta {
  id: string;
  name: string;
  region: string;
  city: string;
  province: string;
  country: string;
  latitude: number;
  longitude: number;
  mapKind: MapKind;
}

export const GREENHOUSES: Record<MapKind, GreenhouseMeta> = {
  sydney: {
    id: 'sydney-greenhouse',
    name: 'Sydney',
    region: 'Sydney, Nova Scotia, Canada',
    city: 'Sydney',
    province: 'Nova Scotia',
    country: 'Canada',
    latitude: 46.1368,
    longitude: -60.1942,
    mapKind: 'sydney',
  },
  truro: {
    id: 'truro-greenhouse',
    name: 'Truro',
    region: 'Truro, Nova Scotia, Canada',
    city: 'Truro',
    province: 'Nova Scotia',
    country: 'Canada',
    latitude: 45.3650,
    longitude: -63.2869,
    mapKind: 'truro',
  },
};

/** Default greenhouse ID — used when no site is selected and by the simulator. */
export const DEFAULT_GREENHOUSE_ID = 'sydney-greenhouse';

/** Default map kind — must stay in sync with DEFAULT_GREENHOUSE_ID. */
export const DEFAULT_MAP_KIND: MapKind = 'sydney';

/** Returns the canonical Firestore document ID for a given map kind. */
export function mapKindToGreenhouseId(kind: MapKind): string {
  return GREENHOUSES[kind].id;
}

/**
 * Returns the map kind for a given greenhouse ID.
 * Falls back to DEFAULT_MAP_KIND if the ID is unrecognised
 * (e.g. legacy "greenmirror-demo" data still in Firestore).
 */
export function greenhouseIdToMapKind(id: string): MapKind {
  for (const meta of Object.values(GREENHOUSES)) {
    if (meta.id === id) return meta.mapKind;
  }
  return DEFAULT_MAP_KIND;
}
