import { PlantProfile, evaluateZoneAgainstPlant } from '../plantProfiles';
import { SydneyVisualZone } from '../sydneyLayout';

interface SydneyMapViewProps {
  zones: SydneyVisualZone[];
  profilesById: Map<string, PlantProfile>;
  onSelect: (zone: SydneyVisualZone) => void;
}

// Virtual coordinate space: 100 wide × 190 tall.
// Gap between beds: 8 units throughout.
// Landscape=22×7, portrait=7×22, square=10×10, circle=7×7
const Y = 1.90;

const SYD_LAYOUT: Record<string, { x: number; y: number; w: number; h: number; shape: 'rect' | 'circle' }> = {
  // ── Left outdoor – squares at top ────────────────────────
  'SYD-OUTDOOR-01': { x: 1,  y: 2,   w: 10, h: 10, shape: 'rect' },
  'SYD-OUTDOOR-02': { x: 13, y: 2,   w: 10, h: 10, shape: 'rect' },
  // ── Left outdoor – landscape beds (gap=8) ────────────────
  'SYD-OUTDOOR-03': { x: 1,  y: 20,  w: 22, h: 7,  shape: 'rect' },
  'SYD-OUTDOOR-04': { x: 1,  y: 35,  w: 22, h: 7,  shape: 'rect' },
  'SYD-OUTDOOR-05': { x: 1,  y: 50,  w: 22, h: 7,  shape: 'rect' },
  'SYD-OUTDOOR-06': { x: 1,  y: 65,  w: 22, h: 7,  shape: 'rect' },
  'SYD-OUTDOOR-07': { x: 1,  y: 80,  w: 22, h: 7,  shape: 'rect' },
  'SYD-OUTDOOR-08': { x: 1,  y: 95,  w: 22, h: 7,  shape: 'rect' },
  // ── Left outdoor – portrait beds at bottom ────────────────
  'SYD-OUTDOOR-09': { x: 1,  y: 110, w: 7,  h: 22, shape: 'rect' },
  'SYD-OUTDOOR-10': { x: 16, y: 110, w: 7,  h: 22, shape: 'rect' },

  // ── Greenhouse left – VEGGIES circles ────────────────────
  'SYD-GH-LEFT-01': { x: 28, y: 3,   w: 7,  h: 7,  shape: 'circle' },
  'SYD-GH-LEFT-02': { x: 36, y: 3,   w: 7,  h: 7,  shape: 'circle' },
  'SYD-GH-LEFT-03': { x: 28, y: 14,  w: 7,  h: 7,  shape: 'circle' },
  'SYD-GH-LEFT-04': { x: 36, y: 14,  w: 7,  h: 7,  shape: 'circle' },
  // ── Greenhouse left – landscape beds (gap=8) ─────────────
  'SYD-GH-LEFT-05': { x: 27, y: 33,  w: 22, h: 7,  shape: 'rect' },
  'SYD-GH-LEFT-06': { x: 27, y: 48,  w: 22, h: 7,  shape: 'rect' },
  'SYD-GH-LEFT-07': { x: 27, y: 63,  w: 22, h: 7,  shape: 'rect' },
  'SYD-GH-LEFT-08': { x: 27, y: 78,  w: 22, h: 7,  shape: 'rect' },
  'SYD-GH-LEFT-09': { x: 27, y: 93,  w: 22, h: 7,  shape: 'rect' },
  'SYD-GH-LEFT-10': { x: 27, y: 108, w: 22, h: 7,  shape: 'rect' },
  'SYD-GH-LEFT-11': { x: 27, y: 123, w: 22, h: 7,  shape: 'rect' },

  // ── Greenhouse mid – CUCUMBERS circles ───────────────────
  'SYD-GH-MID-01':  { x: 58, y: 43,  w: 7,  h: 7,  shape: 'circle' },
  'SYD-GH-MID-02':  { x: 66, y: 43,  w: 7,  h: 7,  shape: 'circle' },
  'SYD-GH-MID-03':  { x: 58, y: 54,  w: 7,  h: 7,  shape: 'circle' },
  'SYD-GH-MID-04':  { x: 66, y: 54,  w: 7,  h: 7,  shape: 'circle' },
  'SYD-GH-MID-05':  { x: 58, y: 65,  w: 7,  h: 7,  shape: 'circle' },
  'SYD-GH-MID-06':  { x: 66, y: 65,  w: 7,  h: 7,  shape: 'circle' },

  // ── Greenhouse right – portrait beds (gap=8) ─────────────
  'SYD-GH-RIGHT-01':{ x: 88, y: 3,   w: 7,  h: 22, shape: 'rect' },
  'SYD-GH-RIGHT-02':{ x: 88, y: 33,  w: 7,  h: 22, shape: 'rect' },
  'SYD-GH-RIGHT-03':{ x: 88, y: 63,  w: 7,  h: 22, shape: 'rect' },

  // ── Corn – touching GH bottom, right side ────────────────
  'SYD-CORN-01':    { x: 78, y: 135, w: 20, h: 7,  shape: 'rect' },

  // ── Pumpkin patches around shed ──────────────────────────
  'SYD-PUMPKIN-01': { x: 34, y: 155, w: 22, h: 7,  shape: 'rect' },
  'SYD-PUMPKIN-02': { x: 10, y: 162, w: 7,  h: 20, shape: 'rect' },
};

const CLUSTER_VEGGIES = new Set(['SYD-GH-LEFT-01','SYD-GH-LEFT-02','SYD-GH-LEFT-03','SYD-GH-LEFT-04']);
const CLUSTER_CUKES   = new Set(['SYD-GH-MID-01','SYD-GH-MID-02','SYD-GH-MID-03','SYD-GH-MID-04','SYD-GH-MID-05','SYD-GH-MID-06']);

// Small square beds have no room for labels.
// All other beds (including portrait and pumpkin) get labels via the bed-level renderer.
const NO_LABEL_BEDS = new Set([
  ...CLUSTER_VEGGIES, ...CLUSTER_CUKES,
]);

function bedBg(zone: SydneyVisualZone, profile: PlantProfile | null): string {
  const tone = evaluateZoneAgainstPlant(zone, profile).tone;
  if (tone === 'no-data') return '#b5a898';
  if (tone === 'alert') return '#7d3a2b';
  if (tone === 'wet') return '#48556B';
  if (tone === 'dry') return '#7a5128';
  return '#5a6B3F';
}

function emojiCount(w: number): number {
  if (w >= 20) return 5;
  if (w >= 12) return 2;
  return 1;
}

const MAP_LABEL: React.CSSProperties = {
  position: 'absolute',
  fontWeight: 800,
  fontSize: 8,
  letterSpacing: '0.06em',
  color: '#2a2a2a',
  pointerEvents: 'none',
  fontFamily: "'Nunito', system-ui",
  textTransform: 'uppercase',
  textAlign: 'center',
  lineHeight: 1.1,
};

const HORIZ_LABEL: React.CSSProperties = {
  position: 'absolute',
  fontSize: 7.5,
  fontWeight: 800,
  textAlign: 'center',
  letterSpacing: '0.03em',
  color: '#2a2a2a',
  pointerEvents: 'none',
  fontFamily: "'Nunito', system-ui",
  textTransform: 'uppercase',
  lineHeight: 1.1,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
};

export function SydneyMapView({ zones, profilesById, onSelect }: SydneyMapViewProps) {
  return (
    <div className="gm-map-wrap" style={{ background: '#EFEFEF', padding: 8 }}>
      <style>{`
        @keyframes gm-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      {/* paddingTop creates the 100:190 aspect ratio */}
      <div style={{ paddingTop: '190%', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0 }}>

          {/* ── Greenhouse pink area (y 0–135) ───────────────── */}
          <div style={{
            position: 'absolute',
            left: '25%', top: '0%', width: '73%', height: `${135 / Y}%`,
            background: '#F4C4C4',
            borderRadius: 10,
          }}>
            <div style={{
              position: 'absolute', right: 8, bottom: 8,
              fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 14,
              color: '#3a2020', lineHeight: 1,
            }}>
              GreenHouse
            </div>
          </div>

          {/* ── Shed pink area ───────────────────────────────── */}
          <div style={{
            position: 'absolute',
            left: '17%', top: `${162 / Y}%`, width: '39%', height: `${20 / Y}%`,
            background: '#F4C4C4',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 13, color: '#3a2020' }}>
              SHED
            </div>
          </div>

          {/* ── Cluster labels ────────────────────────────────── */}
          {/* VEGGIES: centered in the gap between circle rows (y=10–18, mid=14) */}
          <div style={{ ...MAP_LABEL, left: '27%', width: '17%', top: `${22 / Y}%` }}>
            VEGGIES
          </div>
          {/* CUCUMBERS: below last circle row (GH-MID-05/06 bottom=100) */}
          <div style={{ ...MAP_LABEL, left: '57%', width: '17%', top: `${73 / Y}%` }}>
            CUCUMBERS
          </div>

          {/* ── Beds ──────────────────────────────────────────── */}
          {zones.map((zone) => {
            const pos = SYD_LAYOUT[zone.visualLabel];
            if (!pos) return null;
            const profile = zone.assignedPlantProfile ?? (zone.assignedPlant ? profilesById.get(zone.assignedPlant) ?? null : null);
            const bg = bedBg(zone, profile);
            const isCircle = pos.shape === 'circle';
            const isPortrait = !isCircle && pos.h > pos.w;
            const displayEmoji = profile?.icon ?? null;
            const count = emojiCount(pos.w);
            const showLabel = !NO_LABEL_BEDS.has(zone.visualLabel);
            const label = profile?.name ?? (zone.assignedPlant ? 'Missing plant' : 'Unassigned');

            return (
              <span key={zone.visualLabel}>
                <button
                  onClick={() => onSelect(zone)}
                  aria-label={`${zone.displayLabel ?? zone.visualLabel}, ${label}`}
                  style={{
                    position: 'absolute',
                    left: `${pos.x}%`,
                    top: `${pos.y / Y}%`,
                    width: `${pos.w}%`,
                    height: `${pos.h / Y}%`,
                    background: bg,
                    borderRadius: isCircle ? '50%' : 6,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'filter .15s',
                  }}
                >
                  {displayEmoji ? (
                    <div style={{
                      display: 'flex', gap: 1,
                      flexDirection: isPortrait ? 'column' : 'row',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: isCircle ? 9 : (isPortrait ? 11 : 10),
                      lineHeight: 1,
                    }}>
                      {Array.from({ length: isPortrait ? Math.min(3, count + 1) : count }, (_, i) => (
                        <span key={i}>{displayEmoji}</span>
                      ))}
                    </div>
                  ) : (
                    <span style={{
                      fontSize: isCircle ? 10 : 12,
                      color: 'rgba(254,243,199,0.73)',
                      fontWeight: 800,
                      fontFamily: "'Baloo 2', system-ui",
                    }}>
                      ?
                    </span>
                  )}
                </button>

                {showLabel && (
                  isPortrait && pos.x < 10 ? (
                    // Portrait beds too close to left edge: vertical label on RIGHT side
                    <div style={{
                      position: 'absolute',
                      left: `calc(${pos.x + pos.w}% - 2px)`,
                      top: `${pos.y / Y}%`,
                      height: `${pos.h / Y}%`,
                      width: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 6.5,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      color: '#2a2a2a',
                      pointerEvents: 'none',
                      fontFamily: "'Nunito', system-ui",
                      textTransform: 'uppercase',
                      lineHeight: 1,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      writingMode: 'vertical-rl',
                    }}>
                      {label}
                    </div>
                  ) : isPortrait ? (
                    // Portrait beds with room: vertical label on LEFT side
                    <div style={{
                      position: 'absolute',
                      left: `calc(${pos.x}% - 12px)`,
                      top: `${pos.y / Y}%`,
                      height: `${pos.h / Y}%`,
                      width: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 6.5,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      color: '#2a2a2a',
                      pointerEvents: 'none',
                      fontFamily: "'Nunito', system-ui",
                      textTransform: 'uppercase',
                      lineHeight: 1,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)',
                    }}>
                      {label}
                    </div>
                  ) : zone.visualLabel === 'SYD-PUMPKIN-01' ? (
                    // Pumpkin-01 (top-right of shed): label ABOVE the bed
                    <div style={{
                      ...HORIZ_LABEL,
                      left: `${pos.x}%`,
                      top: `calc(${pos.y / Y}% - 11px)`,
                      width: `${pos.w}%`,
                    }}>
                      {label}
                    </div>
                  ) : (zone.visualLabel === 'SYD-OUTDOOR-01' || zone.visualLabel === 'SYD-OUTDOOR-02') ? (
                    // Narrow square beds: continuous right-to-left marquee
                    <div style={{
                      ...HORIZ_LABEL,
                      left: `${pos.x}%`,
                      top: `calc(${(pos.y + pos.h) / Y}% + 2px)`,
                      width: `${pos.w}%`,
                      textAlign: 'left',
                    }}>
                      <span style={{
                        display: 'inline-block',
                        whiteSpace: 'nowrap',
                        animation: 'gm-marquee 3s linear infinite',
                      }}>
                        {label}&nbsp;&nbsp;&nbsp;{label}
                      </span>
                    </div>
                  ) : (
                    // Horizontal label below all other beds
                    <div style={{
                      ...HORIZ_LABEL,
                      left: `${pos.x}%`,
                      top: `calc(${(pos.y + pos.h) / Y}% + 2px)`,
                      width: `${pos.w}%`,
                    }}>
                      {label}
                    </div>
                  )
                )}
              </span>
            );
          })}

          {/* ── Entrance pill (below GH, between corn and shed) ── */}
          <div style={{
            position: 'absolute',
            left: '61%', top: `${135 / Y}%`, transform: 'translateX(-50%)',
            background: 'white', border: '1.5px solid #ccc',
            padding: '3px 10px', borderRadius: 8,
            fontFamily: "'Nunito', system-ui", fontWeight: 800, fontSize: 9,
            color: '#2a2a2a', letterSpacing: '0.04em',
            boxShadow: '0 1px 3px rgba(0,0,0,.1)',
          }}>
            ENTRANCE
          </div>

        </div>
      </div>
    </div>
  );
}
