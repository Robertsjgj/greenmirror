import { describe, expect, it } from 'vitest';
import {
  CUSTOM_PLANT_ICON, findPlantIconByName, findPlantIconByValue,
  getCanonicalPlantNameByIcon, normalizePlantName, plantAliasConflicts,
  PLANT_ICON_REGISTRY, syncPlantIcon, syncPlantName,
} from './plantIconRegistry';

describe('plant icon registry', () => {
  it.each(['pepper', 'peppers', 'bell pepper', 'bell peppers'])('maps %s to pepper', (name) => {
    expect(findPlantIconByName(name)?.id).toBe('pepper');
  });

  it.each(['tomato', 'tomatoes'])('maps %s to tomato', (name) => {
    expect(findPlantIconByName(name)?.id).toBe('tomato');
  });

  it('matches case-insensitively and ignores surrounding or repeated whitespace', () => {
    expect(normalizePlantName('  BELL   Peppers  ')).toBe('bell peppers');
    expect(findPlantIconByName('  BELL   Peppers  ')?.id).toBe('pepper');
  });

  it('fills canonical names when an icon is selected', () => {
    expect(syncPlantIcon('pepper')?.name).toBe('Bell peppers');
    expect(syncPlantIcon('tomato')?.name).toBe('Tomatoes');
    expect(getCanonicalPlantNameByIcon('pepper')).toBe('Bell peppers');
  });

  it('updates from one recognized name to another deterministically', () => {
    expect(syncPlantName('pepper').iconId).toBe('pepper');
    expect(syncPlantName('tomatoes').iconId).toBe('tomato');
  });

  it('preserves custom names and selects the existing generic icon', () => {
    const result = syncPlantName('  My trial crop  ');
    expect(result.name).toBe('  My trial crop  ');
    expect(result.iconId).toBeNull();
    expect(result.icon).toBe(CUSTOM_PLANT_ICON.icon);
    expect(findPlantIconByName(result.name)).toBeNull();
  });

  it('initializes a known existing assignment from its stored icon and name', () => {
    const tomato = findPlantIconByName('Tomatoes');
    expect(findPlantIconByValue(tomato?.icon)?.canonicalName).toBe('Tomatoes');
  });

  it('has canonical names and conflict-free aliases for every supported icon', () => {
    expect(PLANT_ICON_REGISTRY.every((definition) => definition.canonicalName.trim().length > 0)).toBe(true);
    expect(plantAliasConflicts()).toEqual([]);
  });
});
