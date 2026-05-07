import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus, Edit2, ChevronRight, X } from 'lucide-react';
import { PlantDetail } from './PlantDetail';
type ZoneStatus = 'healthy' | 'monitor' | 'needs-water';
interface Section {
  id: string;
  name: string;
  emoji: string;
  plantType?: string;
  status: ZoneStatus;
  statusText: string;
  moisture: number;
  soilTempC?: number | null;
  alerts?: string[];
  zoneId?: string;
  lastWatered: string;
}
interface ZoneReading {
  zone_id: string;
  soil_moisture_pct: number;
  soil_temp_c: number | null;
  alerts?: string[];
}
interface LatestReading {
  zones: ZoneReading[];
}
const initialSections: Section[] = [
{
  id: 'sec-a',
  name: 'Section A',
  emoji: '🌱',
  plantType: 'Tomatoes',
  status: 'needs-water',
  statusText: 'Needs water!',
  moisture: 20,
  lastWatered: '2 days ago'
},
{
  id: 'sec-b',
  name: 'Section B',
  emoji: '🌱',
  status: 'monitor',
  statusText: 'Keep an eye',
  moisture: 45,
  lastWatered: 'Yesterday'
},
{
  id: 'sec-c',
  name: 'Bed 1',
  emoji: '🌿',
  plantType: 'Herbs',
  status: 'healthy',
  statusText: 'All good',
  moisture: 80,
  lastWatered: 'Yesterday'
}];

const EMOJI_OPTIONS = [
'🌱',
'🍅',
'🥬',
'🌿',
'🌶️',
'🍓',
'🌻',
'🌽',
'🥕',
'🪴'];

interface PlantCareProps {
  latestReading: LatestReading | null;
  loading: boolean;
  error: string | null;
}

const getSectionHealth = (zone: ZoneReading) => {
  // Mirror backend alerts into the existing UI status language.
  const alerts = zone.alerts ?? [];
  if (alerts.includes('too dry') || zone.soil_moisture_pct < 30) {
    return { status: 'needs-water' as ZoneStatus, statusText: 'Needs water!' };
  }
  if (
    alerts.includes('too wet') ||
    alerts.includes('too cold') ||
    zone.soil_moisture_pct > 80
  ) {
    return { status: 'monitor' as ZoneStatus, statusText: alerts[0] ?? 'Keep an eye' };
  }
  return { status: 'healthy' as ZoneStatus, statusText: 'All good' };
};

export function PlantCare({ latestReading, loading, error }: PlantCareProps) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [selectedPlant, setSelectedPlant] = useState<Section | null>(null);
  // Add/Edit State
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editEmoji, setEditEmoji] = useState('🌱');
  const liveSections = useMemo(
    () =>
      sections.map((section, index) => {
        const zone = latestReading?.zones?.[index];
        if (!zone) return section;
        const health = getSectionHealth(zone);
        return {
          ...section,
          ...health,
          // zones[0] -> Section A, zones[1] -> Section B, etc.
          moisture: zone.soil_moisture_pct,
          soilTempC: zone.soil_temp_c,
          alerts: zone.alerts ?? [],
          zoneId: zone.zone_id
        };
      }),
    [latestReading, sections]
  );
  useEffect(() => {
    if (!selectedPlant) return;
    const updatedPlant = liveSections.find((section) => section.id === selectedPlant.id);
    if (updatedPlant) setSelectedPlant(updatedPlant);
  }, [liveSections, selectedPlant]);
  // Generate tasks dynamically based on section status
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const tasks = liveSections.
  map((sec) => {
    if (sec.status === 'needs-water') {
      return {
        id: `task-${sec.id}`,
        sectionId: sec.id,
        emoji: sec.emoji,
        title: `Water ${sec.name}`,
        instruction: 'Give it 200ml of water',
        action: 'Water',
        type: 'water'
      };
    }
    if (sec.status === 'monitor') {
      return {
        id: `task-${sec.id}`,
        sectionId: sec.id,
        emoji: sec.emoji,
        title: `Check ${sec.name}`,
        instruction: 'Check soil and leaves',
        action: 'Check',
        type: 'check'
      };
    }
    return null;
  }).
  filter(Boolean) as any[];
  const pendingTasks = tasks.filter((t) => !completedTasks.includes(t.id));
  const completedTasksList = tasks.filter((t) => completedTasks.includes(t.id));
  const completeTask = (id: string, sectionId: string) => {
    setCompletedTasks([...completedTasks, id]);
    // Optimistically update the section status
    setSections(
      sections.map((s) =>
      s.id === sectionId ?
      {
        ...s,
        status: 'healthy',
        statusText: 'All good',
        moisture: 80,
        lastWatered: 'Just now'
      } :
      s
      )
    );
  };
  const sectionsNeedingAttention = liveSections.filter(
    (p) => p.status !== 'healthy'
  ).length;
  const getStatusColors = (status: string) => {
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
  const getStatusDot = (status: string) => {
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
  const handleSaveSection = () => {
    if (!editName.trim()) return;
    if (editingId) {
      setSections(
        sections.map((s) =>
        s.id === editingId ?
        {
          ...s,
          name: editName,
          plantType: editType,
          emoji: editEmoji
        } :
        s
        )
      );
      setEditingId(null);
    } else {
      const newSection: Section = {
        id: `sec-${Date.now()}`,
        name: editName,
        plantType: editType || undefined,
        emoji: editEmoji,
        status: 'healthy',
        statusText: 'All good',
        moisture: 75,
        lastWatered: 'Just now'
      };
      setSections([...sections, newSection]);
      setIsAdding(false);
    }
    setEditName('');
    setEditType('');
    setEditEmoji('🌱');
  };
  const startEdit = (sec: Section) => {
    setEditingId(sec.id);
    setEditName(sec.name);
    setEditType(sec.plantType || '');
    setEditEmoji(sec.emoji);
  };
  // Show Plant Detail View
  if (selectedPlant) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="plant-detail"
          initial={{
            opacity: 0,
            x: 20
          }}
          animate={{
            opacity: 1,
            x: 0
          }}
          exit={{
            opacity: 0,
            x: -20
          }}
          transition={{
            duration: 0.2
          }}>
          
          <PlantDetail
            plant={selectedPlant}
            onBack={() => setSelectedPlant(null)} />
          
        </motion.div>
      </AnimatePresence>);

  }
  return (
    <div className="space-y-6 pb-6">
      {/* Greenhouse Status Banner */}
      <motion.div
        initial={{
          opacity: 0,
          y: -10
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        className={`p-4 rounded-2xl border flex items-center gap-3 ${sectionsNeedingAttention > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        
        <div className="text-2xl">
          {sectionsNeedingAttention > 0 ? '🏠' : '🌿'}
        </div>
        <div>
          <p
            className={`text-sm font-bold ${sectionsNeedingAttention > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
            
            {error ?
            'Backend is offline or unreachable' :
            !loading && !latestReading ?
            'No data yet' :
            sectionsNeedingAttention > 0 ?
            `Greenhouse: ${sectionsNeedingAttention} section${sectionsNeedingAttention > 1 ? 's' : ''} need${sectionsNeedingAttention === 1 ? 's' : ''} attention` :
            'Greenhouse: All sections healthy!'}
          </p>
          <p
            className={`text-xs font-medium ${sectionsNeedingAttention > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            
            {error ?
            'Showing saved section names until the backend responds' :
            !loading && !latestReading ?
            'Waiting for the first ESP reading' :
            sectionsNeedingAttention > 0 ?
            'Check your tasks below for what to do' :
            'Everything is looking great today'}
          </p>
        </div>
      </motion.div>

      {/* Greeting & Tasks */}
      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-stone-800">Today's Tasks</h2>
          <p className="text-stone-500 font-medium">
            {pendingTasks.length > 0 ?
            `You have ${pendingTasks.length} thing${pendingTasks.length > 1 ? 's' : ''} to do today! 🌱` :
            'All done for today! Great job! 🌟'}
          </p>
        </div>

        <div className="space-y-3">
          <AnimatePresence>
            {[...pendingTasks, ...completedTasksList].map((task, index) => {
              const isCompleted = completedTasks.includes(task.id);
              return (
                <motion.div
                  key={task.id}
                  initial={{
                    opacity: 0,
                    y: 20
                  }}
                  animate={{
                    opacity: 1,
                    y: 0
                  }}
                  transition={{
                    delay: index * 0.1
                  }}
                  layout>
                  
                  <div
                    className={`
                    p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4
                    ${isCompleted ? 'bg-stone-50 border-stone-200 opacity-60' : 'bg-white border-stone-200 shadow-sm'}
                  `}>
                    
                    <div className="text-3xl bg-stone-100 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                      {task.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className={`font-bold truncate ${isCompleted ? 'text-stone-500 line-through' : 'text-stone-800'}`}>
                        
                        {task.title}
                      </h3>
                      <p className="text-sm text-stone-500 truncate">
                        {task.instruction}
                      </p>
                    </div>
                    {!isCompleted ?
                    <button
                      onClick={() => completeTask(task.id, task.sectionId)}
                      className={`
                          shrink-0 h-10 px-4 rounded-xl font-bold text-sm transition-colors
                          ${task.type === 'water' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : task.type === 'check' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}
                        `}>
                      
                        {task.action}
                      </button> :

                    <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <Check className="w-5 h-5" />
                      </div>
                    }
                  </div>
                </motion.div>);

            })}
          </AnimatePresence>
        </div>
      </section>

      {/* Plant Sections */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-stone-800">Your Sections</h2>
          {!isAdding && !editingId &&
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
            
              <Plus className="w-4 h-4" /> Add
            </button>
          }
        </div>

        {/* Add/Edit Form */}
        <AnimatePresence>
          {(isAdding || editingId) &&
          <motion.div
            initial={{
              opacity: 0,
              height: 0
            }}
            animate={{
              opacity: 1,
              height: 'auto'
            }}
            exit={{
              opacity: 0,
              height: 0
            }}
            className="mb-4 overflow-hidden">
            
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-stone-800">
                    {editingId ? 'Edit Section' : 'New Section'}
                  </h3>
                  <button
                  onClick={() => {
                    setIsAdding(false);
                    setEditingId(null);
                  }}
                  className="text-stone-400 hover:text-stone-600">
                  
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1 block">
                    Section Name *
                  </label>
                  <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Section A, Bed 1"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1 block">
                    Plant Type (Optional)
                  </label>
                  <input
                  type="text"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  placeholder="e.g. Tomatoes, Herbs"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1 block">
                    Emoji
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {EMOJI_OPTIONS.map((emoji) =>
                  <button
                    key={emoji}
                    onClick={() => setEditEmoji(emoji)}
                    className={`text-2xl w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all ${editEmoji === emoji ? 'bg-emerald-100 border-2 border-emerald-500 scale-110' : 'bg-stone-50 border border-stone-200 hover:bg-stone-100'}`}>
                    
                        {emoji}
                      </button>
                  )}
                  </div>
                </div>

                <button
                onClick={handleSaveSection}
                disabled={!editName.trim()}
                className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50">
                
                  Save Section
                </button>
              </div>
            </motion.div>
          }
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-3">
          {liveSections.map((sec, index) =>
          <motion.div
            key={sec.id}
            initial={{
              opacity: 0,
              scale: 0.9
            }}
            animate={{
              opacity: 1,
              scale: 1
            }}
            transition={{
              delay: index * 0.05 + 0.1
            }}>
            
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden transition-transform hover:scale-[1.02] active:scale-95 relative group">
                <button
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(sec);
                }}
                className="absolute top-2 right-2 p-1.5 bg-stone-100 text-stone-400 rounded-lg hover:bg-stone-200 hover:text-stone-600 transition-colors z-10">
                
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <div
                className="p-4 flex flex-col items-center text-center cursor-pointer"
                onClick={() => setSelectedPlant(sec)}>
                
                  <div className="text-4xl mb-2">{sec.emoji}</div>
                  <h3 className="font-bold text-stone-800 leading-tight">
                    {sec.name}
                  </h3>
                  {sec.zoneId &&
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                      {sec.zoneId}
                    </p>
                }
                  {sec.plantType ?
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">
                      {sec.plantType}
                    </p> :

                <p className="text-[10px] font-bold text-stone-300 uppercase tracking-wider mb-2 italic">
                      No plant set
                    </p>
                }
                  <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColors(sec.status)}`}>
                  
                    <div
                    className={`w-2 h-2 rounded-full ${getStatusDot(sec.status)}`} />
                  
                    {sec.statusText}
                  </div>
                  <div className="mt-2 text-xs font-extrabold text-stone-500">
                    {sec.moisture}%
                  </div>
                  <div className="mt-1 min-h-[14px] text-[11px] font-bold text-stone-400">
                    {sec.soilTempC !== undefined
                    ? sec.soilTempC !== null
                      ? `${sec.soilTempC.toFixed(1)}°C`
                      : 'Sensor not detected'
                    : !loading && !latestReading
                    ? 'No data yet'
                    : ''}
                  </div>
                </div>
                <div
                className="flex items-center justify-center gap-1 py-2 bg-stone-50 border-t border-stone-100 text-xs font-bold text-stone-400 cursor-pointer hover:bg-stone-100 transition-colors"
                onClick={() => setSelectedPlant(sec)}>
                
                  View details
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>
    </div>);

}
