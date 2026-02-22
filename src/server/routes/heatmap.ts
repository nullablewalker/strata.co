/**
 * Fandom Heatmap — Daily Listening Aggregation Routes
 *
 * Powers the GitHub-contribution-graph-style heatmap that visualizes
 * a user's listening "intensity" across every day of a given year.
 * Optionally filterable by artist to show per-artist fandom depth.
 *
 * Endpoints:
 *   GET /api/heatmap/data     - Daily play counts & ms_played for a year
 *   GET /api/heatmap/artists  - Top 50 artists (for the artist filter dropdown)
 *   GET /api/heatmap/summary  - Year summary: streaks, most active day, avg daily plays
 *   GET /api/heatmap/silences - Silence periods (3+ consecutive days with no plays)
 *
 * All routes require authentication.
 */
import { Hono } from "hono";
import { and, asc, count, desc, eq, gte, lte, lt, sql, sum } from "drizzle-orm";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { createDb } from "../db";
import { listeningHistory } from "../db/schema";
import { authGuard, type SessionData } from "../middleware/session";

const heatmapRoutes = new Hono<{ Bindings: Env }>();

heatmapRoutes.use("*", authGuard());

/**
 * GET /data — Daily aggregated listening data for a calendar year.
 *
 * Groups play events by UTC date, returning one row per day that has
 * at least one play. The frontend fills in empty days as zero-intensity cells.
 * Supports optional artist filter to drill into a single artist's heatmap.
 */
heatmapRoutes.get("/data", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const artist = c.req.query("artist");
  const yearParam = c.req.query("year");
  // Default to the current year if none specified
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();

  if (isNaN(year) || year < 2000 || year > 2100) {
    return c.json({ error: "Invalid year" }, 400);
  }

  // Use half-open interval [Jan 1 of year, Jan 1 of year+1) for clean date boundaries
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year + 1, 0, 1));

  const db = createDb(c.env.DATABASE_URL);

  const conditions = [
    eq(listeningHistory.userId, userId),
    gte(listeningHistory.playedAt, startDate),
    lt(listeningHistory.playedAt, endDate),
  ];

  if (artist) {
    conditions.push(eq(listeningHistory.artistName, artist));
  }

  // Aggregate by calendar date (UTC). Each row = one day with at least one play.
  // The frontend renders these as heatmap cells with intensity based on count/msPlayed.
  const rows = await db
    .select({
      date: sql<string>`DATE(${listeningHistory.playedAt} AT TIME ZONE 'UTC')`.as("date"),
      count: count().as("count"),
      msPlayed: sum(listeningHistory.msPlayed).mapWith(Number).as("ms_played"),
    })
    .from(listeningHistory)
    .where(and(...conditions))
    .groupBy(sql`DATE(${listeningHistory.playedAt} AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(${listeningHistory.playedAt} AT TIME ZONE 'UTC')`);

  const data = rows.map((r) => ({
    date: String(r.date),
    count: r.count,
    msPlayed: r.msPlayed,
  }));

  return c.json({ data });
});

/**
 * GET /artists — Top 50 artists by total play count.
 * Used to populate the artist filter dropdown on the heatmap view.
 * Not scoped to a specific year so the user can filter by any artist
 * they have ever listened to.
 */
heatmapRoutes.get("/artists", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const db = createDb(c.env.DATABASE_URL);

  const rows = await db
    .select({
      artistName: listeningHistory.artistName,
      totalPlays: count().as("total_plays"),
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .groupBy(listeningHistory.artistName)
    .orderBy(desc(count()))
    .limit(50);

  return c.json({ data: rows });
});

/**
 * GET /summary — Engagement summary for a given year (optionally per-artist).
 *
 * Computes:
 *   - totalPlays / activeDays — basic volume metrics
 *   - longestStreak — consecutive days with at least one play (measures habit consistency)
 *   - mostActiveDay — the single day with the highest play count
 *   - averageDailyPlays — total plays divided by calendar days in the period
 */
heatmapRoutes.get("/summary", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const artist = c.req.query("artist");
  const yearParam = c.req.query("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();

  if (isNaN(year) || year < 2000 || year > 2100) {
    return c.json({ error: "Invalid year" }, 400);
  }

  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year + 1, 0, 1));

  const db = createDb(c.env.DATABASE_URL);

  const conditions = [
    eq(listeningHistory.userId, userId),
    gte(listeningHistory.playedAt, startDate),
    lt(listeningHistory.playedAt, endDate),
  ];

  if (artist) {
    conditions.push(eq(listeningHistory.artistName, artist));
  }

  // Fetch per-day counts sorted chronologically — needed for both
  // streak calculation (requires consecutive-day detection) and
  // finding the single most active day.
  const dailyCounts = await db
    .select({
      date: sql<string>`DATE(${listeningHistory.playedAt} AT TIME ZONE 'UTC')`.as("date"),
      count: count().as("count"),
    })
    .from(listeningHistory)
    .where(and(...conditions))
    .groupBy(sql`DATE(${listeningHistory.playedAt} AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(${listeningHistory.playedAt} AT TIME ZONE 'UTC')`);

  if (dailyCounts.length === 0) {
    return c.json({
      data: {
        totalPlays: 0,
        activeDays: 0,
        longestStreak: 0,
        mostActiveDay: null,
        averageDailyPlays: 0,
      },
    });
  }

  const totalPlays = dailyCounts.reduce((sum, d) => sum + d.count, 0);
  const activeDays = dailyCounts.length;

  // Streak calculation: walk through sorted dates and check if each pair
  // of adjacent active days is exactly 1 day apart (i.e., consecutive).
  let longestStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < dailyCounts.length; i++) {
    const prev = new Date(dailyCounts[i - 1].date);
    const curr = new Date(dailyCounts[i].date);
    const diffMs = curr.getTime() - prev.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  // Find most active day (linear scan since data is already in memory)
  let mostActiveDay = { date: dailyCounts[0].date, count: dailyCounts[0].count };
  for (const d of dailyCounts) {
    if (d.count > mostActiveDay.count) {
      mostActiveDay = { date: String(d.date), count: d.count };
    }
  }

  // For average calculation: if this is the current year, only count days
  // up to today (not the full 365/366) to avoid deflating the average.
  const now = new Date();
  const daysInPeriod =
    now.getUTCFullYear() === year
      ? Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;

  // Round to 1 decimal place for display
  const averageDailyPlays = Math.round((totalPlays / daysInPeriod) * 10) / 10;

  return c.json({
    data: {
      totalPlays,
      activeDays,
      longestStreak,
      mostActiveDay,
      averageDailyPlays,
    },
  });
});

/**
 * GET /silences — Silence periods for a given year.
 *
 * A "silence" is a stretch of 3 or more consecutive calendar days with zero
 * plays. For each silence the endpoint also returns the last track the user
 * played before the gap and the first track played after it, providing
 * emotional bookends to the quiet period.
 */
heatmapRoutes.get("/silences", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const yearParam = c.req.query("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();

  if (isNaN(year) || year < 2000 || year > 2100) {
    return c.json({ error: "Invalid year" }, 400);
  }

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const db = createDb(c.env.DATABASE_URL);

  // Fetch per-day counts for the year (same query pattern as /data and /summary)
  const dailyCounts = await db
    .select({
      date: sql<string>`DATE(${listeningHistory.playedAt} AT TIME ZONE 'UTC')`.as("date"),
      count: count().as("count"),
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, yearStart),
        lt(listeningHistory.playedAt, yearEnd)
      )
    )
    .groupBy(sql`DATE(${listeningHistory.playedAt} AT TIME ZONE 'UTC')`);

  const playDates = new Set(dailyCounts.map((d) => String(d.date)));

  // Walk every calendar day in the year (up to today for the current year)
  // and detect consecutive zero-play stretches of 3+ days.
  const now = new Date();
  const lastDate =
    now.getUTCFullYear() === year
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(Date.UTC(year, 11, 31));

  interface SilencePeriod {
    startDate: string;
    endDate: string;
    days: number;
    lastTrackBefore: { trackName: string; artistName: string } | null;
    firstTrackAfter: { trackName: string; artistName: string } | null;
  }

  const silences: SilencePeriod[] = [];
  let currentStart: Date | null = null;
  let currentDays = 0;

  const d = new Date(yearStart);
  while (d <= lastDate) {
    const dateStr = d.toISOString().slice(0, 10);
    if (!playDates.has(dateStr)) {
      if (!currentStart) currentStart = new Date(d);
      currentDays++;
    } else {
      if (currentStart && currentDays >= 3) {
        const silenceEnd = new Date(d);
        silenceEnd.setUTCDate(silenceEnd.getUTCDate() - 1);
        silences.push({
          startDate: currentStart.toISOString().slice(0, 10),
          endDate: silenceEnd.toISOString().slice(0, 10),
          days: currentDays,
          lastTrackBefore: null,
          firstTrackAfter: null,
        });
      }
      currentStart = null;
      currentDays = 0;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // Handle trailing silence at end of year / today
  if (currentStart && currentDays >= 3) {
    silences.push({
      startDate: currentStart.toISOString().slice(0, 10),
      endDate: lastDate.toISOString().slice(0, 10),
      days: currentDays,
      lastTrackBefore: null,
      firstTrackAfter: null,
    });
  }

  // For each silence, fetch the emotional bookends:
  //   - last track played before the silence began
  //   - first track played after the silence ended
  for (const silence of silences) {
    const silenceStart = new Date(`${silence.startDate}T00:00:00Z`);
    const silenceEndNext = new Date(`${silence.endDate}T00:00:00Z`);
    silenceEndNext.setUTCDate(silenceEndNext.getUTCDate() + 1);

    const [beforeRows, afterRows] = await Promise.all([
      db
        .select({
          trackName: listeningHistory.trackName,
          artistName: listeningHistory.artistName,
        })
        .from(listeningHistory)
        .where(
          and(
            eq(listeningHistory.userId, userId),
            lt(listeningHistory.playedAt, silenceStart)
          )
        )
        .orderBy(desc(listeningHistory.playedAt))
        .limit(1),
      db
        .select({
          trackName: listeningHistory.trackName,
          artistName: listeningHistory.artistName,
        })
        .from(listeningHistory)
        .where(
          and(
            eq(listeningHistory.userId, userId),
            gte(listeningHistory.playedAt, silenceEndNext)
          )
        )
        .orderBy(asc(listeningHistory.playedAt))
        .limit(1),
    ]);

    if (beforeRows.length > 0) {
      silence.lastTrackBefore = {
        trackName: beforeRows[0].trackName,
        artistName: beforeRows[0].artistName,
      };
    }
    if (afterRows.length > 0) {
      silence.firstTrackAfter = {
        trackName: afterRows[0].trackName,
        artistName: afterRows[0].artistName,
      };
    }
  }

  const totalSilentDays = silences.reduce((sum, s) => sum + s.days, 0);

  return c.json({ data: { silences, totalSilentDays } });
});

/**
 * GET /obsession — Monthly play count for a specific artist over their entire history.
 *
 * Powers the "Obsession Curve" line chart that reveals peaks of obsession,
 * abandonment, and rediscovery for a single artist across time. Each row
 * is one calendar month (YYYY-MM) with aggregate play count, total listening
 * time, and unique track count.
 *
 * Requires the `artist` query parameter. Returns empty months array if omitted.
 */
heatmapRoutes.get("/obsession", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);
  const artist = c.req.query("artist");

  if (!artist) {
    return c.json({ data: { months: [] } });
  }

  const monthlyData = await db
    .select({
      month: sql<string>`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`.as("month"),
      playCount: sql<number>`count(*)`.as("playCount"),
      msPlayed: sql<number>`sum(${listeningHistory.msPlayed})`.as("msPlayed"),
      trackCount: sql<number>`count(distinct ${listeningHistory.trackSpotifyId})`.as("trackCount"),
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        eq(listeningHistory.artistName, artist)
      )
    )
    .groupBy(sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`);

  return c.json({ data: { artist, months: monthlyData } });
});

/**
 * GET /day — All tracks played on a specific day, with timestamps.
 *
 * Powers the heatmap drill-down panel: clicking a day cell fetches the
 * full track list for that day, ordered chronologically. Returns each
 * track's name, artist, album, Spotify ID, duration, and timestamp.
 *
 * Requires `date` query parameter in YYYY-MM-DD format.
 */
heatmapRoutes.get("/day", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);
  const date = c.req.query("date"); // YYYY-MM-DD

  if (!date) return c.json({ data: [] });

  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);

  const tracks = await db
    .select({
      trackName: listeningHistory.trackName,
      artistName: listeningHistory.artistName,
      albumName: listeningHistory.albumName,
      trackSpotifyId: listeningHistory.trackSpotifyId,
      msPlayed: listeningHistory.msPlayed,
      playedAt: listeningHistory.playedAt,
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        gte(listeningHistory.playedAt, dayStart),
        lte(listeningHistory.playedAt, dayEnd)
      )
    )
    .orderBy(listeningHistory.playedAt);

  return c.json({ data: tracks });
});

export default heatmapRoutes;
