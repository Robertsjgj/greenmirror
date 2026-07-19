/**
 * POST /api/plant-profile — estimate a moisture/soil-temperature range for a
 * plant that is NOT in the GreenMirror workbook.
 *
 * Gemini researches the plant with Google Search grounding, then places it on
 * the GreenMirror sensor scale by anchoring it to the closest crop the workbook
 * already has (the workbook table is handed to the model as its calibration
 * reference). Google's free tier covers this; there is no per-call cost.
 *
 * Runs server-side because the API key must never reach the PWA. Results are
 * cached in Firestore per plant name, so each unknown plant is researched once
 * and every later user reads the cache — no repeat calls (which also keeps us
 * far inside the free-tier rate limit), and two users never see different
 * ranges for the same plant.
 *
 * Only a plant name and the workbook table are ever sent to Google. No sensor
 * readings, no greenhouse data, and no user data leave GreenMirror.
 *
 * The result is always provisional: it is labelled "AI-estimated starting range
 * — please review", carries requiresUserReview, and is rejected outright by
 * `validateAiPlantProfile` if it isn't anchored to a workbook plant, isn't
 * sourced, or falls outside the workbook's scale. A rejection sends the user to
 * manual entry, which is the honest outcome when we can't ground the numbers.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { adminAuth, adminDb, FieldValue } from './_firebaseAdmin';
import { normalizeRequirementName, findPlantRequirementByName } from '../src/plantRequirements';
import {
  validateAiPlantProfile, workbookAnchorTable,
  type AiProfileCandidate, type AiProfileSource,
} from '../src/plantAiProfile';

const MODEL = 'gemini-3.5-flash';
const CACHE_COLLECTION = 'aiPlantProfiles';

function buildPrompt(plantName: string): string {
  return `You estimate soil requirements for GreenMirror, a greenhouse monitoring app used by families and children.

GreenMirror measures soil moisture on its OWN calibrated sensor scale where 100% means FIELD CAPACITY — the water the soil holds after excess has drained. This is NOT the same number as volumetric water content (VWC). You must never copy a raw VWC percentage from a website straight onto the GreenMirror scale — 30% VWC is not 30% on GreenMirror.

Instead, translate through the workbook below. For each calibrated crop it gives that crop's real loam VWC range AND the GreenMirror moisture range that VWC was calibrated to, so the two are paired. Use that pairing as your conversion key:

id | plant | loam VWC -> GreenMirror moisture | soil temp
${workbookAnchorTable()}

Method:
1. Search the web for this plant's soil water requirement. Prefer a loam volumetric water content (VWC) range in percent; if you can only find a qualitative need (dry / moderate / moist / wet), use that.
2. Find the workbook crop whose loam VWC (or qualitative wetness) is closest to this plant's. That crop is your anchor (basedOn).
3. Translate: read across from the anchor's VWC to its GreenMirror moisture range, then nudge up or down in proportion to how this plant's VWC compares to the anchor's. Wetter-loving plant than the anchor -> higher GreenMirror range; drier -> lower. Moisture max must never exceed 100.
4. Give a soil temperature range in Celsius from the sources you read.

Rules:
- basedOn must be one of the ids in the table above, exactly as written.
- Only cite pages you actually opened. Never invent a URL.
- If you cannot find real information about this plant, or it is not a plant, set recognized to false. Returning nothing is correct and expected; a guess is not.
- Never claim the range is verified. It is a starting point for the user to review.
- In rationale, name the anchor crop and briefly state how this plant's water need compares to it (wetter / similar / drier).

Plant to estimate: ${plantName}`;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    recognized: { type: 'boolean', description: 'False if this is not a real plant or nothing could be found.' },
    canonicalName: { type: 'string', description: 'The common name of the plant, e.g. "Potatoes".' },
    basedOn: { type: 'string', description: 'The id of the calibrated GreenMirror crop used as the anchor.' },
    rationale: { type: 'string', description: 'One sentence: why that crop is the closest anchor.' },
    moistureMin: { type: 'integer', description: 'GreenMirror sensor scale, 0-100.' },
    moistureMax: { type: 'integer', description: 'GreenMirror sensor scale, never above 100.' },
    soilTempMin: { type: 'integer', description: 'Degrees Celsius.' },
    soilTempMax: { type: 'integer', description: 'Degrees Celsius.' },
    limitations: { type: 'string', description: 'One sentence on what this estimate cannot account for.' },
    sources: {
      type: 'array',
      description: 'The pages actually read. At least one.',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, url: { type: 'string' } },
        required: ['title', 'url'],
      },
    },
  },
  required: [
    'recognized', 'canonicalName', 'basedOn', 'rationale',
    'moistureMin', 'moistureMax', 'soilTempMin', 'soilTempMax', 'limitations', 'sources',
  ],
};

function bearer(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/**
 * Pull the grounding citations Google actually recorded, rather than trusting
 * the URLs the model typed into its own JSON. Walks the response defensively —
 * the citation shape is a preview surface, so a shape change must degrade to
 * "no citations" (and therefore a rejected estimate), never throw.
 */
function extractGroundedSources(response: unknown): AiProfileSource[] {
  const found = new Map<string, AiProfileSource>();

  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1));
      return;
    }
    const record = node as Record<string, unknown>;
    const url = typeof record.url === 'string' ? record.url : null;
    if (url && /^https?:\/\/\S+$/i.test(url)) {
      const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : url;
      if (!found.has(url)) found.set(url, { title, url });
    }
    Object.values(record).forEach((value) => walk(value, depth + 1));
  };

  walk(response, 0);
  return [...found.values()];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Signed-in users only — this endpoint calls out to a rate-limited service.
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'Missing authorization token' });
    await adminAuth.verifyIdToken(token);

    const plantName = String((req.body as { plantName?: string })?.plantName ?? '').trim();
    if (!plantName || plantName.length > 60) {
      return res.status(400).json({ error: 'A plant name is required' });
    }

    // The workbook wins. We never spend a call on a plant we already have.
    if (findPlantRequirementByName(plantName)) {
      return res.status(409).json({ error: 'This plant is already in the GreenMirror plant table' });
    }

    const slug = normalizeRequirementName(plantName).replace(/\s+/g, '-');
    const cacheRef = adminDb.collection(CACHE_COLLECTION).doc(slug);

    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data();
      if (data?.rejected) {
        return res.status(422).json({ error: data.reason ? String(data.reason) : 'not_estimable' });
      }
      return res.status(200).json({ ...data?.result, cached: true });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI estimation is not configured on this server' });
    }

    const client = new GoogleGenAI({ apiKey });
    const interaction = await client.interactions.create({
      model: MODEL,
      input: buildPrompt(plantName),
      tools: [{ type: 'google_search' }],
      response_format: { type: 'text', mime_type: 'application/json', schema: OUTPUT_SCHEMA },
    });

    // A grounded turn can end without text (e.g. the model only searched).
    // Treat that as "no estimate", not as a crash.
    if (!interaction.output_text) {
      return res.status(422).json({ error: 'not_estimable' });
    }
    const candidate = JSON.parse(interaction.output_text) as AiProfileCandidate;

    // Prefer the citations Google recorded over the ones the model typed.
    const grounded = extractGroundedSources(interaction);
    if (grounded.length > 0) candidate.sources = grounded;

    const validated = validateAiPlantProfile(candidate, plantName);

    if (!validated.ok) {
      // Cache the refusal too — re-researching a plant we already failed on
      // just spends another call to fail again.
      await cacheRef.set({
        rejected: true,
        reason: validated.reason,
        requestedName: plantName,
        createdAt: FieldValue.serverTimestamp(),
      });
      return res.status(422).json({ error: validated.reason });
    }

    await cacheRef.set({
      rejected: false,
      requestedName: plantName,
      result: validated.value,
      model: MODEL,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ...validated.value, cached: false });
  } catch (err) {
    console.error('[plant-profile] failed:', err);
    return res.status(500).json({ error: 'Could not estimate a profile for this plant' });
  }
}
