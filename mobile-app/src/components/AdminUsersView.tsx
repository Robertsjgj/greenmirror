import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  KeyRound,
} from "lucide-react";
import { AddUserSheet } from "./AddUserSheet";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../services/userService";
import {
  subscribeUsersForGreenhouse,
  updateUserAsAdmin,
  type AdminUserRecord,
} from "../services/adminUserService";
import { ResetUserPasswordSheet } from "./ResetUserPasswordSheet";

interface AdminUsersViewProps {
  onBack: () => void;
  greenhouseId: string;
  greenhouseName: string;
}

type RoleFilter = "all" | "admin" | "user";
type StatusFilter = "all" | "active" | "inactive";

function formatRole(role: string): string {
  return role === "admin" ? "Admin" : "User";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function AdminUsersView({
  onBack,
  greenhouseId,
  greenhouseName,
}: AdminUsersViewProps) {
  const { firebaseUser } = useAuth();

  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [resetPasswordUser, setResetPasswordUser] =
    useState<AdminUserRecord | null>(null);

  const currentUid = firebaseUser?.uid ?? null;

  useEffect(() => {
    if (!greenhouseId) return;

    setLoadingUsers(true);
    setError(null);

    const unsub = subscribeUsersForGreenhouse(
      greenhouseId,
      (nextUsers) => {
        setUsers(nextUsers);
        setLoadingUsers(false);
      },
      (err) => {
        setError(err.message);
        setLoadingUsers(false);
      },
    );

    return () => unsub();
  }, [greenhouseId]);

  const activeUsers = useMemo(
    () => users.filter((user) => user.active).length,
    [users],
  );

  const adminUsers = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users],
  );

  const filteredUsers = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !cleanSearch ||
        user.displayName.toLowerCase().includes(cleanSearch) ||
        user.username.toLowerCase().includes(cleanSearch);

      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.active) ||
        (statusFilter === "inactive" && !user.active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 3000);
  }

  function handleCreated(user: AdminUserRecord) {
    showSuccess(`Created ${user.displayName} as ${formatRole(user.role)}.`);
  }

  function handlePasswordReset(user: AdminUserRecord) {
    showSuccess(`Password reset for ${user.displayName}.`);
  }

  async function handleRoleChange(user: AdminUserRecord, nextRole: UserRole) {
    if (nextRole === user.role) return;

    setUpdatingUid(user.uid);
    setError(null);

    try {
      await updateUserAsAdmin({
        uid: user.uid,
        role: nextRole,
      });

      showSuccess(`${user.displayName} is now ${formatRole(nextRole)}.`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not update user role.";
      setError(msg);
    } finally {
      setUpdatingUid(null);
    }
  }

  async function handleStatusToggle(user: AdminUserRecord) {
    setUpdatingUid(user.uid);
    setError(null);

    const nextActive = !user.active;

    try {
      await updateUserAsAdmin({
        uid: user.uid,
        active: nextActive,
      });

      showSuccess(
        nextActive
          ? `${user.displayName} has been reactivated.`
          : `${user.displayName} has been deactivated.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not update user status.";
      setError(msg);
    } finally {
      setUpdatingUid(null);
    }
  }

  return (
    <div className="gm-app">
      <header className="gm-header">
        <button
          type="button"
          onClick={onBack}
          className="gm-icon-btn shrink-0"
          aria-label="Back to GreenMirror"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="gm-brand min-w-0">
          <h1>
            Manage users <span style={{ fontSize: 20 }}>👥</span>
          </h1>
          <small>{greenhouseName} Greenhouse</small>
        </div>

        <Button
          type="button"
          className="hidden bg-emerald-600 px-4 font-black shadow-md shadow-emerald-600/20 hover:bg-emerald-700 sm:inline-flex"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setAddUserOpen(true)}
        >
          Add user
        </Button>
      </header>

      <div className="gm-scroll">
        <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-4 sm:px-6 sm:pb-10 sm:pt-6">
          <section className="mb-5 rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                  Admin tools
                </div>

                <h2 className="font-['Baloo_2'] text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                  User management
                </h2>

                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-600">
                  Create users and admins for this greenhouse. Accounts created
                  here are automatically locked to {greenhouseName} Greenhouse.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                  <Users className="h-5 w-5" />
                </div>
                <div className="font-['Baloo_2'] text-3xl font-black leading-none text-slate-950">
                  {users.length}
                </div>
                <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                  Total users
                </p>
              </div>

              <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="font-['Baloo_2'] text-3xl font-black leading-none text-slate-950">
                  {activeUsers}
                </div>
                <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                  Active users
                </p>
              </div>

              <div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="font-['Baloo_2'] text-3xl font-black leading-none text-slate-950">
                  {adminUsers}
                </div>
                <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                  Admins
                </p>
              </div>
            </div>
          </section>

          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-3xl border border-red-100 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm font-bold leading-5 text-red-700">
                {error}
              </p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-start gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <p className="text-sm font-bold leading-5 text-emerald-700">
                {successMessage}
              </p>
            </div>
          )}

          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-['Baloo_2'] text-2xl font-black leading-tight text-slate-950">
                  Existing users
                </h3>
                <p className="text-sm font-semibold text-slate-500">
                  View users assigned to this greenhouse and update their
                  access.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search users"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 sm:w-52"
                  />
                </div>

                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                  className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                >
                  <option value="all">All roles</option>
                  <option value="admin">Admins</option>
                  <option value="user">Users</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                  className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            {loadingUsers ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50">
                <div className="text-center">
                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-600" />
                  <p className="text-sm font-black text-slate-600">
                    Loading users…
                  </p>
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <div>
                  <Users className="mx-auto mb-3 h-7 w-7 text-slate-400" />
                  <p className="font-['Baloo_2'] text-xl font-black text-slate-800">
                    No users found
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Try changing the search or filters.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-3xl border border-slate-200 lg:block">
                  <table className="w-full border-collapse bg-white text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Username</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Greenhouse</th>
                        <th className="px-4 py-3 text-right">Manage</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((user) => {
                        const isSelf = user.uid === currentUid;
                        const isUpdating = updatingUid === user.uid;

                        return (
                          <tr key={user.uid} className="hover:bg-slate-50/70">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700">
                                  {getInitials(user.displayName)}
                                </div>

                                <div className="min-w-0">
                                  <div className="font-black text-slate-950">
                                    {user.displayName}
                                    {isSelf && (
                                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-semibold text-slate-500">
                                    UID: {user.uid.slice(0, 8)}…
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-4 text-sm font-bold text-slate-600">
                              @{user.username}
                            </td>

                            <td className="px-4 py-4">
                              <select
                                value={user.role}
                                disabled={isUpdating || isSelf}
                                onChange={(e) =>
                                  handleRoleChange(
                                    user,
                                    e.target.value as UserRole,
                                  )
                                }
                                className="h-9 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>

                            <td className="px-4 py-4">
                              <Badge
                                variant={user.active ? "healthy" : "alert"}
                                size="sm"
                              >
                                {user.active ? "Active" : "Inactive"}
                              </Badge>
                            </td>

                            <td className="px-4 py-4 text-sm font-bold text-slate-500">
                              {user.greenhouseId}
                            </td>

                            <td className="px-4 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={isUpdating}
                                  onClick={() => setResetPasswordUser(user)}
                                  className="bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  icon={<KeyRound className="h-3.5 w-3.5" />}
                                >
                                  Reset
                                </Button>

                                <Button
                                  type="button"
                                  variant={user.active ? "danger" : "secondary"}
                                  size="sm"
                                  disabled={isUpdating || isSelf}
                                  onClick={() => handleStatusToggle(user)}
                                  className={
                                    user.active
                                      ? "bg-red-50 text-red-700 hover:bg-red-100"
                                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  }
                                  icon={
                                    isUpdating ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : undefined
                                  }
                                >
                                  {user.active ? "Deactivate" : "Reactivate"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 lg:hidden">
                  {filteredUsers.map((user) => {
                    const isSelf = user.uid === currentUid;
                    const isUpdating = updatingUid === user.uid;

                    return (
                      <div
                        key={user.uid}
                        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700">
                            {getInitials(user.displayName)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate font-['Baloo_2'] text-xl font-black leading-tight text-slate-950">
                              {user.displayName}
                            </div>

                            <div className="truncate text-sm font-bold text-slate-500">
                              @{user.username}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge
                                variant={
                                  user.role === "admin" ? "info" : "neutral"
                                }
                                size="sm"
                              >
                                {user.role === "admin" ? (
                                  <span className="inline-flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3" />
                                    Admin
                                  </span>
                                ) : (
                                  "User"
                                )}
                              </Badge>

                              <Badge
                                variant={user.active ? "healthy" : "alert"}
                                size="sm"
                              >
                                {user.active ? "Active" : "Inactive"}
                              </Badge>

                              {isSelf && (
                                <Badge variant="healthy" size="sm">
                                  You
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 rounded-3xl bg-slate-50 p-3">
                          <div>
                            <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                              Role
                            </label>

                            <select
                              value={user.role}
                              disabled={isUpdating || isSelf}
                              onChange={(e) =>
                                handleRoleChange(
                                  user,
                                  e.target.value as UserRole,
                                )
                              }
                              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>

                            {isSelf && (
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                You cannot remove your own admin access here.
                              </p>
                            )}
                          </div>

                          <Button
                            type="button"
                            variant="secondary"
                            disabled={isUpdating}
                            onClick={() => setResetPasswordUser(user)}
                            className="h-11 w-full bg-amber-50 font-black text-amber-700 hover:bg-amber-100"
                            icon={<KeyRound className="h-4 w-4" />}
                          >
                            Reset password
                          </Button>

                          <Button
                            type="button"
                            variant={user.active ? "danger" : "secondary"}
                            disabled={isUpdating || isSelf}
                            onClick={() => handleStatusToggle(user)}
                            className={
                              user.active
                                ? "h-11 w-full bg-red-50 font-black text-red-700 hover:bg-red-100"
                                : "h-11 w-full bg-emerald-50 font-black text-emerald-700 hover:bg-emerald-100"
                            }
                            icon={
                              isUpdating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : undefined
                            }
                          >
                            {user.active
                              ? "Deactivate user"
                              : "Reactivate user"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </main>
      </div>

      <div className="fixed bottom-4 left-4 right-4 z-40 sm:hidden">
        <Button
          type="button"
          className="h-12 w-full bg-emerald-600 py-4 text-base font-black shadow-lg shadow-emerald-600/25 hover:bg-emerald-700"
          icon={<Plus className="h-5 w-5" />}
          onClick={() => setAddUserOpen(true)}
        >
          Add user
        </Button>
      </div>

      <AddUserSheet
        open={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        greenhouseName={greenhouseName}
        onCreated={handleCreated}
      />

      <ResetUserPasswordSheet
        open={resetPasswordUser !== null}
        user={resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        onReset={handlePasswordReset}
      />
    </div>
  );
}
