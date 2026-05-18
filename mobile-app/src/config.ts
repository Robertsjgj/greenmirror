const BACKEND_PORT = 5000;

function resolveApiBaseUrl(): string {
  // Explicit build-time override always wins
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
  }

  // Runtime: mirror the host currently serving the frontend.
  // If opened from http://192.168.x.x:5174, API becomes http://192.168.x.x:5000.
  // Works on any network without any config changes.
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (import.meta.env.DEV) {
      console.log('[GreenMirror] Detected frontend host:', hostname);
    }
    return `${protocol}//${hostname}:${BACKEND_PORT}`;
  }

  return `http://localhost:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

if (import.meta.env.DEV) {
  console.log('[GreenMirror] API base URL:', API_BASE_URL);
}

export const LATEST_READING_URL = `${API_BASE_URL}/api/latest`;
