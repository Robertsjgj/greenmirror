/**
 * GreenMirror AI — pilot feedback (greenhouse-scoped Firestore).
 *
 * Stores lightweight "was this helpful?" feedback in the `aiFeedback`
 * collection. Uses a deterministic document id so repeated taps from the same
 * user on the same insight overwrite rather than pile up duplicates. Never
 * stores copies of sensor readings.
 */

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';
import { sanitizeFirestoreId } from './wateringVerificationCore';

export type AIFeedbackInsightType = 'zone_recommendation' | 'greenhouse_summary';

export type AIFeedbackReason =
  | 'recommendation_clear'
  | 'recommendation_inaccurate'
  | 'missing_information'
  | 'not_practical'
  | 'other';

export interface AIFeedbackInput {
  greenhouseId: string;
  zoneId?: string;
  insightType: AIFeedbackInsightType;
  recommendationAction?: string;
  helpful: boolean;
  reason?: AIFeedbackReason;
  userId?: string;
}

/**
 * Deterministic id: one feedback record per (greenhouse, insightType, zone,
 * user). Re-submitting updates the same document → no duplicates.
 */
export function aiFeedbackDocId(input: {
  greenhouseId: string;
  insightType: AIFeedbackInsightType;
  zoneId?: string;
  userId?: string;
}): string {
  const scope = input.insightType === 'greenhouse_summary' ? 'summary' : input.zoneId ?? 'unknown-zone';
  const user = input.userId ?? 'anon';
  return sanitizeFirestoreId(`${input.greenhouseId}__${input.insightType}__${scope}__${user}`);
}

/**
 * Submit (or update) pilot feedback. No-op returning false when Firestore is
 * unavailable. Fire-and-forget friendly.
 */
export async function submitAIFeedback(input: AIFeedbackInput): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const id = aiFeedbackDocId(input);
  const record: Record<string, unknown> = {
    greenhouseId: input.greenhouseId,
    insightType: input.insightType,
    insightVersion: 'greenmirror-ai-v1',
    helpful: input.helpful,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  if (input.zoneId) record.zoneId = input.zoneId;
  if (input.recommendationAction) record.recommendationAction = input.recommendationAction;
  if (input.reason) record.reason = input.reason;
  if (input.userId) record.userId = input.userId;

  try {
    // merge:true keeps the original createdAt if the doc already exists.
    await setDoc(doc(db, 'aiFeedback', id), record, { merge: true });
    return true;
  } catch (err) {
    console.warn('[aiFeedback] write failed (non-fatal):', (err as Error).message);
    return false;
  }
}
