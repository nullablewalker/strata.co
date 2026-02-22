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

const { default: patterns } = await import("./patterns");

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/patterns", patterns);
  return app;
}

function req(app: ReturnType<typeof createApp>, path: string) {
  return app.request(path, {}, mockEnv);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

describe("Patterns Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  // =========================================================================
  // GET /patterns/hourly
  // =========================================================================
  describe("GET /hourly", () => {
    it("returns 24 entries zero-filled", async () => {
      // DB returns only a couple hours with data
      const rows = [
        { hour: 10, count: 15, msPlayed: 2700000 },
        { hour: 22, count: 8, msPlayed: 1440000 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/patterns/hourly");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(24);
      // Check zero-filled hours
      expect(json.data[0]).toEqual({ hour: 0, count: 0, msPlayed: 0 });
      // Check hours with data
      expect(json.data[10]).toEqual({ hour: 10, count: 15, msPlayed: 2700000 });
      expect(json.data[22]).toEqual({ hour: 22, count: 8, msPlayed: 1440000 });
    });

    it("returns all zeros when no plays", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/hourly");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(24);
      expect(json.data.every((d: any) => d.count === 0)).toBe(true);
    });

    it("accepts year filter", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/hourly?year=2024");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(24);
    });

    it("accepts artist filter", async () => {
      mockDb = createMockDb({
        selectData: [{ hour: 14, count: 5, msPlayed: 900000 }],
      });
      const app = createApp();

      const res = await req(
        app,
        "/patterns/hourly?artist=Radiohead",
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data[14].count).toBe(5);
    });

    it("accepts album filter", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(
        app,
        "/patterns/hourly?album=OK%20Computer",
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data).toHaveLength(24);
    });
  });

  // =========================================================================
  // GET /patterns/weekly
  // =========================================================================
  describe("GET /weekly", () => {
    it("returns 7 entries with Japanese day names", async () => {
      const rows = [
        { day: 0, count: 20, msPlayed: 3600000 },
        { day: 3, count: 10, msPlayed: 1800000 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/patterns/weekly");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(7);

      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      json.data.forEach((d: any, i: number) => {
        expect(d.day).toBe(i);
        expect(d.dayName).toBe(dayNames[i]);
      });

      // Check data vs zero-filled
      expect(json.data[0].count).toBe(20); // Sunday has data
      expect(json.data[1].count).toBe(0); // Monday zero-filled
      expect(json.data[3].count).toBe(10); // Wednesday has data
    });

    it("returns all zeros when no data", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/weekly");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(7);
      expect(json.data.every((d: any) => d.count === 0)).toBe(true);
    });
  });

  // =========================================================================
  // GET /patterns/monthly
  // =========================================================================
  describe("GET /monthly", () => {
    it("returns 12 entries with Japanese month names", async () => {
      const rows = [
        { month: 1, count: 50, msPlayed: 9000000 },
        { month: 7, count: 30, msPlayed: 5400000 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/patterns/monthly");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(12);

      const monthNames = [
        "1月", "2月", "3月", "4月", "5月", "6月",
        "7月", "8月", "9月", "10月", "11月", "12月",
      ];
      json.data.forEach((d: any, i: number) => {
        expect(d.month).toBe(i + 1);
        expect(d.monthName).toBe(monthNames[i]);
      });

      expect(json.data[0].count).toBe(50); // January
      expect(json.data[1].count).toBe(0); // February zero-filled
      expect(json.data[6].count).toBe(30); // July
    });

    it("returns all zeros when no data", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/monthly");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(12);
      expect(json.data.every((d: any) => d.count === 0)).toBe(true);
    });
  });

  // =========================================================================
  // GET /patterns/overview
  // =========================================================================
  describe("GET /overview", () => {
    it("returns peakHour with label", async () => {
      const hourRows = [{ hour: 23, count: 100 }];
      const dayRows = [{ day: 5, count: 200 }];
      const monthRows = [{ month: 7, count: 300 }];
      const dateRange = [
        {
          totalPlays: 1000,
          minDate: "2024-01-01T00:00:00Z",
          maxDate: "2024-06-30T00:00:00Z",
        },
      ];
      const yearRows = [{ year: 2024 }, { year: 2023 }];

      mockSelectSequence([hourRows, dayRows, monthRows, dateRange, yearRows]);
      const app = createApp();

      const res = await req(app, "/patterns/overview");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.peakHour.hour).toBe(23);
      expect(json.data.peakHour.label).toBe("夜");
    });

    it("returns busiestDay with Japanese name", async () => {
      const hourRows = [{ hour: 14, count: 50 }];
      const dayRows = [{ day: 6, count: 200 }]; // Saturday
      const monthRows = [{ month: 3, count: 100 }];
      const dateRange = [
        {
          totalPlays: 500,
          minDate: "2024-01-01T00:00:00Z",
          maxDate: "2024-03-31T00:00:00Z",
        },
      ];
      const yearRows = [{ year: 2024 }];

      mockSelectSequence([hourRows, dayRows, monthRows, dateRange, yearRows]);
      const app = createApp();

      const res = await req(app, "/patterns/overview");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.busiestDay.day).toBe(6);
      expect(json.data.busiestDay.dayName).toBe("土");
    });

    it("returns favoriteSeason based on monthly plays", async () => {
      const hourRows = [{ hour: 10, count: 50 }];
      const dayRows = [{ day: 1, count: 100 }];
      // Summer months (6, 7, 8) have most plays
      const monthRows = [
        { month: 6, count: 100 },
        { month: 7, count: 150 },
        { month: 8, count: 120 },
        { month: 1, count: 30 },
      ];
      const dateRange = [
        {
          totalPlays: 400,
          minDate: "2024-01-01T00:00:00Z",
          maxDate: "2024-12-31T00:00:00Z",
        },
      ];
      const yearRows = [{ year: 2024 }];

      mockSelectSequence([hourRows, dayRows, monthRows, dateRange, yearRows]);
      const app = createApp();

      const res = await req(app, "/patterns/overview");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.favoriteSeason).toBe("夏");
    });

    it("returns Night Owl listener type for late-night peak", async () => {
      const hourRows = [{ hour: 23, count: 200 }];
      const dayRows = [{ day: 0, count: 100 }];
      const monthRows = [{ month: 12, count: 100 }];
      const dateRange = [
        {
          totalPlays: 300,
          minDate: "2024-01-01T00:00:00Z",
          maxDate: "2024-12-31T00:00:00Z",
        },
      ];
      const yearRows = [{ year: 2024 }];

      mockSelectSequence([hourRows, dayRows, monthRows, dateRange, yearRows]);
      const app = createApp();

      const res = await req(app, "/patterns/overview");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.listenerType).toContain("Night Owl");
    });

    it("returns Early Bird listener type for morning peak", async () => {
      const hourRows = [{ hour: 7, count: 200 }];
      const dayRows = [{ day: 1, count: 100 }];
      const monthRows = [{ month: 3, count: 100 }];
      const dateRange = [
        {
          totalPlays: 200,
          minDate: "2024-01-01T00:00:00Z",
          maxDate: "2024-03-31T00:00:00Z",
        },
      ];
      const yearRows = [{ year: 2024 }];

      mockSelectSequence([hourRows, dayRows, monthRows, dateRange, yearRows]);
      const app = createApp();

      const res = await req(app, "/patterns/overview");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.listenerType).toContain("Early Bird");
    });

    it("returns averageDailyPlays", async () => {
      const hourRows = [{ hour: 12, count: 50 }];
      const dayRows = [{ day: 3, count: 100 }];
      const monthRows = [{ month: 1, count: 100 }];
      // 100 days span, 1000 plays = 10 avg/day
      const dateRange = [
        {
          totalPlays: 1000,
          minDate: "2024-01-01T00:00:00Z",
          maxDate: "2024-04-10T00:00:00Z",
        },
      ];
      const yearRows = [{ year: 2024 }];

      mockSelectSequence([hourRows, dayRows, monthRows, dateRange, yearRows]);
      const app = createApp();

      const res = await req(app, "/patterns/overview");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.averageDailyPlays).toBeGreaterThan(0);
    });

    it("returns availableYears", async () => {
      const hourRows = [{ hour: 12, count: 50 }];
      const dayRows = [{ day: 1, count: 100 }];
      const monthRows = [{ month: 6, count: 100 }];
      const dateRange = [
        {
          totalPlays: 500,
          minDate: "2023-01-01T00:00:00Z",
          maxDate: "2024-12-31T00:00:00Z",
        },
      ];
      const yearRows = [{ year: 2024 }, { year: 2023 }, { year: 2022 }];

      mockSelectSequence([hourRows, dayRows, monthRows, dateRange, yearRows]);
      const app = createApp();

      const res = await req(app, "/patterns/overview");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.availableYears).toEqual([2024, 2023, 2022]);
    });

    it("defaults to zero when no data", async () => {
      // All queries return empty
      mockSelectSequence([[], [], [], [{ totalPlays: 0, minDate: null, maxDate: null }], []]);
      const app = createApp();

      const res = await req(app, "/patterns/overview");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.peakHour.hour).toBe(0);
      expect(json.data.averageDailyPlays).toBe(0);
      expect(json.data.availableYears).toEqual([]);
    });
  });

  // =========================================================================
  // GET /patterns/time-artists
  // =========================================================================
  describe("GET /time-artists", () => {
    it("returns 4 time periods with artists", async () => {
      const nightArtists = [
        { artistName: "Bon Iver", playCount: 50, msPlayed: 9000000 },
      ];
      const morningArtists = [
        { artistName: "Beach House", playCount: 30, msPlayed: 5400000 },
      ];
      const daytimeArtists = [
        { artistName: "Tame Impala", playCount: 40, msPlayed: 7200000 },
      ];
      const eveningArtists = [
        { artistName: "Radiohead", playCount: 60, msPlayed: 10800000 },
      ];

      mockSelectSequence([
        nightArtists,
        morningArtists,
        daytimeArtists,
        eveningArtists,
      ]);
      const app = createApp();

      const res = await req(app, "/patterns/time-artists");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Object.keys(json.data)).toEqual(
        expect.arrayContaining(["night", "morning", "daytime", "evening"]),
      );

      expect(json.data.night.label).toBe("深夜の相棒");
      expect(json.data.morning.label).toBe("夜明けの一枚");
      expect(json.data.daytime.label).toBe("陽だまりの音楽");
      expect(json.data.evening.label).toBe("黄昏のサウンド");

      expect(json.data.night.artists[0].artistName).toBe("Bon Iver");
      expect(json.data.evening.artists[0].playCount).toBe(60);
    });

    it("returns empty artists for periods with no data", async () => {
      mockSelectSequence([[], [], [], []]);
      const app = createApp();

      const res = await req(app, "/patterns/time-artists");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.night.artists).toEqual([]);
      expect(json.data.morning.artists).toEqual([]);
      expect(json.data.daytime.artists).toEqual([]);
      expect(json.data.evening.artists).toEqual([]);
    });

    it("accepts year filter", async () => {
      mockSelectSequence([[], [], [], []]);
      const app = createApp();

      const res = await req(app, "/patterns/time-artists?year=2024");
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /patterns/devices
  // =========================================================================
  describe("GET /devices", () => {
    it("returns platform breakdown", async () => {
      const rows = [
        { platform: "iOS", playCount: 500, totalMs: "90000000" },
        { platform: "macOS", playCount: 300, totalMs: "54000000" },
        { platform: "web_player", playCount: 50, totalMs: "9000000" },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/patterns/devices");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(3);
      expect(json.data[0].platform).toBe("iOS");
      expect(json.data[0].playCount).toBe(500);
    });

    it("returns empty when no device data", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/devices");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual([]);
    });

    it("accepts year filter", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/devices?year=2024");
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /patterns/shuffle
  // =========================================================================
  describe("GET /shuffle", () => {
    it("returns shuffle vs intentional ratio", async () => {
      const row = [{ shufflePlays: 200, intentionalPlays: 800, total: 1000 }];
      mockDb = createMockDb({ selectData: row });
      const app = createApp();

      const res = await req(app, "/patterns/shuffle");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.shufflePlays).toBe(200);
      expect(json.data.intentionalPlays).toBe(800);
      expect(json.data.total).toBe(1000);
    });

    it("returns zeros when no shuffle data", async () => {
      const row = [{ shufflePlays: 0, intentionalPlays: 0, total: 0 }];
      mockDb = createMockDb({ selectData: row });
      const app = createApp();

      const res = await req(app, "/patterns/shuffle");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.shufflePlays).toBe(0);
      expect(json.data.total).toBe(0);
    });

    it("accepts year filter", async () => {
      const row = [{ shufflePlays: 50, intentionalPlays: 150, total: 200 }];
      mockDb = createMockDb({ selectData: row });
      const app = createApp();

      const res = await req(app, "/patterns/shuffle?year=2024");
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /patterns/artists
  // =========================================================================
  describe("GET /artists", () => {
    it("returns artist names sorted by play count", async () => {
      const rows = [
        { artistName: "Radiohead", playCount: 150 },
        { artistName: "Bjork", playCount: 80 },
        { artistName: "Aphex Twin", playCount: 50 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/patterns/artists");
      expect(res.status).toBe(200);

      const json = await res.json();
      // Route maps to just artist names
      expect(json.data).toEqual(["Radiohead", "Bjork", "Aphex Twin"]);
    });

    it("returns empty array when no history", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/artists");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual([]);
    });

    it("accepts year filter", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/artists?year=2024");
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /patterns/albums
  // =========================================================================
  describe("GET /albums", () => {
    it("returns album names sorted by play count", async () => {
      const rows = [
        { albumName: "OK Computer", playCount: 100 },
        { albumName: "Kid A", playCount: 80 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/patterns/albums");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual(["OK Computer", "Kid A"]);
    });

    it("filters out null/empty album names", async () => {
      const rows = [
        { albumName: "OK Computer", playCount: 100 },
        { albumName: null, playCount: 50 },
        { albumName: "", playCount: 30 },
        { albumName: "Kid A", playCount: 20 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(app, "/patterns/albums");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual(["OK Computer", "Kid A"]);
    });

    it("accepts artist filter to cascade selection", async () => {
      const rows = [
        { albumName: "OK Computer", playCount: 100 },
      ];
      mockDb = createMockDb({ selectData: rows });
      const app = createApp();

      const res = await req(
        app,
        "/patterns/albums?artist=Radiohead",
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual(["OK Computer"]);
    });

    it("returns empty array when no albums", async () => {
      mockDb = createMockDb({ selectData: [] });
      const app = createApp();

      const res = await req(app, "/patterns/albums");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toEqual([]);
    });
  });
});
