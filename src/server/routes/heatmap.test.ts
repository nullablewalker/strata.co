import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { createMockDb, type MockDb } from "../../test/mocks/db";
import { mockEnv } from "../../test/mocks/hono-context";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

let mockDb: MockDb;

vi.mock("../db", () => ({
  createDb: vi.fn(() => mockDb),
}));

vi.mock("../middleware/session", () => ({
  authGuard: () => {
    return async (c: any, next: () => Promise<void>) => {
      // Simulate authenticated session
      c.set("session", {
        get: (key: string) => {
          if (key === "userId") return "test-user-uuid-123";
          return undefined;
        },
        set: vi.fn(),
      });
      await next();
    };
  },
}));

// Must import AFTER mocks are declared
const { default: heatmapRoutes } = await import("./heatmap");

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/heatmap", heatmapRoutes);
  return app;
}

function req(app: ReturnType<typeof createApp>, path: string) {
  return app.request(path, {}, mockEnv);
}

// ---------------------------------------------------------------------------
// Helpers to configure sequential select results
// ---------------------------------------------------------------------------

/**
 * Configure the mock DB to return different data for sequential select() calls.
 * Each call to db.select() will resolve with the next item in `results`.
 */
function mockSelectSequence(results: unknown[][]) {
  let callIndex = 0;
  mockDb.select.mockImplementation(() => {
    const data = results[callIndex] ?? [];
    callIndex++;
    const chain: Record<string, any> = {
      from: vi.fn(),
      where: vi.fn(),
      groupBy: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      then: vi.fn((resolve?: (v: unknown[]) => unknown) =>
        Promise.resolve(data).then(resolve),
      ),
    };
    for (const key of Object.keys(chain)) {
      if (key !== "then") chain[key].mockReturnValue(chain);
    }
    return chain;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Heatmap Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  // =========================================================================
  // GET /heatmap/data
  // =========================================================================
  describe("GET /data", () => {
    it("returns daily aggregated data", async () => {
      const rows = [
        { date: "2024-01-15", count: 5, msPlayed: 900000 },
        { date: "2024-01-16", count: 3, msPlayed: 540000 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/heatmap/data?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.data[0]).toEqual({
        date: "2024-01-15",
        count: 5,
        msPlayed: 900000,
      });
    });

    it("returns empty data array when no plays", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/heatmap/data?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual([]);
    });

    it("filters by artist query param", async () => {
      const rows = [{ date: "2024-03-01", count: 2, msPlayed: 360000 }];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(
        app,
        "/heatmap/data?year=2024&artist=Radiohead",
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it("returns 400 for year below 2000", async () => {
      const app = createApp();
      const res = await req(app, "/heatmap/data?year=1999");
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Invalid year");
    });

    it("returns 400 for year above 2100", async () => {
      const app = createApp();
      const res = await req(app, "/heatmap/data?year=2101");
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-numeric year", async () => {
      const app = createApp();
      const res = await req(app, "/heatmap/data?year=abc");
      expect(res.status).toBe(400);
    });

    it("defaults to current year when year param is omitted", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/heatmap/data");
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /heatmap/artists
  // =========================================================================
  describe("GET /artists", () => {
    it("returns top artists by play count", async () => {
      const rows = [
        { artistName: "Radiohead", totalPlays: 150 },
        { artistName: "Bjork", totalPlays: 80 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/heatmap/artists");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.data[0].artistName).toBe("Radiohead");
      expect(json.data[0].totalPlays).toBe(150);
    });

    it("returns empty array when no history", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/heatmap/artists");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual([]);
    });
  });

  // =========================================================================
  // GET /heatmap/summary
  // =========================================================================
  describe("GET /summary", () => {
    it("returns zeros when no data", async () => {
      // First select (dailyCounts) returns empty
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/heatmap/summary?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.totalPlays).toBe(0);
      expect(json.data.activeDays).toBe(0);
      expect(json.data.longestStreak).toBe(0);
      expect(json.data.mostActiveDay).toBeNull();
      expect(json.data.averageDailyPlays).toBe(0);
    });

    it("calculates totalPlays and activeDays", async () => {
      const dailyCounts = [
        { date: "2024-01-10", count: 5 },
        { date: "2024-01-12", count: 3 },
        { date: "2024-01-13", count: 7 },
      ];
      const engagementResult = [
        {
          completedPlays: 10,
          totalWithReasonEnd: 15,
          activeSelections: 8,
          totalWithReasonStart: 15,
        },
      ];
      mockSelectSequence([dailyCounts, engagementResult]);
      const app = createApp();

      const res = await req(app, "/heatmap/summary?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.totalPlays).toBe(15); // 5 + 3 + 7
      expect(json.data.activeDays).toBe(3);
    });

    it("calculates longestStreak for consecutive days", async () => {
      const dailyCounts = [
        { date: "2024-01-10", count: 2 },
        { date: "2024-01-11", count: 3 },
        { date: "2024-01-12", count: 1 },
        // gap
        { date: "2024-01-15", count: 4 },
        { date: "2024-01-16", count: 2 },
      ];
      const engagementResult = [
        {
          completedPlays: 0,
          totalWithReasonEnd: 0,
          activeSelections: 0,
          totalWithReasonStart: 0,
        },
      ];
      mockSelectSequence([dailyCounts, engagementResult]);
      const app = createApp();

      const res = await req(app, "/heatmap/summary?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.longestStreak).toBe(3); // Jan 10-12
    });

    it("identifies mostActiveDay", async () => {
      const dailyCounts = [
        { date: "2024-03-01", count: 2 },
        { date: "2024-03-05", count: 10 },
        { date: "2024-03-06", count: 4 },
      ];
      const engagementResult = [
        {
          completedPlays: 0,
          totalWithReasonEnd: 0,
          activeSelections: 0,
          totalWithReasonStart: 0,
        },
      ];
      mockSelectSequence([dailyCounts, engagementResult]);
      const app = createApp();

      const res = await req(app, "/heatmap/summary?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.mostActiveDay.date).toBe("2024-03-05");
      expect(json.data.mostActiveDay.count).toBe(10);
    });

    it("computes completionRate and activeSelectionRate", async () => {
      const dailyCounts = [{ date: "2024-01-10", count: 10 }];
      const engagementResult = [
        {
          completedPlays: 8,
          totalWithReasonEnd: 10,
          activeSelections: 6,
          totalWithReasonStart: 10,
        },
      ];
      mockSelectSequence([dailyCounts, engagementResult]);
      const app = createApp();

      const res = await req(app, "/heatmap/summary?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.completionRate).toBe(80); // 8/10 * 100
      expect(json.data.activeSelectionRate).toBe(60); // 6/10 * 100
    });

    it("returns null rates when no reason data", async () => {
      const dailyCounts = [{ date: "2024-01-10", count: 5 }];
      const engagementResult = [
        {
          completedPlays: 0,
          totalWithReasonEnd: 0,
          activeSelections: 0,
          totalWithReasonStart: 0,
        },
      ];
      mockSelectSequence([dailyCounts, engagementResult]);
      const app = createApp();

      const res = await req(app, "/heatmap/summary?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.completionRate).toBeNull();
      expect(json.data.activeSelectionRate).toBeNull();
    });

    it("returns 400 for invalid year", async () => {
      const app = createApp();
      const res = await req(app, "/heatmap/summary?year=abc");
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /heatmap/silences
  // =========================================================================
  describe("GET /silences", () => {
    it("returns 400 for invalid year", async () => {
      const app = createApp();
      const res = await req(app, "/heatmap/silences?year=1999");
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Invalid year");
    });

    it("detects silence periods of 3+ consecutive days with no plays", async () => {
      // Simulate a year with plays only on Jan 1 and Jan 10 (8-day gap = silence)
      const dailyCounts = [
        { date: "2024-01-01", count: 3 },
        { date: "2024-01-10", count: 2 },
      ];
      // After dailyCounts, the silences loop will query bookend tracks
      // before/after each silence: 2 queries per silence (before + after)
      const beforeTrack = [
        { trackName: "Last Song", artistName: "Artist A" },
      ];
      const afterTrack = [
        { trackName: "First Song", artistName: "Artist B" },
      ];
      mockSelectSequence([dailyCounts, beforeTrack, afterTrack]);
      const app = createApp();

      const res = await req(app, "/heatmap/silences?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.silences.length).toBeGreaterThanOrEqual(1);
      // The gap is Jan 2 - Jan 9 = 8 days
      const firstSilence = json.data.silences[0];
      expect(firstSilence.startDate).toBe("2024-01-02");
      expect(firstSilence.endDate).toBe("2024-01-09");
      expect(firstSilence.days).toBe(8);
    });

    it("returns bookend tracks for silence periods", async () => {
      const dailyCounts = [
        { date: "2024-06-01", count: 1 },
        { date: "2024-06-10", count: 1 },
      ];
      const beforeTrack = [
        { trackName: "Goodbye Song", artistName: "Farewell Artist" },
      ];
      const afterTrack = [
        { trackName: "Hello Again", artistName: "Welcome Artist" },
      ];
      mockSelectSequence([dailyCounts, beforeTrack, afterTrack]);
      const app = createApp();

      const res = await req(app, "/heatmap/silences?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      const silence = json.data.silences[0];
      expect(silence.lastTrackBefore).toEqual({
        trackName: "Goodbye Song",
        artistName: "Farewell Artist",
      });
      expect(silence.firstTrackAfter).toEqual({
        trackName: "Hello Again",
        artistName: "Welcome Artist",
      });
    });

    it("returns empty silences when plays every day", async () => {
      // Generate daily counts for every day in January 2024
      const dailyCounts = Array.from({ length: 366 }, (_, i) => {
        const d = new Date(Date.UTC(2024, 0, 1));
        d.setUTCDate(d.getUTCDate() + i);
        return { date: d.toISOString().slice(0, 10), count: 1 };
      });
      mockDb = createMockDb({ selectData: dailyCounts });
      const app = createApp();

      const res = await req(app, "/heatmap/silences?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.silences).toEqual([]);
      expect(json.data.totalSilentDays).toBe(0);
    });
  });

  // =========================================================================
  // GET /heatmap/obsession
  // =========================================================================
  describe("GET /obsession", () => {
    it("returns monthly data for specified artist", async () => {
      const monthlyData = [
        { month: "2024-01", playCount: 30, msPlayed: 5400000, trackCount: 10 },
        { month: "2024-02", playCount: 15, msPlayed: 2700000, trackCount: 8 },
      ];
      mockDb = createMockDb({ selectData: monthlyData });
      const app = createApp();

      const res = await req(
        app,
        "/heatmap/obsession?artist=Radiohead",
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.artist).toBe("Radiohead");
      expect(json.data.months).toHaveLength(2);
      expect(json.data.months[0].month).toBe("2024-01");
      expect(json.data.months[0].playCount).toBe(30);
    });

    it("returns empty months when no artist param", async () => {
      const app = createApp();
      const res = await req(app, "/heatmap/obsession");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.months).toEqual([]);
    });
  });

  // =========================================================================
  // GET /heatmap/day
  // =========================================================================
  describe("GET /day", () => {
    it("returns tracks for specified date", async () => {
      const tracks = [
        {
          trackName: "Track A",
          artistName: "Artist A",
          albumName: "Album A",
          trackSpotifyId: "sp1",
          msPlayed: 180000,
          playedAt: new Date("2024-06-15T10:00:00Z"),
        },
        {
          trackName: "Track B",
          artistName: "Artist B",
          albumName: "Album B",
          trackSpotifyId: "sp2",
          msPlayed: 240000,
          playedAt: new Date("2024-06-15T14:30:00Z"),
        },
      ];
      mockDb = createMockDb({ selectData: tracks });
      const app = createApp();

      const res = await req(app, "/heatmap/day?date=2024-06-15");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.data[0].trackName).toBe("Track A");
    });

    it("returns empty array when no date param", async () => {
      const app = createApp();
      const res = await req(app, "/heatmap/day");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual([]);
    });

    it("returns empty array when no tracks on date", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/heatmap/day?date=2024-12-25");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual([]);
    });
  });
});
