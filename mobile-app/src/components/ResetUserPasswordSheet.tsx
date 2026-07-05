import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import { Button } from "./ui/Button";
import {
  resetUserPasswordAsAdmin,
  type AdminUserRecord,
} from "../services/adminUserService";

interface ResetUserPasswordSheetProps {
  open: boolean;
  user: AdminUserRecord | null;
  onClose: () => void;
  onReset: (user: AdminUserRecord) => void;
}

export function ResetUserPasswordSheet({
  open,
  user,
  onClose,
  onReset,
}: ResetUserPasswordSheetProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    if (!user) return;

    setError(null);

    if (password.length < 6) {
      setError("Temporary password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      await resetUserPasswordAsAdmin({
        uid: user.uid,
        password,
      });

      onReset(user);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not reset password.";
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
        style={{ maxHeight: "82%" }}
      >
        <div className="gm-grab" />

        <div className="gm-sheet-body">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Admin reset
              </div>

              <h2 className="font-['Baloo_2'] text-3xl font-black leading-tight text-slate-950">
                Reset password
              </h2>

              <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                Set a temporary password for{" "}
                <strong>{user?.displayName ?? "this user"}</strong>.
              </p>
            </div>

            <button
              type="button"
              className="gm-icon-btn"
              onClick={onClose}
              aria-label="Close reset password"
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
            <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-sm font-bold leading-5 text-amber-800">
                Give this temporary password to the user privately. They can
                sign in with it and then change it from their profile menu.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                Temporary password
              </label>

              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-12 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
                Confirm temporary password
              </label>

              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Repeat password"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <Button
              type="submit"
              className="h-12 w-full bg-amber-500 text-base font-black text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600"
              disabled={submitting || !password || !confirmPassword}
              icon={
                submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <KeyRound className="h-5 w-5" />
                )
              }
            >
              {submitting ? "Resetting password…" : "Reset password"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
