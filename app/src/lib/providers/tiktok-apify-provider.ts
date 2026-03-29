/**
 * TikTok Apify Provider — Managed live fallback for TikTok benchmarking.
 *
 * Uses Apify's clockworks/tiktok-scraper Actor to fetch recent videos
 * from a public TikTok profile. This is the production live path when
 * official TikTok Research API access is not available.
 *
 * Requires: APIFY_API_TOKEN env var (Apify account with API token)
 *
 * Commercial signals:
 * - `isAd` field from Apify (direct TikTok ad flag)
 * - `isSponsored` field from Apify (sponsored content flag)
 * - Caption/hashtag fallback for additional detection
 *
 * Source label: "tiktok-apify"
 */
import type { ContentItem, ProviderSource, ProviderResult } from "../domain/types";
import type { PlatformProvider } from "./interface";
import { ProviderError } from "./interface";

// ---------------------------------------------------------------------------
// Apify response types (subset of clockworks/tiktok-scraper output)
// ---------------------------------------------------------------------------

interface ApifyTikTokItem {
  id: string;
  text: string; // caption
  createTime: number; // unix timestamp
  createTimeISO: string;
  isAd: boolean;
  isSponsored: boolean;
  authorMeta: {
    id: string;
    name: string; // username
    nickName: string;
    verified: boolean;
    avatar?: string;
    fans?: number;      // follower count
    following?: number;
    heart?: number;     // total likes
    commerceUserInfo?: {
      commerceUser: boolean;
    };
  };
  webVideoUrl: string;
  videoMeta: {
    height: number;
    width: number;
    duration: number;
    coverUrl: string;
    originalCoverUrl: string;
  };
  playCount: number;
  diggCount: number;
  shareCount: number;
  collectCount: number;
  commentCount: number;
  hashtags: Array<{ id: string; name: string; title?: string }>;
  mentions: string[];
  detailedMentions?: Array<{ userId: string; secUid?: string; name: string }>;
  isPinned: boolean;
  isSlideshow?: boolean;
  fromProfileSection?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APIFY_ACTOR_ID = "clockworks~tiktok-scraper";
const APIFY_RUN_SYNC_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`;
const RESULTS_PER_PROFILE = 15; // 15 latest videos — enough for 5+5 buckets after exclusions, ~25% cheaper
const APIFY_TIMEOUT_MS = 120_000; // 2 minutes — Apify runs take 15-60s

export class TikTokApifyProvider implements PlatformProvider {
  readonly name: ProviderSource = "tiktok-apify";

  private getApiToken(): string {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new ProviderError(
        "INVALID_CREDENTIALS",
        "APIFY_API_TOKEN environment variable is not set. " +
          "Create a free Apify account at https://apify.com and generate an API token.",
        401
      );
    }
    return token;
  }

  async fetchRecentMedia(username: string): Promise<ProviderResult> {
    const token = this.getApiToken();
    const cleanUsername = username.replace(/^@/, "").toLowerCase();

    const requestBody = {
      excludePinnedPosts: true,
      profiles: [cleanUsername],
      resultsPerPage: RESULTS_PER_PROFILE,
      profileSorting: "latest",
      profileScrapeSections: ["videos"],
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadAvatars: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadSubtitles: false,
      shouldDownloadMusicCovers: false,
      scrapeRelatedVideos: false,
    };

    const url = `${APIFY_RUN_SYNC_URL}?token=${token}`;

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);

      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProviderError(
          "TIMEOUT",
          `Apify request timed out after ${APIFY_TIMEOUT_MS / 1000}s. ` +
            "The TikTok profile may be very large or Apify is under load.",
          504
        );
      }
      throw new ProviderError(
        "NETWORK_ERROR",
        `Failed to connect to Apify: ${err instanceof Error ? err.message : "Unknown error"}`,
        502
      );
    }

    if (!response.ok) {
      const status = response.status;
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        // ignore
      }

      if (status === 401 || status === 403) {
        throw new ProviderError(
          "INVALID_CREDENTIALS",
          "Invalid Apify API token. Check your APIFY_API_TOKEN environment variable.",
          401
        );
      }

      throw new ProviderError(
        "UNKNOWN_ERROR",
        `Apify returned HTTP ${status}: ${errorBody.slice(0, 200)}`,
        status >= 500 ? 502 : status
      );
    }

    let items: ApifyTikTokItem[];
    try {
      items = await response.json();
    } catch {
      throw new ProviderError(
        "UNKNOWN_ERROR",
        "Failed to parse Apify response as JSON.",
        502
      );
    }

    if (!Array.isArray(items)) {
      throw new ProviderError(
        "UNKNOWN_ERROR",
        "Apify returned unexpected response format (expected array).",
        502
      );
    }

    // Filter to only items from the requested profile
    const profileItems = items.filter(
      (item) =>
        item.authorMeta?.name?.toLowerCase() === cleanUsername &&
        item.fromProfileSection === "videos"
    );

    if (profileItems.length === 0 && items.length === 0) {
      throw new ProviderError(
        "ACCOUNT_NOT_FOUND",
        `No TikTok videos found for @${cleanUsername}. ` +
          "The account may not exist, be private, or have no videos.",
        404
      );
    }

    // Map to ContentItem
    const sourceItems = profileItems.length > 0 ? profileItems : items;
    const contentItems: ContentItem[] = sourceItems.map((item) =>
      this.mapToContentItem(item, cleanUsername)
    );

    // --- Extract profile from first item's authorMeta ---
    const firstItem = sourceItems[0];
    const profile = firstItem?.authorMeta
      ? {
          platform: "tiktok" as const,
          username: firstItem.authorMeta.name || cleanUsername,
          displayName: firstItem.authorMeta.nickName || null,
          followerCount:
            typeof firstItem.authorMeta.fans === "number"
              ? firstItem.authorMeta.fans
              : null,
          followingCount:
            typeof firstItem.authorMeta.following === "number"
              ? firstItem.authorMeta.following
              : null,
          verified: firstItem.authorMeta.verified ?? null,
          profilePicUrl: firstItem.authorMeta.avatar || null,
          source: "tiktok-apify" as const,
        }
      : null;

    return {
      items: contentItems,
      totalFetched: contentItems.length,
      source: "tiktok-apify",
      platform: "tiktok",
      profile,
    };
  }

  private mapToContentItem(
    item: ApifyTikTokItem,
    username: string
  ): ContentItem {
    // Build caption from text + hashtags for enriched classification
    const caption = item.text || "";

    // Determine commercial metadata from Apify's isAd / isSponsored flags
    const isCommercial = item.isAd === true || item.isSponsored === true;

    return {
      id: item.id,
      platform: "tiktok",
      username: item.authorMeta?.name || username,
      caption,
      timestamp: item.createTimeISO || new Date(item.createTime * 1000).toISOString(),
      views: item.playCount ?? null,
      permalink: item.webVideoUrl || `https://www.tiktok.com/@${username}/video/${item.id}`,
      thumbnailUrl: item.videoMeta?.coverUrl || null,
      provider: "tiktok-apify",
      contentKind: item.isSlideshow ? "SLIDESHOW" : "VIDEO",
      commercialMetadata: isCommercial
        ? {
            isPaidPartnership: item.isAd === true,
            isCreatorEarnsCommission: false,
            isAIGenerated: false,
            isSponsored: item.isSponsored === true,
          }
        : null,
      rawMetadata: {
        diggCount: item.diggCount,
        shareCount: item.shareCount,
        collectCount: item.collectCount,
        commentCount: item.commentCount,
        isPinned: item.isPinned,
        hashtags: item.hashtags?.map((h) => h.name) || [],
        mentions: item.mentions || [],
      },
    };
  }
}
