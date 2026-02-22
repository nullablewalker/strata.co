import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createMockDb, type MockDb } from "../../test/mocks/db";
import {
  createAuthenticatedSession,
  type MockSession,
} from "../../test/mocks/session";
import { mockEnv } from "../../test/mocks/hono-context";
import {
  validEntry,
  shortPlayEntry,
  noTrackNameEntry,
  noUriEntry,
  noArtistEntry,
  podcastEntry,
} from "../../test/fixtures/streaming-history";

// ---------------------------------------------------------------------------
// Mock createDb
// ---------------------------------------------------------------------------
let mockDb: MockDb;

vi.mock("../db", () => ({
  createDb: vi.fn(() => mockDb),
}));

// ---------------------------------------------------------------------------
// Mock authGuard to inject session
// ---------------------------------------------------------------------------
let mockSession: MockSession;

vi.mock("../middleware/session", () => ({
  authGuard: () => {
    return async (
      c: {
        get: (k: string) => unknown;
        set: (k: string, v: unknown) => void;
        json: (d: unknown, s: number) => Response;
      },
      next: () => Promise<void>,
    ) => {
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
// Import route after mocks
// ---------------------------------------------------------------------------
import importRoutes from "./import";

function createApp() {
  const app = new Hono();
  app.route("/api/import", importRoutes);
  return app;
}

/** Helper to make requests with env bindings */
function req(app: Hono, path: string, init?: RequestInit) {
  return app.request(path, init, mockEnv);
}

// ---------------------------------------------------------------------------
// Helper: build a fluent select chain
// ---------------------------------------------------------------------------
function createSelectChain<T>(data: T[]) {
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

function createInsertChain<T>(data: T[] = []) {
  const chain: Record<string, unknown> = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
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

function createDeleteChain(rowCount = 0) {
  const result = { rowCount };
  const chain: Record<string, unknown> = {
    where: vi.fn(),
    then: vi.fn((resolve?: (v: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
    ),
  };
  for (const key of Object.keys(chain)) {
    if (key !== "then") {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Import routes — POST /api/import/history", () => {
  beforeEach(() => {
    mockSession = createAuthenticatedSession();
    mockDb = createMockDb();
    // Default: no existing records (empty dedup set), insert succeeds
    mockDb.select = vi.fn(() => createSelectChain([]));
    mockDb.insert = vi.fn(() => createInsertChain());
  });

  it("returns 401 when not authenticated", async () => {
    mockSession = {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      deleteSession: vi.fn(),
    };
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([validEntry]),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 for invalid schema (not an array)", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not: "an array" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid streaming history format");
  });

  it("filters entries with ms_played < 30000", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([shortPlayEntry]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.imported).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skipReasons.tooShort).toBe(1);
  });

  it("filters entries with null track name", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([noTrackNameEntry]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(0);
    expect(body.data.skipReasons.noTrackName).toBe(1);
  });

  it("filters entries with null spotify URI", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([noUriEntry]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(0);
    expect(body.data.skipReasons.noSpotifyUri).toBe(1);
  });

  it("filters entries with null artist name", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([noArtistEntry]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(0);
    expect(body.data.skipReasons.noArtistName).toBe(1);
  });

  it("filters podcast entries (non-track URI)", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([podcastEntry]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(0);
    expect(body.data.skipReasons.noSpotifyUri).toBe(1);
  });

  it("successfully imports a valid entry", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([validEntry]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped).toBe(0);
    expect(body.data.duplicates).toBe(0);
  });

  it("returns correct ImportResult structure", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([validEntry]),
    });
    const body = await res.json();
    expect(body.data).toHaveProperty("total");
    expect(body.data).toHaveProperty("imported");
    expect(body.data).toHaveProperty("skipped");
    expect(body.data).toHaveProperty("duplicates");
    expect(body.data).toHaveProperty("skipReasons");
    expect(body.data.skipReasons).toHaveProperty("tooShort");
    expect(body.data.skipReasons).toHaveProperty("noTrackName");
    expect(body.data.skipReasons).toHaveProperty("noSpotifyUri");
    expect(body.data.skipReasons).toHaveProperty("noArtistName");
  });

  it("handles empty input array", async () => {
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(0);
    expect(body.data.imported).toBe(0);
    expect(body.data.skipped).toBe(0);
  });

  it("handles batch of mixed valid and invalid entries", async () => {
    const entries = [
      validEntry,
      shortPlayEntry,
      noTrackNameEntry,
      noUriEntry,
      noArtistEntry,
    ];
    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(5);
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped).toBe(4);
  });

  it("detects duplicates against existing records", async () => {
    const trackId = "63OQupATfueTdZMWIaAKMd";
    const playedAt = new Date("2024-06-15T10:30:00Z");
    mockDb.select = vi.fn(() =>
      createSelectChain([{ trackSpotifyId: trackId, playedAt }]),
    );

    const app = createApp();
    const res = await req(app, "/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([validEntry]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.duplicates).toBe(1);
    expect(body.data.imported).toBe(0);
  });
});

describe("Import routes — GET /api/import/status", () => {
  beforeEach(() => {
    mockSession = createAuthenticatedSession();
    mockDb = createMockDb();
  });

  it("returns status with hasData=false when no data", async () => {
    mockDb.select = vi.fn(() =>
      createSelectChain([{ totalTracks: 0, minPlayedAt: null, maxPlayedAt: null }]),
    );
    const app = createApp();
    const res = await req(app, "/api/import/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hasData).toBe(false);
    expect(body.data.totalTracks).toBe(0);
    expect(body.data.dateRange).toBeNull();
  });

  it("returns status with hasData=true and dateRange when data exists", async () => {
    const minDate = new Date("2024-01-01T00:00:00Z");
    const maxDate = new Date("2024-12-31T23:59:59Z");
    mockDb.select = vi.fn(() =>
      createSelectChain([
        { totalTracks: 500, minPlayedAt: minDate, maxPlayedAt: maxDate },
      ]),
    );
    const app = createApp();
    const res = await req(app, "/api/import/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hasData).toBe(true);
    expect(body.data.totalTracks).toBe(500);
    expect(body.data.dateRange).toEqual({
      from: minDate.toISOString(),
      to: maxDate.toISOString(),
    });
  });
});

describe("Import routes — DELETE /api/import/data", () => {
  beforeEach(() => {
    mockSession = createAuthenticatedSession();
    mockDb = createMockDb();
  });

  it("deletes all user history and returns count", async () => {
    mockDb.delete = vi.fn(() => createDeleteChain(42));
    const app = createApp();
    const res = await req(app, "/api/import/data", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(42);
  });

  it("returns 0 deleted when no data exists", async () => {
    mockDb.delete = vi.fn(() => createDeleteChain(0));
    const app = createApp();
    const res = await req(app, "/api/import/data", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(0);
  });
});
