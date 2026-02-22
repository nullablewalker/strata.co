/**
 * New Relic request instrumentation middleware.
 *
 * Records timing, status, and metadata for every request, then flushes the
 * buffered log entries to New Relic's Log API via `waitUntil()` so the
 * response is never delayed by observability overhead.
 *
 * Also acts as a top-level error boundary: uncaught exceptions are logged as
 * errors and a generic 500 response is returned.
 */

import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { Logger } from "../lib/logger";
import type { Session } from "hono-sessions";
import type { SessionData } from "./session";

// Extend Hono's context so `c.get("logger")` is typed across all routes
declare module "hono" {
  interface ContextVariableMap {
    logger: Logger;
  }
}

/**
 * Creates the New Relic instrumentation middleware.
 *
 * Must be registered BEFORE other middleware (e.g. `logger()`, session) so it
 * wraps the entire request lifecycle and captures the full duration.
 */
export function newrelicMiddleware() {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const start = Date.now();
    const log = new Logger({ environment: c.env.ENVIRONMENT ?? "development" });
    c.set("logger", log);

    try {
      await next();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown internal error";
      const stack = err instanceof Error ? err.stack : undefined;

      log.error("Unhandled exception", {
        "error.message": message,
        "error.stack": stack,
        "http.method": c.req.method,
        "http.url": new URL(c.req.url).pathname,
      });

      // Flush before returning so the error is captured
      log.flush(c.executionCtx, c.env.NEW_RELIC_LICENSE_KEY);

      return c.json({ error: "Internal Server Error" }, 500);
    }

    // --- Post-response logging ---
    const duration = Date.now() - start;
    const url = new URL(c.req.url);

    // Attempt to read user ID from session (may not exist for unauthenticated
    // routes or if session middleware hasn't run yet).
    let userId: string | undefined;
    try {
      const session = c.get("session") as Session<SessionData> | undefined;
      userId = session?.get("userId") ?? undefined;
    } catch {
      // Session not available — that's fine
    }

    log.info("request", {
      "http.method": c.req.method,
      "http.url": url.pathname,
      "http.status_code": c.res.status,
      duration_ms: duration,
      user_agent: c.req.header("user-agent") ?? "",
      ...(userId && { user_id: userId }),
    });

    log.flush(c.executionCtx, c.env.NEW_RELIC_LICENSE_KEY);
  });
}
