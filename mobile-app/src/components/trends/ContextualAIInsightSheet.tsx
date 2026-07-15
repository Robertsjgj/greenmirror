/* ──────────────────────────────────────────────────────────────────────────
   ContextualAIInsightSheet.tsx — the one AI surface in Trends & Analysis.

   A compact bottom sheet (the app's existing gm-sheet pattern) opened from a
   small chip on a zone card, plant group, or watering row. It explains the
   thing the user is already looking at — never a standalone AI report.

   Sections render only when the underlying data exists, so missing data shows
   fewer sections rather than invented text.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ContextualInsight } from '../../services/trendAIInsights';
import { CONFIDENCE_LABEL } from '../../services/aiInsightLabels';

/** Small tap target that opens the sheet. Sits on a card, never above it. */
export function AIInsightChip({ label = 'AI Insight', onClick, title }: {
  label?: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={title ?? label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        minHeight: 30, padding: '5px 10px', borderRadius: 999,
        border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#047857',
        fontFamily: 'inherit', fontSize: 11, fontWeight: 800, lineHeight: 1.2,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden>✨</span>{label}
    </button>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 14 }}>
      <h3 style={{
        margin: 0, fontFamily: "'Baloo 2', system-ui", fontSize: 13.5, fontWeight: 900,
        color: 'var(--ink)', letterSpacing: '.01em',
      }}>{heading}</h3>
      <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        {children}
      </div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
      {items.map((item) => <li key={item} style={{ overflowWrap: 'anywhere' }}>{item}</li>)}
    </ul>
  );
}

interface SheetProps {
  insight: ContextualInsight | null;
  onClose: () => void;
}

export function ContextualAIInsightSheet({ insight, onClose }: SheetProps) {
  const open = insight !== null;

  // Swipe-down-to-dismiss, matching ZoneDetailSheet. Only engages at scroll top
  // so the sheet body still scrolls normally.
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    if ((bodyRef.current?.scrollTop ?? 0) > 0) { dragStartY.current = null; return; }
    dragStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragY(dy > 0 ? dy : 0);
  };
  const onTouchEnd = () => {
    if (dragStartY.current == null) return;
    if (dragY > 110) onClose();
    setDragY(0);
    dragStartY.current = null;
  };

  return (
    <>
      <div className={`gm-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <div
        className={`gm-sheet${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={insight ? `GreenMirror AI insight for ${insight.title}` : 'GreenMirror AI insight'}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div className="gm-grab" />
        {insight && (
          <div className="gm-sheet-body" ref={bodyRef} style={{ paddingBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 10, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase',
                  color: '#059669',
                }}>GreenMirror AI</div>
                <div style={{
                  fontFamily: "'Baloo 2', system-ui", fontSize: 22, fontWeight: 800,
                  color: 'var(--ink)', lineHeight: 1.15, marginTop: 2, overflowWrap: 'anywhere',
                }}>{insight.title}</div>
                {insight.subtitle && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginTop: 1 }}>
                    {insight.subtitle}
                  </div>
                )}
              </div>
              <button className="gm-icon-btn" onClick={onClose} aria-label="Close">✕</button>
            </div>

            <Section heading="What is happening?">{insight.happening}</Section>

            {insight.why.length > 0 && (
              <Section heading="Why?"><Bullets items={insight.why} /></Section>
            )}

            {insight.basedOn.length > 0 && (
              <Section heading="Based on"><Bullets items={insight.basedOn} /></Section>
            )}

            {insight.meaning && <Section heading="What this means">{insight.meaning}</Section>}

            {insight.learn && (
              <Section heading="Learn">
                <div style={{
                  background: 'var(--bg-sub)', borderRadius: 12, padding: '10px 12px',
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                  <span aria-hidden style={{ fontSize: 14, lineHeight: 1.4 }}>🌱</span>
                  <span>{insight.learn}</span>
                </div>
              </Section>
            )}

            {insight.action && <Section heading="Suggested action">{insight.action}</Section>}

            {insight.confidence && (
              <Section heading="Confidence">
                <span style={{ fontWeight: 900, color: 'var(--ink)' }}>
                  {CONFIDENCE_LABEL[insight.confidence.level]}
                </span>
                {' — '}{insight.confidence.reason}
              </Section>
            )}

            {insight.limitations.length > 0 && (
              <Section heading="Limitations"><Bullets items={insight.limitations} /></Section>
            )}
          </div>
        )}
      </div>
    </>
  );
}
