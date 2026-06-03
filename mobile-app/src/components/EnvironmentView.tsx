import { useEffect, useMemo, useState } from 'react';
import type { MapKind } from '../App';
import type { GreenhouseMeta } from '../greenhouses';
import type { ExternalWeatherReading, LatestReading, ZoneReading } from '../zoneLayout';
import { ExternalWeather, fetchExternalWeather } from '../services/weatherService';

interface EnvironmentViewProps {
  site: MapKind;
  greenhouse: GreenhouseMeta;
  latestReading: LatestReading | null;
}

type WeatherIconKind = 'sun' | 'cloud' | 'rain';

function WeatherIcon({ kind, size = 18 }: { kind: WeatherIconKind; size?: number }) {
  if (kind === 'sun') return <span style={{ fontSize: size }}>☀️</span>;
  if (kind === 'rain') return <span style={{ fontSize: size }}>🌧️</span>;
  return <span style={{ fontSize: size }}>☁️</span>;
}

function iconKind(condition: string): WeatherIconKind {
  const lower = condition.toLowerCase();
  if (lower.includes('rain') || lower.includes('drizzle') || lower.includes('thunder')) return 'rain';
  if (lower.includes('clear') || lower.includes('sun')) return 'sun';
  return 'cloud';
}

function formatNumber(value: number | null | undefined, suffix = '', digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  return `${value.toFixed(digits)}${suffix}`;
}

function average(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function isOutsideZone(zone: ZoneReading) {
  const id = zone.zone_id.toUpperCase();
  return id.includes('OUTDOOR') || id.includes('OUTSIDE') || id.includes('OUT');
}

function buildSoilSummary(reading: LatestReading | null) {
  const zones = reading?.zones ?? [];
  const inside = zones.filter((zone) => !isOutsideZone(zone));
  const outside = zones.filter(isOutsideZone);

  return {
    avg_inside_soil_moisture_pct:
      reading?.summary?.avg_inside_soil_moisture_pct ?? average(inside.map((zone) => zone.soil_moisture_pct)),
    avg_outside_soil_moisture_pct:
      reading?.summary?.avg_outside_soil_moisture_pct ?? average(outside.map((zone) => zone.soil_moisture_pct)),
    avg_inside_soil_temp_c:
      reading?.summary?.avg_inside_soil_temp_c ?? average(inside.map((zone) => zone.soil_temp_c)),
    avg_outside_soil_temp_c:
      reading?.summary?.avg_outside_soil_temp_c ?? average(outside.map((zone) => zone.soil_temp_c)),
  };
}

function formatTimestamp(timestamp: string | null | undefined) {
  if (!timestamp) return 'Timestamp unavailable';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Adapt the new embedded external_weather shape to the existing ExternalWeather interface. */
function adaptEmbeddedWeather(ew: ExternalWeatherReading): ExternalWeather {
  return {
    external_temp_c:       ew.temp_c         ?? null,
    external_humidity_pct: ew.humidity_pct   ?? null,
    wind_speed_kmh:        ew.wind_speed_kmh ?? null,
    condition:             ew.condition       ?? 'Unavailable',
    timestamp:             ew.fetched_at      ?? null,
    source:                'Open-Meteo',
  };
}

export function EnvironmentView({ site, greenhouse, latestReading }: EnvironmentViewProps) {
  const [fetchedWeather, setFetchedWeather] = useState<ExternalWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Use external_weather embedded in the latest reading (from backend/Firestore snapshot)
  // as the primary source.  Fall back to a direct Open-Meteo fetch when it's absent.
  const embeddedWeather = latestReading?.external_weather ?? null;
  const hasEmbedded = embeddedWeather !== null && embeddedWeather.temp_c !== null;

  useEffect(() => {
    if (hasEmbedded) {
      // Backend already fetched weather — no need to hit Open-Meteo from the client.
      setWeatherLoading(false);
      setWeatherError(null);
      return;
    }

    let cancelled = false;
    setWeatherLoading(true);
    setWeatherError(null);
    console.info(
      `[EnvironmentView] No embedded weather — fetching from Open-Meteo for ${greenhouse.name}, Nova Scotia (${greenhouse.latitude}, ${greenhouse.longitude})`,
    );

    fetchExternalWeather(greenhouse)
      .then((weather) => {
        if (cancelled) return;
        setFetchedWeather(weather);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[EnvironmentView] External weather fetch failed:', err);
        setWeatherError(err instanceof Error ? err.message : 'Weather unavailable');
        setFetchedWeather(null);
      })
      .finally(() => {
        if (!cancelled) setWeatherLoading(false);
      });

    return () => { cancelled = true; };
  }, [greenhouse, hasEmbedded]);

  useEffect(() => {
    console.info('[EnvironmentView] Environment object received by frontend:', latestReading?.environment ?? null);
    if (embeddedWeather) {
      console.info('[EnvironmentView] Embedded external_weather from snapshot:', embeddedWeather);
    }
  }, [latestReading?.environment, embeddedWeather]);

  // Resolve the active weather source
  const externalWeather: ExternalWeather | null = hasEmbedded
    ? adaptEmbeddedWeather(embeddedWeather!)
    : fetchedWeather;

  const environment = latestReading?.environment ?? null;
  const soil = useMemo(() => buildSoilSummary(latestReading), [latestReading]);
  const condition = weatherLoading ? 'Loading local weather' : (externalWeather?.condition ?? 'External weather unavailable');
  const kind = iconKind(condition);
  const heroTemp = weatherLoading ? '--' : formatNumber(externalWeather?.external_temp_c, '°C');
  const insideAirTemp = environment?.air_temp_c ?? latestReading?.env_temp_c ?? null;
  const insideHumidity = environment?.humidity_pct ?? latestReading?.env_humidity_pct ?? null;
  const lightValue = typeof environment?.brightness_pct === 'number'
    ? `${environment.brightness_pct.toFixed(0)}%`
    : (typeof environment?.light_lux === 'number' ? `${environment.light_lux.toFixed(0)} lux` : 'Not available');

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
              EXTERNAL WEATHER · {greenhouse.name.toUpperCase()}, NS
            </div>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 64, lineHeight: 1, marginTop: 6, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {heroTemp}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.92, marginTop: 6 }}>
              {weatherError ? 'Weather API unavailable' : condition}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              Source · {externalWeather?.source ?? 'Open-Meteo'} · {formatTimestamp(externalWeather?.timestamp)}
            </div>
          </div>
          <div style={{ opacity: 0.85, fontSize: 64 }}>
            <WeatherIcon kind={kind} size={64} />
          </div>
        </div>

        {/* Forecast strip */}
        <div style={{
          marginTop: 18, paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {[
            { t: 'TEMP', kind, value: heroTemp },
            { t: 'HUM', kind: 'cloud' as const, value: formatNumber(externalWeather?.external_humidity_pct, '%') },
            { t: 'WIND', kind: 'cloud' as const, value: formatNumber(externalWeather?.wind_speed_kmh, ' km/h') },
            { t: 'SITE', kind, value: site.toUpperCase() },
          ].map((f) => (
            <div key={f.t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: 0.92 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{f.t}</span>
              <WeatherIcon kind={f.kind} size={16} />
              <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{weatherLoading ? '...' : f.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metric tiles 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { emoji: '🌡️', label: 'Air temp', big: formatNumber(insideAirTemp, '°C'), sub: environment ? 'Raspberry Pi sensor' : 'Greenhouse air sensor not connected yet.' },
          { emoji: '💧', label: 'Humidity', big: formatNumber(insideHumidity, '%'), sub: environment ? 'Greenhouse air' : 'Greenhouse air sensor not connected yet.' },
          { emoji: '☀️', label: 'Light', big: lightValue, sub: typeof environment?.brightness_pct === 'number' || typeof environment?.light_lux === 'number' ? 'Raspberry Pi sensor' : 'Light sensor data not available yet.' },
          { emoji: '🌱', label: 'Soil overall', big: formatNumber(soil.avg_inside_soil_moisture_pct, '%'), sub: 'ESP32 zone sensors' },
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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--clay-ink)' }}>Soil Conditions</div>
            <div style={{ fontSize: 13, color: 'var(--clay-ink)', marginTop: 4, lineHeight: 1.45 }}>
              Avg inside soil moisture: {formatNumber(soil.avg_inside_soil_moisture_pct, '%')} ·
              Avg outside soil moisture: {formatNumber(soil.avg_outside_soil_moisture_pct, '%')} ·
              Avg inside soil temp: {formatNumber(soil.avg_inside_soil_temp_c, '°C', 1)} ·
              Avg outside soil temp: {formatNumber(soil.avg_outside_soil_temp_c, '°C', 1)} ·
              Source: ESP32 zone sensors
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
