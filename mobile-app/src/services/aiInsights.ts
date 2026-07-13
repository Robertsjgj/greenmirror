/**
 * GreenMirror AI — decision-support engine (pilot v1).
 *
 * Firebase-free and unit-testable. Produces per-zone recommendations and a
 * greenhouse-wide summary from DETERMINISTIC rules over existing project data
 * (sensor readings, plant profiles, watering activity, current weather text).
 *
 * This is NOT a trained machine-learning model. It is structured, explainable
 * scoring. Confidence reflects EVIDENCE QUALITY, not a scientific probability.
 *
 * Unmetered-hose constraint: this module never mentions litres/minutes and
 * never claims water was delivered. Recommendations are actions only.
 */

import { resolveZoneId } from '../zoneRegistry';
import type { LatestReading, VisualZone } from '../zoneLayout';

// ─── Public model ────────────────────────────────────────────────────────────

export type AIInsightSeverity = 'urgent' | 'attention' | 'monitor' | 'good' | 'unknown';

export type AIInsightAction =
  | 'water_soon'
  | 'check_today'
  | 'monitor'
  | 'no_watering_needed'
  | 'check_sensor'
  | 'review_plant'
  | 'view_trends';

export type AIConfidence = 'high' | 'moderate' | 'low';

export interface AIEvidenceItem {
  label: string;
  value: string;
  status?: 'positive' | 'warning' | 'negative' | 'neutral';
}

export interface ZoneAIInsight {
  greenhouseId: string;
  zoneId: string; // canonical, matches latestReadings.zones[].zone_id
  visualZoneId?: string;
  zoneLabel: string; // display label for UI/summary
  plantName?: string;

  severity: AIInsightSeverity;
  action: AIInsightAction;

  title: string;
  summary: string;
  explanation: string;

  reasons: string[];
  evidence: AIEvidenceItem[];

  confidence: AIConfidence;
  limitations: string[];

  generatedAt: string;
  insightVersion: 'greenmirror-ai-v1';
}

export interface ZoneTrendInfo {
  direction: 'rising' | 'falling' | 'stable' | 'unknown';
  deltaPct: number | null; // change over the window, percentage points
  sampleCount: number;
  windowHours: number;
}

// ─── Tunables (deterministic thresholds) ─────────────────────────────────────

export const INSIGHT_VERSION = 'greenmirror-ai-v1' as const;
const STALE_MS = 20 * 60 * 1000; // reading older than this → sensor guidance
const CRITICAL_OFFSET = 15; // pts below min → urgent
const NEAR_BOUNDARY = 8; // within this above min → "close to lower limit"
const BORDERLINE = 4; // within this of a limit → lower confidence
const TREND_EPS = 3; // pts over the window to call a direction
const TREND_WINDOW_HOURS = 6;
// Generic (no plant assigned) thresholds — intentionally conservative.
const GENERIC_DRY = 20;
const GENERIC_LOWISH = 35;
const GENERIC_WET = 90;

// ─── Small helpers ───────────────────────────────────────────────────────────

function roundInt(n: number): number {
  return Math.round(n);
}

function pctText(pct: number | null): string {
  return pct === null ? 'unavailable' : `${roundInt(pct)}%`;
}

function relativeTime(fromMs: number, now: number): string {
  const diff = Math.max(0, now - fromMs);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function isUsableMoisturePct(pct: number | null | undefined, status?: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  if (s === 'not_connected' || s === 'invalid') return false;
  return typeof pct === 'number' && Number.isFinite(pct) && pct >= 0 && pct <= 100;
}

// ─── Trend + watering derivation (pure, from existing data) ──────────────────

/**
 * Per-canonical-zone moisture trend over the last `windowHours`, from reading
 * history. Zones with < 2 valid samples get direction 'unknown'.
 */
export function computeZoneTrends(
  readings: LatestReading[],
  now: number = Date.now(),
  windowHours: number = TREND_WINDOW_HOURS,
): Map<string, ZoneTrendInfo> {
  const cutoff = now - windowHours * 3_600_000;
  const byZone = new Map<string, { ts: number; pct: number }[]>();

  for (const reading of readings ?? []) {
    if (!reading?.timestamp) continue;
    const ts = new Date(reading.timestamp).getTime();
    if (!Number.isFinite(ts) || ts < cutoff || ts > now) continue;
    for (const zone of reading.zones ?? []) {
      if (!isUsableMoisturePct(zone.soil_moisture_pct, zone.soil_moisture_status)) continue;
      const key = resolveZoneId(zone.zone_id);
      if (!byZone.has(key)) byZone.set(key, []);
      byZone.get(key)!.push({ ts, pct: zone.soil_moisture_pct as number });
    }
  }

  const out = new Map<string, ZoneTrendInfo>();
  for (const [key, samples] of byZone) {
    samples.sort((a, b) => a.ts - b.ts);
    if (samples.length < 2) {
      out.set(key, { direction: 'unknown', deltaPct: null, sampleCount: samples.length, windowHours });
      continue;
    }
    const delta = samples[samples.length - 1].pct - samples[0].pct;
    const direction = delta <= -TREND_EPS ? 'falling' : delta >= TREND_EPS ? 'rising' : 'stable';
    out.set(key, { direction, deltaPct: roundInt(delta), sampleCount: samples.length, windowHours });
  }
  return out;
}

/** Newest watering timestamp (ms) per canonical zone, from activity entries. */
export function lastWateringByZone(
  activities: Array<{ type?: string; visualZoneId?: string; backendZoneId?: string; timestamp?: string }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of activities ?? []) {
    if (entry?.type !== 'watering') continue;
    const raw = entry.backendZoneId ?? entry.visualZoneId;
    if (!raw) continue;
    const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : NaN;
    if (!Number.isFinite(ts)) continue;
    const key = resolveZoneId(raw);
    const prev = out.get(key);
    if (prev === undefined || ts > prev) out.set(key, ts);
  }
  return out;
}

// ─── Single-zone insight ─────────────────────────────────────────────────────

export interface ZoneInsightInput {
  greenhouseId: string;
  zone: VisualZone;
  trend: ZoneTrendInfo;
  lastWateringAt: number | null;
  weatherCondition?: string | null;
  now?: number;
  staleMs?: number;
}

function confidenceFrom(opts: {
  validFresh: boolean;
  hasPlant: boolean;
  hasTrend: boolean;
  borderline: boolean;
}): AIConfidence {
  if (!opts.validFresh) return 'low';
  // No plant assigned is an explicit Low signal (guidance is generic).
  if (!opts.hasPlant) return 'low';
  if (opts.hasTrend && !opts.borderline) return 'high';
  return 'moderate';
}

function trendPhrase(trend: ZoneTrendInfo): string {
  if (trend.direction === 'unknown') return 'not enough history';
  if (trend.direction === 'falling') return `decreasing${trend.deltaPct !== null ? ` (${trend.deltaPct} pts / ${trend.windowHours}h)` : ''}`;
  if (trend.direction === 'rising') return `increasing${trend.deltaPct !== null ? ` (+${trend.deltaPct} pts / ${trend.windowHours}h)` : ''}`;
  return 'stable';
}

/** Build one zone recommendation. Deterministic; safe with partial data. */
export function buildZoneInsight(input: ZoneInsightInput): ZoneAIInsight {
  const now = input.now ?? Date.now();
  const staleMs = input.staleMs ?? STALE_MS;
  const { zone, trend } = input;

  const zoneLabel = zone.displayLabel ?? zone.visualLabel;
  const canonicalZoneId = resolveZoneId(zone.backendZoneId ?? zone.visualLabel);
  const plant = zone.assignedPlantProfile ?? null;
  const plantName = plant?.name;
  const pct = zone.soilMoisturePct;
  const status = (zone.soilMoistureStatus ?? '').toLowerCase();
  const ageMs = zone.timestamp ? now - new Date(zone.timestamp).getTime() : Infinity;
  const fresh = Number.isFinite(ageMs) && ageMs <= staleMs;
  const sensorDisconnected = status === 'not_connected' || status === 'invalid';
  const validReading = zone.hasReading && isUsableMoisturePct(pct, status);
  const hasTrend = trend.sampleCount >= 2;

  const base = {
    greenhouseId: input.greenhouseId,
    zoneId: canonicalZoneId,
    visualZoneId: zone.visualLabel,
    zoneLabel,
    plantName,
    generatedAt: new Date(now).toISOString(),
    insightVersion: INSIGHT_VERSION,
  } as const;

  // ── Sensor unusable → check_sensor (never guess) ──────────────────────────
  if (!validReading || !fresh) {
    const disconnected = sensorDisconnected || !zone.hasReading || pct === null;
    const reasons = [
      disconnected
        ? `Sensor status: ${zone.hasReading ? status || 'no moisture value' : 'no reading received'}`
        : `Latest reading is ${Number.isFinite(ageMs) ? relativeTime(now - ageMs, now) : 'unavailable'}`,
    ];
    const evidence: AIEvidenceItem[] = [
      { label: 'Current moisture', value: pctText(validReading ? pct : null), status: 'neutral' },
      {
        label: 'Sensor',
        value: disconnected ? 'disconnected or invalid' : 'stale reading',
        status: 'negative',
      },
    ];
    return {
      ...base,
      severity: 'unknown',
      action: 'check_sensor',
      title: 'Check sensor',
      summary: `GreenMirror cannot give reliable guidance for ${zoneLabel} — the latest reading is ${disconnected ? 'unavailable' : 'stale'}.`,
      explanation:
        `GreenMirror cannot provide reliable guidance for ${zoneLabel} because the latest sensor reading is ` +
        `${disconnected ? 'disconnected or invalid' : 'stale'}. Check the moisture sensor and its connection.`,
      reasons,
      evidence,
      confidence: 'low',
      limitations: ['Guidance is paused until a valid, fresh sensor reading is available.'],
    };
  }

  const moisture = pct as number;
  const trendStr = trendPhrase(trend);
  const falling = trend.direction === 'falling';

  // Shared evidence builder.
  const evidence: AIEvidenceItem[] = [];
  const buildEvidence = (moistureStatus: AIEvidenceItem['status']) => {
    evidence.length = 0;
    evidence.push({ label: 'Current moisture', value: pctText(moisture), status: moistureStatus });
    if (plant) {
      evidence.push({
        label: 'Preferred range',
        value: `${roundInt(plant.moistureMin)}–${roundInt(plant.moistureMax)}%`,
        status: 'neutral',
      });
    }
    evidence.push({
      label: `${trend.windowHours}-hour trend`,
      value: trendStr,
      status: falling ? 'warning' : trend.direction === 'rising' ? 'positive' : 'neutral',
    });
    evidence.push({
      label: 'Last watering record',
      value: input.lastWateringAt ? relativeTime(input.lastWateringAt, now) : 'no recent record',
      status: 'neutral',
    });
    if (typeof zone.soilTempC === 'number' && Number.isFinite(zone.soilTempC)) {
      evidence.push({ label: 'Soil temperature', value: `${zone.soilTempC.toFixed(1)}°C`, status: 'neutral' });
    }
    if (input.weatherCondition) {
      evidence.push({ label: 'Weather', value: input.weatherCondition, status: 'neutral' });
    }
  };

  const limitations: string[] = [];
  if (!hasTrend) limitations.push('Trend information is unavailable (not enough recent history).');
  if (!plant) limitations.push('No plant is assigned — assigning one would improve this guidance.');

  const wateringLimit = 'Water delivered by the hose is not measured.';

  let action: AIInsightAction;
  let severity: AIInsightSeverity;
  let title: string;
  let summary: string;
  let explanation: string;
  const reasons: string[] = [];

  const borderline = plant
    ? Math.abs(moisture - plant.moistureMin) <= BORDERLINE || Math.abs(moisture - plant.moistureMax) <= BORDERLINE
    : moisture <= GENERIC_DRY + BORDERLINE || moisture >= GENERIC_WET - BORDERLINE;

  if (plant) {
    const { moistureMin: lo, moistureMax: hi } = plant;
    reasons.push(`Current moisture: ${pctText(moisture)}`);
    reasons.push(`Preferred range: ${roundInt(lo)}–${roundInt(hi)}%`);
    reasons.push(`${trend.windowHours}-hour trend: ${trendStr}`);
    reasons.push(`Last watering record: ${input.lastWateringAt ? relativeTime(input.lastWateringAt, now) : 'none recorded'}`);

    if (moisture < lo - CRITICAL_OFFSET) {
      action = 'water_soon';
      severity = 'urgent';
      title = 'Water soon';
      buildEvidence('negative');
      summary = `${zoneLabel} is well below the preferred range${plantName ? ` for ${plantName}` : ''}.`;
      explanation =
        `The soil moisture in ${zoneLabel} is ${pctText(moisture)}, well below the ` +
        `${plantName ? `${plantName} ` : ''}target range of ${roundInt(lo)}–${roundInt(hi)}%` +
        `${falling ? ', and it has continued to fall' : ''}.`;
      limitations.push(wateringLimit);
    } else if (moisture < lo) {
      action = falling ? 'water_soon' : 'check_today';
      severity = 'attention';
      title = falling ? 'Water soon' : 'Check today';
      buildEvidence('negative');
      summary = `${zoneLabel} is below the preferred range${falling ? ' and still drying' : ''}.`;
      explanation =
        `The soil moisture in ${zoneLabel} is ${pctText(moisture)}, below the target range of ` +
        `${roundInt(lo)}–${roundInt(hi)}%${falling ? ', and moisture is decreasing' : ''}.`;
      limitations.push(wateringLimit);
    } else if (moisture <= lo + NEAR_BOUNDARY && falling) {
      action = 'check_today';
      severity = 'attention';
      title = 'Check today';
      buildEvidence('warning');
      summary = `${zoneLabel} is close to the lower moisture limit and has been drying steadily.`;
      explanation =
        `${zoneLabel} is at ${pctText(moisture)}, close to the lower limit of ${roundInt(lo)}% and drying steadily.`;
      limitations.push(wateringLimit);
    } else if (moisture > hi + CRITICAL_OFFSET + 10 && !falling) {
      action = 'review_plant';
      severity = 'attention';
      title = 'Review plant';
      buildEvidence('warning');
      summary = `${zoneLabel} stays much wetter than ${plantName ?? 'the assigned plant'} prefers.`;
      explanation =
        `${zoneLabel} is at ${pctText(moisture)}, well above the ${roundInt(lo)}–${roundInt(hi)}% range ` +
        `and not drying. The assigned plant may not closely match the conditions recorded here.`;
    } else if (moisture > hi) {
      action = 'monitor';
      severity = 'attention';
      title = 'Monitor';
      buildEvidence('warning');
      summary = `${zoneLabel} is above the preferred range — hold off watering.`;
      explanation =
        `${zoneLabel} is at ${pctText(moisture)}, above the target range of ${roundInt(lo)}–${roundInt(hi)}%. ` +
        `No watering is needed; keep an eye on drainage.`;
    } else if (falling) {
      action = 'monitor';
      severity = 'monitor';
      title = 'Monitor';
      buildEvidence('neutral');
      summary = `${zoneLabel} is within range, but its moisture has been decreasing.`;
      explanation =
        `${zoneLabel} is at ${pctText(moisture)}, within the ${roundInt(lo)}–${roundInt(hi)}% range, ` +
        `but moisture has been decreasing.`;
    } else {
      action = 'no_watering_needed';
      severity = 'good';
      title = 'No watering needed';
      buildEvidence('positive');
      summary = `${zoneLabel} is within its preferred range and stable.`;
      explanation =
        `${zoneLabel} is at ${pctText(moisture)}, within the ${roundInt(lo)}–${roundInt(hi)}% range and ${trendStr}.`;
    }
  } else {
    // No plant assigned → conservative generic guidance.
    reasons.push(`Current moisture: ${pctText(moisture)}`);
    reasons.push(`${trend.windowHours}-hour trend: ${trendStr}`);
    reasons.push('No plant assigned — using general thresholds');

    if (moisture < GENERIC_DRY) {
      action = 'water_soon';
      severity = 'attention';
      title = 'Water soon';
      buildEvidence('negative');
      summary = `${zoneLabel} looks dry. Assigning a plant would sharpen this guidance.`;
      explanation = `${zoneLabel} is at ${pctText(moisture)}, which is low by general standards${falling ? ' and still falling' : ''}.`;
      limitations.push(wateringLimit);
    } else if (moisture < GENERIC_LOWISH && falling) {
      action = 'check_today';
      severity = 'monitor';
      title = 'Check today';
      buildEvidence('warning');
      summary = `${zoneLabel} is on the drier side and decreasing.`;
      explanation = `${zoneLabel} is at ${pctText(moisture)} and has been decreasing. Assigning a plant would improve the guidance.`;
      limitations.push(wateringLimit);
    } else if (moisture > GENERIC_WET) {
      action = 'monitor';
      severity = 'attention';
      title = 'Monitor';
      buildEvidence('warning');
      summary = `${zoneLabel} looks very wet. Hold off watering.`;
      explanation = `${zoneLabel} is at ${pctText(moisture)}, which is high by general standards.`;
    } else if (falling) {
      action = 'monitor';
      severity = 'monitor';
      title = 'Monitor';
      buildEvidence('neutral');
      summary = `${zoneLabel} is in a normal range but decreasing.`;
      explanation = `${zoneLabel} is at ${pctText(moisture)} and decreasing. Assigning a plant would improve the guidance.`;
    } else {
      action = 'no_watering_needed';
      severity = 'good';
      title = 'No watering needed';
      buildEvidence('positive');
      summary = `${zoneLabel} looks fine for now.`;
      explanation = `${zoneLabel} is at ${pctText(moisture)} and ${trendStr}. Assign a plant to enable tailored guidance.`;
    }
  }

  const confidence = confidenceFrom({
    validFresh: true,
    hasPlant: Boolean(plant),
    hasTrend,
    borderline,
  });

  return {
    ...base,
    severity,
    action,
    title,
    summary,
    explanation,
    reasons,
    evidence,
    confidence,
    limitations,
  };
}

// ─── Whole-greenhouse orchestration ──────────────────────────────────────────

export interface BuildInsightsInput {
  greenhouseId: string;
  zones: VisualZone[];
  historyReadings: LatestReading[];
  activities: Array<{ type?: string; visualZoneId?: string; backendZoneId?: string; timestamp?: string }>;
  weatherCondition?: string | null;
  now?: number;
}

/** Build insights for every sensor-backed zone (skips never-connected empty beds). */
export function buildAllZoneInsights(input: BuildInsightsInput): ZoneAIInsight[] {
  const now = input.now ?? Date.now();
  const trends = computeZoneTrends(input.historyReadings, now);
  const lastWater = lastWateringByZone(input.activities);

  return (input.zones ?? [])
    .filter((zone) => zone.hasReading)
    .map((zone) => {
      const key = resolveZoneId(zone.backendZoneId ?? zone.visualLabel);
      return buildZoneInsight({
        greenhouseId: input.greenhouseId,
        zone,
        trend: trends.get(key) ?? { direction: 'unknown', deltaPct: null, sampleCount: 0, windowHours: TREND_WINDOW_HOURS },
        lastWateringAt: lastWater.get(key) ?? null,
        weatherCondition: input.weatherCondition ?? null,
        now,
      });
    });
}

// ─── Greenhouse summary ──────────────────────────────────────────────────────

export interface GreenhouseAICounts {
  urgent: number;
  attention: number;
  monitor: number;
  good: number;
  sensor: number;
}

export interface GreenhouseAISummary {
  headline: string;
  counts: GreenhouseAICounts;
  top: ZoneAIInsight[]; // up to 3 highest-priority
}

const SEVERITY_RANK: Record<AIInsightSeverity, number> = {
  urgent: 0,
  attention: 1,
  unknown: 2, // sensor issues
  monitor: 3,
  good: 4,
};

function countInsights(insights: ZoneAIInsight[]): GreenhouseAICounts {
  const counts: GreenhouseAICounts = { urgent: 0, attention: 0, monitor: 0, good: 0, sensor: 0 };
  for (const i of insights) {
    if (i.action === 'check_sensor' || i.severity === 'unknown') counts.sensor += 1;
    else if (i.severity === 'urgent') counts.urgent += 1;
    else if (i.severity === 'attention') counts.attention += 1;
    else if (i.severity === 'monitor') counts.monitor += 1;
    else if (i.severity === 'good') counts.good += 1;
  }
  return counts;
}

function joinNames(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/**
 * ≤ ~3 short sentences. Priority: urgent moisture/plant concerns → sensor
 * issues → zones approaching limits → all-good. Correlational only; no causal
 * claims.
 */
export function summarizeGreenhouse(insights: ZoneAIInsight[]): GreenhouseAISummary {
  const counts = countInsights(insights);
  const ranked = [...insights].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  const top = ranked.slice(0, 3);

  const sentences: string[] = [];
  const needAttention = counts.urgent + counts.attention;

  if (needAttention > 0) {
    const drier = insights
      .filter((i) => i.action === 'water_soon' || i.action === 'check_today')
      .slice(0, 2)
      .map((i) => i.zoneLabel);
    let s = `${needAttention} ${needAttention === 1 ? 'zone needs' : 'zones need'} attention today.`;
    if (drier.length) s += ` ${joinNames(drier)} ${drier.length === 1 ? 'appears' : 'appear'} drier than preferred.`;
    sentences.push(s);
  }

  if (counts.sensor > 0) {
    const sensorZone = insights.find((i) => i.action === 'check_sensor');
    sentences.push(
      counts.sensor === 1 && sensorZone
        ? `${sensorZone.zoneLabel} has a stale or unavailable sensor reading.`
        : `${counts.sensor} zones have sensor issues to check.`,
    );
  }

  if (sentences.length === 0) {
    if (insights.length === 0) {
      sentences.push('No sensor-backed zones are reporting yet.');
    } else if (counts.monitor > 0) {
      sentences.push(`All zones are within range; ${counts.monitor} ${counts.monitor === 1 ? 'is' : 'are'} worth monitoring.`);
    } else {
      sentences.push('All zones are within their preferred ranges.');
    }
  }

  return { headline: sentences.slice(0, 3).join(' '), counts, top };
}
