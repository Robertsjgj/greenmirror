/**
 * Client for /api/plant-profile — the AI estimate for a plant the GreenMirror
 * workbook does not contain.
 *
 * Failure is always safe here: every error path returns null, and the editor
 * falls back to manual range entry rather than showing a value nobody stands
 * behind.
 */

import { getAuth } from 'firebase/auth';
import type { AiProfileResult } from '../plantAiProfile';

const TIMEOUT_MS = 60_000; // web research is slow; a spinner covers it

async function idToken(): Promise<string | null> {
  const user = getAuth().currentUser;
  return user ? user.getIdToken() : null;
}

/** Estimate a profile, or null when GreenMirror cannot honestly produce one. */
export async function estimatePlantProfile(plantName: string): Promise<AiProfileResult | null> {
  const token = await idToken();
  if (!token) return null;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('/api/plant-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plantName }),
      signal: abort.signal,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as Partial<AiProfileResult>;
    return data?.profile ? { profile: data.profile, sources: data.sources ?? [] } : null;
  } catch {
    return null; // offline, timed out, or the endpoint is not deployed
  } finally {
    clearTimeout(timer);
  }
}
