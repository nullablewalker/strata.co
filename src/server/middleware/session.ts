/**
 * Session middleware and authentication guard.
 *
 * Sessions are stored entirely in encrypted cookies (CookieStore) so the API
 * remains stateless — no server-side session store is needed, which is ideal
 * for Cloudflare Workers where there is no persistent in-memory state between
 * requests.
 *
 * The cookie holds the user's internal UUID and a short-lived Spotify access
 * token (~800 bytes total, well within the 4 KB cookie limit). The Spotify
 * refresh token is persisted in the DB, not in the cookie, to avoid bloating
 * cookie size and to allow server-side revocation.
 */

import { createMiddleware } from "hono/factory";
import { CookieStore, sessionMiddleware, Session } from "hono-sessions";
import type { Env } from "../types";

export interface SessionData {
  userId: string;
  accessToken: string;
  // Unix-ms timestamp when the Spotify access token expires
  accessTokenExpiresAt: number;
}

// Extend Hono's context so `c.get("session")` is typed across all routes
declare module "hono" {
  interface ContextVariableMap {
    session: Session<SessionData>;
  }
}

/**
 * Creates the session middleware.
 *
 * Wrapped in a factory because the encryption key comes from Cloudflare
 * environment bindings (`c.env`), which are only available at request time —
 * not at module-load time.
 */
export function createSessionMiddleware() {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const store = new CookieStore();
    const middleware = sessionMiddleware({
      store,
      encryptionKey: c.env.SESSION_ENCRYPTION_KEY,
      expireAfterSeconds: 60 * 60 * 24 * 7, // 7 days
      cookieOptions: {
        path: "/",
        httpOnly: true,
        secure: true,
        // "Lax" allows the cookie to be sent on top-level navigations (e.g.
        // the OAuth callback redirect) while still blocking cross-site POST.
        sameSite: "Lax",
      },
      sessionCookieName: "strata_session",
    });
    return middleware(c, next);
  });
}

/**
 * Route-level guard that rejects unauthenticated requests with 401.
 * Apply to any route group that requires a logged-in user (e.g. vault, import).
 */
export function authGuard() {
  return createMiddleware(async (c, next) => {
    const session = c.get("session") as Session<SessionData>;
    const userId = session.get("userId");
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });
}
