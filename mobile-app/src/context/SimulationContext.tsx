/**
 * Global simulation context for GreenMirror.
 *
 * When active, generates fake greenhouse readings that drive
 * ALL parts of the app — trends, tasks, alerts, activity — without
 * any real hardware connected.
 *
 * Designed for:
 *  - development / local testing
 *  - user study demos
 *  - research presentations before hardware deployment
 *
 * SimulationProvider must be rendered inside GreenhouseProvider so it can
 * read the currently selected greenhouse and scope the data correctly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { LatestReading } from '../zoneLayout';
import { useGreenhouse } from './GreenhouseContext';
import {
  getSimZoneIds,
  tickStates,
  buildReading,
  generateHistory,
  type ZoneSimState,
} from '../services/simulationService';

// ─── Context type ─────────────────────────────────────────────────────────────

export interface SimulationContextValue {
  /** True while simulation mode is running. */
  isSimulating: boolean;
  /** Start generating fake data for the active greenhouse. */
  startSimulation: () => void;
  /** Stop simulation and clear generated data. */
  stopSimulation: () => void;
  /** Latest simulated reading — replaces API / Firestore when simulating. */
  simReading: LatestReading | null;
  /** Pre-seeded 25-hour history for the trend charts. */
  simHistory: LatestReading[];
}

const SimulationContext = createContext<SimulationContextValue>({
  isSimulating: false,
  startSimulation: () => {},
  stopSimulation: () => {},
  simReading: null,
  simHistory: [],
});

// ─── Provider ─────────────────────────────────────────────────────────────────

const SIM_TICK_MS  = 5_000;   // live tick interval
const HISTORY_HRS  = 25;      // hours of seeded history
const MAX_HIST_LEN = 360;     // keep ~30 hr @ 5-min intervals

export function SimulationProvider({ children }: { children: ReactNode }) {
  const { greenhouse } = useGreenhouse();

  const [isSimulating, setIsSimulating] = useState(false);
  const [simReading,   setSimReading]   = useState<LatestReading | null>(null);
  const [simHistory,   setSimHistory]   = useState<LatestReading[]>([]);

  const statesRef   = useRef<Map<string, ZoneSimState>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Teardown helper ─────────────────────────────────────────────────────────
  const clearSim = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    statesRef.current = new Map();
    setSimReading(null);
    setSimHistory([]);
  }, []);

  // ── (Re)start when isSimulating or greenhouse changes ───────────────────────
  useEffect(() => {
    if (!isSimulating || !greenhouse) {
      clearSim();
      return;
    }

    const ghId    = greenhouse.id;
    const zoneIds = getSimZoneIds(greenhouse.mapKind);

    // Seed history and capture final states to continue from
    console.info(`[Simulation] Seeding ${HISTORY_HRS}h history for ${ghId}…`);
    const { readings, finalStates } = generateHistory(ghId, zoneIds, HISTORY_HRS);
    statesRef.current = finalStates;
    setSimHistory(readings);
    setSimReading(readings.at(-1) ?? null);
    console.info(`[Simulation] Seeded ${readings.length} readings. Live tick starting.`);

    // Clear any previous interval before starting a new one
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const ts = new Date();
      tickStates(statesRef.current, ts.getTime());
      const reading = buildReading(ghId, zoneIds, statesRef.current, ts);
      setSimReading(reading);
      setSimHistory((prev) => {
        const next = [...prev, reading];
        return next.length > MAX_HIST_LEN ? next.slice(-MAX_HIST_LEN) : next;
      });
    }, SIM_TICK_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isSimulating, greenhouse, clearSim]);

  const startSimulation = useCallback(() => {
    console.info('[Simulation] Starting simulation mode');
    setIsSimulating(true);
  }, []);

  const stopSimulation = useCallback(() => {
    console.info('[Simulation] Stopping simulation mode');
    setIsSimulating(false);
    clearSim();
  }, [clearSim]);

  const value = useMemo<SimulationContextValue>(
    () => ({ isSimulating, startSimulation, stopSimulation, simReading, simHistory }),
    [isSimulating, startSimulation, stopSimulation, simReading, simHistory],
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSimulation(): SimulationContextValue {
  return useContext(SimulationContext);
}
