import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Lock,
  LogIn,
  Sprout,
  User,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import type { GreenhouseMeta } from "../greenhouses";
import { useAuth } from "../context/AuthContext";

interface LoginViewProps {
  greenhouse: GreenhouseMeta;
  onBack: () => void;
}

export function LoginView({ greenhouse, onBack }: LoginViewProps) {
  const { login, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);

    try {
      await login(username, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      setLocalError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-gradient-to-b from-emerald-50 via-white to-white">
      <div className="flex min-h-full items-center justify-center px-4 py-5 sm:px-5 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-md py-2"
        >
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-2 rounded-full text-sm font-bold text-slate-600 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Choose a different greenhouse
          </button>

          <Card className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-xl shadow-emerald-900/10">
            <div className="px-5 py-6 sm:px-7 sm:py-7">
              <div className="mb-5 text-center sm:mb-6">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-100 shadow-inner sm:h-16 sm:w-16">
                  <Sprout className="h-8 w-8 text-emerald-700 sm:h-9 sm:w-9" />
                </div>

                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
                  GreenMirror
                </p>

                <h1 className="text-[2rem] font-black leading-tight text-slate-950 sm:text-3xl">
                  Sign in to {greenhouse.name} Greenhouse
                </h1>

                <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-600">
                  Use the username and password given by your greenhouse admin.
                </p>
              </div>

              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="mb-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Selected greenhouse
                </p>

                <p className="text-sm font-black text-slate-950 sm:text-base">
                  {greenhouse.region}
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-black text-slate-700">
                    Username
                  </label>

                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="e.g. john-doe or jane-smith"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-slate-700">
                    Password
                  </label>

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-12 text-base font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 focus:outline-none"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {(localError || error) && (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-3.5">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

                    <p className="text-sm font-semibold leading-5 text-red-700">
                      {localError || error}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="h-12 w-full rounded-2xl bg-emerald-600 text-base font-black shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:bg-slate-400 disabled:shadow-none"
                  icon={<LogIn className="h-5 w-5" />}
                  disabled={submitting || !username.trim() || !password.trim()}
                >
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
