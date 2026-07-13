import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Droplets,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { Button } from "./ui/Button";
import type { AdminUserRecord } from "../services/adminUserService";
import {
  recalculateWateringSchedule,
  saveWateringSchedule,
  type WateringBedTask,
  type WateringRound,
  type WateringSchedule,
} from "../services/wateringScheduleService";

interface EditWateringScheduleSheetProps {
  open: boolean;
  schedule: WateringSchedule | null;
  users: AdminUserRecord[];
  onClose: () => void;
  onSaved: (schedule: WateringSchedule) => void;
}

function makeRounds(
  roundCount: 1 | 2,
  morningTime: string,
  eveningTime: string,
  existingRounds: WateringRound[],
): WateringRound[] {
  const existingById = new Map(
    existingRounds.map((round) => [round.id, round]),
  );

  const morningExisting = existingById.get("morning");
  const morning: WateringRound = {
    id: "morning",
    label: roundCount === 2 ? "Morning watering" : "Daily watering",
    time: morningTime,
    completed: morningExisting?.completed ?? false,
    completedAt: morningExisting?.completedAt ?? null,
    completedBy: morningExisting?.completedBy ?? null,
    completedByName: morningExisting?.completedByName ?? null,
  };

  if (roundCount === 1) return [morning];

  const eveningExisting = existingById.get("evening");

  return [
    morning,
    {
      id: "evening",
      label: "Evening watering",
      time: eveningTime,
      completed: eveningExisting?.completed ?? false,
      completedAt: eveningExisting?.completedAt ?? null,
      completedBy: eveningExisting?.completedBy ?? null,
      completedByName: eveningExisting?.completedByName ?? null,
    },
  ];
}

function roundNumber(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function EditWateringScheduleSheet({
  open,
  schedule,
  users,
  onClose,
  onSaved,
}: EditWateringScheduleSheetProps) {
  const activeUsers = useMemo(
    () =>
      users
        .filter((user) => user.active)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [users],
  );

  const [assignedUserId, setAssignedUserId] = useState("");
  const [roundsPerDay, setRoundsPerDay] = useState<1 | 2>(1);
  const [morningTime, setMorningTime] = useState("09:00");
  const [eveningTime, setEveningTime] = useState("18:00");
  const [hoseFlowRateLpm, setHoseFlowRateLpm] = useState("8");
  const [notes, setNotes] = useState("");
  const [beds, setBeds] = useState<WateringBedTask[]>([]);
  const [bedsExpanded, setBedsExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !schedule) return;

    setAssignedUserId(schedule.assignedUserId);
    setRoundsPerDay(schedule.roundsPerDay);
    setMorningTime(schedule.rounds[0]?.time ?? "09:00");
    setEveningTime(
      schedule.rounds.find((round) => round.id === "evening")?.time ?? "18:00",
    );
    setHoseFlowRateLpm(String(schedule.hoseFlowRateLpm));
    setNotes(schedule.notes ?? "");
    setBeds(schedule.beds.map((bed) => ({ ...bed })));
    setBedsExpanded(false);
    setSubmitting(false);
    setError(null);
  }, [open, schedule]);

  const preview = useMemo(() => {
    const flowRate = Number(hoseFlowRateLpm);

    if (!Number.isFinite(flowRate) || flowRate <= 0) {
      return {
        totalLitresPerRound: 0,
        totalDailyLitres: 0,
        totalHoseMinutesPerRound: 0,
        totalDailyHoseMinutes: 0,
      };
    }

    const totalLitresPerRound = roundNumber(
      beds.reduce((sum, bed) => sum + bed.litres, 0),
      1,
    );

    const totalHoseMinutesPerRound = roundNumber(
      totalLitresPerRound / flowRate,
      1,
    );

    return {
      totalLitresPerRound,
      totalDailyLitres: roundNumber(totalLitresPerRound * roundsPerDay, 1),
      totalHoseMinutesPerRound,
      totalDailyHoseMinutes: roundNumber(
        totalHoseMinutesPerRound * roundsPerDay,
        1,
      ),
    };
  }, [beds, hoseFlowRateLpm, roundsPerDay]);

  function updateBedLitres(zoneId: string, value: string) {
    const nextLitres = Number(value);

    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.zoneId === zoneId
          ? {
              ...bed,
              litres:
                Number.isFinite(nextLitres) && nextLitres >= 0
                  ? nextLitres
                  : bed.litres,
            }
          : bed,
      ),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    if (!schedule) return;

    const selectedUser = activeUsers.find(
      (user) => user.uid === assignedUserId,
    );

    if (!selectedUser) {
      setError("Choose an active user for this schedule.");
      return;
    }

    const nextFlowRate = Number(hoseFlowRateLpm);

    if (!Number.isFinite(nextFlowRate) || nextFlowRate <= 0) {
      setError("Hose flow rate must be greater than 0.");
      return;
    }

    const invalidBed = beds.find(
      (bed) => !Number.isFinite(bed.litres) || bed.litres < 0,
    );

    if (invalidBed) {
      setError(`Check the litres for ${invalidBed.zoneName}.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const nextRounds = makeRounds(
      roundsPerDay,
      morningTime,
      eveningTime,
      schedule.rounds,
    );

    const updated = recalculateWateringSchedule(
      {
        ...schedule,
        assignedUserId: selectedUser.uid,
        assignedUserName: selectedUser.displayName,
        assignedUsername: selectedUser.username,
        hoseFlowRateLpm: nextFlowRate,
        roundsPerDay,
        rounds: nextRounds,
        beds: beds.map((bed) => ({
          ...bed,
          litres: roundNumber(bed.litres, 1),
        })),
        notes: notes.trim(),
        manuallyEdited: true,
      },
      nextFlowRate,
      nextRounds,
    );

    try {
      await saveWateringSchedule(updated);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save schedule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className={`gm-scrim${open ? " open" : ""}`} onClick={onClose} />

      <div
        className={`gm-sheet${open ? " open" : ""}`}
        style={{ maxHeight: "92%" }}
      >
        <div className="gm-grab" />

        <div className="gm-sheet-body">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Admin override
              </div>

              <h2 className="font-['Baloo_2'] text-3xl font-black leading-tight text-slate-950">
                Edit schedule
              </h2>

              <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                Change the assigned person, watering times, hose settings, and
                litres per bed.
              </p>
            </div>

            <button
              type="button"
              className="gm-icon-btn"
              onClick={onClose}
              aria-label="Close edit schedule"
            >
              <X className="h-5 w-5" />
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
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-sky-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-sky-700">
                  Per watering
                </div>

                <div className="mt-1 font-['Baloo_2'] text-3xl font-black text-slate-950">
                  {preview.totalLitresPerRound}L
                </div>

                <p className="text-xs font-bold text-slate-500">
                  {preview.totalHoseMinutesPerRound} min hose time
                </p>
              </div>

              <div className="rounded-3xl bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
                  Total today
                </div>

                <div className="mt-1 font-['Baloo_2'] text-3xl font-black text-slate-950">
                  {preview.totalDailyLitres}L
                </div>

                <p className="text-xs font-bold text-slate-500">
                  {preview.totalDailyHoseMinutes} min total
                </p>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Assigned waterer
              </label>

              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              >
                {activeUsers.map((user) => (
                  <option key={user.uid} value={user.uid}>
                    {user.displayName} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Waterings today
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRoundsPerDay(1)}
                  className={`rounded-3xl border p-4 text-left transition ${
                    roundsPerDay === 1
                      ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="font-['Baloo_2'] text-lg font-black text-slate-950">
                    Once
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Normal daily watering.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRoundsPerDay(2)}
                  className={`rounded-3xl border p-4 text-left transition ${
                    roundsPerDay === 2
                      ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="font-['Baloo_2'] text-lg font-black text-slate-950">
                    Twice
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Morning and evening watering.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                  Morning time
                </label>

                <div className="relative">
                  <CalendarClock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                  <input
                    value={morningTime}
                    onChange={(e) => setMorningTime(e.target.value)}
                    type="time"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
              </div>

              {roundsPerDay === 2 && (
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                    Evening time
                  </label>

                  <div className="relative">
                    <CalendarClock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      value={eveningTime}
                      onChange={(e) => setEveningTime(e.target.value)}
                      type="time"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />
                  </div>
                </div>
              )}
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
                  min="1"
                  step="0.1"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setBedsExpanded((current) => !current)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Per-bed litres
                  </div>

                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {beds.length} beds · Edit the water amount for each bed.
                  </p>
                </div>

                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700">
                  {bedsExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </button>

              {bedsExpanded && (
                <div className="border-t border-slate-100 p-3">
                  <div className="grid gap-2">
                    {beds.map((bed) => (
                      <div
                        key={bed.zoneId}
                        className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_140px]"
                      >
                        <div className="min-w-0">
                          <div className="font-black text-slate-950">
                            {bed.zoneName}
                          </div>

                          <div className="text-xs font-bold text-slate-500">
                            {bed.plantName ?? "Bed"} · Water evenly across the
                            whole bed.
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                            Litres
                          </label>

                          <input
                            value={String(bed.litres)}
                            onChange={(e) =>
                              updateBedLitres(bed.zoneId, e.target.value)
                            }
                            type="number"
                            min="0"
                            step="0.5"
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note for the waterer"
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <Button
              type="submit"
              className="h-12 w-full bg-emerald-600 text-base font-black shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
              disabled={submitting}
              icon={
                submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )
              }
            >
              {submitting ? "Saving schedule…" : "Save schedule"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
