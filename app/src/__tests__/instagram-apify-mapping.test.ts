/**
 * Regression tests: Instagram Apify provider must never present likes as views.
 *
 * Root cause (fixed): Line 201 had `item.videoViewCount ?? item.likesCount ?? null`
 * which silently injected likesCount into the canonical views field when
 * videoViewCount was missing. This invalidated the entire benchmark.
 *
 * These tests guarantee the invariant: likes ≠ views.
 */

// ---------------------------------------------------------------------------
// Helpers — we test the mapping logic by importing the provider and
// inspecting its output, but since the provider calls Apify we mock fetch.
// ---------------------------------------------------------------------------

import { InstagramApifyProvider } from "../lib/providers/instagram-apify-provider";

// Save and restore env
const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  process.env.APIFY_API_TOKEN = "test-token";
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
});

// Helper to build a mock Apify response item
function makeApifyPost(overrides: Record<string, unknown> = {}) {
  return {
    type: "post",
    id: "123456789",
    shortCode: "ABCdef",
    mediaType: "Video",
    productType: "clips",
    url: "https://www.instagram.com/reel/ABCdef/",
    caption: "test caption #kesfet",
    likesCount: 50000,
    commentsCount: 100,
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

function mockFetchWith(items: unknown[]) {
  jest.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => items,
    text: async () => JSON.stringify(items),
  } as Response);
}

// ---------------------------------------------------------------------------
// Core invariant tests
// ---------------------------------------------------------------------------

describe("Instagram Apify provider — likes-never-as-views invariant", () => {
  const provider = new InstagramApifyProvider();

  test("when videoViewCount is present, views = videoViewCount (not likes)", async () => {
    const post = makeApifyPost({
      videoViewCount: 500000,
      likesCount: 30000,
    });
    mockFetchWith([post]);

    const result = await provider.fetchRecentMedia("testuser");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].views).toBe(500000);
    expect(result.items[0].views).not.toBe(30000);
  });

  test("when videoViewCount is undefined, views = null (not likes)", async () => {
    const post = makeApifyPost({
      videoViewCount: undefined,
      likesCount: 50000,
    });
    mockFetchWith([post]);

    const result = await provider.fetchRecentMedia("testuser");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].views).toBeNull();
    // The critical assertion: views must NOT equal likesCount
    expect(result.items[0].views).not.toBe(50000);
  });

  test("when videoViewCount is null, views = null (not likes)", async () => {
    const post = makeApifyPost({
      videoViewCount: null,
      likesCount: 75000,
    });
    mockFetchWith([post]);

    const result = await provider.fetchRecentMedia("testuser");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].views).toBeNull();
    expect(result.items[0].views).not.toBe(75000);
  });

  test("when videoViewCount is 0 (legitimate zero views), views = 0", async () => {
    const post = makeApifyPost({
      videoViewCount: 0,
      likesCount: 10,
    });
    mockFetchWith([post]);

    const result = await provider.fetchRecentMedia("testuser");
    expect(result.items).toHaveLength(1);
    // Zero is a legitimate view count, should not be coerced to null or likes
    expect(result.items[0].views).toBe(0);
  });

  test("likesCount is preserved in rawMetadata but never in views", async () => {
    const post = makeApifyPost({
      videoViewCount: undefined,
      likesCount: 42000,
    });
    mockFetchWith([post]);

    const result = await provider.fetchRecentMedia("testuser");
    const item = result.items[0];

    // views must be null (videoViewCount was undefined)
    expect(item.views).toBeNull();

    // but likesCount should still be accessible in raw metadata
    expect(item.rawMetadata?.likesCount).toBe(42000);
  });
});

// ---------------------------------------------------------------------------
// Batch validation — simulates real multi-post response
// ---------------------------------------------------------------------------

describe("Instagram Apify provider — batch field mapping", () => {
  const provider = new InstagramApifyProvider();

  test("mixed batch: views only come from videoViewCount, never likesCount", async () => {
    const posts = [
      // Post with real views
      makeApifyPost({
        id: "1",
        shortCode: "POST001",
        videoViewCount: 129220,
        likesCount: 12437,
        ownerUsername: "testuser",
      }),
      // Post without views (field missing)
      makeApifyPost({
        id: "2",
        shortCode: "POST002",
        videoViewCount: undefined,
        likesCount: 55000,
        ownerUsername: "testuser",
      }),
      // Post with views = 0
      makeApifyPost({
        id: "3",
        shortCode: "POST003",
        videoViewCount: 0,
        likesCount: 100,
        ownerUsername: "testuser",
      }),
      // Post with null views
      makeApifyPost({
        id: "4",
        shortCode: "POST004",
        videoViewCount: null,
        likesCount: 200000,
        ownerUsername: "testuser",
      }),
    ];
    mockFetchWith(posts);

    const result = await provider.fetchRecentMedia("testuser");
    expect(result.items).toHaveLength(4);

    // Post 1: real views
    expect(result.items[0].views).toBe(129220);
    // Post 2: no views → null, NOT 55000
    expect(result.items[1].views).toBeNull();
    // Post 3: zero views → 0, NOT 100
    expect(result.items[2].views).toBe(0);
    // Post 4: null views → null, NOT 200000
    expect(result.items[3].views).toBeNull();

    // Global invariant: no item should have views === likesCount
    // (unless by genuine coincidence, which we've excluded in test data)
    for (const item of result.items) {
      const likes = (item.rawMetadata as Record<string, unknown>)?.likesCount as number;
      if (item.views !== null && item.views !== 0) {
        expect(item.views).not.toBe(likes);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Provider source and metadata
// ---------------------------------------------------------------------------

describe("Instagram Apify provider — source truthfulness", () => {
  const provider = new InstagramApifyProvider();

  test("source is 'instagram-apify'", async () => {
    mockFetchWith([makeApifyPost({ videoViewCount: 1000, ownerUsername: "testuser" })]);
    const result = await provider.fetchRecentMedia("testuser");
    expect(result.source).toBe("instagram-apify");
    expect(result.platform).toBe("instagram");
  });

  test("content kind maps correctly for Reels (clips)", async () => {
    mockFetchWith([
      makeApifyPost({
        productType: "clips",
        mediaType: "Video",
        videoViewCount: 5000,
        ownerUsername: "testuser",
      }),
    ]);
    const result = await provider.fetchRecentMedia("testuser");
    expect(result.items[0].contentKind).toBe("REELS");
  });

  test("Video posts with null productType are mapped to REELS (Instagram deprecated standalone Video)", async () => {
    mockFetchWith([
      makeApifyPost({
        productType: null,
        mediaType: "Video",
        videoViewCount: 129220,
        ownerUsername: "testuser",
      }),
    ]);
    const result = await provider.fetchRecentMedia("testuser");
    expect(result.items[0].contentKind).toBe("REELS");
    expect(result.items[0].views).toBe(129220);
  });
});
