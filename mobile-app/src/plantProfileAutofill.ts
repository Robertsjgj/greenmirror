import type { PlantProfile } from './plantProfiles';
import { applyRequirementToPlantProfile } from './plantProfiles';
import { CUSTOM_PLANT_ICON, syncPlantIcon, syncPlantName } from './plantIconRegistry';
import { findPlantRequirementByIcon, findPlantRequirementByName, findProvisionalPlantRequirement, type PlantRequirementProfile } from './plantRequirements';

export type PlantProfileDraft = Partial<PlantProfile> & { name: string; icon?: string };

export interface PlantAutofillResult {
  draft: PlantProfileDraft;
  requirement: PlantRequirementProfile | null;
  replacedRanges: boolean;
  requiresConfirmation: boolean;
}

function apply(draft: PlantProfileDraft, requirement: PlantRequirementProfile): PlantProfileDraft {
  return applyRequirementToPlantProfile(draft, requirement, Boolean(draft.isDefault));
}

/**
 * Metadata that only makes sense while a profile is tied to a workbook or AI
 * source. When a plant becomes unknown/custom it must be cleared, or a source
 * plant from a previously-typed name (e.g. "Corn") lingers as a ghost label
 * over an unrelated plant.
 */
const CLEARED_REQUIREMENT_META = {
  sourcePlantName: undefined,
  requirementNotes: undefined,
  requiresUserReview: false,
  preferredSoilTempMin: undefined,
  preferredSoilTempMax: undefined,
  toleratedSoilTempMin: undefined,
  toleratedSoilTempMax: undefined,
} as const;

export function autofillPlantName(
  current: PlantProfileDraft,
  value: string,
  rangesEdited: boolean,
  replaceEditedRanges = false,
): PlantAutofillResult {
  const icon = syncPlantName(value);
  const requirement = findPlantRequirementByName(value) ?? findProvisionalPlantRequirement(value);
  const named = { ...current, name: value, icon: icon.icon };
  if (!requirement) {
    const draft = rangesEdited
      ? { ...named, ...CLEARED_REQUIREMENT_META, profileSource: 'custom' as const }
      : clearUnknownPlantRanges(named);
    return { draft, requirement: null, replacedRanges: false, requiresConfirmation: false };
  }
  if (rangesEdited && !replaceEditedRanges) {
    return { draft: { ...named, profileSource: 'custom', sourcePlantName: requirement.sourcePlantName }, requirement, replacedRanges: false, requiresConfirmation: true };
  }
  return { draft: apply(named, requirement), requirement, replacedRanges: true, requiresConfirmation: false };
}

export function autofillPlantIcon(
  current: PlantProfileDraft,
  iconId: string,
  rangesEdited: boolean,
  replaceEditedRanges = false,
): PlantAutofillResult {
  const icon = syncPlantIcon(iconId);
  if (!icon) return { draft: current, requirement: null, replacedRanges: false, requiresConfirmation: false };
  const requirement = findPlantRequirementByIcon(iconId) ?? findProvisionalPlantRequirement(icon.name);
  const named = { ...current, name: requirement?.canonicalName ?? icon.name, icon: icon.icon };
  if (!requirement) {
    return {
      draft: { ...named, ...CLEARED_REQUIREMENT_META, moistureMin: undefined, moistureMax: undefined, soilTempMin: undefined, soilTempMax: undefined, profileSource: 'custom' },
      requirement: null, replacedRanges: false, requiresConfirmation: false,
    };
  }
  if (rangesEdited && !replaceEditedRanges) {
    return { draft: { ...named, profileSource: 'custom', sourcePlantName: requirement.sourcePlantName }, requirement, replacedRanges: false, requiresConfirmation: true };
  }
  return { draft: apply(named, requirement), requirement, replacedRanges: true, requiresConfirmation: false };
}

export function clearUnknownPlantRanges(draft: PlantProfileDraft): PlantProfileDraft {
  return { ...draft, ...CLEARED_REQUIREMENT_META, icon: CUSTOM_PLANT_ICON.icon, moistureMin: undefined, moistureMax: undefined, soilTempMin: undefined, soilTempMax: undefined, profileSource: 'custom' };
}
