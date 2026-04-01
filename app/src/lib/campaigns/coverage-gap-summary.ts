import type { AnyColumn } from "drizzle-orm";
import { sql } from "drizzle-orm";

export function buildDistinctPlatformsAggregation(column: AnyColumn) {
  return sql<string>`string_agg(DISTINCT ${column}, ',')`;
}

export function parseAggregatedPlatforms(platforms: string | null | undefined): string[] {
  if (!platforms) {
    return [];
  }

  return platforms
    .split(",")
    .map((platform) => platform.trim())
    .filter(Boolean);
}
