import { useMemo, useState } from 'react';
import { PlantProfile, evaluateZoneAgainstPlant } from '../plantProfiles';
import type { VisualZone } from '../zoneLayout';

interface AlertsViewProps {
  zones: VisualZone[];
  loading: boolean;
  error: string | null;
  plantProfiles: PlantProfile[];
  profilesById: Map<string, PlantProfile>;
  onOpenZone: (zone: VisualZone) => void;
}

type AlertTone = 'alert' | 'dry' | 'wet';

interface AlertEntry {
  zone: VisualZone;
  kind: string;
  status: AlertTone;
}

const STATUS_COLOR: Record<AlertTone, string> = {
  alert: 'var(--alert)',
  dry:   'var(--dry)',
  wet:   'var(--wet)',
};

export function AlertsView({
  zones, loading, error,
  profilesById,
  onOpenZone,
}: AlertsViewProps) {
  const [filter, setFilter] = useState<'all' | AlertTone>('all');

  const alertsList = useMemo<AlertEntry[]>(() => {
    const out: AlertEntry[] = [];
    zones.forEach((z) => {
      const profile = z.assignedPlantProfile ?? (z.assignedPlant ? profilesById.get(z.assignedPlant) ?? null : null);
      const evaluation = evaluateZoneAgainstPlant(z, profile);
      if (evaluation.tone === 'good' || evaluation.tone === 'no-data') return;
      const status: AlertTone = evaluation.tone === 'wet' ? 'wet' : evaluation.tone === 'dry' ? 'dry' : 'alert';
      evaluation.messages.forEach((message) => out.push({ zone: z, kind: message, status }));
    });
  return out;
  }, [zones, profilesById]);

  const filtered = filter === 'all' ? alertsList : alertsList.filter((a) => a.status === filter);
  const time = useMemo(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), []);

  const counts = {
    alert: alertsList.filter((a) => a.status === 'alert').length,
    dry:   alertsList.filter((a) => a.status === 'dry').length,
    wet:   alertsList.filter((a) => a.status === 'wet').length,
  };

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header card */}
      <div className="gm-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--ink-3)' }}>
              ACTIVE ALERTS
            </div>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 30, lineHeight: 1, color: 'var(--ink)', marginTop: 4, fontWeight: 800 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: alertsList.length > 0 ? 'var(--alert)' : 'var(--good)' }}>
                {loading ? '…' : alertsList.length}
              </span>{' '}
              <span style={{ fontSize: 18, color: 'var(--ink-2)' }}>
                across {zones.length} zone{zones.length !== 1 ? 's' : ''}
              </span>
            </div>
            {error && (
              <div style={{ fontSize: 12, color: 'var(--alert)', marginTop: 4, fontWeight: 600 }}>
                Backend offline: {error}
              </div>
            )}
          </div>
          <div style={{
            padding: '6px 10px', background: 'var(--bg-sub)', borderRadius: 99,
            fontSize: 12, fontWeight: 600, color: 'var(--ink-2)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {time}
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="gm-filter-chips">
        {([
          { value: 'all',   label: 'All',      count: alertsList.length },
          { value: 'alert', label: 'Critical',  count: counts.alert },
          { value: 'dry',   label: 'Dry',       count: counts.dry },
          { value: 'wet',   label: 'Wet',       count: counts.wet },
        ] as const).map((o) => (
          <button
            key={o.value}
            className={`gm-filter-chip${filter === o.value ? ' active' : ''}`}
            onClick={() => setFilter(o.value)}
          >
            {o.label}
            {o.count > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.7, fontWeight: 700 }}>{o.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div className="gm-card" style={{ padding: 28, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🌿</div>
            <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>All clear</div>
            <div style={{ fontSize: 12, marginTop: 2 }}>
              {loading ? 'Loading sensor data…' : 'No alerts in this filter.'}
            </div>
          </div>
        ) : filtered.map((a, i) => {
          const { zone: z, kind, status } = a;
          const profile = z.assignedPlantProfile ?? (z.assignedPlant ? profilesById.get(z.assignedPlant) ?? null : null);
          return (
            <button
              key={`${z.visualLabel}-${i}`}
              onClick={() => onOpenZone(z)}
              className="gm-card"
              style={{
                textAlign: 'left',
                padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
                borderLeft: `3px solid ${STATUS_COLOR[status]}`,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                    {z.displayLabel ?? z.visualLabel}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {z.nodeId ? `${z.nodeId} · ` : ''}{z.backendZoneId}
                  </div>
                </div>
                <span className={`gm-chip ${status}`}>
                  {kind}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {profile && (
                  <span className="gm-chip primary">
                    {profile.icon ?? '🌱'} {profile.name}
                  </span>
                )}
                <span className="gm-chip" style={{ background: 'var(--bg-sub)', color: 'var(--ink-2)' }}>
                  💧 {z.soilMoisturePct != null ? `${z.soilMoisturePct}%` : '—'}
                </span>
                <span className="gm-chip" style={{ background: 'var(--bg-sub)', color: 'var(--ink-2)' }}>
                  🌡 {z.soilTempC != null ? `${z.soilTempC.toFixed(1)}°C` : '—'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}
