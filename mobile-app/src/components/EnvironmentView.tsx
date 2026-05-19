import { MapKind } from '../App';

interface EnvironmentViewProps {
  site: MapKind;
}

const CLIMATE: Record<MapKind, {
  insideTemp: number; outsideTemp: number; humidity: number;
  light: string; soilOverall: string;
  forecast: { t: string; kind: 'sun' | 'cloud' | 'rain'; temp: number }[];
  tip: string;
}> = {
  sydney: {
    insideTemp: 26, outsideTemp: 21, humidity: 68,
    light: 'Bright', soilOverall: 'Moist',
    forecast: [
      { t: 'MON', kind: 'sun',   temp: 26 },
      { t: 'TUE', kind: 'sun',   temp: 27 },
      { t: 'WED', kind: 'cloud', temp: 22 },
      { t: 'THU', kind: 'rain',  temp: 19 },
      { t: 'FRI', kind: 'sun',   temp: 24 },
    ],
    tip: "It's warm and sunny today! Your plants might drink more water than usual. Keep an eye on the tomatoes 🍅",
  },
  truro: {
    insideTemp: 18, outsideTemp: 12, humidity: 75,
    light: 'Moderate', soilOverall: 'Good',
    forecast: [
      { t: 'MON', kind: 'cloud', temp: 14 },
      { t: 'TUE', kind: 'rain',  temp: 11 },
      { t: 'WED', kind: 'rain',  temp: 10 },
      { t: 'THU', kind: 'cloud', temp: 13 },
      { t: 'FRI', kind: 'sun',   temp: 16 },
    ],
    tip: "Cooler temperatures this week. Your leafy greens will love it — check soil moisture before watering 🥬",
  },
};

function WeatherIcon({ kind, size = 18 }: { kind: 'sun' | 'cloud' | 'rain'; size?: number }) {
  if (kind === 'sun')  return <span style={{ fontSize: size }}>☀️</span>;
  if (kind === 'rain') return <span style={{ fontSize: size }}>🌧</span>;
  return <span style={{ fontSize: size }}>☁️</span>;
}

export function EnvironmentView({ site }: EnvironmentViewProps) {
  const c = CLIMATE[site];

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Hero weather card */}
      <div style={{
        position: 'relative',
        borderRadius: 24,
        padding: 20,
        color: 'white',
        background:
          'radial-gradient(ellipse 80% 100% at 100% 0%, oklch(0.78 0.16 80 / 0.55), transparent 60%),' +
          'linear-gradient(155deg, oklch(0.55 0.13 230), oklch(0.4 0.12 240))',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', opacity: 0.85 }}>
              INSIDE · {site.toUpperCase()}
            </div>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 64, lineHeight: 1, marginTop: 6, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {c.insideTemp}<span style={{ fontSize: 28, opacity: 0.8 }}>°c</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.92, marginTop: 6 }}>Warm &amp; sunny inside</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              Outside · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.outsideTemp}°</span>
            </div>
          </div>
          <div style={{ opacity: 0.85, fontSize: 64 }}>☀️</div>
        </div>

        {/* Forecast strip */}
        <div style={{
          marginTop: 18, paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {c.forecast.map((f) => (
            <div key={f.t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: 0.92 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{f.t}</span>
              <WeatherIcon kind={f.kind} size={16} />
              <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{f.temp}°</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metric tiles 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { emoji: '🌡', label: 'Temperature', big: `${c.insideTemp}°C`, sub: 'Greenhouse air' },
          { emoji: '💧', label: 'Humidity',    big: `${c.humidity}%`,    sub: 'Relative' },
          { emoji: '☀️', label: 'Light',       big: c.light,             sub: 'Above canopy' },
          { emoji: '🌱', label: 'Soil overall', big: c.soilOverall,      sub: 'Averaged across zones' },
        ].map((m) => (
          <div key={m.label} className="gm-card" style={{ padding: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--primary-soft)',
              display: 'grid', placeItems: 'center', fontSize: 18,
            }}>
              {m.emoji}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--ink-3)', marginTop: 10, textTransform: 'uppercase' }}>
              {m.label}
            </div>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 24, color: 'var(--ink)', marginTop: 2, lineHeight: 1.1, fontWeight: 800 }}>
              {m.big}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tip card */}
      <div className="gm-card" style={{ padding: 14, background: 'var(--clay-soft)', borderColor: 'oklch(0.85 0.08 60)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'var(--clay)', color: 'white',
            display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 16,
          }}>
            ✨
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clay-ink)' }}>Today's tip</div>
            <div style={{ fontSize: 13, color: 'var(--clay-ink)', marginTop: 4, lineHeight: 1.45 }}>{c.tip}</div>
          </div>
        </div>
      </div>

    </div>
  );
}
