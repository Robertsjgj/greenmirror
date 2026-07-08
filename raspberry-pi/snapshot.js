'use strict';

/**
 * buildGreenhouseReadingSnapshot — central reading builder.
 *
 * Creates the unified Firestore document shape written to both:
 *   latestReadings/{greenhouseId}   (current state)
 *   readings/{autoId}               (historical timeline)
 *
 * Sanitizes all undefined → null so Firestore never rejects the write.
 * Classifies zones as inside/outside/unknown using zone_id conventions:
 *   inside  — contains "-INSIDE-"  (legacy: "GH"/"-GH-")
 *   outside — contains "-OUTSIDE-" (legacy: "OUTDOOR"/"-OUTDOOR-")
 *   unknown — everything else (shed beds, etc.)
 */

const GREENHOUSE_NAMES = {
  'sydney-greenhouse': 'Sydney Greenhouse',
  'truro-greenhouse':  'Truro Greenhouse',
};

const GREENHOUSE_LOCATIONS = {
  'sydney-greenhouse': { city: 'Sydney',  province: 'Nova Scotia', country: 'Canada', lat: 46.1368, lng: -60.1942 },
  'truro-greenhouse':  { city: 'Truro',   province: 'Nova Scotia', country: 'Canada', lat: 45.3650, lng: -63.2869 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nullify(val) {
  return val === undefined ? null : val;
}

function toFinite(val) {
  // Treat null/undefined/'' as "no reading" → null. (Number(null) is 0, which
  // would otherwise pull a disconnected 0°C/0% into averages.)
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function avg(values) {
  const nums = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return Number((nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(1));
}

function classifyZone(zoneId) {
  const upper = (zoneId || '').toUpperCase();
  // New scheme: "-INSIDE-" / "-OUTSIDE-". Legacy GH / OUTDOOR kept for
  // backward compatibility with older readings.
  if (upper.includes('-INSIDE-') || upper.startsWith('GH') || upper.includes('-GH-')) return 'inside';
  if (upper.includes('-OUTSIDE-') || upper.startsWith('OUTDOOR') || upper.includes('-OUTDOOR-')) return 'outside';
  return 'unknown';
}

// ─── Zone normalization ───────────────────────────────────────────────────────

function buildZoneSnapshot(rawZone) {
  // Moisture sensor connection status from firmware. When the sensor is not
  // connected (or invalid) the pct is forced null so it never counts toward
  // averages or produces dry/wet status.
  const moistureSensor = rawZone.soil_moisture_status || 'ok';
  const moistureConnected = moistureSensor !== 'not_connected' && moistureSensor !== 'invalid';
  const moisture = moistureConnected ? toFinite(rawZone.soil_moisture_pct) : null;
  const temp     = toFinite(rawZone.soil_temp_c);
  const locType  = classifyZone(rawZone.zone_id);

  let moistureStatus = 'unknown';
  if (typeof moisture === 'number') {
    if (moisture < 30)      moistureStatus = 'dry';
    else if (moisture > 80) moistureStatus = 'wet';
    else                    moistureStatus = 'ok';
  }

  let tempStatus = 'unknown';
  if (typeof temp === 'number') {
    if (temp < 10)      tempStatus = 'low';
    else if (temp > 35) tempStatus = 'high';
    else                tempStatus = 'ok';
  }

  let runoffRisk = 'unknown';
  if (typeof moisture === 'number') {
    if (moisture > 80)      runoffRisk = 'high';
    else if (moisture > 65) runoffRisk = 'medium';
    else                    runoffRisk = 'low';
  }

  return {
    zone_id:         String(rawZone.zone_id   || ''),
    zone_name:       String(rawZone.zone_name || rawZone.zone_id || ''),
    location_type:   locType,
    node_id:         String(rawZone.node_id   || ''),
    plant_profile_id: null,
    plant_name:      null,
    soil_moisture_raw: nullify(toFinite(rawZone.soil_moisture_raw)),
    soil_moisture_pct: moisture,
    soil_moisture_status: moistureSensor,
    soil_temp_c:       temp,
    moisture_status:   moistureStatus,
    soil_temp_status:  rawZone.soil_temp_status || tempStatus,
    runoff_risk:       runoffRisk,
    alerts:            Array.isArray(rawZone.alerts) ? rawZone.alerts : [],
  };
}

// ─── Summary computation ──────────────────────────────────────────────────────

function buildSummary(zones) {
  const insideZones  = zones.filter(z => z.location_type === 'inside');
  const outsideZones = zones.filter(z => z.location_type === 'outside');
  const activeZones  = zones.filter(z => z.soil_moisture_pct !== null);

  const zonesDry     = zones.filter(z => z.moisture_status === 'dry').length;
  const zonesWet     = zones.filter(z => z.moisture_status === 'wet').length;
  const zonesHealthy = zones.filter(z => z.moisture_status === 'ok').length;

  let runoffRisk = 'low';
  if (zones.length > 0) {
    const wetRatio = zonesWet / zones.length;
    if (wetRatio > 0.5)      runoffRisk = 'high';
    else if (wetRatio > 0.25) runoffRisk = 'medium';
  }

  return {
    zone_count:                 zones.length,
    active_zone_count:          activeZones.length,
    avg_inside_soil_moisture_pct:  avg(insideZones.map(z => z.soil_moisture_pct)),
    avg_outside_soil_moisture_pct: avg(outsideZones.map(z => z.soil_moisture_pct)),
    avg_inside_soil_temp_c:        avg(insideZones.map(z => z.soil_temp_c)),
    avg_outside_soil_temp_c:       avg(outsideZones.map(z => z.soil_temp_c)),
    avg_all_soil_moisture_pct:     avg(zones.map(z => z.soil_moisture_pct)),
    avg_all_soil_temp_c:           avg(zones.map(z => z.soil_temp_c)),
    zones_need_water:  zonesDry,
    zones_too_wet:     zonesWet,
    zones_healthy:     zonesHealthy,
    runoff_risk:       runoffRisk,
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string}  opts.greenhouseId
 * @param {string}  [opts.mode]           'live' | 'simulation'
 * @param {Array}   [opts.rawZones]       raw zone objects from ESP / simulator
 * @param {object|null} [opts.environment]  RPi sensor reading (or null)
 * @param {object|null} [opts.externalWeather]  Open-Meteo result (or null)
 * @param {object|null} [opts.system]      override system status block
 * @param {number}  [opts.nodeCount]      number of ESP nodes online
 * @param {string}  [opts.timestamp]      ISO string (defaults to now)
 */
function buildGreenhouseReadingSnapshot({
  greenhouseId,
  mode,
  rawZones,
  environment,
  externalWeather,
  system,
  nodeCount,
  timestamp,
}) {
  const ghId   = greenhouseId || 'sydney-greenhouse';
  const ghName = GREENHOUSE_NAMES[ghId] || ghId;
  const location = GREENHOUSE_LOCATIONS[ghId] || null;

  const zones   = (rawZones || []).map(buildZoneSnapshot);
  const summary = buildSummary(zones);
  const isSimMode = mode === 'simulation';

  // ── Environment (RPi sensor) ─────────────────────────────────────────────
  const envObj = {
    source: environment
      ? (environment.source || 'rpi')
      : (isSimMode ? 'simulation' : 'unavailable'),
    air_temp_c:     environment ? nullify(toFinite(environment.air_temp_c))    : null,
    humidity_pct:   environment ? nullify(toFinite(environment.humidity_pct))  : null,
    light_lux:      environment ? nullify(toFinite(environment.light_lux))     : null,
    brightness_pct: environment ? nullify(toFinite(environment.brightness_pct)): null,
  };

  // ── External weather (Open-Meteo) ────────────────────────────────────────
  const weatherObj = {
    source:          'Open-Meteo',
    temp_c:          externalWeather ? nullify(toFinite(externalWeather.temp_c))          : null,
    humidity_pct:    externalWeather ? nullify(toFinite(externalWeather.humidity_pct))    : null,
    wind_speed_kmh:  externalWeather ? nullify(toFinite(externalWeather.wind_speed_kmh))  : null,
    condition:       externalWeather ? (externalWeather.condition || null)                : null,
    fetched_at:      externalWeather ? (externalWeather.fetched_at || null)               : null,
  };

  // ── System status ────────────────────────────────────────────────────────
  const nodeOnline = typeof nodeCount === 'number' ? nodeCount : 0;
  const sysObj = system || {
    rpi_online:          true,
    esp_nodes_online:    nodeOnline,
    esp_nodes_expected:  nodeOnline,
    missing_nodes:       [],
    battery_status:      null,
  };

  const ts = timestamp || new Date().toISOString();

  const snapshot = {
    greenhouse_id:   ghId,
    greenhouse_name: ghName,
    location,
    timestamp:       ts,
    mode:            mode || 'live',

    external_weather: weatherObj,
    environment:      envObj,
    summary,
    zones,
    system:           sysObj,

    // Legacy compat fields — older frontend code still reads these
    zone_count:        zones.length,
    node_count:        sysObj.esp_nodes_online,
    env_temp_c:        envObj.air_temp_c,
    env_humidity_pct:  envObj.humidity_pct,
  };

  console.log('[snapshot] Built reading snapshot:', {
    greenhouse:             ghId,
    mode:                   snapshot.mode,
    zones:                  zones.length,
    envSource:              envObj.source,
    externalWeather:        weatherObj.temp_c !== null
                              ? `${weatherObj.temp_c}°C, ${weatherObj.condition}`
                              : 'unavailable',
    insideAvgMoisture:      summary.avg_inside_soil_moisture_pct,
    outsideAvgMoisture:     summary.avg_outside_soil_moisture_pct,
  });

  return snapshot;
}

module.exports = { buildGreenhouseReadingSnapshot };
