import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Droplets,
  Loader2,
  PenLine,
  RefreshCw,
  Settings,
  ThermometerSun,
  UserRound,
  Waves,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { EditWateringScheduleSheet } from "./EditWateringScheduleSheet";
import { WateringSettingsSheet } from "./WateringSettingsSheet";
import {
  subscribeUsersForGreenhouse,
  type AdminUserRecord,
} from "../services/adminUserService";
import { writeActivityEvent } from "../services/activityService";
import type { LatestReading, VisualZone } from "../zoneLayout";
import {
  buildWateringSchedule,
  defaultWateringSettings,
  ensureUpcomingWateringSchedules,
  getWateringDateKey,
  markWateringRoundComplete,
  regenerateWateringSchedule,
  saveWateringSchedule,
  subscribeAdminWateringSchedules,
  subscribeUserWateringSchedules,
  subscribeWateringSettings,
  type WateringSchedule,
  type WateringSettings,
} from "../services/wateringScheduleService";

interface WateringScheduleViewProps {
  onBack: () => void;
  greenhouseId: string;
  greenhouseName: string;
  isAdmin: boolean;
  currentUserId: string;
  currentUserName: string;
  latestReading: LatestReading | null;
  zones: VisualZone[];
  onToast?: (message: string) => void;
}

function formatDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);

  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${minutes.toFixed(minutes % 1 === 0 ? 0 : 1)} min`;

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

function isToday(dateKey: string): boolean {
  return dateKey === getWateringDateKey();
}

function scheduleStatus(schedule: WateringSchedule) {
  if (schedule.completed) return "Completed";
  if (schedule.hotDay) return "Hot day";
  return "Scheduled";
}

export function WateringScheduleView({
  onBack,
  greenhouseId,
  greenhouseName,
  isAdmin,
  currentUserId,
  currentUserName,
  latestReading,
  zones,
  onToast,
}: WateringScheduleViewProps) {
  const [settings, setSettings] = useState<WateringSettings>(() =>
    defaultWateringSettings(greenhouseId),
  );
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [schedules, setSchedules] = useState<WateringSchedule[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(isAdmin);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [creatingSchedules, setCreatingSchedules] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<WateringSchedule | null>(
    null,
  );
  const [updatingRound, setUpdatingRound] = useState<string | null>(null);
  const [regeneratingDate, setRegeneratingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const ensuredKeyRef = useRef<string | null>(null);
  const [expandedBedInstructions, setExpandedBedInstructions] = useState<
    Record<string, boolean>
  >({});

  const todayKey = getWateringDateKey();

  const activeUsers = useMemo(
    () => users.filter((user) => user.active),
    [users],
  );

  const todaySchedule = useMemo(
    () => schedules.find((schedule) => schedule.date === todayKey) ?? null,
    [schedules, todayKey],
  );

  const visibleSchedules = useMemo(() => {
    if (isAdmin) return schedules;
    return schedules.filter(
      (schedule) => schedule.assignedUserId === currentUserId,
    );
  }, [isAdmin, schedules, currentUserId]);

  useEffect(() => {
    setSettings(defaultWateringSettings(greenhouseId));

    const unsub = subscribeWateringSettings(greenhouseId, setSettings, (err) =>
      setError(err.message),
    );

    return () => unsub();
  }, [greenhouseId]);

  useEffect(() => {
    if (!isAdmin) {
      setUsers([]);
      setLoadingUsers(false);
      return;
    }

    setLoadingUsers(true);

    const unsub = subscribeUsersForGreenhouse(
      greenhouseId,
      (nextUsers) => {
        setUsers(nextUsers);
        setLoadingUsers(false);
      },
      (err) => {
        setError(err.message);
        setLoadingUsers(false);
      },
    );

    return () => unsub();
  }, [isAdmin, greenhouseId]);

  useEffect(() => {
    setLoadingSchedules(true);

    if (isAdmin) {
      const unsub = subscribeAdminWateringSchedules(
        greenhouseId,
        7,
        (nextSchedules) => {
          setSchedules(nextSchedules);
          setLoadingSchedules(false);
        },
        (err) => {
          setError(err.message);
          setLoadingSchedules(false);
        },
      );

      return () => unsub();
    }

    const unsub = subscribeUserWateringSchedules(
      currentUserId,
      greenhouseId,
      (nextSchedules) => {
        setSchedules(nextSchedules);
        setLoadingSchedules(false);
      },
      (err) => {
        setError(err.message);
        setLoadingSchedules(false);
      },
    );

    return () => unsub?.();
  }, [isAdmin, currentUserId, greenhouseId]);

  useEffect(() => {
    if (!isAdmin) return;
    if (loadingUsers) return;
    if (activeUsers.length === 0) return;
    if (zones.length === 0) return;

    const ensureKey = [
      greenhouseId,
      activeUsers.map((user) => user.uid).join(","),
      zones.map((zone) => zone.visualLabel).join(","),
      settings.hoseFlowRateLpm,
      settings.hotDayThresholdC,
      settings.normalWateringTime,
      settings.hotMorningTime,
      settings.hotEveningTime,
    ].join("|");

    if (ensuredKeyRef.current === ensureKey) return;

    ensuredKeyRef.current = ensureKey;
    setCreatingSchedules(true);
    setError(null);

    ensureUpcomingWateringSchedules({
      greenhouseId,
      greenhouseName,
      users: activeUsers,
      zones,
      latestReading,
      settings,
      days: 7,
    })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Could not create schedules.",
        );
      })
      .finally(() => {
        setCreatingSchedules(false);
      });
  }, [
    isAdmin,
    loadingUsers,
    activeUsers,
    zones,
    greenhouseId,
    greenhouseName,
    latestReading,
    settings,
  ]);

  function showSuccess(message: string) {
    setSuccessMessage(message);
    onToast?.(message);
    window.setTimeout(() => setSuccessMessage(null), 3000);
  }

  async function handleRegenerate(scheduleDate: string) {
    if (!isAdmin) return;

    setRegeneratingDate(scheduleDate);
    setError(null);

    try {
      const schedule = await regenerateWateringSchedule({
        greenhouseId,
        greenhouseName,
        date: scheduleDate,
        users: activeUsers,
        zones,
        latestReading,
        settings,
      });

      showSuccess(
        `Regenerated schedule for ${formatDateLabel(schedule.date)}.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not regenerate schedule.",
      );
    } finally {
      setRegeneratingDate(null);
    }
  }

  async function handleCreateTodayForAdmin() {
    if (!isAdmin) return;

    setCreatingSchedules(true);
    setError(null);

    try {
      const schedule = buildWateringSchedule({
        greenhouseId,
        greenhouseName,
        date: todayKey,
        users: activeUsers,
        zones,
        latestReading,
        settings,
      });

      await saveWateringSchedule(schedule);
      showSuccess("Created today’s watering schedule.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create schedule.",
      );
    } finally {
      setCreatingSchedules(false);
    }
  }

  async function handleRoundComplete(
    schedule: WateringSchedule,
    roundId: "morning" | "evening",
  ) {
    setUpdatingRound(`${schedule.id}-${roundId}`);
    setError(null);

    try {
      await markWateringRoundComplete(schedule, roundId, {
        uid: currentUserId,
        displayName: currentUserName,
      });

      await writeActivityEvent({
        type: "watering",
        greenhouseId,
        amountMl: Math.round(schedule.totalLitresPerRound * 1000),
        message: `${currentUserName} completed ${schedule.rounds.find((round) => round.id === roundId)?.label ?? "watering"} for ${greenhouseName}.`,
        source: "manual",
        metadata: {
          scheduleId: schedule.id,
          roundId,
          litres: schedule.totalLitresPerRound,
        },
      });

      showSuccess("Watering marked as complete.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not mark watering complete.",
      );
    } finally {
      setUpdatingRound(null);
    }
  }

  function toggleBedInstructions(scheduleId: string) {
    setExpandedBedInstructions((current) => ({
      ...current,
      [scheduleId]: !current[scheduleId],
    }));
  }

  function renderScheduleCard(schedule: WateringSchedule) {
    const canComplete = isAdmin || schedule.assignedUserId === currentUserId;

    return (
      <article
        key={schedule.id}
        className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  schedule.completed
                    ? "healthy"
                    : schedule.hotDay
                      ? "caution"
                      : "info"
                }
              >
                {scheduleStatus(schedule)}
              </Badge>

              {isToday(schedule.date) && <Badge variant="healthy">Today</Badge>}

              {schedule.manuallyEdited && (
                <Badge variant="neutral">Edited by admin</Badge>
              )}
            </div>

            <h3 className="mt-3 font-['Baloo_2'] text-2xl font-black leading-tight text-slate-950">
              {formatDateLabel(schedule.date)}
            </h3>

            <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-4 w-4 text-emerald-600" />
                {schedule.assignedUserName}
              </span>

              <span className="inline-flex items-center gap-1.5">
                <Droplets className="h-4 w-4 text-sky-600" />
                {schedule.roundsPerDay}x today
              </span>

              <span className="inline-flex items-center gap-1.5">
                <ThermometerSun className="h-4 w-4 text-amber-600" />
                {schedule.temperatureC === null
                  ? "Weather unavailable"
                  : `${schedule.temperatureC}°C`}
              </span>
            </div>

            {schedule.notes && (
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold leading-5 text-amber-800">
                {schedule.notes}
              </p>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="bg-emerald-50 font-black text-emerald-700 hover:bg-emerald-100"
                icon={<PenLine className="h-4 w-4" />}
                onClick={() => setEditSchedule(schedule)}
              >
                Edit
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="bg-slate-100 font-black text-slate-700 hover:bg-slate-200"
                icon={
                  regeneratingDate === schedule.date ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )
                }
                disabled={regeneratingDate === schedule.date}
                onClick={() => handleRegenerate(schedule.date)}
              >
                Regenerate
              </Button>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-3xl bg-sky-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-sky-700">
              Per watering
            </div>
            <div className="mt-1 font-['Baloo_2'] text-3xl font-black text-slate-950">
              {schedule.totalLitresPerRound}L
            </div>
            <p className="text-xs font-bold text-slate-500">
              About {formatMinutes(schedule.totalHoseMinutesPerRound)} with hose
            </p>
          </div>

          <div className="rounded-3xl bg-emerald-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
              Total today
            </div>
            <div className="mt-1 font-['Baloo_2'] text-3xl font-black text-slate-950">
              {schedule.totalDailyLitres}L
            </div>
            <p className="text-xs font-bold text-slate-500">
              {formatMinutes(schedule.totalDailyHoseMinutes)} total hose time
            </p>
          </div>

          <div className="rounded-3xl bg-amber-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-amber-700">
              Hose rate
            </div>
            <div className="mt-1 font-['Baloo_2'] text-3xl font-black text-slate-950">
              {schedule.hoseFlowRateLpm}L/min
            </div>
            <p className="text-xs font-bold text-slate-500">
              Admin can adjust this setting.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Waves className="h-5 w-5 text-sky-600" />
            <div className="font-['Baloo_2'] text-xl font-black text-slate-950">
              Watering rounds
            </div>
          </div>

          <div className="grid gap-3">
            {schedule.rounds.map((round) => {
              const isUpdating = updatingRound === `${schedule.id}-${round.id}`;

              return (
                <div
                  key={round.id}
                  className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-black text-slate-950">
                      {round.label}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-3 text-sm font-bold text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {round.time}
                      </span>

                      {round.completed && (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Completed
                        </span>
                      )}
                    </div>

                    {round.completedByName && (
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Marked complete by {round.completedByName}
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant={round.completed ? "secondary" : "primary"}
                    size="sm"
                    disabled={round.completed || !canComplete || isUpdating}
                    className={
                      round.completed
                        ? "bg-emerald-50 font-black text-emerald-700"
                        : "bg-emerald-600 font-black text-white hover:bg-emerald-700"
                    }
                    icon={
                      isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )
                    }
                    onClick={() => handleRoundComplete(schedule, round.id)}
                  >
                    {round.completed ? "Done" : "Mark done"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => toggleBedInstructions(schedule.id)}
            className="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
          >
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Bed instructions
              </div>

              <p className="mt-1 text-sm font-semibold text-slate-500">
                {schedule.beds.length} beds · Water each bed slowly and evenly.
              </p>
            </div>

            <div className="ml-3 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700">
              {expandedBedInstructions[schedule.id] ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
          </button>

          {expandedBedInstructions[schedule.id] && (
            <div className="mt-3 grid gap-2">
              {schedule.beds.map((bed) => (
                <div
                  key={bed.zoneId}
                  className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-3 sm:grid-cols-[1fr_auto_auto]"
                >
                  <div className="min-w-0">
                    <div className="font-black text-slate-950">
                      {bed.zoneName}
                    </div>

                    <div className="text-xs font-bold text-slate-500">
                      {bed.plantName ?? "Bed"} · {bed.instruction}
                    </div>
                  </div>

                  <div className="text-sm font-black text-sky-700">
                    {bed.litres}L
                  </div>

                  <div className="text-sm font-black text-slate-600">
                    {formatMinutes(bed.hoseMinutes)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </article>
    );
  }

  const showEmptyAdmin =
    isAdmin && !loadingUsers && !loadingSchedules && schedules.length === 0;

  const showEmptyUser =
    !isAdmin && !loadingSchedules && visibleSchedules.length === 0;

  return (
    <div className="gm-app">
      <header className="gm-header">
        <button
          type="button"
          onClick={onBack}
          className="gm-icon-btn shrink-0"
          aria-label="Back to GreenMirror"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="gm-brand min-w-0">
          <h1>
            Watering schedule <span style={{ fontSize: 20 }}>💧</span>
          </h1>
          <small>{greenhouseName} Greenhouse</small>
        </div>

        {isAdmin && (
          <button
            type="button"
            className="gm-icon-btn shrink-0"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open watering settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="gm-scroll">
        <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
          <section className="mb-5 rounded-[2rem] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-sky-700">
                  Hose watering
                </div>

                <h2 className="font-['Baloo_2'] text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                  Watering plan
                </h2>

                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">
                  Today's assignment, timing, and hose guidance.
                </p>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-white font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    icon={<Settings className="h-4 w-4" />}
                    onClick={() => setSettingsOpen(true)}
                  >
                    Settings
                  </Button>

                  <Button
                    type="button"
                    className="bg-emerald-600 font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
                    icon={
                      creatingSchedules ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )
                    }
                    disabled={creatingSchedules || activeUsers.length === 0}
                    onClick={handleCreateTodayForAdmin}
                  >
                    Create today
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-700">
                  <Droplets className="h-5 w-5" />
                </div>
                <div className="font-['Baloo_2'] text-3xl font-black leading-none text-slate-950">
                  {todaySchedule?.roundsPerDay ?? "—"}x
                </div>
                <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                  Today’s waterings
                </p>
              </div>

              <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="truncate font-['Baloo_2'] text-3xl font-black leading-none text-slate-950">
                  {todaySchedule?.assignedUserName ?? "—"}
                </div>
                <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                  Assigned today
                </p>
              </div>

              <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                  <ThermometerSun className="h-5 w-5" />
                </div>
                <div className="font-['Baloo_2'] text-3xl font-black leading-none text-slate-950">
                  {todaySchedule?.temperatureC === null ||
                  todaySchedule?.temperatureC === undefined
                    ? "—"
                    : `${todaySchedule.temperatureC}°`}
                </div>
                <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                  Hot at {settings.hotDayThresholdC}°C
                </p>
              </div>
            </div>
          </section>

          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-3xl border border-red-100 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm font-bold leading-5 text-red-700">
                {error}
              </p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-start gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <p className="text-sm font-bold leading-5 text-emerald-700">
                {successMessage}
              </p>
            </div>
          )}

          {(loadingUsers || loadingSchedules) && (
            <div className="flex min-h-[240px] items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-white">
              <div className="text-center">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-600" />
                <p className="text-sm font-black text-slate-600">
                  Loading watering schedule…
                </p>
              </div>
            </div>
          )}

          {showEmptyAdmin && (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-6 text-center">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <h3 className="font-['Baloo_2'] text-2xl font-black text-slate-950">
                No schedule yet
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-500">
                Create today’s schedule or wait a moment while the system
                generates upcoming watering days.
              </p>
            </div>
          )}

          {showEmptyUser && (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <h3 className="font-['Baloo_2'] text-2xl font-black text-slate-950">
                You are not assigned today
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-500">
                When you are assigned to water, your watering instructions will
                appear here.
              </p>
            </div>
          )}

          {!loadingUsers &&
            !loadingSchedules &&
            visibleSchedules.length > 0 && (
              <div className="space-y-4">
                {visibleSchedules.map(renderScheduleCard)}
              </div>
            )}
        </main>
      </div>

      <WateringSettingsSheet
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSaved={(nextSettings) => {
          setSettings(nextSettings);
          showSuccess("Watering settings saved.");
        }}
      />

      <EditWateringScheduleSheet
        open={editSchedule !== null}
        schedule={editSchedule}
        users={activeUsers}
        onClose={() => setEditSchedule(null)}
        onSaved={(schedule) => {
          showSuccess(
            `Updated schedule for ${formatDateLabel(schedule.date)}.`,
          );
        }}
      />
    </div>
  );
}
