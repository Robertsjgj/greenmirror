/**
 * POST /api/explain-health — a plain-language, grounded explanation of the
 * Greenhouse Health card (Trends → Overview).
 *
 * GreenMirror computes the facts (healthy / monitor / needs-attention counts,
 * average moisture and temperature, and a short per-bed list) and sends them in
 * the request. Gemini turns those facts into a warm, family-friendly "why",
 * grounded strictly on what we sent — it never sees a sensor stream and is told
 * never to invent a number. Runs server-side so the API key never reaches the
 * PWA. No user data beyond the health snapshot leaves GreenMirror.
 *
 * Results are cached in Firestore under a signature of the snapshot, so an
 * unchanged greenhouse state is explained once and every later view reads the
 * cache — no repeat calls, and two viewers of the same state see the same words.
 */

import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { adminAuth, adminDb, FieldValue } from './_firebaseAdmin';
import {
  buildHealthPrompt, healthSignature, HEALTH_OUTPUT_SCHEMA,
  type HealthExplanation, type HealthSnapshot, type HealthZoneFact,
} from '../src/services/healthExplain';

const MODEL = 'gemini-3.5-flash';
const CACHE_COLLECTION = 'aiHealthExplanations';
const MAX_ZONES = 60;

const HOSE_CAVEAT = 'GreenMirror cannot measure how much water is applied by hose.';
const CHANGE_CAVEAT = 'Conditions can change between sensor readings.';

function bearer(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const asStr = (v: unknown, max = 80): string => (typeof v === 'string' ? v : '').trim().slice(0, max);

/** Accept only the exact fact shape; reject anything malformed rather than guess. */
function parseSnapshot(body: unknown): HealthSnapshot | null {
  const b = body as Record<string, unknown> | null;
  const raw = b?.snapshot as Record<string, unknown> | undefined;
  if (!raw) return null;

  const counts = raw.counts as Record<string, unknown> | undefined;
  if (!counts || !isNum(counts.healthy) || !isNum(counts.watching) || !isNum(counts.need)) return null;
  if (!isNum(raw.avgMoisture) || !isNum(raw.totalZones)) return null;
  if (!Array.isArray(raw.zones)) return null;

  const prev = raw.prevCounts as Record<string, unknown> | undefined;
  const prevCounts = prev && isNum(prev.healthy) && isNum(prev.watching) && isNum(prev.need)
    ? { healthy: prev.healthy, watching: prev.watching, need: prev.need }
    : null;

  const zones: HealthZoneFact[] = (raw.zones as unknown[]).slice(0, MAX_ZONES).map((z) => {
    const r = z as Record<string, unknown>;
    const status = r.status === 'need' || r.status === 'wet' || r.status === 'healthy' ? r.status : 'healthy';
    return {
      label: asStr(r.label) || 'Bed',
      status,
      statusLabel: asStr(r.statusLabel) || 'Good',
      moisture: isNum(r.moisture) ? Math.round(r.moisture) : 0,
      temp: isNum(r.temp) ? Math.round(r.temp * 10) / 10 : null,
      plant: asStr(r.plant) || null,
      trend: asStr(r.trend, 40) || 'Stable',
    };
  });

  return {
    rangeLabel: asStr(raw.rangeLabel, 24) || 'today',
    counts: { healthy: counts.healthy, watching: counts.watching, need: counts.need },
    prevCounts,
    avgMoisture: Math.round(raw.avgMoisture),
    avgTemp: isNum(raw.avgTemp) ? Math.round(raw.avgTemp * 10) / 10 : null,
    moistureDelta: isNum(raw.moistureDelta) ? Math.round(raw.moistureDelta) : 0,
    tempDelta: isNum(raw.tempDelta) ? Math.round(raw.tempDelta * 10) / 10 : null,
    totalZones: Math.round(raw.totalZones),
    zones,
  };
}

/** Guarantee the honesty caveats survive even if the model drops them. */
function sanitize(candidate: unknown): HealthExplanation | null {
  const c = candidate as Partial<HealthExplanation> | null;
  if (!c || typeof c.happening !== 'string' || typeof c.meaning !== 'string' || typeof c.action !== 'string') {
    return null;
  }
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : [];

  const limitations = strList(c.limitations);
  for (const caveat of [CHANGE_CAVEAT, HOSE_CAVEAT]) {
    if (!limitations.some((l) => l.toLowerCase().includes(caveat.slice(0, 20).toLowerCase()))) {
      limitations.push(caveat);
    }
  }
  const level = c.confidence?.level;
  return {
    happening: c.happening.trim(),
    why: strList(c.why),
    basedOn: strList(c.basedOn).length ? strList(c.basedOn) : ['The latest soil reading from each bed'],
    meaning: c.meaning.trim(),
    action: c.action.trim(),
    confidence: {
      level: level === 'high' || level === 'moderate' || level === 'low' ? level : 'moderate',
      reason: typeof c.confidence?.reason === 'string' ? c.confidence.reason.trim() : 'Based on the current readings for each bed.',
    },
    limitations,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Signed-in users only — this endpoint calls out to a rate-limited service.
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'Missing authorization token' });
    await adminAuth.verifyIdToken(token);

    const snapshot = parseSnapshot(req.body);
    if (!snapshot) return res.status(400).json({ error: 'A valid health snapshot is required' });

    const greenhouseId = String((req.body as { greenhouseId?: string })?.greenhouseId ?? 'gh').slice(0, 64);
    const sig = createHash('sha1').update(`${greenhouseId}~${healthSignature(snapshot)}`).digest('hex');
    const cacheRef = adminDb.collection(CACHE_COLLECTION).doc(sig);

    const cached = await cacheRef.get();
    if (cached.exists) {
      return res.status(200).json({ ...cached.data()?.result, cached: true });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI explanations are not configured on this server' });
    }

    const client = new GoogleGenAI({ apiKey });
    const interaction = await client.interactions.create({
      model: MODEL,
      input: buildHealthPrompt(snapshot),
      response_format: { type: 'text', mime_type: 'application/json', schema: HEALTH_OUTPUT_SCHEMA },
    });

    if (!interaction.output_text) {
      return res.status(422).json({ error: 'no_explanation' });
    }

    const explanation = sanitize(JSON.parse(interaction.output_text));
    if (!explanation) return res.status(422).json({ error: 'no_explanation' });

    await cacheRef.set({
      greenhouseId,
      result: explanation,
      model: MODEL,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ...explanation, cached: false });
  } catch (err) {
    console.error('[explain-health] failed:', err);
    return res.status(500).json({ error: 'Could not explain the greenhouse health right now' });
  }
}
