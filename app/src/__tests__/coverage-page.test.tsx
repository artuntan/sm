/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import CoveragePage from "@/app/(dashboard)/coverage/page";

const mockFetch = jest.fn();
global.fetch = mockFetch;

type MockScanPostResponse = {
  scanRun: {
    status: string;
    newPostsIngested: number;
    postsFound: number;
    clustersCreated: number;
    errors: Array<{ platform: string; handle: string; error: string }>;
  };
  totalPostsInDb: number;
  scanMode: "full" | "fast";
};

function makeReport() {
  return {
    generatedAt: "2026-03-25T10:00:00.000Z",
    dateRange: { since: "2025-01-01", until: "2026-03-25" },
    totalGaps: 2,
    totalPostsInDb: 641,
    recentScans: [],
    brands: [
      {
        brand: {
          id: "brand_dimes_club",
          slug: "dimes-club",
          name: "Dimes Club",
          accountCount: 3,
          accounts: [
            {
              platform: "instagram",
              handle: "dimesclub",
              verificationStatus: "verified",
              providerPath: "meta-graph",
              lastScannedAt: null,
            },
            {
              platform: "tiktok",
              handle: "dimesclub.tr",
              verificationStatus: "verified",
              providerPath: "apify",
              lastScannedAt: null,
            },
            {
              platform: "facebook",
              handle: "dimesclub",
              verificationStatus: "verified",
              providerPath: "meta-graph",
              lastScannedAt: null,
            },
          ],
        },
        stats: {
          totalPosts: 328,
          recipePosts: 27,
          tastePosts: 79,
          specialDayPosts: 9,
          otherPosts: 213,
        },
        clusters: [],
        summary: {
          totalClusters: 2,
          eligibleClusters: 2,
          clustersWithGaps: 2,
          gapsByDestination: { facebook: 2 },
          gapsByBrand: { "dimes-club": 2 },
          coverageRate: 0,
        },
        gaps: [
          {
            clusterId: "cluster_smoothie",
            recipeName: "Smoothie Bowl",
            contentType: "recipe",
            mediaFormat: "short_video",
            firstSeenAt: "2026-03-23T10:00:00.000Z",
            sourceLink: "https://www.instagram.com/p/test-smoothie/",
            primaryCaption: "Mango smoothie bowl tarifi ve servis onerisi",
            sourcePlatforms: [
              {
                platform: "instagram",
                status: "present",
                postId: "ig_1",
                permalink: "https://www.instagram.com/p/test-smoothie/",
              },
              {
                platform: "tiktok",
                status: "present",
                postId: "tt_1",
                permalink: "https://www.tiktok.com/@dimesclub.tr/video/test-smoothie",
              },
            ],
            destinationPlatforms: [
              {
                platform: "facebook",
                status: "missing",
                postId: null,
                permalink: null,
                statusReason: "Scanned but not found",
              },
              {
                platform: "youtube",
                status: "unknown",
                postId: null,
                permalink: null,
                statusReason: "Platform not scanned",
              },
              {
                platform: "pinterest",
                status: "not_applicable",
                postId: null,
                permalink: null,
              },
            ],
            missingSourcePlatforms: [],
            missingDestinations: ["facebook"],
          },
          {
            clusterId: "cluster_limonata",
            recipeName: "Limonata",
            contentType: "taste",
            mediaFormat: "short_video",
            firstSeenAt: "2026-03-21T10:00:00.000Z",
            sourceLink: "https://www.instagram.com/p/test-limonata/",
            primaryCaption: "Ferah limonata deneyimi ve yaz kampanyasi",
            sourcePlatforms: [
              {
                platform: "instagram",
                status: "present",
                postId: "ig_2",
                permalink: "https://www.instagram.com/p/test-limonata/",
              },
              {
                platform: "tiktok",
                status: "present",
                postId: "tt_2",
                permalink: "https://www.tiktok.com/@dimesclub.tr/video/test-limonata",
              },
            ],
            destinationPlatforms: [
              {
                platform: "facebook",
                status: "missing",
                postId: null,
                permalink: null,
                statusReason: "Scanned but not found",
              },
              {
                platform: "youtube",
                status: "missing",
                postId: null,
                permalink: null,
                statusReason: "Scanned but not found",
              },
              {
                platform: "pinterest",
                status: "not_applicable",
                postId: null,
                permalink: null,
              },
            ],
            missingSourcePlatforms: [],
            missingDestinations: ["facebook", "youtube"],
          },
        ],
      },
    ],
  };
}

function installFetchMocks(options?: {
  reportOverride?: ReturnType<typeof makeReport>;
  scanStateDate?: string | null;
  scanPostResponse?: MockScanPostResponse;
}) {
  const report = options?.reportOverride ?? makeReport();
  const scanStateDate = options?.scanStateDate ?? "2026-03-25T08:00:00.000Z";

  mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/api/dimes/report")) {
      return Promise.resolve({
        ok: true,
        json: async () => report,
      });
    }

    if (url.includes("/api/dimes/scan") && method === "GET") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          config: {},
          history: [],
          accountScanStates: scanStateDate
            ? [{ lastSuccessfulScanAt: scanStateDate }]
            : [],
        }),
      });
    }

    if (url.includes("/api/dimes/scan") && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () =>
          options?.scanPostResponse ?? {
            scanRun: {
              status: "complete",
              newPostsIngested: 12,
              postsFound: 15,
              clustersCreated: 654,
              errors: [],
            },
            totalPostsInDb: 653,
            scanMode: "fast",
          },
      });
    }

    return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
  });
}

describe("CoveragePage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("removes demo controls and renders a content search bar", async () => {
    installFetchMocks();
    render(<CoveragePage />);

    expect(
      await screen.findByRole("searchbox", {
        name: /search content/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /demo data/i })
    ).not.toBeInTheDocument();
  });

  it("filters visible content rows with the search bar", async () => {
    const user = userEvent.setup();
    installFetchMocks();
    render(<CoveragePage />);

    expect(await screen.findByText("Smoothie Bowl")).toBeInTheDocument();
    expect(screen.getByText("Limonata")).toBeInTheDocument();

    const searchInput = screen.getByRole("searchbox", {
      name: /search content/i,
    });
    await user.type(searchInput, "smoothie");

    await waitFor(() => {
      expect(screen.getByText("Smoothie Bowl")).toBeInTheDocument();
      expect(screen.queryByText("Limonata")).not.toBeInTheDocument();
    });
  });

  it("renders a product-style scan notice instead of raw terminal text", async () => {
    const user = userEvent.setup();
    installFetchMocks({
      scanPostResponse: {
        scanRun: {
          status: "partial",
          newPostsIngested: 918,
          postsFound: 918,
          clustersCreated: 654,
          errors: [
            {
              platform: "facebook",
              handle: "dimesclub",
              error: "Meta API rate limit",
            },
          ],
        },
        totalPostsInDb: 1559,
        scanMode: "fast",
      },
    });

    render(<CoveragePage />);

    const fastScanButton = await screen.findByRole("button", {
      name: /fast scan/i,
    });
    await user.click(fastScanButton);

    expect(
      await screen.findByText(/fast scan completed with provider issues/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/918 new posts added/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/\[PARTIAL SUCCESS\] \[FAST\]/i)
    ).not.toBeInTheDocument();
  });
});
