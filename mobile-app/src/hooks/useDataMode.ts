/**
 * Global chart data mode — "dummy" (sample data) vs "real" (Firebase data).
 *
 * Defaults to 'dummy' for now so charts always show something while the real
 * Firebase pipeline is being finished. The choice is persisted in localStorage
 * and shared across components via a tiny event bus, so a single toggle flips
 * every chart that reads this hook.
 */

import { useEffect, useState } from 'react';

export type DataMode = 'dummy' | 'real';

const STORAGE_KEY = 'greenmirror-data-mode';
const EVENT = 'greenmirror-data-mode-change';

function read(): DataMode {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'real' ? 'real' : 'dummy'; // default: dummy
  } catch {
    return 'dummy';
  }
}

export function useDataMode(): [DataMode, (m: DataMode) => void] {
  const [mode, setMode] = useState<DataMode>(read);

  useEffect(() => {
    // Stay in sync when another component (or tab) changes the mode.
    const onChange = () => setMode(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const set = (m: DataMode) => {
    try { window.localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
    setMode(m);
    window.dispatchEvent(new Event(EVENT));
  };

  return [mode, set];
}
