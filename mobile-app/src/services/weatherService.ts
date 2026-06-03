import type { GreenhouseMeta } from '../greenhouses';

export interface ExternalWeather {
  external_temp_c: number | null;
  external_humidity_pct: number | null;
  wind_speed_kmh: number | null;
  condition: string;
  timestamp: string | null;
  source: 'Open-Meteo';
}

interface OpenMeteoCurrent {
  time?: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
  weather_code?: number;
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent;
}

function describeWeatherCode(code: number | undefined): string {
  if (typeof code !== 'number') return 'Unavailable';
  if (code === 0) return 'Clear';
  if ([1, 2].includes(code)) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Mixed conditions';
}

export async function fetchExternalWeather(greenhouse: GreenhouseMeta): Promise<ExternalWeather> {
  const params = new URLSearchParams({
    latitude: String(greenhouse.latitude),
    longitude: String(greenhouse.longitude),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
    wind_speed_unit: 'kmh',
    timezone: 'America/Halifax',
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  console.info(
    `[weatherService] Fetching external weather for ${greenhouse.name}, NS at ${greenhouse.latitude}, ${greenhouse.longitude}`,
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const current = data.current ?? {};
  const weather: ExternalWeather = {
    external_temp_c: typeof current.temperature_2m === 'number' ? current.temperature_2m : null,
    external_humidity_pct: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : null,
    wind_speed_kmh: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : null,
    condition: describeWeatherCode(current.weather_code),
    timestamp: current.time ?? null,
    source: 'Open-Meteo',
  };

  console.info(`[weatherService] External weather fetch success for ${greenhouse.id}`, weather);
  return weather;
}
