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

const app = new Hono<{ Bindings: Env }>()
  .use("*", logger())
  .use("/api/*", cors())
  .use("/api/*", createSessionMiddleware())
  .route("/api/auth", auth)
  .route("/api/import", importRoutes)
  .route("/api/vault", vault)
  .route("/api/heatmap", heatmapRoutes)
  .route("/api/patterns", patterns);

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;
export type AppType = typeof app;
