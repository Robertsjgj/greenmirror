import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getFirebaseAuth, getDb } from "./firebase";
import type { UserRole } from "./userService";

export interface AdminUserRecord {
  uid: string;
  username: string;
  displayName: string;
  role: UserRole;
  greenhouseId: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  uid: string;
  role?: UserRole;
  active?: boolean;
}

export interface ResetPasswordInput {
  uid: string;
  password: string;
}

function noopUnsubscribe(): void {
  return undefined;
}

async function getAdminToken(): Promise<string> {
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;

  if (!currentUser) {
    throw new Error("You must be signed in as an admin.");
  }

  return currentUser.getIdToken();
}

export function subscribeUsersForGreenhouse(
  greenhouseId: string,
  onUsers: (users: AdminUserRecord[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const db = getDb();

  if (!db) {
    onUsers([]);
    return noopUnsubscribe;
  }

  const usersQuery = query(
    collection(db, "users"),
    where("greenhouseId", "==", greenhouseId),
  );

  return onSnapshot(
    usersQuery,
    (snapshot) => {
      const users = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data() as AdminUserRecord;

          return {
            ...data,
            uid: data.uid || docSnap.id,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      onUsers(users);
    },
    (error) => {
      if (onError) onError(error);
    },
  );
}

export async function createUserAsAdmin(
  input: CreateUserInput,
): Promise<AdminUserRecord> {
  const token = await getAdminToken();

  const response = await fetch("/api/admin/create-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Request failed with HTTP ${response.status}`,
    );
  }

  return data.user as AdminUserRecord;
}

export async function updateUserAsAdmin(
  input: UpdateUserInput,
): Promise<AdminUserRecord> {
  const token = await getAdminToken();

  const response = await fetch("/api/admin/update-user", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Request failed with HTTP ${response.status}`,
    );
  }

  return data.user as AdminUserRecord;
}

export async function resetUserPasswordAsAdmin(
  input: ResetPasswordInput,
): Promise<void> {
  const token = await getAdminToken();

  const response = await fetch("/api/admin/reset-password", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Request failed with HTTP ${response.status}`,
    );
  }
}
