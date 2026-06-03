'use strict';

/**
 * External weather service — fetches current conditions from Open-Meteo.
 *
 * Uses Node's built-in https module (no extra dependencies).
 * Coordinates are fixed to Nova Scotia, Canada — never Sydney NSW.
 *
 * Usage:
 *   const { fetchWeatherForGreenhouse, getWeatherCached } = require('./weather');
 *
 *   // One-off fetch:
 *   const weather = await fetchWeatherForGreenhouse('sydney-greenhouse');
 *
 *   // Cached (refreshes every WEATHER_REFRESH_MS):
 *   const weather = await getWeatherCached('sydney-greenhouse');
 */

const https = require('https');

// ─── Greenhouse coordinates ───────────────────────────────────────────────────
// Nova Scotia, Canada — do NOT confuse with Sydney NSW, Australia.

const COORDS = {
  'sydney-greenhouse': { latitude: 46.1368, longitude: -60.1942, name: 'Sydney' },
  'truro-greenhouse':  { latitude: 45.3650, longitude: -63.2869, name: 'Truro'  },
};

const WEATHER_REFRESH_MS = 10 * 60 * 1000; // refresh at most once per 10 minutes

// ─── WMO weather-code descriptions ───────────────────────────────────────────

function describeWeatherCode(code) {
  if (typeof code !== 'number') return null;
  if (code === 0)                              return 'Clear';
  if (code === 1 || code === 2)                return 'Partly cloudy';
  if (code === 3)                              return 'Cloudy';
  if (code === 45 || code === 48)              return 'Fog';
  if (code >= 51 && code <= 57)               return 'Drizzle';
  if (code >= 61 && code <= 67)               return 'Rain';
  if (code >= 71 && code <= 77)               return 'Snow';
  if (code === 80 || code === 81 || code === 82) return 'Rain showers';
  if (code === 85 || code === 86)              return 'Snow showers';
  if (code === 95 || code === 96 || code === 99) return 'Thunderstorm';
  return 'Mixed conditions';
}

// ─── HTTPS helper ─────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Failed to parse Open-Meteo response as JSON'));
        }
      });
    }).on('error', reject);
  });
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch current weather from Open-Meteo for the given greenhouse.
 * Returns a normalized external_weather object, or null on any failure.
 */
async function fetchWeatherForGreenhouse(greenhouseId) {
  const loc = COORDS[greenhouseId];
  if (!loc) {
    console.warn(`[weather] No coordinates configured for greenhouse: ${greenhouseId}`);
    return null;
  }

  const params = new URLSearchParams({
    latitude:        String(loc.latitude),
    longitude:       String(loc.longitude),
    current:         'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
    wind_speed_unit: 'kmh',
    timezone:        'America/Halifax',
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  try {
    const data    = await httpsGet(url);
    const current = data.current || {};

    const result = {
      source:         'Open-Meteo',
      temp_c:         typeof current.temperature_2m       === 'number' ? current.temperature_2m       : null,
      humidity_pct:   typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : null,
      wind_speed_kmh: typeof current.wind_speed_10m       === 'number' ? current.wind_speed_10m       : null,
      condition:      describeWeatherCode(current.weather_code),
      fetched_at:     new Date().toISOString(),
    };

    console.info(
      `[weather] ✅ Fetched for ${loc.name}, Nova Scotia:`,
      result.temp_c !== null ? `${result.temp_c}°C` : 'N/A',
      result.condition || '',
    );
    return result;
  } catch (err) {
    console.warn(`[weather] ⚠️  Failed to fetch for ${greenhouseId}:`, err.message);
    return null;
  }
}

// ─── Cache layer ──────────────────────────────────────────────────────────────

const _cache = {};

/**
 * Return cached weather, refreshing from Open-Meteo if stale (> 10 min old).
 * Safe to call on every sensor tick — actual HTTP request happens at most once
 * per WEATHER_REFRESH_MS.
 */
async function getWeatherCached(greenhouseId) {
  const now    = Date.now();
  const entry  = _cache[greenhouseId];
  if (entry && now - entry.fetchedAt < WEATHER_REFRESH_MS) {
    return entry.data; // still fresh
  }

  const data = await fetchWeatherForGreenhouse(greenhouseId);
  if (data) {
    _cache[greenhouseId] = { data, fetchedAt: now };
  }
  // Return new data if available, otherwise return stale cache rather than null
  return data || (entry ? entry.data : null);
}

module.exports = { fetchWeatherForGreenhouse, getWeatherCached };
