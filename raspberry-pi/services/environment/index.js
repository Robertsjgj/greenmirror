'use strict';

/**
 * Greenhouse environment sensor service (Raspberry Pi, DHT11 via Python helper).
 *
 * Reads the DHT11 by spawning a small Python helper (services/environment/read_dht.py)
 * that uses Adafruit CircuitPython DHT. DHT one-wire timing is too strict for
 * reliable pure-Node reads, and the kernel IIO driver's sysfs reads timed out on
 * our hardware, so the timed read is delegated to the Adafruit library.
 *
 * The service owns polling / caching / staleness / status / logging; every ESP
 * POST reads from the cache (getEnvironmentCached), never the sensor, so ingest
 * is never blocked.
 *
 * Cached object shape (light is never populated — no light sensor exists):
 *   {
 *     source: "raspberry-pi",
 *     sensor_type: "dht11",
 *     air_temp_c: <number|null>,
 *     humidity_pct: <number|null>,
 *     light_lux: null,
 *     brightness_pct: null,
 *     fetched_at: <ISO timestamp>,
 *     status: "ok" | "stale" | "error" | "disabled",
 *     error: <string|null>,
 *   }
 */

const { execFile } = require('child_process');
const path = require('path');

// ─── Config (from .env) ─────────────────────────────────────────────────────
const ENABLED         = String(process.env.ENVIRONMENT_ENABLED || 'false').toLowerCase() === 'true';
const SENSOR_TYPE     = (process.env.ENVIRONMENT_SENSOR_TYPE || 'dht11').toLowerCase();
const DHT_GPIO        = Number(process.env.ENVIRONMENT_DHT_GPIO || 4);   // BCM GPIO the DATA pin is wired to
const REFRESH_SECONDS = Number(process.env.ENVIRONMENT_REFRESH_SECONDS || 30);
const STALE_SECONDS   = Number(process.env.ENVIRONMENT_STALE_SECONDS || 120);
const PYTHON_BIN      = process.env.ENVIRONMENT_PYTHON || 'python3';
const READER_SCRIPT   = path.join(__dirname, 'read_dht.py');
const READ_TIMEOUT_MS = 12_000;  // the Python helper retries a few times internally

// ─── State ──────────────────────────────────────────────────────────────────
let lastGood    = null;   // { air_temp_c, humidity_pct, at:<ms> }
let lastReadOk  = false;
let lastError   = null;
let lastReadAt  = null;    // ms of most recent read ATTEMPT
let lastSuccess = null;    // ms of most recent SUCCESSFUL read
let reading     = false;   // guards against overlapping reads
let started     = false;

const log = (m) => console.log(`[environment] ${m}`);
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

function envObject(status, { air_temp_c = null, humidity_pct = null, error = null, fetched_at } = {}) {
  return {
    source: 'raspberry-pi',
    sensor_type: SENSOR_TYPE,
    air_temp_c,
    humidity_pct,
    light_lux: null,       // no light sensor installed
    brightness_pct: null,  // no light sensor installed
    fetched_at: fetched_at || new Date().toISOString(),
    status,
    error,
  };
}

/**
 * Latest cached environment reading. Never throws, never blocks.
 * - disabled           → status "disabled", null values
 * - within stale window→ status "ok" (or "stale" if recent reads are failing)
 * - beyond stale/never → status "stale"/"error", null values
 */
function getEnvironmentCached() {
  if (!ENABLED) return envObject('disabled', { error: 'ENVIRONMENT_ENABLED is not true' });

  if (lastGood) {
    const ageMs = Date.now() - lastGood.at;
    const fetchedAt = iso(lastGood.at);

    if (ageMs <= STALE_SECONDS * 1000) {
      return envObject(lastReadOk ? 'ok' : 'stale', {
        air_temp_c:   lastGood.air_temp_c,
        humidity_pct: lastGood.humidity_pct,
        error:        lastReadOk ? null : lastError,
        fetched_at:   fetchedAt,
      });
    }
    return envObject('stale', {
      error: lastError || `no successful read in ${STALE_SECONDS}s`,
      fetched_at: fetchedAt,
    });
  }

  return envObject('error', { error: lastError || 'no reading yet' });
}

/**
 * Lightweight status for diagnostics / the future management dashboard.
 * @returns {{ enabled, sensor, status, lastRead, lastSuccess, lastError, refreshSeconds }}
 */
function getEnvironmentStatus() {
  return {
    enabled: ENABLED,
    sensor: SENSOR_TYPE,
    status: getEnvironmentCached().status,
    lastRead: iso(lastReadAt),
    lastSuccess: iso(lastSuccess),
    lastError,
    refreshSeconds: REFRESH_SECONDS,
  };
}

// Spawn the Python helper once and update state. Resolves always (never rejects).
function pollOnce() {
  if (reading) return Promise.resolve();
  reading = true;
  lastReadAt = Date.now();

  return new Promise((resolve) => {
    execFile(
      PYTHON_BIN,
      [READER_SCRIPT, '--gpio', String(DHT_GPIO), '--type', SENSOR_TYPE],
      { timeout: READ_TIMEOUT_MS },
      (err, stdout, stderr) => {
        let parsed = null;
        try { parsed = JSON.parse(String(stdout || '').trim()); } catch { /* non-JSON */ }

        if (parsed && typeof parsed.temperature_c === 'number' && typeof parsed.humidity_pct === 'number') {
          lastGood = { air_temp_c: parsed.temperature_c, humidity_pct: parsed.humidity_pct, at: Date.now() };
          lastSuccess = lastGood.at;
          lastReadOk = true;
          lastError = null;
          log(`read OK — ${lastGood.air_temp_c}°C · ${lastGood.humidity_pct}%`);
        } else {
          lastReadOk = false;
          lastError =
            (parsed && parsed.error) ||
            (stderr && String(stderr).trim().split('\n').pop()) ||
            (err && err.message) ||
            'unknown read error';
          console.warn(`[environment] read failed: ${lastError}`);
        }

        reading = false;
        resolve();
      },
    );
  });
}

/**
 * Start the background reader once at app startup. Non-blocking: never throws,
 * never delays boot — a sensor fault only affects the environment values, not
 * the backend. No-ops unless ENVIRONMENT_ENABLED=true.
 */
function startEnvironmentService() {
  if (started) return;
  started = true;

  if (!ENABLED) {
    log('disabled (set ENVIRONMENT_ENABLED=true to enable DHT11 sensing).');
    return;
  }

  log(`starting — ${SENSOR_TYPE} on GPIO${DHT_GPIO} (Python helper) · refresh ${REFRESH_SECONDS}s · stale ${STALE_SECONDS}s`);

  setTimeout(() => { pollOnce(); }, 1500);  // first read shortly after boot
  const timer = setInterval(() => { pollOnce(); }, Math.max(2, REFRESH_SECONDS) * 1000);
  if (timer.unref) timer.unref();  // don't keep the event loop alive on its own
}

module.exports = { startEnvironmentService, getEnvironmentCached, getEnvironmentStatus };
