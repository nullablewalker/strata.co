import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import {
  spotifyServer,
  spotifyTrack,
  spotifySearchResult,
} from "../../test/mocks/spotify-api";
import { createMockSession, createAuthenticatedSession } from "../../test/mocks/session";
import {
  getValidAccessToken,
  refreshAndUpdateSession,
  fetchTrackMetadata,
  searchArtist,
} from "./spotify";

// ---------------------------------------------------------------------------
// MSW lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => spotifyServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => spotifyServer.resetHandlers());
afterAll(() => spotifyServer.close());

// ---------------------------------------------------------------------------
// getValidAccessToken
// ---------------------------------------------------------------------------

describe("getValidAccessToken", () => {
  it("returns token when valid and not expired", () => {
    const session = createAuthenticatedSession();
    const token = getValidAccessToken(session as never);
    expect(token).toBe("mock_access_token_valid");
  });

  it("throws when no access token in session", () => {
    const session = createMockSession(); // empty session
    expect(() => getValidAccessToken(session as never)).toThrow("No access token in session");
  });

  it("throws when token is within 5-min buffer of expiry", () => {
    const session = createMockSession({
      accessToken: "tok",
      accessTokenExpiresAt: Date.now() + 2 * 60 * 1000, // 2 min from now — within 5 min buffer
    });
    expect(() => getValidAccessToken(session as never)).toThrow("Access token expired");
  });

  it("returns token when expiry is >5min away", () => {
    const session = createMockSession({
      accessToken: "my_token",
      accessTokenExpiresAt: Date.now() + 10 * 60 * 1000, // 10 min from now
    });
    expect(getValidAccessToken(session as never)).toBe("my_token");
  });
});

// ---------------------------------------------------------------------------
// refreshAndUpdateSession
// ---------------------------------------------------------------------------

describe("refreshAndUpdateSession", () => {
  it("calls spotify.refreshAccessToken and updates session", async () => {
    const session = createMockSession({ userId: "u1", accessToken: "old" });
    const newExpiry = new Date(Date.now() + 3600_000);

    const mockSpotify = {
      refreshAccessToken: vi.fn().mockResolvedValue({
        accessToken: () => "new_tok",
        accessTokenExpiresAt: () => newExpiry,
      }),
    };

    const result = await refreshAndUpdateSession(
      session as never,
      mockSpotify as never,
      "refresh_tok",
    );

    expect(mockSpotify.refreshAccessToken).toHaveBeenCalledWith("refresh_tok");
    expect(result).toBe("new_tok");
    expect(session.set).toHaveBeenCalledWith("accessToken", "new_tok");
    expect(session.set).toHaveBeenCalledWith("accessTokenExpiresAt", newExpiry.getTime());
  });
});

// ---------------------------------------------------------------------------
// fetchTrackMetadata  (uses MSW)
// ---------------------------------------------------------------------------

describe("fetchTrackMetadata", () => {
  it("returns metadata for valid track IDs", async () => {
    const result = await fetchTrackMetadata("tok", ["track123"]);
    expect(result.size).toBe(1);
    expect(result.get("track123")).toEqual({
      albumArt: "https://example.com/album-300.jpg",
      albumName: "Test Album",
      genres: [],
    });
  });

  it("prefers 300px image", async () => {
    const result = await fetchTrackMetadata("tok", ["track123"]);
    expect(result.get("track123")?.albumArt).toBe("https://example.com/album-300.jpg");
  });

  it("falls back to first image when no 300px", async () => {
    spotifyServer.use(
      http.get("https://api.spotify.com/v1/tracks/:id", ({ params }) => {
        return HttpResponse.json({
          ...spotifyTrack,
          id: params.id,
          album: {
            name: "No300",
            images: [{ url: "https://example.com/big.jpg", width: 640, height: 640 }],
          },
        });
      }),
    );

    const result = await fetchTrackMetadata("tok", ["t1"]);
    expect(result.get("t1")?.albumArt).toBe("https://example.com/big.jpg");
  });

  it("handles 429 rate limit with retry", async () => {
    let callCount = 0;
    spotifyServer.use(
      http.get("https://api.spotify.com/v1/tracks/:id", ({ params }) => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(
            { error: { status: 429, message: "Rate limited" } },
            { status: 429, headers: { "Retry-After": "0" } },
          );
        }
        return HttpResponse.json({ ...spotifyTrack, id: params.id });
      }),
    );

    const result = await fetchTrackMetadata("tok", ["trackX"]);
    expect(callCount).toBe(2);
    expect(result.has("trackX")).toBe(true);
  });

  it("deduplicates input track IDs", async () => {
    let fetchCount = 0;
    spotifyServer.use(
      http.get("https://api.spotify.com/v1/tracks/:id", ({ params }) => {
        fetchCount++;
        return HttpResponse.json({ ...spotifyTrack, id: params.id });
      }),
    );

    await fetchTrackMetadata("tok", ["dup1", "dup1", "dup1"]);
    expect(fetchCount).toBe(1);
  });

  it("handles empty input array", async () => {
    const result = await fetchTrackMetadata("tok", []);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// searchArtist  (uses MSW)
// ---------------------------------------------------------------------------

describe("searchArtist", () => {
  it("returns id and genres for found artist", async () => {
    const result = await searchArtist("tok", "Test Artist");
    expect(result).toEqual({
      id: spotifySearchResult.artists.items[0].id,
      genres: spotifySearchResult.artists.items[0].genres,
    });
  });

  it("returns null when not found", async () => {
    spotifyServer.use(
      http.get("https://api.spotify.com/v1/search", () => {
        return HttpResponse.json({ artists: { items: [] } });
      }),
    );

    const result = await searchArtist("tok", "Nobody");
    expect(result).toBeNull();
  });

  it("handles 429 with retry", async () => {
    let callCount = 0;
    spotifyServer.use(
      http.get("https://api.spotify.com/v1/search", () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(
            { error: { status: 429, message: "Rate limited" } },
            { status: 429, headers: { "Retry-After": "0" } },
          );
        }
        return HttpResponse.json(spotifySearchResult);
      }),
    );

    const result = await searchArtist("tok", "Test Artist");
    expect(callCount).toBe(2);
    expect(result).toEqual({
      id: "artist123",
      genres: ["indie rock", "alternative"],
    });
  });
});
