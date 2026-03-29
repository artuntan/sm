/**
 * Lightweight in-memory TTL cache for analysis results.
 * Keyed by platform + username for cross-platform support.
 */
import type { AnalyzeResult, Platform } from "./domain/types";

interface CacheEntry {
  result: AnalyzeResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getTTLSeconds(): number {
  const envTTL = process.env.RESULT_CACHE_TTL_SECONDS;
  if (envTTL) {
    const parsed = parseInt(envTTL, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 21600; // 6 hours default
}

function cacheKey(platform: Platform, username: string): string {
  return `${platform}:${username.toLowerCase()}`;
}

export function getCachedResult(
  username: string,
  platform: Platform = "instagram"
): AnalyzeResult | null {
  const key = cacheKey(platform, username);
  const entry = cache.get(key);

  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return { ...entry.result, cacheHit: true };
}

export function setCachedResult(
  username: string,
  result: AnalyzeResult,
  platform: Platform = "instagram"
): void {
  const key = cacheKey(platform, username);
  const ttlMs = getTTLSeconds() * 1000;

  cache.set(key, {
    result,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearCache(): void {
  cache.clear();
}
