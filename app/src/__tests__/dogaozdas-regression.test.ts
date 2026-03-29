/**
 * dogaozdas regression test suite.
 *
 * Tests the full classification + selection pipeline against realistic
 * fixture data mimicking the dogaozdas profile.
 *
 * CRITICAL: The Meta Business Discovery API strips @ from mentions in
 * caption text. These fixtures use captions WITHOUT @ to match real API
 * behavior. This is the proven root cause of the missed detections.
 */

import type { ReelItem } from "@/lib/domain/types";
import { classifyBenchmarkExclusion } from "@/lib/domain/normalize";
import { selectDualBenchmark } from "@/lib/domain/selection";

// ---------------------------------------------------------------------------
// Fixture: realistic dogaozdas-style Reels
// ---------------------------------------------------------------------------

function makeFixtureReel(overrides: Partial<ReelItem>): ReelItem {
  return {
    id: "fixture_reel",
    username: "dogaozdas",
    caption: null,
    timestamp: "2026-03-01T12:00:00Z",
    views: 50000,
    permalink: "https://www.instagram.com/reel/fixture/",
    thumbnailUrl: null,
    provider: "meta",
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
    ...overrides,
  };
}

// Realistic set of Reels resembling the dogaozdas profile
const DOGAOZDAS_FIXTURE: ReelItem[] = [
  // --- Organic Reels ---
  makeFixtureReel({
    id: "org_001",
    caption: "Bugün harika bir gün! ☀️ #vlog #günlük",
    timestamp: "2026-03-12T10:00:00Z",
    views: 120000,
  }),
  makeFixtureReel({
    id: "org_002",
    caption: "Yeni saç modelim nasıl olmuş? 💇‍♀️ #sacmodeli #kesfet",
    timestamp: "2026-03-11T14:00:00Z",
    views: 95000,
  }),
  makeFixtureReel({
    id: "org_003",
    caption: "En sevdiğim cafe'de kahve keyfi ☕ #istanbul #cafe",
    timestamp: "2026-03-10T09:00:00Z",
    views: 78000,
  }),
  makeFixtureReel({
    id: "org_004",
    caption: "Workout rutinim 💪 #fitness #motivation",
    timestamp: "2026-03-09T08:00:00Z",
    views: 65000,
  }),
  makeFixtureReel({
    id: "org_005",
    caption: "Akşam yemeği tarifi 🍝 #yemek #tarif",
    timestamp: "2026-03-08T18:00:00Z",
    views: 88000,
  }),
  makeFixtureReel({
    id: "org_006",
    caption: "Gün batımı 🌅 #sunset #nature",
    timestamp: "2026-03-07T17:00:00Z",
    views: 72000,
  }),

  // --- Commercial Reels: explicit disclosure ---
  makeFixtureReel({
    id: "com_disclosure_001",
    caption:
      "düştüğümü koymadım ama şu ışıltıyı koydum 🤩 *reklam #kesfet",
    timestamp: "2026-03-06T12:00:00Z",
    views: 145000,
  }),
  makeFixtureReel({
    id: "com_disclosure_002",
    caption:
      "Bu ürünleri çok sevdim! 💄 #işbirliği #güzellik #makyaj",
    timestamp: "2026-03-04T15:00:00Z",
    views: 132000,
  }),
  makeFixtureReel({
    id: "com_disclosure_003",
    caption: "Paid partnership with @somebrand — harika koleksiyon! ✨",
    timestamp: "2026-03-02T11:00:00Z",
    views: 98000,
  }),

  // --- Commercial Reels: brand mentions (Real API has NO @ prefix) ---
  makeFixtureReel({
    id: "com_brand_nyx",
    caption:
      "BU FAR PALETİNDEN SİZE DE VAR! 🎨 nyxcosmetics_turkiye #nyxprofessionalmakeup #makyaj",
    timestamp: "2026-02-26T14:00:00Z",
    views: 110000,
  }),
  makeFixtureReel({
    id: "com_brand_loreal",
    caption:
      "en önemli adım saçlarıma olan bakım... lorealparis #kesfet #sacbakimi",
    timestamp: "2026-03-01T10:00:00Z",
    views: 155000,
  }),

  // --- Commercial Reel: brand campaign hashtag cluster ---
  makeFixtureReel({
    id: "com_campaign_cerave",
    caption: "Cilt bakım rutini ✨ #cerave #cerawardsturkiye #kesfet",
    timestamp: "2026-02-20T12:00:00Z",
    views: 95000,
  }),

  // --- Non-Reel items (should be excluded) ---
  makeFixtureReel({
    id: "photo_001",
    caption: "Beautiful photo 📸",
    timestamp: "2026-03-05T10:00:00Z",
    views: null,
    rawMediaType: "IMAGE",
    rawProductType: "FEED",
  }),
];

// ---------------------------------------------------------------------------
// Classifier regression tests
// ---------------------------------------------------------------------------

describe("dogaozdas regression — classifier", () => {
  it("classifies NYX brand mention + hashtag as commercial (WITHOUT @)", () => {
    // This is the real failing case: Meta API strips @ from mentions
    const caption =
      "BU FAR PALETİNDEN SİZE DE VAR! 🎨 nyxcosmetics_turkiye #nyxprofessionalmakeup #makyaj";
    const result = classifyBenchmarkExclusion(caption);
    expect(result.shouldExclude).toBe(true);
    expect(result.matchedSignals.length).toBeGreaterThan(0);
    expect(
      result.matchedSignals.some(
        (s) => s.includes("brand_mention") || s.includes("brand_affiliation")
      )
    ).toBe(true);
  });

  it("classifies NYX brand mention + hashtag as commercial (WITH @)", () => {
    // Also works with @, for completeness
    const caption =
      "BU FAR PALETİNDEN SİZE DE VAR! 🎨 @nyxcosmetics_turkiye #nyxprofessionalmakeup #makyaj";
    const result = classifyBenchmarkExclusion(caption);
    expect(result.shouldExclude).toBe(true);
  });

  it("classifies L'Oréal brand mention as commercial (WITHOUT @)", () => {
    // Real API behavior: no @ before lorealparis
    const caption =
      "en önemli adım saçlarıma olan bakım... lorealparis #kesfet #sacbakimi";
    const result = classifyBenchmarkExclusion(caption);
    expect(result.shouldExclude).toBe(true);
    expect(
      result.matchedSignals.some((s) => s.includes("brand_mention"))
    ).toBe(true);
  });

  it("classifies L'Oréal brand mention as commercial (WITH @)", () => {
    const caption =
      "en önemli adım saçlarıma olan bakım... @lorealparis #kesfet #sacbakimi";
    const result = classifyBenchmarkExclusion(caption);
    expect(result.shouldExclude).toBe(true);
  });

  it("classifies garnier_turkiye without @ as commercial", () => {
    const caption = "Cilt bakım favorim! garnier_turkiye #garnier #skincare";
    const result = classifyBenchmarkExclusion(caption);
    expect(result.shouldExclude).toBe(true);
    expect(
      result.matchedSignals.some((s) => s.includes("brand_mention") || s.includes("brand_affiliation"))
    ).toBe(true);
  });

  it("classifies explicit *reklam as commercial", () => {
    const result = classifyBenchmarkExclusion(
      "düştüğümü koymadım ama şu ışıltıyı koydum 🤩 *reklam #kesfet"
    );
    expect(result.shouldExclude).toBe(true);
    expect(result.exclusionCategory).toBe("explicit_disclosure");
  });

  it("classifies #işbirliği as commercial", () => {
    const result = classifyBenchmarkExclusion(
      "Bu ürünleri çok sevdim! 💄 #işbirliği #güzellik #makyaj"
    );
    expect(result.shouldExclude).toBe(true);
    expect(result.exclusionCategory).toBe("explicit_disclosure");
  });

  it("classifies paid partnership as commercial", () => {
    const result = classifyBenchmarkExclusion(
      "Paid partnership with @somebrand — harika koleksiyon! ✨"
    );
    expect(result.shouldExclude).toBe(true);
    expect(result.exclusionCategory).toBe("explicit_disclosure");
  });

  it("classifies cerave campaign hashtag cluster as commercial", () => {
    const result = classifyBenchmarkExclusion(
      "Cilt bakım rutini ✨ #cerave #cerawardsturkiye #kesfet"
    );
    expect(result.shouldExclude).toBe(true);
    expect(
      result.matchedSignals.some((s) => s.includes("brand_campaign"))
    ).toBe(true);
  });

  it("does NOT classify organic captions as commercial", () => {
    const organicCaptions = [
      "Bugün harika bir gün! ☀️ #vlog #günlük",
      "Yeni saç modelim nasıl olmuş? 💇‍♀️ #sacmodeli #kesfet",
      "En sevdiğim cafe'de kahve keyfi ☕ #istanbul #cafe",
      "Workout rutinim 💪 #fitness #motivation",
      "Akşam yemeği tarifi 🍝 #yemek #tarif",
    ];
    for (const caption of organicCaptions) {
      const result = classifyBenchmarkExclusion(caption);
      expect(result.shouldExclude).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Selection + exact-5 rule tests
// ---------------------------------------------------------------------------

describe("dogaozdas regression — selection pipeline", () => {
  it("classifies all 6 commercial Reels and 6 organic Reels correctly", () => {
    const result = selectDualBenchmark(DOGAOZDAS_FIXTURE);

    // 6 organic Reels (org_001 through org_006)
    // 6 commercial Reels (3 disclosure + nyx + loreal + cerave)
    // 1 non-Reel photo (excluded)
    expect(result.excludedNonReelCount).toBe(1);
    expect(result.totalReelCount).toBe(12);

    // Both buckets have >= 5 → both complete
    expect(result.organic.status).toBe("complete");
    expect(result.organic.sampleSize).toBe(5);
    expect(result.organic.averageViews).not.toBeNull();

    expect(result.commercial.status).toBe("complete");
    expect(result.commercial.sampleSize).toBe(5);
    expect(result.commercial.averageViews).not.toBeNull();
  });

  it("selects the newest 5 commercial Reels", () => {
    const result = selectDualBenchmark(DOGAOZDAS_FIXTURE);

    const commercialIds = result.commercial.reels.map((r) => r.id);
    // Should be sorted newest-first, taking top 5 from 6 commercial
    expect(commercialIds).toHaveLength(5);

    // The oldest commercial (cerave, Feb 20) should be excluded from top 5
    expect(commercialIds).not.toContain("com_campaign_cerave");

    // The L'Oréal and NYX ones must be included
    expect(commercialIds).toContain("com_brand_loreal");
    expect(commercialIds).toContain("com_brand_nyx");
  });

  it("includes L'Oréal and NYX Reels in the commercial bucket", () => {
    const result = selectDualBenchmark(DOGAOZDAS_FIXTURE);

    const loreelReel = result.commercial.reels.find(
      (r) => r.id === "com_brand_loreal"
    );
    const nyxReel = result.commercial.reels.find(
      (r) => r.id === "com_brand_nyx"
    );

    expect(loreelReel).toBeDefined();
    expect(loreelReel!.isCommercial).toBe(true);
    expect(loreelReel!.matchedSignals.length).toBeGreaterThan(0);

    expect(nyxReel).toBeDefined();
    expect(nyxReel!.isCommercial).toBe(true);
    expect(nyxReel!.matchedSignals.length).toBeGreaterThan(0);
  });

  it("produces comparison when both buckets are complete", () => {
    const result = selectDualBenchmark(DOGAOZDAS_FIXTURE);
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.delta).toBeDefined();
    expect(result.comparison!.adToOrganicRatio).toBeDefined();
  });

  it("computes commercial average even with fewer than 5 Reels", () => {
    // Take only 3 commercial Reels (remove nyx, loreal, cerave)
    const limitedFixture = DOGAOZDAS_FIXTURE.filter(
      (r) =>
        !["com_brand_nyx", "com_brand_loreal", "com_campaign_cerave"].includes(
          r.id
        )
    );

    const result = selectDualBenchmark(limitedFixture);

    expect(result.commercial.sampleSize).toBe(3);
    expect(result.commercial.status).toBe("partial");
    expect(result.commercial.averageViews).not.toBeNull(); // new policy: averages computed
    expect(result.comparison).not.toBeNull(); // comparison available with partial
  });

  it("still shows found Reels in partial commercial bucket", () => {
    // Only 2 commercial Reels
    const sparseFixture = DOGAOZDAS_FIXTURE.filter(
      (r) =>
        !r.id.startsWith("com_") ||
        r.id === "com_disclosure_001" ||
        r.id === "com_brand_loreal"
    );

    const result = selectDualBenchmark(sparseFixture);

    expect(result.commercial.status).toBe("partial");
    expect(result.commercial.sampleSize).toBe(2);
    expect(result.commercial.reels).toHaveLength(2);
    expect(result.commercial.averageViews).not.toBeNull(); // averages computed
    // Reels are kept for transparency
    expect(result.commercial.reels[0].isCommercial).toBe(true);
  });
});
