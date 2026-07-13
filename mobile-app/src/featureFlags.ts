/**
 * Build-time feature flags.
 *
 * Flip a flag and rebuild — no other edits needed. The feature's code stays in
 * the tree either way; the flag only controls whether the UI exposes it.
 */

/**
 * Simulation mode — generates fake sensor readings that replace Firestore/API
 * data across the whole app (see SimulationContext).
 *
 * When false:
 *   - the Map/Simulation toggle on the map tab is hidden (GreenhouseView)
 *   - the "Start simulation mode" row in the account sheet is hidden
 *     (SiteSwitcherSheet)
 *   - startSimulation() is a no-op, so no stray caller can turn it on
 *
 * Set to true to bring it all back. Nothing else needs changing.
 */
export const SIMULATION_ENABLED = false;
