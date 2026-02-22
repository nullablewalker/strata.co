/**
 * Database connection factory for Neon serverless PostgreSQL.
 *
 * Uses the HTTP-based neon driver (`@neondatabase/serverless`) rather than a
 * persistent WebSocket connection. This is the recommended approach for
 * Cloudflare Workers where each request is a short-lived isolate and
 * long-lived TCP connections are not available.
 *
 * The factory pattern (`createDb`) is used instead of a module-level singleton
 * because the DATABASE_URL comes from Cloudflare environment bindings, which
 * are only accessible at request time. Each request creates a lightweight
 * Drizzle client wrapping a single HTTP fetch to Neon's SQL endpoint.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  // Pass the full schema so Drizzle's relational query API (e.g. `db.query.*`)
  // can resolve relations and column types at runtime.
  return drizzle({ client: sql, schema });
}

// Convenience type used in route handlers and service functions
export type Database = ReturnType<typeof createDb>;
