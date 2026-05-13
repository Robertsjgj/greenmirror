import { PlantProfile, getPlantTone } from '../plantProfiles';
import { SydneyVisualZone } from '../sydneyLayout';
import { getZoneStatus } from '../zoneLayout';

interface SydneyMapViewProps {
  zones: SydneyVisualZone[];
  profilesById: Map<string, PlantProfile>;
  onSelect: (zone: SydneyVisualZone) => void;
}

const TONE_STYLES = {
  good: 'border-emerald-700 bg-emerald-100 text-emerald-900',
  dry: 'border-amber-700 bg-amber-100 text-amber-900',
  wet: 'border-sky-700 bg-sky-100 text-sky-900',
  alert: 'border-rose-700 bg-rose-100 text-rose-900',
  'no-data': 'border-[#4a2f18] bg-[#6B4A2B] text-amber-50'
} as const;

const LAYOUT_HEIGHT_UNITS = 112;

export function SydneyMapView({ zones, profilesById, onSelect }: SydneyMapViewProps) {
  return (
    <div className="rounded-[1.35rem] border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Reference Layout</p>
          <h3 className="text-base font-extrabold text-stone-800 sm:text-lg">Sydney greenhouse map</h3>
          <p className="mt-1 text-xs font-bold text-stone-500">
            Crop names are editable reference hints. Assignments come from plant profiles.
          </p>
        </div>
        <p className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-stone-500">
          {zones.length} zones
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="relative h-[720px] w-[590px] overflow-hidden rounded-[1.25rem] bg-stone-100 ring-1 ring-stone-200 sm:h-[820px] sm:w-[670px]">
          <div className="absolute left-[34%] top-[5%] h-[70%] w-[62%] rounded-xl bg-rose-200/80 shadow-inner ring-1 ring-rose-200">
            <span className="absolute bottom-8 right-8 text-3xl font-extrabold text-stone-950">GreenHouse</span>
          </div>
          <div className="absolute bottom-[2%] left-[24%] h-[8%] w-[30%] rounded-xl bg-rose-200/80 shadow-inner ring-1 ring-rose-200">
            <span className="grid h-full place-items-center text-2xl font-extrabold">SHED</span>
          </div>
          <div className="absolute bottom-[14%] left-[58%] rounded-md border border-stone-400 bg-white px-3 py-2 text-sm font-extrabold">
            ENTRANCE
          </div>

          {zones.map((zone) => {
            const assignedPlant = zone.assignedPlant ? profilesById.get(zone.assignedPlant) ?? null : null;
            const plantTone = getPlantTone(zone, assignedPlant);
            const status = getZoneStatus(zone);
            const tone = TONE_STYLES[plantTone ?? status.tone];
            const top = (zone.y / LAYOUT_HEIGHT_UNITS) * 100;
            const height = (zone.height / LAYOUT_HEIGHT_UNITS) * 100;

            return (
              <button
                key={zone.visualLabel}
                type="button"
                onClick={() => onSelect(zone)}
                className={`absolute flex flex-col items-center justify-center border-[3px] p-1 text-center shadow-md transition-transform hover:scale-105 active:scale-95 ${
                  zone.shape === 'circle' ? 'rounded-full' : 'rounded-lg'
                } ${tone}`}
                style={{
                  left: `${zone.x}%`,
                  top: `${top}%`,
                  width: `${zone.width}%`,
                  height: `${height}%`
                }}
                aria-label={`${zone.displayLabel ?? zone.visualLabel}, ${assignedPlant?.name ?? 'unassigned'}`}
              >
                <span className="max-w-full truncate text-[9px] font-extrabold leading-tight">
                  {zone.displayLabel ?? zone.visualLabel}
                </span>
                <span className="max-w-full truncate text-[8px] font-bold leading-tight opacity-90">
                  {assignedPlant?.name ?? 'Unassigned'}
                </span>
                {zone.referenceCrop && (
                  <span className="mt-0.5 max-w-full truncate text-[7px] font-bold leading-tight opacity-75">
                    ref: {zone.referenceCrop}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
