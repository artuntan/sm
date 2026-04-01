import { PgDialect } from "drizzle-orm/pg-core";
import { coveragePost } from "@/lib/db/schema";
import {
  buildDistinctPlatformsAggregation,
  parseAggregatedPlatforms,
} from "@/lib/campaigns/coverage-gap-summary";

describe("buildDistinctPlatformsAggregation", () => {
  test("uses PostgreSQL string_agg for distinct platform aggregation", () => {
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(
      buildDistinctPlatformsAggregation(coveragePost.platform)
    );

    expect(query.sql).toContain("string_agg");
    expect(query.sql).not.toContain("group_concat");
  });
});

describe("parseAggregatedPlatforms", () => {
  test("splits a comma-delimited aggregation into a platform list", () => {
    expect(parseAggregatedPlatforms("instagram,tiktok,youtube")).toEqual([
      "instagram",
      "tiktok",
      "youtube",
    ]);
  });

  test("returns an empty list for null or empty input", () => {
    expect(parseAggregatedPlatforms(null)).toEqual([]);
    expect(parseAggregatedPlatforms("")).toEqual([]);
  });
});
