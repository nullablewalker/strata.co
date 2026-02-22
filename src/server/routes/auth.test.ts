import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { createMockDb, mockUser, type MockDb } from "../../test/mocks/db";
import {
  createAuthenticatedSession,
  createMockSession,
  type MockSession,
} from "../../test/mocks/session";
import { mockEnv } from "../../test/mocks/hono-context";

// ---------------------------------------------------------------------------
// Mock createDb
// ---------------------------------------------------------------------------
let mockDb: MockDb;

vi.mock("../db", () => ({
  createDb: vi.fn(() => mockDb),
}));

// ---------------------------------------------------------------------------
// Mock authGuard to inject session without real cookie encryption.
// ---------------------------------------------------------------------------
let mockSession: MockSession;

vi.mock("../middleware/session", () => ({
  authGuard: () => {
    return async (
      c: {
        get: (k: string) => unknown;
        set: (k: string, v: unknown) => void;
        json: (d: unknown, s: number) => Response;
      },
      next: () => Promise<void>,
    ) => {
      c.set("session", mockSession);
      const userId = mockSession.get("userId");
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    };
  },
}));

// ---------------------------------------------------------------------------
// Mock Arctic Spotify to avoid real OAuth calls
// ---------------------------------------------------------------------------
vi.mock("arctic", () => ({
  Spotify: vi.fn().mockImplementation(() => ({
    createAuthorizationURL: vi.fn(
      () => new URL("https://accounts.spotify.com/authorize?mock=true"),
    ),
    validateAuthorizationCode: vi.fn().mockResolvedValue({
      accessToken: () => "mock_access_token",
      accessTokenExpiresAt: () => new Date(Date.now() + 3600000),
      hasRefreshToken: () => true,
      refreshToken: () => "mock_refresh_token",
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock hono/cookie for login/callback cookie handling
// ---------------------------------------------------------------------------
const mockGetCookie = vi.fn();
const mockSetCookie = vi.fn();
const mockDeleteCookie = vi.fn();

vi.mock("hono/cookie", () => ({
  getCookie: (...args: unknown[]) => mockGetCookie(...args),
  setCookie: (...args: unknown[]) => mockSetCookie(...args),
  deleteCookie: (...args: unknown[]) => mockDeleteCookie(...args),
}));

// ---------------------------------------------------------------------------
// Import route after mocks
// ---------------------------------------------------------------------------
import authRoutes from "./auth";

function createApp() {
  const app = new Hono();
  // Inject session into context for all routes (simulating session middleware)
  app.use("*", async (c, next) => {
    c.set("session" as never, mockSession as never);
    await next();
  });
  app.route("/api/auth", authRoutes);
  return app;
}

/** Helper to make requests with env bindings */
function req(app: Hono, path: string, init?: RequestInit) {
  return app.request(path, init, mockEnv);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth routes — GET /api/auth/me", () => {
  beforeEach(() => {
    mockSession = createAuthenticatedSession();
    mockDb = createMockDb({ findFirstData: mockUser });
    mockGetCookie.mockReset();
    mockSetCookie.mockReset();
    mockDeleteCookie.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockSession = createMockSession(); // no userId
    const app = createApp();
    const res = await req(app, "/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns user data when authenticated", async () => {
    const userResponse = {
      id: mockUser.id,
      spotifyId: mockUser.spotifyId,
      displayName: mockUser.displayName,
      email: mockUser.email,
      avatarUrl: mockUser.avatarUrl,
    };
    mockDb.query.users.findFirst = vi.fn().mockResolvedValue(userResponse);

    const app = createApp();
    const res = await req(app, "/api/auth/me");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(userResponse);
  });

  it("returns 401 and deletes session when user not found in DB", async () => {
    mockDb.query.users.findFirst = vi.fn().mockResolvedValue(undefined);

    const app = createApp();
    const res = await req(app, "/api/auth/me");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("User not found");
    expect(mockSession.deleteSession).toHaveBeenCalled();
  });
});

describe("Auth routes — POST /api/auth/logout", () => {
  beforeEach(() => {
    mockSession = createAuthenticatedSession();
    mockDb = createMockDb();
  });

  it("destroys session and returns { ok: true }", async () => {
    const app = createApp();
    const res = await req(app, "/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockSession.deleteSession).toHaveBeenCalled();
  });
});

describe("Auth routes — GET /api/auth/login", () => {
  beforeEach(() => {
    mockSession = createAuthenticatedSession();
    mockDb = createMockDb();
    mockSetCookie.mockReset();
  });

  it("redirects to Spotify authorization URL", async () => {
    const app = createApp();
    const res = await req(app, "/api/auth/login");
    expect(res.status).toBe(302);
    const location = res.headers.get("Location");
    expect(location).toContain("accounts.spotify.com");
  });

  it("sets oauth_state cookie", async () => {
    const app = createApp();
    await req(app, "/api/auth/login");
    expect(mockSetCookie).toHaveBeenCalledWith(
      expect.anything(),
      "oauth_state",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      }),
    );
  });
});

describe("Auth routes — GET /api/auth/callback", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockSession = createAuthenticatedSession();
    mockDb = createMockDb({ insertData: [{ id: "new-user-id" }] });
    mockGetCookie.mockReset();
    mockSetCookie.mockReset();
    mockDeleteCookie.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 400 when code is missing", async () => {
    mockGetCookie.mockReturnValue("test-state");
    const app = createApp();
    const res = await req(app, "/api/auth/callback?state=test-state");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OAuth state");
  });

  it("returns 400 when state is missing", async () => {
    mockGetCookie.mockReturnValue("test-state");
    const app = createApp();
    const res = await req(app, "/api/auth/callback?code=test-code");
    expect(res.status).toBe(400);
  });

  it("returns 400 when state does not match cookie", async () => {
    mockGetCookie.mockReturnValue("stored-state");
    const app = createApp();
    const res = await req(
      app,
      "/api/auth/callback?code=test-code&state=wrong-state",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid OAuth state");
  });

  it("redirects to /dashboard on successful callback", async () => {
    mockGetCookie.mockReturnValue("valid-state");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "spotify_user_1",
        display_name: "Test User",
        email: "test@example.com",
        images: [{ url: "https://example.com/avatar.jpg" }],
      }),
    });

    const app = createApp();
    const res = await req(
      app,
      "/api/auth/callback?code=valid-code&state=valid-state",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/dashboard");
  });

  it("returns 500 when Spotify profile fetch fails", async () => {
    mockGetCookie.mockReturnValue("valid-state");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const app = createApp();
    const res = await req(
      app,
      "/api/auth/callback?code=valid-code&state=valid-state",
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch Spotify profile");
  });
});
