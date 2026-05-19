import { useMemo, useState } from 'react';
import { ZoneAlert, evaluateAllAlerts } from '../alertRules';
import { PlantProfile } from '../plantProfiles';
import { VisualZone } from '../zoneLayout';

interface AlertsViewProps {
  zones: VisualZone[];
  loading: boolean;
  error: string | null;
  profilesById: Map<string, PlantProfile>;
  onOpenZone: (zone: VisualZone) => void;
}

type FilterKind = 'all' | 'critical' | 'moisture' | 'temperature' | 'sensor';

const TYPE_ICON: Record<string, string> = {
  moisture:    '💧',
  temperature: '🌡️',
  sensor:      '⚠️',
  node:        '📶',
};

export function AlertsView({
  zones, loading, error,
  profilesById,
  onOpenZone,
}: AlertsViewProps) {
  const [filter, setFilter] = useState<FilterKind>('all');

  const allAlerts = useMemo(
    () => evaluateAllAlerts(zones, profilesById),
    [zones, profilesById]
  );

  const counts = useMemo(() => ({
    critical:    allAlerts.filter((a) => a.severity === 'critical').length,
    warning:     allAlerts.filter((a) => a.severity === 'warning').length,
    moisture:    allAlerts.filter((a) => a.type === 'moisture').length,
    temperature: allAlerts.filter((a) => a.type === 'temperature').length,
    sensor:      allAlerts.filter((a) => a.type === 'sensor' || a.type === 'node').length,
  }), [allAlerts]);

  const filtered = useMemo(() => {
    let list = allAlerts;
    if (filter === 'critical')    list = allAlerts.filter((a) => a.severity === 'critical');
    if (filter === 'moisture')    list = allAlerts.filter((a) => a.type === 'moisture');
    if (filter === 'temperature') list = allAlerts.filter((a) => a.type === 'temperature');
    if (filter === 'sensor')      list = allAlerts.filter((a) => a.type === 'sensor' || a.type === 'node');
    return [...list].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1
    );
  }, [allAlerts, filter]);

  const time = useMemo(
    () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    []
  );

  const headerColor =
    counts.critical > 0 ? 'var(--alert)' :
    allAlerts.length > 0 ? 'var(--dry)' :
    'var(--good)';

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Backend offline banner */}
      {error && (
        <div className="gm-card" style={{ padding: 14, borderLeft: '3px solid var(--alert)', background: 'var(--alert-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📡</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--alert)' }}>Backend offline</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2, fontWeight: 600 }}>
                Cannot reach sensors — last known data shown.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header card */}
      <div className="gm-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--ink-3)' }}>
              ACTIVE ALERTS
            </div>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 30, lineHeight: 1, color: 'var(--ink)', marginTop: 4, fontWeight: 800 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: headerColor }}>
                {loading ? '…' : allAlerts.length}
              </span>{' '}
              <span style={{ fontSize: 18, color: 'var(--ink-2)' }}>
                {allAlerts.length === 1 ? 'alert' : 'alerts'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
              {time}
            </div>
            {counts.critical > 0 && (
              <span className="gm-chip alert">{counts.critical} critical</span>
            )}
            {counts.warning > 0 && (
              <span className="gm-chip dry">{counts.warning} warning{counts.warning !== 1 ? 's' : ''}</span>
            )}
            {counts.sensor > 0 && counts.critical === 0 && counts.warning === 0 && (
              <span className="gm-chip outline">{counts.sensor} sensor</span>
            )}
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="gm-filter-chips">
        {([
          { value: 'all',         label: 'All',         count: allAlerts.length },
          { value: 'critical',    label: 'Critical',    count: counts.critical },
          { value: 'moisture',    label: 'Water',       count: counts.moisture },
          { value: 'temperature', label: 'Temperature', count: counts.temperature },
          { value: 'sensor',      label: 'Sensor',      count: counts.sensor },
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
        {loading ? (
          <div className="gm-card" style={{ padding: 28, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🔄</div>
            <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Checking sensor data…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="gm-card" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🌿</div>
            <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontSize: 17, fontFamily: "'Baloo 2', system-ui" }}>
              No urgent alerts.
            </div>
            <div style={{ fontSize: 13, marginTop: 4, color: 'var(--ink-3)', fontWeight: 600 }}>
              Your garden looks steady.
            </div>
          </div>
        ) : filtered.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onOpen={() => onOpenZone(alert.zone)}
          />
        ))}
      </div>

    </div>
  );
}

function AlertCard({ alert, onOpen }: { alert: ZoneAlert; onOpen: () => void }) {
  const isCritical = alert.severity === 'critical';
  const tone = isCritical ? 'alert' : 'dry';

  return (
    <button
      onClick={onOpen}
      className="gm-card"
      style={{
        textAlign: 'left', width: '100%',
        padding: 14, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 8,
        borderLeft: `3px solid var(--${tone})`,
        background: `var(--${tone}-soft)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_ICON[alert.type] ?? '⚠️'}</span>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', lineHeight: 1.2 }}>
            {alert.title}
          </div>
        </div>
        <span className={`gm-chip ${tone}`} style={{ flexShrink: 0 }}>
          {isCritical ? 'Critical' : 'Warning'}
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, paddingLeft: 24 }}>
        {alert.message}
      </div>

      {(alert.plantName || alert.displayLabel) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 24 }}>
          {alert.plantName && (
            <span className="gm-chip primary">🌱 {alert.plantName}</span>
          )}
          {alert.displayLabel && (
            <span className="gm-chip" style={{ background: 'var(--bg-sub)', color: 'var(--ink-2)' }}>
              {alert.displayLabel}
            </span>
          )}
        </div>
      )}

      {alert.action && (
        <div style={{
          fontSize: 11.5, fontWeight: 700,
          color: isCritical ? 'var(--alert)' : 'oklch(0.5 0.13 65)',
          paddingLeft: 24,
        }}>
          → {alert.action}
        </div>
      )}
    </button>
  );
}
