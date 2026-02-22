/**
 * Extended Streaming History Import Routes
 *
 * Handles ingestion of Spotify's "Extended Streaming History" JSON export.
 * Users request this data from Spotify's privacy settings — it arrives as
 * one or more JSON files containing every play event in their account history.
 *
 * Endpoints:
 *   POST /api/import/history - Parse, validate, deduplicate, and insert play records
 *   GET  /api/import/status  - Check how much data the user has imported so far
 *
 * All routes require authentication.
 */
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

// Extract the track ID portion from a Spotify URI (e.g., "spotify:track:6rqhF..." -> "6rqhF...")
function extractTrackId(uri: string): string | null {
  const match = uri.match(/^spotify:track:([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}

// Insert rows in batches to avoid oversized SQL statements and Neon request limits
const BATCH_SIZE = 500;
// Plays under 30 seconds are likely skips or accidental plays — not meaningful listens.
// This threshold keeps the Vault and Heatmap data focused on intentional engagement.
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

  // Validate the incoming array against Spotify's Extended Streaming History schema.
  // Zod strips unknown fields and coerces types; invalid files fail fast here.
  const parsed = streamingHistorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid streaming history format" }, 400);
  }

  const entries = parsed.data;
  const total = entries.length;
  let skipped = 0;
  let duplicates = 0;

  // --- Phase 1: Filter & Transform ---
  // Each entry must have sufficient play time, a track name, a valid Spotify URI,
  // and an artist name. Entries missing any of these are not usable for analytics.
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
    // Skip short plays — under 30s is not an intentional listen
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

  // --- Phase 2: Deduplicate against existing records ---
  // Users may re-upload the same file or upload overlapping files.
  // We build an in-memory set of (trackSpotifyId, playedAt) pairs already
  // in the DB, then filter out any incoming rows that match.
  // This is an application-level dedup rather than a DB unique constraint
  // because a user can legitimately play the same track multiple times
  // in a day — the timestamp makes each play event unique.
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

  // --- Phase 3: Batch insert ---
  // Insert in chunks to stay within Neon's per-statement size limits
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

/**
 * Returns a summary of the user's imported data: total play count
 * and the date range covered. Used by the frontend to show import
 * status and decide whether to prompt for a first-time upload.
 */
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

/**
 * Deletes all imported listening history for the authenticated user.
 * Returns the number of rows removed so the frontend can confirm the operation.
 */
importRoutes.delete("/data", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const db = createDb(c.env.DATABASE_URL);

  const result = await db
    .delete(listeningHistory)
    .where(eq(listeningHistory.userId, userId));

  return c.json({ data: { deleted: result.rowCount } });
});

export default importRoutes;
