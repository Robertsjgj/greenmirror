/**
 * Full-screen greenhouse onboarding / selection screen.
 *
 * Shown on first launch (when no greenhouse is persisted in localStorage)
 * or when clearGreenhouse() is called from settings.
 *
 * Selecting a card calls onSelect(mapKind), which the GreenhouseProvider
 * persists and uses to enter the main app.
 */

import { type MapKind, type GreenhouseMeta, GREENHOUSES } from '../greenhouses';

const SITE_EMOJIS: Record<MapKind, string> = {
  sydney: '🇦🇺',
  truro:  '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
};

interface GreenhouseSelectorProps {
  onSelect: (kind: MapKind) => void;
}

export function GreenhouseSelector({ onSelect }: GreenhouseSelectorProps) {
  const sites = Object.values(GREENHOUSES) as GreenhouseMeta[];

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px 56px',
      background: 'var(--bg)',
      gap: 36,
    }}>

      {/* Brand */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 60, lineHeight: 1, marginBottom: 14 }}>🌿</div>
        <div style={{
          fontFamily: "'Baloo 2', system-ui",
          fontSize: 32,
          fontWeight: 800,
          color: 'var(--ink)',
          lineHeight: 1.1,
        }}>
          GreenMirror
        </div>
        <div style={{
          fontSize: 14,
          color: 'var(--ink-3)',
          marginTop: 6,
          fontWeight: 600,
          maxWidth: 260,
          margin: '8px auto 0',
          lineHeight: 1.5,
        }}>
          Community climate greenhouse monitoring
        </div>
      </div>

      {/* Picker */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.14em',
          color: 'var(--ink-3)',
          textAlign: 'center',
          marginBottom: 14,
        }}>
          SELECT YOUR GREENHOUSE
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sites.map((gh) => (
            <button
              key={gh.mapKind}
              className="gm-row"
              onClick={() => onSelect(gh.mapKind)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '18px 16px',
                borderColor: 'var(--line)',
                background: 'var(--card)',
              }}
            >
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                flexShrink: 0,
                background: 'var(--primary-soft)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 28,
              }}>
                {SITE_EMOJIS[gh.mapKind]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Baloo 2', system-ui",
                  fontSize: 20,
                  color: 'var(--ink)',
                  fontWeight: 800,
                  lineHeight: 1.2,
                }}>
                  {gh.name} Greenhouse
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2, fontWeight: 600 }}>
                  {gh.region}
                </div>
              </div>
              <span style={{ fontSize: 20, color: 'var(--ink-3)', flexShrink: 0 }}>›</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{
        fontSize: 11.5,
        color: 'var(--ink-3)',
        fontWeight: 600,
        textAlign: 'center',
        maxWidth: 280,
        lineHeight: 1.5,
      }}>
        Your selection is saved locally. You can switch greenhouses any time from the menu.
      </div>

    </div>
  );
}
