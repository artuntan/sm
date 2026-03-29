/**
 * Trial reel detection regression tests.
 *
 * Tests the statistical view-count anomaly detector that identifies
 * Instagram trial Reels. Instagram trial Reels have normal captions
 * but dramatically lower views because they're shown to non-followers only.
 *
 * The Meta Business Discovery API does NOT expose `is_shared_to_feed`,
 * so view-count anomaly detection is the only available approach.
 */

import { detectTrialReels, selectDualBenchmark } from "@/lib/domain/selection";
import type { ReelItem } from "@/lib/domain/types";

function makeReel(overrides: Partial<ReelItem>): ReelItem {
  return {
    id: "reel",
    username: "testuser",
    caption: "Normal caption",
    timestamp: "2026-03-01T12:00:00Z",
    views: 500000,
    permalink: "https://instagram.com/reel/test/",
    thumbnailUrl: null,
    provider: "meta",
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectTrialReels — core detection logic
// ---------------------------------------------------------------------------

describe("detectTrialReels", () => {
  it("flags Reels with views < 2% of median", () => {
    const reels = [
      makeReel({ id: "normal1", views: 500000 }),
      makeReel({ id: "normal2", views: 600000 }),
      makeReel({ id: "normal3", views: 400000 }),
      makeReel({ id: "trial1", views: 1000 }),
      makeReel({ id: "trial2", views: 500 }),
    ];

    const flagged = detectTrialReels(reels);
    // Median = 500000, threshold = 10000
    expect(flagged.has("trial1")).toBe(true);
    expect(flagged.has("trial2")).toBe(true);
    expect(flagged.has("normal1")).toBe(false);
    expect(flagged.has("normal2")).toBe(false);
    expect(flagged.has("normal3")).toBe(false);
  });

  it("does NOT flag when median < 10K (small account)", () => {
    const reels = [
      makeReel({ id: "r1", views: 5000 }),
      makeReel({ id: "r2", views: 8000 }),
      makeReel({ id: "r3", views: 6000 }),
      makeReel({ id: "low", views: 100 }),
    ];

    const flagged = detectTrialReels(reels);
    // Median ~5500, below 10K threshold → no detection
    expect(flagged.size).toBe(0);
  });

  it("does NOT flag when not enough data (< 3 Reels)", () => {
    const reels = [
      makeReel({ id: "r1", views: 1000000 }),
      makeReel({ id: "low", views: 100 }),
    ];

    const flagged = detectTrialReels(reels);
    expect(flagged.size).toBe(0);
  });

  it("correctly handles uberkuloz-style distribution", () => {
    // Simulates the real data: median ~500K, trial reels 500-7000
    const reels = [
      makeReel({ id: "n1", views: 1020710 }),
      makeReel({ id: "n2", views: 507596 }),
      makeReel({ id: "n3", views: 497717 }),
      makeReel({ id: "n4", views: 800263 }),
      makeReel({ id: "n5", views: 4383224 }),
      makeReel({ id: "n6", views: 2199929 }),
      makeReel({ id: "n7", views: 7281845 }),
      makeReel({ id: "n8", views: 6891717 }),
      makeReel({ id: "n9", views: 240182 }),
      makeReel({ id: "n10", views: 1691719 }),
      // Trial reels — dramatically lower views
      makeReel({ id: "trial1", views: 538 }),
      makeReel({ id: "trial2", views: 1096 }),
      makeReel({ id: "trial3", views: 3860 }),
      makeReel({ id: "trial4", views: 1269 }),
      makeReel({ id: "trial5", views: 3909 }),
      makeReel({ id: "trial6", views: 2561 }),
      makeReel({ id: "trial7", views: 1283 }),
      makeReel({ id: "trial8", views: 1118 }),
      makeReel({ id: "trial9", views: 6670 }),
    ];

    const flagged = detectTrialReels(reels);

    // Most trial reels well below threshold (2% of median) should be flagged
    expect(flagged.has("trial1")).toBe(true);  // 538 views
    expect(flagged.has("trial2")).toBe(true);  // 1096 views
    expect(flagged.has("trial3")).toBe(true);  // 3860 views
    expect(flagged.has("trial4")).toBe(true);  // 1269 views
    expect(flagged.has("trial5")).toBe(true);  // 3909 views
    expect(flagged.has("trial6")).toBe(true);  // 2561 views
    expect(flagged.has("trial7")).toBe(true);  // 1283 views
    expect(flagged.has("trial8")).toBe(true);  // 1118 views
    // trial9 (6670) may be above threshold depending on median calculation
    // — that's acceptable, it's a borderline case and the threshold is conservative

    // No normal reels should be flagged
    for (let i = 1; i <= 10; i++) {
      expect(flagged.has(`n${i}`)).toBe(false);
    }
  });

  it("handles null views gracefully", () => {
    const reels = [
      makeReel({ id: "n1", views: 500000 }),
      makeReel({ id: "n2", views: 600000 }),
      makeReel({ id: "n3", views: 400000 }),
      makeReel({ id: "nullview", views: null }),
    ];

    const flagged = detectTrialReels(reels);
    expect(flagged.has("nullview")).toBe(false); // null views → not flagged
  });

  it("returns empty set for all-similar views", () => {
    const reels = [
      makeReel({ id: "r1", views: 100000 }),
      makeReel({ id: "r2", views: 110000 }),
      makeReel({ id: "r3", views: 90000 }),
      makeReel({ id: "r4", views: 105000 }),
    ];

    const flagged = detectTrialReels(reels);
    expect(flagged.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// selectDualBenchmark — pipeline integration with trial detection
// ---------------------------------------------------------------------------

describe("trial reel exclusion — pipeline integration", () => {
  it("excludes trial Reels from organic benchmark", () => {
    const reels: ReelItem[] = [
      // 6 normal organic Reels
      makeReel({ id: "org1", views: 500000, timestamp: "2026-03-10T00:00:00Z" }),
      makeReel({ id: "org2", views: 600000, timestamp: "2026-03-09T00:00:00Z" }),
      makeReel({ id: "org3", views: 550000, timestamp: "2026-03-08T00:00:00Z" }),
      makeReel({ id: "org4", views: 700000, timestamp: "2026-03-07T00:00:00Z" }),
      makeReel({ id: "org5", views: 400000, timestamp: "2026-03-06T00:00:00Z" }),
      makeReel({ id: "org6", views: 450000, timestamp: "2026-03-05T00:00:00Z" }),
      // 2 trial Reels — normal captions, extremely low views
      makeReel({ id: "trial1", views: 1000, timestamp: "2026-03-11T00:00:00Z", caption: "Regular comedy caption" }),
      makeReel({ id: "trial2", views: 500, timestamp: "2026-03-04T00:00:00Z", caption: "Another normal caption" }),
    ];

    const result = selectDualBenchmark(reels);

    expect(result.excludedTestReelCount).toBe(2);
    expect(result.organic.sampleSize).toBe(5);
    expect(result.organic.status).toBe("complete");

    const organicIds = result.organic.reels.map((r) => r.id);
    expect(organicIds).not.toContain("trial1");
    expect(organicIds).not.toContain("trial2");
  });

  it("trial Reels never contaminate average views", () => {
    const reels: ReelItem[] = [
      makeReel({ id: "org1", views: 100000, timestamp: "2026-03-10T00:00:00Z" }),
      makeReel({ id: "org2", views: 100000, timestamp: "2026-03-09T00:00:00Z" }),
      makeReel({ id: "org3", views: 100000, timestamp: "2026-03-08T00:00:00Z" }),
      makeReel({ id: "org4", views: 100000, timestamp: "2026-03-07T00:00:00Z" }),
      makeReel({ id: "org5", views: 100000, timestamp: "2026-03-06T00:00:00Z" }),
      // Trial with extremely low views — must NOT contaminate avg
      makeReel({ id: "trial", views: 10, timestamp: "2026-03-11T00:00:00Z" }),
    ];

    const result = selectDualBenchmark(reels);
    expect(result.organic.averageViews).toBe(100000);
  });

  it("backfills with later eligible Reels after trial exclusion", () => {
    const reels: ReelItem[] = [
      makeReel({ id: "org1", views: 500000, timestamp: "2026-03-10T00:00:00Z" }),
      makeReel({ id: "trial1", views: 1000, timestamp: "2026-03-09T00:00:00Z" }),
      makeReel({ id: "org2", views: 600000, timestamp: "2026-03-08T00:00:00Z" }),
      makeReel({ id: "trial2", views: 800, timestamp: "2026-03-07T00:00:00Z" }),
      makeReel({ id: "org3", views: 550000, timestamp: "2026-03-06T00:00:00Z" }),
      makeReel({ id: "org4", views: 700000, timestamp: "2026-03-05T00:00:00Z" }),
      makeReel({ id: "org5", views: 450000, timestamp: "2026-03-04T00:00:00Z" }),
      makeReel({ id: "org6", views: 400000, timestamp: "2026-03-03T00:00:00Z" }),
    ];

    const result = selectDualBenchmark(reels);

    expect(result.excludedTestReelCount).toBe(2);
    expect(result.organic.sampleSize).toBe(5);
    expect(result.organic.status).toBe("complete");

    const ids = result.organic.reels.map((r) => r.id);
    expect(ids).toEqual(["org1", "org2", "org3", "org4", "org5"]);
  });

  it("does not flag trial Reels on small accounts", () => {
    const reels: ReelItem[] = [
      makeReel({ id: "r1", views: 5000, timestamp: "2026-03-10T00:00:00Z" }),
      makeReel({ id: "r2", views: 6000, timestamp: "2026-03-09T00:00:00Z" }),
      makeReel({ id: "r3", views: 4000, timestamp: "2026-03-08T00:00:00Z" }),
      makeReel({ id: "r4", views: 5500, timestamp: "2026-03-07T00:00:00Z" }),
      makeReel({ id: "r5", views: 7000, timestamp: "2026-03-06T00:00:00Z" }),
      makeReel({ id: "low", views: 100, timestamp: "2026-03-05T00:00:00Z" }),
    ];

    const result = selectDualBenchmark(reels);
    // Median < 10K → no trial detection → all included
    expect(result.excludedTestReelCount).toBe(0);
    expect(result.organic.sampleSize).toBe(5);
  });

  it("trial detection + caption eligibility both apply", () => {
    const reels: ReelItem[] = [
      makeReel({ id: "org1", views: 500000, timestamp: "2026-03-10T00:00:00Z" }),
      makeReel({ id: "org2", views: 600000, timestamp: "2026-03-09T00:00:00Z" }),
      makeReel({ id: "org3", views: 550000, timestamp: "2026-03-08T00:00:00Z" }),
      makeReel({ id: "org4", views: 700000, timestamp: "2026-03-07T00:00:00Z" }),
      makeReel({ id: "org5", views: 400000, timestamp: "2026-03-06T00:00:00Z" }),
      // Trial reel (view anomaly)
      makeReel({ id: "trial", views: 1000, timestamp: "2026-03-11T00:00:00Z" }),
      // Caption-ineligible reel (test marker)
      makeReel({ id: "test_caption", views: 500000, caption: "test reeli deneme", timestamp: "2026-03-12T00:00:00Z" }),
    ];

    const result = selectDualBenchmark(reels);
    expect(result.excludedTestReelCount).toBe(2); // 1 trial + 1 caption
    expect(result.organic.sampleSize).toBe(5);
  });
});
