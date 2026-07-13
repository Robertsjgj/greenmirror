import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "./ui/Button";
import type { UserRole } from "../services/userService";
import {
  createUserAsAdmin,
  type AdminUserRecord,
} from "../services/adminUserService";

interface AddUserSheetProps {
  open: boolean;
  onClose: () => void;
  greenhouseName: string;
  onCreated: (user: AdminUserRecord) => void;
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function AddUserSheet({
  open,
  onClose,
  greenhouseName,
  onCreated,
}: AddUserSheetProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("user");
      setShowPassword(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    setSubmitting(true);
    setError(null);

    try {
      const created = await createUserAsAdmin({
        username: normalizeUsername(username),
        displayName: displayName.trim(),
        password,
        role,
      });

      onCreated(created);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create user.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className={`gm-scrim${open ? " open" : ""}`} onClick={onClose} />

      <div
        className={`gm-sheet${open ? " open" : ""}`}
        style={{ maxHeight: "88%" }}
      >
        <div className="gm-grab" />

        <div className="gm-sheet-body">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                New account
              </div>

              <h2 className="font-['Baloo_2'] text-3xl font-black leading-tight text-slate-950">
                Add user
              </h2>

              <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                This account will be locked to {greenhouseName} Greenhouse.
              </p>
            </div>

            <button
              type="button"
              className="gm-icon-btn"
              onClick={onClose}
              aria-label="Close add user"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-3xl border border-red-100 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm font-bold leading-5 text-red-700">
                {error}
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Username
              </label>

              <div className="relative">
                <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="e.g. p16 or sydney-admin-2"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <p className="mt-1.5 text-xs font-semibold text-slate-500">
                They will use this username to sign in.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Display name
              </label>

              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. P16, Sydney Coordinator, Volunteer 1"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Temporary password
              </label>

              <div className="relative">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 pr-12 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Role
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("user")}
                  className={`rounded-3xl border p-4 text-left transition ${
                    role === "user"
                      ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-xl">
                    👤
                  </div>

                  <div className="font-['Baloo_2'] text-lg font-black leading-tight text-slate-950">
                    User
                  </div>

                  <p className="mt-1 text-xs font-semibold leading-4 text-slate-500">
                    Can use the app for their assigned greenhouse.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("admin")}
                  className={`rounded-3xl border p-4 text-left transition ${
                    role === "admin"
                      ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                    <ShieldCheck className="h-5 w-5" />
                  </div>

                  <div className="font-['Baloo_2'] text-lg font-black leading-tight text-slate-950">
                    Admin
                  </div>

                  <p className="mt-1 text-xs font-semibold leading-4 text-slate-500">
                    Can create and manage users for this greenhouse.
                  </p>
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-12 w-full rounded-2xl bg-emerald-600 py-4 text-base font-black shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
              disabled={
                submitting ||
                !username.trim() ||
                !displayName.trim() ||
                password.length < 6
              }
              icon={
                submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <UserPlus className="h-5 w-5" />
                )
              }
            >
              {submitting ? "Creating user…" : "Create user"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
