/**
 * Mock session factory matching the hono-sessions Session<SessionData> interface
 * used throughout the Hono route handlers.
 *
 * The real session stores values by string key (get/set) and supports
 * deleteSession() to clear the cookie.
 */
import { vi } from "vitest";

interface SessionData {
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: number;
}

export type MockSession = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock session with optional pre-populated data.
 *
 * Usage:
 *   const session = createMockSession({ userId: "abc", accessToken: "tok" });
 *   session.get("userId"); // "abc"
 */
export function createMockSession(data?: Partial<SessionData>): MockSession {
  const store = new Map<string, unknown>();

  if (data?.userId) store.set("userId", data.userId);
  if (data?.accessToken) store.set("accessToken", data.accessToken);
  if (data?.accessTokenExpiresAt) store.set("accessTokenExpiresAt", data.accessTokenExpiresAt);

  return {
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
    deleteSession: vi.fn(() => {
      store.clear();
    }),
  };
}

/**
 * Pre-built authenticated session for convenience.
 * Access token expires 1 hour from "now" (mocked to a fixed future date).
 */
export function createAuthenticatedSession(userId = "test-user-uuid-123"): MockSession {
  return createMockSession({
    userId,
    accessToken: "mock_access_token_valid",
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
  });
}
