import { Hono } from "hono";
import { sql, eq, ilike, or, and, desc, asc, count, countDistinct, gte, lte } from "drizzle-orm";
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
  } catch (err) {
    console.log("[vault] Access token expired, attempting refresh...", (err as Error).message);
    // Token expired, refresh it
    const userId = session.get("userId")!;
    const db = createDb(c.env.DATABASE_URL);
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { refreshToken: true },
    });

    if (!user?.refreshToken) {
      console.error("[vault] No refresh token in DB for user", userId);
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
      completionCount: sql<number>`count(*) FILTER (WHERE ${lh.reasonEnd} = 'trackdone')`.mapWith(Number),
      skipCount: sql<number>`count(*) FILTER (WHERE ${lh.skipped} = true)`.mapWith(Number),
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
  } catch (err) {
    console.error("[vault/metadata] Failed to get access token:", err);
    return c.json({ error: "Could not obtain Spotify access token" }, 502);
  }

  const metadata = await fetchTrackMetadata(accessToken, trackIds);

  if (metadata.size === 0) {
    console.warn("[vault/metadata] Spotify returned no metadata for", trackIds.length, "tracks");
  }

  // Convert Map to plain object for JSON serialization
  const result: Record<string, { albumArt: string; albumName: string }> = {};
  for (const [id, meta] of metadata) {
    result[id] = { albumArt: meta.albumArt, albumName: meta.albumName };
  }

  return c.json({ data: result });
});

// --- Autobiography ---

vault.get("/autobiography", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  // 1. Overall stats
  const [overall] = await db
    .select({
      totalPlays: sql<number>`count(*)`,
      totalMs: sql<number>`sum(${lh.msPlayed})`,
      uniqueTracks: sql<number>`count(distinct ${lh.trackSpotifyId})`,
      uniqueArtists: sql<number>`count(distinct ${lh.artistName})`,
      firstPlay: sql<string>`min(${lh.playedAt})`,
      lastPlay: sql<string>`max(${lh.playedAt})`,
    })
    .from(lh)
    .where(eq(lh.userId, userId));

  // 2. Top 5 artists by play count
  const topArtists = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`,
      msPlayed: sql<number>`sum(${lh.msPlayed})`,
    })
    .from(lh)
    .where(eq(lh.userId, userId))
    .groupBy(lh.artistName)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  // 3. Top 5 tracks by play count
  const topTracks = await db
    .select({
      trackName: lh.trackName,
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`,
      msPlayed: sql<number>`sum(${lh.msPlayed})`,
    })
    .from(lh)
    .where(eq(lh.userId, userId))
    .groupBy(lh.trackName, lh.artistName)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  // 4. Peak hour
  const [peakHour] = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${lh.playedAt})`,
      playCount: sql<number>`count(*)`,
    })
    .from(lh)
    .where(eq(lh.userId, userId))
    .groupBy(sql`EXTRACT(HOUR FROM ${lh.playedAt})`)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  // 5. Most active year
  const [peakYear] = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${lh.playedAt})`,
      playCount: sql<number>`count(*)`,
      msPlayed: sql<number>`sum(${lh.msPlayed})`,
    })
    .from(lh)
    .where(eq(lh.userId, userId))
    .groupBy(sql`EXTRACT(YEAR FROM ${lh.playedAt})`)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  // 6. Night owl stats (plays between 22:00-03:59)
  const [nightStats] = await db
    .select({
      playCount: sql<number>`count(*)`,
    })
    .from(lh)
    .where(
      and(
        eq(lh.userId, userId),
        sql`EXTRACT(HOUR FROM ${lh.playedAt}) IN (22, 23, 0, 1, 2, 3)`
      )
    );

  // 7. Top night artist
  const [nightArtist] = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`,
    })
    .from(lh)
    .where(
      and(
        eq(lh.userId, userId),
        sql`EXTRACT(HOUR FROM ${lh.playedAt}) IN (22, 23, 0, 1, 2, 3)`
      )
    )
    .groupBy(lh.artistName)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  return c.json({
    data: {
      overall,
      topArtists,
      topTracks,
      peakHour: peakHour || null,
      peakYear: peakYear || null,
      nightStats: nightStats || null,
      nightArtist: nightArtist || null,
    },
  });
});

// --- Mosaic (monthly top albums) ---

vault.get("/mosaic", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);

  // Get monthly top albums (top 6 per month by play count)
  const monthlyAlbums = await db
    .select({
      month: sql<string>`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`.as("month"),
      albumName: listeningHistory.albumName,
      artistName: listeningHistory.artistName,
      playCount: sql<number>`count(*)`.as("playCount"),
      msPlayed: sql<number>`sum(${listeningHistory.msPlayed})`.as("msPlayed"),
      trackSpotifyId: sql<string>`(array_agg(${listeningHistory.trackSpotifyId}))[1]`.as(
        "trackSpotifyId",
      ),
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        sql`${listeningHistory.albumName} IS NOT NULL AND ${listeningHistory.albumName} != ''`,
      ),
    )
    .groupBy(
      sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`,
      listeningHistory.albumName,
      listeningHistory.artistName,
    )
    .orderBy(
      sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`,
      sql`count(*) desc`,
    );

  // Group by month, take top 6 per month
  const monthMap = new Map<string, (typeof monthlyAlbums)[number][]>();
  for (const row of monthlyAlbums) {
    if (!monthMap.has(row.month)) monthMap.set(row.month, []);
    const arr = monthMap.get(row.month)!;
    if (arr.length < 6) arr.push(row);
  }

  const months = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, albums]) => ({ month, albums }));

  return c.json({ data: months });
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

  // Completion rate (tracks listened to the end)
  const completionResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE reason_end = 'trackdone') as completed,
      COUNT(*) FILTER (WHERE reason_end IS NOT NULL) as total
    FROM listening_history WHERE user_id = ${userId}
  `);
  const completionRate = Number(completionResult.rows[0]?.total) > 0
    ? Math.round((Number(completionResult.rows[0].completed) / Number(completionResult.rows[0].total)) * 100)
    : null;

  // Skip rate
  const skipResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE skipped = true) as skipped,
      COUNT(*) FILTER (WHERE skipped IS NOT NULL) as total
    FROM listening_history WHERE user_id = ${userId}
  `);
  const skipRate = Number(skipResult.rows[0]?.total) > 0
    ? Math.round((Number(skipResult.rows[0].skipped) / Number(skipResult.rows[0].total)) * 100)
    : null;

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
      completionRate,
      skipRate,
    },
  });
});

// --- Time Capsule ---

vault.get("/time-capsule", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);

  const now = new Date();
  const capsules = [];

  // Check 1 year ago, 2 years ago, etc. (up to 5 years)
  for (let yearsAgo = 1; yearsAgo <= 5; yearsAgo++) {
    const targetDate = new Date(now);
    targetDate.setFullYear(targetDate.getFullYear() - yearsAgo);

    // Get the start and end of that day (UTC)
    const dayStart = new Date(targetDate.toISOString().split("T")[0] + "T00:00:00Z");
    const dayEnd = new Date(targetDate.toISOString().split("T")[0] + "T23:59:59Z");

    const tracks = await db
      .select({
        trackSpotifyId: listeningHistory.trackSpotifyId,
        trackName: listeningHistory.trackName,
        artistName: listeningHistory.artistName,
        albumName: listeningHistory.albumName,
        totalMsPlayed: sql<number>`sum(${listeningHistory.msPlayed})`.mapWith(Number),
        firstPlayedAt: sql<string>`min(${listeningHistory.playedAt})`,
        playCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(listeningHistory)
      .where(
        and(
          eq(listeningHistory.userId, userId),
          gte(listeningHistory.playedAt, dayStart),
          lte(listeningHistory.playedAt, dayEnd)
        )
      )
      .groupBy(
        listeningHistory.trackSpotifyId,
        listeningHistory.trackName,
        listeningHistory.artistName,
        listeningHistory.albumName
      )
      .orderBy(sql`min(${listeningHistory.playedAt})`)
      .limit(20);

    if (tracks.length > 0) {
      capsules.push({
        yearsAgo,
        date: dayStart.toISOString().split("T")[0],
        tracks,
      });
    }
  }

  return c.json({ data: capsules });
});

// --- Dormant Artists ---

vault.get("/dormant-artists", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

  // Get artists with significant listening but no recent plays
  const artists = await db
    .select({
      artistName: listeningHistory.artistName,
      totalMsPlayed: sql<number>`sum(${listeningHistory.msPlayed})`.as("totalMsPlayed"),
      playCount: sql<number>`count(*)`.as("playCount"),
      lastPlayed: sql<string>`max(${listeningHistory.playedAt})`.as("lastPlayed"),
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .groupBy(listeningHistory.artistName)
    .having(
      and(
        gte(sql`sum(${listeningHistory.msPlayed})`, 3600000),
        lte(sql`max(${listeningHistory.playedAt})`, sixMonthsAgo)
      )
    )
    .orderBy(sql`sum(${listeningHistory.msPlayed}) desc`)
    .limit(10);

  return c.json({ data: artists });
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

// --- Annual Summary (Export Dossier) ---

vault.get("/annual-summary", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);
  const year = parseInt(
    c.req.query("year") || new Date().getFullYear().toString(),
  );

  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59Z`);
  const lh = listeningHistory;
  const condition = and(
    eq(lh.userId, userId),
    gte(lh.playedAt, yearStart),
    lte(lh.playedAt, yearEnd),
  );

  // Overall stats
  const [stats] = await db
    .select({
      totalPlays: sql<number>`count(*)`.mapWith(Number),
      totalMs: sql<number>`coalesce(sum(${lh.msPlayed}), 0)`.mapWith(Number),
      uniqueTracks: countDistinct(lh.trackSpotifyId).mapWith(Number),
      uniqueArtists: countDistinct(lh.artistName).mapWith(Number),
    })
    .from(lh)
    .where(condition);

  // Top 5 artists
  const topArtists = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.mapWith(Number),
      msPlayed: sql<number>`coalesce(sum(${lh.msPlayed}), 0)`.mapWith(Number),
    })
    .from(lh)
    .where(condition)
    .groupBy(lh.artistName)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  // Top 5 tracks
  const topTracks = await db
    .select({
      trackName: lh.trackName,
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(condition)
    .groupBy(lh.trackName, lh.artistName)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  // Monthly play counts
  const monthlyPlays = await db
    .select({
      month: sql<number>`EXTRACT(MONTH FROM ${lh.playedAt})`.mapWith(Number),
      playCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(condition)
    .groupBy(sql`EXTRACT(MONTH FROM ${lh.playedAt})`)
    .orderBy(sql`EXTRACT(MONTH FROM ${lh.playedAt})`);

  // Peak hour
  const peakHourRows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${lh.playedAt})`.mapWith(Number),
      playCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(condition)
    .groupBy(sql`EXTRACT(HOUR FROM ${lh.playedAt})`)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  // Available years (unfiltered by year, scoped to user)
  const years = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${lh.playedAt})`.mapWith(Number),
    })
    .from(lh)
    .where(eq(lh.userId, userId))
    .groupBy(sql`EXTRACT(YEAR FROM ${lh.playedAt})`)
    .orderBy(sql`EXTRACT(YEAR FROM ${lh.playedAt}) desc`);

  return c.json({
    data: {
      year,
      stats,
      topArtists,
      topTracks,
      monthlyPlays: Array.from({ length: 12 }, (_, i) => {
        const found = monthlyPlays.find((m) => m.month === i + 1);
        return { month: i + 1, playCount: found ? found.playCount : 0 };
      }),
      peakHour: peakHourRows[0] || null,
      availableYears: years.map((y) => y.year),
    },
  });
});

export default vault;
