/**
 * MSW (Mock Service Worker) handlers for Spotify Web API and Accounts endpoints.
 *
 * These intercept network requests during tests so route handlers / utility
 * functions can be tested without hitting the real Spotify API.
 */
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// ---------------------------------------------------------------------------
// Response fixtures
// ---------------------------------------------------------------------------

export const spotifyUserProfile = {
  id: "spotify_user_1",
  display_name: "Test User",
  email: "test@example.com",
  images: [{ url: "https://example.com/avatar.jpg", width: 300, height: 300 }],
};

export const spotifyTrack = {
  id: "track123",
  name: "Test Track",
  album: {
    name: "Test Album",
    images: [
      { url: "https://example.com/album-640.jpg", width: 640, height: 640 },
      { url: "https://example.com/album-300.jpg", width: 300, height: 300 },
      { url: "https://example.com/album-64.jpg", width: 64, height: 64 },
    ],
  },
  artists: [{ id: "artist123", name: "Test Artist" }],
};

export const spotifyArtist = {
  id: "artist123",
  name: "Test Artist",
  genres: ["indie rock", "alternative"],
};

export const spotifySearchResult = {
  artists: {
    items: [
      {
        id: "artist123",
        name: "Test Artist",
        genres: ["indie rock", "alternative"],
      },
    ],
  },
};

export const spotifyTokenResponse = {
  access_token: "new_access_token",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "new_refresh_token",
  scope: "user-read-email user-read-private",
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const spotifyHandlers = [
  // User profile
  http.get("https://api.spotify.com/v1/me", () => {
    return HttpResponse.json(spotifyUserProfile);
  }),

  // Track metadata
  http.get("https://api.spotify.com/v1/tracks/:id", ({ params }) => {
    return HttpResponse.json({ ...spotifyTrack, id: params.id });
  }),

  // Artist info
  http.get("https://api.spotify.com/v1/artists/:id", ({ params }) => {
    return HttpResponse.json({ ...spotifyArtist, id: params.id });
  }),

  // Artist search
  http.get("https://api.spotify.com/v1/search", () => {
    return HttpResponse.json(spotifySearchResult);
  }),

  // Token refresh
  http.post("https://accounts.spotify.com/api/token", () => {
    return HttpResponse.json(spotifyTokenResponse);
  }),
];

// ---------------------------------------------------------------------------
// Server instance (start/stop in test setup)
// ---------------------------------------------------------------------------

export const spotifyServer = setupServer(...spotifyHandlers);

/**
 * Convenience helpers for overriding individual endpoints in specific tests.
 *
 * Usage:
 *   spotifyServer.use(overrides.trackNotFound("bad_id"));
 */
export const overrides = {
  trackNotFound: (id = "nonexistent") =>
    http.get(`https://api.spotify.com/v1/tracks/${id}`, () => {
      return HttpResponse.json({ error: { status: 404, message: "Not found" } }, { status: 404 });
    }),

  trackRateLimit: () =>
    http.get("https://api.spotify.com/v1/tracks/:id", () => {
      return HttpResponse.json(
        { error: { status: 429, message: "Rate limited" } },
        { status: 429, headers: { "Retry-After": "1" } },
      );
    }),

  artistNotFound: (id = "nonexistent") =>
    http.get(`https://api.spotify.com/v1/artists/${id}`, () => {
      return HttpResponse.json({ error: { status: 404, message: "Not found" } }, { status: 404 });
    }),

  searchEmpty: () =>
    http.get("https://api.spotify.com/v1/search", () => {
      return HttpResponse.json({ artists: { items: [] } });
    }),

  userProfileError: () =>
    http.get("https://api.spotify.com/v1/me", () => {
      return HttpResponse.json({ error: { status: 401, message: "Unauthorized" } }, { status: 401 });
    }),
};
