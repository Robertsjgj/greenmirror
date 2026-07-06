import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Filter,
  Search,
  UserRound,
  X,
} from "lucide-react";
import type { ActivityEntry, ActivityType } from "../activityLog";
import {
  ACTIVITY_TYPE_ORDER,
  formatActivityDateTime,
  getActivityActorName,
  getActivityTypeLabel,
} from "../activityLog";

interface ActivityHistoryViewProps {
  onBack: () => void;
  greenhouseName: string;
  activities: ActivityEntry[];
  loading?: boolean;
}

type TimeFilter = "all" | "today" | "yesterday" | "7d" | "30d" | "90d";
type TypeFilter = "all" | ActivityType;
type ActorFilter = "all" | string;

const ACTIVITY_ICON: Record<string, string> = {
  watering: "💧",
  assignment: "🌱",
  cleared: "✕",
  "profile-update": "📋",
  "sensor-failure": "⚠️",
  "sensor-recovered": "✅",
  "stale-node": "📡",
  "moisture-alert": "🚨",
  "greenhouse-switch": "🏡",
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function matchesTimeFilter(entry: ActivityEntry, filter: TimeFilter): boolean {
  if (filter === "all") return true;

  const date = new Date(entry.timestamp);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();

  if (filter === "today") return isSameDay(date, now);

  if (filter === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return isSameDay(date, yesterday);
  }

  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  const cutoff = startOfDay(now);
  cutoff.setDate(cutoff.getDate() - days + 1);

  return date >= cutoff;
}

function filterLabel(filter: TimeFilter): string {
  switch (filter) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "90d":
      return "Last 90 days";
    default:
      return "All time";
  }
}

function actorKey(entry: ActivityEntry): string {
  return (
    entry.actorUserId ?? entry.actorUsername ?? entry.actorName ?? "system"
  );
}

function activitySearchText(entry: ActivityEntry): string {
  return [
    entry.message,
    entry.plantName,
    entry.visualZoneId,
    entry.backendZoneId,
    entry.nodeId,
    getActivityActorName(entry),
    getActivityTypeLabel(entry.type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ActivityHistoryView({
  onBack,
  greenhouseName,
  activities,
  loading = false,
}: ActivityHistoryViewProps) {
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30d");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [actorFilter, setActorFilter] = useState<ActorFilter>("all");

  const sortedActivities = useMemo(
    () =>
      [...activities].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [activities],
  );

  const actorOptions = useMemo(() => {
    const map = new Map<string, string>();

    sortedActivities.forEach((entry) => {
      const key = actorKey(entry);
      if (!map.has(key)) map.set(key, getActivityActorName(entry));
    });

    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sortedActivities]);

  const filteredActivities = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    return sortedActivities.filter((entry) => {
      const matchesSearch =
        !cleanQuery || activitySearchText(entry).includes(cleanQuery);
      const matchesTime = matchesTimeFilter(entry, timeFilter);
      const matchesType = typeFilter === "all" || entry.type === typeFilter;
      const matchesActor =
        actorFilter === "all" || actorKey(entry) === actorFilter;

      return matchesSearch && matchesTime && matchesType && matchesActor;
    });
  }, [sortedActivities, query, timeFilter, typeFilter, actorFilter]);

  const activeFilterCount = [
    query.trim() ? 1 : 0,
    timeFilter !== "30d" ? 1 : 0,
    typeFilter !== "all" ? 1 : 0,
    actorFilter !== "all" ? 1 : 0,
  ].reduce((sum, item) => sum + item, 0);

  function clearFilters() {
    setQuery("");
    setTimeFilter("30d");
    setTypeFilter("all");
    setActorFilter("all");
  }

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
            Activity history <span style={{ fontSize: 20 }}>📋</span>
          </h1>
          <small>{greenhouseName} Greenhouse</small>
        </div>
      </header>

      <div className="gm-scroll">
        <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
          <section className="mb-5 rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                  Greenhouse log
                </div>

                <h2 className="font-['Baloo_2'] text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                  All activity
                </h2>

                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">
                  Search and filter watering, plant changes, and sensor events.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
                <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm">
                  <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="font-['Baloo_2'] text-3xl font-black leading-none text-slate-950">
                    {activities.length}
                  </div>
                  <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                    Total entries
                  </p>
                </div>

                <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm">
                  <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-700">
                    <Filter className="h-5 w-5" />
                  </div>
                  <div className="font-['Baloo_2'] text-3xl font-black leading-none text-slate-950">
                    {filteredActivities.length}
                  </div>
                  <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                    Showing now
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-5 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search activity"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="all">All activity types</option>
                {ACTIVITY_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {getActivityTypeLabel(type)}
                  </option>
                ))}
              </select>

              <select
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="all">Everyone</option>
                {actorOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1">
                {filterLabel(timeFilter)}
              </span>
              {typeFilter !== "all" && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                  {getActivityTypeLabel(typeFilter)}
                </span>
              )}
              {actorFilter !== "all" && (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">
                  {actorOptions.find(([key]) => key === actorFilter)?.[1] ??
                    actorFilter}
                </span>
              )}
            </div>
          </section>

          {loading ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-8 text-center">
              <p className="text-sm font-black text-slate-500">
                Loading activity…
              </p>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-8 text-center">
              <div className="mb-3 text-4xl">📋</div>
              <h3 className="font-['Baloo_2'] text-2xl font-black text-slate-950">
                No matching activity
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-500">
                Try changing the date range, user, activity type, or search
                term.
              </p>
            </div>
          ) : (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
              {filteredActivities.map((entry, index) => (
                <ActivityHistoryItem
                  key={entry.id}
                  entry={entry}
                  last={index === filteredActivities.length - 1}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ActivityHistoryItem({
  entry,
  last,
}: {
  entry: ActivityEntry;
  last: boolean;
}) {
  const icon = ACTIVITY_ICON[entry.type] ?? "📋";
  const actor = getActivityActorName(entry);
  const amount =
    typeof entry.amountMl === "number" ? `${entry.amountMl}ml` : null;

  return (
    <article
      className="flex gap-3 p-4 sm:gap-4 sm:p-5"
      style={{ borderBottom: last ? "none" : "1px solid var(--line)" }}
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-lg sm:h-12 sm:w-12">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-black leading-5 text-slate-950 sm:text-base">
              {entry.message}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" />
                {actor}
              </span>
              <span>{formatActivityDateTime(entry.timestamp)}</span>
            </div>
          </div>

          <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">
            {getActivityTypeLabel(entry.type)}
          </span>
        </div>

        {(entry.plantName || entry.visualZoneId || amount) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-500">
            {entry.plantName && (
              <span className="rounded-full bg-slate-100 px-3 py-1">
                🌱 {entry.plantName}
              </span>
            )}
            {entry.visualZoneId && (
              <span className="rounded-full bg-slate-100 px-3 py-1">
                Bed {entry.visualZoneId}
              </span>
            )}
            {amount && (
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">
                💧 {amount}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
