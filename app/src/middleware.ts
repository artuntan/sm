/**
 * Next.js Middleware — Rate Limiting for Auth Endpoints
 *
 * Applies rate limiting to auth endpoints (sign-in, sign-up)
 * to prevent brute force and abuse. Runs at the edge before
 * the route handler.
 */

import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter for middleware
// Note: resets on server restart. For production multi-instance,
// replace with Redis or similar.
const authAttempts = new Map<string, { count: number; resetAt: number }>();

const AUTH_RATE_LIMIT = 10; // max attempts
const AUTH_WINDOW_MS = 60_000; // per minute

function getIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit auth mutation endpoints
  if (
    request.method === "POST" &&
    (pathname.includes("/api/auth/sign-in") || pathname.includes("/api/auth/sign-up"))
  ) {
    const ip = getIp(request);
    const key = `auth:${ip}`;
    const now = Date.now();
    const entry = authAttempts.get(key);

    if (!entry || entry.resetAt < now) {
      authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    } else {
      entry.count++;
      if (entry.count > AUTH_RATE_LIMIT) {
        return NextResponse.json(
          { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait and try again." } },
          {
            status: 429,
            headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
          }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*"],
};
