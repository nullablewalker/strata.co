import { index, integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  spotifyId: text("spotify_id").notNull().unique(),
  displayName: text("display_name"),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const listeningHistory = pgTable(
  "listening_history",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    trackSpotifyId: text("track_spotify_id").notNull(),
    artistName: text("artist_name").notNull(),
    trackName: text("track_name").notNull(),
    albumName: text("album_name"),
    msPlayed: integer("ms_played").notNull(),
    playedAt: timestamp("played_at").notNull(),
    source: text("source").notNull().default("import"),
  },
  (table) => [
    index("listening_history_user_id_idx").on(table.userId),
    index("listening_history_played_at_idx").on(table.playedAt),
    index("listening_history_track_idx").on(table.userId, table.trackSpotifyId),
  ],
);
