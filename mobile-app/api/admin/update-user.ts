import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDb, FieldValue } from "../_firebaseAdmin";

type UserRole = "admin" | "user";

interface UpdateUserBody {
  uid?: string;
  role?: UserRole;
  active?: boolean;
}

function isValidRole(role: unknown): role is UserRole {
  return role === "admin" || role === "user";
}

function getBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({ error: "Missing authorization token" });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const requesterUid = decodedToken.uid;

    const requesterSnap = await adminDb
      .collection("users")
      .doc(requesterUid)
      .get();

    if (!requesterSnap.exists) {
      return res.status(403).json({ error: "Requester profile not found" });
    }

    const requester = requesterSnap.data();

    if (!requester) {
      return res
        .status(403)
        .json({ error: "Requester profile data not found" });
    }

    if (!requester.active || requester.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only active admins can update users" });
    }

    const body = req.body as UpdateUserBody;
    const targetUid = body.uid;

    if (!targetUid) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (targetUid === requesterUid && body.active === false) {
      return res
        .status(400)
        .json({ error: "You cannot deactivate your own admin account" });
    }

    if (targetUid === requesterUid && body.role === "user") {
      return res
        .status(400)
        .json({ error: "You cannot remove your own admin role" });
    }

    const targetRef = adminDb.collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const target = targetSnap.data();

    if (!target) {
      return res.status(404).json({ error: "User profile data not found" });
    }

    if (target.greenhouseId !== requester.greenhouseId) {
      return res
        .status(403)
        .json({ error: "You can only manage users in your greenhouse" });
    }

    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    const nextRole = body.role ?? target.role;
    const nextActive =
      typeof body.active === "boolean" ? body.active : target.active;

    if (body.role !== undefined) {
      if (!isValidRole(body.role)) {
        return res.status(400).json({ error: "Role must be admin or user" });
      }

      updates.role = body.role;
    }

    if (typeof body.active === "boolean") {
      updates.active = body.active;

      await adminAuth.updateUser(targetUid, {
        disabled: !body.active,
      });
    }

    await adminAuth.setCustomUserClaims(targetUid, {
      role: nextRole,
      greenhouseId: target.greenhouseId,
    });

    await targetRef.update(updates);

    return res.status(200).json({
      user: {
        ...target,
        uid: targetUid,
        role: nextRole,
        active: nextActive,
        updatedAt: null,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not update user";
    console.error("[update-user] failed:", err);
    return res.status(500).json({ error: message });
  }
}
