import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDb, FieldValue } from "../_firebaseAdmin";

type UserRole = "admin" | "user";

interface CreateUserBody {
  username?: string;
  displayName?: string;
  password?: string;
  role?: UserRole;
}

const USERNAME_DOMAIN = "greenmirror.local";

function usernameToEmail(username: string): string {
  return `${username}@${USERNAME_DOMAIN}`;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,40}$/.test(username);
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

  if (req.method !== "POST") {
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

    if (!requester?.active || requester.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Only active admins can create users" });
    }

    const requesterGreenhouseId = requester.greenhouseId;

    if (!requesterGreenhouseId || typeof requesterGreenhouseId !== "string") {
      return res
        .status(400)
        .json({ error: "Admin profile is missing greenhouseId" });
    }

    const body = req.body as CreateUserBody;
    const username = normalizeUsername(body.username ?? "");
    const displayName = (body.displayName ?? "").trim();
    const password = body.password ?? "";
    const role = body.role;

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error:
          "Username must be 3–40 characters and use only lowercase letters, numbers, dots, underscores, or hyphens.",
      });
    }

    if (!displayName) {
      return res.status(400).json({ error: "Display name is required" });
    }

    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    if (!isValidRole(role)) {
      return res.status(400).json({ error: "Role must be admin or user" });
    }

    const email = usernameToEmail(username);

    const createdUser = await adminAuth.createUser({
      email,
      password,
      displayName,
      disabled: false,
    });

    await adminAuth.setCustomUserClaims(createdUser.uid, {
      role,
      greenhouseId: requesterGreenhouseId,
    });

    const profile = {
      uid: createdUser.uid,
      username,
      displayName,
      role,
      greenhouseId: requesterGreenhouseId,
      active: true,
      createdBy: requesterUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("users").doc(createdUser.uid).set(profile);

    return res.status(201).json({
      user: {
        ...profile,
        createdAt: null,
        updatedAt: null,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create user";

    if (message.includes("auth/email-already-exists")) {
      return res
        .status(409)
        .json({ error: "A user with this username already exists" });
    }

    console.error("[create-user] failed:", err);

    return res.status(500).json({ error: message });
  }
}
