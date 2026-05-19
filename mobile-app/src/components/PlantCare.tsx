import { useMemo, useState } from 'react';
import { PlantProfile, evaluateZoneAgainstPlant } from '../plantProfiles';
import type { VisualZone } from '../zoneLayout';

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
}

type TaskKind = 'water' | 'check';

interface Task {
  zoneId: string;
  kind: TaskKind;
  label: string;
  detail: string;
  actionLabel: string;
  zone: VisualZone;
}

function buildTask(z: VisualZone, profile: PlantProfile | null): Task | null {
  const evaluation = evaluateZoneAgainstPlant(z, profile);
  if (evaluation.tone === 'good' || evaluation.tone === 'no-data') return null;

  const name = profile?.name ?? (z.displayLabel ?? z.visualLabel);
  if (evaluation.overallStatus === 'needs-water') {
    return {
      zoneId: z.visualLabel,
      kind: 'water',
      label: `Water the ${name.toLowerCase()}`,
      detail: 'Give it about 200ml of water',
      actionLabel: 'Water',
      zone: z,
    };
  }
  return {
    zoneId: z.visualLabel,
    kind: 'check',
    label: `Check ${name}`,
    detail: evaluation.messages[0] ?? 'Open the zone to review the reading',
    actionLabel: 'Check',
    zone: z,
  };
}

export function PlantCare({
  zones, loading, error,
  plantProfiles, profilesById,
  onOpenZone, onAddProfile, onEditProfile, onToast
}: PlantCareProps) {
  const [query, setQuery] = useState('');

  const tasks = useMemo(() => {
    return zones
      .map((z) => buildTask(z, z.assignedPlant ? profilesById.get(z.assignedPlant) ?? null : null))
      .filter((t): t is Task => t !== null);
  }, [zones, profilesById]);

  const summary = useMemo(() => {
    let good = 0, attention = 0;
    zones.forEach((z) => {
      const evaluation = evaluateZoneAgainstPlant(z, z.assignedPlant ? profilesById.get(z.assignedPlant) ?? null : null);
      if (evaluation.tone === 'good') good++;
      else if (evaluation.tone !== 'no-data') attention++;
    });
    return { good, attention, total: zones.length };
  }, [zones, profilesById]);

  const assignedZonesByPlant = useMemo(() => {
    const m: Record<string, VisualZone[]> = {};
    zones.forEach((z) => {
      if (z.assignedPlant) m[z.assignedPlant] = [...(m[z.assignedPlant] ?? []), z];
    });
    return m;
  }, [zones]);

  const filteredProfiles = useMemo(() =>
    plantProfiles.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.notes ?? '').toLowerCase().includes(query.toLowerCase())
    ),
    [plantProfiles, query]
  );

  const needsAttention = summary.attention;
  const total = summary.total;

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Status callout */}
      {!loading && !error && (
        needsAttention === 0 ? (
          <div className="gm-callout good">
            <div className="gm-callout-emoji">🌱</div>
            <div>
              <h3>Everything's happy today!</h3>
              <p>All {total || 'your'} sections in the greenhouse are doing great.</p>
            </div>
          </div>
        ) : (
          <div className="gm-callout">
            <div className="gm-callout-emoji">🏡</div>
            <div>
              <h3>Greenhouse: {needsAttention} section{needsAttention !== 1 ? 's' : ''} need attention</h3>
              <p>Check your tasks below for what to do.</p>
            </div>
          </div>
        )
      )}

      {error && (
        <div className="gm-callout alert">
          <div className="gm-callout-emoji">⚠️</div>
          <div>
            <h3>Backend offline</h3>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <div>
          <div style={{ padding: '0 2px 10px' }}>
            <h2 className="gm-h2">Today's Tasks</h2>
            <div className="gm-sub">
              You have {tasks.length} thing{tasks.length !== 1 ? 's' : ''} to do today! 🌱
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tasks.slice(0, 3).map((task) => (
              <TaskCard
                key={task.zoneId}
                task={task}
                profile={task.zone.assignedPlantProfile ?? (task.zone.assignedPlant ? profilesById.get(task.zone.assignedPlant) ?? null : null)}
                onOpen={() => onOpenZone(task.zone)}
                onAction={() => onToast(`${task.actionLabel}: ${task.label} 💧`)}
              />
            ))}
            {tasks.length > 3 && (
              <div className="gm-row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>Show {tasks.length - 3} more</span>
                <span style={{ fontSize: 18 }}>›</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Plant library */}
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
              width: '100%', padding: '13px 14px 13px 42px',
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
          ) : filteredProfiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              assignedZones={assignedZonesByPlant[p.id] ?? []}
              onEdit={() => onEditProfile(p)}
            />
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', padding: '14px 16px 0', lineHeight: 1.55, fontWeight: 600 }}>
          Profiles say what each plant likes. Drop one onto a spot in the map — change it any time! 🪴
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, profile, onOpen, onAction }: {
  task: Task; profile: PlantProfile | null;
  onOpen: () => void; onAction: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      className="gm-card"
      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer' }}
    >
      <div style={{
        width: 50, height: 50, borderRadius: 16,
        background: profile ? 'var(--primary-soft)' : 'var(--bg-sub)',
        display: 'grid', placeItems: 'center', fontSize: 26, flexShrink: 0,
      }}>
        {profile?.icon ?? '🌱'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
          {task.label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 1, fontWeight: 600 }}>
          {task.detail}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onAction(); }}
        className={`gm-btn ${task.kind === 'water' ? 'water' : 'check'}`}
        style={{ padding: '10px 18px', flexShrink: 0, fontSize: 14 }}
      >
        {task.actionLabel}
      </button>
    </div>
  );
}

function ProfileCard({ profile, assignedZones, onEdit }: {
  profile: PlantProfile; assignedZones: VisualZone[]; onEdit: () => void;
}) {
  const zoneCount = assignedZones.length;
  const assignedLabels = assignedZones
    .slice(0, 4)
    .map((zone) => zone.displayLabel ?? zone.visualLabel)
    .join(', ');

  return (
    <button
      onClick={onEdit}
      className="gm-card"
      style={{ width: '100%', textAlign: 'left', padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 50, height: 50, borderRadius: 16,
          background: 'var(--primary-soft)',
          display: 'grid', placeItems: 'center', fontSize: 26, flexShrink: 0,
        }}>
          {profile.icon ?? '🌱'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>
              {profile.name}
            </span>
          </div>
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
          <span className="gm-chip primary">
            🌱 {zoneCount} {zoneCount === 1 ? 'spot' : 'spots'}
          </span>
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
