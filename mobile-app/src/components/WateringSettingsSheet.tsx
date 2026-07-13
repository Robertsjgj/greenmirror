import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  Droplets,
  Loader2,
  Settings,
  ThermometerSun,
  // X,
} from "lucide-react";
import { Button } from "./ui/Button";
import {
  saveWateringSettings,
  type WateringSettings,
} from "../services/wateringScheduleService";

interface WateringSettingsSheetProps {
  open: boolean;
  settings: WateringSettings;
  onClose: () => void;
  onSaved: (settings: WateringSettings) => void;
}

export function WateringSettingsSheet({
  open,
  settings,
  onClose,
  onSaved,
}: WateringSettingsSheetProps) {
  const [defaultRoundsPerDay, setDefaultRoundsPerDay] = useState<1 | 2>(
    settings.defaultRoundsPerDay ?? 2,
  );
  const [hoseFlowRateLpm, setHoseFlowRateLpm] = useState(
    String(settings.hoseFlowRateLpm),
  );
  const [hotDayThresholdC, setHotDayThresholdC] = useState(
    String(settings.hotDayThresholdC),
  );
  const [normalWateringTime, setNormalWateringTime] = useState(
    settings.normalWateringTime,
  );
  const [hotMorningTime, setHotMorningTime] = useState(settings.hotMorningTime);
  const [hotEveningTime, setHotEveningTime] = useState(settings.hotEveningTime);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setDefaultRoundsPerDay(settings.defaultRoundsPerDay ?? 2);
    setHoseFlowRateLpm(String(settings.hoseFlowRateLpm));
    setHotDayThresholdC(String(settings.hotDayThresholdC));
    setNormalWateringTime(settings.normalWateringTime);
    setHotMorningTime(settings.hotMorningTime);
    setHotEveningTime(settings.hotEveningTime);
    setSubmitting(false);
    setError(null);
  }, [open, settings]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const nextFlowRate = Number(hoseFlowRateLpm);
    const nextThreshold = Number(hotDayThresholdC);

    if (!Number.isFinite(nextFlowRate) || nextFlowRate <= 0) {
      setError("Hose flow rate must be greater than 0.");
      return;
    }

    if (!Number.isFinite(nextThreshold)) {
      setError("Hot-day alert threshold must be a valid temperature.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const nextSettings: WateringSettings = {
      ...settings,
      defaultRoundsPerDay,
      hoseFlowRateLpm: nextFlowRate,
      hotDayThresholdC: nextThreshold,
      normalWateringTime,
      hotMorningTime,
      hotEveningTime,
    };

    try {
      await saveWateringSettings(nextSettings);
      onSaved(nextSettings);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className={`gm-scrim${open ? " open" : ""}`} onClick={onClose} />

      <div
        className={`gm-sheet${open ? " open" : ""}`}
        style={{ maxHeight: "88%" }}
      >
        <div className="gm-grab" />

        <div className="gm-sheet-body">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Watering setup
              </div>

              <h2 className="font-['Baloo_2'] text-3xl font-black leading-tight text-slate-950">
                Schedule settings
              </h2>

              <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                These defaults are used when the system generates watering
                schedules. Admins can still override each day.
              </p>
            </div>

            {/* <button
              type="button"
              onClick={onClose}
              aria-label="Close watering settings"
              className="h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            >
              <X className="h-5 w-5" />
            </button> */}

            <button
              className="gm-icon-btn shrink-0"
              onClick={onClose}
              aria-label="Close watering settings"
            >
              <span style={{ fontSize: 18 }}>✕</span>
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-3xl border border-red-100 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm font-bold leading-5 text-red-700">
                {error}
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Default waterings per day
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDefaultRoundsPerDay(1)}
                  className={`rounded-3xl border p-4 text-left transition ${
                    defaultRoundsPerDay === 1
                      ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="font-['Baloo_2'] text-lg font-black text-slate-950">
                    Once
                  </div>

                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    One watering time by default.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDefaultRoundsPerDay(2)}
                  className={`rounded-3xl border p-4 text-left transition ${
                    defaultRoundsPerDay === 2
                      ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="font-['Baloo_2'] text-lg font-black text-slate-950">
                    Twice
                  </div>

                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Morning and evening by default.
                  </p>
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Hose flow rate
              </label>

              <div className="relative">
                <Droplets className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                <input
                  value={hoseFlowRateLpm}
                  onChange={(e) => setHoseFlowRateLpm(e.target.value)}
                  type="number"
                  step="0.1"
                  min="1"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <p className="mt-1.5 text-xs font-semibold text-slate-500">
                Default is 8 litres per minute.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Hot-day alert threshold
              </label>

              <div className="relative">
                <ThermometerSun className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                <input
                  value={hotDayThresholdC}
                  onChange={(e) => setHotDayThresholdC(e.target.value)}
                  type="number"
                  step="0.5"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <p className="mt-1.5 text-xs font-semibold text-slate-500">
                Used to label hot days and warn growers.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                  Single watering time
                </label>

                <input
                  value={normalWateringTime}
                  onChange={(e) => setNormalWateringTime(e.target.value)}
                  type="time"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                  Morning watering time
                </label>

                <input
                  value={hotMorningTime}
                  onChange={(e) => setHotMorningTime(e.target.value)}
                  type="time"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                  Evening watering time
                </label>

                <input
                  value={hotEveningTime}
                  onChange={(e) => setHotEveningTime(e.target.value)}
                  type="time"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="h-12 w-full bg-emerald-600 text-base font-black shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
              disabled={submitting}
              icon={
                submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Settings className="h-5 w-5" />
                )
              }
            >
              {submitting ? "Saving settings…" : "Save settings"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
