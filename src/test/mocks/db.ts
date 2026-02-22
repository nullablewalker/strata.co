/**
 * Mock factory for Drizzle ORM database client.
 *
 * Supports the fluent query builder chains used throughout the codebase:
 *   db.select().from().where().groupBy().orderBy().limit().offset()
 *   db.selectDistinct().from().where()
 *   db.insert().values().onConflictDoUpdate().returning()
 *   db.delete().where()
 *   db.query.users.findFirst()
 */
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export const mockUser = {
  id: "test-user-uuid-123",
  spotifyId: "spotify_user_1",
  displayName: "Test User",
  email: "test@example.com",
  avatarUrl: "https://example.com/avatar.jpg",
  refreshToken: "mock_refresh_token",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

export const mockListeningHistoryRow = {
  id: 1,
  userId: "test-user-uuid-123",
  trackSpotifyId: "track123",
  artistName: "Test Artist",
  trackName: "Test Track",
  albumName: "Test Album",
  msPlayed: 180000,
  playedAt: new Date("2024-06-15T10:30:00Z"),
  source: "import",
  reasonStart: "clickrow",
  reasonEnd: "trackdone",
  skipped: false,
  platform: "iOS",
  shuffle: false,
};

// ---------------------------------------------------------------------------
// Chain builder helpers
// ---------------------------------------------------------------------------

/**
 * Creates a chainable mock that resolves to `data` when awaited.
 * Every method in the chain returns the same thenable object so any
 * combination of `.from().where().groupBy()…` works.
 */
function createSelectChain<T>(data: T[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & PromiseLike<T[]> = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    // PromiseLike — allows `await db.select(…).from(…)`
    then: vi.fn((resolve?: (v: T[]) => unknown) => Promise.resolve(data).then(resolve)),
  } as never;

  // Every method returns the chain itself for fluent chaining
  for (const key of Object.keys(chain)) {
    if (key !== "then") {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }

  return chain;
}

function createInsertChain<T>(data: T[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & PromiseLike<T[]> = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
    then: vi.fn((resolve?: (v: T[]) => unknown) => Promise.resolve(data).then(resolve)),
  } as never;

  for (const key of Object.keys(chain)) {
    if (key !== "then") {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }

  return chain;
}

function createDeleteChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> & PromiseLike<void> = {
    where: vi.fn(),
    then: vi.fn((resolve?: (v: void) => unknown) => Promise.resolve(undefined).then(resolve)),
  } as never;

  for (const key of Object.keys(chain)) {
    if (key !== "then") {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }

  return chain;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MockDb {
  select: ReturnType<typeof vi.fn>;
  selectDistinct: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  query: {
    users: { findFirst: ReturnType<typeof vi.fn> };
    listeningHistory: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };
  /** Retrieve the most recently created select chain (for assertions). */
  _lastSelectChain: ReturnType<typeof createSelectChain>;
  _lastInsertChain: ReturnType<typeof createInsertChain>;
  _lastDeleteChain: ReturnType<typeof createDeleteChain>;
}

/**
 * Create a fresh mock database instance.
 *
 * Optional `defaults` let you pre-configure the data returned by each chain:
 *   createMockDb({ selectData: [row1, row2] })
 */
export function createMockDb(defaults?: {
  selectData?: unknown[];
  insertData?: unknown[];
  findFirstData?: unknown;
}): MockDb {
  let lastSelectChain = createSelectChain(defaults?.selectData ?? []);
  let lastInsertChain = createInsertChain(defaults?.insertData ?? []);
  let lastDeleteChain = createDeleteChain();

  const db: MockDb = {
    select: vi.fn(() => {
      lastSelectChain = createSelectChain(defaults?.selectData ?? []);
      db._lastSelectChain = lastSelectChain;
      return lastSelectChain;
    }),
    selectDistinct: vi.fn(() => {
      lastSelectChain = createSelectChain(defaults?.selectData ?? []);
      db._lastSelectChain = lastSelectChain;
      return lastSelectChain;
    }),
    insert: vi.fn(() => {
      lastInsertChain = createInsertChain(defaults?.insertData ?? []);
      db._lastInsertChain = lastInsertChain;
      return lastInsertChain;
    }),
    delete: vi.fn(() => {
      lastDeleteChain = createDeleteChain();
      db._lastDeleteChain = lastDeleteChain;
      return lastDeleteChain;
    }),
    query: {
      users: {
        findFirst: vi.fn().mockResolvedValue(defaults?.findFirstData ?? undefined),
      },
      listeningHistory: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    _lastSelectChain: lastSelectChain,
    _lastInsertChain: lastInsertChain,
    _lastDeleteChain: lastDeleteChain,
  };

  return db;
}
