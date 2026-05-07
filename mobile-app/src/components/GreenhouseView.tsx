import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplets, Play, RotateCcw, X, Sprout, Clock } from 'lucide-react';

type ZoneStatus = 'healthy' | 'monitor' | 'needs-water';

interface ZoneReading {
  zone_id: string;
  node_id?: string;
  soil_moisture_pct: number;
  soil_temp_c: number | null;
  alerts?: string[];
}

interface LatestReading {
  zones: ZoneReading[];
}

interface ZoneCard {
  id: string;
  zoneId: string;
  nodeId?: string;
  status: ZoneStatus;
  statusText: string;
  moisture: number;
  soilTempC: number | null;
  alerts: string[];
  action: string;
  emoji: string;
}

interface GreenhouseViewProps {
  latestReading: LatestReading | null;
  loading: boolean;
  error: string | null;
}

const ZONE_EMOJIS = ['🌱', '🍅', '🥬', '🌿', '🌶️', '🍓', '🌻', '🌽', '🥕', '🪴'];

const getZoneBg = (status: ZoneStatus) => {
  switch (status) {
    case 'healthy':
      return 'bg-emerald-100 border-emerald-300';
    case 'monitor':
      return 'bg-amber-100 border-amber-300';
    case 'needs-water':
      return 'bg-rose-100 border-rose-300';
  }
};

const getZoneDot = (status: ZoneStatus) => {
  switch (status) {
    case 'healthy':
      return 'bg-emerald-500';
    case 'monitor':
      return 'bg-amber-500';
    case 'needs-water':
      return 'bg-rose-500';
  }
};

const getBarColor = (moisture: number) => {
  if (moisture < 30) return 'bg-rose-400';
  if (moisture < 60) return 'bg-amber-400';
  return 'bg-emerald-400';
};

const getMoistureLabel = (moisture: number) => {
  if (moisture < 25) return { text: 'Too Dry', color: 'text-rose-600' };
  if (moisture < 50) return { text: 'Getting Dry', color: 'text-amber-600' };
  if (moisture < 75) return { text: 'Just Right', color: 'text-emerald-600' };
  return { text: 'Nice and Wet', color: 'text-blue-600' };
};

const getLiveZoneState = (zone: ZoneReading) => {
  const alerts = zone.alerts ?? [];

  if (alerts.includes('too dry') || zone.soil_moisture_pct < 30) {
    return {
      status: 'needs-water' as ZoneStatus,
      statusText: 'Needs water!',
      action: 'Water 200ml today'
    };
  }

  if (alerts.includes('too wet') || zone.soil_moisture_pct > 80) {
    return {
      status: 'monitor' as ZoneStatus,
      statusText: 'Too wet!',
      action: 'Pause watering and recheck'
    };
  }

  if (alerts.includes('too cold')) {
    return {
      status: 'monitor' as ZoneStatus,
      statusText: 'Too cold!',
      action: 'Check soil temperature'
    };
  }

  return {
    status: 'healthy' as ZoneStatus,
    statusText: 'All good',
    action: 'No action needed'
  };
};

const buildLiveZones = (latestReading: LatestReading | null) =>
  (latestReading?.zones ?? []).map((zone, index) => {
    const state = getLiveZoneState(zone);

    return {
      id: `${zone.node_id ?? 'node'}-${zone.zone_id}`,
      zoneId: zone.zone_id,
      nodeId: zone.node_id,
      status: state.status,
      statusText: state.statusText,
      moisture: zone.soil_moisture_pct,
      soilTempC: zone.soil_temp_c,
      alerts: zone.alerts ?? [],
      action: state.action,
      emoji: ZONE_EMOJIS[index % ZONE_EMOJIS.length]
    };
  });

export function GreenhouseView({ latestReading, loading, error }: GreenhouseViewProps) {
  const [selectedZone, setSelectedZone] = useState<ZoneCard | null>(null);
  const [mode, setMode] = useState<'live' | 'simulate'>('live');
  const [wateringVolume, setWateringVolume] = useState(200);
  const [simRunning, setSimRunning] = useState(false);
  const [simZones, setSimZones] = useState<ZoneCard[] | null>(null);
  const liveZones = buildLiveZones(latestReading);
  const activeZones = simZones || liveZones;

  useEffect(() => {
    if (!selectedZone) return;

    const updatedZone = activeZones.find((zone) => zone.id === selectedZone.id);
    if (updatedZone) {
      setSelectedZone(updatedZone);
      return;
    }

    setSelectedZone(null);
  }, [activeZones, selectedZone]);

  const needsAttention = activeZones.filter((zone) => zone.status !== 'healthy').length;

  const runSimulation = () => {
    setSimRunning(true);

    setTimeout(() => {
      const simulated = liveZones.map((zone) => {
        const addedMoisture = Math.round((wateringVolume / 100) * 15 + Math.random() * 5);
        const newMoisture = Math.min(100, zone.moisture + addedMoisture);

        let status: ZoneStatus = 'healthy';
        let statusText = 'All good';
        let action = 'No action needed';

        if (newMoisture > 85) {
          status = 'monitor';
          statusText = 'Too wet!';
          action = 'Stop watering - soil is saturated';
        } else if (newMoisture > 65) {
          status = 'monitor';
          statusText = 'Getting wet';
          action = 'Reduce watering amount';
        }

        return {
          ...zone,
          moisture: newMoisture,
          status,
          statusText,
          action
        };
      });

      setSimZones(simulated);
      setSimRunning(false);
    }, 1200);
  };

  const resetSimulation = () => {
    setSimZones(null);
    setSimRunning(false);
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Greenhouse Map</h2>
          <p className="text-stone-500 font-medium mt-1">
            {error
              ? 'Backend is offline or unreachable'
              : !loading && !latestReading
              ? 'No data yet'
              : needsAttention > 0
              ? `${needsAttention} zone${needsAttention > 1 ? 's' : ''} need attention`
              : 'Everything looks great!'}
          </p>
        </div>
        {latestReading && (
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Live Zones</p>
            <p className="text-lg font-extrabold text-stone-800">{liveZones.length}</p>
          </div>
        )}
      </div>

      <div className="flex bg-white p-1 rounded-xl border border-stone-200">
        <button
          onClick={() => {
            setMode('live');
            resetSimulation();
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'live' ? 'bg-emerald-100 text-emerald-700' : 'text-stone-500'}`}
        >
          <Sprout className="w-4 h-4" />
          Live View
        </button>
        <button
          onClick={() => setMode('simulate')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'simulate' ? 'bg-blue-100 text-blue-700' : 'text-stone-500'}`}
        >
          <Droplets className="w-4 h-4" />
          Simulate
        </button>
      </div>

      <div className="flex justify-center gap-4 text-[11px] font-bold">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
          <span className="text-stone-500">Healthy</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-400"></span>
          <span className="text-stone-500">Monitor</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-400"></span>
          <span className="text-stone-500">Needs care</span>
        </span>
      </div>

      {!loading && !error && activeZones.length === 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 text-center text-sm text-stone-500">
          No data yet
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl border-2 border-stone-200 shadow-sm p-4 relative"
      >
        <div className="absolute top-3 left-4 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
          Greenhouse Layout
        </div>

        <div className="mt-6 max-h-[28rem] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            {activeZones.map((zone) => (
              <motion.div
                key={zone.id}
                whileTap={{ scale: 0.95 }}
                className={`relative p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center min-h-[120px] ${getZoneBg(zone.status)} ${selectedZone?.id === zone.id ? 'ring-2 ring-stone-800 ring-offset-2' : ''}`}
              >
                <div
                  className="w-full h-full flex flex-col items-center justify-center cursor-pointer text-center"
                  onClick={() => setSelectedZone(zone)}
                >
                  <span className="text-3xl mb-1">{zone.emoji}</span>
                  <span className="text-sm font-bold text-stone-800 leading-tight break-words">
                    {zone.zoneId}
                  </span>
                  {zone.nodeId && (
                    <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider mt-0.5">
                      {zone.nodeId}
                    </span>
                  )}
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className={`w-2 h-2 rounded-full ${getZoneDot(zone.status)} animate-pulse`} />
                    <span className="text-[11px] font-bold text-stone-600">{zone.moisture}%</span>
                  </div>
                  <span className="mt-1 min-h-[14px] text-[10px] font-bold text-stone-500">
                    {zone.soilTempC !== null ? `${zone.soilTempC.toFixed(1)}°C` : 'Sensor not detected'}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex justify-center mt-4">
          <div className="bg-stone-200 text-stone-500 text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-wider">
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
            className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4"
          >
            <h3 className="font-bold text-blue-900 flex items-center gap-2">
              <Droplets className="w-5 h-5 text-blue-500" />
              Watering Simulation
            </h3>
            <p className="text-xs text-blue-700 font-medium">
              Test how the current live zones would react to more water.
            </p>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-bold text-blue-800">Watering Volume</span>
                <span className="text-sm font-extrabold text-blue-600">{wateringVolume}ml per zone</span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="50"
                value={wateringVolume}
                onChange={(event) => setWateringVolume(Number(event.target.value))}
                className="w-full h-2.5 bg-blue-200 rounded-full appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={runSimulation}
                disabled={simRunning || liveZones.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 active:scale-95"
              >
                {simRunning ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <RotateCcw className="w-4 h-4" />
                  </motion.div>
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {simRunning ? 'Simulating...' : 'Run Simulation'}
              </button>
              {simZones && (
                <button
                  onClick={resetSimulation}
                  className="px-4 py-3 rounded-xl font-bold text-sm bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 transition-colors active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {selectedZone ? (
          <motion.div
            key={selectedZone.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-4xl">{selectedZone.emoji}</div>
                  <div>
                    <h3 className="text-lg font-extrabold text-stone-800">{selectedZone.zoneId}</h3>
                    {selectedZone.nodeId && (
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">
                        {selectedZone.nodeId}
                      </p>
                    )}
                    <div
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${selectedZone.status === 'healthy' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : selectedZone.status === 'monitor' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${getZoneDot(selectedZone.status)}`} />
                      {selectedZone.statusText}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedZone(null)}
                  className="p-2 hover:bg-stone-100 rounded-xl transition-colors text-stone-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-bold text-stone-700 flex items-center gap-1.5">
                    <Droplets className="w-4 h-4 text-blue-400" />
                    Soil Moisture
                  </span>
                  <span className={`text-sm font-extrabold ${getMoistureLabel(selectedZone.moisture).color}`}>
                    {getMoistureLabel(selectedZone.moisture).text}
                  </span>
                </div>
                <div className="relative h-6 bg-stone-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${selectedZone.moisture}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${getBarColor(selectedZone.moisture)}`}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-stone-700">
                    {selectedZone.moisture}%
                  </span>
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border flex items-center gap-3 mb-3 ${selectedZone.status === 'needs-water' ? 'bg-blue-50 border-blue-200' : selectedZone.status === 'monitor' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}
              >
                <span className="text-xl">
                  {selectedZone.status === 'needs-water'
                    ? '💧'
                    : selectedZone.status === 'monitor'
                    ? '👀'
                    : '✅'}
                </span>
                <div>
                  <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">What to do</p>
                  <p className="text-sm font-bold text-stone-800">{selectedZone.action}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-stone-500 font-medium">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                Last updated: <span className="font-bold text-stone-700">Live reading</span>
              </div>

              <div className="mt-3 rounded-xl bg-stone-50 p-3 text-xs font-medium text-stone-500">
                Soil temp:{' '}
                <span className="font-bold text-stone-700">
                  {selectedZone.soilTempC !== null
                    ? `${selectedZone.soilTempC.toFixed(1)}°C`
                    : 'Sensor not detected'}
                </span>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-stone-600 uppercase tracking-wider">Alerts</p>
                {selectedZone.alerts.length > 0 ? (
                  <p className="mt-1 text-sm font-bold text-rose-700">
                    {selectedZone.alerts.join(', ')}
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-bold text-emerald-700">No alerts for this zone.</p>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-stone-100 rounded-2xl border border-dashed border-stone-300 p-6 text-center"
          >
            <p className="text-sm font-bold text-stone-400">Tap a zone to see details</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
