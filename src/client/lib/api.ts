/**
 * Type-safe fetch wrapper for all client → server API calls.
 *
 * Every request is routed through `/api/*` which, in development, is handled
 * by @hono/vite-dev-server on the same port (5173). In production the same
 * path is served by the Cloudflare Pages _worker.js.
 *
 * Usage:
 *   const res = await apiFetch<ApiResponse<User>>("/auth/me");
 *   // res is typed as ApiResponse<User>
 *
 * All requests default to JSON content-type. Callers can override headers
 * or set method/body via the standard RequestInit parameter.
 */

const API_BASE = "/api";

/**
 * Generic fetch helper that prepends the API base path, sets JSON headers,
 * and throws on non-2xx responses so callers can use simple try/catch.
 * The generic parameter T lets each call site declare the expected response shape.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
