/**
 * Strata Feature Routes — powers the "deeper" visualization features
 * beyond the core MVP (Vault, Heatmap, Patterns).
 *
 * Endpoints:
 *   GET /api/strata/rankings — Weekly artist rankings for the Bump Chart
 *   GET /api/strata/eras     — Monthly listening data for top 15 artists (streamgraph)
 *
 * All routes require authentication.
 */
import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { createDb } from "../db";
import { listeningHistory } from "../db/schema";
import { authGuard, type SessionData } from "../middleware/session";

const strataRoutes = new Hono<{ Bindings: Env }>();

strataRoutes.use("*", authGuard());

/**
 * GET /rankings — Weekly artist rankings for the Bump Chart.
 *
 * Aggregates play counts per artist per ISO week, ranks artists within
 * each week, and returns the top 10 artists (by total plays across all time)
 * with their weekly rank positions. The frontend renders these as smooth
 * bump lines showing how each artist's rank changes over time.
 */
strataRoutes.get("/rankings", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);

  // Get weekly play counts by artist
  const weeklyData = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${listeningHistory.playedAt}), 'YYYY-MM-DD')`.as(
        "week"
      ),
      artistName: listeningHistory.artistName,
      playCount: sql<number>`count(*)`.as("playCount"),
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .groupBy(
      sql`to_char(date_trunc('week', ${listeningHistory.playedAt}), 'YYYY-MM-DD')`,
      listeningHistory.artistName
    )
    .orderBy(
      sql`to_char(date_trunc('week', ${listeningHistory.playedAt}), 'YYYY-MM-DD')`
    );

  // Organize by week, rank artists within each week
  const weekMap = new Map<string, Map<string, number>>();
  const allArtists = new Map<string, number>(); // total plays across all weeks

  for (const row of weeklyData) {
    if (!weekMap.has(row.week)) weekMap.set(row.week, new Map());
    weekMap.get(row.week)!.set(row.artistName, Number(row.playCount));
    allArtists.set(
      row.artistName,
      (allArtists.get(row.artistName) || 0) + Number(row.playCount)
    );
  }

  // Get top 10 artists overall
  const topArtists = Array.from(allArtists.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);

  // Build rankings per week for top artists
  const weeks = Array.from(weekMap.keys()).sort();
  const rankings = weeks.map((week) => {
    const weekData = weekMap.get(week)!;
    // Rank all artists this week by play count
    const sorted = Array.from(weekData.entries()).sort((a, b) => b[1] - a[1]);
    const rankMap: Record<string, { rank: number; plays: number }> = {};
    sorted.forEach(([name, plays], i) => {
      if (topArtists.includes(name)) {
        rankMap[name] = { rank: i + 1, plays };
      }
    });
    return { week, rankings: rankMap };
  });

  return c.json({ data: { artists: topArtists, weeks: rankings } });
});

/**
 * GET /eras — Monthly artist listening data for the streamgraph.
 *
 * Computes the top 15 artists by total listening time, then returns a
 * month-by-month breakdown of milliseconds played for each of those artists.
 * The frontend uses this to render a D3 streamgraph with stacked area layers.
 *
 * Response shape:
 *   { data: { artists: string[], months: Array<{ month: string, values: Record<string, number> }> } }
 */
strataRoutes.get("/eras", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const db = createDb(c.env.DATABASE_URL);

  // Step 1: Identify the top 15 artists by total listening time.
  // Using ms_played (not play count) gives heavier weight to artists the user
  // actually spent time with, rather than those with many short skips.
  const topArtists = await db
    .select({
      artistName: listeningHistory.artistName,
      totalMs: sql<number>`sum(${listeningHistory.msPlayed})`.mapWith(Number).as("totalMs"),
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .groupBy(listeningHistory.artistName)
    .orderBy(sql`sum(${listeningHistory.msPlayed}) desc`)
    .limit(15);

  const artistNames = topArtists.map((a) => a.artistName);

  if (artistNames.length === 0) {
    return c.json({ data: { artists: [], months: [] } });
  }

  // Step 2: Get monthly breakdown for these artists.
  // to_char(playedAt, 'YYYY-MM') groups by calendar month, producing one row
  // per (month, artist) pair with the sum of ms_played.
  const monthlyData = await db
    .select({
      month: sql<string>`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`.as("month"),
      artistName: listeningHistory.artistName,
      msPlayed: sql<number>`sum(${listeningHistory.msPlayed})`.mapWith(Number).as("msPlayed"),
    })
    .from(listeningHistory)
    .where(
      and(
        eq(listeningHistory.userId, userId),
        sql`${listeningHistory.artistName} = ANY(${artistNames})`,
      ),
    )
    .groupBy(
      sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`,
      listeningHistory.artistName,
    )
    .orderBy(sql`to_char(${listeningHistory.playedAt}, 'YYYY-MM')`);

  // Step 3: Organize into a months array with values keyed by artist name.
  // The frontend expects every month to have an entry for every artist
  // (missing = 0), but we only send non-zero values to reduce payload size.
  const monthMap = new Map<string, Record<string, number>>();
  for (const row of monthlyData) {
    if (!monthMap.has(row.month)) {
      monthMap.set(row.month, {});
    }
    monthMap.get(row.month)![row.artistName] = row.msPlayed;
  }

  const months = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, values }));

  return c.json({ data: { artists: artistNames, months } });
});

export default strataRoutes;
