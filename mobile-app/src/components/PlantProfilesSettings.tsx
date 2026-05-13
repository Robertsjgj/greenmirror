import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { PlantProfile, isDefaultPlantProfile, normalizePlantProfile } from '../plantProfiles';

interface PlantProfilesSettingsProps {
  profiles: PlantProfile[];
  onProfilesChange: (profiles: PlantProfile[]) => void;
}

type ProfileDraft = Omit<PlantProfile, 'id'> & {
  id?: string;
};

const emptyDraft: ProfileDraft = {
  name: '',
  moistureMin: 45,
  moistureMax: 70,
  soilTempMin: 12,
  soilTempMax: 25,
  notes: ''
};

export function PlantProfilesSettings({ profiles, onProfilesChange }: PlantProfilesSettingsProps) {
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingProfile = editingId ? profiles.find((profile) => profile.id === editingId) : null;
  const canSave = draft.name.trim().length > 0;

  const startEdit = (profile: PlantProfile) => {
    if (isDefaultPlantProfile(profile.id)) return;
    setEditingId(profile.id);
    setDraft(profile);
  };

  const resetDraft = () => {
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const saveDraft = () => {
    const normalized = normalizePlantProfile(draft);
    if (!normalized || isDefaultPlantProfile(normalized.id)) return;

    onProfilesChange(
      editingProfile
        ? profiles.map((profile) => (profile.id === editingProfile.id ? normalized : profile))
        : [...profiles, normalized]
    );
    resetDraft();
  };

  const deleteProfile = (profileId: string) => {
    if (isDefaultPlantProfile(profileId)) return;
    onProfilesChange(profiles.filter((profile) => profile.id !== profileId));
    if (editingId === profileId) resetDraft();
  };

  const updateDraft = (key: keyof ProfileDraft, value: string | number) => {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  return (
    <div className="mt-4 border-t border-stone-100 pt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-stone-800">Plant Profiles</h3>
          <p className="text-sm text-stone-500">Saved locally on this device.</p>
        </div>
        {editingId && (
          <button
            type="button"
            onClick={resetDraft}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-extrabold text-stone-600"
          >
            New
          </button>
        )}
      </div>

      <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {profiles.map((profile) => {
          const isDefault = isDefaultPlantProfile(profile.id);

          return (
            <div key={profile.id} className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-100">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-stone-800">{profile.name}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    {profile.moistureMin}-{profile.moistureMax}% | {profile.soilTempMin}-{profile.soilTempMax}C
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!isDefault && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(profile)}
                        className="rounded-lg bg-white px-2 py-1 text-[10px] font-extrabold text-stone-600 shadow-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProfile(profile.id)}
                        className="rounded-lg bg-rose-50 p-1.5 text-rose-600 shadow-sm"
                        aria-label={`Delete ${profile.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isDefault && (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">Default</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Name</span>
            <input
              value={draft.name}
              onChange={(event) => updateDraft('name', event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm font-bold text-stone-800 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <NumberField label="Water Min" value={draft.moistureMin} onChange={(value) => updateDraft('moistureMin', value)} />
          <NumberField label="Water Max" value={draft.moistureMax} onChange={(value) => updateDraft('moistureMax', value)} />
          <NumberField label="Temp Min" value={draft.soilTempMin} onChange={(value) => updateDraft('soilTempMin', value)} />
          <NumberField label="Temp Max" value={draft.soilTempMax} onChange={(value) => updateDraft('soilTempMax', value)} />
          <label className="col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Notes</span>
            <input
              value={draft.notes ?? ''}
              onChange={(event) => updateDraft('notes', event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm font-medium text-stone-700 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={!canSave}
          onClick={saveDraft}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-extrabold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editingId ? 'Save Profile' : 'Add Profile'}
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-10 w-full rounded-xl border border-stone-200 px-3 text-sm font-bold text-stone-800 outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}
