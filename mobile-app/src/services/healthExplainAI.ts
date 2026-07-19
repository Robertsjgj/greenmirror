/**
 * Client for /api/explain-health — the Gemini-written "why" behind the
 * Greenhouse Health card.
 *
 * GreenMirror builds the fact snapshot here, sends it to the server (which holds
 * the API key), and shapes the reply into the same ContextualInsight the
 * existing sheet renders. Failure is always safe: every error path resolves to
 * a small "couldn't explain right now" insight rather than a broken sheet.
 */

import { getAuth } from 'firebase/auth';
import type { GreenhouseModel } from '../components/trends/trendsModel';
import type { TimeRange } from '../hooks/useReadingsHistory';
import type { ContextualInsight } from './trendAIInsights';
import type { HealthExplanation, HealthSnapshot } from './healthExplain';

const TIMEOUT_MS = 30_000;

const RANGE_WORD: Record<TimeRange, string> = {
  '24h': 'today', '7d': 'this week', '30d': 'this month', '3m': 'this quarter', '1y': 'this year',
};

/** Reduce the live model to the fact snapshot the endpoint grounds on. */
export function buildHealthSnapshot(gm: GreenhouseModel, range: TimeRange): HealthSnapshot {
  const counts = gm.healthCounts();
  const prev = gm.prevHealthCounts();
  const delta = gm.ghDelta(range);

  const zones = gm.zoneList().map(({ zone, cur, status, trend }) => ({
    label: zone.label,
    status: status.kind,
    statusLabel: status.label,
    moisture: Math.round(cur.moisture),
    temp: cur.temp == null ? null : Math.round(cur.temp * 10) / 10,
    plant: cur.plant?.name ?? null,
    trend: trend.label,
  }));

  return {
    rangeLabel: RANGE_WORD[range],
    counts: { healthy: counts.healthy, watching: counts.watching, need: counts.need },
    prevCounts: prev ? { healthy: prev.healthy, watching: prev.watching, need: prev.need } : null,
    avgMoisture: gm.avgMoisture,
    avgTemp: gm.avgTemp,
    moistureDelta: delta.moisture,
    tempDelta: delta.temp,
    totalZones: zones.length,
    zones,
  };
}

function toInsight(explanation: HealthExplanation): ContextualInsight {
  return {
    id: 'greenhouse-health',
    kind: 'greenhouse',
    title: 'Greenhouse Health',
    subtitle: 'Why the beds are in this state',
    happening: explanation.happening,
    why: explanation.why,
    basedOn: explanation.basedOn,
    meaning: explanation.meaning,
    action: explanation.action,
    confidence: explanation.confidence,
    limitations: explanation.limitations,
  };
}

/** A safe, offline-friendly fallback so the sheet never renders empty. */
export function healthErrorInsight(): ContextualInsight {
  return {
    id: 'greenhouse-health',
    kind: 'greenhouse',
    title: 'Greenhouse Health',
    happening: 'GreenMirror could not write an explanation just now.',
    why: [],
    basedOn: [],
    action: 'Check your connection and tap “Explain with AI” again in a moment.',
    limitations: ['This explanation needs a connection to GreenMirror’s AI service.'],
  };
}

async function idToken(): Promise<string | null> {
  const user = getAuth().currentUser;
  return user ? user.getIdToken() : null;
}

/** Ask Gemini to explain the current greenhouse health, grounded on our facts. */
export async function explainGreenhouseHealth(
  gm: GreenhouseModel,
  range: TimeRange,
  greenhouseId: string,
): Promise<ContextualInsight> {
  const token = await idToken();
  if (!token) return healthErrorInsight();

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('/api/explain-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ greenhouseId, snapshot: buildHealthSnapshot(gm, range) }),
      signal: abort.signal,
    });
    if (!response.ok) return healthErrorInsight();

    const data = (await response.json()) as Partial<HealthExplanation>;
    if (typeof data?.happening !== 'string') return healthErrorInsight();
    return toInsight(data as HealthExplanation);
  } catch {
    return healthErrorInsight();
  } finally {
    clearTimeout(timer);
  }
}
