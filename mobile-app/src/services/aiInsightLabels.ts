/**
 * Presentation labels/colors for GreenMirror AI insights. Pure, no Firebase.
 * Kept separate from the engine so both the Home card and the full view share
 * one source of truth for wording.
 */

import type { AIConfidence, AIInsightAction, AIInsightSeverity } from './aiInsights';

export const ACTION_LABEL: Record<AIInsightAction, string> = {
  water_soon: 'Water soon',
  check_today: 'Check today',
  monitor: 'Monitor',
  no_watering_needed: 'No watering needed',
  check_sensor: 'Check sensor',
  review_plant: 'Review plant',
  view_trends: 'View trends',
};

export interface SeverityMeta {
  label: string;
  fg: string;
  bg: string;
  border: string;
}

export const SEVERITY_META: Record<AIInsightSeverity, SeverityMeta> = {
  urgent: { label: 'Urgent', fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  attention: { label: 'Attention', fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  monitor: { label: 'Monitor', fg: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  good: { label: 'Doing well', fg: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  unknown: { label: 'Sensor', fg: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
};

export const CONFIDENCE_LABEL: Record<AIConfidence, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

export const EVIDENCE_STATUS_COLOR: Record<string, string> = {
  positive: '#15803d',
  warning: '#b45309',
  negative: '#b91c1c',
  neutral: '#475569',
};

/** Human wording for a Phase-1 watering verification state (unmetered hose). */
export function verificationNote(status: string | undefined | null): string | null {
  switch (status) {
    case 'pending_verification':
      return 'A watering action was recorded. GreenMirror is waiting for additional sensor evidence.';
    case 'verified':
      return 'A moisture increase was detected after the watering action.';
    case 'not_verified':
      return 'GreenMirror did not detect a meaningful moisture increase. The watering record remains saved.';
    case 'sensor_unavailable':
      return 'GreenMirror could not evaluate the watering response because valid sensor data was unavailable.';
    default:
      return null;
  }
}
