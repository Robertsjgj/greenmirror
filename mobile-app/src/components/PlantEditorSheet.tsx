import { useEffect, useState } from 'react';
import { PlantProfile } from '../plantProfiles';

const PROFILE_ICONS = [
  '🌱','🍅','🌶️','🥕','🥬','🌿','🥒','🧅','🍓','🥦','🥔','🌽',
  '🫑','🍆','🧄','🫛','🌾','🪴','🌸','🌻','🫐','🍎','🍋','🌳',
];

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
  label: string; value: number; onChange: (v: number) => void;
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
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
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

const EMPTY: Omit<PlantProfile, 'id'> = {
  name: '', icon: '🌱', moistureMin: 50, moistureMax: 70, soilTempMin: 15, soilTempMax: 25, notes: ''
};

export function PlantEditorSheet({ open, profile, isDefault, onClose, onSave, onDelete, onReset }: PlantEditorSheetProps) {
  const isNew = !profile;

  const [form, setForm] = useState<Omit<PlantProfile, 'id'> & { id?: string }>({ ...EMPTY });

  useEffect(() => {
    if (open) {
      setForm(profile ? { ...profile } : { ...EMPTY });
    }
  }, [open, profile]);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid =
    (form.name?.trim().length ?? 0) > 0 &&
    (form.moistureMin ?? 0) < (form.moistureMax ?? 100) &&
    (form.soilTempMin ?? -10) < (form.soilTempMax ?? 45);

  const handleSave = () => {
    if (!valid) return;
    const name = form.name?.trim();
    if (!name) return;
    const trimmed: PlantProfile = {
      ...form as PlantProfile,
      name,
      notes: (form.notes ?? '').trim() || undefined,
    };
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
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. Lettuce"
                style={{
                  width: '100%', padding: 14, fontSize: 16,
                  background: 'var(--card)', border: '1px solid var(--line)',
                  borderRadius: 12, outline: 'none', color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Icon */}
            <div>
              <FieldLabel>Icon</FieldLabel>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
                padding: 8, background: 'var(--bg-sub)', borderRadius: 12,
              }}>
                {PROFILE_ICONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => update('icon', emoji)}
                    style={{
                      aspectRatio: '1/1', fontSize: 20,
                      background: form.icon === emoji ? 'white' : 'transparent',
                      border: form.icon === emoji ? '2px solid var(--primary)' : '2px solid transparent',
                      borderRadius: 10,
                      display: 'grid', placeItems: 'center',
                      cursor: 'pointer',
                      boxShadow: form.icon === emoji ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
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
                             value={form.moistureMin ?? 0} onChange={(v) => update('moistureMin', v)} />
                <NumberField label="Max" unit="%" min={0} max={100}
                             value={form.moistureMax ?? 100} onChange={(v) => update('moistureMax', v)} />
              </div>
              <RangeBar lo={Math.min(form.moistureMin ?? 0, form.moistureMax ?? 100)} hi={Math.max(form.moistureMin ?? 0, form.moistureMax ?? 100)} unit="%" />
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
                             value={form.soilTempMin ?? 0} onChange={(v) => update('soilTempMin', v)} />
                <NumberField label="Max" unit="°C" min={-10} max={45}
                             value={form.soilTempMax ?? 40} onChange={(v) => update('soilTempMax', v)} />
              </div>
              <RangeBar lo={((Math.min(form.soilTempMin ?? 0, form.soilTempMax ?? 40) + 10) / 55) * 100}
                        hi={((Math.max(form.soilTempMin ?? 0, form.soilTempMax ?? 40) + 10) / 55) * 100}
                        unit="°C" />
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

            {/* Validation hint */}
            {!valid && (form.name?.trim().length ?? 0) > 0 && (
              <div className="gm-chip alert" style={{ alignSelf: 'flex-start' }}>
                ⚠ Min must be lower than max
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
