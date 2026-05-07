import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, RotateCcw, Settings2 } from 'lucide-react';
import { ZoneCard } from './ZoneCard';
import { ZoneDetailSheet } from './ZoneDetailSheet';
import {
  LatestReading,
  LayoutSettings,
  VisualZone,
  createDefaultSettings,
  getZoneStatus,
  mapZonesToLayout,
  sanitizeSettings
} from '../zoneLayout';

interface GreenhouseViewProps {
  latestReading: LatestReading | null;
  loading: boolean;
  error: string | null;
}

const STORAGE_KEY = 'greenmirror-map-layout-settings';

function loadStoredSettings() {
  if (typeof window === 'undefined') return createDefaultSettings();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return createDefaultSettings();
  }
}

function countAttentionZones(zones: VisualZone[]) {
  return zones.filter((zone) => {
    const status = getZoneStatus(zone);
    return status.tone === 'dry' || status.tone === 'wet' || status.tone === 'alert';
  }).length;
}

export function GreenhouseView({ latestReading, loading, error }: GreenhouseViewProps) {
  const [selectedZone, setSelectedZone] = useState<VisualZone | null>(null);
  const [mode, setMode] = useState<'live' | 'simulate'>('live');
  const [wateringVolume, setWateringVolume] = useState(200);
  const [simRunning, setSimRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(loadStoredSettings);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutSettings));
  }, [layoutSettings]);

  const layout = mapZonesToLayout(latestReading, layoutSettings);
  const liveZones = layout.rows.flatMap((row) => row.zones);
  const activeLayout = layout;
  const needsAttention = countAttentionZones(activeLayout.rows.flatMap((row) => row.zones));
  const totalVisibleZones = layoutSettings.rows * layoutSettings.sectionsPerRow;

  useEffect(() => {
    if (!selectedZone) return;

    const updatedZone =
      activeLayout.rows.flatMap((row) => row.zones).find((zone) => zone.id === selectedZone.id) ??
      activeLayout.overflowZones.find((zone) => zone.id === selectedZone.id);

    if (updatedZone) {
      setSelectedZone(updatedZone);
      return;
    }

    setSelectedZone(null);
  }, [activeLayout, selectedZone]);

  const runSimulation = () => {
    setSimRunning(true);

    setTimeout(() => {
      setSimRunning(false);
    }, 900);
  };

  const updateLayoutSetting = (key: keyof LayoutSettings, value: number) => {
    setLayoutSettings((current) =>
      sanitizeSettings({
        ...current,
        [key]: value
      })
    );
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Greenhouse Map</h2>
          <p className="mt-1 text-stone-500 font-medium">
            {error
              ? 'Backend is offline or unreachable'
              : !loading && !latestReading
              ? 'No data yet'
              : needsAttention > 0
              ? `${needsAttention} zone${needsAttention > 1 ? 's' : ''} need attention`
              : 'Everything looks great!'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm border border-stone-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Visible</p>
            <p className="text-lg font-extrabold text-stone-800">{totalVisibleZones}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((current) => !current)}
            className="rounded-2xl border border-stone-200 bg-white p-3 text-stone-500 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-700"
          >
            <Settings2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-stone-800">Map Settings</h3>
                <p className="text-sm text-stone-500">
                  Adjust the greenhouse layout and keep it saved on this device.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="rounded-2xl bg-stone-50 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Rows</span>
                  <input
                    type="number"
                    min={1}
                    max={26}
                    value={layoutSettings.rows}
                    onChange={(event) => updateLayoutSetting('rows', Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <label className="rounded-2xl bg-stone-50 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Sections</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={layoutSettings.sectionsPerRow}
                    onChange={(event) => updateLayoutSetting('sectionsPerRow', Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
              </div>

              <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Total Zones</p>
                <p className="mt-1 text-lg font-extrabold text-emerald-800">
                  {layoutSettings.rows * layoutSettings.sectionsPerRow}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex bg-white p-1 rounded-xl border border-stone-200">
        <button
          type="button"
          onClick={() => setMode('live')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'live' ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500'}`}
        >
          Live View
        </button>
        <button
          type="button"
          onClick={() => setMode('simulate')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'simulate' ? 'bg-blue-100 text-blue-700' : 'text-stone-500'}`}
        >
          <Droplets className="h-4 w-4" />
          Simulate
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-4 text-[11px] font-bold">
        <span className="flex items-center gap-1.5 text-stone-500">
          <span className="h-3 w-3 rounded-full bg-emerald-500"></span> Good
        </span>
        <span className="flex items-center gap-1.5 text-stone-500">
          <span className="h-3 w-3 rounded-full bg-amber-500"></span> Getting dry
        </span>
        <span className="flex items-center gap-1.5 text-stone-500">
          <span className="h-3 w-3 rounded-full bg-sky-500"></span> Too wet
        </span>
        <span className="flex items-center gap-1.5 text-stone-500">
          <span className="h-3 w-3 rounded-full bg-rose-500"></span> Alert
        </span>
        <span className="flex items-center gap-1.5 text-stone-500">
          <span className="h-3 w-3 rounded-full bg-stone-400"></span> No data
        </span>
      </div>

      {!loading && !error && totalVisibleZones === 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 text-center text-sm text-stone-500">
          No data yet
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Compact Layout</p>
            <h3 className="text-lg font-bold text-stone-800">Vertical greenhouse grid</h3>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">
            {layoutSettings.rows} x {layoutSettings.sectionsPerRow}
          </p>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {activeLayout.rows.map((row) => (
              <div key={row.rowLabel} className="w-[68px] shrink-0">
                <div className="mb-2 rounded-xl bg-stone-100 px-2 py-1 text-center text-[11px] font-extrabold uppercase tracking-wider text-stone-600">
                  {row.rowLabel}
                </div>
                <div className="space-y-1.5">
                  {row.zones.map((zone) => (
                    <ZoneCard key={zone.id} zone={zone} onSelect={setSelectedZone} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {activeLayout.overflowZones.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Overflow Zones</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeLayout.overflowZones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setSelectedZone(zone)}
                  className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-800 shadow-sm"
                >
                  {zone.backendZoneId ?? zone.visualLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <div className="rounded-full bg-stone-200 px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Entrance
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {mode === 'simulate' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl border border-blue-200 bg-blue-50 p-5"
          >
            <h3 className="flex items-center gap-2 font-bold text-blue-900">
              <Droplets className="h-5 w-5 text-blue-500" />
              Watering Simulation
            </h3>
            <p className="mt-1 text-xs font-medium text-blue-700">
              Preview how the current visible greenhouse layout reacts to extra water.
            </p>

            <div className="mt-4">
              <div className="mb-2 flex justify-between text-sm font-bold text-blue-800">
                <span>Watering Volume</span>
                <span>{wateringVolume}ml per zone</span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="50"
                value={wateringVolume}
                onChange={(event) => setWateringVolume(Number(event.target.value))}
                className="w-full cursor-pointer appearance-none rounded-full bg-blue-200 accent-blue-600"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={runSimulation}
                disabled={simRunning || liveZones.length === 0}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {simRunning ? 'Simulating...' : 'Run Simulation'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('live');
                  setSimRunning(false);
                }}
                className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-700"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ZoneDetailSheet zone={selectedZone} onClose={() => setSelectedZone(null)} />
    </div>
  );
}
