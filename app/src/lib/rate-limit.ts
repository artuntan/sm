/**
 * In-Memory Rate Limiter
 *
 * Simple sliding-window rate limiter using in-memory Map.
 * Suitable for single-instance deployments. For multi-instance (Lambda),
 * replace with Redis-backed implementation.
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
 *   const result = limiter.check(identifier);
 *   if (!result.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimiterConfig = {
  /** Max requests allowed per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

const stores = new Map<string, Map<string, RateLimitEntry>>();

// Periodic cleanup to prevent memory leak (every 5 min)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key);
    }
  }
}, 5 * 60 * 1000);

cleanupTimer.unref?.();

export function createRateLimiter(config: RateLimiterConfig) {
  const storeKey = `${config.maxRequests}:${config.windowMs}`;
  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map());
  }
  const store = stores.get(storeKey)!;

  return {
    check(identifier: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(identifier);

      if (!entry || entry.resetAt < now) {
        // New window
        store.set(identifier, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
      }

      entry.count++;
      const remaining = Math.max(0, config.maxRequests - entry.count);
      return {
        allowed: entry.count <= config.maxRequests,
        remaining,
        resetAt: entry.resetAt,
      };
    },
  };
}

/**
 * Get a stable identifier for rate limiting from the request.
 * Uses X-Forwarded-For (for proxied requests) or falls back to a generic key.
 */
export async function getRateLimitKey(prefix: string): Promise<string> {
  let ip = "unknown";

  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    ip = forwarded?.split(",")[0]?.trim() || "unknown";
  } catch {
    // Route handlers invoked directly in tests do not have a Next request scope.
    // Falling back to a shared test bucket is fine for local/unit verification.
  }

  return `${prefix}:${ip}`;
}

/**
 * Convenience: check rate limit and return 429 response if exceeded.
 * Returns null if allowed, or a NextResponse if rate limited.
 */
export async function checkRateLimit(
  limiter: ReturnType<typeof createRateLimiter>,
  prefix: string
): Promise<NextResponse | null> {
  const key = await getRateLimitKey(prefix);
  const result = limiter.check(key);

  if (!result.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return null;
}

// ── Pre-configured limiters for common use cases ──

/** Expensive operations (API calls to Apify/Meta): 20 req/min per IP */
export const expensiveApiLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

/** Auth operations (login/signup): 10 req/min per IP */
export const authLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
