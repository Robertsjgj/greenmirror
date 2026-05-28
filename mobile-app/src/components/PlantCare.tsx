import { useEffect, useMemo, useState } from 'react';
import { ActivityEntry, filterUsefulActivity, formatActivityTime } from '../activityLog';
import { PlantProfile, evaluateZoneAgainstPlant } from '../plantProfiles';
import type { LatestReading, VisualZone } from '../zoneLayout';
import { TrendsSection } from './TrendsSection';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface PlantCareProps {
  zones: VisualZone[];
  loading: boolean;
  error: string | null;
  plantProfiles: PlantProfile[];
  profilesById: Map<string, PlantProfile>;
  onOpenZone: (zone: VisualZone) => void;
  onAddProfile: (prefill?: string) => void;
  onEditProfile: (p: PlantProfile) => void;
  onToast: (msg: string) => void;
  activityLog: ActivityEntry[];
  onWaterZone?: (zone: VisualZone, amountMl: number) => void;
  /** Greenhouse ID used for sensor-trend charts */
  greenhouseId: string;
  /** Real-time Firestore activity feed — greenhouse-scoped, newest first */
  firestoreActivity?: ActivityEntry[];
  /** Simulation history — when present, trends use this instead of Firestore */
  simHistory?: LatestReading[];
}

type TaskKind = 'water' | 'check';

interface Task {
  id: string;
  zoneId: string;
  kind: TaskKind;
  label: string;
  detail: string;
  actionLabel: string;
  zone: VisualZone;
}

// ─── Task completion storage ─────────────────────────────────────────────────

// Module-scoped date string — valid for the lifetime of this page session.
const SESSION_DATE = new Date().toISOString().slice(0, 10);

function completedTasksKey(ghId: string): string {
  return `greenmirror-completed-tasks-${ghId}`;
}

function loadCompletedTaskIds(ghId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(completedTasksKey(ghId));
    const data: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    return new Set<string>(Array.isArray(data[SESSION_DATE]) ? data[SESSION_DATE] : []);
  } catch {
    return new Set<string>();
  }
}

function persistCompletedTask(ghId: string, taskId: string): void {
  try {
    const raw = window.localStorage.getItem(completedTasksKey(ghId));
    const data: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    const todaySet = new Set<string>(Array.isArray(data[SESSION_DATE]) ? data[SESSION_DATE] : []);
    todaySet.add(taskId);
    // Prune entries older than 7 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const pruned: Record<string, string[]> = {};
    Object.entries(data).forEach(([d, ids]) => { if (d >= cutoffStr) pruned[d] = ids; });
    pruned[SESSION_DATE] = [...todaySet];
    window.localStorage.setItem(completedTasksKey(ghId), JSON.stringify(pruned));
  } catch { /* storage unavailable */ }
}

// ─── Task building ───────────────────────────────────────────────────────────

function buildTask(z: VisualZone, profile: PlantProfile | null): Task | null {
  if (!z.assignedPlant || !profile) return null;
  const evaluation = evaluateZoneAgainstPlant(z, profile);
  const status = evaluation.overallStatus;
  if (!['needs-water', 'too-wet', 'too-cold', 'too-hot'].includes(status)) return null;
  const name = profile.name;
  const id = `${status}-${z.visualLabel}-${z.assignedPlant}`;
  if (status === 'needs-water') {
    return {
      id,
      zoneId: z.visualLabel,
      kind: 'water',
      label: `Water the ${name.toLowerCase()}`,
      detail: `${z.displayLabel ?? z.visualLabel} · Give it about 200ml`,
      actionLabel: 'Water',
      zone: z,
    };
  }
  return {
    id,
    zoneId: z.visualLabel,
    kind: 'check',
    label: `Check ${name}`,
    detail: evaluation.messages[0] ?? 'Open the zone to review the reading',
    actionLabel: 'Check',
    zone: z,
  };
}



// ─── Constants ───────────────────────────────────────────────────────────────

const TASKS_DEFAULT_VISIBLE = 3;
const PROFILES_PER_PAGE = 5;

// ─── Main component ──────────────────────────────────────────────────────────

export function PlantCare({
  zones, loading, error,
  plantProfiles, profilesById,
  onOpenZone, onAddProfile, onEditProfile, onToast,
  activityLog, onWaterZone,
  greenhouseId, firestoreActivity, simHistory,
}: PlantCareProps) {
  const [query, setQuery] = useState('');
  const [profilePage, setProfilePage] = useState(0);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => loadCompletedTaskIds(greenhouseId));

  useEffect(() => { setProfilePage(0); }, [query]);

  // Reload completed tasks when greenhouse switches
  useEffect(() => {
    setCompletedIds(loadCompletedTaskIds(greenhouseId));
  }, [greenhouseId]);

  const allTasks = useMemo(
    () => zones
      .map((z) => buildTask(z, z.assignedPlant ? profilesById.get(z.assignedPlant) ?? null : null))
      .filter((t): t is Task => t !== null),
    [zones, profilesById]
  );

  const { incompleteTasks, completedTasks } = useMemo(() => {
    const incomplete: Task[] = [], complete: Task[] = [];
    allTasks.forEach((t) => (completedIds.has(t.id) ? complete : incomplete).push(t));
    return { incompleteTasks: incomplete, completedTasks: complete };
  }, [allTasks, completedIds]);

  function handleComplete(task: Task) {
    persistCompletedTask(greenhouseId, task.id);
    setCompletedIds((prev) => { const next = new Set(prev); next.add(task.id); return next; });
    if (task.kind === 'water' && onWaterZone) {
      onWaterZone(task.zone, 200);
    } else {
      onToast(`✓ ${task.label}`);
    }
  }

  const visibleIncompleteTasks = showAllTasks
    ? incompleteTasks
    : incompleteTasks.slice(0, TASKS_DEFAULT_VISIBLE);
  const hasHiddenTasks = incompleteTasks.length > TASKS_DEFAULT_VISIBLE;

  const summary = useMemo(() => {
    let good = 0, attention = 0;
    zones.forEach((z) => {
      const ev = evaluateZoneAgainstPlant(z, z.assignedPlant ? profilesById.get(z.assignedPlant) ?? null : null);
      if (ev.tone === 'good') good++;
      else if (ev.tone !== 'no-data') attention++;
    });
    return { good, attention, total: zones.length };
  }, [zones, profilesById]);

  const assignedZonesByPlant = useMemo(() => {
    const m: Record<string, VisualZone[]> = {};
    zones.forEach((z) => { if (z.assignedPlant) m[z.assignedPlant] = [...(m[z.assignedPlant] ?? []), z]; });
    return m;
  }, [zones]);

  const filteredProfiles = useMemo(
    () => plantProfiles.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.notes ?? '').toLowerCase().includes(query.toLowerCase())
    ),
    [plantProfiles, query]
  );

  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / PROFILES_PER_PAGE));
  const safePage = Math.min(profilePage, totalPages - 1);
  const pagedProfiles = filteredProfiles.slice(safePage * PROFILES_PER_PAGE, (safePage + 1) * PROFILES_PER_PAGE);

  // Prefer Firestore-backed activity (greenhouse-scoped); fall back to localStorage
  const displayActivity = useMemo(
    () => (firestoreActivity && firestoreActivity.length > 0)
      ? firestoreActivity
      : filterUsefulActivity(activityLog),
    [firestoreActivity, activityLog],
  );

  const needsAttention = summary.attention;
  const totalIncompleteTasks = incompleteTasks.length;

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Status callout */}
      {!loading && !error && (
        needsAttention === 0 ? (
          <div className="gm-callout good">
            <div className="gm-callout-emoji">🌱</div>
            <div>
              <h3>Everything's happy today!</h3>
              <p>All {summary.total || 'your'} sections are doing great.</p>
            </div>
          </div>
        ) : (
          <div className="gm-callout">
            <div className="gm-callout-emoji">🏡</div>
            <div>
              <h3>Greenhouse: {needsAttention} section{needsAttention !== 1 ? 's' : ''} need attention</h3>
              <p>Check your tasks below.</p>
            </div>
          </div>
        )
      )}
      {error && (
        <div className="gm-callout alert">
          <div className="gm-callout-emoji">⚠️</div>
          <div><h3>Backend offline</h3><p>{error}</p></div>
        </div>
      )}

      {/* ── SECTION 1: Today's Tasks ──────────────────────────────────── */}
      <div>
        <div style={{ padding: '0 2px 10px' }}>
          <h2 className="gm-h2">Today's Tasks</h2>
          <div className="gm-sub">
            {totalIncompleteTasks === 0 && completedTasks.length === 0
              ? 'Nothing to do · assign plants in the Map to get tasks'
              : totalIncompleteTasks === 0
                ? `All ${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''} done today 🎉`
                : `${totalIncompleteTasks} to do${completedTasks.length > 0 ? ` · ${completedTasks.length} done` : ''}`}
          </div>
        </div>
        {totalIncompleteTasks === 0 && completedTasks.length === 0 ? (
          <div className="gm-card" style={{ padding: 22, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🌿</div>
            <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>
              No tasks yet
            </div>
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
              Assign plant profiles in the Map to get personalised care tasks.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Incomplete tasks */}
            {visibleIncompleteTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                profile={task.zone.assignedPlant ? profilesById.get(task.zone.assignedPlant) ?? null : null}
                completed={false}
                onOpen={() => onOpenZone(task.zone)}
                onAction={() => handleComplete(task)}
              />
            ))}

            {/* Show more / show less toggle */}
            {hasHiddenTasks && (
              <button
                className="gm-card"
                onClick={() => setShowAllTasks((v) => !v)}
                style={{
                  padding: '12px 14px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', cursor: 'pointer', width: '100%', textAlign: 'left',
                  border: '1.5px dashed var(--line)',
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--primary)' }}>
                  {showAllTasks
                    ? 'Show less'
                    : `Show ${incompleteTasks.length - TASKS_DEFAULT_VISIBLE} more task${incompleteTasks.length - TASKS_DEFAULT_VISIBLE !== 1 ? 's' : ''}`}
                </span>
                <span style={{
                  fontSize: 18, color: 'var(--primary)',
                  transform: showAllTasks ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                }}>
                  ›
                </span>
              </button>
            )}

            {/* Completed tasks */}
            {completedTasks.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 800, color: 'var(--ink-3)',
                  letterSpacing: '0.1em', padding: '6px 2px 2px', textTransform: 'uppercase',
                }}>
                  Completed today
                </div>
                {completedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    profile={task.zone.assignedPlant ? profilesById.get(task.zone.assignedPlant) ?? null : null}
                    completed={true}
                    onOpen={() => onOpenZone(task.zone)}
                    onAction={() => {}}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 2: Recent Activity ────────────────────────────────── */}
      <div>
        <div style={{ padding: '0 2px 10px' }}>
          <h2 className="gm-h2">Recent Activity 📋</h2>
          <div className="gm-sub">Watering, sensors, and plant changes</div>
        </div>
        {displayActivity.length === 0 ? (
          <div className="gm-card" style={{ padding: 22, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>💧</div>
            <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>
              No activity logged yet
            </div>
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
              Water a bed from Today's Tasks or a Zone to get started.
            </div>
          </div>
        ) : (
          <div className="gm-card" style={{ padding: '0 14px' }}>
            {displayActivity.slice(0, 8).map((entry, i) => (
              <ActivityItem
                key={entry.id}
                entry={entry}
                last={i === Math.min(displayActivity.length, 8) - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 3: Sensor Trends ──────────────────────────────────── */}
      <TrendsSection greenhouseId={greenhouseId} simHistory={simHistory} />

      {/* ── SECTION 4: Your Plants / Plant Profiles ───────────────────── */}
      <div>
        <div style={{ padding: '0 2px 10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h2 className="gm-h2">Your plants 🌿</h2>
            <div className="gm-sub">{plantProfiles.length} kinds saved · tap one to edit</div>
          </div>
          <button className="gm-btn primary" onClick={() => onAddProfile()} style={{ padding: '9px 14px', fontSize: 13, flexShrink: 0 }}>
            + New
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 16, color: 'var(--ink-3)', fontSize: 16 }}>
            🔍
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a plant…"
            style={{
              width: '100%', padding: '13px 14px 13px 42px', boxSizing: 'border-box',
              background: 'var(--card)', border: '1.5px solid var(--line)',
              borderRadius: 16, fontSize: 14, outline: 'none', color: 'var(--ink)',
              fontFamily: 'inherit', fontWeight: 600,
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredProfiles.length === 0 ? (
            <div className="gm-card" style={{ padding: 22, textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>🌱</div>
              <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 16 }}>
                No "{query}" yet
              </div>
              <button className="gm-btn soft" style={{ marginTop: 14 }} onClick={() => onAddProfile(query)}>
                + Add "{query}" to my plants
              </button>
            </div>
          ) : (
            <>
              {pagedProfiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  assignedZones={assignedZonesByPlant[p.id] ?? []}
                  onEdit={() => onEditProfile(p)}
                />
              ))}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px', gap: 8 }}>
                  <button
                    className="gm-btn soft"
                    style={{ padding: '8px 18px', fontSize: 13 }}
                    disabled={safePage === 0}
                    onClick={() => setProfilePage((p) => Math.max(0, p - 1))}
                  >
                    ‹ Prev
                  </button>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>
                    Page {safePage + 1} of {totalPages}
                  </span>
                  <button
                    className="gm-btn soft"
                    style={{ padding: '8px 18px', fontSize: 13 }}
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setProfilePage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    Next ›
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', padding: '14px 16px 0', lineHeight: 1.55, fontWeight: 600 }}>
          Profiles say what each plant likes. Assign one in the Map — change it any time! 🪴
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TaskCard({
  task, profile, completed, onOpen, onAction,
}: {
  task: Task; profile: PlantProfile | null;
  completed: boolean; onOpen: () => void; onAction: () => void;
}) {
  return (
    <div
      onClick={completed ? undefined : onOpen}
      role="button"
      tabIndex={0}
      className="gm-card"
      style={{
        width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 12, padding: 14,
        cursor: completed ? 'default' : 'pointer',
        opacity: completed ? 0.55 : 1,
        transition: 'opacity 0.25s',
      }}
    >
      <div style={{
        width: 50, height: 50, borderRadius: 16, flexShrink: 0,
        background: completed ? 'var(--good-soft, #e9fbe9)' : profile ? 'var(--primary-soft)' : 'var(--bg-sub)',
        display: 'grid', placeItems: 'center', fontSize: 26,
      }}>
        {completed ? '✅' : (profile?.icon ?? '🌱')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)',
          textDecoration: completed ? 'line-through' : 'none',
        }}>
          {task.label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 1, fontWeight: 600 }}>
          {completed ? 'Done today ✓' : task.detail}
        </div>
      </div>
      {!completed && (
        <button
          onClick={(e) => { e.stopPropagation(); onAction(); }}
          className={`gm-btn ${task.kind === 'water' ? 'water' : 'check'}`}
          style={{ padding: '10px 18px', flexShrink: 0, fontSize: 14 }}
        >
          {task.actionLabel}
        </button>
      )}
    </div>
  );
}

function ProfileCard({ profile, assignedZones, onEdit }: {
  profile: PlantProfile; assignedZones: VisualZone[]; onEdit: () => void;
}) {
  const zoneCount = assignedZones.length;
  const assignedLabels = assignedZones
    .slice(0, 4)
    .map((z) => z.displayLabel ?? z.visualLabel)
    .join(', ');
  return (
    <button
      onClick={onEdit}
      className="gm-card"
      style={{ width: '100%', textAlign: 'left', padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 50, height: 50, borderRadius: 16, background: 'var(--primary-soft)',
          display: 'grid', placeItems: 'center', fontSize: 26, flexShrink: 0,
        }}>
          {profile.icon ?? '🌱'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>
            {profile.name}
          </span>
          {profile.notes && (
            <div style={{
              fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1, lineHeight: 1.4,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', fontWeight: 600,
            }}>
              {profile.notes}
            </div>
          )}
        </div>
        <span style={{ fontSize: 18, color: 'var(--ink-3)' }}>›</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span className="gm-chip wet" style={{ background: 'var(--wet-soft)', color: 'var(--wet)' }}>
          💧 {profile.moistureMin}–{profile.moistureMax}%
        </span>
        <span className="gm-chip dry" style={{ background: 'var(--dry-soft)', color: 'oklch(0.5 0.13 65)' }}>
          🌡 {profile.soilTempMin}–{profile.soilTempMax}°C
        </span>
        {zoneCount > 0 ? (
          <span className="gm-chip primary">🌱 {zoneCount} {zoneCount === 1 ? 'spot' : 'spots'}</span>
        ) : (
          <span className="gm-chip outline">resting</span>
        )}
      </div>
      {zoneCount > 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700, lineHeight: 1.35 }}>
          Assigned to {assignedLabels}{zoneCount > 4 ? ` +${zoneCount - 4} more` : ''}
        </div>
      )}
    </button>
  );
}


const ACTIVITY_ICON: Record<string, string> = {
  watering:          '💧',
  assignment:        '🌱',
  cleared:           '✕',
  'profile-update':  '📋',
  'sensor-failure':  '⚠️',
  'sensor-recovered':'✅',
  'stale-node':      '📡',
  'moisture-alert':  '🚨',
  'greenhouse-switch': '🏡',
};

function ActivityItem({ entry, last }: { entry: ActivityEntry; last: boolean }) {
  const icon = ACTIVITY_ICON[entry.type] ?? '📋';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 0',
      borderBottom: last ? 'none' : '1px solid var(--line)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: 'var(--bg-sub)',
        display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
          {entry.message}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1, fontWeight: 600 }}>
          {formatActivityTime(entry.timestamp)}
        </div>
      </div>
    </div>
  );
}
