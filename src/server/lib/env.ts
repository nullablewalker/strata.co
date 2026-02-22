/**
 * Zod-based environment variable validation.
 *
 * On Cloudflare Workers, env vars are not available via `process.env` — they
 * are injected as the `env` binding on each request. This module provides a
 * schema that can be used to validate those bindings at the edge of the
 * request lifecycle, giving clear error messages when configuration is missing
 * or malformed rather than failing deep inside business logic.
 */

import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  // Minimum 32 chars required for AES-256 encryption used by CookieStore
  SESSION_ENCRYPTION_KEY: z.string().min(32),
  ENVIRONMENT: z.enum(["development", "production"]).default("development"),
  // New Relic — optional; omitted in local dev, set via Cloudflare secrets
  NEW_RELIC_LICENSE_KEY: z.string().min(1).optional(),
  NEW_RELIC_ACCOUNT_ID: z.string().min(1).optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Parse and validate a raw env bindings object. Throws a ZodError with
 * detailed field-level messages if validation fails.
 */
export function validateEnv(env: Record<string, unknown>): ValidatedEnv {
  return envSchema.parse(env);
}
