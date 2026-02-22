/**
 * Factory for creating minimal Hono-compatible context objects for testing
 * route handlers directly (without spinning up a full Hono server).
 */
import { vi } from "vitest";
import { createMockSession, type MockSession } from "./session";
import { createMockDb, type MockDb } from "./db";
import type { Env } from "../../server/types";

// ---------------------------------------------------------------------------
// Default env bindings for tests
// ---------------------------------------------------------------------------

export const mockEnv: Env = {
  DATABASE_URL: "postgres://test:test@localhost:5432/strata_test",
  SPOTIFY_CLIENT_ID: "mock_spotify_client_id",
  SPOTIFY_CLIENT_SECRET: "mock_spotify_client_secret",
  SESSION_ENCRYPTION_KEY: "a]vxd!bRzQE3p6kEJnaGHx#UPc5ts8Wj", // 32 chars
  ENVIRONMENT: "test",
};

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

export interface MockContextOptions {
  /** Override environment bindings. */
  env?: Partial<Env>;
  /** Pre-populated session data. */
  session?: MockSession;
  /** URL query parameters. */
  query?: Record<string, string>;
  /** JSON request body. */
  body?: unknown;
  /** HTTP method (defaults to "GET"). */
  method?: string;
  /** URL path (defaults to "/"). */
  path?: string;
  /** Request headers. */
  headers?: Record<string, string>;
  /** Mock database instance. */
  db?: MockDb;
}

export interface MockContext {
  env: Env;
  req: {
    query: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    param: ReturnType<typeof vi.fn>;
    header: ReturnType<typeof vi.fn>;
    raw: Request;
  };
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  /** The mock session attached to this context. */
  session: MockSession;
  /** The mock database attached to this context. */
  db: MockDb;
}

/**
 * Build a mock Hono context for unit-testing individual route handlers.
 *
 * Usage:
 *   const ctx = createMockContext({ query: { artistName: "Radiohead" } });
 *   await handler(ctx as any, mockNext);
 *   expect(ctx.json).toHaveBeenCalledWith(expect.objectContaining({ data: ... }));
 */
export function createMockContext(options: MockContextOptions = {}): MockContext {
  const env = { ...mockEnv, ...options.env };
  const session = options.session ?? createMockSession();
  const db = options.db ?? createMockDb();

  const queryParams = options.query ?? {};
  const url = new URL(options.path ?? "/", "http://localhost");
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }

  const rawRequest = new Request(url.toString(), {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body && options.method !== "GET" ? JSON.stringify(options.body) : undefined,
  });

  // Context variable store (session, etc.)
  const contextStore = new Map<string, unknown>();
  contextStore.set("session", session);

  const ctx: MockContext = {
    env,
    req: {
      query: vi.fn((key: string) => queryParams[key]),
      json: vi.fn(async () => options.body),
      param: vi.fn((key: string) => {
        // Extract from URL path segments or return undefined
        return undefined as string | undefined;
      }),
      header: vi.fn((key: string) => options.headers?.[key]),
      raw: rawRequest,
    },
    get: vi.fn((key: string) => contextStore.get(key)),
    set: vi.fn((key: string, value: unknown) => contextStore.set(key, value)),
    json: vi.fn((data: unknown, status?: number) => {
      return new Response(JSON.stringify(data), {
        status: status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
    text: vi.fn((data: string, status?: number) => {
      return new Response(data, { status: status ?? 200 });
    }),
    redirect: vi.fn((url: string, status?: number) => {
      return new Response(null, {
        status: status ?? 302,
        headers: { Location: url },
      });
    }),
    session,
    db,
  };

  return ctx;
}

/** No-op next function for middleware tests. */
export const mockNext = vi.fn(async () => {});
