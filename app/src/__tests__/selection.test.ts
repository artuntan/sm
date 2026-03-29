import type { ReelItem, BenchmarkStatus } from "@/lib/domain/types";
import {
  selectDualBenchmark,
  selectEligibleReels,
  calculateAverageViews,
  calculateComparison,
} from "@/lib/domain/selection";

function makeReel(overrides: Partial<ReelItem> = {}): ReelItem {
  return {
    id: "reel_1",
    username: "testuser",
    caption: "Test caption #travel",
    timestamp: "2025-03-10T14:00:00Z",
    views: 10000,
    permalink: "https://www.instagram.com/reel/test/",
    thumbnailUrl: null,
    provider: "mock",
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// selectDualBenchmark
// ---------------------------------------------------------------------------
describe("selectDualBenchmark", () => {
  it("partitions organic and commercial Reels", () => {
    const items = [
      makeReel({ id: "organic1", caption: "Normal #travel" }),
      makeReel({ id: "commercial1", caption: "Sponsored #işbirliği" }),
      makeReel({ id: "organic2", caption: "Another day #fun" }),
    ];
    const result = selectDualBenchmark(items);
    expect(result.organic.sampleSize).toBe(2);
    expect(result.commercial.sampleSize).toBe(1);
    expect(result.organic.status).toBe("partial");
    expect(result.commercial.status).toBe("partial");
    expect(result.organic.reels.every((r) => !r.isCommercial)).toBe(true);
    expect(result.commercial.reels.every((r) => r.isCommercial)).toBe(true);
  });

  it("excludes non-Reel items from both buckets", () => {
    const items = [
      makeReel({ id: "r1", rawProductType: "REELS" }),
      makeReel({ id: "feed1", rawProductType: "FEED" }),
    ];
    const result = selectDualBenchmark(items);
    expect(result.organic.sampleSize).toBe(1);
    expect(result.commercial.sampleSize).toBe(0);
    expect(result.excludedNonReelCount).toBe(1);
  });

  it("sorts newest first in organic bucket", () => {
    const items = [
      makeReel({ id: "old", timestamp: "2025-01-01T00:00:00Z" }),
      makeReel({ id: "new", timestamp: "2025-03-10T00:00:00Z" }),
      makeReel({ id: "mid", timestamp: "2025-02-15T00:00:00Z" }),
    ];
    const result = selectDualBenchmark(items);
    expect(result.organic.reels.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  it("sorts newest first in commercial bucket", () => {
    const items = [
      makeReel({
        id: "old_ad",
        timestamp: "2025-01-01T00:00:00Z",
        caption: "Old *reklam",
      }),
      makeReel({
        id: "new_ad",
        timestamp: "2025-03-10T00:00:00Z",
        caption: "New *reklam",
      }),
    ];
    const result = selectDualBenchmark(items);
    expect(result.commercial.reels.map((r) => r.id)).toEqual(["new_ad", "old_ad"]);
  });

  it("limits each bucket to 5 Reels and marks complete", () => {
    const organic = Array.from({ length: 8 }, (_, i) =>
      makeReel({
        id: `org${i}`,
        caption: `Organic post ${i}`,
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const commercial = Array.from({ length: 8 }, (_, i) =>
      makeReel({
        id: `com${i}`,
        caption: `*reklam post ${i}`,
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const result = selectDualBenchmark([...organic, ...commercial]);
    expect(result.organic.sampleSize).toBe(5);
    expect(result.organic.status).toBe("complete");
    expect(result.commercial.sampleSize).toBe(5);
    expect(result.commercial.status).toBe("complete");
  });

  it("handles fewer than 5 in a bucket as partial", () => {
    const items = [
      makeReel({ id: "r1", caption: "Organic" }),
      makeReel({ id: "r2", caption: "Sponsored #isbirligi" }),
    ];
    const result = selectDualBenchmark(items);
    expect(result.organic.sampleSize).toBe(1);
    expect(result.organic.status).toBe("partial");
    expect(result.organic.averageViews).not.toBeNull(); // averages computed for any non-empty bucket
    expect(result.commercial.sampleSize).toBe(1);
    expect(result.commercial.status).toBe("partial");
    expect(result.commercial.averageViews).not.toBeNull();
    expect(result.organic.maxSampleSize).toBe(5);
  });

  it("handles empty input", () => {
    const result = selectDualBenchmark([]);
    expect(result.organic.sampleSize).toBe(0);
    expect(result.organic.status).toBe("empty");
    expect(result.commercial.sampleSize).toBe(0);
    expect(result.commercial.status).toBe("empty");
    expect(result.totalReelCount).toBe(0);
  });

  it("attaches classification signals to commercial Reels", () => {
    const items = [
      makeReel({ id: "r1", caption: "Sponsored #işbirliği" }),
    ];
    const result = selectDualBenchmark(items);
    const reel = result.commercial.reels[0];
    expect(reel.isCommercial).toBe(true);
    expect(reel.classificationCategory).toBe("explicit_disclosure");
    expect(reel.matchedSignals.length).toBeGreaterThan(0);
  });

  it("computes averageViews for any non-empty bucket", () => {
    // With < 5 items, averages are still computed (new policy)
    const fewItems = [
      makeReel({ id: "org1", views: 100, caption: "Organic" }),
      makeReel({ id: "org2", views: 200, caption: "Organic 2" }),
      makeReel({ id: "com1", views: 500, caption: "*reklam" }),
    ];
    const fewResult = selectDualBenchmark(fewItems);
    expect(fewResult.organic.averageViews).toBe(150); // (100+200)/2
    expect(fewResult.commercial.averageViews).toBe(500);

    // With >= 5 items, averageViews is computed with full confidence
    const manyOrganic = Array.from({ length: 5 }, (_, i) =>
      makeReel({
        id: `org${i}`,
        views: 1000 * (i + 1),
        caption: `Organic ${i}`,
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const manyResult = selectDualBenchmark(manyOrganic);
    expect(manyResult.organic.status).toBe("complete");
    expect(manyResult.organic.averageViews).toBe(3000); // (1000+2000+3000+4000+5000)/5
  });

  it("comparison works when both buckets have averages (even partial)", () => {
    // 1 organic + 1 commercial → both partial but averages exist → comparison available
    const items = [
      makeReel({ id: "org1", views: 1000, caption: "Organic" }),
      makeReel({ id: "com1", views: 800, caption: "*reklam" }),
    ];
    const result = selectDualBenchmark(items);
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.delta).toBe(200);
  });

  it("calculates comparison when both buckets are complete", () => {
    const organic = Array.from({ length: 5 }, (_, i) =>
      makeReel({
        id: `org${i}`,
        views: 1000,
        caption: `Organic ${i}`,
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const commercial = Array.from({ length: 5 }, (_, i) =>
      makeReel({
        id: `com${i}`,
        views: 800,
        caption: `*reklam ${i}`,
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const result = selectDualBenchmark([...organic, ...commercial]);
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.delta).toBe(200);
    expect(result.comparison!.adToOrganicRatio).toBe(0.8);
    expect(result.comparison!.strongerBucket).toBe("organic");
  });

  it("comparison works even when commercial bucket is partial", () => {
    const organic = Array.from({ length: 5 }, (_, i) =>
      makeReel({
        id: `org${i}`,
        views: 1000,
        caption: `Organic ${i}`,
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const commercial = [
      makeReel({ id: "com0", views: 500, caption: "*reklam only one" }),
    ];
    const result = selectDualBenchmark([...organic, ...commercial]);
    expect(result.organic.status).toBe("complete");
    expect(result.commercial.status).toBe("partial");
    expect(result.comparison).not.toBeNull(); // comparison available with partial
    expect(result.comparison!.delta).toBe(500); // 1000 - 500
  });

  it("tracks totalReelCount correctly", () => {
    const items = [
      makeReel({ id: "r1", caption: "Organic" }),
      makeReel({ id: "r2", caption: "*reklam" }),
      makeReel({ id: "r3", rawProductType: "FEED" }),
    ];
    const result = selectDualBenchmark(items);
    expect(result.totalReelCount).toBe(2); // only REELS count
    expect(result.excludedNonReelCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// calculateComparison
// ---------------------------------------------------------------------------
describe("calculateComparison", () => {
  const makeBucket = (avg: number | null, size: number) => ({
    status: (size >= 5 ? "complete" : size > 0 ? "partial" : "empty") as BenchmarkStatus,
    averageViews: avg,
    sampleSize: size,
    maxSampleSize: 5,
    reels: [] as any[],
    warnings: [] as string[],
  });

  it("returns null if organic has no data", () => {
    expect(calculateComparison(makeBucket(null, 0), makeBucket(100, 1))).toBeNull();
  });

  it("returns null if commercial has no data", () => {
    expect(calculateComparison(makeBucket(100, 1), makeBucket(null, 0))).toBeNull();
  });

  it("calculates correct metrics", () => {
    const result = calculateComparison(makeBucket(1000, 5), makeBucket(500, 3));
    expect(result).not.toBeNull();
    expect(result!.delta).toBe(500);
    expect(result!.adToOrganicRatio).toBe(0.5);
    expect(result!.strongerBucket).toBe("organic");
  });

  it("detects commercial stronger", () => {
    const result = calculateComparison(makeBucket(400, 2), makeBucket(600, 3));
    expect(result!.strongerBucket).toBe("commercial");
    expect(result!.delta).toBe(-200);
  });

  it("detects equal", () => {
    const result = calculateComparison(makeBucket(500, 3), makeBucket(500, 2));
    expect(result!.strongerBucket).toBe("equal");
    expect(result!.delta).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateAverageViews
// ---------------------------------------------------------------------------
describe("calculateAverageViews", () => {
  it("calculates average from numeric views", () => {
    const reels = [
      makeReel({ views: 100 }),
      makeReel({ views: 200 }),
      makeReel({ views: 300 }),
    ];
    const { averageViews, warnings } = calculateAverageViews(reels);
    expect(averageViews).toBe(200);
    expect(warnings).toHaveLength(0);
  });

  it("skips null views and adds warning", () => {
    const reels = [
      makeReel({ id: "r1", views: 100 }),
      makeReel({ id: "r2", views: null }),
    ];
    const { averageViews, warnings } = calculateAverageViews(reels);
    expect(averageViews).toBe(100);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("r2");
  });

  it("returns null when all views are null", () => {
    const reels = [
      makeReel({ id: "r1", views: null }),
      makeReel({ id: "r2", views: null }),
    ];
    const { averageViews } = calculateAverageViews(reels);
    expect(averageViews).toBeNull();
  });

  it("returns null for empty array", () => {
    const { averageViews } = calculateAverageViews([]);
    expect(averageViews).toBeNull();
  });

  it("rounds to nearest integer", () => {
    const reels = [
      makeReel({ views: 101 }),
      makeReel({ views: 200 }),
    ];
    const { averageViews } = calculateAverageViews(reels);
    expect(averageViews).toBe(151);
  });
});

// ---------------------------------------------------------------------------
// Legacy selectEligibleReels
// ---------------------------------------------------------------------------
describe("selectEligibleReels (legacy)", () => {
  it("returns organic Reels and sponsored count", () => {
    const items = [
      makeReel({ id: "r1", caption: "Normal #travel" }),
      makeReel({ id: "r2", caption: "Sponsored #işbirliği" }),
    ];
    const result = selectEligibleReels(items);
    expect(result.eligible).toHaveLength(1);
    expect(result.excludedSponsoredCount).toBe(1);
  });
});
