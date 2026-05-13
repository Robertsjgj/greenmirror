import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { PlantDetail } from './PlantDetail';

type ZoneStatus = 'healthy' | 'monitor' | 'needs-water';

interface ZoneReading {
  zone_id: string;
  node_id?: string;
  soil_moisture_pct: number | null;
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

const ZONE_LABELS = ['Leaf', 'Tomato', 'Kale', 'Herb', 'Pepper', 'Berry', 'Flower', 'Corn', 'Carrot', 'Pot'];

const getSectionHealth = (zone: ZoneReading) => {
  const alerts = zone.alerts ?? [];

  if (alerts.includes('too dry') || (zone.soil_moisture_pct ?? 100) < 30) {
    return { status: 'needs-water' as ZoneStatus, statusText: 'Needs water' };
  }

  if (alerts.includes('too wet') || alerts.includes('too cold') || (zone.soil_moisture_pct ?? 0) > 80) {
    return {
      status: 'monitor' as ZoneStatus,
      statusText: alerts[0] ?? 'Keep an eye'
    };
  }

  return { status: 'healthy' as ZoneStatus, statusText: 'All good' };
};

const getZoneLabel = (index: number) => ZONE_LABELS[index % ZONE_LABELS.length];

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
      emoji: getZoneLabel(index),
      status: health.status,
      statusText: health.statusText,
      moisture: zone.soil_moisture_pct ?? 0,
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
  const liveSections = useMemo(() => buildSections(latestReading), [latestReading]);

  useEffect(() => {
    if (!selectedPlant) return;

    const updatedPlant = liveSections.find((section) => section.id === selectedPlant.id);
    if (updatedPlant && updatedPlant !== selectedPlant) {
      setSelectedPlant(updatedPlant);
      return;
    }

    if (!updatedPlant) {
      setSelectedPlant(null);
    }
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
  const sectionsNeedingAttention = liveSections.filter((section) => section.status !== 'healthy').length;

  const completeTask = (id: string) => {
    setCompletedTasks((current) => [...current, id]);
  };

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
    <div className="space-y-4 pb-4">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center gap-3 rounded-[1.35rem] border p-4 shadow-sm ${
          sectionsNeedingAttention > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
        }`}
      >
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-extrabold ${
            sectionsNeedingAttention > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {sectionsNeedingAttention > 0 ? '!' : 'OK'}
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-extrabold ${sectionsNeedingAttention > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
            {error
              ? 'Backend is offline or unreachable'
              : !loading && !latestReading
              ? 'No data yet'
              : sectionsNeedingAttention > 0
              ? `Greenhouse: ${sectionsNeedingAttention} zone${sectionsNeedingAttention > 1 ? 's' : ''} need attention`
              : 'Greenhouse: All zones healthy'}
          </p>
          <p className={`text-xs font-bold ${sectionsNeedingAttention > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {error
              ? 'Waiting for the backend to come back online'
              : !loading && !latestReading
              ? 'Waiting for the first ESP reading'
              : `${liveSections.length} live zone${liveSections.length !== 1 ? 's' : ''} in the current feed`}
          </p>
        </div>
      </motion.div>

      <section>
        <div className="mb-3">
          <h2 className="text-xl font-extrabold text-stone-900">Today's Tasks</h2>
          <p className="text-sm font-bold text-stone-500">
            {pendingTasks.length > 0
              ? `You have ${pendingTasks.length} live task${pendingTasks.length > 1 ? 's' : ''} to check`
              : 'All live zones look steady right now'}
          </p>
        </div>

        <div className="space-y-2">
          <AnimatePresence>
            {[...pendingTasks, ...completedTasksList].map((task, index) => {
              const isCompleted = completedTasks.includes(task.id);

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  layout
                >
                  <div
                    className={`flex items-center gap-3 rounded-2xl border p-3 transition-all duration-300 ${
                      isCompleted ? 'border-stone-200 bg-stone-50 opacity-60' : 'border-stone-200 bg-white shadow-sm'
                    }`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-[10px] font-extrabold text-stone-500">
                      {task.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className={`truncate font-extrabold ${isCompleted ? 'text-stone-500 line-through' : 'text-stone-800'}`}>
                        {task.title}
                      </h3>
                      <p className="truncate text-sm font-bold text-stone-500">{task.instruction}</p>
                    </div>
                    {!isCompleted ? (
                      <button
                        onClick={() => completeTask(task.id)}
                        className={`h-10 shrink-0 rounded-xl px-4 text-sm font-extrabold transition-colors ${
                          task.type === 'water'
                            ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}
                      >
                        {task.action}
                      </button>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                        <Check className="h-5 w-5" />
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-stone-900">Live Zones</h2>
          {latestReading && (
            <div className="rounded-full bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-stone-400 shadow-sm ring-1 ring-stone-200">
              {liveSections.length} zones
            </div>
          )}
        </div>

        {!loading && !error && liveSections.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-center text-sm text-stone-500">
            No data yet
          </div>
        )}

        <div className="overflow-y-auto pr-1 lg:max-h-[42rem]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {liveSections.map((section, index) => (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.02 }}
              >
                <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-transform hover:-translate-y-0.5 active:scale-95">
                  <div className="flex cursor-pointer flex-col items-center p-3 text-center" onClick={() => setSelectedPlant(section)}>
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[10px] font-extrabold text-emerald-700">
                      {section.emoji}
                    </div>
                    <h3 className="font-extrabold leading-tight text-stone-800">{section.zoneId}</h3>
                    {section.nodeId && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{section.nodeId}</p>
                    )}
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">{section.name}</p>
                    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${getStatusColors(section.status)}`}>
                      <div className={`h-2 w-2 rounded-full ${getStatusDot(section.status)}`} />
                      {section.statusText}
                    </div>
                    <div className="mt-2 text-xs font-extrabold text-stone-500">
                      {section.moisture}%
                    </div>
                    <div className="mt-1 min-h-[14px] text-[11px] font-bold text-stone-400">
                      {section.soilTempC !== null ? `${section.soilTempC.toFixed(1)}C` : 'Sensor not detected'}
                    </div>
                  </div>
                  <div
                    className="flex cursor-pointer items-center justify-center gap-1 border-t border-stone-100 bg-stone-50 py-2 text-xs font-bold text-stone-400 transition-colors hover:bg-stone-100"
                    onClick={() => setSelectedPlant(section)}
                  >
                    View details
                    <ChevronRight className="h-3.5 w-3.5" />
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
