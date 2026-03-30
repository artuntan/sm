/**
 * Tests for platform-aware POST /api/analyze route.
 * Covers TikTok provider routing, backward compat, and platform-specific validation.
 */

jest.mock("@/lib/providers/factory", () => ({
  getProvider: jest.fn(),
}));

jest.mock("@/lib/services/scan-cache-service", () => ({
  getCachedProviderResult: jest.fn().mockResolvedValue(null),
  cacheProviderResult: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/services/media-warehouse-service", () => ({
  ingestContentItems: jest.fn().mockResolvedValue({ newItems: 0, updatedItems: 0, unchangedItems: 0, totalProcessed: 0 }),
}));

jest.mock("@/lib/services/adaptive-scan-service", () => ({
  updateScanProfile: jest.fn().mockResolvedValue({ postsPerWeek: 0, frequencyTier: "unknown", adaptiveTtlMs: 86400000 }),
  getAdaptiveTtl: jest.fn().mockResolvedValue(86400000),
}));

import { POST } from "@/app/api/analyze/route";
import { NextRequest } from "next/server";
import { getProvider } from "@/lib/providers/factory";
import { getCachedProviderResult } from "@/lib/services/scan-cache-service";
import type { Platform } from "@/lib/domain/types";

const mockGetProvider = getProvider as jest.MockedFunction<typeof getProvider>;
const mockGetCachedResult = getCachedProviderResult as jest.MockedFunction<
  typeof getCachedProviderResult
>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockTikTokItems = [
  {
    id: "tt1",
    platform: "tiktok" as Platform,
    username: "testcreator",
    caption: "Day in my life #vlog",
    timestamp: "2025-03-10T16:00:00Z",
    views: 125000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt1",
    thumbnailUrl: null,
    provider: "tiktok-mock" as const,
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: {},
  },
  {
    id: "tt2",
    platform: "tiktok" as Platform,
    username: "testcreator",
    caption: "Pasta recipe #cooking",
    timestamp: "2025-03-09T12:00:00Z",
    views: 89000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt2",
    thumbnailUrl: null,
    provider: "tiktok-mock" as const,
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: {},
  },
  {
    id: "tt3",
    platform: "tiktok" as Platform,
    username: "testcreator",
    caption: "Paid partnership #ad",
    timestamp: "2025-03-08T10:00:00Z",
    views: 210000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt3",
    thumbnailUrl: null,
    provider: "tiktok-mock" as const,
    contentKind: "VIDEO",
    commercialMetadata: {
      isPaidPartnership: true,
      isCreatorEarnsCommission: false,
      isAIGenerated: false,
    },
    rawMetadata: {},
  },
];

function mockTikTokProvider(items = mockTikTokItems) {
  mockGetProvider.mockReturnValue({
    name: "tiktok-mock",
    fetchRecentMedia: jest.fn().mockResolvedValue({
      items,
      totalFetched: items.length,
      source: "tiktok-mock",
      platform: "tiktok",
    }),
  });
}

function mockInstaProvider() {
  mockGetProvider.mockReturnValue({
    name: "mock",
    fetchRecentMedia: jest.fn().mockResolvedValue({
      items: [],
      totalFetched: 1,
      source: "mock",
      platform: "instagram",
      reels: [
        {
          id: "r1",
          username: "testuser",
          caption: "Hello",
          timestamp: "2025-03-10T14:00:00Z",
          views: 10000,
          permalink: "https://www.instagram.com/reel/r1/",
          thumbnailUrl: null,
          provider: "mock",
          rawMediaType: "VIDEO",
          rawProductType: "REELS",
        },
      ],
    }),
  });
}

describe("POST /api/analyze — platform-aware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedResult.mockResolvedValue(null);
  });

  it("accepts platform=tiktok and returns TikTok result", async () => {
    mockTikTokProvider();
    const req = makeRequest({ platform: "tiktok", username: "testcreator" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.platform).toBe("tiktok");
    expect(body.source).toBe("tiktok-mock");
    expect(body.organic).toBeDefined();
    expect(body.commercial).toBeDefined();
  });

  it("accepts platform=instagram explicitly", async () => {
    mockInstaProvider();
    const req = makeRequest({ platform: "instagram", username: "testuser" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.platform).toBe("instagram");
  });

  it("defaults to instagram when platform is omitted", async () => {
    mockInstaProvider();
    const req = makeRequest({ username: "testuser" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.platform).toBe("instagram");
  });

  it("returns 400 for invalid platform value", async () => {
    const req = makeRequest({ platform: "youtube", username: "testuser" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("TikTok classifies paid partnership from commercialMetadata", async () => {
    mockTikTokProvider();
    const req = makeRequest({ platform: "tiktok", username: "testcreator" });
    const res = await POST(req);
    const body = await res.json();

    // tt3 has isPaidPartnership = true → should be in commercial bucket
    expect(body.commercial.sampleSize).toBeGreaterThanOrEqual(1);
  });

  it("TikTok response includes limitations array", async () => {
    mockTikTokProvider();
    const req = makeRequest({ platform: "tiktok", username: "testcreator" });
    const res = await POST(req);
    const body = await res.json();

    expect(body.limitations).toBeDefined();
    expect(body.limitations.length).toBeGreaterThan(0);
    expect(body.limitations[0]).toContain("mock data");
  });

  it("returns ZERO_CONTENT for empty TikTok results", async () => {
    mockTikTokProvider([]);
    const req = makeRequest({ platform: "tiktok", username: "emptycreator" });
    const res = await POST(req);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe("ZERO_CONTENT");
  });

  it("calls getProvider with the correct platform", async () => {
    mockTikTokProvider();
    const req = makeRequest({ platform: "tiktok", username: "testcreator" });
    await POST(req);
    expect(mockGetProvider).toHaveBeenCalledWith("tiktok");
  });
});
