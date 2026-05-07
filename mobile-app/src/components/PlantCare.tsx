import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { PlantDetail } from './PlantDetail';

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

interface Section {
  id: string;
  name: string;
  emoji: string;
  status: ZoneStatus;
  statusText: string;
  moisture: number;
  soilTempC: number | null;
  alerts: string[];
  zoneId: string;
  nodeId?: string;
  lastWatered: string;
}

interface PlantCareProps {
  latestReading: LatestReading | null;
  loading: boolean;
  error: string | null;
}

const ZONE_EMOJIS = ['🌱', '🍅', '🥬', '🌿', '🌶️', '🍓', '🌻', '🌽', '🥕', '🪴'];

const getSectionHealth = (zone: ZoneReading) => {
  const alerts = zone.alerts ?? [];

  if (alerts.includes('too dry') || zone.soil_moisture_pct < 30) {
    return { status: 'needs-water' as ZoneStatus, statusText: 'Needs water!' };
  }

  if (
    alerts.includes('too wet') ||
    alerts.includes('too cold') ||
    zone.soil_moisture_pct > 80
  ) {
    return {
      status: 'monitor' as ZoneStatus,
      statusText: alerts[0] ?? 'Keep an eye'
    };
  }

  return { status: 'healthy' as ZoneStatus, statusText: 'All good' };
};

const getZoneEmoji = (index: number) => ZONE_EMOJIS[index % ZONE_EMOJIS.length];

const formatZoneName = (zoneId: string) =>
  zoneId
    .split('-')
    .map((part) => part.toUpperCase())
    .join(' ');

const buildSections = (latestReading: LatestReading | null) =>
  (latestReading?.zones ?? []).map((zone, index) => {
    const health = getSectionHealth(zone);

    return {
      id: `${zone.node_id ?? 'node'}-${zone.zone_id}`,
      name: formatZoneName(zone.zone_id),
      emoji: getZoneEmoji(index),
      status: health.status,
      statusText: health.statusText,
      moisture: zone.soil_moisture_pct,
      soilTempC: zone.soil_temp_c,
      alerts: zone.alerts ?? [],
      zoneId: zone.zone_id,
      nodeId: zone.node_id,
      lastWatered: 'Live reading'
    };
  });

export function PlantCare({ latestReading, loading, error }: PlantCareProps) {
  const [selectedPlant, setSelectedPlant] = useState<Section | null>(null);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const liveSections = buildSections(latestReading);

  useEffect(() => {
    if (!selectedPlant) return;

    const updatedPlant = liveSections.find((section) => section.id === selectedPlant.id);
    if (updatedPlant) {
      setSelectedPlant(updatedPlant);
      return;
    }

    setSelectedPlant(null);
  }, [liveSections, selectedPlant]);

  const tasks = liveSections
    .map((section) => {
      if (section.status === 'needs-water') {
        return {
          id: `task-${section.id}`,
          sectionId: section.id,
          emoji: section.emoji,
          title: `Water ${section.zoneId}`,
          instruction: 'Give it 200ml of water',
          action: 'Water',
          type: 'water'
        };
      }

      if (section.status === 'monitor') {
        return {
          id: `task-${section.id}`,
          sectionId: section.id,
          emoji: section.emoji,
          title: `Check ${section.zoneId}`,
          instruction: 'Review moisture, temperature, and alerts',
          action: 'Check',
          type: 'check'
        };
      }

      return null;
    })
    .filter(Boolean) as Array<{
      id: string;
      sectionId: string;
      emoji: string;
      title: string;
      instruction: string;
      action: string;
      type: string;
    }>;

  const pendingTasks = tasks.filter((task) => !completedTasks.includes(task.id));
  const completedTasksList = tasks.filter((task) => completedTasks.includes(task.id));

  const completeTask = (id: string) => {
    setCompletedTasks((current) => [...current, id]);
  };

  const sectionsNeedingAttention = liveSections.filter(
    (section) => section.status !== 'healthy'
  ).length;

  const getStatusColors = (status: ZoneStatus) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'monitor':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'needs-water':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      default:
        return 'bg-stone-100 text-stone-700 border-stone-200';
    }
  };

  const getStatusDot = (status: ZoneStatus) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-500';
      case 'monitor':
        return 'bg-amber-500';
      case 'needs-water':
        return 'bg-rose-500';
      default:
        return 'bg-stone-500';
    }
  };

  if (selectedPlant) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="plant-detail"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <PlantDetail plant={selectedPlant} onBack={() => setSelectedPlant(null)} />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`p-4 rounded-2xl border flex items-center gap-3 ${sectionsNeedingAttention > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}
      >
        <div className="text-2xl">{sectionsNeedingAttention > 0 ? '🏠' : '🌿'}</div>
        <div>
          <p className={`text-sm font-bold ${sectionsNeedingAttention > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
            {error
              ? 'Backend is offline or unreachable'
              : !loading && !latestReading
              ? 'No data yet'
              : sectionsNeedingAttention > 0
              ? `Greenhouse: ${sectionsNeedingAttention} zone${sectionsNeedingAttention > 1 ? 's' : ''} need attention`
              : 'Greenhouse: All zones healthy!'}
          </p>
          <p className={`text-xs font-medium ${sectionsNeedingAttention > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {error
              ? 'Waiting for the backend to come back online'
              : !loading && !latestReading
              ? 'Waiting for the first ESP reading'
              : `${liveSections.length} live zone${liveSections.length !== 1 ? 's' : ''} in the current feed`}
          </p>
        </div>
      </motion.div>

      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-stone-800">Today's Tasks</h2>
          <p className="text-stone-500 font-medium">
            {pendingTasks.length > 0
              ? `You have ${pendingTasks.length} live task${pendingTasks.length > 1 ? 's' : ''} to check`
              : 'All live zones look steady right now'}
          </p>
        </div>

        <div className="space-y-3">
          <AnimatePresence>
            {[...pendingTasks, ...completedTasksList].map((task, index) => {
              const isCompleted = completedTasks.includes(task.id);

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <div
                    className={`p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4 ${isCompleted ? 'bg-stone-50 border-stone-200 opacity-60' : 'bg-white border-stone-200 shadow-sm'}`}
                  >
                    <div className="text-3xl bg-stone-100 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                      {task.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-bold truncate ${isCompleted ? 'text-stone-500 line-through' : 'text-stone-800'}`}>
                        {task.title}
                      </h3>
                      <p className="text-sm text-stone-500 truncate">{task.instruction}</p>
                    </div>
                    {!isCompleted ? (
                      <button
                        onClick={() => completeTask(task.id)}
                        className={`shrink-0 h-10 px-4 rounded-xl font-bold text-sm transition-colors ${task.type === 'water' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                      >
                        {task.action}
                      </button>
                    ) : (
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <Check className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-stone-800">Live Zones</h2>
          {latestReading && (
            <div className="text-xs font-bold uppercase tracking-wider text-stone-400">
              {liveSections.length} zones
            </div>
          )}
        </div>

        {!loading && !error && liveSections.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-center text-sm text-stone-500">
            No data yet
          </div>
        )}

        <div className="max-h-[26rem] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            {liveSections.map((section, index) => (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03 }}
              >
                <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden transition-transform hover:scale-[1.02] active:scale-95">
                  <div
                    className="p-4 flex flex-col items-center text-center cursor-pointer"
                    onClick={() => setSelectedPlant(section)}
                  >
                    <div className="text-4xl mb-2">{section.emoji}</div>
                    <h3 className="font-bold text-stone-800 leading-tight break-words">
                      {section.zoneId}
                    </h3>
                    {section.nodeId && (
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                        {section.nodeId}
                      </p>
                    )}
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">
                      {section.name}
                    </p>
                    <div
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColors(section.status)}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${getStatusDot(section.status)}`} />
                      {section.statusText}
                    </div>
                    <div className="mt-2 text-xs font-extrabold text-stone-500">
                      {section.moisture}%
                    </div>
                    <div className="mt-1 min-h-[14px] text-[11px] font-bold text-stone-400">
                      {section.soilTempC !== null
                        ? `${section.soilTempC.toFixed(1)}°C`
                        : 'Sensor not detected'}
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-center gap-1 py-2 bg-stone-50 border-t border-stone-100 text-xs font-bold text-stone-400 cursor-pointer hover:bg-stone-100 transition-colors"
                    onClick={() => setSelectedPlant(section)}
                  >
                    View details
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
