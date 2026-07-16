import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MapKind } from '../App';
import { PlantProfile, ZoneAssignments, evaluateZoneAgainstPlant } from '../plantProfiles';
import { SydneyMapView } from './SydneyMapView';
import { ZoneCard } from './ZoneCard';
import { mapZonesToSydneyLayout } from '../sydneyLayout';
import { GREENHOUSES } from '../greenhouses';
import {
  LatestReading,
  LayoutSettings,
  VisualZone,
  mapZonesToLayout,
  sanitizeSettings
} from '../zoneLayout';
import { useSimulation } from '../context/SimulationContext';
import { SIMULATION_ENABLED } from '../featureFlags';

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

export function GreenhouseView({
  latestReading, error,
  mapKind,
  profilesById, zoneAssignments,
  onOpenZone, onToast,
  layoutSettings, setLayoutSettings
}: GreenhouseViewProps) {
  // The second tab runs the same map screen on simulated data. Simulation is a
  // global mode (App swaps latestReading → simReading when active), so this view
  // just toggles it on/off and the map below automatically reflects sim data.
  const { isSimulating, startSimulation, stopSimulation } = useSimulation();
  const [waterVol, setWaterVol] = useState(200);
  const [simOpen, setSimOpen] = useState(false);

  const sydneyZones = useMemo(
    () => mapZonesToSydneyLayout(latestReading, zoneAssignments, profilesById),
    [latestReading, zoneAssignments, profilesById]
  );

  const truroLayout = useMemo(
    () => mapZonesToLayout(latestReading, layoutSettings, zoneAssignments, profilesById),
    [latestReading, layoutSettings, zoneAssignments, profilesById]
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

  const siteInfo = GREENHOUSES[mapKind];

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
            {isSimulating ? 'Simulation running' : error ? 'Backend offline' : siteInfo.region}
          </div>
        </div>
        {/* Status pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 26, lineHeight: 1, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 800 }}>
            {zones.length}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--ink-3)' }}>ZONES</div>
        </div>
      </div>

      {/* Status legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '5px 10px' }}>
        {[
          { tone: 'good',   label: 'Good',       count: counts.good   },
          { tone: 'dry',    label: 'Getting dry', count: counts.dry    },
          { tone: 'wet',    label: 'Too wet',     count: counts.wet    },
          { tone: 'alert',  label: 'Alert',       count: counts.alert  },
          { tone: 'nodata', label: 'No data / Offline', count: counts.nodata },
        ].map(({ tone, label, count }) => (
          <span key={tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--${tone})`, display: 'inline-block' }} />
            {label}
            {count > 0 && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--ink-2)' }}>{count}</span>}
          </span>
        ))}
      </div>

      {/* View mode toggle — Map (live) vs Simulation (same map on simulated data) */}
      {SIMULATION_ENABLED && (
        <div className="gm-seg">
          <button className={!isSimulating ? 'active' : ''} onClick={() => { if (isSimulating) stopSimulation(); }}>
            🗺 Map
          </button>
          <button className={isSimulating ? 'active' : ''} onClick={() => { if (!isSimulating) startSimulation(); }}>
            🧪 Simulation
          </button>
        </div>
      )}

      {/* ── MAP (live or simulated — same screen) ───────────────────────────── */}
      <div style={{ textAlign: 'center', padding: '2px 0' }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 20, color: 'var(--ink)', fontWeight: 800 }}>
          {isSimulating ? 'Simulation' : 'Garden Layout'} · {siteInfo.name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 16px', borderRadius: 999,
            background: 'var(--primary-soft)', border: '1.5px solid var(--primary)',
            color: 'var(--primary)', fontSize: 13.5, fontWeight: 800, lineHeight: 1.3,
          }}>
            <span style={{ fontSize: 16 }}>👆</span>
            {isSimulating
              ? 'Tap a bed to water it'
              : 'Tap a bed to check it or assign a plant'}
          </div>
        </div>
      </div>

      {mapKind === 'sydney' ? (
        <SydneyMapView
          zones={sydneyZones}
          profilesById={profilesById}
          onSelect={onOpenZone}
        />
      ) : (
        <div className="gm-card" style={{ padding: 12 }}>
          {layoutSettings && (
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

      {/* Watering simulation toggle */}
      <button
        onClick={() => setSimOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 12, border: '1.5px solid var(--wet)',
          background: simOpen ? 'var(--wet-soft)' : 'transparent',
          color: 'var(--wet)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        💧 {simOpen ? 'Hide' : 'Watering simulation'}
      </button>

      {simOpen && (
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
