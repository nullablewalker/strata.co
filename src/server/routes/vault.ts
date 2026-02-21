import { Hono } from "hono";
import { sql, eq, ilike, or, desc, asc, count, countDistinct } from "drizzle-orm";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { authGuard, type SessionData } from "../middleware/session";
import { createDb } from "../db";
import { listeningHistory } from "../db/schema";

const vault = new Hono<{ Bindings: Env }>();

vault.use("*", authGuard());

vault.get("/tracks", async (c) => {
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
    conditions.push(
      or(
        ilike(lh.trackName, `%${search}%`),
        ilike(lh.artistName, `%${search}%`),
      )!,
    );
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

  const whereClause =
    conditions.length === 1
      ? conditions[0]
      : sql`${conditions[0]} AND ${conditions[1]}`;

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

  // Get total count for pagination
  const [totalResult] = await db
    .select({
      total: countDistinct(lh.trackSpotifyId),
    })
    .from(lh)
    .where(whereClause);

  return c.json({
    data: tracks,
    total: totalResult?.total ?? 0,
  });
});

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

  const whereClause =
    conditions.length === 1
      ? conditions[0]
      : sql`${conditions[0]} AND ${conditions[1]}`;

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
      totalMsPlayed: sql<number>`coalesce(sum(${lh.msPlayed}), 0)`.mapWith(
        Number,
      ),
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

export default vault;
