import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { envSchema, validateEnv } from "./env";

/** A complete valid env object for baseline tests. */
const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/strata",
  SPOTIFY_CLIENT_ID: "abc123",
  SPOTIFY_CLIENT_SECRET: "secret456",
  SESSION_ENCRYPTION_KEY: "a]vxd!bRzQE3p6kEJnaGHx#UPc5ts8Wj", // 32 chars
  ENVIRONMENT: "development",
};

describe("envSchema", () => {
  it("accepts a valid complete env object", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it("rejects when DATABASE_URL is missing", () => {
    const { DATABASE_URL: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid DATABASE_URL format", () => {
    const result = envSchema.safeParse({ ...validEnv, DATABASE_URL: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects when SPOTIFY_CLIENT_ID is missing", () => {
    const { SPOTIFY_CLIENT_ID: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an empty string SPOTIFY_CLIENT_ID", () => {
    const result = envSchema.safeParse({ ...validEnv, SPOTIFY_CLIENT_ID: "" });
    expect(result.success).toBe(false);
  });

  it("rejects when SPOTIFY_CLIENT_SECRET is missing", () => {
    const { SPOTIFY_CLIENT_SECRET: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects SESSION_ENCRYPTION_KEY shorter than 32 chars", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      SESSION_ENCRYPTION_KEY: "tooshort",
    });
    expect(result.success).toBe(false);
  });

  it("accepts SESSION_ENCRYPTION_KEY exactly 32 chars", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      SESSION_ENCRYPTION_KEY: "12345678901234567890123456789012", // exactly 32
    });
    expect(result.success).toBe(true);
  });

  it('defaults ENVIRONMENT to "development" when omitted', () => {
    const { ENVIRONMENT: _, ...rest } = validEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ENVIRONMENT).toBe("development");
    }
  });

  it('accepts ENVIRONMENT "production"', () => {
    const result = envSchema.safeParse({ ...validEnv, ENVIRONMENT: "production" });
    expect(result.success).toBe(true);
  });

  it('rejects ENVIRONMENT "staging" (not in enum)', () => {
    const result = envSchema.safeParse({ ...validEnv, ENVIRONMENT: "staging" });
    expect(result.success).toBe(false);
  });
});

describe("validateEnv", () => {
  it("throws ZodError on invalid input", () => {
    expect(() => validateEnv({})).toThrow(ZodError);
  });

  it("returns validated env for valid input", () => {
    const result = validateEnv(validEnv);
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.SPOTIFY_CLIENT_ID).toBe(validEnv.SPOTIFY_CLIENT_ID);
  });
});
