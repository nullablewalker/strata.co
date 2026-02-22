import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createMockDb, type MockDb } from "../../test/mocks/db";
import { createAuthenticatedSession, type MockSession } from "../../test/mocks/session";
import { mockEnv } from "../../test/mocks/hono-context";

// ---------------------------------------------------------------------------
// Mock createDb so the route uses our mock DB
// ---------------------------------------------------------------------------
let mockDb: MockDb;

vi.mock("../db", () => ({
  createDb: vi.fn(() => mockDb),
}));

// ---------------------------------------------------------------------------
// Mock authGuard to inject session without real cookie encryption
// ---------------------------------------------------------------------------
let mockSession: MockSession;

vi.mock("../middleware/session", () => ({
  authGuard: () => {
    return async (c: { get: (k: string) => unknown; set: (k: string, v: unknown) => void; json: (d: unknown, s: number) => Response }, next: () => Promise<void>) => {
      c.set("session", mockSession);
      const userId = mockSession.get("userId");
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    };
  },
}));

// ---------------------------------------------------------------------------
// Import route after mocks are set up
// ---------------------------------------------------------------------------
import strataRoutes from "./strata";

function createApp() {
  const app = new Hono();
  app.route("/api/strata", strataRoutes);
  return app;
}

/** Helper to make requests with env bindings */
function request(app: Hono, path: string, init?: RequestInit) {
  return app.request(path, init, mockEnv);
}

describe("Strata routes — GET /api/strata/eras", () => {
  beforeEach(() => {
    mockSession = createAuthenticatedSession();
    mockDb = createMockDb();
  });

  it("returns 401 when not authenticated", async () => {
    mockSession = { get: vi.fn(() => undefined), set: vi.fn(), deleteSession: vi.fn() };
    const app = createApp();
    const res = await request(app, "/api/strata/eras");
    expect(res.status).toBe(401);
  });

  it("returns empty artists and months when no data", async () => {
    mockDb = createMockDb({ selectData: [] });
    const app = createApp();
    const res = await request(app, "/api/strata/eras");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { artists: [], months: [] } });
  });

  it("returns top artists and monthly breakdown", async () => {
    const topArtists = [
      { artistName: "Radiohead", totalMs: 500000 },
      { artistName: "Queen", totalMs: 300000 },
    ];
    const monthlyData = [
      { month: "2024-01", artistName: "Radiohead", msPlayed: 200000 },
      { month: "2024-01", artistName: "Queen", msPlayed: 100000 },
      { month: "2024-02", artistName: "Radiohead", msPlayed: 300000 },
      { month: "2024-02", artistName: "Queen", msPlayed: 200000 },
    ];

    let callCount = 0;
    mockDb.select = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return createChain(topArtists);
      }
      return createChain(monthlyData);
    });

    const app = createApp();
    const res = await request(app, "/api/strata/eras");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.artists).toEqual(["Radiohead", "Queen"]);
    expect(body.data.months).toHaveLength(2);
    expect(body.data.months[0].month).toBe("2024-01");
    expect(body.data.months[0].values).toEqual({
      Radiohead: 200000,
      Queen: 100000,
    });
    expect(body.data.months[1].month).toBe("2024-02");
  });

  it("sorts months chronologically", async () => {
    const topArtists = [{ artistName: "Artist A", totalMs: 100000 }];
    const monthlyData = [
      { month: "2024-06", artistName: "Artist A", msPlayed: 50000 },
      { month: "2024-01", artistName: "Artist A", msPlayed: 30000 },
      { month: "2024-03", artistName: "Artist A", msPlayed: 20000 },
    ];

    let callCount = 0;
    mockDb.select = vi.fn(() => {
      callCount++;
      if (callCount === 1) return createChain(topArtists);
      return createChain(monthlyData);
    });

    const app = createApp();
    const res = await request(app, "/api/strata/eras");
    const body = await res.json();

    const months = body.data.months.map((m: { month: string }) => m.month);
    expect(months).toEqual(["2024-01", "2024-03", "2024-06"]);
  });
});

// ---------------------------------------------------------------------------
// Helper: build a fluent select chain that resolves to `data`
// ---------------------------------------------------------------------------
function createChain<T>(data: T[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    then: vi.fn((resolve?: (v: T[]) => unknown) =>
      Promise.resolve(data).then(resolve),
    ),
  };
  for (const key of Object.keys(chain)) {
    if (key !== "then") {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }
  return chain;
}
