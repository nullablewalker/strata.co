/**
 * Drizzle Kit configuration — used by the `db:generate`, `db:migrate`,
 * `db:push`, and `db:studio` npm scripts.
 *
 * Drizzle Kit reads this file at CLI invocation time (Node, not Workers),
 * so we load .env manually with dotenv.
 */

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

export default defineConfig({
  dialect: "postgresql", // Neon is PostgreSQL-compatible
  schema: "./src/server/db/schema.ts", // Single source of truth for table definitions
  out: "./drizzle", // Generated migration SQL files land here
  dbCredentials: {
    url: process.env.DATABASE_URL!, // Neon connection string (pooled or direct)
  },
  strict: true, // Fail on destructive changes unless explicitly confirmed
  verbose: true, // Log SQL statements during migrations for easier debugging
});
