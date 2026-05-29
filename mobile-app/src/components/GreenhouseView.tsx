import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MapKind } from '../App';
import { PlantProfile, ZoneAssignments, evaluateZoneAgainstPlant } from '../plantProfiles';
import { SydneyMapView } from './SydneyMapView';
import { ZoneCard } from './ZoneCard';
import { mapZonesToSydneyLayout } from '../sydneyLayout';
import {
  LatestReading,
  LayoutSettings,
  VisualZone,
  mapZonesToLayout,
  sanitizeSettings
} from '../zoneLayout';

interface GreenhouseViewProps {
  latestReading: LatestReading | null;
  loading: boolean;
  error: string | null;
  mapKind: MapKind;
  setMapKind: (k: MapKind) => void;
  profilesById: Map<string, PlantProfile>;
  zoneAssignments: ZoneAssignments;
  onAssignPlant: (zoneKey: string, plantId: string | null) => void;
  onOpenZone: (zone: VisualZone) => void;
  onToast: (msg: string) => void;
  layoutSettings: LayoutSettings;
  setLayoutSettings: Dispatch<SetStateAction<LayoutSettings>>;
}

const SITE_INFO: Record<MapKind, { name: string; region: string }> = {
  sydney: { name: 'Sydney', region: 'Sydney, NSW' },
  truro:  { name: 'Truro',  region: 'Truro, Cornwall' },
};

export function GreenhouseView({
  latestReading, error,
  mapKind,
  profilesById, zoneAssignments,
  onOpenZone, onToast,
  layoutSettings, setLayoutSettings
}: GreenhouseViewProps) {
  const [mode, setMode] = useState<'live' | 'simulate'>('live');
  const [waterVol, setWaterVol] = useState(200);

  const sydneyZones = useMemo(
    () => mapZonesToSydneyLayout(latestReading, zoneAssignments, profilesById),
    [latestReading, zoneAssignments, profilesById]
  );

  const truroLayout = useMemo(
    () => mapZonesToLayout(latestReading, layoutSettings, zoneAssignments),
    [latestReading, layoutSettings, zoneAssignments]
  );

  const zones = mapKind === 'sydney'
    ? sydneyZones
    : truroLayout.rows.flatMap((r) => r.zones);

  const counts = useMemo(() => {
    const c = { good: 0, dry: 0, wet: 0, alert: 0, nodata: 0 };
    zones.forEach((z) => {
      const evaluation = evaluateZoneAgainstPlant(z, z.assignedPlant ? profilesById.get(z.assignedPlant) ?? null : null);
      if (evaluation.tone === 'no-data') c.nodata++;
      else if (evaluation.tone === 'dry') c.dry++;
      else if (evaluation.tone === 'wet') c.wet++;
      else if (evaluation.tone === 'alert') c.alert++;
      else c.good++;
    });
    return c;
  }, [zones, profilesById]);

  const siteInfo = SITE_INFO[mapKind];

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Site info card */}
      <div className="gm-card" style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--ink-3)' }}>
            SITE LAYOUT
          </div>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 22, lineHeight: 1.1, color: 'var(--ink)', marginTop: 2, fontWeight: 800 }}>
            {siteInfo.name} greenhouse
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2, fontWeight: 600 }}>
            {error ? 'Backend offline' : siteInfo.region}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 26, lineHeight: 1, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
            {zones.length}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--ink-3)', marginTop: 2 }}>ZONES</div>
        </div>
      </div>


      {/* Mode toggle */}
      <div className="gm-seg">
        <button className={mode === 'live' ? 'active' : ''} onClick={() => setMode('live')}>
          ◉ Live view
        </button>
        <button className={mode === 'simulate' ? 'active' : ''} onClick={() => setMode('simulate')}>
          💧 Simulate
        </button>
      </div>

      {/* Map title */}
      <div style={{ textAlign: 'center', padding: '2px 0' }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 20, color: 'var(--ink)', fontWeight: 800 }}>
          Garden Layout · {siteInfo.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, fontWeight: 600 }}>
          Tap a bed to check on it or assign a plant
        </div>
      </div>

      {/* Map */}
      {mapKind === 'sydney' ? (
        <SydneyMapView
          zones={sydneyZones}
          profilesById={profilesById}
          onSelect={onOpenZone}
        />
      ) : (
        <div className="gm-card" style={{ padding: 12 }}>
          {/* Truro grid */}
          {mapKind === 'truro' && layoutSettings && (
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
                COMPACT LAYOUT
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Rows</span>
                  <input
                    type="number" min={1} max={26}
                    value={layoutSettings.rows}
                    onChange={(e) => setLayoutSettings((s) => sanitizeSettings({ ...s, rows: Number(e.target.value) }))}
                    style={{ width: 40, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: '2px 4px', fontSize: 13, fontWeight: 700, outline: 'none', background: 'var(--bg-sub)' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Sections</span>
                  <input
                    type="number" min={1} max={20}
                    value={layoutSettings.sectionsPerRow}
                    onChange={(e) => setLayoutSettings((s) => sanitizeSettings({ ...s, sectionsPerRow: Number(e.target.value) }))}
                    style={{ width: 40, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: '2px 4px', fontSize: 13, fontWeight: 700, outline: 'none', background: 'var(--bg-sub)' }}
                  />
                </label>
              </div>
            </div>
          )}
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ display: 'flex', gap: 6, minWidth: 'max-content' }}>
              {truroLayout.rows.map((row) => (
                <div key={row.rowLabel} style={{ width: 64, flexShrink: 0 }}>
                  <div style={{
                    marginBottom: 6, borderRadius: 10, background: 'var(--bg-sub)',
                    padding: '4px 0', textAlign: 'center',
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--ink-3)',
                    textTransform: 'uppercase',
                  }}>
                    {row.rowLabel}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {row.zones.map((zone) => (
                      <ZoneCard
                        key={zone.id}
                        zone={zone}
                        assignedPlant={zone.assignedPlant ? profilesById.get(zone.assignedPlant) ?? null : null}
                        onSelect={onOpenZone}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <span style={{
              display: 'inline-block', borderRadius: 99, background: 'var(--bg-sub)',
              padding: '4px 14px', fontSize: 10, fontWeight: 800,
              letterSpacing: '0.08em', color: 'var(--ink-3)', textTransform: 'uppercase',
            }}>
              Entrance
            </span>
          </div>
        </div>
      )}

      {/* Status legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 12px' }}>
        {[
          { tone: 'good',   label: 'Good',        count: counts.good   },
          { tone: 'dry',    label: 'Getting dry',  count: counts.dry    },
          { tone: 'wet',    label: 'Too wet',      count: counts.wet    },
          { tone: 'alert',  label: 'Alert',        count: counts.alert  },
          { tone: 'nodata', label: 'No data',      count: counts.nodata },
        ].map(({ tone, label, count }) => (
          <span key={tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: `var(--${tone})`,
              display: 'inline-block',
            }} />
            {label}
            {count > 0 && (
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--ink-2)' }}>{count}</span>
            )}
          </span>
        ))}
      </div>

      {/* Watering simulation */}
      {mode === 'simulate' && (
        <div className="gm-card" style={{ padding: 14, background: 'var(--wet-soft)', borderColor: 'var(--wet)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>💧</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--wet)' }}>Watering simulation</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}>
                Preview how the layout reacts to extra water.
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Volume per zone</span>
              <span style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 18, color: 'var(--wet)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {waterVol}<span style={{ fontSize: 11, color: 'var(--ink-3)' }}>ml</span>
              </span>
            </div>
            <input
              type="range" className="gm-range" min="50" max="600" step="25"
              value={waterVol} onChange={(e) => setWaterVol(Number(e.target.value))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="gm-btn primary"
              style={{ flex: 1, background: 'var(--wet)' }}
              onClick={() => onToast(`Simulating ${waterVol}ml per zone 💧`)}
            >
              💧 Run simulation
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
