import { z } from "zod";

// Schema for a single Spotify Extended Streaming History entry
export const streamingHistoryEntrySchema = z.object({
  ts: z.string(),
  ms_played: z.number(),
  master_metadata_track_name: z.string().nullable().optional(),
  master_metadata_album_artist_name: z.string().nullable().optional(),
  master_metadata_album_album_name: z.string().nullable().optional(),
  spotify_track_uri: z.string().nullable().optional(),
  reason_start: z.string().nullable().optional(),
  reason_end: z.string().nullable().optional(),
  skipped: z.boolean().nullable().optional(),
  platform: z.string().nullable().optional(),
});

export const streamingHistorySchema = z.array(streamingHistoryEntrySchema);

export type StreamingHistoryEntry = z.infer<typeof streamingHistoryEntrySchema>;
export type StreamingHistory = z.infer<typeof streamingHistorySchema>;

// Import result returned by the API
export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  duplicates: number;
}

// Import status returned by GET /api/import/status
export interface ImportStatus {
  hasData: boolean;
  totalTracks: number;
  dateRange: { from: string; to: string } | null;
}
