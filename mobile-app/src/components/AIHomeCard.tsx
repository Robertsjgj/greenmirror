import type { GreenhouseAISummary } from "../services/aiInsights";
import { ACTION_LABEL, SEVERITY_META } from "../services/aiInsightLabels";

interface AIHomeCardProps {
  summary: GreenhouseAISummary;
  onOpenTrends: () => void;
}

interface CountChipProps {
  n: number;
  label: string;
  fg: string;
  bg: string;
}

function CountChip({ n, label, fg, bg }: CountChipProps) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 64,
        borderRadius: 12,
        background: bg,
        color: fg,
        padding: "8px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.03em", marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}

/** Concise "GreenMirror AI" summary card for the Home page. */
export function AIHomeCard({ summary, onOpenTrends }: AIHomeCardProps) {
  const { counts, headline, top } = summary;
  const needAttention = counts.urgent + counts.attention;

  return (
    <section
      aria-label="GreenMirror AI insights"
      style={{
        border: "1px solid #d1fae5",
        background: "linear-gradient(180deg,#f0fdf4 0%,#ffffff 60%)",
        borderRadius: 20,
        padding: 16,
        margin: "12px 0",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>🌿</span>
        <h2 style={{ fontSize: 15, fontWeight: 900, color: "#065f46", margin: 0 }}>GreenMirror AI</h2>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#059669",
            background: "#d1fae5",
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          AI Insights · pilot
        </span>
      </div>

      <p style={{ fontSize: 13, fontWeight: 600, color: "#334155", margin: "6px 0 12px" }}>
        {headline}
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: top.length ? 12 : 4 }}>
        <CountChip n={needAttention} label="Need attention" fg={SEVERITY_META.attention.fg} bg={SEVERITY_META.attention.bg} />
        <CountChip n={counts.monitor} label="Monitoring" fg={SEVERITY_META.monitor.fg} bg={SEVERITY_META.monitor.bg} />
        <CountChip n={counts.good} label="Doing well" fg={SEVERITY_META.good.fg} bg={SEVERITY_META.good.bg} />
        <CountChip n={counts.sensor} label="Sensor issues" fg={SEVERITY_META.unknown.fg} bg={SEVERITY_META.unknown.bg} />
      </div>

      {top.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 6 }}>
          {top.map((insight) => {
            const meta = SEVERITY_META[insight.severity];
            return (
              <li
                key={`${insight.zoneId}-${insight.action}`}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 800,
                    color: meta.fg,
                    background: meta.bg,
                    border: `1px solid ${meta.border}`,
                    borderRadius: 999,
                    padding: "1px 7px",
                    minWidth: 88,
                    textAlign: "center",
                  }}
                >
                  {ACTION_LABEL[insight.action]}
                </span>
                <span style={{ color: "#334155", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <strong>{insight.zoneLabel}</strong> — {insight.summary}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onOpenTrends}
        style={{
          width: "100%",
          border: "none",
          borderRadius: 12,
          background: "#059669",
          color: "#fff",
          fontWeight: 800,
          fontSize: 13,
          padding: "10px 12px",
          cursor: "pointer",
        }}
      >
        View in Trends &amp; Analysis
      </button>
    </section>
  );
}
