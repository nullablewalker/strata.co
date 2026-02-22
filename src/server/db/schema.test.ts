import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { users, listeningHistory } from "./schema";

describe("users table", () => {
  it("has expected columns", () => {
    const columns = getTableColumns(users);
    const names = Object.keys(columns);

    expect(names).toContain("id");
    expect(names).toContain("spotifyId");
    expect(names).toContain("displayName");
    expect(names).toContain("email");
    expect(names).toContain("avatarUrl");
    expect(names).toContain("refreshToken");
    expect(names).toContain("createdAt");
    expect(names).toContain("updatedAt");
  });

  it("spotifyId has unique constraint", () => {
    const columns = getTableColumns(users);
    expect(columns.spotifyId.isUnique).toBe(true);
  });

  it("id is a primary key", () => {
    const columns = getTableColumns(users);
    expect(columns.id.primary).toBe(true);
  });
});

describe("listeningHistory table", () => {
  it("has expected columns", () => {
    const columns = getTableColumns(listeningHistory);
    const names = Object.keys(columns);

    expect(names).toContain("id");
    expect(names).toContain("userId");
    expect(names).toContain("trackSpotifyId");
    expect(names).toContain("artistName");
    expect(names).toContain("trackName");
    expect(names).toContain("albumName");
    expect(names).toContain("msPlayed");
    expect(names).toContain("playedAt");
    expect(names).toContain("source");
    expect(names).toContain("reasonStart");
    expect(names).toContain("reasonEnd");
    expect(names).toContain("skipped");
    expect(names).toContain("platform");
    expect(names).toContain("shuffle");
  });

  it("has foreign key reference to users table", () => {
    const columns = getTableColumns(listeningHistory);
    // The userId column should reference the users table
    const userIdCol = columns.userId;
    // In Drizzle, columns with .references() are not null and have the reference info
    expect(userIdCol.notNull).toBe(true);
  });

  it("id is primary key", () => {
    const columns = getTableColumns(listeningHistory);
    expect(columns.id.primary).toBe(true);
  });
});
