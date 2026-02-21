import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SESSION_ENCRYPTION_KEY: z.string().min(32),
  ENVIRONMENT: z.enum(["development", "production"]).default("development"),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown>): ValidatedEnv {
  return envSchema.parse(env);
}
