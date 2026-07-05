import { useEffect, useMemo, useRef, useState } from 'react';
import { ZoneAlert, evaluateAllAlerts } from '../alertRules';
import { PlantProfile } from '../plantProfiles';
import { VisualZone } from '../zoneLayout';
import type { NotificationDoc } from '../services/notificationsService';

interface AlertsViewProps {
  zones: VisualZone[];
  loading: boolean;
  error: string | null;
  profilesById: Map<string, PlantProfile>;
  onOpenZone: (zone: VisualZone) => void;
  /** All stored notifications (active + auto-resolved) — owned by App. Drives
   *  the resolved/history list and each card's "came up" time (createdAt). */
  notifications: NotificationDoc[];
}

type CategoryId =
  | 'all' | 'critical' | 'water' | 'temperature'
  | 'sensor' | 'runoff' | 'maintenance' | 'resolved';

// Priority order left→right; the row scrolls horizontally with edge arrows.
const CATEGORIES: { id: CategoryId; label: string; icon: string }[] = [
  { id: 'all',         label: 'All',            icon: '📋' },
  { id: 'critical',    label: 'Critical',       icon: '🚨' },
  { id: 'water',       label: 'Needs Water',    icon: '💧' },
  { id: 'temperature', label: 'Temperature',    icon: '🌡️' },
  { id: 'sensor',      label: 'Sensor Offline', icon: '📡' },
  { id: 'runoff',      label: 'Runoff Risk',    icon: '🌊' },
  { id: 'maintenance', label: 'Maintenance',    icon: '🛠️' },
  { id: 'resolved',    label: 'Resolved',       icon: '✅' },
];

const TYPE_ICON: Record<string, string> = {
  moisture:    '💧',
  temperature: '🌡️',
  sensor:      '📡',
  node:        '📶',
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Normalised shape rendered by AlertCard — built from either a live ZoneAlert
// or a resolved NotificationDoc.
interface CardModel {
  id: string;
  type: string;
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  action: string;
  zoneLabel: string;
  plantName?: string;
  resolved: boolean;
  resolvedAt?: string;
  zone?: VisualZone;
  // When this notification first came up (ISO) — drives the card's time label.
  createdAt?: string;
  // Stale ('node') alerts only: exact + relative "last updated" info.
  staleExact?: string;
  staleRelative?: string;
}

// Which active-alert category an alert belongs to. An alert can match more than
// one (e.g. a critical moisture alert shows under both Critical and Needs Water).
// `runoff` / `maintenance` have no rules yet, so those tabs stay empty for now.
function matchesCategory(a: ZoneAlert, cat: CategoryId): boolean {
  switch (cat) {
    case 'all':         return true;
    case 'critical':    return a.severity === 'critical';
    case 'water':       return a.type === 'moisture';
    case 'temperature': return a.type === 'temperature';
    case 'sensor':      return a.type === 'sensor' || a.type === 'node';
    case 'runoff':      return (a.type as string) === 'runoff';
    case 'maintenance': return (a.type as string) === 'maintenance';
    default:            return false;
  }
}

// Recommended action in simple, non-technical language for greenhouse users
// (including youths). Keyed off the stable alert-id suffix.
function friendlyAction(a: ZoneAlert): string {
  const id = a.id;

  // Moisture range issues
  if (id.includes('moisture-dry')) return 'Give this plant some water today. 💧';
  if (id.includes('moisture-wet')) return 'Skip watering for now and let the soil dry out.';

  // Temperature range issues
  if (id.includes('temp-cold'))    return 'Keep this plant warmer — add a cover or move it out of the cold.';
  if (id.includes('temp-hot'))     return 'Cool this plant down — give it some shade.';

  // Stale / outdated data for a zone. Send the user to inspect the bed in
  // person and log any watering manually — never mention sensors or hardware.
  if (id.includes('stale')) {
    const ts = a.zone.timestamp;
    const ageMs = ts ? Date.now() - new Date(ts).getTime() : 0;
    if (ageMs >= DAY_MS) {
      return 'Please visit the greenhouse in-person and check this bed and its plants. Water them if they need it, and log any watering yourself — it won’t be recorded automatically. Let your admin know too.';
    }
    return 'Please check on this bed in-person. Water the plants if they look dry, log any watering manually, and let your admin know.';
  }

  // Temperature sensor problems — nothing for the user to do at the plant; just
  // ask them to contact the admin.
  if (id.includes('temp')) {
    return 'Please let your admin know so they can look into it.';
  }

  // Soil-moisture sensor problems — the plants may still need attention.
  if (id.includes('moisture') || a.type === 'sensor') {
    return 'Please check this bed in-person and water the plants if they look dry. Log any watering manually, and let your admin know.';
  }

  return a.action ?? 'Check on this bed.';
}

function formatWhen(isoStr?: string): string {
  if (!isoStr) return 'recently';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return 'recently';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Human-readable elapsed time: minutes up to 59, then hours (+minutes) up to
// 23h 59m, then days (+hours). e.g. "45 mins", "1 hour", "1 hour 5 mins",
// "23 hours 10 mins", "1 day", "1 day 3 hours".
function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 60) return `${totalMin} min${totalMin === 1 ? '' : 's'}`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) {
    const h = `${hours} hour${hours === 1 ? '' : 's'}`;
    return mins ? `${h} ${mins} min${mins === 1 ? '' : 's'}` : h;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const d = `${days} day${days === 1 ? '' : 's'}`;
  return remHours ? `${d} ${remHours} hour${remHours === 1 ? '' : 's'}` : d;
}

function ordinalDay(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

// e.g. "Thursday, 12th July 2026, 12:00 pm"
function formatExactTimestamp(d: Date): string {
  const weekday = d.toLocaleDateString([], { weekday: 'long' });
  const month = d.toLocaleDateString([], { month: 'long' });
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${weekday}, ${ordinalDay(d.getDate())} ${month} ${d.getFullYear()}, ${time}`;
}

// "Came up" label shown on the right of each card: minutes → hours → days →
// months, then the calendar date (M/D/YYYY) once older than a year.
// e.g. "2 mins ago", "3 hours ago", "5 days ago", "2 months ago", "7/5/2026".
function timeAgo(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1)   return 'just now';
  if (min < 60)  return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

const severityRank = (a: ZoneAlert) => (a.severity === 'critical' ? 0 : 1);

function activeToModel(a: ZoneAlert): CardModel {
  let staleExact: string | undefined;
  let staleRelative: string | undefined;
  if (a.type === 'node' && a.zone.timestamp) {
    const d = new Date(a.zone.timestamp);
    if (!isNaN(d.getTime())) {
      staleExact = formatExactTimestamp(d);
      staleRelative = formatDuration(Date.now() - d.getTime());
    }
  }
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    message: a.message,
    action: friendlyAction(a),
    zoneLabel: a.displayLabel ?? a.zoneId,
    plantName: a.plantName,
    resolved: false,
    zone: a.zone,
    staleExact,
    staleRelative,
  };
}

function resolvedToModel(n: NotificationDoc, zones: VisualZone[]): CardModel {
  return {
    id: n.id,
    type: n.type,
    severity: n.severity,
    title: n.title,
    message: n.message,
    action: n.action ?? '',
    zoneLabel: n.displayLabel ?? n.zoneId,
    plantName: n.plantName,
    resolved: true,
    resolvedAt: n.resolvedAt,
    createdAt: n.createdAt,
    zone: zones.find((z) => z.visualLabel === n.zoneId),
  };
}

export function AlertsView({
  zones, loading, error,
  profilesById, onOpenZone,
  notifications,
}: AlertsViewProps) {
  const [category, setCategory] = useState<CategoryId>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Active alerts come straight from the live evaluation; resolved ones live in
  // history (never shown in the active categories or "All").
  const activeAlerts = useMemo(
    () => evaluateAllAlerts(zones, profilesById),
    [zones, profilesById]
  );

  const resolvedNotifications = useMemo(
    () => notifications
      .filter((n) => n.status === 'resolved')
      .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')),
    [notifications]
  );

  // alertId → when it first came up (for the card's time label).
  const createdAtByAlertId = useMemo(
    () => new Map(notifications.map((n) => [n.alertId, n.createdAt])),
    [notifications]
  );

  const counts = useMemo(() => {
    const c: Record<CategoryId, number> = {
      all: 0, critical: 0, water: 0, temperature: 0,
      sensor: 0, runoff: 0, maintenance: 0, resolved: resolvedNotifications.length,
    };
    const cats: CategoryId[] = ['all', 'critical', 'water', 'temperature', 'sensor', 'runoff', 'maintenance'];
    activeAlerts.forEach((a) => cats.forEach((cat) => { if (matchesCategory(a, cat)) c[cat]++; }));
    return c;
  }, [activeAlerts, resolvedNotifications]);

  const criticalCount = counts.critical;

  const list = useMemo<CardModel[]>(() => {
    if (category === 'resolved') {
      return resolvedNotifications.map((n) => resolvedToModel(n, zones));
    }
    return activeAlerts
      .filter((a) => matchesCategory(a, category))
      .sort((a, b) => severityRank(a) - severityRank(b))
      .map((a) => ({ ...activeToModel(a), createdAt: createdAtByAlertId.get(a.id) }));
  }, [category, activeAlerts, resolvedNotifications, createdAtByAlertId, zones]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

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

      {/* Priority summary — tells the user what to deal with first */}
      <div className="gm-alert-summary">
        <span className="gm-alert-summary-emoji">
          {criticalCount > 0 ? '🚨' : activeAlerts.length > 0 ? '👀' : '🌿'}
        </span>
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>
            {loading ? 'Checking…'
              : activeAlerts.length === 0 ? 'All good right now'
              : `${activeAlerts.length} thing${activeAlerts.length === 1 ? '' : 's'} to check`}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
            {criticalCount > 0
              ? `Start with ${criticalCount} critical alert${criticalCount === 1 ? '' : 's'} first.`
              : activeAlerts.length > 0 ? 'Nothing urgent — tap a card to see what to do.'
              : 'Your garden looks steady.'}
          </div>
        </div>
      </div>

      {/* Category chips — horizontal scroll with visible edge arrows */}
      <CategoryChips category={category} counts={counts} onSelect={setCategory} />

      {/* Alert list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && category !== 'resolved' ? (
          <div className="gm-card" style={{ padding: 28, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🔄</div>
            <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Checking sensor data…</div>
          </div>
        ) : list.length === 0 ? (
          <div className="gm-card" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{category === 'resolved' ? '🗂️' : '🌿'}</div>
            <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontSize: 16, fontFamily: "'Baloo 2', system-ui" }}>
              {category === 'resolved' ? 'No resolved alerts yet.' : 'Nothing here right now.'}
            </div>
            <div style={{ fontSize: 13, marginTop: 4, color: 'var(--ink-3)', fontWeight: 600 }}>
              {category === 'resolved' ? 'Alerts move here once they clear on their own.'
                : category === 'all' ? 'Your garden looks steady.'
                : 'Try another category above.'}
            </div>
          </div>
        ) : list.map((model) => (
          <AlertCard
            key={model.id}
            model={model}
            expanded={expanded.has(model.id)}
            onToggle={() => toggle(model.id)}
            onOpen={model.zone ? () => onOpenZone(model.zone!) : undefined}
          />
        ))}
      </div>

    </div>
  );
}

// ── Category chips: horizontal scroller with left/right arrows that brighten
//    when there is more content to scroll in that direction. ────────────────
function CategoryChips({ category, counts, onSelect }: {
  category: CategoryId;
  counts: Record<CategoryId, number>;
  onSelect: (id: CategoryId) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  const update = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const nudge = (dx: number) => scrollerRef.current?.scrollBy({ left: dx, behavior: 'smooth' });

  return (
    <div className="gm-cat-wrap">
      <button
        className={`gm-cat-arrow left${edges.left ? ' more' : ''}`}
        onClick={() => nudge(-180)}
        aria-label="Scroll categories left"
      >
        ‹
      </button>

      <div className="gm-cat-scroll" ref={scrollerRef} onScroll={update}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`gm-cat-chip${category === cat.id ? ' active' : ''}`}
            onClick={() => onSelect(cat.id)}
          >
            <span style={{ fontSize: 13 }}>{cat.icon}</span>
            {cat.label}
            {counts[cat.id] > 0 && <span className="gm-cat-count">{counts[cat.id]}</span>}
          </button>
        ))}
      </div>

      <button
        className={`gm-cat-arrow right${edges.right ? ' more' : ''}`}
        onClick={() => nudge(180)}
        aria-label="Scroll categories right"
      >
        ›
      </button>
    </div>
  );
}

// ── Collapsible alert card: compact header (tap to expand) → reason,
//    recommended action, and View Zone. Resolution is automatic — there is no
//    manual "Mark as Resolved" button. ──────────────────────────────────────
function AlertCard({
  model, expanded, onToggle, onOpen,
}: {
  model: CardModel;
  expanded: boolean;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  const { resolved, severity, type } = model;
  const isCritical = severity === 'critical';
  const tone = resolved ? 'good' : isCritical ? 'alert' : 'dry';
  const sevLabel = resolved ? 'Resolved' : isCritical ? 'Critical' : 'Warning';

  return (
    <div
      className="gm-card"
      style={{
        borderLeft: `3px solid var(--${tone})`,
        background: `var(--${tone}-soft)`,
        opacity: resolved ? 0.92 : 1,
      }}
    >
      {/* Collapsed header — always visible, tappable */}
      <button className="gm-alert-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="gm-alert-icon">{TYPE_ICON[type] ?? '⚠️'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="gm-alert-title">{model.title}</div>
          <div className="gm-alert-tags">
            <span className={`gm-chip ${tone}`}>{sevLabel}</span>
            <span className="gm-chip" style={{ background: 'var(--card-sub)', color: 'var(--ink-2)' }}>
              📍 {model.zoneLabel}
            </span>
            {model.plantName && <span className="gm-chip primary">🌱 {model.plantName}</span>}
          </div>
        </div>
        <div className="gm-alert-meta">
          {timeAgo(model.createdAt) && (
            <span className="gm-alert-time">{timeAgo(model.createdAt)}</span>
          )}
          <span className={`gm-alert-chev${expanded ? ' open' : ''}`}>▾</span>
        </div>
      </button>

      {!expanded && (
        <div className="gm-alert-hint">
          {resolved ? 'Tap to see details' : 'Tap for reason & what to do'}
        </div>
      )}

      {expanded && (
        <div className="gm-alert-body">
          {/* Reason — stale ('node') alerts show friendly, non-technical text.
              While active they also get a clean "last updated" block (exact
              timestamp + friendly relative age). */}
          {type === 'node' ? (
            <>
              <div className="gm-alert-field">
                <div className="gm-alert-field-label">Why</div>
                <div className="gm-alert-field-value">
                  {resolved
                    ? 'This bed had gone quiet for a while but is sending readings again.'
                    : 'This bed hasn’t sent a new reading in a while, so its numbers may be out of date.'}
                </div>
              </div>
              {!resolved && model.staleExact && (
                <div className="gm-alert-field">
                  <div className="gm-alert-field-label">Last updated</div>
                  <div className="gm-alert-field-value">{model.staleExact}</div>
                  {model.staleRelative && (
                    <div className="gm-alert-field-sub">{model.staleRelative} ago</div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="gm-alert-field">
              <div className="gm-alert-field-label">Why</div>
              <div className="gm-alert-field-value">{model.message}</div>
            </div>
          )}

          {resolved ? (
            <div className="gm-alert-field">
              <div className="gm-alert-field-label">Resolved</div>
              <div className="gm-alert-field-value">Cleared on its own · {formatWhen(model.resolvedAt)} 🎉</div>
            </div>
          ) : (
            <div className="gm-alert-field highlight">
              <div className="gm-alert-field-label">What to do</div>
              <div className="gm-alert-field-value">{model.action}</div>
            </div>
          )}

          {onOpen && (
            <div className="gm-alert-actions">
              <button className="gm-alert-btn view" onClick={onOpen}>View Zone →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
