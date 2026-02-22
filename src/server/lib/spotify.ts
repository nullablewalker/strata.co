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

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
  refresh_token?: string; // may be returned (token rotation)
  scope: string;
}

/**
 * Refreshes the access token by calling Spotify's token endpoint directly.
 * Uses AbortSignal.timeout to prevent hanging (Arctic's internal fetch has no timeout).
 */
export async function refreshAndUpdateSession(
  session: Session<SessionData>,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; newRefreshToken?: string }> {
  console.log("[spotify] Refreshing access token...");

  const credentials = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[spotify] Token refresh failed:", res.status, body);
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = (await res.json()) as SpotifyTokenResponse;

  session.set("accessToken", data.access_token);
  session.set("accessTokenExpiresAt", Date.now() + data.expires_in * 1000);

  console.log("[spotify] Access token refreshed successfully");

  return {
    accessToken: data.access_token,
    newRefreshToken: data.refresh_token,
  };
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

// ---------------------------------------------------------------------------
// In-memory metadata cache — TTL-based to comply with Spotify TOS
// (server-side cache is allowed; permanent local storage is not)
// ---------------------------------------------------------------------------

const metadataCache = new Map<string, { data: TrackMetadata; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Clear the in-memory metadata cache. Exported for test isolation. */
export function clearMetadataCache(): void {
  metadataCache.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the fields we care about from a Spotify track object. */
function extractMetadata(track: SpotifyTrack): TrackMetadata {
  const albumArt =
    track.album.images.find((img) => img.width === 300)?.url ??
    track.album.images[0]?.url ??
    "";

  return {
    albumArt,
    albumName: track.album.name,
    genres: [],
  };
}

/**
 * Fetch a single track from Spotify, handling 429 rate limits with retry.
 *
 * Returns:
 *  - SpotifyTrack on success
 *  - 'rate_limited' if Retry-After > maxRetryAfter (caller should stop all fetches)
 *  - null on non-rate-limit errors (caller should skip this track)
 */
async function fetchSingleTrack(
  accessToken: string,
  id: string,
  maxRetryAfter: number,
): Promise<SpotifyTrack | "rate_limited" | null> {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? "1");

        if (retryAfter > maxRetryAfter) {
          console.warn(
            `[fetchSingleTrack] 429 for track ${id}, Retry-After=${retryAfter}s (>${maxRetryAfter}s limit) — stopping`,
          );
          return "rate_limited";
        }

        // Short Retry-After — wait and retry if we have attempts left
        if (attempt < MAX_RETRIES) {
          console.warn(
            `[fetchSingleTrack] 429 for track ${id}, Retry-After=${retryAfter}s — waiting (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(retryAfter * 1000);
          continue;
        }

        // Exhausted retries on short 429
        console.warn(
          `[fetchSingleTrack] 429 for track ${id} — exhausted ${MAX_RETRIES} retries`,
        );
        return null;
      }

      if (!res.ok) {
        console.error(`[fetchSingleTrack] Spotify API ${res.status} for track ${id}`);
        return null;
      }

      return (await res.json()) as SpotifyTrack;
    } catch (err) {
      console.error(
        `[fetchSingleTrack] Network error for track ${id}:`,
        (err as Error)?.message ?? err,
      );
      return null;
    }
  }

  // Should not reach here, but satisfy TypeScript
  return null;
}

// ---------------------------------------------------------------------------
// Batch fetch — GET /v1/tracks?ids=... (up to 50 per request)
// ---------------------------------------------------------------------------

interface SpotifyBatchResponse {
  tracks: (SpotifyTrack | null)[];
}

/**
 * Fetch up to 50 tracks in a single batch request.
 * Returns the tracks array on success, or null if the endpoint is unavailable
 * (e.g. 403 in Spotify dev mode).
 */
async function fetchTracksBatch(
  accessToken: string,
  ids: string[],
): Promise<SpotifyTrack[] | null> {
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/tracks?ids=${ids.join(",")}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      if (retryAfter > 30) {
        console.warn(`[fetchTracksBatch] 429, Retry-After=${retryAfter}s (too long, giving up)`);
        return null;
      }
      console.warn(`[fetchTracksBatch] 429, Retry-After=${retryAfter}s — waiting`);
      await sleep(retryAfter * 1000);
      // Retry once
      const retry = await fetch(
        `https://api.spotify.com/v1/tracks?ids=${ids.join(",")}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!retry.ok) return null;
      const data = (await retry.json()) as SpotifyBatchResponse;
      return data.tracks.filter((t): t is SpotifyTrack => t !== null);
    }

    if (res.status === 403) {
      console.warn("[fetchTracksBatch] 403 — batch endpoint restricted, falling back to individual");
      return null;
    }

    if (!res.ok) {
      console.error(`[fetchTracksBatch] Spotify API ${res.status}`);
      return null;
    }

    const data = (await res.json()) as SpotifyBatchResponse;
    return data.tracks.filter((t): t is SpotifyTrack => t !== null);
  } catch (err) {
    console.error("[fetchTracksBatch] Network error:", (err as Error)?.message ?? err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Fetch track metadata from Spotify API.
 *
 * Strategy:
 *  1. Serve from in-memory cache (24h TTL)
 *  2. Try batch endpoint (GET /v1/tracks?ids=...) — 1 request for up to 50 tracks
 *  3. If batch fails (403 in dev mode), fall back to sequential individual fetches
 *     with rate-limit-aware retry and exponential backoff
 */
export async function fetchTrackMetadata(
  accessToken: string,
  trackIds: string[],
): Promise<Map<string, TrackMetadata>> {
  const result = new Map<string, TrackMetadata>();
  const uniqueIds = [...new Set(trackIds)];
  const now = Date.now();

  // 1. Check cache — serve what we can from memory
  const uncachedIds: string[] = [];
  for (const id of uniqueIds) {
    const cached = metadataCache.get(id);
    if (cached && cached.expiresAt > now) {
      result.set(id, cached.data);
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0) {
    console.log(
      `[fetchTrackMetadata] All ${uniqueIds.length} tracks served from cache`,
    );
    return result;
  }

  console.log(
    `[fetchTrackMetadata] ${uniqueIds.length - uncachedIds.length} cached, ${uncachedIds.length} to fetch from Spotify API`,
  );

  // 2. Try batch endpoint first (50 tracks per request)
  const BATCH_SIZE = 50;
  let useBatch = true;

  for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
    const batch = uncachedIds.slice(i, i + BATCH_SIZE);

    if (useBatch) {
      const tracks = await fetchTracksBatch(accessToken, batch);
      if (tracks) {
        for (const track of tracks) {
          const meta = extractMetadata(track);
          result.set(track.id, meta);
          metadataCache.set(track.id, { data: meta, expiresAt: now + CACHE_TTL_MS });
        }
        console.log(`[fetchTrackMetadata] Batch: ${tracks.length}/${batch.length} tracks OK`);
        continue;
      }
      // Batch failed — switch to individual for remaining tracks
      useBatch = false;
    }

    // 3. Fallback: sequential individual fetches with rate limit awareness
    console.log(`[fetchTrackMetadata] Falling back to individual fetches for ${batch.length} tracks`);
    let delay = 300;
    const MAX_DELAY = 5000;
    const MAX_RETRY_AFTER = 30;

    for (let j = 0; j < batch.length; j++) {
      if (j > 0) await sleep(delay);

      const trackOrSignal = await fetchSingleTrack(accessToken, batch[j], MAX_RETRY_AFTER);

      if (trackOrSignal === "rate_limited") {
        console.warn(`[fetchTrackMetadata] Stopping — rate limited. Got ${result.size}/${uniqueIds.length} tracks`);
        console.log(`[fetchTrackMetadata] Done: ${result.size}/${uniqueIds.length} tracks with metadata`);
        return result;
      }

      if (trackOrSignal === null) {
        delay = Math.min(delay * 2, MAX_DELAY);
        continue;
      }

      const meta = extractMetadata(trackOrSignal);
      result.set(trackOrSignal.id, meta);
      metadataCache.set(trackOrSignal.id, { data: meta, expiresAt: now + CACHE_TTL_MS });
      delay = 300;
    }
  }

  console.log(
    `[fetchTrackMetadata] Done: ${result.size}/${uniqueIds.length} tracks with metadata`,
  );
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
