'use strict';

/**
 * Greenhouse environment sensor service (Raspberry Pi, DHT11 via Linux IIO).
 *
 * Reads the DHT11 through the kernel's IIO driver (device-tree overlay
 * `dtoverlay=dht11,gpiopin=4`) — Node just reads plain sysfs text files with
 * fs.readFile, so there is NO native addon, no Python, and no build step. The
 * kernel does the microsecond-timed decode; we retry on the occasional checksum
 * error (the driver returns EIO) and cache the last good value.
 *
 * The service owns polling / caching / staleness / status / logging; every ESP
 * POST reads from the cache (getEnvironmentCached), so ingest is never blocked.
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

const fsp  = require('fs').promises;
const path = require('path');

// ─── Config (from .env) ─────────────────────────────────────────────────────
const ENABLED         = String(process.env.ENVIRONMENT_ENABLED || 'false').toLowerCase() === 'true';
const SENSOR_TYPE     = (process.env.ENVIRONMENT_SENSOR_TYPE || 'dht11').toLowerCase();
const REFRESH_SECONDS = Number(process.env.ENVIRONMENT_REFRESH_SECONDS || 30);
const STALE_SECONDS   = Number(process.env.ENVIRONMENT_STALE_SECONDS || 120);
// ENVIRONMENT_DHT_GPIO is documentation only — the GPIO pin is configured by the
// Raspberry Pi device-tree overlay (config.txt), not by Node. Node finds the
// sensor by its IIO device name, not by pin.

// ─── IIO sysfs read ─────────────────────────────────────────────────────────
const IIO_BASE = '/sys/bus/iio/devices';
const RETRY_ATTEMPTS = 3;      // DHT11 IIO reads intermittently return EIO
const RETRY_GAP_MS   = 2000;   // driver enforces a ~2s minimum between captures

let deviceDir = null;  // cached resolved sysfs dir, e.g. /sys/bus/iio/devices/iio:device0

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Find the IIO device whose `name` is our sensor (dht11). Caches the path and
// re-resolves if it disappears.
async function resolveDeviceDir() {
  if (deviceDir) {
    try { await fsp.access(path.join(deviceDir, 'name')); return deviceDir; }
    catch { deviceDir = null; }
  }
  const entries = await fsp.readdir(IIO_BASE);  // throws if IIO isn't present (non-Pi/no overlay)
  for (const entry of entries) {
    if (!entry.startsWith('iio:device')) continue;
    const dir = path.join(IIO_BASE, entry);
    try {
      const name = (await fsp.readFile(path.join(dir, 'name'), 'utf8')).trim();
      if (name === SENSOR_TYPE || name === 'dht11') { deviceDir = dir; return dir; }
    } catch { /* skip unreadable entries */ }
  }
  throw new Error(`no IIO device named "${SENSOR_TYPE}" in ${IIO_BASE} — is dtoverlay=dht11 set in config.txt?`);
}

async function readMilli(dir, file) {
  const raw = (await fsp.readFile(path.join(dir, file), 'utf8')).trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`bad ${file} value: "${raw}"`);
  return n;
}

// One full read attempt (both channels). Throws on any error (EIO, missing, …).
async function readIioOnce() {
  const dir = await resolveDeviceDir();
  const tempMilli = await readMilli(dir, 'in_temp_input');             // milli-°C
  const humMilli  = await readMilli(dir, 'in_humidityrelative_input'); // milli-%RH
  return {
    air_temp_c:   Math.round((tempMilli / 1000) * 10) / 10,
    humidity_pct: Math.round((humMilli  / 1000) * 10) / 10,
  };
}

// Retry a few times — the kernel dht11 driver returns EIO on checksum failures.
async function readDht11(attempts = RETRY_ATTEMPTS) {
  let lastErr;
  for (let i = 0; i <= attempts; i += 1) {
    try { return await readIioOnce(); }
    catch (err) { lastErr = err; if (i < attempts) await sleep(RETRY_GAP_MS); }
  }
  throw lastErr;
}

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

// Read once (via IIO) and update state. Never rejects.
async function pollOnce() {
  if (reading) return;
  reading = true;
  lastReadAt = Date.now();
  try {
    const { air_temp_c, humidity_pct } = await readDht11();
    lastGood = { air_temp_c, humidity_pct, at: Date.now() };
    lastSuccess = lastGood.at;
    lastReadOk = true;
    lastError = null;
    log(`read OK — ${air_temp_c}°C · ${humidity_pct}%`);
  } catch (err) {
    lastReadOk = false;
    lastError = err.message;
    console.warn(`[environment] read failed: ${lastError}`);
  } finally {
    reading = false;
  }
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

  log(`starting — ${SENSOR_TYPE} via IIO sysfs · refresh ${REFRESH_SECONDS}s · stale ${STALE_SECONDS}s`);

  setTimeout(() => { pollOnce(); }, 1500);  // first read shortly after boot
  const timer = setInterval(() => { pollOnce(); }, Math.max(2, REFRESH_SECONDS) * 1000);
  if (timer.unref) timer.unref();  // don't keep the event loop alive on its own
}

module.exports = { startEnvironmentService, getEnvironmentCached, getEnvironmentStatus };
