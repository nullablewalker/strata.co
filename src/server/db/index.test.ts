import { describe, it, expect, vi } from "vitest";

// Mock the neon driver before importing createDb
vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => vi.fn()),
}));

vi.mock("drizzle-orm/neon-http", () => ({
  drizzle: vi.fn(() => ({
    query: {},
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  })),
}));

import { createDb } from "./index";

describe("createDb", () => {
  it("returns an object", () => {
    const db = createDb("postgres://test:test@localhost:5432/testdb");
    expect(db).toBeDefined();
    expect(typeof db).toBe("object");
  });

  it("returned object has query property", () => {
    const db = createDb("postgres://test:test@localhost:5432/testdb");
    expect(db).toHaveProperty("query");
  });

  it("returned object has select method", () => {
    const db = createDb("postgres://test:test@localhost:5432/testdb");
    expect(db).toHaveProperty("select");
  });
});
