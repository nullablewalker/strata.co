/**
 * Era Map (Strata Depth View) — Monthly Artist Listening Aggregation Routes
 *
 * Powers the streamgraph visualization that shows artist listening intensity
 * stacked over time, creating a "geological strata" effect where each artist
 * forms a distinct layer whose thickness reflects listening volume.
 *
 * Endpoints:
 *   GET /api/strata/eras - Monthly listening data for top 15 artists (streamgraph)
 *
 * All routes require authentication.
 */
import { Hono } from "hono";
import { eq, sql, and } from "drizzle-orm";
import type { Session } from "hono-sessions";
import { createDb } from "../db";
import { listeningHistory } from "../db/schema";
import type { Env } from "../types";
import { authGuard, type SessionData } from "../middleware/session";

const strataRoutes = new Hono<{ Bindings: Env }>();

strataRoutes.use("*", authGuard());

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
