/**
 * Global greenhouse context.
 *
 * Holds which greenhouse the user has selected for this session.
 * Persists the selection to localStorage under 'greenmirror-map-kind'
 * (same key as the old mapKind state — existing selections migrate
 * automatically since the values 'sydney' | 'truro' are unchanged).
 *
 * Usage:
 *   const { greenhouse, setGreenhouse, clearGreenhouse } = useGreenhouse();
 *
 * greenhouse is null on first launch (no selection) — the app
 * should render GreenhouseSelector instead of the main UI.
 */

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import {
  type MapKind,
  type GreenhouseMeta,
  GREENHOUSES,
} from '../greenhouses';

// ─── Storage ─────────────────────────────────────────────────────────────────

const GH_STORAGE_KEY = 'greenmirror-map-kind';

function loadStoredMapKind(): MapKind | null {
  try {
    const stored = window.localStorage.getItem(GH_STORAGE_KEY);
    if (stored === 'sydney' || stored === 'truro') return stored;
  } catch {}
  return null; // null → show GreenhouseSelector
}

// ─── Context type ─────────────────────────────────────────────────────────────

export interface GreenhouseContextValue {
  /** Selected greenhouse, or null if user hasn't chosen yet. */
  greenhouse: GreenhouseMeta | null;
  /** Select (or switch to) a greenhouse by map kind. */
  setGreenhouse: (kind: MapKind) => void;
  /** Clear selection — returns app to the onboarding selector screen. */
  clearGreenhouse: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GreenhouseContext = createContext<GreenhouseContextValue>({
  greenhouse: null,
  setGreenhouse: () => {},
  clearGreenhouse: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GreenhouseProvider({ children }: { children: ReactNode }) {
  const [mapKind, setMapKindState] = useState<MapKind | null>(loadStoredMapKind);

  const greenhouse: GreenhouseMeta | null = mapKind ? GREENHOUSES[mapKind] : null;

  const setGreenhouse = useCallback((kind: MapKind) => {
    setMapKindState(kind);
    try { window.localStorage.setItem(GH_STORAGE_KEY, kind); } catch {}
  }, []);

  const clearGreenhouse = useCallback(() => {
    setMapKindState(null);
    try { window.localStorage.removeItem(GH_STORAGE_KEY); } catch {}
  }, []);

  return (
    <GreenhouseContext.Provider value={{ greenhouse, setGreenhouse, clearGreenhouse }}>
      {children}
    </GreenhouseContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGreenhouse(): GreenhouseContextValue {
  return useContext(GreenhouseContext);
}
