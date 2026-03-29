/**
 * Mock TikTok provider for local development.
 *
 * Returns realistic fixture data simulating TikTok video results,
 * including videos with paid partnership signals (video_tag).
 *
 * CLEARLY LABELED AS MOCK DATA — not verified against a live TikTok API.
 *
 * Used when TikTok Research API credentials are not configured,
 * which is the default since Research API access is restricted.
 */
import type { ContentItem, ProviderResult } from "../domain/types";
import type { PlatformProvider } from "./interface";

const MOCK_TIKTOK_VIDEOS: ContentItem[] = [
  {
    id: "tt_mock_001",
    platform: "tiktok",
    username: "testcreator",
    caption: "Day in my life in Istanbul 🇹🇷 #vlog #istanbul #dayinmylife",
    timestamp: "2025-03-10T16:00:00Z",
    views: 125000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_001",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: { hashtag_names: ["vlog", "istanbul", "dayinmylife"] },
  },
  {
    id: "tt_mock_002",
    platform: "tiktok",
    username: "testcreator",
    caption: "Easy pasta recipe you need to try 🍝 #cooking #recipe #pasta",
    timestamp: "2025-03-09T12:30:00Z",
    views: 89000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_002",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: { hashtag_names: ["cooking", "recipe", "pasta"] },
  },
  {
    id: "tt_mock_003",
    platform: "tiktok",
    username: "testcreator",
    caption:
      "Reviewing @lorealparis new serum 💄 Paid Partnership #beauty #skincare #lorealparis",
    timestamp: "2025-03-08T10:00:00Z",
    views: 210000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_003",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: {
      isPaidPartnership: true,
      isCreatorEarnsCommission: false,
      isAIGenerated: false,
    },
    rawMetadata: {
      hashtag_names: ["beauty", "skincare", "lorealparis"],
      video_tag: [{ type: "Branded Type", number: 1 }],
    },
  },
  {
    id: "tt_mock_004",
    platform: "tiktok",
    username: "testcreator",
    caption: "Morning workout routine 💪 #fitness #gym #workout",
    timestamp: "2025-03-07T08:00:00Z",
    views: 67000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_004",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: { hashtag_names: ["fitness", "gym", "workout"] },
  },
  {
    id: "tt_mock_005",
    platform: "tiktok",
    username: "testcreator",
    caption: "Hidden gem cafe ☕ #coffeeshop #explore #hiddenspots",
    timestamp: "2025-03-06T14:00:00Z",
    views: 45000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_005",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: { hashtag_names: ["coffeeshop", "explore", "hiddenspots"] },
  },
  {
    id: "tt_mock_006",
    platform: "tiktok",
    username: "testcreator",
    caption:
      "Check out this amazing product from @cerave_turkiye #ad #skincare #cerave",
    timestamp: "2025-03-05T09:30:00Z",
    views: 156000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_006",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: {
      isPaidPartnership: true,
      isCreatorEarnsCommission: false,
      isAIGenerated: false,
    },
    rawMetadata: {
      hashtag_names: ["ad", "skincare", "cerave"],
      video_tag: [{ type: "Branded Type", number: 1 }],
    },
  },
  {
    id: "tt_mock_007",
    platform: "tiktok",
    username: "testcreator",
    caption: "Beach sunset timelapse 🌅 #sunset #beach #timelapse",
    timestamp: "2025-03-04T18:00:00Z",
    views: 38000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_007",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: { hashtag_names: ["sunset", "beach", "timelapse"] },
  },
  {
    id: "tt_mock_008",
    platform: "tiktok",
    username: "testcreator",
    caption:
      "Trying the viral TikTok drink 🥤 commission link in bio #affiliate #drink",
    timestamp: "2025-03-03T15:00:00Z",
    views: 92000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_008",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: {
      isPaidPartnership: false,
      isCreatorEarnsCommission: true,
      isAIGenerated: false,
    },
    rawMetadata: {
      hashtag_names: ["affiliate", "drink"],
      video_tag: [{ type: "Branded Type", number: 7 }],
    },
  },
  {
    id: "tt_mock_009",
    platform: "tiktok",
    username: "testcreator",
    caption: "My evening skincare routine 🧴 #skincare #routine #nightroutine",
    timestamp: "2025-03-02T20:00:00Z",
    views: 54000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_009",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: { hashtag_names: ["skincare", "routine", "nightroutine"] },
  },
  {
    id: "tt_mock_010",
    platform: "tiktok",
    username: "testcreator",
    caption:
      "Sponsored makeover with @nyxcosmetics_turkiye 💄 #sponsored #makeup #nyx",
    timestamp: "2025-03-01T11:00:00Z",
    views: 178000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_010",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: {
      isPaidPartnership: true,
      isCreatorEarnsCommission: false,
      isAIGenerated: false,
    },
    rawMetadata: {
      hashtag_names: ["sponsored", "makeup", "nyx"],
      video_tag: [{ type: "Branded Type", number: 1 }],
    },
  },
  {
    id: "tt_mock_011",
    platform: "tiktok",
    username: "testcreator",
    caption: "Funny cat compilation 🐱 #cats #funny #pets",
    timestamp: "2025-02-28T13:00:00Z",
    views: 31000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_011",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: null,
    rawMetadata: { hashtag_names: ["cats", "funny", "pets"] },
  },
  {
    id: "tt_mock_012",
    platform: "tiktok",
    username: "testcreator",
    caption:
      "New collection from @brand.official 🛍️ Paid partnership #fashion #haul",
    timestamp: "2025-02-27T09:00:00Z",
    views: 143000,
    permalink: "https://www.tiktok.com/@testcreator/video/tt_mock_012",
    thumbnailUrl: null,
    provider: "tiktok-mock",
    contentKind: "VIDEO",
    commercialMetadata: {
      isPaidPartnership: true,
      isCreatorEarnsCommission: false,
      isAIGenerated: false,
    },
    rawMetadata: {
      hashtag_names: ["fashion", "haul"],
      video_tag: [{ type: "Branded Type", number: 1 }],
    },
  },
];

export class TikTokMockProvider implements PlatformProvider {
  readonly name = "tiktok-mock" as const;

  async fetchRecentMedia(username: string): Promise<ProviderResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Replace fixture username with the requested one
    const items = MOCK_TIKTOK_VIDEOS.map((item) => ({
      ...item,
      username: username.toLowerCase(),
      permalink: `https://www.tiktok.com/@${username.toLowerCase()}/video/${item.id}`,
    }));

    return {
      items,
      totalFetched: items.length,
      source: "tiktok-mock",
      platform: "tiktok",
    };
  }
}
