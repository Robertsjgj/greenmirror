import { VisualZone } from '../zoneLayout';
import { PlantProfile, evaluateZoneAgainstPlant } from '../plantProfiles';

export interface ZoneSparkData {
  moistures: number[];
  temps: number[];
}

interface ZoneListCardProps {
  zone: VisualZone;
  plant: PlantProfile | null;
  spark: ZoneSparkData;
  onSelect: (zone: VisualZone) => void;
}

const TONE = {
  good:     { bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e', badgeBg: '#dcfce7', badgeFg: '#15803d' },
  dry:      { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', badgeBg: '#fef3c7', badgeFg: '#b45309' },
  wet:      { bg: '#f0f9ff', border: '#bae6fd', dot: '#0ea5e9', badgeBg: '#e0f2fe', badgeFg: '#0369a1' },
  alert:    { bg: '#fff1f2', border: '#fecdd3', dot: '#ef4444', badgeBg: '#ffe4e6', badgeFg: '#b91c1c' },
  'no-data':{ bg: '#fafaf9', border: '#e7e5e4', dot: '#a8a29e', badgeBg: '#f5f5f4', badgeFg: '#78716c' },
} as const;

function Sparkline({ moistures, temps, dotColor }: { moistures: number[]; temps: number[]; dotColor: string }) {
  if (moistures.length < 2) return null;
  const W = 100, H = 30;

  const toPath = (data: number[]): string => {
    if (data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = Math.max(max - min, 0.5);
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - 3 - ((v - min) / range) * (H - 7);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  };

  const mPath = toPath(moistures);
  const tPath = toPath(temps);

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {tPath && (
        <path
          d={tPath}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2,2"
          opacity={0.5}
        />
      )}
      <path
        d={mPath}
        fill="none"
        stroke={dotColor}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function trendArrow(data: number[]): string {
  if (data.length < 4) return '';
  const recent = data.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const earlier = data.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const delta = recent - earlier;
  if (delta > 2) return '↑';
  if (delta < -2) return '↓';
  return '→';
}

export function ZoneListCard({ zone, plant, spark, onSelect }: ZoneListCardProps) {
  const evaluation = evaluateZoneAgainstPlant(zone, plant);
  const t = TONE[evaluation.tone];
  const moisture = zone.soilMoisturePct;
  const temp = zone.soilTempC;
  const displayName = zone.displayLabel ?? zone.backendZoneId ?? zone.visualLabel;
  const plantName = plant?.name ?? (zone.assignedPlant ? 'Plant missing' : null);
  const arrow = trendArrow(spark.moistures);

  return (
    <button
      type="button"
      onClick={() => onSelect(zone)}
      style={{
        background: t.bg,
        border: `1.5px solid ${t.border}`,
        borderRadius: 20,
        padding: '13px 13px 9px',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        cursor: 'pointer',
        width: '100%',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {plant?.icon && <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{plant.icon}</span>}
            <span style={{
              fontSize: 12, fontWeight: 800, color: '#1c1917',
              lineHeight: 1.2, letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {displayName}
            </span>
          </div>
          {plantName && (
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#78716c', marginTop: 1,
              paddingLeft: plant?.icon ? 18 : 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {plantName}
            </div>
          )}
        </div>
        <span style={{
          background: t.badgeBg, color: t.badgeFg,
          fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
          padding: '3px 7px', borderRadius: 99, flexShrink: 0,
          textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          {evaluation.label}
        </span>
      </div>

      {/* Moisture number + temp */}
      <div style={{
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', marginTop: 10, marginBottom: 5,
      }}>
        <div style={{
          fontFamily: "'Baloo 2', system-ui",
          fontSize: 28, fontWeight: 800, lineHeight: 1,
          color: '#1c1917', fontVariantNumeric: 'tabular-nums',
          display: 'flex', alignItems: 'baseline', gap: 4,
        }}>
          {moisture !== null ? moisture.toFixed(0) : '--'}
          <span style={{ fontSize: 14, fontWeight: 700, color: '#78716c' }}>%</span>
          {arrow && <span style={{ fontSize: 11, marginLeft: 1, color: t.dot }}>{arrow}</span>}
        </div>
        <div style={{ fontSize: 11, color: '#78716c', fontWeight: 700, marginBottom: 1 }}>
          {temp !== null ? `${temp.toFixed(1)}°C` : ''}
        </div>
      </div>

      {/* Moisture progress bar */}
      <div style={{ height: 3, background: 'rgba(0,0,0,0.07)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, Math.max(0, moisture ?? 0))}%`,
          background: t.dot, borderRadius: 99,
        }} />
      </div>

      {/* Sparkline */}
      <Sparkline moistures={spark.moistures} temps={spark.temps} dotColor={t.dot} />

      {/* Chart legend */}
      {spark.moistures.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: t.dot }}>
            <span style={{ display: 'inline-block', width: 12, height: 1.5, background: t.dot, borderRadius: 1 }} />
            Moisture
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: '#94a3b8' }}>
            <span style={{ display: 'inline-block', width: 12, height: 1, borderTop: '1px dashed #94a3b8' }} />
            Temp
          </span>
        </div>
      )}
    </button>
  );
}
