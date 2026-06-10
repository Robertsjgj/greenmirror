/* ──────────────────────────────────────────────────────────────────────────
   TrendsViews.tsx — the five Trends tabs, faithful to the prototype design.
   Zones = Spotlight (C), Plants = Spotlight (C), Watering = Combined (C),
   plus Overview and Research. Driven by the real-data model.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react';
import {
  LineChart, Heatmap, BarsChart, RangePicker, MetricToggle, LegendDot,
  Insight, EmptyHint, SectionCard, ZoneRow, StatTile, tempDomain,
} from './TrendsCharts';
import type { ChartSeries } from './TrendsCharts';
import { moistureStatus, relTime } from './trendsModel';
import type { GreenhouseModel, PlantLite, SeriesPoint, CurrentReading } from './trendsModel';
import type { TimeRange } from '../../hooks/useReadingsHistory';

interface TabProps {
  gm: GreenhouseModel;
  range: TimeRange;
  setRange: (r: TimeRange) => void;
  metric: string;
  setMetric: (m: string) => void;
}

const r1diff = (s: SeriesPoint[]) => s.length < 2 ? 0 : Math.round((s[s.length - 1].moisture - s[0].moisture) * 10) / 10;

// ══ OVERVIEW ════════════════════════════════════════════════════════════════
export function OverviewView({ gm, range, setRange }: TabProps) {
  const s = useMemo(() => gm.genGreenhouseSeries(range), [gm, range]);

  let crit = 0, watch = 0, good = 0, ms = 0, ts = 0, tCount = 0;
  gm.ZONES.forEach((z) => {
    const c = gm.currentReading(z), st = moistureStatus(c.moisture, c.plant);
    if (st.tone === 'crit') crit++; else if (st.tone === 'dry' || st.tone === 'wet') watch++; else good++;
    ms += c.moisture;
    if (c.temp != null) { ts += c.temp; tCount++; }
  });
  const nZ = gm.ZONES.length;
  const avgM = nZ ? Math.round(ms / nZ) : 0;
  const avgT = tCount ? Math.round(ts / tCount * 10) / 10 : null;

  const hasTemp = s.some((d) => d.temp != null);
  const td = tempDomain([s]);
  const series: ChartSeries[] = [
    { key: 'm', name: 'Avg moisture', color: '#0ea5e9', axis: 'L', data: s.map((d) => ({ value: d.moisture, label: d.label })) },
  ];
  if (hasTemp) series.push({ key: 't', name: 'Avg soil temp', color: '#16a34a', dashed: true, width: 1.8, axis: 'R', data: s.map((d) => ({ value: d.temp ?? 0, label: d.label })) });

  const chips: [string, number, string][] = [['Critical', crit, '#ef4444'], ['Watching', watch, '#f59e0b'], ['Healthy', good, '#16a34a']];

  return (
    <>
      <SectionCard title="Greenhouse health" pad="14px 14px 14px">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {chips.map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--bg-sub)', borderRadius: 12 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: c, fontFamily: "'Baloo 2', system-ui" }}>{v}</div>
              <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700, marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', background: 'var(--bg-sub)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700 }}>💧 Avg moisture</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#0ea5e9', fontFamily: "'Baloo 2', system-ui" }}>{avgM}%</div>
          </div>
          {avgT != null && <>
            <div style={{ width: 1, background: 'var(--line)', margin: '8px 0' }} />
            <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 700 }}>🌡 Avg soil temp</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#16a34a', fontFamily: "'Baloo 2', system-ui" }}>{avgT}°C</div>
            </div>
          </>}
        </div>
      </SectionCard>

      <SectionCard title="Greenhouse conditions" pad="14px 12px 16px">
        <div style={{ marginBottom: 10 }}><RangePicker value={range} onChange={(r) => setRange(r as TimeRange)} /></div>
        {s.length < 2 ? (
          <EmptyHint icon="📡" title="No history yet" sub="More trends will appear as sensors collect data." />
        ) : (
          <>
            <LineChart series={series} xLabels={s.map((d) => ({ label: d.label, tick: d.tick }))} leftDom={[0, 100]} rightDom={td} height={210} showRightAxis={hasTemp} />
            <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
              <LegendDot color="#0ea5e9" label="Avg moisture" />
              {hasTemp && <LegendDot color="#16a34a" label="Avg soil temp" dashed />}
            </div>
          </>
        )}
      </SectionCard>

      <Insight icon="💡">Open the <b>Zones</b> tab to break this down per zone, or <b>Plants</b> to compare crop types.</Insight>
    </>
  );
}

// ══ ZONES · Spotlight ════════════════════════════════════════════════════════
export function ZonesView({ gm, range, setRange, metric, setMetric }: TabProps) {
  const curById = useMemo(() => {
    const m: Record<string, CurrentReading> = {};
    gm.ZONES.forEach((z) => { m[z.backendId] = gm.currentReading(z); });
    return m;
  }, [gm]);

  const [spotZone, setSpotZone] = useState<string | null>(null);
  const [ghostZones, setGhostZones] = useState<string[]>([]);

  if (gm.ZONES.length === 0) {
    return <EmptyHint icon="🗺️" title="No zones with data" sub="More trends will appear as sensors collect data." />;
  }

  const z = gm.ZONE_BY_ID[spotZone ?? ''] ?? gm.ZONES[0];
  const cur = curById[z.backendId];
  const st2 = moistureStatus(cur.moisture, cur.plant);
  const s = gm.genZoneSeries(z, range);
  const delta = r1diff(s);
  const ghosts = ghostZones.filter((g) => g !== z.backendId).slice(0, 2);
  const allRows = [s, ...ghosts.map((g) => gm.genZoneSeries(gm.ZONE_BY_ID[g], range))];
  const td = tempDomain(allRows);

  const series: ChartSeries[] = [];
  const main = { key: 'main', name: z.label, color: st2.color, axis: 'L' as const };
  if (metric === 'temp') series.push({ ...main, data: s.map((d) => ({ value: d.temp ?? 0, label: d.label })) });
  else series.push({ ...main, data: s.map((d) => ({ value: d.moisture, label: d.label })) });
  if (metric === 'both') series.push({ key: 'maint', name: z.label + ' temp', color: st2.color, dashed: true, width: 1.8, axis: 'R', data: s.map((d) => ({ value: d.temp ?? 0, label: d.label })) });
  ghosts.forEach((g, i) => {
    const gs = gm.genZoneSeries(gm.ZONE_BY_ID[g], range);
    const c = gm.SERIES_COLORS[(i + 3) % gm.SERIES_COLORS.length];
    series.push({ key: 'g' + g, name: gm.ZONE_BY_ID[g].label, color: c, faint: true, width: 1.8, axis: 'L', data: gs.map((d) => ({ value: metric === 'temp' ? (d.temp ?? 0) : d.moisture, label: d.label })) });
  });
  const bands = (cur.plant && metric !== 'temp') ? [{ from: cur.plant.moistureMin, to: cur.plant.moistureMax, color: '#16a34a' }] : [];
  const leftDom: [number, number] = metric === 'temp' ? td : [0, 100];

  const ranked = gm.ZONES.map((zz) => ({ zz, cur: curById[zz.backendId] }))
    .sort((a, b) => a.cur.moisture - b.cur.moisture);

  const toggleGhost = (id: string) => setGhostZones(ghostZones.includes(id) ? ghostZones.filter((x) => x !== id) : [...ghostZones, id].slice(-2));

  return (
    <>
      <div className="gm-card" style={{ padding: '14px 14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: st2.color + '18', display: 'grid', placeItems: 'center', fontSize: 22 }}>{cur.plant ? cur.plant.icon : '🌱'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>{z.label}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{cur.plant ? `${cur.plant.name} · target ${cur.plant.moistureMin}–${cur.plant.moistureMax}%` : 'No plant assigned'}{cur.lastWater ? ` · watered ${relTime(cur.lastWater, gm.NOW)}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: st2.color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>{cur.moisture}%</div>
            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 5, background: st2.color + '20', color: st2.color }}>{st2.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <RangePicker value={range} onChange={(r) => setRange(r as TimeRange)} />
          <MetricToggle value={metric} onChange={setMetric} />
        </div>
        {s.length < 2 ? (
          <EmptyHint icon="📡" title="No history yet" sub="More trends will appear as sensors collect data." />
        ) : (
          <>
            <LineChart series={series} xLabels={s.map((d) => ({ label: d.label, tick: d.tick }))} leftDom={leftDom} rightDom={td}
              leftUnit={metric === 'temp' ? '°' : '%'} bands={bands} height={210} showRightAxis={metric === 'both'} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 10 }}>
              <LegendDot color={st2.color} label={z.label} />
              {metric === 'both' && <LegendDot color={st2.color} label="temp" dashed />}
              {ghosts.map((g, i) => <LegendDot key={g} color={gm.SERIES_COLORS[(i + 3) % gm.SERIES_COLORS.length]} label={gm.ZONE_BY_ID[g].label} />)}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <StatTile label={range === '24h' ? 'Change · 24h' : 'Change'} value={(delta >= 0 ? '+' : '') + delta + '%'} color={delta < 0 ? '#ef4444' : '#16a34a'} />
          <StatTile label="Soil temp" value={cur.temp != null ? cur.temp + '°C' : '—'} color="#16a34a" />
          <StatTile label="Last water" value={cur.lastWater ? relTime(cur.lastWater, gm.NOW) : '—'} color="#0ea5e9" />
        </div>
      </div>

      {gm.ZONES.length > 1 && (
        <SectionCard title="Compare with" pad="14px 14px 12px">
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 9 }}>Add up to 2 zones as faint comparison lines.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {gm.ZONES.filter((zz) => zz.backendId !== z.backendId).map((zz) => {
              const on = ghostZones.includes(zz.backendId);
              return <button key={zz.backendId} onClick={() => toggleGhost(zz.backendId)} style={{
                padding: '5px 10px', borderRadius: 999, border: '1.5px solid', fontSize: 10.5, fontWeight: 800, cursor: 'pointer',
                borderColor: on ? 'var(--ink)' : 'var(--line)', background: on ? 'var(--ink)' : 'var(--card)', color: on ? '#fff' : 'var(--ink-2)',
              }}>{zz.label}</button>;
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="All zones · driest first" pad="6px 14px 4px">
        {ranked.map(({ zz, cur: c }, i) => (
          <div key={zz.backendId} style={{ borderBottom: i < ranked.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <ZoneRow zone={zz} cur={c} selected={zz.backendId === z.backendId} color="var(--ink)" rank={i + 1}
              onClick={() => setSpotZone(zz.backendId)} />
          </div>
        ))}
      </SectionCard>
    </>
  );
}

// ══ PLANTS · Spotlight ═══════════════════════════════════════════════════════
interface PlantAgg { count: number; moisture: number; temp: number | null; need: number; wet: number; good: number; }

function plantAgg(gm: GreenhouseModel, plant: PlantLite): PlantAgg {
  const members = gm.ZONES.filter((z) => z.plantId === plant.id);
  let ms = 0, ts = 0, tc = 0, need = 0, wet = 0, good = 0, n = 0;
  members.forEach((z) => {
    const c = gm.currentReading(z); ms += c.moisture; n++;
    if (c.temp != null) { ts += c.temp; tc++; }
    if (c.moisture < plant.moistureMin) need++; else if (c.moisture > plant.moistureMax) wet++; else good++;
  });
  return { count: members.length, moisture: n ? Math.round(ms / n) : 0, temp: tc ? Math.round(ts / tc * 10) / 10 : null, need, wet, good };
}
function plantStatus(agg: PlantAgg) {
  if (agg.need > 0) return { label: 'Needs water', color: '#f59e0b' };
  if (agg.wet > 0) return { label: 'Too wet', color: '#0ea5e9' };
  return { label: 'Stable', color: '#16a34a' };
}

export function PlantsView({ gm, range, setRange, metric, setMetric }: TabProps) {
  const [spotPlant, setSpotPlant] = useState<string | null>(null);

  if (gm.PLANTS.length === 0) {
    return <EmptyHint icon="🌿" title="No plants assigned" sub="Assign plant profiles to zones in the Map tab." />;
  }

  const p = gm.PLANT_BY_ID[spotPlant ?? ''] ?? gm.PLANTS[0];
  const agg = plantAgg(gm, p), ps = plantStatus(agg);
  const s = gm.genPlantSeries(p.id, range);
  const td = tempDomain([s]);
  const members = gm.ZONES.filter((z) => z.plantId === p.id);

  const series: ChartSeries[] = [];
  if (metric === 'temp') series.push({ key: 'm', name: p.name, color: ps.color, axis: 'L', data: s.map((d) => ({ value: d.temp ?? 0, label: d.label })) });
  else series.push({ key: 'm', name: p.name, color: ps.color, axis: 'L', data: s.map((d) => ({ value: d.moisture, label: d.label })) });
  if (metric === 'both') series.push({ key: 't', name: p.name + ' temp', color: ps.color, dashed: true, width: 1.8, axis: 'R', data: s.map((d) => ({ value: d.temp ?? 0, label: d.label })) });
  const bands = metric !== 'temp' ? [{ from: p.moistureMin, to: p.moistureMax, color: '#16a34a' }] : [];

  return (
    <>
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
        {gm.PLANTS.map((pp) => {
          const on = pp.id === p.id;
          return <button key={pp.id} onClick={() => setSpotPlant(pp.id)} style={{
            flexShrink: 0, padding: '7px 13px', borderRadius: 999, border: '1.5px solid', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            borderColor: on ? 'var(--primary)' : 'var(--line)', background: on ? 'var(--primary)' : 'var(--card)', color: on ? '#fff' : 'var(--ink-2)',
          }}>{pp.icon} {pp.name}</button>;
        })}
      </div>

      <div className="gm-card" style={{ padding: '14px 14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{p.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 17, color: 'var(--ink)' }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{agg.count} zone{agg.count !== 1 ? 's' : ''} · target {p.moistureMin}–{p.moistureMax}%</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 25, fontWeight: 800, color: ps.color, fontFamily: "'Baloo 2', system-ui", lineHeight: 1 }}>{agg.moisture}%</div>
            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 5, background: ps.color + '20', color: ps.color }}>{ps.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <RangePicker value={range} onChange={(r) => setRange(r as TimeRange)} />
          <MetricToggle value={metric} onChange={setMetric} />
        </div>
        {s.length < 2 ? (
          <EmptyHint icon="📡" title="No history yet" sub="More trends will appear as sensors collect data." />
        ) : (
          <>
            <LineChart series={series} xLabels={s.map((d) => ({ label: d.label, tick: d.tick }))} leftDom={metric === 'temp' ? td : [0, 100]} rightDom={td}
              leftUnit={metric === 'temp' ? '°' : '%'} bands={bands} height={205} showRightAxis={metric === 'both'} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 10 }}>
              <LegendDot color={ps.color} label={p.name} />
              {metric === 'both' && <LegendDot color={ps.color} label="temp" dashed />}
              {bands.length > 0 && <LegendDot color="#16a34a" label={`Target ${p.moistureMin}–${p.moistureMax}%`} />}
            </div>
          </>
        )}
      </div>

      <SectionCard title="Zones growing this" pad="6px 14px 4px">
        {members.map((z, i) => (
          <div key={z.backendId} style={{ borderBottom: i < members.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <ZoneRow zone={z} cur={gm.currentReading(z)} selected={false} color="var(--ink)" onClick={() => {}} />
          </div>
        ))}
      </SectionCard>
    </>
  );
}

// ══ WATERING · Combined ══════════════════════════════════════════════════════
function WaterSummary({ gm }: { gm: GreenhouseModel }) {
  const s = gm.wateringStats();
  const zones = gm.wateringByZone().length;
  const tiles = [
    { v: String(s.total), l: 'WATERINGS' },
    { v: String(zones), l: 'ZONES' },
    { v: s.vol > 0 ? (s.vol / 1000).toFixed(1) + 'L' : '—', l: 'VOLUME' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {tiles.map((t) => (
        <div key={t.l} className="gm-card" style={{ padding: '12px 8px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 21, fontWeight: 800, color: '#0ea5e9' }}>{t.v}</div>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--ink-3)', marginTop: 2, letterSpacing: '.04em' }}>{t.l}</div>
        </div>
      ))}
    </div>
  );
}

function RecentEvents({ gm, n = 6 }: { gm: GreenhouseModel; n?: number }) {
  const evs = gm.WATERING.slice().sort((a, b) => b.t - a.t).slice(0, n);
  return (
    <SectionCard title="Recent events" pad="6px 14px 4px">
      {evs.map((e, i) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < evs.length - 1 ? '1px solid var(--line)' : 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#e0f2fe', display: 'grid', placeItems: 'center', fontSize: 13 }}>💧</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>{e.zoneLabel}{e.plantName && <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}> · {e.plantName}</span>}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{relTime(e.t, gm.NOW)}</div>
          </div>
          {e.amountMl > 0 && <div style={{ fontSize: 12, fontWeight: 800, color: '#0ea5e9' }}>{e.amountMl}ml</div>}
        </div>
      ))}
    </SectionCard>
  );
}

export function WateringView({ gm }: { gm: GreenhouseModel }) {
  const heat = useMemo(() => gm.buildHeatmap(), [gm]);
  const monthly = useMemo(() => gm.buildMonthly(), [gm]);
  const s = useMemo(() => gm.wateringStats(), [gm]);

  if (gm.WATERING.length === 0) {
    return <EmptyHint icon="💧" title="No watering yet" sub="Water zones from Today's Tasks or the Map tab to build your watering history." />;
  }

  const wkDir = s.thisWeek === s.lastWeek ? 'same as' : s.thisWeek > s.lastWeek ? 'up from' : 'down from';
  const wkColor = s.thisWeek >= s.lastWeek ? '#16a34a' : '#f59e0b';

  return (
    <>
      <WaterSummary gm={gm} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="gm-card" style={{ padding: 13 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-3)', letterSpacing: '.04em' }}>YOUR RHYTHM</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0ea5e9', fontFamily: "'Baloo 2', system-ui", marginTop: 4 }}>~{s.avgInterval}d</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', marginTop: 1 }}>between waterings on average</div>
        </div>
        <div className="gm-card" style={{ padding: 13 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-3)', letterSpacing: '.04em' }}>THIS WEEK</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: wkColor, fontFamily: "'Baloo 2', system-ui", marginTop: 4 }}>{s.thisWeek}×</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', marginTop: 1 }}>{wkDir} {s.lastWeek}× last week</div>
        </div>
        <div className="gm-card" style={{ padding: 13 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-3)', letterSpacing: '.04em' }}>BUSIEST MONTH</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b', fontFamily: "'Baloo 2', system-ui", marginTop: 4 }}>{s.mostActive.label}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', marginTop: 1 }}>{s.mostActive.n} waterings</div>
        </div>
        <div className="gm-card" style={{ padding: 13 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-3)', letterSpacing: '.04em' }}>LONGEST BREAK</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", marginTop: 4 }}>{s.longestGap}d</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', marginTop: 1 }}>with no watering</div>
        </div>
      </div>
      <SectionCard title="Watering calendar" pad="14px 14px 12px">
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 10, lineHeight: 1.4 }}>
          Each square is a day. Darker = more water that day. Empty = no watering.
        </div>
        <Heatmap data={heat} />
      </SectionCard>
      <SectionCard title="More water in summer" pad="14px 14px 14px">
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>Waterings per month — see how the season changes your habits.</div>
        <BarsChart data={monthly} valueKey="n" unit="" color="#0ea5e9" height={160} highlightLast />
      </SectionCard>
      <RecentEvents gm={gm} n={6} />
    </>
  );
}

// ══ RESEARCH ═════════════════════════════════════════════════════════════════
export function ResearchView({ gm, range }: { gm: GreenhouseModel; range: TimeRange }) {
  const s = gm.wateringStats();
  const rangeWord: Record<TimeRange, string> = { '24h': 'last 24h', '7d': 'last 7d', '30d': 'last 30d', '3m': 'last 3m', '1y': 'last year' };
  const tiles: [string, string, string][] = [
    ['Readings', gm.readingCount.toLocaleString(), `in ${rangeWord[range]}`],
    ['Waterings', String(s.total), 'logged'],
    ['Plant types', String(gm.PLANTS.length), 'tracked'],
    ['Active zones', String(gm.ZONES.length), 'with readings'],
  ];
  return (
    <>
      <SectionCard title="Dataset metrics" pad="14px 14px 14px">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {tiles.map(([l, v, sub]) => (
            <div key={l} style={{ padding: '10px 12px', background: 'var(--bg-sub)', borderRadius: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', fontFamily: "'Baloo 2', system-ui", marginTop: 2 }}>{v}</div>
              <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 600 }}>{sub}</div>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Export dataset" pad="14px 14px 14px">
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, lineHeight: 1.5, marginBottom: 12 }}>Download greenhouse data as CSV for research or analysis in external tools.</div>
        <button style={{ width: '100%', padding: '13px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--ink-3)', fontWeight: 800, fontSize: 13, opacity: .6 }} disabled>↓ Export readings (coming soon)</button>
      </SectionCard>
    </>
  );
}
