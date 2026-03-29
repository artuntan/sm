/**
 * Mock Instagram provider for local development.
 * Returns realistic fixture data when live Meta credentials are unavailable.
 */
import type { ReelItem, ContentItem, ProviderResult } from "../domain/types";
import type { PlatformProvider } from "./interface";

const MOCK_REELS: ReelItem[] = [
  {
    id: "mock_reel_001",
    username: "testuser",
    caption:
      "Exploring the streets of Istanbul 🇹🇷 #travel #istanbul #explore",
    timestamp: "2025-03-10T14:30:00+0000",
    views: 45200,
    permalink: "https://www.instagram.com/reel/mock_001/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
  {
    id: "mock_reel_002",
    username: "testuser",
    caption: "Morning routine ☀️ #lifestyle #morningroutine",
    timestamp: "2025-03-08T09:15:00+0000",
    views: 32100,
    permalink: "https://www.instagram.com/reel/mock_002/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
  {
    id: "mock_reel_003",
    username: "testuser",
    caption: "Best coffee spots in the city ☕ #coffee #cityguide",
    timestamp: "2025-03-06T16:45:00+0000",
    views: 28750,
    permalink: "https://www.instagram.com/reel/mock_003/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
  {
    id: "mock_reel_004",
    username: "testuser",
    caption: "Sponsored collab! #işbirliği #ad #beauty",
    timestamp: "2025-03-05T11:00:00+0000",
    views: 67800,
    permalink: "https://www.instagram.com/reel/mock_004/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
  {
    id: "mock_reel_005",
    username: "testuser",
    caption: "Sunset vibes 🌅 #sunset #nature #peaceful",
    timestamp: "2025-03-04T18:20:00+0000",
    views: 51300,
    permalink: "https://www.instagram.com/reel/mock_005/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
  {
    id: "mock_reel_006",
    username: "testuser",
    caption: "Cooking at home 🍝 #homecooking #pasta #recipe",
    timestamp: "2025-03-02T12:00:00+0000",
    views: 19500,
    permalink: "https://www.instagram.com/reel/mock_006/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
  {
    id: "mock_photo_001",
    username: "testuser",
    caption: "A photo post 📸",
    timestamp: "2025-03-01T10:00:00+0000",
    views: null,
    permalink: "https://www.instagram.com/p/mock_photo_001/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "IMAGE",
    rawProductType: "FEED",
  },
  {
    id: "mock_reel_007",
    username: "testuser",
    caption: "Partner content #isbirligi #sponsored",
    timestamp: "2025-02-28T14:00:00+0000",
    views: 41000,
    permalink: "https://www.instagram.com/reel/mock_007/",
    thumbnailUrl: null,
    provider: "mock" as const,
    rawMediaType: "VIDEO",
    rawProductType: "REELS",
  },
];

function reelToContentItem(reel: ReelItem): ContentItem {
  return {
    id: reel.id,
    platform: "instagram",
    username: reel.username,
    caption: reel.caption,
    timestamp: reel.timestamp,
    views: reel.views,
    permalink: reel.permalink,
    thumbnailUrl: reel.thumbnailUrl,
    provider: "mock",
    contentKind: reel.rawProductType ?? null,
    rawMetadata: {
      rawMediaType: reel.rawMediaType,
      rawProductType: reel.rawProductType,
    },
  };
}

export class MockProvider implements PlatformProvider {
  readonly name = "mock" as const;

  async fetchRecentMedia(username: string): Promise<ProviderResult> {
    // Simulate a small delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Replace fixture username with the requested one
    const reels = MOCK_REELS.map((reel) => ({
      ...reel,
      username: username.toLowerCase(),
    }));

    return {
      items: reels.map(reelToContentItem),
      totalFetched: reels.length,
      source: "mock",
      platform: "instagram",
      reels,
    };
  }
}
