import { Spotify } from "arctic";
import type { Session } from "hono-sessions";
import type { SessionData } from "../middleware/session";

/**
 * Returns the access token if still valid, otherwise throws.
 * Callers should catch and use refreshAndUpdateSession with the DB refresh token.
 */
export function getValidAccessToken(session: Session<SessionData>): string {
  const accessToken = session.get("accessToken");
  const expiresAt = session.get("accessTokenExpiresAt");

  if (!accessToken || !expiresAt) {
    throw new Error("No access token in session");
  }

  // Consider expired if within 5 minutes of expiry
  const bufferMs = 5 * 60 * 1000;
  if (Date.now() + bufferMs < expiresAt) {
    return accessToken;
  }

  throw new Error("Access token expired");
}

/**
 * Refreshes the access token using a refresh token and updates the session.
 */
export async function refreshAndUpdateSession(
  session: Session<SessionData>,
  spotify: Spotify,
  refreshToken: string,
): Promise<string> {
  const tokens = await spotify.refreshAccessToken(refreshToken);
  const newAccessToken = tokens.accessToken();
  const newExpiresAt = tokens.accessTokenExpiresAt().getTime();

  session.set("accessToken", newAccessToken);
  session.set("accessTokenExpiresAt", newExpiresAt);

  return newAccessToken;
}

interface TrackMetadata {
  albumArt: string;
  albumName: string;
  genres: string[];
}

interface SpotifyTrack {
  id: string;
  album: {
    name: string;
    images: Array<{ url: string; width: number; height: number }>;
  };
  artists: Array<{ id: string; name: string }>;
}

/**
 * Fetch track metadata from Spotify API using individual track endpoints.
 * The batch endpoint (GET /v1/tracks?ids=) is restricted in Spotify's
 * development mode, so we use GET /v1/tracks/{id} with concurrency control.
 */
export async function fetchTrackMetadata(
  accessToken: string,
  trackIds: string[],
): Promise<Map<string, TrackMetadata>> {
  const result = new Map<string, TrackMetadata>();
  const uniqueIds = [...new Set(trackIds)];
  const CONCURRENCY = 10;

  for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
    const chunk = uniqueIds.slice(i, i + CONCURRENCY);

    const settled = await Promise.allSettled(
      chunk.map(async (id) => {
        const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          // Retry once
          const retry = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!retry.ok) return null;
          return (await retry.json()) as SpotifyTrack;
        }

        if (!res.ok) {
          console.error(`[fetchTrackMetadata] Spotify API ${res.status} for track ${id}`);
          return null;
        }

        return (await res.json()) as SpotifyTrack;
      }),
    );

    for (const entry of settled) {
      if (entry.status !== "fulfilled" || !entry.value) continue;
      const track = entry.value;

      const albumArt =
        track.album.images.find((img) => img.width === 300)?.url ??
        track.album.images[0]?.url ??
        "";

      result.set(track.id, {
        albumArt,
        albumName: track.album.name,
        genres: [],
      });
    }
  }

  return result;
}

// --- Artist genres ---

interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
}

/**
 * Fetch artist genres from Spotify API using individual endpoints.
 * Uses GET /v1/artists/{id} to avoid batch endpoint restrictions.
 */
export async function fetchArtistGenres(
  accessToken: string,
  artistIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const uniqueIds = [...new Set(artistIds)];
  const CONCURRENCY = 10;

  for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
    const chunk = uniqueIds.slice(i, i + CONCURRENCY);

    const settled = await Promise.allSettled(
      chunk.map(async (id) => {
        const res = await fetch(`https://api.spotify.com/v1/artists/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          const retry = await fetch(`https://api.spotify.com/v1/artists/${id}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!retry.ok) return null;
          return (await retry.json()) as SpotifyArtist;
        }

        if (!res.ok) return null;
        return (await res.json()) as SpotifyArtist;
      }),
    );

    for (const entry of settled) {
      if (entry.status !== "fulfilled" || !entry.value) continue;
      result.set(entry.value.id, entry.value.genres);
    }
  }

  return result;
}

// --- Artist search ---

interface SpotifySearchResponse {
  artists: {
    items: Array<{
      id: string;
      name: string;
      genres: string[];
    }>;
  };
}

/**
 * Search for an artist by name and return their Spotify ID and genres.
 * Returns null if not found.
 */
export async function searchArtist(
  accessToken: string,
  artistName: string,
): Promise<{ id: string; genres: string[] } | null> {
  const q = encodeURIComponent(`artist:${artistName}`);
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=artist&limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return searchArtist(accessToken, artistName);
  }

  if (!res.ok) return null;

  const data = (await res.json()) as SpotifySearchResponse;
  const artist = data.artists.items[0];
  if (!artist) return null;

  return { id: artist.id, genres: artist.genres };
}
