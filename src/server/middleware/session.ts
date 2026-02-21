import { createMiddleware } from "hono/factory";
import { CookieStore, sessionMiddleware, Session } from "hono-sessions";
import type { Env } from "../types";

export interface SessionData {
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: number;
}

declare module "hono" {
  interface ContextVariableMap {
    session: Session<SessionData>;
  }
}

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
        sameSite: "Lax",
      },
      sessionCookieName: "strata_session",
    });
    return middleware(c, next);
  });
}

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
