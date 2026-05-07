import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { VisualZone } from '../zoneLayout';

interface ZoneDetailSheetProps {
  zone: VisualZone | null;
  onClose: () => void;
}

function formatValue(value: string | number | null | undefined, fallback = 'No data') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export function ZoneDetailSheet({ zone, onClose }: ZoneDetailSheetProps) {
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
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[430px] rounded-t-[28px] border border-stone-200 bg-white shadow-2xl"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-stone-200" />
            <div className="p-5 pb-7">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                    {zone.visualLabel}
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
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Node ID</p>
                  <p className="mt-1 font-bold text-stone-800">{formatValue(zone.nodeId)}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Row</p>
                  <p className="mt-1 font-bold text-stone-800">{zone.rowLabel}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Section</p>
                  <p className="mt-1 font-bold text-stone-800">{zone.section}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Plant</p>
                  <p className="mt-1 font-bold text-stone-800">
                    {formatValue(zone.assignedPlant, 'No plant assigned')}
                  </p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Moisture Raw</p>
                  <p className="mt-1 font-bold text-stone-800">{formatValue(zone.soilMoistureRaw)}</p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Moisture %</p>
                  <p className="mt-1 font-bold text-stone-800">
                    {zone.soilMoisturePct !== null ? `${zone.soilMoisturePct}%` : 'No data'}
                  </p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Soil Temp</p>
                  <p className="mt-1 font-bold text-stone-800">
                    {zone.soilTempC !== null ? `${zone.soilTempC.toFixed(1)}°C` : 'Sensor not detected'}
                  </p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Temp Status</p>
                  <p className="mt-1 font-bold text-stone-800">
                    {formatValue(zone.soilTempStatus, 'No data')}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-stone-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Last Updated</p>
                <p className="mt-1 text-sm font-bold text-stone-800">
                  {formatValue(zone.timestamp, 'No timestamp')}
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Alerts</p>
                {zone.alerts.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {zone.alerts.map((alert, index) => (
                      <span
                        key={`${zone.id}-alert-${index}`}
                        className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700"
                      >
                        {alert}
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
