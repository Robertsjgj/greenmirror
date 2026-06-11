'use strict';

/**
 * Rollup writer — raspberry-pi backend.
 *
 * Accumulates every reading tick into in-memory hourly + daily buckets and
 * periodically upserts compact summary documents into the `readingsRollups`
 * collection. The mobile app reads these instead of raw `readings` for the
 * 7D / 30D / 3M / 1Y trend ranges, so long-range charts stay cheap — tens to
 * a few hundred docs per range instead of thousands of raw readings.
 *
 *   hourly  →  fed to the 7D range
 *   daily   →  fed to the 30D / 3M / 1Y ranges
 *   (24h still reads raw `readings` for full per-zone resolution.)
 *
 * Each rollup doc is shaped like a LatestReading (greenhouse_id, timestamp,
 * zones[], summary, environment, external_weather) so the existing frontend
 * bucketing code consumes it unchanged. On top of that it carries the
 * headline summary fields requested for the dashboard:
 *
 *   hourly:  avg_moisture, avg_soil_temp, min_moisture, max_moisture
 *   daily:   avg_moisture, avg_soil_temp, watering_count, zones_needing_attention
 *
 * (All fields are written on both periods where cheap — period-specific
 * consumers just read the ones they care about.)
 *
 * Bucketing aligns to UTC hour / UTC day. The frontend re-buckets rollup
 * points into its own calendar slots using each doc's `timestamp`, so the
 * exact boundary convention here only affects which raw tick lands in which
 * summary, not how the chart is drawn.
 */

const { buildGreenhouseReadingSnapshot } = require('./snapshot');

// How often the *current* (still-filling) bucket docs are re-written so the
// app sees fresh data before the hour/day completes. Completed buckets are
// also flushed once more, finally, the moment a tick rolls into a new bucket.
const UPSERT_INTERVAL_MS = Number(process.env.FIRESTORE_ROLLUP_WRITE_INTERVAL_MS) || 300_000; // 5 min
// Daily watering_count is read from `wateringEvents`; cache it to avoid a
// query on every upsert (watering volume changes slowly).
const WATER_REFRESH_MS = 600_000; // 10 min

// ─── Time bucketing ─────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function dayKeyOf(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function hourKeyOf(d) {
  return `${dayKeyOf(d)}T${pad(d.getUTCHours())}`;
}
function keyFor(d, period) {
  return period === 'hourly' ? hourKeyOf(d) : dayKeyOf(d);
}

function bucketStart(d, period) {
  const s = new Date(d);
  s.setUTCMinutes(0, 0, 0);
  if (period === 'daily') s.setUTCHours(0);
  return s;
}
function bucketEnd(start, period) {
  const e = new Date(start);
  if (period === 'hourly') e.setUTCHours(e.getUTCHours() + 1);
  else e.setUTCDate(e.getUTCDate() + 1);
  return e;
}

// ─── Accumulator ──────────────────────────────────────────────────────────--

function newAgg(key, start) {
  return {
    key,
    start,
    sampleCount: 0,
    mSum: 0, mC: 0, mMin: Infinity, mMax: -Infinity,  // overall soil moisture
    tSum: 0, tC: 0,                                    // overall soil temp
    envTSum: 0, envTC: 0, envHSum: 0, envHC: 0,        // RPi air temp / humidity
    extTSum: 0, extTC: 0, extHSum: 0, extHC: 0,        // external weather
    zones: new Map(),                                  // zone_id → per-zone sums
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function addReading(agg, reading) {
  agg.sampleCount++;

  const env = reading.environment || null;
  const et = env ? (env.air_temp_c ?? reading.env_temp_c) : reading.env_temp_c;
  if (isNum(et) && et > -40 && et < 80) { agg.envTSum += et; agg.envTC++; }
  const eh = env ? (env.humidity_pct ?? reading.env_humidity_pct) : reading.env_humidity_pct;
  if (isNum(eh) && eh >= 0 && eh <= 100) { agg.envHSum += eh; agg.envHC++; }

  const xw = reading.external_weather || null;
  if (xw && isNum(xw.temp_c) && xw.temp_c > -60 && xw.temp_c < 60) { agg.extTSum += xw.temp_c; agg.extTC++; }
  if (xw && isNum(xw.humidity_pct) && xw.humidity_pct >= 0 && xw.humidity_pct <= 100) { agg.extHSum += xw.humidity_pct; agg.extHC++; }

  for (const z of reading.zones || []) {
    const id = z.zone_id;
    if (!id) continue;
    let zg = agg.zones.get(id);
    if (!zg) {
      zg = { zone_name: z.zone_name || id, node_id: z.node_id || '', mSum: 0, mC: 0, tSum: 0, tC: 0 };
      agg.zones.set(id, zg);
    }
    const m = z.soil_moisture_pct;
    if (isNum(m) && m >= 0 && m <= 100) {
      zg.mSum += m; zg.mC++;
      agg.mSum += m; agg.mC++;
      if (m < agg.mMin) agg.mMin = m;
      if (m > agg.mMax) agg.mMax = m;
    }
    const t = z.soil_temp_c;
    // Skip DS18B20 error sentinels (-127 disconnected, 85 power-on default)
    if (isNum(t) && t !== -127 && t !== 85 && t > -40 && t < 80) {
      zg.tSum += t; zg.tC++;
      agg.tSum += t; agg.tC++;
    }
  }
}

const round1 = (v) => Number(v.toFixed(1));

// Mirror server.js analyzeZone() so "needs attention" matches the live alerts.
function zoneAlerts(moisture, temp) {
  const alerts = [];
  if (isNum(moisture)) {
    if (moisture < 30) alerts.push('too dry');
    if (moisture > 80) alerts.push('too wet');
  }
  if (isNum(temp) && temp < 10) alerts.push('too cold');
  return alerts;
}

/**
 * Turn an accumulator into a Firestore rollup document. Reuses
 * buildGreenhouseReadingSnapshot so zones[] / summary match the live
 * reading shape exactly, then layers the rollup-specific fields on top.
 */
function buildDoc(ghId, period, agg, wateringCount) {
  let zonesNeedingAttention = 0;
  const rawZones = [];
  for (const [zone_id, zg] of agg.zones) {
    const moisture = zg.mC ? round1(zg.mSum / zg.mC) : null;
    const temp = zg.tC ? round1(zg.tSum / zg.tC) : null;
    const alerts = zoneAlerts(moisture, temp);
    if (alerts.length) zonesNeedingAttention++;
    rawZones.push({
      zone_id,
      zone_name: zg.zone_name,
      node_id: zg.node_id,
      soil_moisture_pct: moisture,
      soil_temp_c: temp,
      alerts,
    });
  }

  const startISO = agg.start.toISOString();
  const snapshot = buildGreenhouseReadingSnapshot({
    greenhouseId: ghId,
    mode: 'rollup',
    rawZones,
    environment: agg.envTC || agg.envHC
      ? {
          source: 'rollup',
          air_temp_c: agg.envTC ? round1(agg.envTSum / agg.envTC) : null,
          humidity_pct: agg.envHC ? round1(agg.envHSum / agg.envHC) : null,
        }
      : null,
    externalWeather: agg.extTC || agg.extHC
      ? {
          temp_c: agg.extTC ? round1(agg.extTSum / agg.extTC) : null,
          humidity_pct: agg.extHC ? round1(agg.extHSum / agg.extHC) : null,
        }
      : null,
    nodeCount: rawZones.length,
    timestamp: startISO,
  });

  const avgMoisture = agg.mC ? round1(agg.mSum / agg.mC) : null;
  const avgSoilTemp = agg.tC ? round1(agg.tSum / agg.tC) : null;

  return {
    ...snapshot,
    // ── Rollup identity / range-query fields ──
    period,                                   // 'hourly' | 'daily'
    bucket_start: startISO,
    bucket_end: bucketEnd(agg.start, period).toISOString(),
    timestamp: startISO,                      // queried with where('timestamp','>=',cutoff)
    sample_count: agg.sampleCount,
    // ── Headline summary metrics ──
    avg_moisture: avgMoisture,
    avg_soil_temp: avgSoilTemp,
    min_moisture: agg.mC ? round1(agg.mMin) : null,
    max_moisture: agg.mC ? round1(agg.mMax) : null,
    watering_count: wateringCount,            // null on hourly, number on daily
    zones_needing_attention: zonesNeedingAttention,
  };
}

// ─── Writer ───────────────────────────────────────────────────────────────--

function createRollupWriter(admin, db) {
  const verbose = process.env.FIRESTORE_VERBOSE === 'true';
  console.log(`[Rollups] enabled — current bucket refresh every ${UPSERT_INTERVAL_MS / 1000}s`);

  const PERIODS = ['hourly', 'daily'];
  const state = new Map();      // `${ghId}|${period}` → agg
  const waterCache = new Map(); // `${ghId}|${dayKey}` → { count, at }
  let lastUpsert = 0;

  async function dailyWateringCount(ghId, dayStart) {
    const ck = `${ghId}|${dayKeyOf(dayStart)}`;
    const cached = waterCache.get(ck);
    if (cached && Date.now() - cached.at < WATER_REFRESH_MS) return cached.count;
    try {
      const start = bucketStart(dayStart, 'daily');
      const end = bucketEnd(start, 'daily');
      // wateringEvents.timestamp is a Firestore Timestamp → compare with Dates.
      const snap = await db.collection('wateringEvents')
        .where('greenhouseId', '==', ghId)
        .where('timestamp', '>=', start)
        .where('timestamp', '<', end)
        .get();
      waterCache.set(ck, { count: snap.size, at: Date.now() });
      return snap.size;
    } catch (err) {
      console.warn('[Rollups] watering_count query failed (non-fatal):', err.message);
      return cached ? cached.count : 0;
    }
  }

  async function flush(ghId, period, agg, final) {
    try {
      const wateringCount = period === 'daily' ? await dailyWateringCount(ghId, agg.start) : null;
      const docData = {
        ...buildDoc(ghId, period, agg, wateringCount),
        _savedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const id = `${ghId}__${period}__${agg.key}`;
      await db.collection('readingsRollups').doc(id).set(docData);
      if (verbose) {
        console.log(`[Rollups] upsert ${id} · ${agg.sampleCount} samples${final ? ' [final]' : ''}`);
      }
    } catch (err) {
      console.error('[Rollups] write failed (non-fatal):', err.message);
    }
  }

  /** Call on every reading tick (before the latestReadings/history throttle). */
  async function record(reading) {
    const ghId = reading.greenhouse_id || 'sydney-greenhouse';
    const ts = reading.timestamp ? new Date(reading.timestamp) : new Date();
    if (isNaN(ts.getTime())) return;

    for (const period of PERIODS) {
      const sk = `${ghId}|${period}`;
      const key = keyFor(ts, period);
      let agg = state.get(sk);
      if (!agg || agg.key !== key) {
        // Bucket rolled over. Swap in the fresh bucket synchronously BEFORE the
        // (fire-and-forget) final write of the old one, so a tick arriving mid-
        // flush accumulates into the new bucket rather than a doomed old agg.
        const completed = agg;
        agg = newAgg(key, bucketStart(ts, period));
        state.set(sk, agg);
        if (completed) {
          flush(ghId, period, completed, true).catch((err) =>
            console.error('[Rollups] final flush failed (non-fatal):', err.message));
        }
      }
      addReading(agg, reading);
    }

    // Throttled refresh of the still-filling buckets so the dashboard isn't
    // stuck waiting for the hour/day to complete.
    const now = Date.now();
    if (now - lastUpsert >= UPSERT_INTERVAL_MS) {
      lastUpsert = now;
      for (const period of PERIODS) {
        const agg = state.get(`${ghId}|${period}`);
        if (agg) await flush(ghId, period, agg, false);
      }
    }
  }

  return { record };
}

module.exports = { createRollupWriter };
