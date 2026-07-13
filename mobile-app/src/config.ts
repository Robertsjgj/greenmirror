const BACKEND_PORT = 5000;

function resolveApiBaseUrl(): string {
  // === BROWSER (runtime) ===
  // Always derive the backend URL from the host that served the frontend.
  // This is unconditional — no build-time env var can override it here.
  //
  // Why: VITE_API_BASE_URL is baked into the bundle at build/dev-server start.
  // If it was set in a previous session it becomes stale and silently forces
  // the old IP even after a network change. Runtime detection has no such flaw.
  //
  //   localhost:5174  →  localhost:5000
  //   192.168.7.202:5174  →  192.168.7.202:5000
  //   10.9.1.96:5174  →  10.9.1.96:5000
  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;

    console.log("[GreenMirror] Frontend hostname:", hostname);

    const staleOverride = import.meta.env.VITE_API_BASE_URL;
    if (staleOverride) {
      console.warn(
        "[GreenMirror] VITE_API_BASE_URL is set but IGNORED at runtime.",
        "\n  Stale value:",
        staleOverride,
        "\n  Runtime detection is used instead to prevent stale-IP bugs.",
        "\n  To clear: restart Vite without VITE_API_BASE_URL in the environment.",
      );
    }

    return `${protocol}//${hostname}:${BACKEND_PORT}`;
  }

  // === NON-BROWSER (SSR / build-time evaluation only) ===
  // Env var is consulted here as a last resort, then localhost.
  const envFallback = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  return envFallback || `http://localhost:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

console.log("[GreenMirror] Resolved API base URL:", API_BASE_URL);

export const LATEST_READING_URL = `${API_BASE_URL}/api/latest`;
