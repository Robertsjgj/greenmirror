/**
 * Global greenhouse context.
 *
 * Holds which greenhouse the user has selected for this browser/device.
 * Persists the selection to localStorage under 'greenmirror-map-kind'.
 */

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import {
  type MapKind,
  type GreenhouseMeta,
  GREENHOUSES,
  greenhouseIdToMapKind,
} from "../greenhouses";

// ─── Storage ─────────────────────────────────────────────────────────────────

const GH_STORAGE_KEY = "greenmirror-map-kind";

function safelySetStoredMapKind(kind: MapKind): void {
  try {
    window.localStorage.setItem(GH_STORAGE_KEY, kind);
  } catch (err) {
    // localStorage can fail in private mode or restricted browsers.
    console.warn("[GreenMirror] Could not save greenhouse selection:", err);
  }
}

function safelyClearStoredMapKind(): void {
  try {
    window.localStorage.removeItem(GH_STORAGE_KEY);
  } catch (err) {
    console.warn("[GreenMirror] Could not clear greenhouse selection:", err);
  }
}

function loadStoredMapKind(): MapKind | null {
  try {
    const stored = window.localStorage.getItem(GH_STORAGE_KEY);
    if (stored === "sydney" || stored === "truro") return stored;
  } catch (err) {
    console.warn("[GreenMirror] Could not load greenhouse selection:", err);
  }

  return null;
}

// ─── Context type ─────────────────────────────────────────────────────────────

export interface GreenhouseContextValue {
  greenhouse: GreenhouseMeta | null;
  setGreenhouse: (kind: MapKind) => void;
  setGreenhouseById: (greenhouseId: string) => void;
  clearGreenhouse: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GreenhouseContext = createContext<GreenhouseContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GreenhouseProvider({ children }: { children: ReactNode }) {
  const [mapKind, setMapKindState] = useState<MapKind | null>(
    loadStoredMapKind,
  );

  const greenhouse: GreenhouseMeta | null = mapKind
    ? GREENHOUSES[mapKind]
    : null;

  const setGreenhouse = useCallback((kind: MapKind) => {
    setMapKindState(kind);
    safelySetStoredMapKind(kind);
  }, []);

  const setGreenhouseById = useCallback((greenhouseId: string) => {
    const kind = greenhouseIdToMapKind(greenhouseId);
    setMapKindState(kind);
    safelySetStoredMapKind(kind);
  }, []);

  const clearGreenhouse = useCallback(() => {
    setMapKindState(null);
    safelyClearStoredMapKind();
  }, []);

  return (
    <GreenhouseContext.Provider
      value={{
        greenhouse,
        setGreenhouse,
        setGreenhouseById,
        clearGreenhouse,
      }}
    >
      {children}
    </GreenhouseContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGreenhouse(): GreenhouseContextValue {
  const context = useContext(GreenhouseContext);

  if (!context) {
    throw new Error("useGreenhouse must be used inside a GreenhouseProvider.");
  }

  return context;
}
