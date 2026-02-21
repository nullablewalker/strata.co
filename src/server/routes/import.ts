import { Hono } from "hono";
import { count, eq, max, min } from "drizzle-orm";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { createDb } from "../db";
import { listeningHistory } from "../db/schema";
import { authGuard, type SessionData } from "../middleware/session";
import { streamingHistorySchema } from "../../shared/validators/history";
import type {
  ImportResult,
  ImportStatus,
} from "../../shared/validators/history";

const importRoutes = new Hono<{ Bindings: Env }>();

// All import routes require authentication
importRoutes.use("*", authGuard());

// Extract Spotify track ID from URI like "spotify:track:6rqhFgbbKwnb9MLmUQDhG6"
function extractTrackId(uri: string): string | null {
  const match = uri.match(/^spotify:track:([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}

const BATCH_SIZE = 500;
const MIN_MS_PLAYED = 30_000;

importRoutes.post("/history", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = streamingHistorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid streaming history format" }, 400);
  }

  const entries = parsed.data;
  const total = entries.length;
  let skipped = 0;
  let duplicates = 0;

  // Filter and transform entries
  const validRows: Array<{
    userId: string;
    trackSpotifyId: string;
    trackName: string;
    artistName: string;
    albumName: string | null;
    msPlayed: number;
    playedAt: Date;
    source: string;
  }> = [];

  for (const entry of entries) {
    // Skip short plays
    if (entry.ms_played < MIN_MS_PLAYED) {
      skipped++;
      continue;
    }

    // Skip entries without track name
    if (!entry.master_metadata_track_name) {
      skipped++;
      continue;
    }

    // Skip entries without track URI
    if (!entry.spotify_track_uri) {
      skipped++;
      continue;
    }

    const trackId = extractTrackId(entry.spotify_track_uri);
    if (!trackId) {
      skipped++;
      continue;
    }

    // Skip entries without artist name
    if (!entry.master_metadata_album_artist_name) {
      skipped++;
      continue;
    }

    validRows.push({
      userId,
      trackSpotifyId: trackId,
      trackName: entry.master_metadata_track_name,
      artistName: entry.master_metadata_album_artist_name,
      albumName: entry.master_metadata_album_album_name ?? null,
      msPlayed: entry.ms_played,
      playedAt: new Date(entry.ts),
      source: "import",
    });
  }

  const db = createDb(c.env.DATABASE_URL);

  // Deduplicate against existing records
  // Build a set of existing (trackSpotifyId, playedAt) for this user
  const existingRecords = await db
    .select({
      trackSpotifyId: listeningHistory.trackSpotifyId,
      playedAt: listeningHistory.playedAt,
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId));

  const existingSet = new Set(
    existingRecords.map(
      (r) => `${r.trackSpotifyId}:${r.playedAt.toISOString()}`,
    ),
  );

  const newRows = validRows.filter((row) => {
    const key = `${row.trackSpotifyId}:${row.playedAt.toISOString()}`;
    if (existingSet.has(key)) {
      duplicates++;
      return false;
    }
    return true;
  });

  // Batch insert
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE);
    await db.insert(listeningHistory).values(batch);
  }

  const result: ImportResult = {
    total,
    imported: newRows.length,
    skipped,
    duplicates,
  };

  return c.json({ data: result });
});

importRoutes.get("/status", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const db = createDb(c.env.DATABASE_URL);

  const [stats] = await db
    .select({
      totalTracks: count(),
      minPlayedAt: min(listeningHistory.playedAt),
      maxPlayedAt: max(listeningHistory.playedAt),
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId));

  const hasData = stats.totalTracks > 0;
  const dateRange =
    hasData && stats.minPlayedAt && stats.maxPlayedAt
      ? {
          from: stats.minPlayedAt.toISOString(),
          to: stats.maxPlayedAt.toISOString(),
        }
      : null;

  const result: ImportStatus = {
    hasData,
    totalTracks: stats.totalTracks,
    dateRange,
  };

  return c.json({ data: result });
});

export default importRoutes;
