/**
 * Hono API entry point for Strata.
 *
 * This file wires together all middleware and route modules. In production the
 * compiled output lives at `dist/_worker.js` and runs on Cloudflare Pages
 * Functions. During development, `@hono/vite-dev-server` serves both this API
 * and the React SPA on a single port (5173).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./types";
import { createSessionMiddleware } from "./middleware/session";
import auth from "./routes/auth";
import importRoutes from "./routes/import";
import vault from "./routes/vault";
import heatmapRoutes from "./routes/heatmap";
import patterns from "./routes/patterns";
import strataRoutes from "./routes/strata";

const app = new Hono<{ Bindings: Env }>()
  // Request logging on all routes (non-API static asset requests included)
  .use("*", logger())
  // CORS and encrypted-cookie sessions are scoped to /api/* only, so static
  // asset serving by Cloudflare Pages is unaffected.
  .use("/api/*", cors())
  .use("/api/*", createSessionMiddleware())
  // --- Feature routes ---
  .route("/api/auth", auth)
  .route("/api/import", importRoutes)
  .route("/api/vault", vault)
  .route("/api/heatmap", heatmapRoutes)
  .route("/api/patterns", patterns)
  .route("/api/strata", strataRoutes);

// Simple liveness probe — no auth required, useful for uptime monitoring
app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;

// Exported so the client-side fetch wrapper (`src/client/lib/api.ts`) can
// derive end-to-end type safety from the route definitions.
export type AppType = typeof app;
