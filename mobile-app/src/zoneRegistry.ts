/**
 * Central zone registry — the single source of truth for GreenMirror zone IDs.
 *
 * Every physical bed has exactly ONE canonical technical ID. Users never see
 * these IDs in normal views; they see the friendly `displayName` (e.g.
 * "Greenhouse Bed 1"). Technical IDs appear only in the Advanced / Debug
 * details of the zone sheet.
 *
 * Naming standard
 *   Inside greenhouse beds : SYD-INSIDE-LEFT-NN | SYD-INSIDE-CENTER-NN | SYD-INSIDE-RIGHT-NN
 *   Outdoor beds           : SYD-OUTSIDE-NN
 *   Special beds           : SYD-CORN-01, SYD-PUMPKIN-01/02, SYD-SHED-BED-01
 *
 * Backward compatibility
 *   Old IDs (SYD-GH-LEFT-01, GH-LEFT-01, OUTDOOR-01, …) are migrated to the new
 *   canonical IDs by `resolveZoneId`, so existing localStorage / Firestore data
 *   keeps working and never produces duplicate-looking zones.
 */

export type ZoneArea = 'inside' | 'outside' | 'other';

export interface ZoneInfo {
  /** Canonical technical ID (e.g. "SYD-INSIDE-LEFT-01"). */
  id: string;
  /** User-facing display name (e.g. "Greenhouse Bed 1"). */
  displayName: string;
  /** Area classification used for inside/outside averages. */
  area: ZoneArea;
  /** Physical grouping (greenhouse-left, outdoor, corn, …). */
  group: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildRegistry(): ZoneInfo[] {
  const list: ZoneInfo[] = [];

  // Inside greenhouse beds — numbered sequentially as "Greenhouse Bed N".
  const insideGroups: Array<[prefix: string, count: number, group: string]> = [
    ['SYD-INSIDE-LEFT', 11, 'greenhouse-left'],
    ['SYD-INSIDE-CENTER', 6, 'greenhouse-center'],
    ['SYD-INSIDE-RIGHT', 3, 'greenhouse-right'],
  ];
  let bedNo = 0;
  for (const [prefix, count, group] of insideGroups) {
    for (let i = 1; i <= count; i += 1) {
      bedNo += 1;
      list.push({ id: `${prefix}-${pad(i)}`, displayName: `Greenhouse Bed ${bedNo}`, area: 'inside', group });
    }
  }

  // Outdoor beds — "Outdoor Bed N".
  for (let i = 1; i <= 10; i += 1) {
    list.push({ id: `SYD-OUTSIDE-${pad(i)}`, displayName: `Outdoor Bed ${i}`, area: 'outside', group: 'outdoor' });
  }

  // Special beds keep their semantic names.
  list.push({ id: 'SYD-CORN-01', displayName: 'Corn Bed', area: 'outside', group: 'corn' });
  list.push({ id: 'SYD-PUMPKIN-01', displayName: 'Pumpkin Bed 1', area: 'outside', group: 'pumpkin' });
  list.push({ id: 'SYD-PUMPKIN-02', displayName: 'Pumpkin Bed 2', area: 'outside', group: 'pumpkin' });
  list.push({ id: 'SYD-SHED-BED-01', displayName: 'Shed Bed', area: 'other', group: 'shed' });

  return list;
}

export const ZONE_REGISTRY: ZoneInfo[] = buildRegistry();

const BY_ID = new Map<string, ZoneInfo>(ZONE_REGISTRY.map((z) => [z.id, z]));

/**
 * Explicit legacy aliases for the documented migration cases. The generic
 * prefix rewrites in `resolveZoneId` already cover these, but they are listed
 * here for clarity and testability.
 */
export const LEGACY_ZONE_ALIASES: Record<string, string> = {
  'SYD-GH-LEFT-01': 'SYD-INSIDE-LEFT-01',
  'SYD-GH-LEFT-02': 'SYD-INSIDE-LEFT-02',
};

/**
 * Resolve any historical zone ID to its canonical form. Idempotent — passing a
 * canonical ID returns it unchanged.
 */
export function resolveZoneId(id?: string | null): string {
  if (!id) return '';
  const trimmed = id.trim();
  if (LEGACY_ZONE_ALIASES[trimmed]) return LEGACY_ZONE_ALIASES[trimmed];

  return trimmed
    .replace(/^SYD-GH-LEFT-/i, 'SYD-INSIDE-LEFT-')
    .replace(/^SYD-GH-MID-/i, 'SYD-INSIDE-CENTER-')
    .replace(/^SYD-GH-RIGHT-/i, 'SYD-INSIDE-RIGHT-')
    .replace(/^SYD-OUTDOOR-/i, 'SYD-OUTSIDE-')
    .replace(/^GH-LEFT-/i, 'SYD-INSIDE-LEFT-')
    .replace(/^GH-MID-/i, 'SYD-INSIDE-CENTER-')
    .replace(/^GH-RIGHT-/i, 'SYD-INSIDE-RIGHT-')
    .replace(/^OUTDOOR-/i, 'SYD-OUTSIDE-');
}

/** Registry entry for a zone ID (after migration), or undefined if unknown. */
export function getZoneInfo(id?: string | null): ZoneInfo | undefined {
  return BY_ID.get(resolveZoneId(id));
}

/** Friendly display name; falls back to the raw ID when unknown. */
export function getZoneDisplayName(id?: string | null): string {
  const info = getZoneInfo(id);
  if (info) return info.displayName;
  return id ?? '';
}

/** Area classification (inside/outside/other) for inside/outside averages. */
export function getZoneArea(id?: string | null): ZoneArea {
  const info = getZoneInfo(id);
  if (info) return info.area;
  const upper = resolveZoneId(id).toUpperCase();
  if (upper.includes('-INSIDE-')) return 'inside';
  if (upper.includes('-OUTSIDE-')) return 'outside';
  return 'other';
}

/**
 * Rewrite the keys of a zone-keyed map (e.g. plant assignments persisted under
 * old IDs) to canonical IDs, so lookups by canonical bed ID resolve correctly.
 *
 * When one bed is present under both a legacy and a canonical key, the
 * canonical entry wins regardless of iteration order — it is the one the app
 * writes today, so it is the more recent of the two.
 */
export function resolveAssignmentKeys(
  assignments: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(assignments)) {
    const canonical = resolveZoneId(key);
    if (key === canonical || !(canonical in out)) {
      out[canonical] = value;
    }
  }
  return out;
}

/**
 * True when `assignments` holds any key that is not already canonical — i.e.
 * the stored document predates the zone-ID rename and needs migrating.
 */
export function hasLegacyAssignmentKeys(
  assignments: Record<string, string>
): boolean {
  return Object.keys(assignments).some((key) => key !== resolveZoneId(key));
}

/**
 * Every key under which a bed's assignment may be stored: its canonical ID plus
 * any legacy IDs still present in `assignments`.
 *
 * Writes use the canonical ID, but a bed assigned before the rename is stored
 * under a legacy one. Clearing has to remove all of them — deleting only the
 * canonical key leaves the legacy key behind, and the bed keeps its plant.
 */
export function assignmentKeysForZone(
  assignments: Record<string, string>,
  zoneKey: string
): string[] {
  const canonical = resolveZoneId(zoneKey);
  const stored = Object.keys(assignments).filter(
    (key) => resolveZoneId(key) === canonical
  );
  return stored.length > 0 ? stored : [canonical];
}
