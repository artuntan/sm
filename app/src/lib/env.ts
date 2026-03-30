/**
 * Environment Variable Validation
 *
 * Validates required env vars at import time.
 * Import this module early (e.g., in db/index.ts or layout.tsx) to fail fast.
 */

function requireEnv(name: string, minLength?: number): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (minLength && value.length < minLength) {
    throw new Error(
      `${name} must be at least ${minLength} characters (got ${value.length})`
    );
  }
  return value;
}

// Only validate at runtime, not during build
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

export const env = isBuild
  ? {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "",
      BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
    }
  : {
      DATABASE_URL: requireEnv("DATABASE_URL"),
      BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET", 32),
      BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
      BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
    };
