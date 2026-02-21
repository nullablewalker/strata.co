import { Hono } from "hono";
import { sql, eq, and, ilike } from "drizzle-orm";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { authGuard, type SessionData } from "../middleware/session";
import { createDb } from "../db";
import { listeningHistory } from "../db/schema";

const patterns = new Hono<{ Bindings: Env }>();

patterns.use("*", authGuard());

// Build WHERE conditions from session + query params
function buildWhere(
  userId: string,
  year?: string,
  artist?: string,
) {
  const lh = listeningHistory;
  const conditions = [eq(lh.userId, userId)];

  if (year) {
    conditions.push(
      sql`EXTRACT(YEAR FROM ${lh.playedAt}) = ${Number(year)}`,
    );
  }

  if (artist) {
    conditions.push(ilike(lh.artistName, artist));
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions)!;
}

patterns.get("/hourly", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist);

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

  // Fill missing hours with 0
  const hourMap = new Map(rows.map((r) => [r.hour, r]));
  const data = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourMap.get(i)?.count ?? 0,
    msPlayed: hourMap.get(i)?.msPlayed ?? 0,
  }));

  return c.json({ data });
});

patterns.get("/weekly", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist);

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

patterns.get("/monthly", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist);

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

  const monthMap = new Map(rows.map((r) => [r.month, r]));
  const data = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: monthNames[i],
    count: monthMap.get(i + 1)?.count ?? 0,
    msPlayed: monthMap.get(i + 1)?.msPlayed ?? 0,
  }));

  return c.json({ data });
});

patterns.get("/overview", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;
  const year = c.req.query("year");
  const artist = c.req.query("artist");

  const db = createDb(c.env.DATABASE_URL);
  const lh = listeningHistory;
  const where = buildWhere(userId, year, artist);

  // Peak hour
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

  function getHourLabel(h: number): string {
    if (h >= 0 && h <= 4) return "深夜";
    if (h >= 5 && h <= 7) return "早朝";
    if (h >= 8 && h <= 11) return "午前";
    if (h >= 12 && h <= 15) return "午後";
    if (h >= 16 && h <= 18) return "夕方";
    return "夜";
  }

  function getListenerType(h: number): string {
    if (h >= 22 || h <= 4) return "Night Owl \u{1F989}";
    if (h >= 5 && h <= 9) return "Early Bird \u{1F426}";
    if (h >= 10 && h <= 17) return "Daytime Listener \u{2600}\u{FE0F}";
    return "Evening Listener \u{1F319}";
  }

  // Busiest day
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

  // Favorite season
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

  // Average daily plays
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

  // Available years for the filter
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

export default patterns;
