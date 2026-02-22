/**
 * Dual-mode Vite configuration for the Strata single-repo architecture.
 *
 * Two build modes produce two separate outputs that together form the
 * Cloudflare Pages deployment:
 *
 *   1. `vite build --mode client`  -> React SPA        -> dist/index.html + assets
 *   2. `vite build`  (default)     -> Hono API worker   -> dist/_worker.js
 *
 * During development, @hono/vite-dev-server serves both the SPA and the API
 * on a single port (5173), so no CORS configuration is needed.
 */

import pages from "@hono/vite-cloudflare-pages";
import devServer from "@hono/vite-dev-server";
import adapter from "@hono/vite-dev-server/cloudflare";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  // --- Client-only build (mode === "client") ---
  // Produces the static SPA assets. Run first so dist/ is populated,
  // then the default (server) build appends _worker.js without wiping dist/.
  if (mode === "client") {
    return {
      plugins: [react()],
      resolve: {
        alias: {
          "@": "/src",
          "@client": "/src/client",
          "@server": "/src/server",
          "@shared": "/src/shared",
        },
      },
      build: {
        outDir: "./dist",
        rollupOptions: {
          input: "./index.html",
        },
        emptyOutDir: true, // Clean dist/ before writing SPA assets
      },
    };
  }

  // --- Server build (default mode) + dev server ---
  return {
    plugins: [
      react(),
      // Builds Hono entry into _worker.js for Cloudflare Pages Functions.
      // emptyOutDir is false so the client assets already in dist/ are preserved.
      pages({
        entry: "src/server/index.ts",
        outputDir: "./dist",
        emptyOutDir: false,
      }),
      // Dev-only: proxies /api/* requests to the Hono server using a Cloudflare
      // Workers-compatible adapter. All other routes fall through to the SPA.
      devServer({
        entry: "src/server/index.ts",
        adapter,
        exclude: [
          /^\/(?!api\/).*/, // Only intercept /api/* paths; let Vite handle everything else
        ],
      }),
    ],
    resolve: {
      alias: {
        "@": "/src",
        "@client": "/src/client",
        "@server": "/src/server",
        "@shared": "/src/shared",
      },
    },
    server: {
      host: "127.0.0.1", // Bind to IPv4 loopback to avoid IPv6 issues on some systems
    },
    ssr: {
      // Keep React out of the SSR bundle — they're resolved at runtime from
      // node_modules during dev, avoiding duplicate React instances.
      external: ["react", "react-dom"],
    },
  };
});
