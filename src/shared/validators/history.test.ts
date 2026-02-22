import {
  streamingHistoryEntrySchema,
  streamingHistorySchema,
} from "./history";

/** A complete valid entry with all fields populated. */
const validFullEntry = {
  ts: "2024-01-15T14:30:00Z",
  ms_played: 210000,
  master_metadata_track_name: "Bohemian Rhapsody",
  master_metadata_album_artist_name: "Queen",
  master_metadata_album_album_name: "A Night at the Opera",
  spotify_track_uri: "spotify:track:7tFiyTwD0nx5a1eklYtX2J",
  reason_start: "clickrow",
  reason_end: "trackdone",
  skipped: false,
  platform: "iOS",
  shuffle: true,
  offline: false,
  conn_country: "JP",
};

describe("streamingHistoryEntrySchema", () => {
  it("validates a complete entry with all fields", () => {
    const result = streamingHistoryEntrySchema.safeParse(validFullEntry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ts).toBe("2024-01-15T14:30:00Z");
      expect(result.data.ms_played).toBe(210000);
      expect(result.data.master_metadata_track_name).toBe(
        "Bohemian Rhapsody"
      );
    }
  });

  it("accepts entry with all nullable fields set to null", () => {
    const entry = {
      ts: "2024-01-15T14:30:00Z",
      ms_played: 5000,
      master_metadata_track_name: null,
      master_metadata_album_artist_name: null,
      master_metadata_album_album_name: null,
      spotify_track_uri: null,
      reason_start: null,
      reason_end: null,
      skipped: null,
      platform: null,
      shuffle: null,
      offline: null,
      conn_country: null,
    };
    const result = streamingHistoryEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it("accepts entry with only required fields (ts and ms_played)", () => {
    const result = streamingHistoryEntrySchema.safeParse({
      ts: "2024-06-01T00:00:00Z",
      ms_played: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects entry missing required ts field", () => {
    const result = streamingHistoryEntrySchema.safeParse({
      ms_played: 30000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects entry missing required ms_played field", () => {
    const result = streamingHistoryEntrySchema.safeParse({
      ts: "2024-01-15T14:30:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects entry where ms_played is a string instead of number", () => {
    const result = streamingHistoryEntrySchema.safeParse({
      ts: "2024-01-15T14:30:00Z",
      ms_played: "210000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects entry where ts is a number instead of string", () => {
    const result = streamingHistoryEntrySchema.safeParse({
      ts: 1705322400,
      ms_played: 210000,
    });
    expect(result.success).toBe(false);
  });

  describe("skipped field", () => {
    it.each([true, false, null])("accepts skipped = %s", (value) => {
      const result = streamingHistoryEntrySchema.safeParse({
        ts: "2024-01-15T00:00:00Z",
        ms_played: 1000,
        skipped: value,
      });
      expect(result.success).toBe(true);
    });

    it("accepts omitted skipped", () => {
      const result = streamingHistoryEntrySchema.safeParse({
        ts: "2024-01-15T00:00:00Z",
        ms_played: 1000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skipped).toBeUndefined();
      }
    });
  });

  describe("shuffle field", () => {
    it.each([true, false, null])("accepts shuffle = %s", (value) => {
      const result = streamingHistoryEntrySchema.safeParse({
        ts: "2024-01-15T00:00:00Z",
        ms_played: 1000,
        shuffle: value,
      });
      expect(result.success).toBe(true);
    });

    it("accepts omitted shuffle", () => {
      const result = streamingHistoryEntrySchema.safeParse({
        ts: "2024-01-15T00:00:00Z",
        ms_played: 1000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shuffle).toBeUndefined();
      }
    });
  });

  it("accepts various platform values", () => {
    const platforms = ["iOS", "macOS", "Android", "web_player", "Windows"];
    for (const platform of platforms) {
      const result = streamingHistoryEntrySchema.safeParse({
        ts: "2024-01-15T00:00:00Z",
        ms_played: 60000,
        platform,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("streamingHistorySchema", () => {
  it("validates an array of valid entries", () => {
    const result = streamingHistorySchema.safeParse([
      validFullEntry,
      { ts: "2024-02-01T00:00:00Z", ms_played: 5000 },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });

  it("rejects a non-array (plain object)", () => {
    const result = streamingHistorySchema.safeParse(validFullEntry);
    expect(result.success).toBe(false);
  });

  it("accepts an empty array", () => {
    const result = streamingHistorySchema.safeParse([]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it("rejects array containing an invalid entry", () => {
    const result = streamingHistorySchema.safeParse([
      validFullEntry,
      { ms_played: 1000 }, // missing ts
    ]);
    expect(result.success).toBe(false);
  });
});
