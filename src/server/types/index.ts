/**
 * Cloudflare Workers environment bindings.
 *
 * On Workers/Pages, environment variables are not available via `process.env`.
 * Instead they are injected as properties on the `env` binding object passed
 * to each request handler. Hono exposes them via `c.env`.
 *
 * These values are configured in `wrangler.toml` (non-secret) and via
 * `wrangler secret put` or the Cloudflare dashboard (secrets). During local
 * development they are loaded from `.dev.vars`.
 */
export interface Env {
  DATABASE_URL: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  // Must be at least 32 characters; used by hono-sessions CookieStore for
  // AES encryption of the session cookie payload.
  SESSION_ENCRYPTION_KEY: string;
  ENVIRONMENT: string;
}
