/**
 * Instagram Apify Provider — Managed live provider for Instagram benchmarking.
 *
 * Uses Apify's automation-lab/instagram-scraper Actor to fetch recent posts
 * from a public Instagram profile. This is the production live path that
 * works on ALL public accounts (not just professional/business).
 *
 * Requires: APIFY_API_TOKEN env var (same token as TikTok Apify provider)
 *
 * Commercial signals:
 * - `isPaidPartnership` field from Apify (native Instagram partnership flag)
 * - Caption/hashtag fallback for additional detection (existing pipeline)
 *
 * Content type detection:
 * - `productType` maps to Instagram content kinds (clips = Reels, etc.)
 *
 * Source label: "instagram-apify"
 */
import type { ContentItem, ProviderSource, ProviderResult } from "../domain/types";
import type { PlatformProvider } from "./interface";
import { ProviderError } from "./interface";

// ---------------------------------------------------------------------------
// Apify response types (automation-lab/instagram-scraper output)
// ---------------------------------------------------------------------------

interface ApifyInstagramItem {
  type: "post" | "profile" | "comment";
  id: string;
  shortCode: string;
  mediaType: string; // "Video" | "Image" | "Carousel"
  productType: string | null; // "clips" (Reels), "carousel_container", "feed", or null
  url: string; // permalink
  caption: string | null;
  likesCount: number;
  commentsCount: number;
  timestamp: string; // ISO 8601
  ownerUsername: string;
  taggedUsers?: string[];
  isPinned: boolean;
  isPaidPartnership: boolean;
  musicInfo?: {
    title?: string;
    artist?: string;
  } | null;
  images?: string[];
  displayUrl?: string;
  videoViewCount?: number;
  videoPlayCount?: number;
  isCommentsDisabled?: boolean;
  videoDuration?: number;
  // Profile-type fields (when includeProfile=true)
  followersCount?: number;
  followingCount?: number;
  fullName?: string;
  verified?: boolean;
  profilePicUrl?: string;
  postsCount?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APIFY_ACTOR_ID = "automation-lab~instagram-scraper";
const APIFY_RUN_SYNC_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`;
const MAX_POSTS = 25; // Fetch 25 to have enough for 5+5 after filtering
const APIFY_TIMEOUT_MS = 120_000; // 2 minutes

export class InstagramApifyProvider implements PlatformProvider {
  readonly name: ProviderSource = "instagram-apify";

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
      mode: "posts",
      usernames: [cleanUsername],
      maxPosts: MAX_POSTS,
      includeProfile: true,
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
            "The Instagram profile may be very large or Apify is under load.",
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

    let items: ApifyInstagramItem[];
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

    // Filter to post items only (exclude profile records)
    const postItems = items.filter(
      (item) => item.type === "post" && item.ownerUsername?.toLowerCase() === cleanUsername
    );

    if (postItems.length === 0 && items.length === 0) {
      throw new ProviderError(
        "ACCOUNT_NOT_FOUND",
        `No Instagram posts found for @${cleanUsername}. ` +
          "The account may not exist, be private, or have no posts.",
        404
      );
    }

    // Map to ContentItem
    const mapped: ContentItem[] = (
      postItems.length > 0 ? postItems : items.filter((i) => i.type === "post")
    ).map((item) => this.mapToContentItem(item, cleanUsername));

    // --- Deduplicate by shortCode ---
    const contentItems = this.deduplicateByShortCode(mapped);

    // --- Extract profile data ---
    const profileItem = items.find((item) => item.type === "profile");
    const profile = profileItem
      ? {
          platform: "instagram" as const,
          username: cleanUsername,
          displayName: profileItem.fullName || null,
          followerCount:
            typeof profileItem.followersCount === "number"
              ? profileItem.followersCount
              : null,
          followingCount:
            typeof profileItem.followingCount === "number"
              ? profileItem.followingCount
              : null,
          verified: profileItem.verified ?? null,
          profilePicUrl: profileItem.profilePicUrl || null,
          source: "instagram-apify" as const,
        }
      : null;

    return {
      items: contentItems,
      totalFetched: contentItems.length,
      source: "instagram-apify",
      platform: "instagram",
      profile,
    };
  }

  private mapToContentItem(
    item: ApifyInstagramItem,
    username: string
  ): ContentItem {
    const caption = item.caption || "";

    // Map Apify productType to canonical contentKind
    // "clips" = Reels, "carousel_container" = Carousel, "feed" = Feed post
    const contentKind = this.mapProductType(item.productType, item.mediaType);

    // TRUTHFULNESS: videoPlayCount is what Instagram displays as "views".
    // The actor returns two copies per post:
    //   Copy A (productType=null): has videoViewCount (lower, non-replay count)
    //   Copy B (productType=clips): has videoPlayCount (Instagram's displayed play count)
    // Prefer videoPlayCount (matches Instagram UI) → fallback to videoViewCount → null.
    // Never fallback to likesCount.
    const views = item.videoPlayCount ?? item.videoViewCount ?? null;

    return {
      id: item.id,
      platform: "instagram",
      username: item.ownerUsername || username,
      caption,
      timestamp: item.timestamp || new Date().toISOString(),
      views,
      permalink: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
      thumbnailUrl: item.displayUrl || item.images?.[0] || null,
      provider: "instagram-apify",
      contentKind,
      commercialMetadata: item.isPaidPartnership
        ? {
            isPaidPartnership: true,
            isCreatorEarnsCommission: false,
            isAIGenerated: false,
          }
        : null,
      rawMetadata: {
        shortCode: item.shortCode,
        mediaType: item.mediaType,
        productType: item.productType,
        likesCount: item.likesCount,
        commentsCount: item.commentsCount,
        isPinned: item.isPinned,
        isPaidPartnership: item.isPaidPartnership,
        taggedUsers: item.taggedUsers || [],
        musicInfo: item.musicInfo || null,
      },
    };
  }

  /**
   * Map Apify productType + mediaType to canonical content kind.
   *
   * Instagram product types:
   * - "clips" → REELS
   * - "carousel_container" → CAROUSEL_ALBUM
   * - "feed" → IMAGE or VIDEO
   * - "igtv" → IGTV
   *
   * IMPORTANT: The Apify actor frequently returns productType: null even for
   * Reels. Since Instagram deprecated standalone "Video" posts (all video
   * content is Reels now), we map Video with null productType to REELS.
   */
  private mapProductType(productType: string | null, mediaType: string): string {
    if (productType === "clips") return "REELS";
    if (productType === "igtv") return "IGTV";
    if (productType === "carousel_container") return "CAROUSEL_ALBUM";

    // Video with null/missing productType = Reels
    // Instagram deprecated standalone Video posts — all video content is Reels.
    if (mediaType === "Video") return "REELS";

    if (mediaType === "Image") return "IMAGE";
    if (mediaType === "Carousel") return "CAROUSEL_ALBUM";

    return productType || mediaType || "UNKNOWN";
  }

  /**
   * Deduplicate mapped items by shortCode.
   *
   * The Apify actor returns each post TWICE:
   *   Copy A (productType=null):  has videoViewCount, may lack videoPlayCount
   *   Copy B (productType=clips): has videoPlayCount, lacks videoViewCount
   *
   * Strategy: merge the best fields from both copies.
   * Prefer higher views (videoPlayCount > videoViewCount).
   */
  private deduplicateByShortCode(items: ContentItem[]): ContentItem[] {
    const byShortCode = new Map<string, ContentItem>();

    for (const item of items) {
      const shortCode = (item.rawMetadata?.shortCode as string) || item.id;
      const existing = byShortCode.get(shortCode);

      if (!existing) {
        byShortCode.set(shortCode, item);
        continue;
      }

      // Merge: keep the copy with the higher view count
      // (videoPlayCount is typically higher than videoViewCount)
      const existingViews = existing.views;
      const currentViews = item.views;
      const existingHasViews = typeof existingViews === "number";
      const currentHasViews = typeof currentViews === "number";

      if (currentHasViews && !existingHasViews) {
        byShortCode.set(shortCode, item);
      } else if (currentHasViews && existingHasViews && currentViews! > existingViews!) {
        // Current has higher views (e.g., videoPlayCount > videoViewCount)
        byShortCode.set(shortCode, item);
      }
      // Otherwise keep existing
    }

    return Array.from(byShortCode.values());
  }
}
