/**
 * Shared, node-safe pieces for the "Explain with AI" button on the Greenhouse
 * Health card (Trends → Overview).
 *
 * GreenMirror computes the hard facts (how many beds are healthy / to monitor /
 * need attention, the average soil moisture and temperature, and a short per-bed
 * list) and hands them to Gemini. Gemini's ONLY job is to explain, in plain,
 * family-friendly language, WHY the greenhouse is in this state — it never sees
 * a sensor stream, never invents a number, and never contradicts the counts we
 * gave it. That keeps the same honesty contract the rest of GreenMirror's AI
 * follows: explain the data the user is already looking at, nothing more.
 *
 * This module has no browser or Firebase imports so the serverless endpoint can
 * pull the types, the prompt, and the output schema from it directly.
 */

/** One bed, reduced to the few facts the explanation is allowed to lean on. */
export interface HealthZoneFact {
  label: string;
  /** GreenMirror's own status bucket for the bed. */
  status: 'need' | 'wet' | 'healthy';
  /** The exact status wording shown in the UI, e.g. "Needs water". */
  statusLabel: string;
  moisture: number;
  temp: number | null;
  plant: string | null;
  /** Short moisture-trend wording, e.g. "Getting drier". */
  trend: string;
}

/** The complete set of facts GreenMirror hands to the model. Nothing else. */
export interface HealthSnapshot {
  /** Word for the compared window, e.g. "today". */
  rangeLabel: string;
  counts: { healthy: number; watching: number; need: number };
  /** Yesterday's counts, when history exists — lets the model explain change. */
  prevCounts: { healthy: number; watching: number; need: number } | null;
  avgMoisture: number;
  avgTemp: number | null;
  /** Change in average moisture over the window (percentage points). */
  moistureDelta: number;
  /** Change in average soil temperature over the window (°C), when known. */
  tempDelta: number | null;
  totalZones: number;
  zones: HealthZoneFact[];
}

/** The explanation the model returns — the section model the sheet renders. */
export interface HealthExplanation {
  /** "What is happening?" — one sentence. */
  happening: string;
  /** "Why?" — short bullets, each grounded in a provided fact. */
  why: string[];
  /** "Based on" — the data GreenMirror actually read. */
  basedOn: string[];
  /** "What this means" — one sentence. */
  meaning: string;
  /** "Suggested action" — one sentence. */
  action: string;
  confidence: { level: 'high' | 'moderate' | 'low'; reason: string };
  limitations: string[];
}

/** JSON Schema handed to Gemini so the reply is always the shape above. */
export const HEALTH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    happening: { type: 'string', description: 'One plain sentence: the overall state of the greenhouse right now.' },
    why: {
      type: 'array',
      description: '2–4 short bullets, each grounded in a provided number. Never invent figures.',
      items: { type: 'string' },
    },
    basedOn: {
      type: 'array',
      description: 'The data GreenMirror read, e.g. "The latest soil reading from each bed".',
      items: { type: 'string' },
    },
    meaning: { type: 'string', description: 'One sentence on what this means for the grower.' },
    action: { type: 'string', description: 'One calm, practical next step. Never invent a watering volume.' },
    confidence: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['high', 'moderate', 'low'] },
        reason: { type: 'string', description: 'Why the evidence supports this level — never a probability.' },
      },
      required: ['level', 'reason'],
    },
    limitations: {
      type: 'array',
      description: 'What this read cannot account for. At least one.',
      items: { type: 'string' },
    },
  },
  required: ['happening', 'why', 'basedOn', 'meaning', 'action', 'confidence', 'limitations'],
} as const;

function zoneLine(z: HealthZoneFact): string {
  const temp = z.temp == null ? 'temp n/a' : `${z.temp}°C`;
  const plant = z.plant ? z.plant : 'no plant assigned';
  return `- ${z.label}: ${z.statusLabel} (${z.moisture}% moisture, ${temp}, ${z.trend}) — ${plant}`;
}

/** Builds the grounded prompt. Every figure the model may use appears here. */
export function buildHealthPrompt(s: HealthSnapshot): string {
  const changed = s.prevCounts
    ? `Yesterday: ${s.prevCounts.healthy} healthy, ${s.prevCounts.watching} to monitor, ${s.prevCounts.need} needing attention.`
    : 'No comparison against yesterday is available.';
  const tempLine = s.avgTemp == null
    ? 'Average soil temperature is not available.'
    : `Average soil temperature: ${s.avgTemp}°C (${s.tempDelta == null ? 'no change figure' : `${s.tempDelta >= 0 ? '+' : ''}${s.tempDelta}°C ${s.rangeLabel}`}).`;

  return `You are GreenMirror's assistant, explaining a greenhouse's health to a family — including children — who grow plants at home. Be warm, calm, and clear. Use short sentences and no jargon.

You are explaining ONE card: the Greenhouse Health summary. Explain WHY the greenhouse is in the state shown, using ONLY the facts below. Do not invent any number, plant fact, or reading. Do not recommend a specific amount of water. If the facts are limited, say so plainly instead of guessing.

FACTS (the only things you may rely on):
- Beds total: ${s.totalZones}.
- Right now: ${s.counts.healthy} healthy, ${s.counts.watching} to monitor, ${s.counts.need} needing attention.
- ${changed}
- Average soil moisture: ${s.avgMoisture}% (${s.moistureDelta >= 0 ? '+' : ''}${s.moistureDelta}% ${s.rangeLabel}).
- ${tempLine}
- Per bed:
${s.zones.map(zoneLine).join('\n')}

Write the explanation as the required JSON. "why" should point at the beds and numbers above. "basedOn" should name the data sources (soil readings per bed, saved plant ranges). "confidence" reflects how much evidence there is (more beds and a yesterday comparison = higher). "limitations" must include that conditions change between readings, and that GreenMirror cannot measure how much water is applied by hose.`;
}

/** Signature that is identical iff the explanation would be identical. */
export function healthSignature(s: HealthSnapshot): string {
  const zones = [...s.zones]
    .map((z) => `${z.label}:${z.status}:${z.trend}`)
    .sort()
    .join('|');
  return [
    s.counts.healthy, s.counts.watching, s.counts.need,
    s.prevCounts ? `${s.prevCounts.healthy},${s.prevCounts.watching},${s.prevCounts.need}` : 'none',
    Math.round(s.avgMoisture / 2) * 2,
    s.avgTemp == null ? 'na' : Math.round(s.avgTemp),
    Math.sign(s.moistureDelta),
    zones,
  ].join('~');
}
