import { Hono } from "hono";
import { sql, eq, ilike, or, and, desc, asc, count, countDistinct } from "drizzle-orm";
import { Spotify } from "arctic";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { authGuard, type SessionData } from "../middleware/session";
import { createDb } from "../db";
import { listeningHistory, users } from "../db/schema";
import {
  fetchTrackMetadata,
  searchArtist,
  getValidAccessToken,
  refreshAndUpdateSession,
} from "../lib/spotify";

const vault = new Hono<{ Bindings: Env }>();

vault.use("*", authGuard());

/**
 * Helper: get a valid access token, refreshing if needed.
 */
async function getAccessToken(
  c: { env: Env; req: { url: string } },
  session: Session<SessionData>,
): Promise<string> {
  try {
    return getValidAccessToken(session);
  } catch {
    // Token expired, refresh it
    const userId = session.get("userId")!;
    const db = createDb(c.env.DATABASE_URL);
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { refreshToken: true },
    });

    if (!user?.refreshToken) {
      throw new Error("No refresh token available");
    }

    const spotify = new Spotify(
      c.env.SPOTIFY_CLIENT_ID,
      c.env.SPOTIFY_CLIENT_SECRET,
      `${new URL(c.req.url).origin}/api/auth/callback`,
    );

    return refreshAndUpdateSession(session, spotify, user.refreshToken);
  }
}

// --- Tracks ---

vault.get("/tracks", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const sortParam = c.req.query("sort") ?? "plays";
  const orderParam = c.req.query("order") ?? "desc";
  const search = c.req.query("search");
  const artist = c.req.query("artist");
  const album = c.req.query("album");
  const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);
  const offset = Number(c.req.query("offset") ?? "0");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  const conditions = [eq(lh.userId, userId)];
  if (search) {
    conditions.push(or(ilike(lh.trackName, `%${search}%`), ilike(lh.artistName, `%${search}%`))!);
  }
  if (artist) {
    conditions.push(eq(lh.artistName, artist));
  }
  if (album) {
    conditions.push(eq(lh.albumName, album));
  }

  const orderDir = orderParam === "asc" ? asc : desc;

  const sortColumn = (() => {
    switch (sortParam) {
      case "time":
        return sql<number>`sum(${lh.msPlayed})`;
      case "recent":
        return sql<string>`max(${lh.playedAt})`;
      case "name":
        return lh.trackName;
      default:
        return sql<number>`count(*)`;
    }
  })();

  const whereClause = and(...conditions);

  const tracks = await db
    .select({
      trackSpotifyId: lh.trackSpotifyId,
      trackName: lh.trackName,
      artistName: lh.artistName,
      albumName: lh.albumName,
      playCount: sql<number>`count(*)`.mapWith(Number),
      totalMsPlayed: sql<number>`sum(${lh.msPlayed})`.mapWith(Number),
      firstPlayedAt: sql<string>`min(${lh.playedAt})`,
      lastPlayedAt: sql<string>`max(${lh.playedAt})`,
    })
    .from(lh)
    .where(whereClause)
    .groupBy(lh.trackSpotifyId, lh.trackName, lh.artistName, lh.albumName)
    .orderBy(orderDir(sortColumn))
    .limit(limit)
    .offset(offset);

  // Get total count for pagination (with same filters)
  const countConditions = [eq(lh.userId, userId)];
  if (search) {
    countConditions.push(
      or(ilike(lh.trackName, `%${search}%`), ilike(lh.artistName, `%${search}%`))!,
    );
  }
  if (artist) {
    countConditions.push(eq(lh.artistName, artist));
  }
  if (album) {
    countConditions.push(eq(lh.albumName, album));
  }

  const countWhere = and(...countConditions);

  const [totalResult] = await db
    .select({
      total: countDistinct(lh.trackSpotifyId),
    })
    .from(lh)
    .where(countWhere);

  return c.json({
    data: tracks,
    total: totalResult?.total ?? 0,
  });
});

// --- Artists ---

vault.get("/artists", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const sortParam = c.req.query("sort") ?? "plays";
  const orderParam = c.req.query("order") ?? "desc";
  const search = c.req.query("search");
  const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);
  const offset = Number(c.req.query("offset") ?? "0");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  const conditions = [eq(lh.userId, userId)];
  if (search) {
    conditions.push(ilike(lh.artistName, `%${search}%`));
  }

  const orderDir = orderParam === "asc" ? asc : desc;

  const sortColumn = (() => {
    switch (sortParam) {
      case "time":
        return sql<number>`sum(${lh.msPlayed})`;
      case "recent":
        return sql<string>`max(${lh.playedAt})`;
      case "name":
        return lh.artistName;
      default:
        return sql<number>`count(*)`;
    }
  })();

  const whereClause = and(...conditions);

  const artists = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.mapWith(Number),
      uniqueTracks: countDistinct(lh.trackSpotifyId).mapWith(Number),
      totalMsPlayed: sql<number>`sum(${lh.msPlayed})`.mapWith(Number),
    })
    .from(lh)
    .where(whereClause)
    .groupBy(lh.artistName)
    .orderBy(orderDir(sortColumn))
    .limit(limit)
    .offset(offset);

  // Get total count for pagination
  const [totalResult] = await db
    .select({
      total: countDistinct(lh.artistName),
    })
    .from(lh)
    .where(whereClause);

  return c.json({
    data: artists,
    total: totalResult?.total ?? 0,
  });
});

// --- Albums ---

vault.get("/albums", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const artist = c.req.query("artist");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  const conditions = [eq(lh.userId, userId)];
  if (artist) {
    conditions.push(eq(lh.artistName, artist));
  }

  const whereClause = and(...conditions);

  const albums = await db
    .selectDistinct({ albumName: lh.albumName })
    .from(lh)
    .where(whereClause)
    .orderBy(asc(lh.albumName));

  // Filter out nulls and extract just the album names
  const albumNames = albums
    .map((a) => a.albumName)
    .filter((name): name is string => name !== null)
    .sort((a, b) => a.localeCompare(b));

  return c.json({ data: albumNames });
});

// --- Genres ---

vault.get("/genres", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  // Get top 100 artists by play count
  const topArtists = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(eq(lh.userId, userId))
    .groupBy(lh.artistName)
    .orderBy(desc(sql`count(*)`))
    .limit(100);

  if (topArtists.length === 0) {
    return c.json({ data: [] });
  }

  // Get access token for Spotify API calls
  let accessToken: string;
  try {
    accessToken = await getAccessToken(c, session);
  } catch {
    return c.json({ data: [], error: "Could not obtain Spotify access token" });
  }

  // Search Spotify for each artist and collect genres
  const allGenres = new Set<string>();

  for (const { artistName } of topArtists) {
    try {
      const result = await searchArtist(accessToken, artistName);
      if (result) {
        for (const genre of result.genres) {
          allGenres.add(genre);
        }
      }
    } catch {
      // Skip artists that fail to search
      continue;
    }
  }

  const sortedGenres = [...allGenres].sort((a, b) => a.localeCompare(b));

  return c.json({ data: sortedGenres });
});

// --- Metadata (album art) ---

vault.get("/metadata", async (c) => {
  const session = c.get("session") as Session<SessionData>;

  const trackIdsParam = c.req.query("trackIds");
  if (!trackIdsParam) {
    return c.json({ data: {} });
  }

  const trackIds = trackIdsParam.split(",").slice(0, 50);
  if (trackIds.length === 0) {
    return c.json({ data: {} });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(c, session);
  } catch {
    return c.json({ data: {}, error: "Could not obtain Spotify access token" });
  }

  const metadata = await fetchTrackMetadata(accessToken, trackIds);

  // Convert Map to plain object for JSON serialization
  const result: Record<string, { albumArt: string; albumName: string }> = {};
  for (const [id, meta] of metadata) {
    result[id] = { albumArt: meta.albumArt, albumName: meta.albumName };
  }

  return c.json({ data: result });
});

// --- Stats ---

vault.get("/stats", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  const where = eq(lh.userId, userId);

  // Overview stats
  const [overview] = await db
    .select({
      totalTracks: countDistinct(lh.trackSpotifyId),
      totalArtists: countDistinct(lh.artistName),
      totalPlays: count(),
      totalMsPlayed: sql<number>`coalesce(sum(${lh.msPlayed}), 0)`.mapWith(Number),
      dateFrom: sql<string>`min(${lh.playedAt})`,
      dateTo: sql<string>`max(${lh.playedAt})`,
    })
    .from(lh)
    .where(where);

  // Top track
  const [topTrack] = await db
    .select({
      trackName: lh.trackName,
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(lh.trackSpotifyId, lh.trackName, lh.artistName)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  // Top artist
  const [topArtist] = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(lh.artistName)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return c.json({
    data: {
      totalTracks: overview?.totalTracks ?? 0,
      totalArtists: overview?.totalArtists ?? 0,
      totalPlays: overview?.totalPlays ?? 0,
      totalMsPlayed: overview?.totalMsPlayed ?? 0,
      dateRange: {
        from: overview?.dateFrom ?? null,
        to: overview?.dateTo ?? null,
      },
      topTrack: topTrack ?? null,
      topArtist: topArtist ?? null,
    },
  });
});

// --- Drift Report ---

/**
 * GET /drift-report — Monthly drift report comparing current month vs previous month.
 *
 * Computes top artists, total stats, and identifies "rising" and "fading" artists
 * to show how the user's musical gravity shifted month-over-month.
 */
vault.get("/drift-report", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  // Get top artists for current month
  const currentArtists = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.as("playCount"),
      msPlayed: sql<number>`sum(${lh.msPlayed})`.as("msPlayed"),
    })
    .from(lh)
    .where(
      and(
        eq(lh.userId, userId),
        sql`to_char(${lh.playedAt}, 'YYYY-MM') = ${currentMonth}`,
      ),
    )
    .groupBy(lh.artistName)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  // Get top artists for previous month
  const prevArtists = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.as("playCount"),
      msPlayed: sql<number>`sum(${lh.msPlayed})`.as("msPlayed"),
    })
    .from(lh)
    .where(
      and(
        eq(lh.userId, userId),
        sql`to_char(${lh.playedAt}, 'YYYY-MM') = ${prevMonth}`,
      ),
    )
    .groupBy(lh.artistName)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  // Get total stats for current month
  const [currentStats] = await db
    .select({
      totalPlays: sql<number>`count(*)`.as("totalPlays"),
      totalMs: sql<number>`sum(${lh.msPlayed})`.as("totalMs"),
      uniqueArtists: sql<number>`count(distinct ${lh.artistName})`.as("uniqueArtists"),
      uniqueTracks: sql<number>`count(distinct ${lh.trackSpotifyId})`.as("uniqueTracks"),
    })
    .from(lh)
    .where(
      and(
        eq(lh.userId, userId),
        sql`to_char(${lh.playedAt}, 'YYYY-MM') = ${currentMonth}`,
      ),
    );

  // Get total stats for previous month
  const [prevStats] = await db
    .select({
      totalPlays: sql<number>`count(*)`.as("totalPlays"),
      totalMs: sql<number>`sum(${lh.msPlayed})`.as("totalMs"),
      uniqueArtists: sql<number>`count(distinct ${lh.artistName})`.as("uniqueArtists"),
      uniqueTracks: sql<number>`count(distinct ${lh.trackSpotifyId})`.as("uniqueTracks"),
    })
    .from(lh)
    .where(
      and(
        eq(lh.userId, userId),
        sql`to_char(${lh.playedAt}, 'YYYY-MM') = ${prevMonth}`,
      ),
    );

  // Find "rising" artists (in current top 10 but not in prev top 10, or significantly more plays)
  const prevMap = new Map(prevArtists.map((a) => [a.artistName, a]));
  const rising = currentArtists
    .filter((a) => {
      const prev = prevMap.get(a.artistName);
      return !prev || Number(a.playCount) > Number(prev.playCount) * 1.5;
    })
    .slice(0, 3);

  // Find "fading" artists (in prev top 10 but not in current top 10)
  const currentMap = new Map(currentArtists.map((a) => [a.artistName, a]));
  const fading = prevArtists
    .filter((a) => !currentMap.has(a.artistName))
    .slice(0, 3);

  return c.json({
    data: {
      currentMonth,
      prevMonth,
      current: { artists: currentArtists, stats: currentStats },
      previous: { artists: prevArtists, stats: prevStats },
      rising,
      fading,
    },
  });
});

export default vault;
