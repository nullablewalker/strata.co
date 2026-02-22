import { describe, it, expect, vi } from "vitest";

// Mock session middleware so it doesn't require real encryption key
vi.mock("./middleware/session", () => ({
  createSessionMiddleware: () => {
    return async (_c: unknown, next: () => Promise<void>) => {
      await next();
    };
  },
  authGuard: () => {
    return async (
      c: { json: (d: unknown, s: number) => Response },
      _next: () => Promise<void>,
    ) => {
      return c.json({ error: "Unauthorized" }, 401);
    };
  },
}));

import app from "./index";

describe("Server index", () => {
  describe("GET /api/health", () => {
    it("returns { status: 'ok' }", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: "ok" });
    });
  });

  describe("Route mounting", () => {
    it("mounts auth routes at /api/auth", async () => {
      const res = await app.request("/api/auth/me");
      // authGuard returns 401 — route exists
      expect(res.status).toBe(401);
    });

    it("mounts import routes at /api/import", async () => {
      const res = await app.request("/api/import/status");
      expect(res.status).toBe(401);
    });

    it("mounts strata routes at /api/strata", async () => {
      const res = await app.request("/api/strata/eras");
      expect(res.status).toBe(401);
    });

    it("returns 404 for unknown routes", async () => {
      const res = await app.request("/api/nonexistent");
      expect(res.status).toBe(404);
    });
  });
});
