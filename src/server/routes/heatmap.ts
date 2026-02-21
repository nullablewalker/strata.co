import { Hono } from "hono";
import { and, count, desc, eq, gte, lt, sql, sum } from "drizzle-orm";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { createDb } from "../db";
import { listeningHistory } from "../db/schema";
import { authGuard, type SessionData } from "../middleware/session";

const heatmapRoutes = new Hono<{ Bindings: Env }>();

heatmapRoutes.use("*", authGuard());

// GET /api/heatmap/data - daily aggregated listening data
heatmapRoutes.get("/data", async (c) => {
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

// GET /api/heatmap/artists - top artists by total plays
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

// GET /api/heatmap/summary - stats for the heatmap period
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

  // Get daily counts for streak calculation and most active day
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

  // Calculate longest streak
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

  // Find most active day
  let mostActiveDay = { date: dailyCounts[0].date, count: dailyCounts[0].count };
  for (const d of dailyCounts) {
    if (d.count > mostActiveDay.count) {
      mostActiveDay = { date: String(d.date), count: d.count };
    }
  }

  // Days in the year (up to today if current year)
  const now = new Date();
  const daysInPeriod =
    now.getUTCFullYear() === year
      ? Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;

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

export default heatmapRoutes;
