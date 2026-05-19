const DAYS = [
  { d: 'Mon', l: 12, k: 'good' },
  { d: 'Tue', l: 8,  k: 'good' },
  { d: 'Wed', l: 35, k: 'alert' },
  { d: 'Thu', l: 18, k: 'warn' },
  { d: 'Fri', l: 10, k: 'good' },
  { d: 'Sat', l: 42, k: 'alert' },
  { d: 'Sun', l: 14, k: 'good' },
];

const ALERTS = [
  { kind: 'alert', title: 'Higher than expected water loss', body: 'Saturday saw 42L of runoff — nearly 3× normal. Check tomato watering.', when: 'Yesterday' },
  { kind: 'warn',  title: 'Unusual runoff on Wednesday',     body: 'Overwatering caused extra flow through Section B. Try watering more slowly.', when: '4 days ago' },
  { kind: 'good',  title: 'Water loss back to normal',       body: 'Friday and Sunday were within expected range. Great job!', when: '2 days ago' },
];

const EVENTS = [
  { kind: 'good',  title: 'Water stayed in soil',        plant: 'Herbs',     when: 'Today, 10:30 AM' },
  { kind: 'alert', title: '42L ran off after watering',  plant: 'Tomatoes',  when: 'Yesterday, 4:15 PM' },
  { kind: 'warn',  title: '8L of extra water drained',   plant: 'Lettuce',   when: 'Yesterday, 9:00 AM' },
  { kind: 'alert', title: 'Heavy watering caused overflow', plant: 'Section B', when: 'Wed, 3:20 PM' },
];

const maxL = Math.max(...DAYS.map((d) => d.l));
const totalLost = DAYS.reduce((s, d) => s + d.l, 0);
const dailyAvg = Math.round(totalLost / DAYS.length);
const peak = DAYS.reduce((m, d) => d.l > m.l ? d : m, DAYS[0]);
const unusualDays = DAYS.filter((d) => d.k !== 'good').length;

const STATUS_COLOR: Record<string, string> = {
  good: 'var(--good)', warn: 'var(--dry)', alert: 'var(--alert)',
};

export function SimpleRunoff() {
  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Heading */}
      <div style={{ padding: '4px 2px' }}>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 26, color: 'var(--ink)', lineHeight: 1.1, fontWeight: 800 }}>
          Water runoff
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>Track where your water goes 💧</div>
      </div>

      {/* Hero status */}
      <div className="gm-card" style={{
        padding: 24, textAlign: 'center',
        background: 'linear-gradient(180deg, var(--clay-soft), oklch(0.97 0.025 70))',
        borderColor: 'oklch(0.85 0.08 60)',
      }}>
        <div style={{
          width: 56, height: 56, margin: '0 auto', borderRadius: '50%',
          background: 'oklch(0.97 0.04 70)', color: 'var(--clay)',
          display: 'grid', placeItems: 'center', fontSize: 26,
        }}>
          💧
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--clay-ink)', marginTop: 12 }}>
          THIS WEEK
        </div>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 28, color: 'var(--clay-ink)', lineHeight: 1.1, marginTop: 2, fontWeight: 800 }}>
          {unusualDays > 1 ? 'Needs attention' : 'Looking good!'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--clay-ink)', marginTop: 6, opacity: 0.85 }}>
          {unusualDays > 1
            ? `${unusualDays} days had higher water loss than expected`
            : 'Most water is staying in the soil 🌱'}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { v: totalLost,    u: 'L', l: 'Total lost',       tone: 'ink' },
          { v: dailyAvg,     u: 'L', l: 'Daily avg',        tone: 'ink' },
          { v: peak.l,       u: 'L', l: `Peak (${peak.d})`, tone: 'alert' },
        ].map((k) => (
          <div key={k.l} className="gm-card" style={{ padding: 12, textAlign: 'center' }}>
            <div style={{
              fontFamily: "'Baloo 2', system-ui", fontSize: 28,
              color: k.tone === 'alert' ? 'var(--alert)' : 'var(--ink)',
              lineHeight: 1, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            }}>
              {k.v}<span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{k.u}</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700, marginTop: 4, letterSpacing: '0.05em' }}>
              {k.l}
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="gm-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>💧</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Water loss this week</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>How much ran off each day (liters)</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, padding: '0 4px' }}>
          {DAYS.map((d) => {
            const h = (d.l / maxL) * 100;
            const color = STATUS_COLOR[d.k];
            return (
              <div key={d.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{d.l}L</div>
                <div style={{
                  width: '100%', height: `${h}%`, background: color,
                  borderRadius: '6px 6px 4px 4px', minHeight: 6, transition: 'height .4s',
                }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>{d.d}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 8, fontSize: 11 }}>
          {[
            { color: 'var(--good)', label: 'Normal' },
            { color: 'var(--dry)',  label: 'A bit high' },
            { color: 'var(--alert)', label: 'Too much' },
          ].map((leg) => (
            <span key={leg.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: leg.color, display: 'inline-block' }} />
              {leg.label}
            </span>
          ))}
        </div>
      </div>

      {/* Runoff alerts */}
      <div style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 20, color: 'var(--ink)', fontWeight: 800 }}>
          Runoff alerts
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ALERTS.map((a, i) => {
          return (
            <div key={i} className="gm-card" style={{
              padding: 14,
              borderLeft: `3px solid ${STATUS_COLOR[a.kind]}`,
              background: a.kind === 'good' ? 'var(--good-soft)' : a.kind === 'warn' ? 'var(--dry-soft)' : 'var(--alert-soft)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'white', color: STATUS_COLOR[a.kind],
                  display: 'grid', placeItems: 'center', fontSize: 14,
                }}>
                  {a.kind === 'good' ? '✓' : '⚠'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.45 }}>{a.body}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>🕐 {a.when}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent events */}
      <div style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 18 }}>🕐</span>
        <div style={{ fontFamily: "'Baloo 2', system-ui", fontSize: 20, color: 'var(--ink)', fontWeight: 800 }}>
          Recent events
        </div>
      </div>
      <div className="gm-card" style={{ padding: 4 }}>
        {EVENTS.map((e, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 12,
            borderBottom: i < EVENTS.length - 1 ? '1px solid var(--line)' : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: e.kind === 'good' ? 'var(--good-soft)' : e.kind === 'warn' ? 'var(--dry-soft)' : 'var(--alert-soft)',
              color: STATUS_COLOR[e.kind],
              display: 'grid', placeItems: 'center', fontSize: 14,
            }}>
              {e.kind === 'good' ? '✓' : '💧'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{e.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{e.plant} · {e.when}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
