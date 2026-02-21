import pages from "@hono/vite-cloudflare-pages";
import devServer from "@hono/vite-dev-server";
import adapter from "@hono/vite-dev-server/cloudflare";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
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
        emptyOutDir: true,
      },
    };
  }

  return {
    plugins: [
      react(),
      pages({
        entry: "src/server/index.ts",
        outputDir: "./dist",
        emptyOutDir: false,
      }),
      devServer({
        entry: "src/server/index.ts",
        adapter,
        exclude: [
          "/src/**",
          "/node_modules/**",
          "/@vite/**",
          "/@id/**",
          "/index.html",
          "/__vite_ping",
          "/favicon.ico",
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
    ssr: {
      external: ["react", "react-dom"],
    },
  };
});
