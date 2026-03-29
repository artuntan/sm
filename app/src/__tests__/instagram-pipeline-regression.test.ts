/**
 * Regression tests: Instagram benchmark pipeline systemic fixes.
 *
 * Root cause: Apify actor returns each post TWICE:
 *   Copy A: productType=null,  videoViewCount=<real>
 *   Copy B: productType=clips, videoViewCount=null
 *
 * Covers:
 * - Provider deduplication by shortCode
 * - Benchmark completeness requires 5 items with numeric views
 * - No "Full benchmark" when selected items contain null views
 * - uberkuloz-style duplicate regression fixture
 */

import { InstagramApifyProvider } from "../lib/providers/instagram-apify-provider";
import {
  selectDualBenchmarkFromItems,
  calculateAverageViews,
} from "../lib/domain/selection";
import type { ContentItem } from "../lib/domain/types";

// Save and restore env
const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  process.env.APIFY_API_TOKEN = "test-token";
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Apify response item (raw actor output shape) */
function makeApifyPost(overrides: Record<string, unknown> = {}) {
  return {
    type: "post",
    id: "100000001",
    shortCode: "ABC001",
    mediaType: "Video",
    productType: null as string | null,
    url: "https://www.instagram.com/p/ABC001/",
    caption: "test caption",
    likesCount: 10000,
    commentsCount: 50,
    displayUrl: "https://example.com/thumb.jpg",
    images: [],
    timestamp: "2026-03-13T15:00:00.000Z",
    ownerUsername: "testuser",
    taggedUsers: [],
    isPinned: false,
    isPaidPartnership: false,
    isCommentsDisabled: false,
    musicInfo: null,
    videoDuration: null,
    videoViewCount: undefined as number | undefined | null,
    videoPlayCount: null,
    ...overrides,
  };
}

/** Build a ContentItem directly (for selection pipeline tests) */
function makeContentItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "100000001",
    platform: "instagram",
    username: "testuser",
    caption: "test caption",
    timestamp: "2026-03-13T15:00:00.000Z",
    views: 500000,
    permalink: "https://www.instagram.com/p/ABC001/",
    provider: "instagram-apify",
    contentKind: "REELS",
    rawMetadata: { shortCode: "ABC001" },
    ...overrides,
  };
}

function mockFetchWith(items: unknown[]) {
  jest.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => items,
    text: async () => JSON.stringify(items),
  } as Response);
}

// ---------------------------------------------------------------------------
// Provider deduplication tests
// ---------------------------------------------------------------------------

describe("Instagram Apify provider — deduplication", () => {
  const provider = new InstagramApifyProvider();

  test("duplicate shortCodes collapse to single item (prefers copy with views)", async () => {
    // Reproduce exact Apify behavior: same post, two copies
    const copyA = makeApifyPost({
      id: "3837550769901553767",
      shortCode: "DVBuBfPgkhn",
      productType: null,
      videoViewCount: 1892247,
      likesCount: 21190,
      ownerUsername: "testuser",
    });
    const copyB = makeApifyPost({
      id: "3837550769901553767",
      shortCode: "DVBuBfPgkhn",
      productType: "clips",
      videoViewCount: null,
      likesCount: 27486,
      ownerUsername: "testuser",
    });
    mockFetchWith([copyA, copyB]);

    const result = await provider.fetchRecentMedia("testuser");
    // Should be 1 item, not 2
    expect(result.items).toHaveLength(1);
    // Should have real views (from Copy A)
    expect(result.items[0].views).toBe(1892247);
  });

  test("uberkuloz-style: 25 raw items (13 unique, 12 duplicated) collapse correctly", async () => {
    // Build 13 unique posts, 12 of them duplicated = 25 total items
    const items: unknown[] = [];
    for (let i = 1; i <= 13; i++) {
      const id = `30000000000000000${i.toString().padStart(2, "0")}`;
      const shortCode = `SC${i.toString().padStart(3, "0")}`;
      const views = i * 100000;

      // Copy A: has views, null productType
      items.push(
        makeApifyPost({
          id,
          shortCode,
          productType: null,
          videoViewCount: views,
          likesCount: i * 1000,
          ownerUsername: "uberkuloz",
          timestamp: `2026-03-${(14 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        })
      );

      // Copy B: no views, clips productType (skip last one to get 12 dupes)
      if (i <= 12) {
        items.push(
          makeApifyPost({
            id,
            shortCode,
            productType: "clips",
            videoViewCount: null,
            likesCount: i * 1000,
            ownerUsername: "uberkuloz",
            timestamp: `2026-03-${(14 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
          })
        );
      }
    }

    mockFetchWith(items);
    const result = await provider.fetchRecentMedia("uberkuloz");

    // Should be 13 unique items, not 25
    expect(result.items).toHaveLength(13);
    // All should have real views (Copy A preferred)
    for (const item of result.items) {
      expect(typeof item.views).toBe("number");
      expect(item.views).toBeGreaterThan(0);
    }
  });

  test("when both copies lack views, keeps one copy (no duplication)", async () => {
    const copyA = makeApifyPost({
      shortCode: "NOVIEWS1",
      productType: null,
      videoViewCount: undefined,
      ownerUsername: "testuser",
    });
    const copyB = makeApifyPost({
      shortCode: "NOVIEWS1",
      productType: "clips",
      videoViewCount: null,
      ownerUsername: "testuser",
    });
    mockFetchWith([copyA, copyB]);

    const result = await provider.fetchRecentMedia("testuser");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].views).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Benchmark validity tests
// ---------------------------------------------------------------------------

describe("Benchmark validity — views-based completeness", () => {
  test("5 items all with numeric views → status: complete", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        views: (i + 1) * 100000,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    expect(result.organic.status).toBe("complete");
    expect(result.organic.averageViews).toBeGreaterThan(0);
  });

  test("5 items but only 3 with numeric views → status: partial (averages computed)", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        views: i < 3 ? (i + 1) * 100000 : null,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    expect(result.organic.status).toBe("partial");
    expect(result.organic.averageViews).not.toBeNull(); // averages computed for non-empty
  });

  test("7 items with 5 having views → status: complete (top 5 eligible)", () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        views: i < 5 ? (i + 1) * 100000 : null,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    // After top-5 selection, the first 5 items (which have views) should be selected
    expect(result.organic.status).toBe("complete");
  });

  test("null-view items do not inflate sample to reach complete status", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        views: i % 3 === 0 ? (i + 1) * 50000 : null,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    // Only items 0, 3, 6, 9 have views = 4 items → partial
    expect(result.organic.status).toBe("partial");
  });
});

// ---------------------------------------------------------------------------
// Average calculation safety
// ---------------------------------------------------------------------------

describe("calculateAverageViews — null-view safety", () => {
  test("items with null views produce warnings and are excluded", () => {
    const items = [
      makeContentItem({ id: "a", views: 100000 }),
      makeContentItem({ id: "b", views: null }),
      makeContentItem({ id: "c", views: 200000 }),
    ];
    const { averageViews, warnings } = calculateAverageViews(items);
    expect(averageViews).toBe(150000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("b");
  });

  test("all null views → averageViews is null", () => {
    const items = [
      makeContentItem({ id: "a", views: null }),
      makeContentItem({ id: "b", views: null }),
    ];
    const { averageViews } = calculateAverageViews(items);
    expect(averageViews).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Caption completeness enforcement (Instagram)
// ---------------------------------------------------------------------------

describe("Instagram benchmark — caption completeness enforcement", () => {
  test("5 Instagram items with views but no captions → partial", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        views: (i + 1) * 200000,
        caption: null,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    expect(result.organic.status).toBe("partial");
    expect(result.organic.averageViews).not.toBeNull(); // averages still computed
  });

  test("5 Instagram items with views and captions → complete", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        views: (i + 1) * 200000,
        caption: `Real caption #${i}`,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    expect(result.organic.status).toBe("complete");
    expect(result.organic.averageViews).toBeGreaterThan(0);
  });

  test("7 Instagram items: 5 with views+caption, 2 with views only → complete (enough valid)", () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        views: (i + 1) * 100000,
        caption: i < 5 ? `Caption ${i}` : null,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    // First 5 items (newest) get selected into organic; they all have captions
    expect(result.organic.status).toBe("complete");
  });

  test("missing captions produce warning about classification blindness", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        views: (i + 1) * 200000,
        caption: i < 2 ? `Real caption ${i}` : null,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    expect(result.organic.status).toBe("partial");
    const captionWarning = result.organic.warnings.find(
      (w) => w.includes("missing captions")
    );
    expect(captionWarning).toBeDefined();
  });

  test("TikTok benchmark is NOT affected by caption completeness", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeContentItem({
        id: `item-${i}`,
        platform: "tiktok",
        views: (i + 1) * 200000,
        caption: null,
        contentKind: "VIDEO",
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `SC${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "tiktok");
    // TikTok uses provider metadata for commercial detection, not captions
    expect(result.organic.status).toBe("complete");
    expect(result.organic.averageViews).toBeGreaterThan(0);
  });

  test("pelinayigit-style: 9 unique videos, 9 with views, only 4 with captions → partial", () => {
    // Simulates the real @pelinayigit case where 64% of captions are missing
    const items = Array.from({ length: 9 }, (_, i) =>
      makeContentItem({
        id: `pelin-${i}`,
        views: [751594, 123334, 672794, 174340, 280595, 83582, 1662861, 403317, 138461][i],
        // Only 4 items have captions (matching real data)
        caption: i === 2 ? "Her halimizle biziz" :
                 i === 3 ? "pov: she's not mad" :
                 i === 7 ? "@hepsiburada x @samsungturkiye" :
                 i === 8 ? "Koşu + güç + yarış enerjisi" : null,
        timestamp: `2026-03-${(13 - i).toString().padStart(2, "0")}T12:00:00.000Z`,
        rawMetadata: { shortCode: `PELIN${i}` },
      })
    );
    const result = selectDualBenchmarkFromItems(items, "instagram");
    // Should be partial: only 4 items have both views+caption
    expect(result.organic.status).toBe("partial");
    expect(result.organic.averageViews).not.toBeNull(); // averages still computed
  });
});
