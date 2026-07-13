import { useEffect, useMemo, useState } from "react";
import type {
  AIConfidence,
  AIInsightAction,
  GreenhouseAISummary,
  ZoneAIInsight,
} from "../services/aiInsights";
import {
  ACTION_LABEL,
  CONFIDENCE_LABEL,
  EVIDENCE_STATUS_COLOR,
  SEVERITY_META,
  verificationNote,
} from "../services/aiInsightLabels";
import {
  submitAIFeedback,
  type AIFeedbackInsightType,
  type AIFeedbackReason,
} from "../services/aiFeedbackService";
import {
  fetchZoneVerificationStates,
  type ZoneVerificationState,
} from "../services/wateringVerification";
import type { VisualZone } from "../zoneLayout";

interface AIInsightsViewProps {
  insights: ZoneAIInsight[];
  summary: GreenhouseAISummary;
  greenhouseId: string;
  userId?: string;
  zonesByCanonicalId: Map<string, VisualZone>;
  onViewZone: (zone: VisualZone) => void;
  onViewTrends: () => void;
  onOpenWatering: () => void;
}

const REASON_OPTIONS: { value: AIFeedbackReason; label: string }[] = [
  { value: "recommendation_clear", label: "Recommendation was clear" },
  { value: "recommendation_inaccurate", label: "Recommendation seemed inaccurate" },
  { value: "missing_information", label: "Missing information" },
  { value: "not_practical", label: "Action was not practical" },
  { value: "other", label: "Other" },
];

type ActionFilter = "all" | AIInsightAction;
type ConfidenceFilter = "all" | AIConfidence;

// ─── Feedback control (dedup: disables after submit) ──────────────────────────

function FeedbackControl({
  greenhouseId,
  userId,
  zoneId,
  insightType,
  recommendationAction,
}: {
  greenhouseId: string;
  userId?: string;
  zoneId?: string;
  insightType: AIFeedbackInsightType;
  recommendationAction?: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [helpful, setHelpful] = useState<boolean | null>(null);

  async function send(isHelpful: boolean, reason?: AIFeedbackReason) {
    if (submitted || busy) return; // prevent duplicate taps
    setBusy(true);
    setHelpful(isHelpful);
    await submitAIFeedback({
      greenhouseId,
      zoneId,
      insightType,
      recommendationAction,
      helpful: isHelpful,
      reason,
      userId,
    });
    setSubmitted(true);
    setBusy(false);
  }

  if (submitted) {
    return (
      <p style={{ fontSize: 12, fontWeight: 700, color: "#059669", margin: "8px 0 0" }}>
        Thanks — your feedback was saved.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10, borderTop: "1px dashed #e2e8f0", paddingTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Was this helpful?</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => send(true, "recommendation_clear")}
          style={pillBtn(helpful === true)}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setHelpful(false)}
          style={pillBtn(helpful === false)}
        >
          Not really
        </button>
      </div>
      {helpful === false && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {REASON_OPTIONS.filter((r) => r.value !== "recommendation_clear").map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={busy}
              onClick={() => send(false, r.value)}
              style={{ ...pillBtn(false), fontSize: 11 }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function pillBtn(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? "#059669" : "#cbd5e1"}`,
    background: active ? "#059669" : "#fff",
    color: active ? "#fff" : "#334155",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
}

// ─── Insight card ─────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  greenhouseId,
  userId,
  zone,
  verification,
  onViewZone,
  onViewTrends,
  onOpenWatering,
}: {
  insight: ZoneAIInsight;
  greenhouseId: string;
  userId?: string;
  zone?: VisualZone;
  verification?: ZoneVerificationState;
  onViewZone: (zone: VisualZone) => void;
  onViewTrends: () => void;
  onOpenWatering: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[insight.severity];
  const vNote = verificationNote(verification?.status);

  return (
    <article
      style={{
        border: `1px solid ${meta.border}`,
        borderRadius: 16,
        background: "#fff",
        padding: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14, color: "#0f172a" }}>{insight.zoneLabel}</strong>
            {insight.plantName && (
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>· {insight.plantName}</span>
            )}
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: meta.fg,
                background: meta.bg,
                border: `1px solid ${meta.border}`,
                borderRadius: 999,
                padding: "1px 8px",
              }}
            >
              {meta.label}
            </span>
          </div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: "#065f46",
                background: "#ecfdf5",
                borderRadius: 8,
                padding: "3px 10px",
              }}
            >
              {ACTION_LABEL[insight.action]}
            </span>
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
              Confidence: {CONFIDENCE_LABEL[insight.confidence]}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#334155", margin: "8px 0 0", fontWeight: 500 }}>
            {insight.summary}
          </p>
        </div>
      </div>

      {vNote && (
        <p
          style={{
            fontSize: 12,
            color: "#475569",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "6px 10px",
            margin: "10px 0 0",
          }}
        >
          <strong style={{ color: "#0f172a" }}>Watering:</strong> {vNote}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          marginTop: 10,
          border: "none",
          background: "transparent",
          color: "#059669",
          fontWeight: 800,
          fontSize: 12.5,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {open ? "Hide why ▲" : "Why? ▼"}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12.5, color: "#334155", margin: "0 0 8px" }}>{insight.explanation}</p>

          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#475569", marginBottom: 4 }}>
            Why GreenMirror suggests this
          </div>
          <ul style={{ margin: "0 0 8px", paddingLeft: 16, display: "grid", gap: 2 }}>
            {insight.reasons.map((r, i) => (
              <li key={i} style={{ fontSize: 12, color: "#334155" }}>
                {r}
              </li>
            ))}
          </ul>

          <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
            {insight.evidence.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                <span style={{ color: "#64748b" }}>{e.label}</span>
                <span style={{ fontWeight: 700, color: EVIDENCE_STATUS_COLOR[e.status ?? "neutral"] }}>{e.value}</span>
              </div>
            ))}
          </div>

          {insight.limitations.length > 0 && (
            <div style={{ fontSize: 11.5, color: "#92400e", background: "#fffbeb", borderRadius: 8, padding: "6px 10px" }}>
              <strong>Limitations:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                {insight.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Navigation into existing screens (reuse, don't duplicate). */}
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {zone && (
          <button type="button" style={navBtn} onClick={() => onViewZone(zone)}>
            View zone
          </button>
        )}
        <button type="button" style={navBtn} onClick={onViewTrends}>
          View trends
        </button>
        {(insight.action === "water_soon" || insight.action === "check_today") && (
          <button type="button" style={navBtn} onClick={onOpenWatering}>
            Open watering schedule
          </button>
        )}
        {zone && insight.action === "review_plant" && (
          <button type="button" style={navBtn} onClick={() => onViewZone(zone)}>
            Select a plant
          </button>
        )}
        {!insight.plantName && zone && (
          <button type="button" style={navBtn} onClick={() => onViewZone(zone)}>
            Select a plant
          </button>
        )}
        {zone && insight.action === "check_sensor" && (
          <button type="button" style={navBtn} onClick={() => onViewZone(zone)}>
            Check sensor
          </button>
        )}
      </div>

      <FeedbackControl
        greenhouseId={greenhouseId}
        userId={userId}
        zoneId={insight.zoneId}
        insightType="zone_recommendation"
        recommendationAction={insight.action}
      />
    </article>
  );
}

const navBtn: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  borderRadius: 999,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

// ─── Group section ────────────────────────────────────────────────────────────

function Group({
  title,
  insights,
  render,
}: {
  title: string;
  insights: ZoneAIInsight[];
  render: (i: ZoneAIInsight) => React.ReactNode;
}) {
  if (insights.length === 0) return null;
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 13, fontWeight: 900, color: "#0f172a", margin: "0 0 8px" }}>
        {title} <span style={{ color: "#94a3b8" }}>({insights.length})</span>
      </h3>
      <div style={{ display: "grid", gap: 10 }}>{insights.map(render)}</div>
    </section>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AIInsightsView({
  insights,
  summary,
  greenhouseId,
  userId,
  zonesByCanonicalId,
  onViewZone,
  onViewTrends,
  onOpenWatering,
}: AIInsightsViewProps) {
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [plantFilter, setPlantFilter] = useState<string>("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [verification, setVerification] = useState<Map<string, ZoneVerificationState>>(new Map());

  useEffect(() => {
    let alive = true;
    if (greenhouseId) {
      fetchZoneVerificationStates(greenhouseId).then((map) => {
        if (alive) setVerification(map);
      });
    }
    return () => {
      alive = false;
    };
  }, [greenhouseId]);

  const plantOptions = useMemo(() => {
    const set = new Set<string>();
    insights.forEach((i) => i.plantName && set.add(i.plantName));
    return [...set].sort();
  }, [insights]);

  const filtered = useMemo(() => {
    return insights.filter((i) => {
      if (actionFilter !== "all" && i.action !== actionFilter) return false;
      if (confidenceFilter !== "all" && i.confidence !== confidenceFilter) return false;
      if (plantFilter !== "all" && i.plantName !== plantFilter) return false;
      return true;
    });
  }, [insights, actionFilter, plantFilter, confidenceFilter]);

  const priority = filtered.filter((i) => i.severity === "urgent" || i.severity === "attention");
  const monitor = filtered.filter((i) => i.severity === "monitor");
  const doingWell = filtered.filter((i) => i.severity === "good");
  const sensorIssues = filtered.filter((i) => i.action === "check_sensor" || i.severity === "unknown");

  const renderCard = (insight: ZoneAIInsight) => (
    <InsightCard
      key={`${insight.zoneId}-${insight.action}`}
      insight={insight}
      greenhouseId={greenhouseId}
      userId={userId}
      zone={zonesByCanonicalId.get(insight.zoneId)}
      verification={verification.get(insight.zoneId)}
      onViewZone={onViewZone}
      onViewTrends={onViewTrends}
      onOpenWatering={onOpenWatering}
    />
  );

  return (
    <div style={{ padding: "8px 4px 24px" }}>
      {/* Greenhouse summary + summary-level feedback */}
      <section
        style={{
          border: "1px solid #d1fae5",
          background: "linear-gradient(180deg,#f0fdf4 0%,#ffffff 70%)",
          borderRadius: 16,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>🌿</span>
          <h2 style={{ fontSize: 14, fontWeight: 900, color: "#065f46", margin: 0 }}>GreenMirror AI summary</h2>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#334155", margin: "4px 0 0" }}>{summary.headline}</p>
        <p style={{ fontSize: 10.5, color: "#94a3b8", margin: "8px 0 0", fontWeight: 700 }}>
          Rule-based decision support (pilot v1) — not a trained model.
        </p>
        <FeedbackControl
          greenhouseId={greenhouseId}
          userId={userId}
          insightType="greenhouse_summary"
        />
      </section>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as ActionFilter)} style={selectStyle} aria-label="Filter by recommended action">
          <option value="all">All actions</option>
          <option value="water_soon">Water soon</option>
          <option value="check_today">Check today</option>
          <option value="monitor">Monitor</option>
          <option value="no_watering_needed">No watering needed</option>
          <option value="check_sensor">Check sensor</option>
          <option value="review_plant">Review plant</option>
        </select>
        <select value={plantFilter} onChange={(e) => setPlantFilter(e.target.value)} style={selectStyle} aria-label="Filter by plant">
          <option value="all">All plants</option>
          {plantOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)} style={selectStyle} aria-label="Filter by confidence">
          <option value="all">All confidence</option>
          <option value="high">High confidence</option>
          <option value="moderate">Moderate confidence</option>
          <option value="low">Low confidence</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", padding: "24px 0" }}>
          No zones match these filters.
        </p>
      ) : (
        <>
          <Group title="Priority" insights={priority} render={renderCard} />
          <Group title="Monitor" insights={monitor} render={renderCard} />
          <Group title="Doing well" insights={doingWell} render={renderCard} />
          <Group title="Sensor issues" insights={sensorIssues} render={renderCard} />
        </>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "6px 10px",
  fontSize: 12.5,
  fontWeight: 700,
  color: "#334155",
  background: "#fff",
};
