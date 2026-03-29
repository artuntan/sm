/**
 * Benchmark eligibility regression tests.
 *
 * Tests the test/draft/internal Reel exclusion filter and verifies:
 * - Positive: test Reels correctly excluded
 * - Negative: real content with similar words remains eligible
 * - Pipeline: exclusion happens before classification
 * - Selection: top-5 skips excluded Reels
 */

import {
  checkBenchmarkEligibility,
  classifyBenchmarkExclusion,
} from "@/lib/domain/normalize";
import { selectDualBenchmark } from "@/lib/domain/selection";
import type { ReelItem } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// checkBenchmarkEligibility — positive exclusion cases
// ---------------------------------------------------------------------------

describe("checkBenchmarkEligibility — positive exclusions", () => {
  it("excludes: test reeli (Turkish)", () => {
    const result = checkBenchmarkEligibility("bu bir test reeli #kesfet");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("test_reel");
  });

  it("excludes: test videosu", () => {
    const result = checkBenchmarkEligibility("test videosu deneme");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("test_reel");
  });

  it("excludes: deneme reeli", () => {
    const result = checkBenchmarkEligibility("deneme reeli");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("test_reel");
  });

  it("excludes: deneme videosu", () => {
    const result = checkBenchmarkEligibility("deneme videosu yapalım");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("test_reel");
  });

  it("excludes: taslak", () => {
    const result = checkBenchmarkEligibility("taslak kaydet");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("draft_content");
  });

  it("excludes: draft", () => {
    const result = checkBenchmarkEligibility("draft version");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("draft_content");
  });

  it("excludes: bu bir test", () => {
    const result = checkBenchmarkEligibility("bu bir test sadece");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("internal_qa");
  });

  it("excludes: test 123", () => {
    const result = checkBenchmarkEligibility("test 123 deneme");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("internal_qa");
  });

  it("excludes: placeholder", () => {
    const result = checkBenchmarkEligibility("placeholder text here");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("internal_qa");
  });

  it("excludes: lorem ipsum", () => {
    const result = checkBenchmarkEligibility("Lorem ipsum dolor sit amet");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("internal_qa");
  });

  it("excludes: yanlış yükledim", () => {
    const result = checkBenchmarkEligibility("yanlış yükledim bunu");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("accidental_post");
  });

  it("excludes: silmeyi unutma", () => {
    const result = checkBenchmarkEligibility("silmeyi unutma bu videoyu");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("accidental_post");
  });

  it("excludes: ses testi", () => {
    const result = checkBenchmarkEligibility("ses testi yapıyorum");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("test_reel");
  });

  it("excludes: kamera testi", () => {
    const result = checkBenchmarkEligibility("kamera testi 📹");
    expect(result.isEligible).toBe(false);
    expect(result.ineligibilityCategory).toBe("test_reel");
  });

  it("returns matched signals", () => {
    const result = checkBenchmarkEligibility("test reeli deneme");
    expect(result.isEligible).toBe(false);
    expect(result.matchedSignals.length).toBeGreaterThan(0);
    expect(result.matchedSignals[0]).toContain("benchmark_ineligible");
  });
});

// ---------------------------------------------------------------------------
// checkBenchmarkEligibility — negative (safe) cases
// ---------------------------------------------------------------------------

describe("checkBenchmarkEligibility — safe content", () => {
  it("keeps: denedim (product review)", () => {
    const result = checkBenchmarkEligibility(
      "bu ürünü denedim ve çok beğendim! #kesfet"
    );
    expect(result.isEligible).toBe(true);
  });

  it("keeps: test ettim (product test)", () => {
    const result = checkBenchmarkEligibility(
      "yeni parfümü test ettim harika kokuyor"
    );
    expect(result.isEligible).toBe(true);
  });

  it("keeps: denemek istedim (wanted to try)", () => {
    const result = checkBenchmarkEligibility(
      "bu trendi denemek istedim sonuç şahane"
    );
    expect(result.isEligible).toBe(true);
  });

  it("keeps: deneme yanılma (trial and error)", () => {
    const result = checkBenchmarkEligibility(
      "deneme yanılma yöntemiyle öğrendik"
    );
    expect(result.isEligible).toBe(true);
  });

  it("keeps: null caption (no caption is fine)", () => {
    const result = checkBenchmarkEligibility(null);
    expect(result.isEligible).toBe(true);
  });

  it("keeps: empty string", () => {
    const result = checkBenchmarkEligibility("");
    expect(result.isEligible).toBe(true);
  });

  it("keeps: standard organic content", () => {
    const result = checkBenchmarkEligibility(
      "Bugün harika bir gün geçirdik! #vlog #istanbul"
    );
    expect(result.isEligible).toBe(true);
  });

  it("keeps: commercial content (handled by classifier)", () => {
    const result = checkBenchmarkEligibility(
      "Bu ürünü çok sevdim! İşbirliği @brandname #reklam"
    );
    expect(result.isEligible).toBe(true);
  });

  it("keeps: short caption (not a test signal)", () => {
    const result = checkBenchmarkEligibility("Görünmez kaza");
    expect(result.isEligible).toBe(true);
  });

  it("keeps: comedy caption with test-like words", () => {
    const result = checkBenchmarkEligibility(
      "Sınavdan çıkıp test sonuçlarını beklemek 😂"
    );
    expect(result.isEligible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pipeline: eligibility gate before classification
// ---------------------------------------------------------------------------

function makeReel(overrides: Partial<ReelItem>): ReelItem {
  return {
    id: "reel_test",
    username: "testuser",
    caption: null,
    timestamp: "2026-03-01T12:00:00Z",
    views: 50000,
    permalink: "https://www.instagram.com/reel/test/",
    thumbnailUrl: null,
    provider: "meta",
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
    ...overrides,
  };
}

describe("benchmark eligibility — pipeline integration", () => {
  it("excludes test Reels from organic benchmark pool", () => {
    const reels: ReelItem[] = [
      // 6 organic Reels
      makeReel({ id: "org1", caption: "Normal post 1", timestamp: "2026-03-10T12:00:00Z", views: 100000 }),
      makeReel({ id: "org2", caption: "Normal post 2", timestamp: "2026-03-09T12:00:00Z", views: 80000 }),
      makeReel({ id: "org3", caption: "Normal post 3", timestamp: "2026-03-08T12:00:00Z", views: 90000 }),
      makeReel({ id: "org4", caption: "Normal post 4", timestamp: "2026-03-07T12:00:00Z", views: 70000 }),
      makeReel({ id: "org5", caption: "Normal post 5", timestamp: "2026-03-06T12:00:00Z", views: 60000 }),
      makeReel({ id: "org6", caption: "Normal post 6", timestamp: "2026-03-05T12:00:00Z", views: 50000 }),
      // 2 test Reels that should be excluded
      makeReel({ id: "test1", caption: "test reeli deneme", timestamp: "2026-03-11T12:00:00Z", views: 100 }),
      makeReel({ id: "test2", caption: "bu bir test sadece", timestamp: "2026-03-04T12:00:00Z", views: 50 }),
    ];

    const result = selectDualBenchmark(reels);

    // Test Reels should be excluded from all pools
    expect(result.excludedTestReelCount).toBe(2);

    // Organic bucket should have exactly 5 valid Reels (from 6)
    expect(result.organic.sampleSize).toBe(5);
    expect(result.organic.status).toBe("complete");

    // No test Reel IDs in organic bucket
    const organicIds = result.organic.reels.map((r) => r.id);
    expect(organicIds).not.toContain("test1");
    expect(organicIds).not.toContain("test2");
  });

  it("does not count test Reels toward totalReelCount", () => {
    const reels: ReelItem[] = [
      makeReel({ id: "org1", caption: "Normal post", views: 100000 }),
      makeReel({ id: "test1", caption: "test reeli", views: 100 }),
    ];

    const result = selectDualBenchmark(reels);

    expect(result.totalReelCount).toBe(1);
    expect(result.excludedTestReelCount).toBe(1);
  });

  it("test exclusion before commercial classification preserves order", () => {
    const reels: ReelItem[] = [
      // Commercial Reels
      makeReel({ id: "com1", caption: "*reklam harika ürün!", timestamp: "2026-03-10T12:00:00Z", views: 200000 }),
      makeReel({ id: "com2", caption: "#işbirliği güzel koleksiyon", timestamp: "2026-03-09T12:00:00Z", views: 180000 }),
      makeReel({ id: "com3", caption: "paid partnership @brand", timestamp: "2026-03-08T12:00:00Z", views: 150000 }),
      makeReel({ id: "com4", caption: "sponsorlu içerik!", timestamp: "2026-03-07T12:00:00Z", views: 140000 }),
      makeReel({ id: "com5", caption: "*reklam yeni ürün", timestamp: "2026-03-06T12:00:00Z", views: 130000 }),
      // Test Reel with commercial markers — should still be excluded
      makeReel({ id: "test_com", caption: "test reeli *reklam deneme", timestamp: "2026-03-11T12:00:00Z", views: 100 }),
    ];

    const result = selectDualBenchmark(reels);

    // Test Reel excluded even though it has commercial markers
    expect(result.excludedTestReelCount).toBe(1);
    expect(result.commercial.sampleSize).toBe(5);
    expect(result.commercial.status).toBe("complete");

    const commercialIds = result.commercial.reels.map((r) => r.id);
    expect(commercialIds).not.toContain("test_com");
  });

  it("selection continues to deeper candidates after test exclusion", () => {
    const reels: ReelItem[] = [
      makeReel({ id: "org1", caption: "Real post 1", timestamp: "2026-03-10T12:00:00Z", views: 100000 }),
      makeReel({ id: "test1", caption: "test videosu", timestamp: "2026-03-09T12:00:00Z", views: 100 }),
      makeReel({ id: "org2", caption: "Real post 2", timestamp: "2026-03-08T12:00:00Z", views: 90000 }),
      makeReel({ id: "test2", caption: "deneme reeli", timestamp: "2026-03-07T12:00:00Z", views: 50 }),
      makeReel({ id: "org3", caption: "Real post 3", timestamp: "2026-03-06T12:00:00Z", views: 80000 }),
      makeReel({ id: "org4", caption: "Real post 4", timestamp: "2026-03-05T12:00:00Z", views: 70000 }),
      makeReel({ id: "org5", caption: "Real post 5", timestamp: "2026-03-04T12:00:00Z", views: 60000 }),
      makeReel({ id: "org6", caption: "Real post 6", timestamp: "2026-03-03T12:00:00Z", views: 50000 }),
    ];

    const result = selectDualBenchmark(reels);

    // 2 test Reels excluded
    expect(result.excludedTestReelCount).toBe(2);
    // 6 organic Reels remain → top 5 selected
    expect(result.organic.sampleSize).toBe(5);
    expect(result.organic.status).toBe("complete");

    // The 5 selected should be the newest 5 valid organic
    const ids = result.organic.reels.map((r) => r.id);
    expect(ids).toEqual(["org1", "org2", "org3", "org4", "org5"]);
  });

  it("average only includes valid benchmark-eligible Reels", () => {
    const reels: ReelItem[] = [
      makeReel({ id: "org1", caption: "Post 1", timestamp: "2026-03-10T12:00:00Z", views: 100000 }),
      makeReel({ id: "org2", caption: "Post 2", timestamp: "2026-03-09T12:00:00Z", views: 100000 }),
      makeReel({ id: "org3", caption: "Post 3", timestamp: "2026-03-08T12:00:00Z", views: 100000 }),
      makeReel({ id: "org4", caption: "Post 4", timestamp: "2026-03-07T12:00:00Z", views: 100000 }),
      makeReel({ id: "org5", caption: "Post 5", timestamp: "2026-03-06T12:00:00Z", views: 100000 }),
      // Test Reel with very low views — should not contaminate average
      makeReel({ id: "test1", caption: "test reeli", timestamp: "2026-03-11T12:00:00Z", views: 10 }),
    ];

    const result = selectDualBenchmark(reels);

    expect(result.organic.averageViews).toBe(100000);
    expect(result.excludedTestReelCount).toBe(1);
  });
});
