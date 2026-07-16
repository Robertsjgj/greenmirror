import { useEffect, useState } from 'react';
import { PlantProfile, applyRequirementToPlantProfile } from '../plantProfiles';
import { CUSTOM_PLANT_ICON, PLANT_ICON_REGISTRY } from '../plantIconRegistry';
import { autofillPlantIcon, autofillPlantName, type PlantProfileDraft } from '../plantProfileAutofill';
import { findPlantRequirementByName, findProvisionalPlantRequirement, requirementRangesMatch } from '../plantRequirements';
import { estimatePlantProfile } from '../services/plantProfileAI';
import type { AiProfileSource } from '../plantAiProfile';

interface PlantEditorSheetProps {
  open: boolean;
  profile: PlantProfile | null;
  isDefault: boolean;
  onClose: () => void;
  onSave: (p: PlantProfile) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
}

function NumberField({
  label, value, onChange, min, max, unit
}: {
  label: string; value?: number; onChange: (v: number | undefined) => void;
  min: number; max: number; unit: string;
}) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--bg-sub)', borderRadius: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <input
          type="number"
          inputMode="numeric"
          value={value ?? ''}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(min, Math.min(max, Number(e.target.value))))}
          style={{
            width: '100%', border: 'none', background: 'transparent', outline: 'none',
            fontFamily: "'Baloo 2', system-ui", fontSize: 24,
            color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', padding: 0,
          }}
        />
        <span style={{ fontSize: 13, color: 'var(--ink-3)', flexShrink: 0 }}>{unit}</span>
      </div>
    </div>
  );
}

function RangeBar({ lo, hi, unit }: { lo: number; hi: number; unit: string }) {
  const left = lo;
  const width = Math.max(0, hi - lo);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: 'relative', height: 8, background: 'var(--bg-sub)', borderRadius: 99 }}>
        <div style={{
          position: 'absolute', left: `${left}%`, width: `${width}%`,
          top: 0, bottom: 0, borderRadius: 99,
          background: 'linear-gradient(90deg, var(--primary), var(--primary-2))',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
        <span>0{unit}</span>
        <span>{unit === '%' ? '100%' : '40°C'}</span>
      </div>
    </div>
  );
}

const EMPTY: PlantProfileDraft = {
  name: '', icon: CUSTOM_PLANT_ICON.icon, moistureMin: undefined, moistureMax: undefined,
  soilTempMin: undefined, soilTempMax: undefined, notes: '', profileSource: 'custom', requiresUserReview: false,
};

export function PlantEditorSheet({ open, profile, isDefault, onClose, onSave, onDelete, onReset }: PlantEditorSheetProps) {
  // Treat profiles with no id (prefill from zone picker) as new, same as null.
  const isNew = !profile || !profile.id;

  const [form, setForm] = useState<PlantProfileDraft>({ ...EMPTY });
  const [rangesEdited, setRangesEdited] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [aiSources, setAiSources] = useState<AiProfileSource[]>([]);

  useEffect(() => {
    if (open) {
      setForm(profile ? { ...profile } : { ...EMPTY });
      const requirement = profile ? findPlantRequirementByName(profile.name) : null;
      setRangesEdited(Boolean(profile && (!requirement || !requirementRangesMatch(profile, requirement))));
      setAiState('idle');
      setAiSources([]);
    }
  }, [open, profile]);

  /**
   * A plant the workbook doesn't have. Ask GreenMirror AI to research it and
   * anchor it to the closest calibrated crop. Runs once the name is finished
   * (on blur), never per keystroke — each estimate costs a web-research call.
   * The user's own edits always win, and a failure just leaves the fields blank
   * for manual entry rather than filling them with something unsupported.
   */
  async function estimateUnknownPlant(name: string) {
    const trimmed = name.trim();
    if (!trimmed || rangesEdited || aiState === 'loading') return;
    if (findPlantRequirementByName(trimmed) || findProvisionalPlantRequirement(trimmed)) return;

    setAiState('loading');
    const result = await estimatePlantProfile(trimmed);
    if (!result) {
      setAiState('failed');
      setAiSources([]);
      return;
    }
    setAiState('idle');
    setAiSources(result.sources);
    setForm((current) => applyRequirementToPlantProfile(current, result.profile, false));
  }

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateName = (name: string) => {
    setForm((current) => {
      const first = autofillPlantName(current, name, rangesEdited);
      if (!first.requiresConfirmation) return first.draft;
      return window.confirm('Replace your edited ranges with the GreenMirror recommended ranges for this plant?')
        ? autofillPlantName(current, name, rangesEdited, true).draft
        : first.draft;
    });
  };

  const selectIcon = (iconId: string) => {
    setForm((current) => {
      const first = autofillPlantIcon(current, iconId, rangesEdited);
      if (!first.requiresConfirmation) return first.draft;
      return window.confirm('Replace your edited ranges with the GreenMirror recommended ranges for this plant?')
        ? autofillPlantIcon(current, iconId, rangesEdited, true).draft
        : first.draft;
    });
  };

  const updateRange = (key: 'moistureMin' | 'moistureMax' | 'soilTempMin' | 'soilTempMax', value: number | undefined) => {
    setRangesEdited(true);
    setForm((current) => ({ ...current, [key]: value, profileSource: 'custom', requiresUserReview: false }));
  };

  const currentRequirement = findPlantRequirementByName(form.name) ?? findProvisionalPlantRequirement(form.name);
  const sourceLabel = form.profileSource === 'greenmirror_spreadsheet'
    ? 'Auto-filled from GreenMirror profile'
    : form.profileSource === 'provisional_estimate'
      ? 'AI-estimated starting range — please review'
      : 'Edited by user';

  const useRecommendedRanges = () => {
    if (!currentRequirement) return;
    setForm((current) => applyRequirementToPlantProfile(current, currentRequirement, Boolean(current.isDefault)));
    setRangesEdited(false);
  };

  const valid =
    (form.name?.trim().length ?? 0) > 0 &&
    typeof form.moistureMin === 'number' && typeof form.moistureMax === 'number' &&
    typeof form.soilTempMin === 'number' && typeof form.soilTempMax === 'number' &&
    form.moistureMin < form.moistureMax && form.soilTempMin < form.soilTempMax && !form.requiresUserReview;

  const handleSave = () => {
    if (!valid) return;
    const name = form.name?.trim();
    if (!name) return;
    const trimmed: PlantProfile = {
      ...form,
      name,
      notes: (form.notes ?? '').trim() || undefined,
    } as PlantProfile;
    if (isNew || !trimmed.id) {
      trimmed.id = trimmed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `plant-${Date.now()}`;
    }
    onSave(trimmed);
  };

  return (
    <>
      <div className={`gm-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`gm-sheet${open ? ' open' : ''}`} style={{ maxHeight: '94%' }}>
        <div className="gm-grab" />
        <div className="gm-sheet-body">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '4px 0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'var(--primary-soft)',
                display: 'grid', placeItems: 'center', fontSize: 26,
              }}>
                {form.icon || '🌱'}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: isDefault ? 'var(--ink-3)' : 'var(--primary)', textTransform: 'uppercase' }}>
                  {isNew ? 'NEW PROFILE' : isDefault ? 'DEFAULT PROFILE' : 'CUSTOM PROFILE'}
                </div>
                <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 24, lineHeight: 1.1, color: 'var(--ink)', marginTop: 1, fontWeight: 800 }}>
                  {isNew ? 'New plant' : (form.name || 'Untitled')}
                </div>
              </div>
            </div>
            <button className="gm-icon-btn" onClick={onClose} aria-label="Close">
              <span style={{ fontSize: 18 }}>✕</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Name */}
            <div>
              <FieldLabel>Name</FieldLabel>
              <input
                value={form.name ?? ''}
                onChange={(e) => updateName(e.target.value)}
                onBlur={(e) => { void estimateUnknownPlant(e.target.value); }}
                placeholder="e.g. Lettuce"
                style={{
                  width: '100%', padding: 14, fontSize: 16,
                  background: 'var(--card)', border: '1px solid var(--line)',
                  borderRadius: 12, outline: 'none', color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
              {aiState === 'loading' && (
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                  ✨ Researching {form.name?.trim()} and comparing it with GreenMirror's plants…
                </div>
              )}
              {aiState === 'failed' && (
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.45 }}>
                  GreenMirror could not find enough reliable information for this plant, so it has not
                  guessed a range. Please enter the moisture and soil-temperature ranges yourself.
                </div>
              )}
            </div>

            {/* Icon */}
            <div>
              <FieldLabel>Icon</FieldLabel>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
                padding: 8, background: 'var(--bg-sub)', borderRadius: 12,
              }}>
                {PLANT_ICON_REGISTRY.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() => selectIcon(definition.id)}
                    aria-label={`Use ${definition.canonicalName} icon`}
                    style={{
                      aspectRatio: '1/1', fontSize: 20,
                      background: form.icon === definition.icon ? 'white' : 'transparent',
                      border: form.icon === definition.icon ? '2px solid var(--primary)' : '2px solid transparent',
                      borderRadius: 10,
                      display: 'grid', placeItems: 'center',
                      cursor: 'pointer',
                      boxShadow: form.icon === definition.icon ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    {definition.icon}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: '10px 12px', borderRadius: 12, background: form.profileSource === 'provisional_estimate' ? '#fff7ed' : 'var(--primary-soft)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700 }}>
              <div>{sourceLabel}</div>
              {form.sourcePlantName && <div style={{ marginTop: 3, fontWeight: 600 }}>Source plant: {form.sourcePlantName}</div>}
              {form.requirementNotes?.map((note) => <div key={note} style={{ marginTop: 3, fontWeight: 600 }}>{note}</div>)}
              {aiSources.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 700 }}>Based on</div>
                  {aiSources.map((source) => (
                    <div key={source.url} style={{ marginTop: 2, fontWeight: 600, overflowWrap: 'anywhere' }}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                        {source.title}
                      </a>
                    </div>
                  ))}
                </div>
              )}
              {currentRequirement && (rangesEdited || form.profileSource === 'custom') && (
                <button type="button" className="gm-btn soft" style={{ marginTop: 8, width: '100%' }} onClick={useRecommendedRanges}>
                  Use GreenMirror recommended ranges
                </button>
              )}
              {form.requiresUserReview && (
                <button type="button" className="gm-btn soft" style={{ marginTop: 8, width: '100%' }} onClick={() => setForm((current) => ({ ...current, requiresUserReview: false }))}>
                  I reviewed these starting ranges
                </button>
              )}
            </div>

            {/* Moisture range */}
            <div>
              <FieldLabel>
                Soil moisture range
                <span style={{ marginLeft: 'auto', color: 'var(--ink-2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                  {form.moistureMin}–{form.moistureMax}%
                </span>
              </FieldLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <NumberField label="Min" unit="%" min={0} max={100}
                             value={form.moistureMin} onChange={(v) => updateRange('moistureMin', v)} />
                <NumberField label="Max" unit="%" min={0} max={100}
                             value={form.moistureMax} onChange={(v) => updateRange('moistureMax', v)} />
              </div>
              {typeof form.moistureMin === 'number' && typeof form.moistureMax === 'number' && <RangeBar lo={Math.min(form.moistureMin, form.moistureMax)} hi={Math.max(form.moistureMin, form.moistureMax)} unit="%" />}
            </div>

            {/* Temp range */}
            <div>
              <FieldLabel>
                Soil temperature range
                <span style={{ marginLeft: 'auto', color: 'var(--ink-2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                  {form.soilTempMin}–{form.soilTempMax}°C
                </span>
              </FieldLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <NumberField label="Min" unit="°C" min={-10} max={45}
                             value={form.soilTempMin} onChange={(v) => updateRange('soilTempMin', v)} />
                <NumberField label="Max" unit="°C" min={-10} max={45}
                             value={form.soilTempMax} onChange={(v) => updateRange('soilTempMax', v)} />
              </div>
              {typeof form.soilTempMin === 'number' && typeof form.soilTempMax === 'number' && <RangeBar lo={((Math.min(form.soilTempMin, form.soilTempMax) + 10) / 55) * 100}
                        hi={((Math.max(form.soilTempMin, form.soilTempMax) + 10) / 55) * 100}
                        unit="°C" />}
            </div>

            {/* Notes */}
            <div>
              <FieldLabel>Notes <span style={{ opacity: 0.6, fontWeight: 500 }}>(optional)</span></FieldLabel>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Care tips, season, anything useful for the next volunteer."
                rows={3}
                style={{
                  width: '100%', padding: 14, fontSize: 14,
                  background: 'var(--card)', border: '1px solid var(--line)',
                  borderRadius: 12, outline: 'none', color: 'var(--ink)',
                  fontFamily: 'inherit', resize: 'none', lineHeight: 1.5,
                }}
              />
            </div>

            {/* Validation hint — full-width wrapping block, not a chip. A chip
                is nowrap, so this long line would push the modal sideways. */}
            {!valid && (form.name?.trim().length ?? 0) > 0 && (
              <div style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12,
                background: 'var(--alert-soft)', color: 'var(--alert)',
                fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, whiteSpace: 'normal', overflowWrap: 'anywhere',
              }}>
                ⚠ Enter valid ranges and review any estimated starting values before saving
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {!isNew && isDefault && (
                <button
                  className="gm-btn ghost"
                  style={{ flexShrink: 0 }}
                  onClick={() => profile && onReset(profile.id)}
                >
                  ↺ Reset
                </button>
              )}
              {!isNew && !isDefault && (
                <button
                  className="gm-btn ghost"
                  style={{ color: 'var(--alert)', borderColor: 'var(--alert-soft)', flexShrink: 0 }}
                  onClick={() => profile && onDelete(profile.id)}
                >
                  ✕ Delete
                </button>
              )}
              <button
                className="gm-btn primary"
                style={{ flex: 1, opacity: valid ? 1 : 0.5 }}
                onClick={handleSave}
                disabled={!valid}
              >
                ✓ {isNew ? 'Add profile' : 'Save changes'}
              </button>
            </div>

            <div style={{ height: 12 }} />
          </div>
        </div>
      </div>
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
      color: 'var(--ink-3)', textTransform: 'uppercase',
      marginBottom: 6, display: 'flex', alignItems: 'center',
    }}>
      {children}
    </div>
  );
}
