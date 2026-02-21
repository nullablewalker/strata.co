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

function createSpotify(c: { env: Env; req: { url: string } }) {
  return new Spotify(
    c.env.SPOTIFY_CLIENT_ID,
    c.env.SPOTIFY_CLIENT_SECRET,
    `${new URL(c.req.url).origin}/api/auth/callback`,
  );
}

auth.get("/login", async (c) => {
  const spotify = createSpotify(c);

  const state = crypto.randomUUID();
  const scopes = [
    "user-read-email",
    "user-read-private",
    "user-read-recently-played",
    "user-top-read",
    "playlist-read-private",
  ];
  const url = spotify.createAuthorizationURL(state, null, scopes);

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

  if (!code || !state || state !== storedState) {
    return c.json({ error: "Invalid OAuth state" }, 400);
  }

  deleteCookie(c, "oauth_state");

  try {
    const spotify = createSpotify(c);
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

    // Upsert user in DB
    const db = createDb(c.env.DATABASE_URL);
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

    // Set session data
    const session = c.get("session") as Session<SessionData>;
    session.set("userId", user.id);
    session.set("accessToken", accessToken);
    session.set("accessTokenExpiresAt", accessTokenExpiresAt);

    return c.redirect("/dashboard");
  } catch {
    return c.json({ error: "OAuth callback failed" }, 500);
  }
});

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
