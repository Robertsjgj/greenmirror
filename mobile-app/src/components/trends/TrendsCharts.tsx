/* ──────────────────────────────────────────────────────────────────────────
   TrendsCharts.tsx — SVG charts + shared UI primitives for the Trends redesign.
   Faithful TypeScript port of the prototype's charts.jsx / shared widgets.
   ────────────────────────────────────────────────────────────────────────── */

import { useState, useRef, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { moistureStatus } from './trendsModel';
import type { ZoneLite, CurrentReading, SeriesPoint, HeatmapData, HeatCell } from './trendsModel';

// ── smooth path (Catmull-Rom → cubic bezier) ────────────────────────────────
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

// temp-axis domain from a set of series rows
export function tempDomain(rows: SeriesPoint[][]): [number, number] {
  let lo = Infinity, hi = -Infinity;
  rows.forEach((r) => r.forEach((d) => {
    if (d.temp == null) return;
    lo = Math.min(lo, d.temp); hi = Math.max(hi, d.temp);
  }));
  if (!isFinite(lo)) return [10, 30];
  lo = Math.floor((lo - 1) / 4) * 4; hi = Math.ceil((hi + 1) / 4) * 4;
  if (hi - lo < 8) hi = lo + 8;
  return [Math.max(0, lo), hi];
}

// ── Dual-axis line chart ─────────────────────────────────────────────────────
export interface ChartSeries {
  key: string;
  name?: string;
  color: string;
  dashed?: boolean;
  width?: number;
  axis: 'L' | 'R';
  faint?: boolean;
  data: ChartPoint[];
}
export interface ChartPoint { value: number; t: number; }
export interface AxisTick { t: number; label: string; }
export interface Band { from: number; to: number; color: string; }

export interface LineChartProps {
  series: ChartSeries[];
  xDomain: [number, number];   // [startMs, endMs] of the selected scope
  xTicks: AxisTick[];          // calendar tick marks across that scope
  leftDom: [number, number];
  rightDom: [number, number];
  leftUnit?: string;
  rightUnit?: string;
  bands?: Band[];
  height?: number;
  showRightAxis?: boolean;
  dots?: boolean;
  tipLabel?: (t: number) => string;
}

export function LineChart({
  series, xDomain, xTicks, leftDom, rightDom, leftUnit = '%', rightUnit = '°',
  bands = [], height = 220, showRightAxis = true, dots = false, tipLabel,
}: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const W = 320, H = height;
  const padL = 30, padR = showRightAxis ? 30 : 8, padT = 12, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const span = Math.max(1, xDomain[1] - xDomain[0]);
  // x is positioned by real time within the selected scope window
  const xAt = (t: number) => padL + plotW * Math.min(1, Math.max(0, (t - xDomain[0]) / span));
  const yL = (v: number) => padT + plotH * (1 - (v - leftDom[0]) / (leftDom[1] - leftDom[0]));
  const yR = (v: number) => padT + plotH * (1 - (v - rightDom[0]) / (rightDom[1] - rightDom[0]));

  const ref = series[0]?.data ?? [];
  const n = ref.length;
  const leftTicks = useMemo(() => { const a: number[] = []; for (let k = 0; k <= 4; k++) a.push(leftDom[0] + (leftDom[1] - leftDom[0]) * k / 4); return a; }, [leftDom]);
  const rightTicks = useMemo(() => { const a: number[] = []; for (let k = 0; k <= 4; k++) a.push(rightDom[0] + (rightDom[1] - rightDom[0]) * k / 4); return a; }, [rightDom]);

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    if (!wrapRef.current || n === 0) return;
    const r = wrapRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const px = (clientX - r.left) / r.width * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(xAt(ref[i].t) - px); if (d < bd) { bd = d; best = i; } }
    setHover(best);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', touchAction: 'pan-y' }}
      onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={onMove} onTouchMove={onMove}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
        {bands.map((b, i) => (
          <g key={'b' + i}>
            <rect x={padL} y={yL(b.to)} width={plotW} height={Math.max(0, yL(b.from) - yL(b.to))} fill={b.color} opacity="0.10" />
            <line x1={padL} x2={W - padR} y1={yL(b.to)} y2={yL(b.to)} stroke={b.color} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />
            <line x1={padL} x2={W - padR} y1={yL(b.from)} y2={yL(b.from)} stroke={b.color} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />
          </g>
        ))}
        {leftTicks.map((v, i) => (
          <g key={'lt' + i}>
            <line x1={padL} x2={W - padR} y1={yL(v)} y2={yL(v)} stroke="#e8e4dc" strokeWidth="1" strokeDasharray="3 3" />
            <text x={padL - 5} y={yL(v) + 3} fontSize="8.5" fill="#a8b0ba" fontWeight="700" textAnchor="end">{Math.round(v)}{leftUnit}</text>
          </g>
        ))}
        {showRightAxis && rightTicks.map((v, i) => (
          <text key={'rt' + i} x={W - padR + 4} y={yR(v) + 3} fontSize="8.5" fill="#c0b9a8" fontWeight="700" textAnchor="start">{Math.round(v)}{rightUnit}</text>
        ))}
        {xTicks.map((tk, i) => {
          const x = xAt(tk.t);
          const anchor = i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle';
          return <text key={'x' + i} x={x} y={H - 6} fontSize="8.5" fill="#a8b0ba" fontWeight="700" textAnchor={anchor}>{tk.label}</text>;
        })}
        {series.map((s) => {
          const yf = s.axis === 'R' ? yR : yL;
          const pts = s.data.map((d) => ({ x: xAt(d.t), y: yf(d.value) }));
          return <path key={s.key} d={smoothPath(pts)} fill="none" stroke={s.color} strokeWidth={s.width || 2.4}
            strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '5 4' : undefined} opacity={s.faint ? 0.4 : 1} />;
        })}
        {dots && series.map((s) => s.faint ? null : (
          <g key={'d' + s.key}>
            {s.data.map((d, i) => (
              <circle key={i} cx={xAt(d.t)} cy={(s.axis === 'R' ? yR : yL)(d.value)} r="2.6" fill="#fff" stroke={s.color} strokeWidth="1.8" />
            ))}
          </g>
        ))}
        {hover != null && ref[hover] && (
          <g>
            <line x1={xAt(ref[hover].t)} x2={xAt(ref[hover].t)} y1={padT} y2={H - padB} stroke="#9aa3ad" strokeWidth="1" strokeDasharray="2 2" />
            {series.map((s) => {
              const yf = s.axis === 'R' ? yR : yL;
              const pt = s.data[hover];
              if (!pt) return null;
              return <circle key={'h' + s.key} cx={xAt(pt.t)} cy={yf(pt.value)} r="3.2" fill="#fff" stroke={s.color} strokeWidth="2" />;
            })}
          </g>
        )}
      </svg>
      {hover != null && ref[hover] && (
        <div style={{ position: 'absolute', top: 0, left: `${(xAt(ref[hover].t) / W) * 100}%`, transform: `translateX(${hover > n / 2 ? '-105%' : '5%'})`,
          background: '#fff', border: '1.5px solid var(--line)', borderRadius: 10, padding: '6px 9px', boxShadow: '0 6px 16px rgba(0,0,0,.1)',
          fontSize: 10.5, fontWeight: 800, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5 }}>
          {tipLabel && <div style={{ color: 'var(--ink-3)', fontSize: 9, marginBottom: 3 }}>{tipLabel(ref[hover].t)}</div>}
          {series.map((s) => s.data[hover] ? (
            <div key={'tt' + s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              <span style={{ color: 'var(--ink-2)' }}>{s.name}</span>
              <span style={{ color: s.color, marginLeft: 'auto' }}>{s.data[hover].value}{s.axis === 'R' ? '°' : '%'}</span>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

// ── GitHub-style watering calendar heatmap (blue water scale) ────────────────
const HEAT_COLORS = ['#eef0ee', '#cfe9f8', '#86cdef', '#34a3dd', '#0c7cbf'];
export function Heatmap({ data, onPick, picked }: { data: HeatmapData; onPick?: (c: HeatCell) => void; picked?: number | null }) {
  const cell = 11, gap = 2.5;
  const wd = ['', 'M', '', 'W', '', 'F', ''];
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', marginLeft: 16 }}>
          {data.weeks.map((_, wi) => (
            <div key={wi} style={{ width: cell + gap, fontSize: 7.5, color: 'var(--ink-3)', fontWeight: 700, textAlign: 'left' }}>
              {data.monthCols[wi]}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 16 }}>
            {wd.map((d, i) => <div key={i} style={{ height: cell + gap, fontSize: 7, color: 'var(--ink-3)', fontWeight: 700, lineHeight: `${cell}px` }}>{d}</div>)}
          </div>
          <div style={{ display: 'flex', gap }}>
            {data.weeks.map((col, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap }}>
                {col.map((c, di) => {
                  if (c.future) return <div key={di} style={{ width: cell, height: cell }} />;
                  const sel = picked === c.t;
                  return <div key={di} onClick={() => onPick && onPick(c)} title={`${c.date}: ${c.ml ? c.ml + 'ml · ' + c.n + '×' : 'no watering'}`}
                    style={{ width: cell, height: cell, borderRadius: 2.5, background: HEAT_COLORS[c.level], cursor: c.ml ? 'pointer' : 'default',
                      outline: sel ? '2px solid var(--ink)' : 'none', outlineOffset: 1 }} />;
                })}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 16, marginTop: 2, fontSize: 8, color: 'var(--ink-3)', fontWeight: 700 }}>
          <span>Less</span>
          {HEAT_COLORS.map((c, i) => <span key={i} style={{ width: cell, height: cell, borderRadius: 2.5, background: c, display: 'inline-block' }} />)}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

// ── Vertical bars ────────────────────────────────────────────────────────────
export interface BarDatum { label: string; [key: string]: number | string; }
export function BarsChart({ data, valueKey, color = '#0ea5e9', unit = 'ml', height = 170, highlightLast }: {
  data: BarDatum[]; valueKey: string; color?: string; unit?: string; height?: number; highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = height, padL = 30, padR = 6, padT = 10, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const val = (d: BarDatum) => Number(d[valueKey]) || 0;
  const max = Math.max(1, ...data.map(val));
  const bw = Math.min(22, (plotW / Math.max(1, data.length)) * 0.62);
  const step = plotW / Math.max(1, data.length);
  const ticks = [0, max / 2, max];
  const lbl = (d: BarDatum) => String(d.label ?? '');
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={padT + plotH * (1 - v / max)} y2={padT + plotH * (1 - v / max)} stroke="#e8e4dc" strokeDasharray="3 3" />
            <text x={padL - 5} y={padT + plotH * (1 - v / max) + 3} fontSize="8.5" fill="#a8b0ba" fontWeight="700" textAnchor="end">{Math.round(v)}{unit === 'ml' && v >= 1000 ? '' : unit}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = plotH * (val(d) / max);
          const x = padL + step * i + (step - bw) / 2;
          const last = highlightLast && i === data.length - 1;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + step * i} y={padT} width={step} height={plotH} fill="transparent" />
              <rect x={x} y={padT + plotH - h} width={bw} height={Math.max(0, h)} rx="4"
                fill={color} opacity={hover === null ? (last ? 1 : 0.82) : hover === i ? 1 : 0.5} />
              {(i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) &&
                <text x={padL + step * i + step / 2} y={H - 6} fontSize="8" fill="#a8b0ba" fontWeight="700" textAnchor="middle">{lbl(d)}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && (
        <div style={{ position: 'absolute', top: 2, left: `${((padL + step * hover + step / 2) / W) * 100}%`, transform: 'translateX(-50%)',
          background: '#fff', border: '1.5px solid var(--line)', borderRadius: 9, padding: '4px 8px', fontSize: 10, fontWeight: 800,
          boxShadow: '0 4px 12px rgba(0,0,0,.1)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          <span style={{ color: 'var(--ink-3)' }}>{lbl(data[hover])} · </span>
          <span style={{ color }}>{val(data[hover])}{unit}</span>
        </div>
      )}
    </div>
  );
}

// ── Shared small UI ──────────────────────────────────────────────────────────
export function RangePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts: [string, string][] = [['24h', '24h'], ['7d', '7D'], ['30d', '30D'], ['3m', '3M'], ['1y', '1Y']];
  return (
    <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none' }}>
      {opts.map(([id, lbl]) => (
        <button key={id} onClick={() => onChange(id)} style={{
          flexShrink: 0, padding: '5px 12px', borderRadius: 9, border: '1.5px solid',
          borderColor: value === id ? 'var(--primary)' : 'var(--line)',
          background: value === id ? 'var(--primary-soft)' : 'transparent',
          color: value === id ? 'var(--primary)' : 'var(--ink-3)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
        }}>{lbl}</button>
      ))}
    </div>
  );
}

export function MetricToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts: [string, string][] = [['moist', '💧 Moisture'], ['temp', '🌡 Temp'], ['both', 'Both']];
  return (
    <div style={{ display: 'inline-flex', padding: 3, background: 'var(--card-sub)', borderRadius: 999 }}>
      {opts.map(([id, lbl]) => (
        <button key={id} onClick={() => onChange(id)} style={{
          padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 800, border: 'none', cursor: 'pointer',
          background: value === id ? 'var(--card)' : 'transparent', color: value === id ? 'var(--ink)' : 'var(--ink-3)',
          boxShadow: value === id ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
        }}>{lbl}</button>
      ))}
    </div>
  );
}

export function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {dashed
        ? <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2.4" strokeDasharray="4 2" /></svg>
        : <span style={{ width: 16, height: 3, borderRadius: 2, background: color, display: 'inline-block' }} />}
      <span style={{ fontSize: 10.5, color: 'var(--ink-2)', fontWeight: 700 }}>{label}</span>
    </div>
  );
}

export function MoistureBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

export function Insight({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="gm-card" style={{ padding: '12px 14px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function ChartLoading({ height = 205 }: { height?: number }) {
  return (
    <div style={{ height, display: 'grid', placeItems: 'center', gap: 10 }}>
      <svg width="30" height="30" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>Loading…</div>
    </div>
  );
}

export function EmptyHint({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="gm-card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 600, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

export function SectionCard({ title, right, children, pad = 14 }: {
  title?: string; right?: ReactNode; children: ReactNode; pad?: number | string;
}) {
  return (
    <div className="gm-card" style={{ padding: pad }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
          {title && <div style={{ fontFamily: "'Baloo 2', system-ui", fontWeight: 800, fontSize: 15.5, color: 'var(--ink)' }}>{title}</div>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// Selectable zone row (used by Zones spotlight ranked list + Plants member list)
export function ZoneRow({ zone, cur, color, selected, dimmed, onClick, rank }: {
  zone: ZoneLite; cur: CurrentReading; color?: string | null; selected?: boolean; dimmed?: boolean; onClick?: () => void; rank?: number | string;
}) {
  const st = moistureStatus(cur.moisture, cur.plant);
  return (
    <div onClick={dimmed ? undefined : onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', cursor: dimmed ? 'default' : 'pointer',
      opacity: dimmed ? 0.4 : 1,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center',
        border: '2px solid', borderColor: selected ? (color || 'var(--primary)') : 'var(--line-2)',
        background: selected ? (color || 'var(--primary)') : 'transparent', color: '#fff', fontSize: 12, fontWeight: 900,
      }}>{selected ? '✓' : (rank || '')}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{zone.label}</div>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>
          {cur.plant ? `${cur.plant.icon} ${cur.plant.name} · ${cur.plant.moistureMin}–${cur.plant.moistureMax}%` : 'No plant assigned'}
        </div>
        <div style={{ marginTop: 5 }}><MoistureBar value={cur.moisture} color={st.color} /></div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 58 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: st.color, fontFamily: "'Baloo 2', system-ui" }}>{cur.moisture}%</div>
        <span style={{ fontSize: 8.5, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: st.color + '20', color: st.color, whiteSpace: 'nowrap', display: 'inline-block' }}>{st.label}</span>
        {cur.temp != null && <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700, marginTop: 2 }}>{cur.temp}°C</div>}
      </div>
    </div>
  );
}

export function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-sub)', borderRadius: 11, padding: '9px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color, fontFamily: "'Baloo 2', system-ui" }}>{value}</div>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
}

export type { CSSProperties };
