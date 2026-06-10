/* ──────────────────────────────────────────────────────────────────────────
   TrendsViews.tsx — the four Trends tabs, built to match the attached design.
   Overview (greenhouse report card) · Zones (list → detail) ·
   Plants (list → detail) · Watering (did watering help?).
   Designed for non-technical users: 1 card · 1 chart · 1 sentence per concept.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  LineChart, BarsChart, RangePicker, LegendDot, Insight, EmptyHint, SectionCard,
} from './TrendsCharts';
import type { ChartSeries } from './TrendsCharts';
import { relTime } from './trendsModel';
import type {
  GreenhouseModel, ZoneLite, SimpleStatus, Trend, HealthCounts,
} from './trendsModel';
import type { TimeRange } from '../../hooks/useReadingsHistory';

interface TabProps { gm: GreenhouseModel; range: TimeRange; setRange: (r: TimeRange) => void; }

const RANGE_WORD: Record<TimeRange, string> = {
  '24h': 'last 24 hours', '7d': 'last week', '30d': 'last month', '3m': 'last 3 months', '1y': 'last year',
};
const RANGE_SHORT: Record<TimeRange, string> = { '24h': '24h', '7d': '7d', '30d': '30d', '3m': '3m', '1y': '1y' };
const TODAY_WORD: Record<TimeRange, string> = {
  '24h': 'today', '7d': 'this week', '30d': 'this month', '3m': 'this quarter', '1y': 'this year',
};

// Padded vertical stack. Lives inside the dashboard's plain scroll container,
// so its height is content-driven and children never get shrink-clipped.
function Page({ children, gap = 13 }: { children: ReactNode; gap?: number }) {
  return <div style={{ padding: '14px 16px 36px', display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}

// small coloured water droplet
function Droplet({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M12 2.5C12 2.5 5 10 5 14.5a7 7 0 0 0 14 0C19 10 12 2.5 12 2.5z" fill={color} />
    </svg>
  );
}

function StatusPill({ status, big }: { status: SimpleStatus; big?: boolean }) {
  return (
    <span style={{
      fontSize: big ? 11 : 9.5, fontWeight: 800, padding: big ? '3px 10px' : '2px 7px', borderRadius: 8,
      background: status.color + '20', color: status.color, whiteSpace: 'nowrap', display: 'inline-block',
    }}>{status.label}</span>
  );
}

function TrendText({ trend, suffix }: { trend: Trend; suffix?: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: trend.color, whiteSpace: 'nowrap' }}>
      {trend.arrow} {trend.label}{suffix ?? ''}
    </span>
  );
}

// ══ OVERVIEW · greenhouse report card ════════════════════════════════════════
function HealthChip({ icon, count, label, prev, goodWhenUp }: {
  icon: string; count: number; label: string; prev: number | null; goodWhenUp: boolean;
}) {
  const delta = prev === null ? null : count - prev;
  let deltaEl;
  if (delta === null || delta === 0) deltaEl = <span style={{ color: 'var(--ink-3)' }}>— no change</span>;
  else {
    const up = delta > 0;
    const good = up === goodWhenUp;
    deltaEl = <span style={{ color: good ? '#16a34a' : '#ef4444' }}>{up ? '↑' : '↓'} {Math.abs(delta)} since yesterday</span>;
  }
  return (
    <div style={{ textAlign: 'center', padding: '12px 6px 10px', background: icon + '14', borderRadius: 14 }}>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 4 }}><Droplet color={icon} size={20} /></div>
      <div style={{ fontSize: 24, fontWeight: 800, color: icon, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 800, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 9, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>{deltaEl}</div>
    </div>
  );
}

function ghInsight(d: { moisture: number; temp: number | null }, counts: HealthCounts): string {
  if (d.moisture <= -8 && d.temp != null && d.temp >= 1.5) return 'Temperature rose and moisture dropped across the greenhouse.';
  if (d.moisture <= -6) return 'Moisture dropped steadily across the greenhouse.';
  if (d.moisture >= 8) return 'Moisture rose — watering looks like it helped.';
  if (counts.need === 0) return 'Most zones remain within their target range.';
  return 'Conditions stayed fairly steady across the greenhouse.';
}

export function OverviewView({ gm, range, setRange }: TabProps) {
  const s = useMemo(() => gm.genGreenhouseSeries(range), [gm, range]);
  const counts = gm.healthCounts();
  const prev = gm.prevHealthCounts();
  const delta = gm.ghDelta(range);
  const hasTemp = s.some((d) => d.temp != null);

  const td = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    s.forEach((d) => { if (d.temp != null) { lo = Math.min(lo, d.temp); hi = Math.max(hi, d.temp); } });
    if (!isFinite(lo)) return [0, 30] as [number, number];
    lo = Math.max(0, Math.floor((lo - 2) / 5) * 5); hi = Math.ceil((hi + 2) / 5) * 5;
    if (hi - lo < 10) hi = lo + 10;
    return [lo, hi] as [number, number];
  }, [s]);

  const series: ChartSeries[] = [
    { key: 'm', name: 'Avg moisture', color: '#0ea5e9', axis: 'L', data: s.map((d) => ({ value: d.moisture, label: d.label })) },
  ];
  if (hasTemp) series.push({ key: 't', name: 'Avg soil temp', color: '#16a34a', axis: 'R', width: 2.6, data: s.map((d) => ({ value: d.temp ?? 0, label: d.label })) });

  const lastTs = s.length ? s[s.length - 1].t : null;

  const mDeltaTxt = `${delta.moisture > 0 ? '↑ ' : delta.moisture < 0 ? '↓ ' : ''}${Math.abs(delta.moisture)}% ${TODAY_WORD[range]}`;
  const tDeltaTxt = delta.temp == null ? '' : `${delta.temp > 0 ? '↑ ' : delta.temp < 0 ? '↓ ' : ''}${Math.abs(delta.temp)}°C ${TODAY_WORD[range]}`;

  return (
    <Page>
      {/* Greenhouse Health */}
      <div className="gm-card" style={{ padding: '14px 14px 16px' }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginBottom: 12 }}>Greenhouse Health</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <HealthChip icon="#ef4444" count={counts.need}     label="Need Water" prev={prev?.need ?? null}     goodWhenUp={false} />
          <HealthChip icon="#f59e0b" count={counts.watching} label="Watching"   prev={prev?.watching ?? null} goodWhenUp={false} />
          <HealthChip icon="#16a34a" count={counts.healthy}  label="Healthy"    prev={prev?.healthy ?? null}  goodWhenUp={true} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: 'var(--bg-sub)', borderRadius: 12, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Droplet color="#0ea5e9" size={22} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700 }}>Avg soil moisture</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0ea5e9', fontFamily: "'Baloo 2', system-ui", lineHeight: 1.1 }}>{gm.avgMoisture}%</div>
              <div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 700 }}>{mDeltaTxt}</div>
            </div>
          </div>
          <div style={{ background: 'var(--bg-sub)', borderRadius: 12, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🌡</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700 }}>Avg soil temp</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', fontFamily: "'Baloo 2', system-ui", lineHeight: 1.1 }}>{gm.avgTemp != null ? `${gm.avgTemp}°C` : '—'}</div>
              {tDeltaTxt && <div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 700 }}>{tDeltaTxt}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Greenhouse Trend */}
      <div className="gm-card" style={{ padding: '14px 12px 16px' }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', padding: '0 2px', marginBottom: 10 }}>Greenhouse Trend</div>
        <div style={{ marginBottom: 10, padding: '0 2px' }}><RangePicker value={range} onChange={(r) => setRange(r as TimeRange)} /></div>
        {s.length < 2 ? (
          <EmptyHint icon="📡" title="No trend data yet" sub="More trends will appear as sensors collect data." />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, margin: '0 4px 8px' }}>
              <LegendDot color="#0ea5e9" label="Avg moisture (%)" />
              {hasTemp && <LegendDot color="#16a34a" label="Avg soil temp (°C)" />}
            </div>
            <LineChart series={series} xLabels={s.map((d) => ({ label: d.label, tick: d.tick }))}
              leftDom={[0, 100]} rightDom={td} height={210} showRightAxis={hasTemp} dots />
            <div style={{ margin: '12px 4px 0' }}>
              <Insight icon="🌿">{ghInsight(delta, counts)}</Insight>
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textAlign: 'right', marginTop: 8, paddingRight: 4 }}>
              {lastTs ? `Updated ${relTime(lastTs, gm.NOW)} · ` : ''}{gm.readingCount.toLocaleString()} readings
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

// ══ ZONES · list → detail ════════════════════════════════════════════════════
export function ZonesView({ gm, range, setRange }: TabProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const items = gm.zoneList();
  const sel = selected ? items.find((it) => it.zone.backendId === selected) : null;

  if (sel) return <ZoneDetail gm={gm} item={sel} range={range} setRange={setRange} onBack={() => setSelected(null)} />;

  return <ZoneList items={items} onPick={(z) => setSelected(z.backendId)} />;
}

function ZoneList({ items, onPick }: { items: ReturnType<GreenhouseModel['zoneList']>; onPick: (z: ZoneLite) => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'need' | 'wet' | 'healthy'>('all');

  const list = items.filter((it) => {
    const q = search.trim().toLowerCase();
    const matchQ = !q || it.zone.label.toLowerCase().includes(q) || (it.cur.plant?.name.toLowerCase().includes(q) ?? false);
    const matchF = filter === 'all' || it.status.kind === filter;
    return matchQ && matchF;
  });

  return (
    <>
      {/* Sticky header — stays put while the list scrolls */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg, #f8f5ef)', padding: '14px 16px 12px', boxShadow: '0 1px 0 var(--line)' }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 18, color: 'var(--ink)', marginBottom: 10 }}>All Zones</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <span style={{ position: 'absolute', top: '50%', left: 13, transform: 'translateY(-50%)', fontSize: 13 }}>🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search zone…"
              style={{ width: '100%', padding: '11px 12px 11px 36px', boxSizing: 'border-box', background: 'var(--card)', border: '1.5px solid var(--line)', borderRadius: 13, fontSize: 12.5, outline: 'none', fontWeight: 600, color: 'var(--ink)', fontFamily: 'inherit' }} />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
            style={{ flexShrink: 0, border: '1.5px solid var(--line)', borderRadius: 13, background: 'var(--card)', padding: '0 10px', fontSize: 12.5, fontWeight: 800, color: 'var(--ink-2)', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="all">All</option>
            <option value="need">Needs water</option>
            <option value="wet">Too wet</option>
            <option value="healthy">Healthy</option>
          </select>
        </div>
      </div>

      <div style={{ padding: '12px 16px 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.length === 0 ? (
          <EmptyHint icon="🗺️" title="No zones found" sub="Try a different search or filter." />
        ) : list.map(({ zone, cur, status, trend }) => (
          <div key={zone.backendId} onClick={() => onPick(zone)} className="gm-card"
            style={{ padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: status.color + '18', display: 'grid', placeItems: 'center', fontSize: 21, flexShrink: 0 }}>
              {cur.plant?.icon ?? '🌱'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur.plant?.name ?? 'Empty'}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 96 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: status.color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>{cur.moisture}%</div>
              <StatusPill status={status} />
              <TrendText trend={trend} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function BackLink({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 800, fontSize: 13, fontFamily: 'inherit' }}>
      ‹ {label}
    </button>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-sub)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: color ?? 'var(--ink)', fontFamily: "'Baloo 2', system-ui", marginTop: 3 }}>{value}</div>
    </div>
  );
}

function StatRow({ icon, label, value, color, last }: { icon: string; label: string; value: string; color?: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: color ?? 'var(--ink)' }}>{value}</span>
    </div>
  );
}

function ZoneDetail({ gm, item, range, setRange, onBack }: {
  gm: GreenhouseModel; item: ReturnType<GreenhouseModel['zoneList']>[number]; range: TimeRange; setRange: (r: TimeRange) => void; onBack: () => void;
}) {
  const { zone, cur, status, trend } = item;
  const s = useMemo(() => gm.genZoneSeries(zone, range), [gm, zone, range]);
  const stats = gm.zoneDetailStats(zone, range);
  const hasChart = s.length >= 2;
  const plant = cur.plant;

  const series: ChartSeries[] = [{ key: 'm', name: 'Soil moisture', color: '#0ea5e9', axis: 'L', data: s.map((d) => ({ value: d.moisture, label: d.label })) }];
  const bands = plant ? [{ from: plant.moistureMin, to: plant.moistureMax, color: '#16a34a' }] : [];

  const insight = trend.dir === 'down' ? `This bed has been drying over the ${RANGE_WORD[range]}.`
    : trend.dir === 'up' ? `This bed has been getting wetter over the ${RANGE_WORD[range]}.`
    : `This bed has stayed steady over the ${RANGE_WORD[range]}.`;

  const rate = stats.ratePerHour;
  const rateLabel = rate == null ? 'Change rate' : rate < 0 ? 'Drying rate' : rate > 0 ? 'Wetting rate' : 'Change rate';

  return (
    <Page>
      <BackLink label="All zones" onBack={onBack} />

      {/* Header + key stats */}
      <div className="gm-card" style={{ padding: '14px 14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: status.color + '18', display: 'grid', placeItems: 'center', fontSize: 23, flexShrink: 0 }}>{plant?.icon ?? '🌱'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 19, color: 'var(--ink)', lineHeight: 1.1 }}>{zone.label}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{plant?.name ?? 'No plant assigned'}</div>
          </div>
          <StatusPill status={status} big />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Tile label="Current moisture" value={`${cur.moisture}%`} color={status.color} />
          <Tile label="Target range" value={plant ? `${plant.moistureMin}–${plant.moistureMax}%` : '—'} />
          <Tile label="Soil temp" value={cur.temp != null ? `${cur.temp}°C` : '—'} />
        </div>
      </div>

      {/* Moisture chart */}
      <div className="gm-card" style={{ padding: '14px 12px 16px' }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 15.5, color: 'var(--ink)', padding: '0 2px', marginBottom: 10 }}>Moisture over time</div>
        <div style={{ marginBottom: 10, padding: '0 2px' }}><RangePicker value={range} onChange={(r) => setRange(r as TimeRange)} /></div>
        {hasChart ? (
          <>
            <LineChart series={series} xLabels={s.map((d) => ({ label: d.label, tick: d.tick }))}
              leftDom={[0, 100]} rightDom={[0, 100]} bands={bands} height={205} showRightAxis={false} dots />
            <div style={{ display: 'flex', gap: 16, margin: '10px 4px 0', flexWrap: 'wrap' }}>
              <LegendDot color="#0ea5e9" label="Soil moisture (%)" />
              {plant && <LegendDot color="#16a34a" label={`Target range (${plant.moistureMin}–${plant.moistureMax}%)`} dashed />}
            </div>
          </>
        ) : (
          <div style={{ padding: '14px 0' }}>
            <EmptyHint icon="🌱" title="No trend data yet" sub="We need more sensor readings to show trends for this zone." />
            <button onClick={onBack} style={{ width: '100%', marginTop: 12, padding: '13px', borderRadius: 999, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>View zone list</button>
          </div>
        )}
      </div>

      {hasChart && (
        <>
          <Insight icon="🌿">{insight}</Insight>
          <div className="gm-card" style={{ padding: '4px 14px' }}>
            <StatRow icon="📈" label={`Trend (${RANGE_SHORT[range]})`} value={`${stats.trendPct > 0 ? '↑ ' : stats.trendPct < 0 ? '↓ ' : ''}${Math.abs(stats.trendPct)}%`} color={stats.trendPct < 0 ? '#ef4444' : stats.trendPct > 0 ? '#0ea5e9' : 'var(--ink)'} />
            {rate != null && <StatRow icon="💧" label={rateLabel} value={`${Math.abs(rate)}% per hour`} />}
            <StatRow icon="🕒" label="Last watered" value={cur.lastWater ? relTime(cur.lastWater, gm.NOW) : 'No record'} />
            <StatRow icon="📊" label="Readings" value={`${stats.readingCount.toLocaleString()} readings`} last />
          </div>
        </>
      )}
    </Page>
  );
}

// ══ PLANTS · list → detail ═══════════════════════════════════════════════════
export function PlantsView({ gm, range, setRange }: TabProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const items = gm.plantList();
  const sel = selected ? items.find((it) => it.plant.id === selected) : null;

  if (items.length === 0) {
    return <Page><EmptyHint icon="🌿" title="No plants assigned" sub="Assign plant profiles to zones in the Map tab." /></Page>;
  }
  if (sel) return <PlantDetail gm={gm} item={sel} range={range} setRange={setRange} onBack={() => setSelected(null)} />;

  return (
    <Page>
      <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 18, color: 'var(--ink)', padding: '0 2px' }}>Plant Groups</div>
      {items.map(({ plant, agg, status, trend }) => (
        <div key={plant.id} onClick={() => setSelected(plant.id)} className="gm-card"
          style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>{plant.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', fontFamily: "'Baloo 2', system-ui" }}>{plant.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{agg.count} zone{agg.count !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: status.color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>{agg.moisture}%</div>
            <StatusPill status={status} />
            <TrendText trend={trend} suffix={trend.dir === 'flat' ? ' this week' : ''} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, textAlign: 'center', padding: '4px 0 2px' }}>Tap a plant to see its trend over time.</div>
    </Page>
  );
}

function plantInsight(name: string, status: SimpleStatus, trend: Trend): string {
  if (status.kind === 'need') return `${name} are running dry — several zones need water.`;
  if (status.kind === 'wet')  return `${name} are looking a little too wet right now.`;
  if (trend.dir === 'down')   return `${name} are slowly drying out — keep an eye on them.`;
  if (trend.dir === 'up')     return `${name} are bouncing back nicely.`;
  return `${name} are mostly stable this week. Keep up the good watering routine!`;
}

function PlantDetail({ gm, item, range, setRange, onBack }: {
  gm: GreenhouseModel; item: ReturnType<GreenhouseModel['plantList']>[number]; range: TimeRange; setRange: (r: TimeRange) => void; onBack: () => void;
}) {
  const { plant, agg, status, trend } = item;
  const s = useMemo(() => gm.genPlantSeries(plant.id, range), [gm, plant.id, range]);
  const hasChart = s.length >= 2;
  const series: ChartSeries[] = [{ key: 'm', name: 'Avg moisture', color: '#0ea5e9', axis: 'L', data: s.map((d) => ({ value: d.moisture, label: d.label })) }];

  return (
    <Page>
      <BackLink label="All plants" onBack={onBack} />

      <div className="gm-card" style={{ padding: '14px 14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 23, flexShrink: 0 }}>{plant.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 19, color: 'var(--ink)', lineHeight: 1.1 }}>{plant.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
              {agg.count} zone{agg.count !== 1 ? 's' : ''} · target {plant.moistureMin}–{plant.moistureMax}%
            </div>
            <div style={{ marginTop: 4 }}><TrendText trend={trend} suffix={trend.dir === 'flat' ? ' this week' : ''} /></div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 25, fontWeight: 800, color: status.color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>{agg.moisture}%</div>
            <div style={{ marginTop: 4 }}><StatusPill status={status} /></div>
          </div>
        </div>
      </div>

      <div className="gm-card" style={{ padding: '14px 12px 16px' }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 15.5, color: 'var(--ink)', padding: '0 2px', marginBottom: 10 }}>Average moisture over time</div>
        <div style={{ marginBottom: 10, padding: '0 2px' }}><RangePicker value={range} onChange={(r) => setRange(r as TimeRange)} /></div>
        {hasChart ? (
          <>
            <LineChart series={series} xLabels={s.map((d) => ({ label: d.label, tick: d.tick }))}
              leftDom={[0, 100]} rightDom={[0, 100]} height={205} showRightAxis={false} dots />
            <div style={{ display: 'flex', gap: 16, margin: '10px 4px 0' }}>
              <LegendDot color="#0ea5e9" label="Average moisture (%)" />
            </div>
          </>
        ) : (
          <EmptyHint icon="🌱" title="No trend data yet" sub="More trends will appear as sensors collect data." />
        )}
      </div>

      {hasChart && <Insight icon="🌿">{plantInsight(plant.name, status, trend)}</Insight>}
    </Page>
  );
}

// ══ WATERING · did watering help? ════════════════════════════════════════════
export function WateringView({ gm }: { gm: GreenhouseModel }) {
  const week = gm.waterThisWeek();
  const results = gm.waterResults(6);
  const weekly = useMemo(() => gm.buildWeekly(8), [gm]);

  if (gm.WATERING.length === 0) {
    return <Page><EmptyHint icon="💧" title="No watering yet" sub="Water zones from Today's Tasks or the Map tab to build your watering history." /></Page>;
  }

  return (
    <Page>
      {/* This week summary */}
      <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 18, color: 'var(--ink)', padding: '0 2px' }}>This Week</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { icon: '💧', v: String(week.count), l: 'Waterings', c: '#0ea5e9' },
          { icon: '🚰', v: week.totalMl > 0 ? `${(week.totalMl / 1000).toFixed(1)} L` : '—', l: 'Total water', c: '#0ea5e9' },
          { icon: '🌿', v: String(week.zones), l: 'Zones watered', c: '#16a34a' },
        ].map((t) => (
          <div key={t.l} className="gm-card" style={{ padding: '13px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{t.icon}</div>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 19, fontWeight: 800, color: t.c }}>{t.v}</div>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ink-3)', marginTop: 2 }}>{t.l}</div>
          </div>
        ))}
      </div>

      {/* Did watering help? */}
      <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 16, color: 'var(--ink)', padding: '4px 2px 0' }}>Did watering help?</div>
      {results.length === 0 ? (
        <div className="gm-card" style={{ padding: '14px 16px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 15 }}>📡</span>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Before/after results will appear here once sensors record moisture around your watering times.
          </div>
        </div>
      ) : results.map((r) => (
        <div key={r.id} className="gm-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: '#e0f2fe', display: 'grid', placeItems: 'center', fontSize: 17, flexShrink: 0 }}>💧</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>
              {r.zoneLabel}{r.plantName && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {r.plantName}</span>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{relTime(r.t, gm.NOW)}</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>
              <span style={{ color: 'var(--ink-3)' }}>{r.before}%</span>
              <span style={{ color: 'var(--ink-3)', margin: '0 5px' }}>→</span>
              <span style={{ color: r.result.color }}>{r.after}%</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            {r.amountMl > 0 && <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0ea5e9' }}>{(r.amountMl / 1000).toFixed(1)} L</div>}
            <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 8, background: r.result.color + '20', color: r.result.color, whiteSpace: 'nowrap' }}>{r.result.label}</span>
          </div>
        </div>
      ))}

      {/* Simple watering trends */}
      {weekly.some((w) => w.n > 0) && (
        <>
          <SectionCard title="Waterings per week" pad="14px 14px 14px">
            <BarsChart data={weekly} valueKey="n" unit="" color="#0ea5e9" height={150} highlightLast />
          </SectionCard>
          <SectionCard title="Water used per week" pad="14px 14px 14px">
            <BarsChart data={weekly.map((w) => ({ ...w, liters: Math.round(w.ml / 100) / 10 }))} valueKey="liters" unit="L" color="#16a34a" height={150} highlightLast />
          </SectionCard>
        </>
      )}

      <Insight icon="🌿">Consistent watering keeps your plants happy and healthy! 🌿</Insight>
    </Page>
  );
}
