/**
 * Firestore-backed notifications history service.
 *
 * Stores every alert the app has raised in the `notifications` collection so
 * that resolved alerts persist as history. Each document is keyed by
 * `${greenhouseId}__${alertId}` (deterministic → idempotent upserts, no dupes).
 *
 *   notifications/{greenhouseId__alertId}
 *     greenhouseId, alertId, type, severity, title, message, action,
 *     zoneId, displayLabel, plantName,
 *     status: 'active' | 'resolved',
 *     createdAt, createdAtMs (exact ms), updatedAt, resolvedAt
 *
 * Resolution is automatic: App marks a notification 'resolved' when its alert
 * is no longer active (conditions improved). There is no manual resolve.
 *
 * All functions are no-ops / return null when Firebase is not configured — the
 * app falls back to a localStorage notifications store (see App.tsx).
 */

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from './firebase';

export type NotificationStatus = 'active' | 'resolved';

export interface NotificationDoc {
  id: string;              // firestore doc id
  greenhouseId: string;
  alertId: string;
  type: string;
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  action?: string;
  zoneId: string;
  displayLabel?: string;
  plantName?: string;
  status: NotificationStatus;
  createdAt?: string;      // ISO
  updatedAt?: string;      // ISO
  resolvedAt?: string;     // ISO (set when status becomes 'resolved')
}

export interface NotificationInput {
  alertId: string;
  type: string;
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  action?: string;
  zoneId: string;
  displayLabel?: string;
  plantName?: string;
}

const docId = (greenhouseId: string, alertId: string) =>
  `${greenhouseId}__${alertId}`.replace(/\//g, '_');

const iso = (v: unknown): string | undefined => {
  const d = (v as { toDate?: () => Date } | null | undefined)?.toDate?.();
  return d ? d.toISOString() : undefined;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to all notifications (active + resolved) for a greenhouse in real
 * time. Single equality filter → no composite index required; callers sort
 * client-side. Returns null when Firebase is not configured.
 */
export function subscribeToNotifications(
  greenhouseId: string,
  onData: (docs: NotificationDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db) return null;

  const q = query(
    collection(db, 'notifications'),
    where('greenhouseId', '==', greenhouseId),
  );

  return onSnapshot(
    q,
    (snap) => {
      const docs: NotificationDoc[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          greenhouseId: (data.greenhouseId ?? greenhouseId) as string,
          alertId: (data.alertId ?? '') as string,
          type: (data.type ?? 'sensor') as string,
          severity: (data.severity ?? 'warning') as 'critical' | 'warning',
          title: (data.title ?? '') as string,
          message: (data.message ?? '') as string,
          action: data.action as string | undefined,
          zoneId: (data.zoneId ?? '') as string,
          displayLabel: data.displayLabel as string | undefined,
          plantName: data.plantName as string | undefined,
          status: (data.status ?? 'active') as NotificationStatus,
          // Prefer the exact client millisecond timestamp captured at creation;
          // fall back to the server timestamp. Both are millisecond-precise.
          createdAt: (typeof data.createdAtMs === 'number'
            ? new Date(data.createdAtMs).toISOString()
            : undefined) ?? iso(data.createdAt),
          updatedAt: iso(data.updatedAt),
          resolvedAt: iso(data.resolvedAt),
        };
      });
      onData(docs);
    },
    (err) => {
      console.warn(
        '[notificationsService] Firestore listen error:', err.message,
        '\n  Ensure Firestore rules allow read/write to the notifications collection.',
      );
      onError?.(err instanceof Error ? err : new Error(String(err)));
    },
  );
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upsert a notification as ACTIVE. `isNew` controls whether createdAt is set
 * (only on first creation / re-activation). Fire-and-forget.
 */
export async function upsertActiveNotification(
  greenhouseId: string,
  input: NotificationInput,
  isNew: boolean,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    // Firestore rejects undefined — omit optional fields that are absent.
    const optional: Record<string, string> = {};
    if (input.action)       optional.action = input.action;
    if (input.displayLabel) optional.displayLabel = input.displayLabel;
    if (input.plantName)    optional.plantName = input.plantName;

    await setDoc(
      doc(db, 'notifications', docId(greenhouseId, input.alertId)),
      {
        greenhouseId,
        alertId: input.alertId,
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        zoneId: input.zoneId,
        ...optional,
        status: 'active',
        updatedAt: serverTimestamp(),
        // Store the full millisecond timestamp of when the notification came in
        // (client clock, exact) alongside the authoritative server timestamp.
        ...(isNew ? { createdAt: serverTimestamp(), createdAtMs: Date.now() } : {}),
      },
      { merge: true },
    );
    return true;
  } catch (err) {
    console.warn('[notificationsService] upsert failure:', err);
    return false;
  }
}

/** Mark a notification RESOLVED (conditions improved). Fire-and-forget. */
export async function resolveNotification(
  greenhouseId: string,
  alertId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await setDoc(
      doc(db, 'notifications', docId(greenhouseId, alertId)),
      { status: 'resolved', resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true },
    );
    return true;
  } catch (err) {
    console.warn('[notificationsService] resolve failure:', err);
    return false;
  }
}
