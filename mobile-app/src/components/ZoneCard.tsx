import { Droplets, Thermometer } from 'lucide-react';
import { VisualZone, getZoneStatus } from '../zoneLayout';
import { PlantProfile, getPlantTone } from '../plantProfiles';

interface ZoneCardProps {
  zone: VisualZone;
  assignedPlant: PlantProfile | null;
  onSelect: (zone: VisualZone) => void;
}

const TONE_STYLES = {
  good: {
    card: 'border-emerald-200 bg-emerald-50/80 shadow-emerald-900/5',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700'
  },
  dry: {
    card: 'border-amber-200 bg-amber-50/85 shadow-amber-900/5',
    dot: 'bg-amber-500',
    text: 'text-amber-700'
  },
  wet: {
    card: 'border-sky-200 bg-sky-50/85 shadow-sky-900/5',
    dot: 'bg-sky-500',
    text: 'text-sky-700'
  },
  alert: {
    card: 'border-rose-200 bg-rose-50/85 shadow-rose-900/5',
    dot: 'bg-rose-500',
    text: 'text-rose-700'
  },
  'no-data': {
    card: 'border-stone-200 bg-stone-100/80 shadow-stone-900/5',
    dot: 'bg-stone-400',
    text: 'text-stone-500'
  }
} as const;

export function ZoneCard({ zone, assignedPlant, onSelect }: ZoneCardProps) {
  const status = getZoneStatus(zone);
  const plantTone = getPlantTone(zone, assignedPlant);
  const tone = TONE_STYLES[plantTone ?? status.tone];

  return (
    <button
      type="button"
      onClick={() => onSelect(zone)}
      className={`min-h-[96px] w-full rounded-2xl border p-2 text-left shadow-sm transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${tone.card}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold leading-tight text-stone-800">{zone.visualLabel}</p>
          <p className="truncate text-[9px] font-bold uppercase tracking-wider text-stone-400">
            {assignedPlant ? assignedPlant.name : zone.hasReading ? zone.nodeId ?? 'Live zone' : 'No reading'}
          </p>
        </div>
        <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${tone.dot}`} />
      </div>

      <div className="mt-2 grid gap-1">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-stone-600">
          <Droplets className="h-3 w-3" />
          <span>{zone.soilMoisturePct !== null ? `${zone.soilMoisturePct}%` : '--'}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-semibold text-stone-600">
          <Thermometer className="h-3 w-3" />
          <span>{zone.soilTempC !== null ? `${zone.soilTempC.toFixed(1)}°C` : '--'}</span>
        </div>
      </div>

      <p className={`mt-1.5 truncate text-[9px] font-extrabold uppercase tracking-wider ${tone.text}`}>
        {plantTone ? assignedPlant?.name ?? status.label : status.label}
      </p>
    </button>
  );
}
