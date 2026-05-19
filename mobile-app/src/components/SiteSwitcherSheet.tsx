import { MapKind } from '../App';

interface SiteSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  site: MapKind;
  setSite: (s: MapKind) => void;
}

const SITES: { id: MapKind; name: string; region: string; emoji: string }[] = [
  { id: 'truro',  name: 'Truro',  region: 'Truro, Cornwall, UK',   emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'sydney', name: 'Sydney', region: 'Sydney, NSW, Australia', emoji: '🇦🇺' },
];

export function SiteSwitcherSheet({ open, onClose, site, setSite }: SiteSwitcherSheetProps) {
  return (
    <>
      <div className={`gm-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`gm-sheet${open ? ' open' : ''}`} style={{ maxHeight: '55%' }}>
        <div className="gm-grab" />
        <div className="gm-sheet-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 14px' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--ink-3)' }}>
                GREENHOUSE SITE
              </div>
              <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 24, color: 'var(--ink)', marginTop: 2, fontWeight: 800 }}>
                Switch location
              </div>
            </div>
            <button className="gm-icon-btn" onClick={onClose} aria-label="Close">
              <span style={{ fontSize: 18 }}>✕</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SITES.map((s) => {
              const active = s.id === site;
              return (
                <button
                  key={s.id}
                  className="gm-row"
                  onClick={() => setSite(s.id)}
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
                    {active ? '✓' : s.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 20, color: 'var(--ink)', fontWeight: 800 }}>
                        {s.name}
                      </div>
                      {active && (
                        <span className="gm-chip primary" style={{ padding: '2px 8px', fontSize: 10 }}>
                          active
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{s.region}</div>
                  </div>
                  {active && <span style={{ fontSize: 20, color: 'var(--primary)' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
