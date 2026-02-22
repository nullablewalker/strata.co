/**
 * Drizzle ORM schema definitions — the single source of truth for the DB
 * structure. Run `npm run db:generate` after changes to produce migration
 * files, or `npm run db:push` to apply directly during development.
 */

import { index, integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Application users, identified by their Spotify account.
 *
 * The Spotify refresh token is stored here (not in the cookie) so that:
 *   - The session cookie stays small (< 4 KB limit)
 *   - The server can revoke or rotate tokens independently of the client
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Spotify's unique user identifier — used as the conflict key for upserts
  spotifyId: text("spotify_id").notNull().unique(),
  displayName: text("display_name"),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  // Long-lived OAuth refresh token for obtaining new access tokens
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Individual track plays imported from Spotify Extended Streaming History JSON
 * files or (in the future) continuous scrobbling.
 *
 * Each row represents a single play event. Aggregate statistics (total plays,
 * listening time) are computed at query time via the vault and heatmap routes.
 */
export const listeningHistory = pgTable(
  "listening_history",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    // Spotify track URI without the "spotify:track:" prefix
    trackSpotifyId: text("track_spotify_id").notNull(),
    artistName: text("artist_name").notNull(),
    trackName: text("track_name").notNull(),
    albumName: text("album_name"),
    // Duration the user actually listened, in milliseconds
    msPlayed: integer("ms_played").notNull(),
    playedAt: timestamp("played_at").notNull(),
    // Provenance: "import" for Extended Streaming History, future values like
    // "scrobble" for real-time tracking
    source: text("source").notNull().default("import"),
  },
  (table) => [
    // Filter by user — nearly every query is scoped to a single user
    index("listening_history_user_id_idx").on(table.userId),
    // Chronological queries (heatmap, time-based patterns)
    index("listening_history_played_at_idx").on(table.playedAt),
    // Composite index for "group by track per user" aggregations (vault)
    index("listening_history_track_idx").on(table.userId, table.trackSpotifyId),
  ],
);
