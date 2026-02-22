/**
 * Listening Patterns — Temporal Analysis Routes
 *
 * Reveals when the user listens to music across different time dimensions:
 * hour of day, day of week, and month of year. The frontend renders these
 * as bar/radial charts to surface habits like "Night Owl" or "Weekend Warrior".
 *
 * Endpoints:
 *   GET /api/patterns/hourly   - Play counts bucketed by hour (0-23)
 *   GET /api/patterns/weekly   - Play counts bucketed by day of week (Sun-Sat)
 *   GET /api/patterns/monthly  - Play counts bucketed by month (Jan-Dec)
 *   GET /api/patterns/overview - Composite insights: peak hour, busiest day,
 *                                favorite season, listener type, available years
 *
 * All endpoints support optional ?year= and ?artist= query filters.
 * All routes require authentication.
 */
import { Hono } from "hono";
import { sql, eq, and, ilike } from "drizzle-orm";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { authGuard, type SessionData } from "../middleware/session";
import { createDb } from "../db";
import { listeningHistory } from "../db/schema";

const patterns = new Hono<{ Bindings: Env }>();

patterns.use("*", authGuard());

/**
 * Shared WHERE clause builder for all pattern endpoints.
 * Always scopes to the authenticated user; optionally filters by
 * year (via EXTRACT) and/or artist name (case-insensitive match).
 */
function buildWhere(
  userId: string,
  year?: string,
  artist?: string,
  album?: string,
) {
  const lh = listeningHistory;
  const conditions = [eq(lh.userId, userId)];

  if (year) {
    conditions.push(
      sql`EXTRACT(YEAR FROM ${lh.playedAt}) = ${Number(year)}`,
    );
  }

  if (artist) {
    // Case-insensitive exact match so partial names don't bleed in
    conditions.push(ilike(lh.artistName, artist));
  }

  if (album) {
    // Case-insensitive exact match on album name
    conditions.push(ilike(lh.albumName, album));
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions)!;
}

/**
 * GET /hourly — Play distribution across 24 hours.
 *
 * Uses EXTRACT(HOUR FROM playedAt) to bucket plays by hour.
 * Missing hours are zero-filled on the server so the frontend always
 * receives a complete 0-23 array (simplifies chart rendering).
 */
patterns.get("/hourly", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");
  const album = c.req.query("album");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist, album);

  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${lh.playedAt})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
      msPlayed: sql<number>`coalesce(sum(${lh.msPlayed}), 0)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(sql`EXTRACT(HOUR FROM ${lh.playedAt})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${lh.playedAt})`);

  // Zero-fill: SQL only returns hours that have data; pad the gaps so
  // the client always gets exactly 24 entries (index = hour)
  const hourMap = new Map(rows.map((r) => [r.hour, r]));
  const data = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourMap.get(i)?.count ?? 0,
    msPlayed: hourMap.get(i)?.msPlayed ?? 0,
  }));

  return c.json({ data });
});

/**
 * GET /weekly — Play distribution across days of the week.
 *
 * PostgreSQL's DOW: 0 = Sunday, 6 = Saturday.
 * Day names are in Japanese to match the app's user-facing locale.
 * Zero-filled to always return 7 entries.
 */
patterns.get("/weekly", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");
  const album = c.req.query("album");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist, album);

  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  const rows = await db
    .select({
      day: sql<number>`EXTRACT(DOW FROM ${lh.playedAt})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
      msPlayed: sql<number>`coalesce(sum(${lh.msPlayed}), 0)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(sql`EXTRACT(DOW FROM ${lh.playedAt})`)
    .orderBy(sql`EXTRACT(DOW FROM ${lh.playedAt})`);

  const dayMap = new Map(rows.map((r) => [r.day, r]));
  const data = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    dayName: dayNames[i],
    count: dayMap.get(i)?.count ?? 0,
    msPlayed: dayMap.get(i)?.msPlayed ?? 0,
  }));

  return c.json({ data });
});

/**
 * GET /monthly — Play distribution across 12 months.
 *
 * PostgreSQL's EXTRACT(MONTH ...) is 1-indexed (1 = January).
 * Zero-filled to always return 12 entries.
 */
patterns.get("/monthly", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");
  const album = c.req.query("album");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist, album);

  const monthNames = [
    "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月",
  ];

  const rows = await db
    .select({
      month: sql<number>`EXTRACT(MONTH FROM ${lh.playedAt})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
      msPlayed: sql<number>`coalesce(sum(${lh.msPlayed}), 0)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(sql`EXTRACT(MONTH FROM ${lh.playedAt})`)
    .orderBy(sql`EXTRACT(MONTH FROM ${lh.playedAt})`);

  // Zero-fill: EXTRACT(MONTH) is 1-based, so map index i -> month i+1
  const monthMap = new Map(rows.map((r) => [r.month, r]));
  const data = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: monthNames[i],
    count: monthMap.get(i + 1)?.count ?? 0,
    msPlayed: monthMap.get(i + 1)?.msPlayed ?? 0,
  }));

  return c.json({ data });
});

/**
 * GET /overview — Composite listening personality insights.
 *
 * Runs multiple aggregation queries to derive:
 *   - peakHour: the single hour of day with the most plays
 *   - busiestDay: the day of week with the most plays
 *   - favoriteSeason: season with the most plays (spring/summer/autumn/winter)
 *   - listenerType: personality label based on peak hour (e.g., "Night Owl")
 *   - averageDailyPlays: total plays / active date span
 *   - availableYears: all years present in the user's data (for year filter)
 */
patterns.get("/overview", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");
  const album = c.req.query("album");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist, album);

  // --- Peak hour: the hour of day with the highest play count ---
  const hourRows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${lh.playedAt})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(sql`EXTRACT(HOUR FROM ${lh.playedAt})`)
    .orderBy(sql`count(*) DESC`)
    .limit(1);

  const peakHour = hourRows[0]?.hour ?? 0;

  // Map hour to a Japanese time-of-day label for display
  function getHourLabel(h: number): string {
    if (h >= 0 && h <= 4) return "深夜";
    if (h >= 5 && h <= 7) return "早朝";
    if (h >= 8 && h <= 11) return "午前";
    if (h >= 12 && h <= 15) return "午後";
    if (h >= 16 && h <= 18) return "夕方";
    return "夜";
  }

  // Classify the user's listening personality based on their peak hour.
  // These labels are intentionally playful — they appear on the dashboard
  // as a "listener identity" badge.
  function getListenerType(h: number): string {
    if (h >= 22 || h <= 4) return "Night Owl \u{1F989}";
    if (h >= 5 && h <= 9) return "Early Bird \u{1F426}";
    if (h >= 10 && h <= 17) return "Daytime Listener \u{2600}\u{FE0F}";
    return "Evening Listener \u{1F319}";
  }

  // --- Busiest day of week ---
  const dayRows = await db
    .select({
      day: sql<number>`EXTRACT(DOW FROM ${lh.playedAt})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(sql`EXTRACT(DOW FROM ${lh.playedAt})`)
    .orderBy(sql`count(*) DESC`)
    .limit(1);

  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const busiestDay = dayRows[0]
    ? { day: dayRows[0].day, dayName: dayNames[dayRows[0].day] }
    : { day: 0, dayName: "日" };

  // --- Favorite season ---
  // Aggregate monthly play counts into four seasons using Japanese meteorological
  // convention: spring = Mar-May, summer = Jun-Aug, autumn = Sep-Nov, winter = Dec-Feb
  const monthRows = await db
    .select({
      month: sql<number>`EXTRACT(MONTH FROM ${lh.playedAt})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(sql`EXTRACT(MONTH FROM ${lh.playedAt})`);

  const seasonMap: Record<string, number> = {
    "春": 0, "夏": 0, "秋": 0, "冬": 0,
  };
  for (const row of monthRows) {
    if ([3, 4, 5].includes(row.month)) seasonMap["春"] += row.count;
    else if ([6, 7, 8].includes(row.month)) seasonMap["夏"] += row.count;
    else if ([9, 10, 11].includes(row.month)) seasonMap["秋"] += row.count;
    else seasonMap["冬"] += row.count;
  }
  const favoriteSeason =
    Object.entries(seasonMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "春";

  // --- Average daily plays ---
  // Computed over the span from the user's first play to their last play
  // (not calendar year), so the metric reflects actual listening density.
  const [dateRange] = await db
    .select({
      totalPlays: sql<number>`count(*)`.mapWith(Number),
      minDate: sql<string>`min(${lh.playedAt})`,
      maxDate: sql<string>`max(${lh.playedAt})`,
    })
    .from(lh)
    .where(where);

  let averageDailyPlays = 0;
  if (dateRange?.minDate && dateRange?.maxDate) {
    const days = Math.max(
      1,
      Math.ceil(
        (new Date(dateRange.maxDate).getTime() -
          new Date(dateRange.minDate).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    averageDailyPlays = Math.round(dateRange.totalPlays / days);
  }

  // --- Available years ---
  // Query is intentionally unfiltered by year/artist so the dropdown
  // always shows all years the user has data for
  const yearRows = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${lh.playedAt})`.mapWith(Number),
    })
    .from(lh)
    .where(eq(lh.userId, userId))
    .groupBy(sql`EXTRACT(YEAR FROM ${lh.playedAt})`)
    .orderBy(sql`EXTRACT(YEAR FROM ${lh.playedAt}) DESC`);

  return c.json({
    data: {
      peakHour: {
        hour: peakHour,
        label: getHourLabel(peakHour),
      },
      busiestDay,
      favoriteSeason,
      averageDailyPlays,
      listenerType: getListenerType(peakHour),
      availableYears: yearRows.map((r) => r.year),
    },
  });
});

/**
 * GET /time-artists — Top 5 artists for each time-of-day period.
 *
 * Returns four named periods (night, morning, daytime, evening) with
 * Japanese labels and the top 5 most-played artists in each window.
 * Supports optional ?year= query filter.
 */
patterns.get("/time-artists", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  const periods = [
    { name: "night", label: "深夜の相棒", hours: [22, 23, 0, 1, 2, 3] },
    { name: "morning", label: "夜明けの一枚", hours: [4, 5, 6, 7, 8, 9] },
    { name: "daytime", label: "陽だまりの音楽", hours: [10, 11, 12, 13, 14, 15, 16, 17] },
    { name: "evening", label: "黄昏のサウンド", hours: [18, 19, 20, 21] },
  ];

  const result: Record<
    string,
    {
      label: string;
      artists: Array<{ artistName: string; playCount: number; msPlayed: number }>;
    }
  > = {};

  for (const period of periods) {
    const conditions = [eq(lh.userId, userId)];

    if (year) {
      conditions.push(
        sql`EXTRACT(YEAR FROM ${lh.playedAt}) = ${Number(year)}`,
      );
    }

    // Filter to the hours belonging to this time period
    const hourCondition = sql`EXTRACT(HOUR FROM ${lh.playedAt}) IN (${sql.join(
      period.hours.map((h) => sql`${h}`),
      sql`, `,
    )})`;
    conditions.push(hourCondition);

    const artists = await db
      .select({
        artistName: lh.artistName,
        playCount: sql<number>`count(*)`.mapWith(Number),
        msPlayed: sql<number>`coalesce(sum(${lh.msPlayed}), 0)`.mapWith(Number),
      })
      .from(lh)
      .where(and(...conditions))
      .groupBy(lh.artistName)
      .orderBy(sql`count(*) DESC`)
      .limit(5);

    result[period.name] = { label: period.label, artists };
  }

  return c.json({ data: result });
});

/**
 * GET /devices — Play count and total ms_played per platform/device.
 *
 * Returns a breakdown of which platforms (iOS, macOS, Android, web, etc.)
 * the user listens on. Supports optional ?year= query filter.
 */
patterns.get("/devices", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  const conditions = [eq(lh.userId, userId), sql`${lh.platform} IS NOT NULL`];

  if (year) {
    conditions.push(
      sql`EXTRACT(YEAR FROM ${lh.playedAt}) = ${Number(year)}`,
    );
  }

  const rows = await db
    .select({
      platform: sql<string>`COALESCE(${lh.platform}, 'unknown')`,
      playCount: sql<number>`count(*)`.mapWith(Number),
      totalMs: sql<string>`sum(${lh.msPlayed})::bigint`,
    })
    .from(lh)
    .where(and(...conditions))
    .groupBy(lh.platform)
    .orderBy(sql`count(*) DESC`);

  return c.json({ data: rows });
});

/**
 * GET /shuffle — Shuffle vs intentional play ratio.
 *
 * Returns counts of shuffle plays, intentional plays, and total plays
 * where the shuffle flag is not null. Supports optional ?year= query filter.
 */
patterns.get("/shuffle", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;

  const conditions = [eq(lh.userId, userId)];

  if (year) {
    conditions.push(
      sql`EXTRACT(YEAR FROM ${lh.playedAt}) = ${Number(year)}`,
    );
  }

  const where = conditions.length === 1 ? conditions[0] : and(...conditions)!;

  const [row] = await db
    .select({
      shufflePlays: sql<number>`count(*) FILTER (WHERE ${lh.shuffle} = true)`.mapWith(Number),
      intentionalPlays: sql<number>`count(*) FILTER (WHERE ${lh.shuffle} = false)`.mapWith(Number),
      total: sql<number>`count(*) FILTER (WHERE ${lh.shuffle} IS NOT NULL)`.mapWith(Number),
    })
    .from(lh)
    .where(where);

  return c.json({ data: row });
});

/**
 * GET /artists — Distinct artist names from the user's listening history.
 *
 * Sorted by total play count descending so the most-listened artists appear
 * first in the column browser. Supports optional year filter.
 */
patterns.get("/artists", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year);

  const rows = await db
    .select({
      artistName: lh.artistName,
      playCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(lh.artistName)
    .orderBy(sql`count(*) DESC`);

  return c.json({ data: rows.map((r) => r.artistName) });
});

/**
 * GET /albums — Distinct album names from the user's listening history.
 *
 * Sorted by total play count descending. Supports optional year and artist
 * query params so the column browser can cascade (artist selection narrows
 * the album list).
 */
patterns.get("/albums", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist);

  const rows = await db
    .select({
      albumName: lh.albumName,
      playCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(lh)
    .where(where)
    .groupBy(lh.albumName)
    .orderBy(sql`count(*) DESC`);

  // Filter out null/empty album names
  return c.json({
    data: rows
      .filter((r) => r.albumName != null && r.albumName !== "")
      .map((r) => r.albumName!),
  });
});

export default patterns;
