import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { newrelicMiddleware } from "./newrelic";
import type { Env } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_ENV: Env = {
  DATABASE_URL: "postgres://test:test@localhost:5432/strata_test",
  SPOTIFY_CLIENT_ID: "mock_spotify_client_id",
  SPOTIFY_CLIENT_SECRET: "mock_spotify_client_secret",
  SESSION_ENCRYPTION_KEY: "a]vxd!bRzQE3p6kEJnaGHx#UPc5ts8Wj",
  ENVIRONMENT: "test",
  NEW_RELIC_LICENSE_KEY: "nr_test_key",
};

/**
 * Hono's `app.request()` doesn't provide an ExecutionContext by default,
 * but the middleware accesses `c.executionCtx`. We create a mock that
 * captures the promise passed to `waitUntil`.
 */
function createMockExecutionCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

/**
 * Build a small Hono app with the NR middleware for testing.
 * Routes can be customised per-test via the `setup` callback.
 */
function createTestApp(
  setup?: (app: Hono<{ Bindings: Env }>) => void,
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", newrelicMiddleware());

  if (setup) {
    setup(app);
  } else {
    // Default route
    app.get("/api/test", (c) => c.json({ ok: true }));
  }

  return app;
}

/** Shorthand to make a request with env + executionCtx. */
function request(
  app: Hono<{ Bindings: Env }>,
  path: string,
  env: Env = TEST_ENV,
  execCtx = createMockExecutionCtx(),
) {
  return app.request(path, undefined, env, execCtx as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("newrelicMiddleware", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch globally to prevent actual NR calls
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 202 }),
    );
  });

  // -----------------------------------------------------------------------
  // Successful request logging
  // -----------------------------------------------------------------------

  describe("successful request", () => {
    it("returns the handler response normally", async () => {
      const app = createTestApp();

      const res = await request(app, "/api/test");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it("logs method, path, status, and duration to NR", async () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 202 }));

      const app = createTestApp();
      await request(app, "/api/test");

      // fetch should have been called with the NR endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "https://log-api.newrelic.com/log/v1",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Api-Key": "nr_test_key",
          }),
        }),
      );

      // Inspect the payload
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);
      const logEntry = body[0].logs[0];

      expect(logEntry.level).toBe("INFO");
      expect(logEntry.message).toBe("request");
      expect(logEntry.attributes["http.method"]).toBe("GET");
      expect(logEntry.attributes["http.url"]).toBe("/api/test");
      expect(logEntry.attributes["http.status_code"]).toBe(200);
      expect(logEntry.attributes.duration_ms).toEqual(expect.any(Number));
    });

    it("strips query parameters from the logged URL", async () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 202 }));

      const app = createTestApp();
      await request(app, "/api/test?secret=abc&token=xyz");

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);
      const logEntry = body[0].logs[0];

      expect(logEntry.attributes["http.url"]).toBe("/api/test");
      expect(logEntry.attributes["http.url"]).not.toContain("secret");
      expect(logEntry.attributes["http.url"]).not.toContain("token");
    });
  });

  // -----------------------------------------------------------------------
  // Logger on context
  // -----------------------------------------------------------------------

  describe("logger on context", () => {
    it("sets a logger accessible via c.get('logger')", async () => {
      let loggerFromCtx: unknown = null;

      const app = createTestApp((a) => {
        a.get("/api/check-logger", (c) => {
          loggerFromCtx = c.get("logger");
          return c.json({ ok: true });
        });
      });

      await request(app, "/api/check-logger");

      expect(loggerFromCtx).not.toBeNull();
      expect(loggerFromCtx).toHaveProperty("info");
      expect(loggerFromCtx).toHaveProperty("warn");
      expect(loggerFromCtx).toHaveProperty("error");
      expect(loggerFromCtx).toHaveProperty("flush");
    });

    it("allows routes to add custom log entries", async () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 202 }));

      const app = createTestApp((a) => {
        a.get("/api/custom-log", (c) => {
          const logger = c.get("logger");
          logger.info("custom event", { action: "test" });
          return c.json({ ok: true });
        });
      });

      await request(app, "/api/custom-log");

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);

      // Should contain both the custom log and the request log
      expect(body[0].logs).toHaveLength(2);
      expect(body[0].logs[0].message).toBe("custom event");
      expect(body[0].logs[0].attributes.action).toBe("test");
      expect(body[0].logs[1].message).toBe("request");
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("returns 500 when handler throws an Error", async () => {
      const app = createTestApp((a) => {
        a.get("/api/explode", () => {
          throw new Error("Something broke");
        });
      });

      const res = await request(app, "/api/explode");

      // Hono's built-in error handler catches Error instances at the
      // compose level (before our middleware's catch block runs) and
      // returns a plain-text 500 response.
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Internal Server Error");
    });

    it("logs request with 500 status when handler throws an Error", async () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 202 }));

      const app = createTestApp((a) => {
        a.get("/api/explode", () => {
          throw new Error("Something broke");
        });
      });

      await request(app, "/api/explode");

      // Hono catches Error instances before our middleware's try-catch,
      // but the post-response logging still runs and records status 500.
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);
      const requestLog = body[0].logs[0];

      expect(requestLog.level).toBe("INFO");
      expect(requestLog.message).toBe("request");
      expect(requestLog.attributes["http.status_code"]).toBe(500);
      expect(requestLog.attributes["http.method"]).toBe("GET");
      expect(requestLog.attributes["http.url"]).toBe("/api/explode");
    });

    it("catches non-Error throws and returns 500 JSON", async () => {
      const app = createTestApp((a) => {
        a.get("/api/throw-string", () => {
          throw "raw string error"; // eslint-disable-line no-throw-literal
        });
      });

      // Non-Error throws bypass Hono's onError and ARE caught by the
      // middleware's catch block, which returns c.json().
      const res = await request(app, "/api/throw-string");

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual({ error: "Internal Server Error" });
    });

    it("logs error details for non-Error throws", async () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 202 }));

      const app = createTestApp((a) => {
        a.get("/api/throw-string", () => {
          throw "raw string error"; // eslint-disable-line no-throw-literal
        });
      });

      await request(app, "/api/throw-string");

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);
      const errorLog = body[0].logs[0];

      expect(errorLog.level).toBe("ERROR");
      expect(errorLog.message).toBe("Unhandled exception");
      expect(errorLog.attributes["error.message"]).toBe(
        "Unknown internal error",
      );
      expect(errorLog.attributes["error.stack"]).toBeUndefined();
      expect(errorLog.attributes["http.method"]).toBe("GET");
      expect(errorLog.attributes["http.url"]).toBe("/api/throw-string");
    });
  });

  // -----------------------------------------------------------------------
  // Dev fallback (no license key)
  // -----------------------------------------------------------------------

  describe("dev fallback without license key", () => {
    it("falls back to console when no NR license key", async () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const envWithoutNR: Env = {
        ...TEST_ENV,
        NEW_RELIC_LICENSE_KEY: undefined,
      };

      const app = createTestApp();
      await request(app, "/api/test", envWithoutNR);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[INFO] request"),
        expect.objectContaining({
          "http.method": "GET",
          "http.url": "/api/test",
        }),
      );
    });
  });
});
