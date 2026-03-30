/**
 * Tests for POST /api/analyze route — dual benchmark response.
 */

jest.mock("@/lib/auth/guards", () => ({
  requireApproved: jest.fn().mockResolvedValue({ id: "test-user", name: "Test", email: "test@test.com", systemRole: "user", approvalStatus: "approved" }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue(null),
  expensiveApiLimiter: {},
}));

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

const mockReels = [
  {
    id: "r1",
    username: "testuser",
    caption: "Hello #travel",
    timestamp: "2025-03-10T14:00:00Z",
    views: 10000,
    permalink: "https://www.instagram.com/reel/r1/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
  {
    id: "r2",
    username: "testuser",
    caption: "Beach day #summer",
    timestamp: "2025-03-09T14:00:00Z",
    views: 20000,
    permalink: "https://www.instagram.com/reel/r2/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
  {
    id: "r3",
    username: "testuser",
    caption: "Ad post *reklam",
    timestamp: "2025-03-08T14:00:00Z",
    views: 5000,
    permalink: "https://www.instagram.com/reel/r3/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
];

function mockProvider(reels = mockReels) {
  mockGetProvider.mockReturnValue({
    name: "mock",
    fetchRecentMedia: jest.fn().mockResolvedValue({
      reels,
      totalFetched: reels.length,
      source: "mock",
    }),
  });
}

describe("POST /api/analyze", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedResult.mockResolvedValue(null);
  });

  it("returns 400 for missing username", async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_USERNAME");
  });

  it("returns 400 for empty username", async () => {
    const req = makeRequest({ username: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid username format", async () => {
    const req = makeRequest({ username: "user name with spaces!!!" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_USERNAME");
  });

  it("returns dual benchmark response for valid request", async () => {
    mockProvider();
    const req = makeRequest({ username: "testuser" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.username).toBe("testuser");
    expect(body.organic).toBeDefined();
    expect(body.commercial).toBeDefined();
    // 2 organic + 1 commercial, both < 5 → partial
    expect(body.organic.sampleSize).toBe(2);
    expect(body.organic.status).toBe("partial");
    expect(body.organic.averageViews).not.toBeNull();
    expect(body.commercial.sampleSize).toBe(1);
    expect(body.commercial.status).toBe("partial");
    expect(body.commercial.averageViews).not.toBeNull();
    // Both partial but have averages → comparison available
    expect(body.comparison).not.toBeNull();
    expect(body.source).toBe("mock");
  });

  it("normalizes username before lookup", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      reels: mockReels,
      totalFetched: 3,
      source: "mock",
    });
    mockGetProvider.mockReturnValue({
      name: "mock",
      fetchRecentMedia: mockFetch,
    });

    const req = makeRequest({ username: "@TestUser" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith("testuser");
  });

  it("returns 404 when both buckets are empty", async () => {
    mockProvider([
      {
        ...mockReels[0],
        rawProductType: "FEED",
      },
    ]);

    const req = makeRequest({ username: "testuser" });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ZERO_REELS");
  });

  it("returns 200 when only commercial bucket has data (partial)", async () => {
    mockProvider([
      {
        ...mockReels[0],
        caption: "Ad content *reklam",
      },
    ]);

    const req = makeRequest({ username: "testuser" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organic.sampleSize).toBe(0);
    expect(body.commercial.sampleSize).toBe(1);
    expect(body.commercial.status).toBe("partial");
    expect(body.commercial.averageViews).not.toBeNull();
  });

  it("returns cached result if available", async () => {
    // Mock a cached ProviderResult (not AnalyzeResult)
    const cachedProviderResult = {
      items: mockReels.map((r) => ({
        ...r,
        platform: "instagram" as const,
        views: r.views,
      })),
      reels: mockReels,
      totalFetched: mockReels.length,
      source: "mock" as const,
      platform: "instagram" as const,
    };

    mockGetCachedResult.mockResolvedValue({
      result: cachedProviderResult,
      freshness: "fresh",
      fetchedAt: "2025-03-10T12:00:00Z",
      ageMs: 60000,
    });

    const req = makeRequest({ username: "testuser" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cacheHit).toBe(true);
  });

  it("handles provider errors", async () => {
    const { ProviderError } = await import("@/lib/providers/interface");
    mockGetProvider.mockReturnValue({
      name: "mock",
      fetchRecentMedia: jest.fn().mockRejectedValue(
        new ProviderError("ACCOUNT_NOT_FOUND", "Account not found", 404)
      ),
    });

    const req = makeRequest({ username: "testuser" });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });
});
