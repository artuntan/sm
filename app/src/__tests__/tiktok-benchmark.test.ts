/**
 * Tests for TikTok provider mapping and commercial classification.
 * Covers ContentItem mapping, video_tag extraction, and benchmark selection.
 */
import type { ContentItem, Platform } from "@/lib/domain/types";
import { selectDualBenchmarkFromItems } from "@/lib/domain/selection";

function makeTikTokItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "tt_test_1",
    platform: "tiktok" as Platform,
    username: "testcreator",
    caption: "Great video #fun",
    timestamp: "2025-03-10T16:00:00Z",
    views: 50000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_test_1",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: {},
    ...overrides,
  };
}

describe("TikTok benchmark selection", () => {
  it("classifies items with paid partnership as commercial", () => {
    const items = [
      makeTikTokItem({ id: "organic1", caption: "Fun day #vlog" }),
      makeTikTokItem({
        id: "commercial1",
        caption: "Amazing product",
        commercialMetadata: {
          isPaidPartnership: true,
          isCreatorEarnsCommission: false,
          isAIGenerated: false,
        },
      }),
    ];

    const result = selectDualBenchmarkFromItems(items, "tiktok");
    expect(result.organic.sampleSize).toBe(1);
    expect(result.commercial.sampleSize).toBe(1);
  });

  it("classifies creator-earns-commission as commercial", () => {
    const items = [
      makeTikTokItem({
        id: "affiliate1",
        caption: "Check this out",
        commercialMetadata: {
          isPaidPartnership: false,
          isCreatorEarnsCommission: true,
          isAIGenerated: false,
        },
      }),
    ];

    const result = selectDualBenchmarkFromItems(items, "tiktok");
    expect(result.commercial.sampleSize).toBe(1);
    expect(result.organic.sampleSize).toBe(0);
  });

  it("does NOT filter by contentKind for TikTok (no REELS filter)", () => {
    const items = [
      makeTikTokItem({ id: "v1", contentKind: "VIDEO" }),
      makeTikTokItem({ id: "v2", contentKind: "LIVE" }),
      makeTikTokItem({ id: "v3", contentKind: null }),
    ];

    const result = selectDualBenchmarkFromItems(items, "tiktok");
    // All items should pass (no REELS filter for TikTok)
    expect(result.excludedNonReelCount).toBe(0);
    expect(result.organic.sampleSize).toBe(3);
  });

  it("applies REELS filter for Instagram ContentItems", () => {
    const items = [
      makeTikTokItem({
        id: "r1",
        platform: "instagram",
        contentKind: "REELS",
        provider: "mock",
      }),
      makeTikTokItem({
        id: "f1",
        platform: "instagram",
        contentKind: "FEED",
        provider: "mock",
      }),
    ];

    const result = selectDualBenchmarkFromItems(items, "instagram");
    expect(result.excludedNonReelCount).toBe(1);
    expect(result.organic.sampleSize).toBe(1);
  });

  it("enforces exact-5 rule for TikTok", () => {
    const organic = Array.from({ length: 8 }, (_, i) =>
      makeTikTokItem({
        id: `org${i}`,
        caption: `Organic video ${i}`,
        views: 50000 + i * 1000,
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );

    const result = selectDualBenchmarkFromItems(organic, "tiktok");
    expect(result.organic.sampleSize).toBe(5);
    expect(result.organic.status).toBe("complete");
    expect(result.organic.averageViews).not.toBeNull();
  });

  it("returns partial for fewer than 5 TikTok items", () => {
    const items = [
      makeTikTokItem({ id: "v1", views: 1000 }),
      makeTikTokItem({ id: "v2", views: 2000 }),
    ];

    const result = selectDualBenchmarkFromItems(items, "tiktok");
    expect(result.organic.status).toBe("partial");
    expect(result.organic.averageViews).toBe(1500); // averages computed for any non-empty
  });

  it("sorts TikTok items newest first", () => {
    const items = [
      makeTikTokItem({ id: "old", timestamp: "2025-01-01T00:00:00Z", caption: "Old video" }),
      makeTikTokItem({ id: "new", timestamp: "2025-03-10T00:00:00Z", caption: "New video" }),
      makeTikTokItem({ id: "mid", timestamp: "2025-02-15T00:00:00Z", caption: "Mid video" }),
    ];

    const result = selectDualBenchmarkFromItems(items, "tiktok");
    expect(result.organic.reels.map((r) => r.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("excludes test content from TikTok benchmark", () => {
    const items = [
      makeTikTokItem({ id: "v1", caption: "Normal video" }),
      makeTikTokItem({ id: "v2", caption: "test reel check" }),
      makeTikTokItem({ id: "v3", caption: "draft only for review" }),
    ];

    const result = selectDualBenchmarkFromItems(items, "tiktok");
    expect(result.organic.sampleSize).toBe(1);
    expect(result.excludedTestReelCount).toBe(2);
  });

  it("uses caption-based commercial detection as fallback for TikTok", () => {
    // When no commercialMetadata but caption has explicit disclosure
    const items = [
      makeTikTokItem({
        id: "v1",
        caption: "Great product #sponsored #ad",
        commercialMetadata: null,
      }),
    ];

    const result = selectDualBenchmarkFromItems(items, "tiktok");
    expect(result.commercial.sampleSize).toBe(1);
    expect(result.organic.sampleSize).toBe(0);
  });

  it("comparison works even when TikTok commercial bucket is partial", () => {
    const organic = Array.from({ length: 5 }, (_, i) =>
      makeTikTokItem({
        id: `org${i}`,
        views: 1000,
        caption: `Organic ${i}`,
        timestamp: `2025-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    const commercial = [
      makeTikTokItem({
        id: "com0",
        views: 500,
        caption: "Ad",
        commercialMetadata: { isPaidPartnership: true },
      }),
    ];

    const result = selectDualBenchmarkFromItems(
      [...organic, ...commercial],
      "tiktok"
    );
    expect(result.organic.status).toBe("complete");
    expect(result.commercial.status).toBe("partial");
    expect(result.comparison).not.toBeNull(); // comparison available with partial
    expect(result.comparison!.delta).toBe(500); // 1000 - 500
  });
});
