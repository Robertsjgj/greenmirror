import { useState } from 'react';
import { PlantProfile, evaluateZoneAgainstPlant } from '../plantProfiles';
import { VisualZone } from '../zoneLayout';

interface ZoneDetailSheetProps {
  zone: VisualZone | null;
  plantProfiles: PlantProfile[];
  profilesById: Map<string, PlantProfile>;
  onAssignPlant: (zoneKey: string, plantId: string | null) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
  onWaterZone: (zone: VisualZone, amountMl: number) => void;
}

type Tone = 'good' | 'dry' | 'wet' | 'alert' | 'nodata';

const STATUS_COLOR: Record<Tone, string> = {
  good:   'var(--good)',
  dry:    'var(--dry)',
  wet:    'var(--wet)',
  alert:  'var(--alert)',
  nodata: 'var(--nodata)',
};

const STATUS_LABEL: Record<Tone, string> = {
  good:   'Good',
  dry:    'Getting dry',
  wet:    'Too wet',
  alert:  'Alert',
  nodata: 'No data',
};

// Strip site prefix for compact display: "SYD-GH-LEFT-05" → "GH-LEFT-05"
function shortId(visualLabel: string): string {
  return visualLabel.startsWith('SYD-') ? visualLabel.slice(4) : visualLabel;
}

// SVG donut ring gauge
const RING_R = 34;
const RING_STROKE = 9;
const RING_CIRC = 2 * Math.PI * RING_R;

function Ring({ value, tone, size = 88 }: { value: number | null; tone: Tone; size?: number }) {
  const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
  const offset = RING_CIRC * (1 - pct / 100);
  const color = STATUS_COLOR[tone];

  return (
    <div className="gm-ring-wrap" style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 88 88" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="44" cy="44" r={RING_R} fill="none" stroke="var(--line)" strokeWidth={RING_STROKE} />
        {value != null && (
          <circle
            cx="44" cy="44" r={RING_R}
            fill="none"
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset .5s ease' }}
          />
        )}
      </svg>
      <div className="gm-ring-center">
        <div style={{
          fontFamily: "'Baloo 2', system-ui", fontSize: 18, fontWeight: 800, lineHeight: 1,
          color: value != null ? color : 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value != null ? `${value}%` : '—'}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink-3)', lineHeight: 1 }}>
          MOISTURE
        </div>
      </div>
    </div>
  );
}

// Horizontal range bar with marker dot
function RangeBlock({
  label, min, max, value, unit, tone,
}: {
  label: string; min: number; max: number; value: number | null; unit: string; tone: Tone;
}) {
  const lo = Math.min(0, min);
  const hi = Math.max(value ?? 0, max);
  const span = Math.max(20, hi - lo);
  const barLeft = ((min - lo) / span) * 100;
  const barWidth = ((max - min) / span) * 100;
  const markerPos = value != null ? ((value - lo) / span) * 100 : null;

  return (
    <div style={{ padding: '10px 12px', background: 'var(--bg-sub)', borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
          {min}–{max}{unit}
        </span>
      </div>
      <div style={{
        fontFamily: "'Baloo 2', system-ui", fontSize: 22, lineHeight: 1.1, marginTop: 2,
        color: value == null ? 'var(--ink-3)' : STATUS_COLOR[tone],
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value == null ? '—' : value}
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{unit}</span>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'var(--line)', borderRadius: 99, marginTop: 8 }}>
        <div style={{
          position: 'absolute', left: `${barLeft}%`, width: `${barWidth}%`,
          top: 0, bottom: 0, background: 'var(--primary)', borderRadius: 99, opacity: 0.45,
        }} />
        {markerPos != null && (
          <div style={{
            position: 'absolute', left: `calc(${markerPos}% - 5px)`, top: -3,
            width: 10, height: 10, borderRadius: '50%',
            background: 'white', border: `2px solid ${STATUS_COLOR[tone]}`,
          }} />
        )}
      </div>
    </div>
  );
}

// Plant picker sub-sheet
function PlantPickerSheet({
  open, onClose, currentId, plantProfiles, onPick,
}: {
  open: boolean;
  onClose: () => void;
  currentId: string | null;
  plantProfiles: PlantProfile[];
  onPick: (id: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = plantProfiles.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <div className={`gm-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`gm-sheet${open ? ' open' : ''}`}>
        <div className="gm-grab" />
        <div className="gm-sheet-body" style={{ paddingBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>
              Choose a plant
            </div>
            <button className="gm-icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>
            Pick a profile or clear the assignment.
          </div>

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 12, color: 'var(--ink-3)', fontSize: 15 }}>
              🔍
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plants…"
              style={{
                width: '100%', padding: '11px 12px 11px 38px', boxSizing: 'border-box',
                background: 'var(--bg-sub)', border: '1px solid var(--line)',
                borderRadius: 12, fontSize: 14, outline: 'none', color: 'var(--ink)',
              }}
            />
          </div>

          <button
            onClick={() => onPick(null)}
            className="gm-row"
            style={{ width: '100%', textAlign: 'left', marginBottom: 10, cursor: 'pointer' }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: 'var(--bg-sub)',
              display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0,
            }}>
              ✕
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>Clear assignment</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Leave the bed unplanted</div>
            </div>
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((p) => {
              const active = p.id === currentId;
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(p.id)}
                  className="gm-card"
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer', padding: 12,
                    display: 'flex', alignItems: 'center', gap: 12,
                    borderColor: active ? 'var(--primary)' : 'var(--line)',
                    background: active ? 'var(--primary-soft)' : 'var(--card)',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: active ? 'white' : 'var(--bg-sub)',
                    display: 'grid', placeItems: 'center', fontSize: 20,
                  }}>
                    {p.icon ?? '🌱'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                      💧 {p.moistureMin}–{p.moistureMax}%  ·  🌡 {p.soilTempMin}–{p.soilTempMax}°C
                    </div>
                  </div>
                  {active && <span style={{ color: 'var(--primary)', fontSize: 18 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

export function ZoneDetailSheet({
  zone, plantProfiles, profilesById, onAssignPlant, onClose, onToast, onWaterZone,
}: ZoneDetailSheetProps) {
  const [showPicker, setShowPicker] = useState(false);
  const open = zone !== null;

  const profile = zone?.assignedPlant ? (profilesById.get(zone.assignedPlant) ?? null) : null;
  const evaluation = zone ? evaluateZoneAgainstPlant(zone, profile) : null;
  const tone: Tone = (evaluation?.tone === 'no-data' ? 'nodata' : evaluation?.tone) ?? 'nodata';
  const tempTone: Tone = evaluation?.temperatureStatus === 'too-cold' || evaluation?.temperatureStatus === 'too-hot' ? 'alert' : 'good';
  const hasReading = Boolean(zone?.hasReading);
  const siteName = zone?.visualLabel.startsWith('SYD-') ? 'Sydney' : 'Truro';

  // Label model:
  // - physicalId: short physical zone identifier (e.g. "GH-LEFT-05")
  // - techLabel: physical + backend ID for debug context
  // - mainTitle: plant name if assigned, else display label or "Unassigned zone"
  const physicalId = zone ? shortId(zone.visualLabel) : '';
  const techLabel = zone
    ? zone.backendZoneId
      ? `${physicalId} (${zone.backendZoneId})`
      : physicalId
    : '';
  const mainTitle = profile
    ? profile.name
    : (zone?.displayLabel ?? 'Unassigned zone');
  const locationSubtitle = profile ? (zone?.displayLabel ?? physicalId) : null;

  function handlePick(plantId: string | null) {
    if (!zone) return;
    onAssignPlant(zone.visualLabel, plantId);
    setShowPicker(false);
    if (plantId) {
      const p = profilesById.get(plantId);
      onToast(p ? `${p.icon ?? '🌱'} ${p.name} assigned to ${zone.displayLabel ?? zone.visualLabel}` : 'Plant assigned');
    } else {
      onToast(`Cleared plant for ${zone.displayLabel ?? zone.visualLabel}`);
    }
  }

  // Only show actionable recommendations (not "good" state messages)
  const actionableMessages = evaluation?.messages.filter(
    (m) => !m.includes('moisture is good') && !m.includes('temperature is good') && !m.includes('conditions are')
  ) ?? [];

  return (
    <>
      {/* Main zone sheet */}
      <div className={`gm-scrim${open && !showPicker ? ' open' : ''}`} onClick={onClose} />
      <div className={`gm-sheet${open && !showPicker ? ' open' : ''}`}>
        <div className="gm-grab" />
        {zone && (
          <div className="gm-sheet-body" style={{ paddingBottom: 32 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                {/* Technical zone reference (small, muted) */}
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
                  {techLabel}
                </div>
                {/* Main title: plant name or zone name */}
                <div style={{
                  fontFamily: "'Baloo 2', system-ui", fontSize: 26, fontWeight: 800,
                  color: 'var(--ink)', lineHeight: 1.05, marginTop: 2,
                }}>
                  {mainTitle}
                </div>
                {/* Location subtitle when plant is the title */}
                {locationSubtitle && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1, fontWeight: 600 }}>
                    {locationSubtitle}
                  </div>
                )}
                {/* Status badges */}
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {hasReading && (
                    <span className={`gm-chip ${tone}`}>
                      <span style={{
                        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                        background: STATUS_COLOR[tone], marginRight: 4, flexShrink: 0,
                      }} />
                      {STATUS_LABEL[tone]}
                    </span>
                  )}
                  {!profile && (
                    <span className="gm-chip outline">No plant assigned</span>
                  )}
                  {zone.assignedPlant && !profile && (
                    <span className="gm-chip alert">Assigned plant missing</span>
                  )}
                </div>
              </div>
              <button className="gm-icon-btn" onClick={onClose} aria-label="Close">✕</button>
            </div>

            {/* Sensor reading */}
            {hasReading ? (
              <div className="gm-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
                <Ring value={zone.soilMoisturePct} tone={tone} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.1em' }}>SOIL TEMP</div>
                    <div style={{
                      fontFamily: "'Baloo 2', system-ui", fontSize: 26, color: 'var(--ink)',
                      lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontWeight: 800,
                    }}>
                      {zone.soilTempC != null ? zone.soilTempC.toFixed(1) : '—'}
                      <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>°C</span>
                    </div>
                  </div>
                  {profile && zone.soilTempC != null && (
                    <span className={`gm-chip ${tempTone}`} style={{ alignSelf: 'flex-start' }}>
                      🌡{' '}
                      {zone.soilTempC < profile.soilTempMin
                        ? `Too cold for ${profile.name}`
                        : zone.soilTempC > profile.soilTempMax
                          ? `Too warm for ${profile.name}`
                          : `Ideal for ${profile.name}`}
                    </span>
                  )}
                  {zone.soilMoistureRaw != null && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                      raw {zone.soilMoistureRaw}
                      {zone.nodeId ? ` · ${zone.nodeId}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="gm-card" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🌱</div>
                <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>No live reading yet</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>This bed isn't reporting from a sensor.</div>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <button
                className="gm-btn water"
                onClick={() => onWaterZone(zone, 200)}
              >
                💧 Water 200ml
              </button>
              <button className="gm-btn soft" onClick={() => setShowPicker(true)}>
                🌱 Assign plant
              </button>
            </div>

            {/* Actionable recommendations only */}
            {actionableMessages.length > 0 && (
              <div className="gm-card" style={{ padding: 14, marginTop: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>
                  Recommendation
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {actionableMessages.map((message) => (
                    <div
                      key={message}
                      className={`gm-chip ${tone}`}
                      style={{ justifyContent: 'flex-start', whiteSpace: 'normal', lineHeight: 1.35 }}
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Plant range blocks */}
            {profile && hasReading && (
              <div className="gm-card" style={{ padding: 14, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: 'var(--primary-soft)',
                    display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0,
                  }}>
                    {profile.icon ?? '🌱'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{profile.name}</div>
                    {profile.notes && (
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{profile.notes}</div>
                    )}
                  </div>
                  <button className="gm-icon-btn" onClick={() => setShowPicker(true)} aria-label="Change plant">✏️</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <RangeBlock
                    label="Moisture"
                    min={profile.moistureMin} max={profile.moistureMax}
                    value={zone.soilMoisturePct}
                    unit="%" tone={tone}
                  />
                  <RangeBlock
                    label="Soil temp"
                    min={profile.soilTempMin} max={profile.soilTempMax}
                    value={zone.soilTempC != null ? Math.round(zone.soilTempC) : null}
                    unit="°C" tone={tempTone}
                  />
                </div>
              </div>
            )}

            {/* Sensor metadata (debug context, secondary) */}
            <div style={{ margin: '16px 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink-3)' }}>
              Zone info
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Physical zone', value: physicalId },
                { label: 'Site',          value: siteName },
                { label: 'Backend zone',  value: zone.backendZoneId ?? '—' },
                { label: 'Node',          value: zone.nodeId ?? '—' },
                { label: 'Area',          value: zone.rowLabel ?? '—' },
                { label: 'Temp status',   value: zone.soilTempStatus ?? '—' },
              ].map((kv) => (
                <div key={kv.label} className="gm-kv">
                  <label>{kv.label}</label>
                  <span>{kv.value}</span>
                </div>
              ))}
            </div>

            {/* Backend alerts */}
            {zone.alerts.length > 0 && (
              <>
                <div style={{ margin: '16px 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
                  Sensor alerts
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {zone.alerts.map((a) => (
                    <div key={a} style={{
                      padding: '10px 14px', borderRadius: 12,
                      background: 'var(--alert-soft)', color: 'var(--alert)',
                      fontSize: 13, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      ⚠️ {a}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 16, textAlign: 'center' }}>
              {zone.timestamp
                ? `Last updated · ${zone.timestamp}`
                : `Last updated · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </div>
          </div>
        )}
      </div>

      {/* Plant picker sub-sheet */}
      <PlantPickerSheet
        open={open && showPicker}
        onClose={() => setShowPicker(false)}
        currentId={zone?.assignedPlant ?? null}
        plantProfiles={plantProfiles}
        onPick={handlePick}
      />
    </>
  );
}
