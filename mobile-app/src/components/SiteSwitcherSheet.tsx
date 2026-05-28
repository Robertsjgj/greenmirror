import { type MapKind, GREENHOUSES } from '../greenhouses';
import { useGreenhouse } from '../context/GreenhouseContext';
import { useSimulation } from '../context/SimulationContext';

interface SiteSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
}

const SITE_EMOJIS: Record<MapKind, string> = {
  sydney: '🇦🇺',
  truro:  '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
};

export function SiteSwitcherSheet({ open, onClose }: SiteSwitcherSheetProps) {
  const { greenhouse, setGreenhouse, clearGreenhouse } = useGreenhouse();
  const { isSimulating, startSimulation, stopSimulation } = useSimulation();
  const activekind = greenhouse?.mapKind;

  return (
    <>
      <div className={`gm-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`gm-sheet${open ? ' open' : ''}`} style={{ maxHeight: '72%' }}>
        <div className="gm-grab" />
        <div className="gm-sheet-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 14px' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--ink-3)' }}>
                GREENHOUSE SITE
              </div>
              <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 24, color: 'var(--ink)', marginTop: 2, fontWeight: 800 }}>
                Switch greenhouse
              </div>
            </div>
            <button className="gm-icon-btn" onClick={onClose} aria-label="Close">
              <span style={{ fontSize: 18 }}>✕</span>
            </button>
          </div>

          {/* ── Greenhouse selector ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.values(GREENHOUSES) as typeof GREENHOUSES[MapKind][]).map((gh) => {
              const active = gh.mapKind === activekind;
              return (
                <button
                  key={gh.mapKind}
                  className="gm-row"
                  onClick={() => { setGreenhouse(gh.mapKind); onClose(); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    borderColor: active ? 'var(--primary)' : 'var(--line)',
                    background: active ? 'var(--primary-soft)' : 'var(--card)',
                    padding: '14px',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: active ? 'var(--primary)' : 'var(--card-sub)',
                    color: active ? 'white' : 'var(--primary)',
                    display: 'grid', placeItems: 'center',
                    fontSize: 22,
                  }}>
                    {active ? '✓' : SITE_EMOJIS[gh.mapKind]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 20, color: 'var(--ink)', fontWeight: 800 }}>
                        {gh.name}
                      </div>
                      {active && (
                        <span className="gm-chip primary" style={{ padding: '2px 8px', fontSize: 10 }}>
                          active
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{gh.region}</div>
                  </div>
                  {active && <span style={{ fontSize: 20, color: 'var(--primary)' }}>✓</span>}
                </button>
              );
            })}
          </div>

          {/* ── Testing & simulation ─────────────────────────────────────── */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
              Testing
            </div>

            {/* Simulation toggle */}
            <button
              className="gm-row"
              onClick={() => {
                if (isSimulating) { stopSimulation(); } else { startSimulation(); }
                onClose();
              }}
              style={{
                width: '100%', textAlign: 'left', padding: 14,
                borderColor: isSimulating ? '#f59e0b' : 'var(--line)',
                background: isSimulating ? '#fffbeb' : 'var(--card)',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: isSimulating ? '#fef3c7' : 'var(--card-sub)',
                display: 'grid', placeItems: 'center', fontSize: 22,
              }}>
                ⚗️
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 18, fontWeight: 800, color: isSimulating ? '#92400e' : 'var(--ink)' }}>
                  {isSimulating ? 'Stop simulation' : 'Start simulation mode'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1, fontWeight: 600 }}>
                  {isSimulating
                    ? 'Currently running — generating fake sensor data'
                    : 'Fake readings for testing before hardware is deployed'}
                </div>
              </div>
              {isSimulating && (
                <span style={{ fontSize: 11, fontWeight: 800, color: '#92400e', background: '#fef3c7', padding: '3px 8px', borderRadius: 8, flexShrink: 0 }}>
                  ON
                </span>
              )}
            </button>

            {/* Reset greenhouse selection → return to onboarding */}
            <button
              className="gm-row"
              onClick={() => { clearGreenhouse(); onClose(); }}
              style={{ width: '100%', textAlign: 'left', padding: 14, marginTop: 6 }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: 'var(--card-sub)', display: 'grid', placeItems: 'center', fontSize: 22,
              }}>
                🔄
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
                  Change greenhouse
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1, fontWeight: 600 }}>
                  Return to the onboarding selector
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
