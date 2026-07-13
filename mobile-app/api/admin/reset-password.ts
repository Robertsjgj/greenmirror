import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDb, FieldValue } from "../_firebaseAdmin.js";

interface ResetPasswordBody {
  uid?: string;
  password?: string;
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
        .json({ error: "Only active admins can reset passwords" });
    }

    const body = req.body as ResetPasswordBody;
    const targetUid = body.uid;
    const password = body.password ?? "";

    if (!targetUid) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ error: "Temporary password must be at least 6 characters" });
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
        .json({ error: "You can only reset users in your greenhouse" });
    }

    await adminAuth.updateUser(targetUid, {
      password,
    });

    await targetRef.update({
      passwordResetAt: FieldValue.serverTimestamp(),
      passwordResetBy: requesterUid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      ok: true,
      uid: targetUid,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not reset password";
    console.error("[reset-password] failed:", err);
    return res.status(500).json({ error: message });
  }
}
