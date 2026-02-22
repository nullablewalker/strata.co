import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { spotifyServer, spotifyHandlers } from "../../test/mocks/spotify-api";

// ---------------------------------------------------------------------------
// Mock state — must be declared before vi.mock() calls
// ---------------------------------------------------------------------------

let mockSelectResults: unknown[][] = [];
let mockSelectCallIndex = 0;
let mockExecuteResults: { rows: Record<string, unknown>[] }[] = [];
let mockExecuteCallIndex = 0;

function resetMockState() {
  mockSelectResults = [];
  mockSelectCallIndex = 0;
  mockExecuteResults = [];
  mockExecuteCallIndex = 0;
}

/**
 * Set up the return data for sequential db.select() / db.selectDistinct() calls.
 * Each entry in the array corresponds to one chained query resolution.
 */
function setSelectResults(...results: unknown[][]) {
  mockSelectResults = results;
  mockSelectCallIndex = 0;
}

function setExecuteResults(...results: { rows: Record<string, unknown>[] }[]) {
  mockExecuteResults = results;
  mockExecuteCallIndex = 0;
}

// ---------------------------------------------------------------------------
// Chain builder for select mocking (returns thenable chain)
// ---------------------------------------------------------------------------

function createChain(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from", "where", "groupBy", "orderBy", "limit", "offset",
    "innerJoin", "leftJoin", "having", "as",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve?: (v: unknown) => unknown) => Promise.resolve(data).then(resolve);
  return chain;
}

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  createDb: vi.fn(() => {
    const db: Record<string, unknown> = {
      select: vi.fn(() => {
        const idx = mockSelectCallIndex++;
        const data = mockSelectResults[idx] ?? [];
        return createChain(data);
      }),
      selectDistinct: vi.fn(() => {
        const idx = mockSelectCallIndex++;
        const data = mockSelectResults[idx] ?? [];
        return createChain(data);
      }),
      execute: vi.fn(() => {
        const idx = mockExecuteCallIndex++;
        return Promise.resolve(mockExecuteResults[idx] ?? { rows: [] });
      }),
      query: {
        users: { findFirst: vi.fn().mockResolvedValue({ refreshToken: "mock_refresh" }) },
      },
    };
    return db;
  }),
}));

vi.mock("../middleware/session", () => ({
  authGuard: () => {
    return async (c: { get: (k: string) => unknown; json: (d: unknown, s: number) => Response }, next: () => Promise<void>) => {
      const session = c.get("session") as { get: (k: string) => unknown } | undefined;
      if (!session || !session.get("userId")) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    };
  },
}));

// Mock spotify lib functions used by vault (getValidAccessToken, etc.)
vi.mock("../lib/spotify", () => ({
  getValidAccessToken: vi.fn(() => "mock_access_token"),
  refreshAndUpdateSession: vi.fn().mockResolvedValue("refreshed_token"),
  fetchTrackMetadata: vi.fn().mockResolvedValue(
    new Map([["track123", { albumArt: "https://example.com/art.jpg", albumName: "Test Album" }]]),
  ),
  searchArtist: vi.fn().mockResolvedValue({ id: "artist123", genres: ["indie rock", "alternative"] }),
}));

// ---------------------------------------------------------------------------
// Session middleware for test app
// ---------------------------------------------------------------------------

let testSessionData: Record<string, unknown> = {};

function setAuthenticated(userId = "test-user-uuid-123") {
  testSessionData = {
    userId,
    accessToken: "mock_access_token",
    accessTokenExpiresAt: Date.now() + 3600000,
  };
}

function setUnauthenticated() {
  testSessionData = {};
}

// ---------------------------------------------------------------------------
// Build test app
// ---------------------------------------------------------------------------

const mockEnv: Env = {
  DATABASE_URL: "postgres://test:test@localhost/strata_test",
  SPOTIFY_CLIENT_ID: "mock_id",
  SPOTIFY_CLIENT_SECRET: "mock_secret",
  SESSION_ENCRYPTION_KEY: "a]vxd!bRzQE3p6kEJnaGHx#UPc5ts8Wj",
  ENVIRONMENT: "test",
};

async function buildApp() {
  const { default: vault } = await import("./vault");

  const app = new Hono<{ Bindings: Env }>();

  // Inject mock session
  app.use("*", async (c, next) => {
    const session = {
      get: (key: string) => testSessionData[key],
      set: (key: string, value: unknown) => { testSessionData[key] = value; },
      deleteSession: () => { testSessionData = {}; },
    };
    c.set("session", session as never);
    await next();
  });

  app.route("/vault", vault);
  return app;
}

/** Helper to make requests with env bindings */
function req(path: string) {
  return app.request(path, {}, mockEnv);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let app: Hono<{ Bindings: Env }>;

beforeAll(async () => {
  spotifyServer.listen({ onUnhandledRequest: "bypass" });
  app = await buildApp();
});

afterAll(() => {
  spotifyServer.close();
});

beforeEach(() => {
  resetMockState();
  setAuthenticated();
});

afterEach(() => {
  spotifyServer.resetHandlers();
  vi.clearAllMocks();
});

// =========================================================================
// GET /vault/tracks
// =========================================================================

describe("GET /vault/tracks", () => {
  const mockTrack = {
    trackSpotifyId: "track123",
    trackName: "Test Track",
    artistName: "Test Artist",
    albumName: "Test Album",
    playCount: 10,
    totalMsPlayed: 1800000,
    firstPlayedAt: "2024-01-01T00:00:00Z",
    lastPlayedAt: "2024-06-15T10:30:00Z",
    completionCount: 8,
    skipCount: 1,
  };

  it("returns tracks with aggregated data", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].trackName).toBe("Test Track");
    expect(json.data[0].playCount).toBe(10);
    expect(json.total).toBe(1);
  });

  it("returns empty array when no tracks", async () => {
    setSelectResults([], [{ total: 0 }]);
    const res = await req("/vault/tracks");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
    expect(json.total).toBe(0);
  });

  it("accepts sort=time parameter", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks?sort=time");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });

  it("accepts sort=recent parameter", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks?sort=recent");
    expect(res.status).toBe(200);
  });

  it("accepts sort=name parameter", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks?sort=name");
    expect(res.status).toBe(200);
  });

  it("accepts order=asc parameter", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks?order=asc");
    expect(res.status).toBe(200);
  });

  it("accepts search parameter", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks?search=Test");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });

  it("accepts artist filter", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks?artist=Test%20Artist");
    expect(res.status).toBe(200);
  });

  it("accepts album filter", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks?album=Test%20Album");
    expect(res.status).toBe(200);
  });

  it("limits results to max 200", async () => {
    setSelectResults([mockTrack], [{ total: 1 }]);
    const res = await req("/vault/tracks?limit=500");
    expect(res.status).toBe(200);
    // The limit is clamped to 200 internally; we verify the route doesn't error
  });

  it("supports offset for pagination", async () => {
    setSelectResults([mockTrack], [{ total: 10 }]);
    const res = await req("/vault/tracks?offset=5");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(10);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/tracks");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/artists
// =========================================================================

describe("GET /vault/artists", () => {
  const mockArtist = {
    artistName: "Test Artist",
    playCount: 50,
    uniqueTracks: 12,
    totalMsPlayed: 9000000,
  };

  it("returns artists with aggregated data", async () => {
    setSelectResults([mockArtist], [{ total: 1 }]);
    const res = await req("/vault/artists");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].artistName).toBe("Test Artist");
    expect(json.data[0].playCount).toBe(50);
    expect(json.data[0].uniqueTracks).toBe(12);
    expect(json.total).toBe(1);
  });

  it("returns empty array when no artists", async () => {
    setSelectResults([], [{ total: 0 }]);
    const res = await req("/vault/artists");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
    expect(json.total).toBe(0);
  });

  it("accepts sort=time parameter", async () => {
    setSelectResults([mockArtist], [{ total: 1 }]);
    const res = await req("/vault/artists?sort=time");
    expect(res.status).toBe(200);
  });

  it("accepts sort=name parameter", async () => {
    setSelectResults([mockArtist], [{ total: 1 }]);
    const res = await req("/vault/artists?sort=name");
    expect(res.status).toBe(200);
  });

  it("accepts order=asc parameter", async () => {
    setSelectResults([mockArtist], [{ total: 1 }]);
    const res = await req("/vault/artists?order=asc");
    expect(res.status).toBe(200);
  });

  it("accepts search parameter", async () => {
    setSelectResults([mockArtist], [{ total: 1 }]);
    const res = await req("/vault/artists?search=Test");
    expect(res.status).toBe(200);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/artists");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/albums
// =========================================================================

describe("GET /vault/albums", () => {
  it("returns distinct album names", async () => {
    setSelectResults([{ albumName: "Album A" }, { albumName: "Album B" }]);
    const res = await req("/vault/albums");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toContain("Album A");
    expect(json.data).toContain("Album B");
  });

  it("filters by artist", async () => {
    setSelectResults([{ albumName: "Artist Album" }]);
    const res = await req("/vault/albums?artist=Test%20Artist");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toContain("Artist Album");
  });

  it("excludes null album names", async () => {
    setSelectResults([{ albumName: null }, { albumName: "Valid Album" }]);
    const res = await req("/vault/albums");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).not.toContain(null);
    expect(json.data).toContain("Valid Album");
  });

  it("returns empty array when no albums", async () => {
    setSelectResults([]);
    const res = await req("/vault/albums");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/albums");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/genres
// =========================================================================

describe("GET /vault/genres", () => {
  it("returns sorted genres from Spotify search", async () => {
    // First select: top artists
    setSelectResults([{ artistName: "Test Artist", playCount: 100 }]);
    const res = await req("/vault/genres");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toContain("alternative");
    expect(json.data).toContain("indie rock");
  });

  it("returns empty array when no artists", async () => {
    setSelectResults([]);
    const res = await req("/vault/genres");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/genres");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/metadata
// =========================================================================

describe("GET /vault/metadata", () => {
  it("returns metadata for given track IDs", async () => {
    const res = await req("/vault/metadata?trackIds=track123");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.track123).toBeDefined();
    expect(json.data.track123.albumArt).toBe("https://example.com/art.jpg");
    expect(json.data.track123.albumName).toBe("Test Album");
  });

  it("returns empty object when no trackIds param", async () => {
    const res = await req("/vault/metadata");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({});
  });

  it("limits to 50 track IDs", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `track${i}`).join(",");
    const res = await app.request(`/vault/metadata?trackIds=${ids}`, {}, mockEnv);
    expect(res.status).toBe(200);
    // The route slices to 50 internally; we verify it doesn't error
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/metadata?trackIds=track123");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/stats
// =========================================================================

describe("GET /vault/stats", () => {
  it("returns overview stats with top track and artist", async () => {
    setSelectResults(
      // overview
      [{ totalTracks: 100, totalArtists: 20, totalPlays: 500, totalMsPlayed: 90000000, dateFrom: "2023-01-01", dateTo: "2024-06-15" }],
      // topTrack
      [{ trackName: "Hit Song", artistName: "Big Artist", playCount: 50 }],
      // topArtist
      [{ artistName: "Big Artist", playCount: 200 }],
    );
    setExecuteResults(
      // completionRate
      { rows: [{ completed: "400", total: "500" }] },
      // skipRate
      { rows: [{ skipped: "50", total: "500" }] },
    );

    const res = await req("/vault/stats");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.totalTracks).toBe(100);
    expect(json.data.totalArtists).toBe(20);
    expect(json.data.totalPlays).toBe(500);
    expect(json.data.topTrack.trackName).toBe("Hit Song");
    expect(json.data.topArtist.artistName).toBe("Big Artist");
    expect(json.data.completionRate).toBe(80);
    expect(json.data.skipRate).toBe(10);
  });

  it("handles empty data gracefully", async () => {
    setSelectResults(
      [{ totalTracks: 0, totalArtists: 0, totalPlays: 0, totalMsPlayed: 0, dateFrom: null, dateTo: null }],
      [], // no topTrack
      [], // no topArtist
    );
    setExecuteResults(
      { rows: [{ completed: "0", total: "0" }] },
      { rows: [{ skipped: "0", total: "0" }] },
    );

    const res = await req("/vault/stats");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.totalPlays).toBe(0);
    expect(json.data.topTrack).toBeNull();
    expect(json.data.topArtist).toBeNull();
    expect(json.data.completionRate).toBeNull();
    expect(json.data.skipRate).toBeNull();
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/stats");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/autobiography
// =========================================================================

describe("GET /vault/autobiography", () => {
  it("returns complete autobiography data", async () => {
    setSelectResults(
      // overall
      [{ totalPlays: 1000, totalMs: 180000000, uniqueTracks: 200, uniqueArtists: 50, firstPlay: "2022-01-01", lastPlay: "2024-06-15" }],
      // topArtists
      [
        { artistName: "Artist 1", playCount: 100, msPlayed: 18000000 },
        { artistName: "Artist 2", playCount: 80, msPlayed: 14400000 },
      ],
      // topTracks
      [
        { trackName: "Track 1", artistName: "Artist 1", playCount: 50, msPlayed: 9000000 },
      ],
      // peakHour
      [{ hour: 22, playCount: 150 }],
      // peakYear
      [{ year: 2023, playCount: 500, msPlayed: 90000000 }],
      // nightStats
      [{ playCount: 300 }],
      // nightArtist
      [{ artistName: "Night Owl Artist", playCount: 80 }],
    );

    const res = await req("/vault/autobiography");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.overall.totalPlays).toBe(1000);
    expect(json.data.topArtists).toHaveLength(2);
    expect(json.data.topTracks).toHaveLength(1);
    expect(json.data.peakHour.hour).toBe(22);
    expect(json.data.peakYear.year).toBe(2023);
    expect(json.data.nightStats.playCount).toBe(300);
    expect(json.data.nightArtist.artistName).toBe("Night Owl Artist");
  });

  it("handles empty data with null values", async () => {
    setSelectResults(
      [{ totalPlays: 0, totalMs: 0, uniqueTracks: 0, uniqueArtists: 0, firstPlay: null, lastPlay: null }],
      [], // no topArtists
      [], // no topTracks
      [], // no peakHour → undefined, coerced to null via || null
      [], // no peakYear
      [], // no nightStats
      [], // no nightArtist
    );

    const res = await req("/vault/autobiography");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.overall.totalPlays).toBe(0);
    expect(json.data.topArtists).toHaveLength(0);
    expect(json.data.peakHour).toBeNull();
    expect(json.data.peakYear).toBeNull();
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/autobiography");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/mosaic
// =========================================================================

describe("GET /vault/mosaic", () => {
  it("returns monthly top albums grouped by month", async () => {
    setSelectResults([
      { month: "2024-01", albumName: "Jan Album 1", artistName: "Artist A", playCount: 20, msPlayed: 3600000, trackSpotifyId: "t1" },
      { month: "2024-01", albumName: "Jan Album 2", artistName: "Artist B", playCount: 15, msPlayed: 2700000, trackSpotifyId: "t2" },
      { month: "2024-02", albumName: "Feb Album 1", artistName: "Artist C", playCount: 25, msPlayed: 4500000, trackSpotifyId: "t3" },
    ]);

    const res = await req("/vault/mosaic");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2); // 2 months
    expect(json.data[0].month).toBe("2024-01");
    expect(json.data[0].albums).toHaveLength(2);
    expect(json.data[1].month).toBe("2024-02");
    expect(json.data[1].albums).toHaveLength(1);
  });

  it("limits to 6 albums per month", async () => {
    const albums = Array.from({ length: 8 }, (_, i) => ({
      month: "2024-03",
      albumName: `Album ${i}`,
      artistName: `Artist ${i}`,
      playCount: 10 - i,
      msPlayed: 1800000,
      trackSpotifyId: `t${i}`,
    }));
    setSelectResults(albums);

    const res = await req("/vault/mosaic");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].albums).toHaveLength(6);
  });

  it("returns empty array when no data", async () => {
    setSelectResults([]);
    const res = await req("/vault/mosaic");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/mosaic");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/time-capsule
// =========================================================================

describe("GET /vault/time-capsule", () => {
  it("returns tracks from past years on this day", async () => {
    // The route loops 5 times (1-5 years ago), each doing one select
    const trackFromPast = {
      trackSpotifyId: "old_track",
      trackName: "Old Song",
      artistName: "Old Artist",
      albumName: "Old Album",
      totalMsPlayed: 180000,
      firstPlayedAt: "2023-02-22T10:00:00Z",
      playCount: 3,
    };
    // Years 1-5: only year 1 has data
    setSelectResults(
      [trackFromPast], // 1 year ago
      [],              // 2 years ago
      [],              // 3 years ago
      [],              // 4 years ago
      [],              // 5 years ago
    );

    const res = await req("/vault/time-capsule");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].yearsAgo).toBe(1);
    expect(json.data[0].tracks).toHaveLength(1);
    expect(json.data[0].tracks[0].trackName).toBe("Old Song");
  });

  it("returns empty array when no historical data", async () => {
    setSelectResults([], [], [], [], []);
    const res = await req("/vault/time-capsule");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });

  it("returns multiple capsules when data exists for multiple years", async () => {
    const track1 = { trackSpotifyId: "t1", trackName: "Song 1", artistName: "A1", albumName: "Al1", totalMsPlayed: 180000, firstPlayedAt: "2025-02-22", playCount: 1 };
    const track2 = { trackSpotifyId: "t2", trackName: "Song 2", artistName: "A2", albumName: "Al2", totalMsPlayed: 240000, firstPlayedAt: "2023-02-22", playCount: 2 };
    setSelectResults(
      [track1], // 1 year ago
      [],       // 2 years ago
      [track2], // 3 years ago
      [],       // 4 years ago
      [],       // 5 years ago
    );

    const res = await req("/vault/time-capsule");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.data[0].yearsAgo).toBe(1);
    expect(json.data[1].yearsAgo).toBe(3);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/time-capsule");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/dormant-artists
// =========================================================================

describe("GET /vault/dormant-artists", () => {
  it("returns artists with significant listening but no recent plays", async () => {
    const dormant = {
      artistName: "Forgotten Band",
      totalMsPlayed: 7200000, // 2 hours
      playCount: 40,
      lastPlayed: "2024-06-01T00:00:00Z",
    };
    setSelectResults([dormant]);

    const res = await req("/vault/dormant-artists");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].artistName).toBe("Forgotten Band");
    expect(json.data[0].totalMsPlayed).toBe(7200000);
  });

  it("returns empty array when no dormant artists", async () => {
    setSelectResults([]);
    const res = await req("/vault/dormant-artists");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/dormant-artists");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/drift-report
// =========================================================================

describe("GET /vault/drift-report", () => {
  it("returns month-over-month comparison with rising and fading artists", async () => {
    setSelectResults(
      // currentArtists
      [
        { artistName: "New Hot Artist", playCount: 30, msPlayed: 5400000 },
        { artistName: "Steady Artist", playCount: 20, msPlayed: 3600000 },
      ],
      // prevArtists
      [
        { artistName: "Steady Artist", playCount: 18, msPlayed: 3240000 },
        { artistName: "Old Favorite", playCount: 25, msPlayed: 4500000 },
      ],
      // currentStats
      [{ totalPlays: 100, totalMs: 18000000, uniqueArtists: 15, uniqueTracks: 60 }],
      // prevStats
      [{ totalPlays: 90, totalMs: 16200000, uniqueArtists: 12, uniqueTracks: 50 }],
    );

    const res = await req("/vault/drift-report");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.currentMonth).toBeDefined();
    expect(json.data.prevMonth).toBeDefined();
    expect(json.data.current.artists).toHaveLength(2);
    expect(json.data.previous.artists).toHaveLength(2);
    // "New Hot Artist" is rising (not in prev)
    expect(json.data.rising.length).toBeGreaterThanOrEqual(1);
    // "Old Favorite" is fading (in prev but not in current)
    expect(json.data.fading.length).toBeGreaterThanOrEqual(1);
    expect(json.data.fading[0].artistName).toBe("Old Favorite");
  });

  it("handles empty months gracefully", async () => {
    setSelectResults([], [], [{ totalPlays: 0, totalMs: 0, uniqueArtists: 0, uniqueTracks: 0 }], [{ totalPlays: 0, totalMs: 0, uniqueArtists: 0, uniqueTracks: 0 }]);

    const res = await req("/vault/drift-report");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.current.artists).toHaveLength(0);
    expect(json.data.previous.artists).toHaveLength(0);
    expect(json.data.rising).toHaveLength(0);
    expect(json.data.fading).toHaveLength(0);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/drift-report");
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// GET /vault/annual-summary
// =========================================================================

describe("GET /vault/annual-summary", () => {
  it("returns yearly stats with top artists and tracks", async () => {
    setSelectResults(
      // stats
      [{ totalPlays: 500, totalMs: 90000000, uniqueTracks: 150, uniqueArtists: 40 }],
      // topArtists
      [
        { artistName: "Top Artist 1", playCount: 80, msPlayed: 14400000 },
        { artistName: "Top Artist 2", playCount: 60, msPlayed: 10800000 },
      ],
      // topTracks
      [
        { trackName: "Hit 1", artistName: "Top Artist 1", playCount: 30 },
      ],
      // monthlyPlays
      [
        { month: 1, playCount: 50 },
        { month: 6, playCount: 80 },
      ],
      // peakHour
      [{ hour: 21, playCount: 100 }],
      // availableYears
      [{ year: 2024 }, { year: 2023 }, { year: 2022 }],
    );

    const res = await req("/vault/annual-summary?year=2024");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.year).toBe(2024);
    expect(json.data.stats.totalPlays).toBe(500);
    expect(json.data.topArtists).toHaveLength(2);
    expect(json.data.topTracks).toHaveLength(1);
    expect(json.data.monthlyPlays).toHaveLength(12); // always 12 months
    expect(json.data.monthlyPlays[0].playCount).toBe(50); // Jan
    expect(json.data.monthlyPlays[5].playCount).toBe(80); // Jun
    expect(json.data.monthlyPlays[2].playCount).toBe(0);  // Mar (no data → 0)
    expect(json.data.peakHour.hour).toBe(21);
    expect(json.data.availableYears).toEqual([2024, 2023, 2022]);
  });

  it("defaults to current year when no year param", async () => {
    setSelectResults(
      [{ totalPlays: 0, totalMs: 0, uniqueTracks: 0, uniqueArtists: 0 }],
      [], [], [], [], [],
    );

    const res = await req("/vault/annual-summary");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.year).toBe(new Date().getFullYear());
  });

  it("returns null peakHour when no data", async () => {
    setSelectResults(
      [{ totalPlays: 0, totalMs: 0, uniqueTracks: 0, uniqueArtists: 0 }],
      [], [], [], [], [],
    );

    const res = await req("/vault/annual-summary?year=2020");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.peakHour).toBeNull();
    expect(json.data.topArtists).toHaveLength(0);
    expect(json.data.topTracks).toHaveLength(0);
  });

  it("fills all 12 months even with sparse data", async () => {
    setSelectResults(
      [{ totalPlays: 10, totalMs: 1800000, uniqueTracks: 5, uniqueArtists: 3 }],
      [], [],
      [{ month: 3, playCount: 10 }], // Only March
      [], [],
    );

    const res = await req("/vault/annual-summary?year=2024");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.monthlyPlays).toHaveLength(12);
    expect(json.data.monthlyPlays[2].month).toBe(3);
    expect(json.data.monthlyPlays[2].playCount).toBe(10);
    // All other months should be 0
    expect(json.data.monthlyPlays[0].playCount).toBe(0);
  });

  it("returns 401 without authentication", async () => {
    setUnauthenticated();
    const res = await req("/vault/annual-summary");
    expect(res.status).toBe(401);
  });
});
