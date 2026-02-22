/**
 * Zod validators for Spotify Extended Streaming History JSON files.
 *
 * Users request their data via Spotify's "Download your data" privacy page.
 * The export arrives as one or more JSON files (e.g., Streaming_History_Audio_*.json).
 * This schema validates and types the raw JSON so we can safely parse uploads
 * before inserting into the listening_history table.
 *
 * Field reference: https://support.spotify.com/us/article/understanding-my-data/
 */

import { z } from "zod";

/**
 * Schema for a single row in the Extended Streaming History JSON.
 *
 * Most metadata fields are nullable AND optional because:
 * - `null` appears for non-music content (podcasts, local files) where track
 *   metadata doesn't exist in Spotify's catalog.
 * - The field may be entirely absent in older export formats.
 * Using `.nullable().optional()` handles both cases gracefully.
 */
export const streamingHistoryEntrySchema = z.object({
  /** ISO 8601 timestamp of when the stream ended (UTC). */
  ts: z.string(),
  /** Duration the track was actually played, in milliseconds. Used to filter skips / insignificant plays. */
  ms_played: z.number(),
  /** Track title — null for podcasts/local files. */
  master_metadata_track_name: z.string().nullable().optional(),
  /** Primary artist name — null for podcasts/local files. */
  master_metadata_album_artist_name: z.string().nullable().optional(),
  /** Album name — null for podcasts/local files. */
  master_metadata_album_album_name: z.string().nullable().optional(),
  /** Spotify URI (e.g., "spotify:track:...") — null when the content is not in Spotify's catalog. */
  spotify_track_uri: z.string().nullable().optional(),
  /** Why playback started (e.g., "trackdone", "clickrow", "fwdbtn"). */
  reason_start: z.string().nullable().optional(),
  /** Why playback ended (e.g., "trackdone", "fwdbtn", "endplay"). */
  reason_end: z.string().nullable().optional(),
  /** Whether the user explicitly skipped the track. */
  skipped: z.boolean().nullable().optional(),
  /** Client platform string (e.g., "Android", "iOS", "web_player"). */
  platform: z.string().nullable().optional(),
});

/** The top-level export file is a JSON array of history entries. */
export const streamingHistorySchema = z.array(streamingHistoryEntrySchema);

export type StreamingHistoryEntry = z.infer<typeof streamingHistoryEntrySchema>;
export type StreamingHistory = z.infer<typeof streamingHistorySchema>;

/** Breakdown of why entries were skipped during import. */
export interface SkipReasons {
  /** Plays shorter than 30 seconds (likely skips or accidental plays). */
  tooShort: number;
  /** Missing track name (podcasts, local files, etc.). */
  noTrackName: number;
  /** Missing or invalid Spotify track URI. */
  noSpotifyUri: number;
  /** Missing artist name. */
  noArtistName: number;
}

/** Summary returned after an import operation completes. */
export interface ImportResult {
  /** Total entries found in the uploaded JSON. */
  total: number;
  /** Entries successfully inserted into the database. */
  imported: number;
  /** Entries skipped (e.g., podcasts, entries with no track URI). */
  skipped: number;
  /** Entries that already existed (deduped by user + track URI + timestamp). */
  duplicates: number;
  /** Detailed breakdown of skip reasons. */
  skipReasons: SkipReasons;
}

/** Returned by GET /api/import/status — lets the client show whether data exists and its time range. */
export interface ImportStatus {
  hasData: boolean;
  totalTracks: number;
  /** null when the user has no imported data yet. */
  dateRange: { from: string; to: string } | null;
}
