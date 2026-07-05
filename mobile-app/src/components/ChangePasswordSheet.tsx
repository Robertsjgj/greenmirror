import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "./ui/Button";
import { changeOwnPassword } from "../services/authService";

interface ChangePasswordSheetProps {
  open: boolean;
  onClose: () => void;
}

type PasswordFieldKey = "current" | "new" | "confirm";

export function ChangePasswordSheet({
  open,
  onClose,
}: ChangePasswordSheetProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [visibleFields, setVisibleFields] = useState<
    Record<PasswordFieldKey, boolean>
  >({
    current: false,
    new: false,
    confirm: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setVisibleFields({
        current: false,
        new: false,
        confirm: false,
      });
      setSubmitting(false);
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  function toggleVisibility(field: PasswordFieldKey) {
    setVisibleFields((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      await changeOwnPassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setVisibleFields({
        current: false,
        new: false,
        confirm: false,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not change password.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const fields: {
    key: PasswordFieldKey;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }[] = [
    {
      key: "current",
      label: "Current password",
      value: currentPassword,
      onChange: setCurrentPassword,
      placeholder: "Enter current password",
    },
    {
      key: "new",
      label: "New password",
      value: newPassword,
      onChange: setNewPassword,
      placeholder: "At least 6 characters",
    },
    {
      key: "confirm",
      label: "Confirm new password",
      value: confirmPassword,
      onChange: setConfirmPassword,
      placeholder: "Repeat new password",
    },
  ];

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
                Account security
              </div>

              <h2 className="font-['Baloo_2'] text-3xl font-black leading-tight text-slate-950">
                Change password
              </h2>

              <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                Enter your current password before setting a new one.
              </p>
            </div>

            <button
              type="button"
              className="gm-icon-btn"
              onClick={onClose}
              aria-label="Close change password"
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

          {success && (
            <div className="mb-4 flex items-start gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <p className="text-sm font-bold leading-5 text-emerald-700">
                Password changed successfully.
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {fields.map((field) => {
              const isVisible = visibleFields[field.key];

              return (
                <div key={field.key}>
                  <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">
                    {field.label}
                  </label>

                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      type={isVisible ? "text" : "password"}
                      placeholder={field.placeholder}
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-12 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />

                    <button
                      type="button"
                      onClick={() => toggleVisibility(field.key)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                      aria-label={
                        isVisible
                          ? `Hide ${field.label.toLowerCase()}`
                          : `Show ${field.label.toLowerCase()}`
                      }
                    >
                      {isVisible ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            <Button
              type="submit"
              className="h-12 w-full bg-emerald-600 text-base font-black shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
              disabled={
                submitting ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
              icon={
                submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <KeyRound className="h-5 w-5" />
                )
              }
            >
              {submitting ? "Changing password…" : "Change password"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
