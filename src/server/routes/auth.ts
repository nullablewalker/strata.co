/**
 * Spotify OAuth Authentication Routes
 *
 * Handles the full OAuth 2.0 authorization code flow via Arctic v3:
 *   POST /api/auth/login    - Initiate Spotify login (redirect to Spotify)
 *   GET  /api/auth/callback - Handle OAuth callback, upsert user, start session
 *   GET  /api/auth/me       - Return authenticated user's profile
 *   POST /api/auth/logout   - Destroy session
 *
 * Uses Arctic v3 in "confidential client" mode (server-side with client secret),
 * so PKCE is not needed — code verifier is explicitly passed as `null`.
 * Session tokens are stored in encrypted cookies via hono-sessions (CookieStore).
 */
import { Hono } from "hono";
import { Spotify } from "arctic";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import type { Session } from "hono-sessions";
import type { Env } from "../types";
import { createDb } from "../db";
import { users } from "../db/schema";
import { authGuard, type SessionData } from "../middleware/session";
import type { User, ApiResponse } from "../../shared/types";

const auth = new Hono<{ Bindings: Env }>();

/**
 * Build a Spotify OAuth client per-request so the redirect URI
 * dynamically matches the request origin (works across localhost / production).
 */
function createSpotify(c: { env: Env; req: { url: string } }) {
  return new Spotify(
    c.env.SPOTIFY_CLIENT_ID,
    c.env.SPOTIFY_CLIENT_SECRET,
    `${new URL(c.req.url).origin}/api/auth/callback`,
  );
}

auth.get("/login", async (c) => {
  const spotify = createSpotify(c);

  // Generate a random state token for CSRF protection during the OAuth round-trip
  const state = crypto.randomUUID();
  const scopes = [
    "user-read-email",
    "user-read-private",
    "user-read-recently-played",
    "user-top-read",
    "playlist-read-private",
  ];
  // `null` for code verifier — Arctic v3 confidential client doesn't use PKCE
  const url = spotify.createAuthorizationURL(state, null, scopes);

  // Store state in a short-lived httpOnly cookie so we can validate it on callback.
  // 10-minute expiry is generous enough for the user to complete Spotify login.
  setCookie(c, "oauth_state", state, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 60 * 10,
  });

  return c.redirect(url.toString());
});

auth.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, "oauth_state");

  // Verify the state parameter matches what we stored — prevents CSRF attacks
  if (!code || !state || state !== storedState) {
    return c.json({ error: "Invalid OAuth state" }, 400);
  }

  // State is single-use; clear it immediately after validation
  deleteCookie(c, "oauth_state");

  try {
    const spotify = createSpotify(c);
    // Exchange the authorization code for tokens (null = no PKCE verifier)
    const tokens = await spotify.validateAuthorizationCode(code, null);

    const accessToken = tokens.accessToken();
    const accessTokenExpiresAt = tokens.accessTokenExpiresAt().getTime();
    const refreshToken = tokens.hasRefreshToken()
      ? tokens.refreshToken()
      : null;

    // Fetch Spotify user profile
    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return c.json({ error: "Failed to fetch Spotify profile" }, 500);
    }

    const profile = (await profileRes.json()) as {
      id: string;
      display_name: string | null;
      email: string | null;
      images: Array<{ url: string }>;
    };

    // Upsert: insert a new user or update an existing one keyed by spotifyId.
    // On conflict we refresh profile fields but preserve the refresh token
    // if Spotify didn't issue a new one (happens on re-auth within the same session).
    const db = createDb(c.env.DATABASE_URL);
    // Prefer the largest avatar image (Spotify returns them sorted small -> large)
    const avatarUrl =
      profile.images && profile.images.length > 0
        ? profile.images[profile.images.length - 1].url
        : null;

    const [user] = await db
      .insert(users)
      .values({
        spotifyId: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        avatarUrl,
        refreshToken,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.spotifyId,
        set: {
          displayName: profile.display_name,
          email: profile.email,
          avatarUrl,
          refreshToken: refreshToken ?? undefined,
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id });

    // Persist auth state in an encrypted session cookie.
    // Access token is stored in the cookie (~800 bytes total, well within the 4KB cookie limit).
    const session = c.get("session") as Session<SessionData>;
    session.set("userId", user.id);
    session.set("accessToken", accessToken);
    session.set("accessTokenExpiresAt", accessTokenExpiresAt);

    return c.redirect("/dashboard");
  } catch {
    return c.json({ error: "OAuth callback failed" }, 500);
  }
});

// Protected: returns the currently authenticated user's profile (no sensitive fields)
auth.get("/me", authGuard(), async (c) => {
  const session = c.get("session") as Session<SessionData>;
  const userId = session.get("userId")!;

  const db = createDb(c.env.DATABASE_URL);
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      spotifyId: true,
      displayName: true,
      email: true,
      avatarUrl: true,
    },
  });

  // If the session references a user that no longer exists in the DB,
  // invalidate the stale session and force re-login
  if (!user) {
    session.deleteSession();
    return c.json({ error: "User not found" }, 401);
  }

  return c.json<ApiResponse<User>>({ data: user });
});

auth.post("/logout", async (c) => {
  const session = c.get("session") as Session<SessionData>;
  session.deleteSession();
  return c.json({ ok: true });
});

export default auth;
