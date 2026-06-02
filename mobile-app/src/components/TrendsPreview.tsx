import { useMemo } from 'react';
import type { VisualZone } from '../zoneLayout';
import type { PlantProfile } from '../plantProfiles';

interface TrendsPreviewProps {
  zones?: VisualZone[];
  profilesById?: Map<string, PlantProfile>;
  onOpenDashboard: () => void;
}

function zoneStatus(moisture: number, profile: PlantProfile | null): {
  status: 'critical' | 'dry' | 'wet' | 'good';
  color: string;
  label: string;
  trend: string;
  urgency: number;
} {
  if (profile) {
    if (moisture < profile.moistureMin * 0.7) {
      return { status: 'critical', color: '#ef4444', label: 'Critical', trend: 'Drying fast', urgency: 4 };
    }
    if (moisture < profile.moistureMin) {
      return { status: 'dry', color: '#f59e0b', label: 'Dry', trend: 'Trending dry', urgency: 3 };
    }
    if (moisture > profile.moistureMax) {
      return { status: 'wet', color: '#0ea5e9', label: 'Too wet', trend: 'High moisture', urgency: 2 };
    }
    return { status: 'good', color: '#22c55e', label: 'Good', trend: 'Stable', urgency: 0 };
  }
  if (moisture < 25) return { status: 'dry', color: '#f59e0b', label: 'Dry', trend: 'Trending dry', urgency: 1 };
  if (moisture > 80) return { status: 'wet', color: '#0ea5e9', label: 'Too wet', trend: 'High moisture', urgency: 1 };
  return { status: 'good', color: '#22c55e', label: 'Good', trend: 'Stable', urgency: 0 };
}

export function TrendsPreview({ zones, profilesById, onOpenDashboard }: TrendsPreviewProps) {
  const urgencyZones = useMemo(() => {
    return (zones ?? [])
      .filter((z) => z.hasReading && z.soilMoisturePct !== null)
      .map((z) => {
        const profile = z.assignedPlant ? profilesById?.get(z.assignedPlant) ?? null : null;
        const moisture = z.soilMoisturePct ?? 0;
        const s = zoneStatus(moisture, profile);
        return { zone: z, profile, moisture, ...s };
      })
      .sort((a, b) => b.urgency - a.urgency || a.moisture - b.moisture)
      .slice(0, 3);
  }, [zones, profilesById]);

  const plantGroups = useMemo(() => {
    const groups = new Map<string, {
      profile: PlantProfile; count: number;
      totalMoisture: number; moistureCount: number;
      needsWater: number; tooWet: number;
    }>();
    (zones ?? []).forEach((z) => {
      if (!z.assignedPlant || !z.hasReading) return;
      const profile = profilesById?.get(z.assignedPlant);
      if (!profile) return;
      if (!groups.has(z.assignedPlant)) {
        groups.set(z.assignedPlant, { profile, count: 0, totalMoisture: 0, moistureCount: 0, needsWater: 0, tooWet: 0 });
      }
      const g = groups.get(z.assignedPlant)!;
      g.count++;
      if (z.soilMoisturePct !== null) {
        g.totalMoisture += z.soilMoisturePct;
        g.moistureCount++;
        if (z.soilMoisturePct < profile.moistureMin) g.needsWater++;
        else if (z.soilMoisturePct > profile.moistureMax) g.tooWet++;
      }
    });
    return [...groups.values()]
      .sort((a, b) => (b.needsWater * 2 + b.tooWet) - (a.needsWater * 2 + a.tooWet))
      .slice(0, 3);
  }, [zones, profilesById]);

  const hasData = urgencyZones.length > 0 || plantGroups.length > 0;

  return (
    <div>
      <div style={{ padding: '0 2px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h2 className="gm-h2">Sensor Trends 📈</h2>
          <div className="gm-sub">Moisture, temperature, and plant health</div>
        </div>
        <button
          className="gm-btn ghost"
          style={{ fontSize: 12, padding: '7px 12px', flexShrink: 0 }}
          onClick={onOpenDashboard}
        >
          Full analysis →
        </button>
      </div>

      {!hasData ? (
        <div className="gm-card" style={{ padding: 22, textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
          <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>
            No sensor data yet
          </div>
          <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
            Connect your ESP32 and assign plants to zones to see trends.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {urgencyZones.length > 0 && (
            <div className="gm-card" style={{ padding: '0 14px' }}>
              <SectionLabel>Zones needing attention</SectionLabel>
              {urgencyZones.map(({ zone, profile, moisture, color, label, trend }, i) => (
                <div key={zone.visualLabel} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                  borderBottom: i < urgencyZones.length - 1 ? '1px solid var(--line)' : 'none',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: color + '18', display: 'grid', placeItems: 'center', fontSize: 15,
                  }}>
                    {profile?.icon ?? '🌱'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {zone.displayLabel ?? zone.visualLabel}
                      {profile && (
                        <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {profile.name}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1, fontWeight: 600 }}>{trend}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color }}>{moisture.toFixed(0)}%</div>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: color + '18', color }}>
                      {label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {plantGroups.length > 0 && (
            <div className="gm-card" style={{ padding: '0 14px' }}>
              <SectionLabel>Plant behavior</SectionLabel>
              {plantGroups.map((g, i) => {
                const avg = g.moistureCount > 0 ? g.totalMoisture / g.moistureCount : 0;
                const statusLabel = g.needsWater > 0 ? 'Drying fast' : g.tooWet > 0 ? 'Too wet' : 'Stable';
                const statusColor = g.needsWater > 0 ? '#f59e0b' : g.tooWet > 0 ? '#0ea5e9' : '#22c55e';
                return (
                  <div key={g.profile.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                    borderBottom: i < plantGroups.length - 1 ? '1px solid var(--line)' : 'none',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                      background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 15,
                    }}>
                      {g.profile.icon ?? '🌱'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>{g.profile.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
                        {g.count} zone{g.count !== 1 ? 's' : ''} · {avg.toFixed(0)}% avg · target {g.profile.moistureMin}–{g.profile.moistureMax}%
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 7,
                      background: statusColor + '18', color: statusColor, flexShrink: 0,
                    }}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={onOpenDashboard}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              width: '100%', padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
              background: 'var(--card)', border: '1.5px dashed var(--line)', borderRadius: 16,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div>
              <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 14, color: 'var(--primary)' }}>
                Open Trends & Analysis
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, fontWeight: 600 }}>
                Charts, watering response, zone history, research data
              </div>
            </div>
            <span style={{ fontSize: 18, color: 'var(--primary)' }}>→</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
      color: 'var(--ink-3)', textTransform: 'uppercase',
      padding: '8px 0 4px',
    }}>
      {children}
    </div>
  );
}
