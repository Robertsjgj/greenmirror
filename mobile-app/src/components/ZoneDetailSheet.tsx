import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Leaf, X } from 'lucide-react';
import { PlantProfile, getPlantStatusMessages } from '../plantProfiles';
import { VisualZone } from '../zoneLayout';

interface ZoneDetailSheetProps {
  zone: VisualZone | null;
  plantProfiles: PlantProfile[];
  assignedPlant: PlantProfile | null;
  onAssignPlant: (visualLabel: string, plantId: string | null) => void;
  onClose: () => void;
}

function formatValue(value: string | number | null | undefined, fallback = 'No data') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export function ZoneDetailSheet({
  zone,
  plantProfiles,
  assignedPlant,
  onAssignPlant,
  onClose
}: ZoneDetailSheetProps) {
  const statusMessages = zone ? getPlantStatusMessages(zone, assignedPlant) : [];

  return (
    <AnimatePresence>
      {zone && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-stone-950/35 backdrop-blur-[2px]"
            aria-label="Close zone details"
          />
          <motion.div
            initial={{ y: 28, opacity: 0.96 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="fixed inset-x-0 bottom-0 z-[80] mx-auto flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-t-[28px] border border-stone-200 bg-white shadow-2xl sm:inset-y-8 sm:bottom-auto sm:rounded-[28px]"
          >
            <div className="border-b border-stone-100 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-stone-200 sm:hidden" />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">
                    Visual Zone {zone.visualLabel}
                  </p>
                  <h3 className="truncate text-xl font-extrabold text-stone-900">
                    {assignedPlant?.name ?? zone.displayLabel ?? zone.backendZoneId ?? zone.visualLabel}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-stone-50 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
                  aria-label="Close zone details"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-4 py-4">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <InfoTile label="Backend" value={formatValue(zone.backendZoneId)} />
                <InfoTile label="Node" value={formatValue(zone.nodeId)} />
                <InfoTile label="Position" value={`${zone.rowLabel}-${zone.section}`} />
                <InfoTile
                  label="Reference Crop"
                  value={zone.referenceCrop ? `${zone.referenceCrop} hint` : 'None'}
                />
                <InfoTile label="Moisture" value={zone.soilMoisturePct !== null ? `${zone.soilMoisturePct}%` : 'No data'} />
                <InfoTile label="Soil Temp" value={zone.soilTempC !== null ? `${zone.soilTempC.toFixed(1)}C` : 'No data'} />
                <InfoTile label="Raw" value={formatValue(zone.soilMoistureRaw)} />
              </div>

              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm">
                      <Leaf className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                        Assigned Plant
                      </p>
                      <p className="text-sm font-extrabold text-stone-900">
                        {assignedPlant?.name ?? 'No plant assigned'}
                      </p>
                    </div>
                  </div>
                  {assignedPlant && (
                    <button
                      type="button"
                      onClick={() => onAssignPlant(zone.visualLabel, null)}
                      className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-extrabold text-emerald-700"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <label className="relative block">
                  <select
                    value={assignedPlant?.id ?? ''}
                    onChange={(event) => onAssignPlant(zone.visualLabel, event.target.value || null)}
                    className="h-11 w-full appearance-none rounded-2xl border border-emerald-200 bg-white px-3 pr-10 text-sm font-extrabold text-stone-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Choose a plant profile</option>
                    {plantProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-emerald-700" />
                </label>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <InfoTile
                    label="Water Range"
                    value={assignedPlant ? `${assignedPlant.moistureMin}-${assignedPlant.moistureMax}%` : 'No plant'}
                  />
                  <InfoTile
                    label="Temp Range"
                    value={assignedPlant ? `${assignedPlant.soilTempMin}-${assignedPlant.soilTempMax}C` : 'No plant'}
                  />
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">
                  {assignedPlant ? 'Recommendation' : 'Backend Alerts'}
                </p>
                {statusMessages.length > 0 ? (
                  <div className="mt-2 grid gap-2">
                    {statusMessages.map((message, index) => (
                      <p
                        key={`${zone.id}-message-${index}`}
                        className={`rounded-2xl px-3 py-2 text-sm font-bold ${
                          assignedPlant ? 'bg-white text-emerald-800' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {message}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold text-emerald-700">
                    No alerts for this zone.
                  </p>
                )}
              </div>

              <p className="mt-3 rounded-2xl bg-stone-50 px-3 py-2 text-xs font-bold text-stone-500">
                Last updated: {formatValue(zone.timestamp, 'No timestamp')}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-0.5 break-words text-sm font-extrabold text-stone-800">{value}</p>
    </div>
  );
}
