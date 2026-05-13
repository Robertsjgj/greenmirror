import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Leaf, X } from 'lucide-react';
import { VisualZone } from '../zoneLayout';
import { PlantProfile, getPlantStatusMessages } from '../plantProfiles';

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
            className="fixed inset-0 z-40 bg-stone-900/30"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 240, damping: 28 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-stone-200 bg-white shadow-2xl"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-stone-200" />
            <div className="p-5 pb-7">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                    Visual Zone {zone.visualLabel}
                  </p>
                  <h3 className="text-2xl font-extrabold text-stone-800">
                    {zone.backendZoneId ?? zone.visualLabel}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoTile label="Node ID" value={formatValue(zone.nodeId)} />
                <InfoTile label="Backend Zone" value={formatValue(zone.backendZoneId)} />
                <InfoTile label="Row" value={zone.rowLabel} />
                <InfoTile label="Section" value={zone.section} />
                <InfoTile label="Assigned Plant" value={assignedPlant?.name ?? 'No plant assigned'} />
                <InfoTile label="Moisture Raw" value={formatValue(zone.soilMoistureRaw)} />
                <InfoTile
                  label="Current Moisture"
                  value={zone.soilMoisturePct !== null ? `${zone.soilMoisturePct}%` : 'No data'}
                />
                <InfoTile
                  label="Current Soil Temp"
                  value={zone.soilTempC !== null ? `${zone.soilTempC.toFixed(1)}C` : 'Sensor not detected'}
                />
                <InfoTile
                  label="Plant Water Range"
                  value={assignedPlant ? `${assignedPlant.moistureMin}-${assignedPlant.moistureMax}%` : 'No plant'}
                />
                <InfoTile
                  label="Plant Temp Range"
                  value={assignedPlant ? `${assignedPlant.soilTempMin}-${assignedPlant.soilTempMax}C` : 'No plant'}
                />
              </div>

              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-emerald-600" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Zone Assignment</p>
                </div>
                <select
                  value={assignedPlant?.id ?? ''}
                  onChange={(event) => onAssignPlant(zone.visualLabel, event.target.value || null)}
                  className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-stone-800 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">No plant assigned</option>
                  {plantProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                {assignedPlant && (
                  <button
                    type="button"
                    onClick={() => onAssignPlant(zone.visualLabel, null)}
                    className="mt-3 w-full rounded-xl border border-emerald-200 bg-white py-2 text-sm font-bold text-emerald-700"
                  >
                    Clear Assignment
                  </button>
                )}
              </div>

              <div className="mt-4 rounded-2xl bg-stone-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Last Updated</p>
                <p className="mt-1 text-sm font-bold text-stone-800">
                  {formatValue(zone.timestamp, 'No timestamp')}
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  {assignedPlant ? 'Plant Recommendation' : 'Alerts'}
                </p>
                {statusMessages.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {statusMessages.map((message, index) => (
                      <span
                        key={`${zone.id}-message-${index}`}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          assignedPlant ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {message}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm font-bold text-emerald-700">No alerts for this zone.</p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-1 break-words font-bold text-stone-800">{value}</p>
    </div>
  );
}
