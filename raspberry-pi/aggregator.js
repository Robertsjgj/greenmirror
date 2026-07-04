'use strict';

/**
 * Multi-node reading aggregator.
 *
 * Each ESP node POSTs its own 1–2 zones to /api/readings independently. Writing
 * every POST straight to latestReadings would overwrite the previous node, so the
 * dashboard would only ever show the last node that posted.
 *
 * This module keeps an in-memory map of the latest zones per node_id (scoped by
 * greenhouse_id) and, on every POST, returns the MERGED set of zones from all
 * nodes that are still "active" (seen within NODE_STALE_TIMEOUT_MS). Nodes that
 * go quiet longer than the timeout are dropped, so their beds stop reporting
 * instead of freezing on stale values.
 *
 * Nothing here writes to Firestore or builds the final snapshot — server.js does
 * that from the combined zones returned by recordNodeReading().
 */

// A node is considered offline once it hasn't posted for this long. Tunable via
// env; default 60s (the firmware posts every ~5s, so this tolerates ~12 misses).
const NODE_STALE_TIMEOUT_MS = Number(process.env.NODE_STALE_TIMEOUT_MS) || 60_000;

// greenhouseId -> { nodes: Map<nodeId, { zones, lastSeen }>, lastEnvironment }
const greenhouses = new Map();

function getGreenhouse(greenhouseId) {
  let gh = greenhouses.get(greenhouseId);
  if (!gh) {
    gh = { nodes: new Map(), lastEnvironment: null };
    greenhouses.set(greenhouseId, gh);
  }
  return gh;
}

/**
 * Record one node's latest reading and return the merged view of all active nodes.
 *
 * @param {object} opts
 * @param {string} opts.greenhouseId
 * @param {string} opts.nodeId
 * @param {Array}  [opts.zones]        raw zones from this POST
 * @param {object|null} [opts.environment]  RPi ambient sensor (greenhouse-level), if sent
 * @param {number} [opts.now]          injectable clock for tests
 *
 * @returns {{
 *   combinedZones: Array,
 *   activeNodeIds: string[],
 *   activeNodeCount: number,
 *   staleRemoved: string[],
 *   duplicateZoneIds: Array<{ zone_id: string, nodes: string[], count: number }>,
 *   environment: object|null,
 *   staleTimeoutMs: number,
 * }}
 */
function recordNodeReading({ greenhouseId, nodeId, zones = [], environment = null, now = Date.now() }) {
  const gh = getGreenhouse(greenhouseId);

  // Normalise: guarantee every zone carries its node_id + greenhouse_id so the
  // combined set is self-describing (older payloads may omit per-zone node_id).
  const normZones = (Array.isArray(zones) ? zones : []).map((z) => ({
    ...z,
    node_id: z.node_id || nodeId,
    greenhouse_id: z.greenhouse_id || greenhouseId,
  }));

  // Replace this node's zones (not append) and stamp lastSeen.
  gh.nodes.set(nodeId, { zones: normZones, lastSeen: now });

  // The RPi ambient sensor is greenhouse-level; keep the most recent one seen so
  // it persists across posts from nodes that don't carry environment data.
  if (environment) gh.lastEnvironment = environment;

  // Drop stale nodes so their beds stop reporting.
  const staleRemoved = [];
  for (const [id, node] of gh.nodes) {
    if (now - node.lastSeen > NODE_STALE_TIMEOUT_MS) {
      gh.nodes.delete(id);
      staleRemoved.push(id);
    }
  }

  // Merge zones from every active node (Map preserves first-seen node order).
  const combinedZones = [];
  for (const node of gh.nodes.values()) {
    for (const z of node.zones) combinedZones.push(z);
  }

  // Detect zone_id collisions across the active set (or within one node).
  const owners = new Map(); // zone_id -> { count, nodes:Set<nodeId> }
  for (const z of combinedZones) {
    if (!z.zone_id) continue;
    const e = owners.get(z.zone_id) || { count: 0, nodes: new Set() };
    e.count += 1;
    e.nodes.add(z.node_id);
    owners.set(z.zone_id, e);
  }
  const duplicateZoneIds = [];
  for (const [zone_id, e] of owners) {
    if (e.count > 1) duplicateZoneIds.push({ zone_id, nodes: [...e.nodes], count: e.count });
  }

  return {
    combinedZones,
    activeNodeIds: [...gh.nodes.keys()],
    activeNodeCount: gh.nodes.size,
    staleRemoved,
    duplicateZoneIds,
    environment: gh.lastEnvironment,
    staleTimeoutMs: NODE_STALE_TIMEOUT_MS,
  };
}

/** Test/diagnostic helper — clears all tracked state. */
function _reset() {
  greenhouses.clear();
}

module.exports = { recordNodeReading, NODE_STALE_TIMEOUT_MS, _reset };
