/**
 * Test fixtures for Spotify Extended Streaming History entries.
 * Matches the schema defined in src/shared/validators/history.ts.
 */
import type { StreamingHistoryEntry } from "../../shared/validators/history";

// ---------------------------------------------------------------------------
// Individual entry fixtures
// ---------------------------------------------------------------------------

/** A fully-populated valid entry with all optional fields present. */
export const validEntry: StreamingHistoryEntry = {
  ts: "2024-06-15T10:30:00Z",
  ms_played: 234567,
  master_metadata_track_name: "Karma Police",
  master_metadata_album_artist_name: "Radiohead",
  master_metadata_album_album_name: "OK Computer",
  spotify_track_uri: "spotify:track:63OQupATfueTdZMWIaAKMd",
  reason_start: "clickrow",
  reason_end: "trackdone",
  skipped: false,
  platform: "iOS",
  shuffle: false,
  offline: false,
  conn_country: "JP",
};

/** Entry with only the required fields (ts, ms_played). */
export const minimalEntry: StreamingHistoryEntry = {
  ts: "2024-03-10T08:00:00Z",
  ms_played: 120000,
};

/** Entry with ms_played under 30 seconds — should be filtered as "too short". */
export const shortPlayEntry: StreamingHistoryEntry = {
  ts: "2024-06-15T10:32:00Z",
  ms_played: 5000,
  master_metadata_track_name: "Skipped Track",
  master_metadata_album_artist_name: "Some Artist",
  master_metadata_album_album_name: "Some Album",
  spotify_track_uri: "spotify:track:skipped123",
  reason_start: "clickrow",
  reason_end: "fwdbtn",
  skipped: true,
  platform: "Android",
  shuffle: true,
};

/** Entry with null track name — should be filtered as "no track name". */
export const noTrackNameEntry: StreamingHistoryEntry = {
  ts: "2024-06-15T11:00:00Z",
  ms_played: 180000,
  master_metadata_track_name: null,
  master_metadata_album_artist_name: "Unknown Artist",
  master_metadata_album_album_name: "Unknown Album",
  spotify_track_uri: "spotify:track:noname456",
  reason_start: "trackdone",
  reason_end: "trackdone",
  skipped: false,
  platform: "web_player",
  shuffle: false,
};

/** Entry with null Spotify URI — should be filtered as "no Spotify URI". */
export const noUriEntry: StreamingHistoryEntry = {
  ts: "2024-06-15T11:05:00Z",
  ms_played: 200000,
  master_metadata_track_name: "Local File Song",
  master_metadata_album_artist_name: "Local Artist",
  master_metadata_album_album_name: "Local Album",
  spotify_track_uri: null,
  reason_start: "clickrow",
  reason_end: "trackdone",
  skipped: false,
  platform: "osx",
  shuffle: false,
};

/** Entry with null artist name — should be filtered as "no artist name". */
export const noArtistEntry: StreamingHistoryEntry = {
  ts: "2024-06-15T11:10:00Z",
  ms_played: 150000,
  master_metadata_track_name: "Mystery Track",
  master_metadata_album_artist_name: null,
  master_metadata_album_album_name: "Mystery Album",
  spotify_track_uri: "spotify:track:mystery789",
  reason_start: "trackdone",
  reason_end: "endplay",
  skipped: false,
  platform: "iOS",
  shuffle: true,
};

/** Podcast entry with a non-spotify:track URI — should be filtered. */
export const podcastEntry: StreamingHistoryEntry = {
  ts: "2024-06-15T12:00:00Z",
  ms_played: 1800000,
  master_metadata_track_name: "Episode 42: Deep Dive",
  master_metadata_album_artist_name: "Tech Podcast",
  master_metadata_album_album_name: "Tech Podcast Show",
  spotify_track_uri: "spotify:episode:podcast123abc",
  reason_start: "clickrow",
  reason_end: "endplay",
  skipped: false,
  platform: "Android",
  shuffle: false,
};

// ---------------------------------------------------------------------------
// Batch fixture — 10 varied valid entries
// ---------------------------------------------------------------------------

export const validBatch: StreamingHistoryEntry[] = [
  {
    ts: "2024-01-15T09:00:00Z",
    ms_played: 245000,
    master_metadata_track_name: "Bohemian Rhapsody",
    master_metadata_album_artist_name: "Queen",
    master_metadata_album_album_name: "A Night at the Opera",
    spotify_track_uri: "spotify:track:queen001",
    reason_start: "clickrow",
    reason_end: "trackdone",
    skipped: false,
    platform: "iOS",
    shuffle: false,
  },
  {
    ts: "2024-02-20T14:30:00Z",
    ms_played: 180000,
    master_metadata_track_name: "Smells Like Teen Spirit",
    master_metadata_album_artist_name: "Nirvana",
    master_metadata_album_album_name: "Nevermind",
    spotify_track_uri: "spotify:track:nirvana001",
    reason_start: "trackdone",
    reason_end: "trackdone",
    skipped: false,
    platform: "Android",
    shuffle: true,
  },
  {
    ts: "2024-03-10T22:15:00Z",
    ms_played: 320000,
    master_metadata_track_name: "Stairway to Heaven",
    master_metadata_album_artist_name: "Led Zeppelin",
    master_metadata_album_album_name: "Led Zeppelin IV",
    spotify_track_uri: "spotify:track:ledzep001",
    reason_start: "clickrow",
    reason_end: "trackdone",
    skipped: false,
    platform: "osx",
    shuffle: false,
  },
  {
    ts: "2024-04-05T07:45:00Z",
    ms_played: 210000,
    master_metadata_track_name: "Hotel California",
    master_metadata_album_artist_name: "Eagles",
    master_metadata_album_album_name: "Hotel California",
    spotify_track_uri: "spotify:track:eagles001",
    reason_start: "fwdbtn",
    reason_end: "trackdone",
    skipped: false,
    platform: "web_player",
    shuffle: true,
  },
  {
    ts: "2024-05-18T16:00:00Z",
    ms_played: 195000,
    master_metadata_track_name: "Imagine",
    master_metadata_album_artist_name: "John Lennon",
    master_metadata_album_album_name: "Imagine",
    spotify_track_uri: "spotify:track:lennon001",
    reason_start: "trackdone",
    reason_end: "endplay",
    skipped: false,
    platform: "iOS",
    shuffle: false,
  },
  {
    ts: "2024-06-22T20:30:00Z",
    ms_played: 275000,
    master_metadata_track_name: "Purple Rain",
    master_metadata_album_artist_name: "Prince",
    master_metadata_album_album_name: "Purple Rain",
    spotify_track_uri: "spotify:track:prince001",
    reason_start: "clickrow",
    reason_end: "trackdone",
    skipped: false,
    platform: "Android",
    shuffle: false,
  },
  {
    ts: "2024-07-04T11:00:00Z",
    ms_played: 160000,
    master_metadata_track_name: "Billie Jean",
    master_metadata_album_artist_name: "Michael Jackson",
    master_metadata_album_album_name: "Thriller",
    spotify_track_uri: "spotify:track:mj001",
    reason_start: "clickrow",
    reason_end: "fwdbtn",
    skipped: false,
    platform: "iOS",
    shuffle: true,
  },
  {
    ts: "2024-08-12T03:15:00Z",
    ms_played: 230000,
    master_metadata_track_name: "Paranoid Android",
    master_metadata_album_artist_name: "Radiohead",
    master_metadata_album_album_name: "OK Computer",
    spotify_track_uri: "spotify:track:radiohead002",
    reason_start: "trackdone",
    reason_end: "trackdone",
    skipped: false,
    platform: "osx",
    shuffle: false,
    offline: true,
  },
  {
    ts: "2024-09-30T18:45:00Z",
    ms_played: 185000,
    master_metadata_track_name: "Under Pressure",
    master_metadata_album_artist_name: "Queen",
    master_metadata_album_album_name: "Hot Space",
    spotify_track_uri: "spotify:track:queen002",
    reason_start: "clickrow",
    reason_end: "trackdone",
    skipped: false,
    platform: "web_player",
    shuffle: false,
    conn_country: "US",
  },
  {
    ts: "2024-12-25T00:00:00Z",
    ms_played: 200000,
    master_metadata_track_name: "Let It Be",
    master_metadata_album_artist_name: "The Beatles",
    master_metadata_album_album_name: "Let It Be",
    spotify_track_uri: "spotify:track:beatles001",
    reason_start: "clickrow",
    reason_end: "trackdone",
    skipped: false,
    platform: "iOS",
    shuffle: false,
    conn_country: "JP",
  },
];
