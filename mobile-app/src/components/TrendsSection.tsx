import { useState } from 'react';
import {
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useReadingsHistory, TIME_RANGE_LABELS } from '../hooks/useReadingsHistory';
import type { TimeRange } from '../hooks/useReadingsHistory';

interface TrendsSectionProps {
  greenhouseId: string;
}

// Static hex colours — CSS custom properties don't reliably resolve inside SVG fill/stroke
const MOISTURE_COLOR = '#0ea5e9'; // sky-500 (matches --wet palette)
const TEMP_COLOR     = '#f59e0b'; // amber-400

const RANGES: TimeRange[] = ['24h', '7d', '30d'];

export function TrendsSection({ greenhouseId }: TrendsSectionProps) {
  const [range, setRange] = useState<TimeRange>('24h');
  const { trendData, loading } = useReadingsHistory(greenhouseId, range);

  const totalSamples = trendData.reduce((s, p) => s + p.sampleCount, 0);
  const bucketNoun   = range === '24h' ? 'hr' : 'day';

  return (
    <div>
      <div style={{
        padding: '0 2px 10px',
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', gap: 8,
      }}>
        <div>
          <h2 className="gm-h2">Sensor Trends 📈</h2>
          <div className="gm-sub">Soil moisture and temperature over time</div>
        </div>

        {/* Range picker */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '5px 10px',
                borderRadius: 10,
                border: '1.5px solid',
                borderColor: range === r ? 'var(--primary)' : 'var(--line)',
                background: range === r ? 'var(--primary-soft)' : 'transparent',
                color: range === r ? 'var(--primary)' : 'var(--ink-3)',
                fontSize: 12,
                fontWeight: 800,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="gm-card" style={{ padding: 26, textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 24 }}>⏳</div>
          <div style={{ fontSize: 13, marginTop: 6, fontWeight: 600 }}>Loading trends…</div>
        </div>
      ) : trendData.length === 0 ? (
        <div className="gm-card" style={{ padding: 26, textAlign: 'center', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
          <div style={{ fontWeight: 800, color: 'var(--ink-2)', fontFamily: "'Baloo 2', system-ui", fontSize: 15 }}>
            No data for {TIME_RANGE_LABELS[range]}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>
            Readings appear once your greenhouse is sending data.
          </div>
        </div>
      ) : (
        <div className="gm-card" style={{ padding: '14px 14px 10px' }}>

          {/* Moisture area chart */}
          <ChartSection label="Soil moisture %" dot={MOISTURE_COLOR}>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={trendData} margin={{ top: 4, right: 2, left: -28, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tickCount={3}
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v}%`, 'Avg moisture']}
                  labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="avgMoisture"
                  stroke={MOISTURE_COLOR}
                  strokeWidth={2.5}
                  fill={MOISTURE_COLOR}
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: MOISTURE_COLOR }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          <div style={{ height: 1, background: 'var(--line)', margin: '12px 0' }} />

          {/* Temperature line chart */}
          <ChartSection label="Soil temperature °C" dot={TEMP_COLOR}>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={trendData} margin={{ top: 4, right: 2, left: -28, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v}°C`, 'Avg temp']}
                  labelStyle={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }}
                />
                <Line
                  type="monotone"
                  dataKey="avgTemp"
                  stroke={TEMP_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: TEMP_COLOR }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Metadata row */}
          <div style={{
            fontSize: 10, color: '#94a3b8', marginTop: 8, fontWeight: 600,
            textAlign: 'right', letterSpacing: '0.02em',
          }}>
            {totalSamples} readings · {trendData.length} {bucketNoun}{trendData.length !== 1 ? 's' : ''} · {TIME_RANGE_LABELS[range]}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ChartSection({
  label, dot, children,
}: { label: string; dot: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
        color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dot, display: 'inline-block', flexShrink: 0,
        }} />
        {label}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1.5px solid var(--line)',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 700,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};
