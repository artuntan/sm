/**
 * MetaBusinessDiscoveryProvider — real Meta Instagram Graph API client.
 *
 * Uses the Business Discovery endpoint to fetch recent media for a target
 * public professional Instagram account.
 */
import type { ReelItem, ContentItem, ProviderResult, ProfileSummary } from "../domain/types";
import type { PlatformProvider } from "./interface";
import { ProviderError } from "./interface";

// Raw types from Meta Graph API
interface MetaMediaItem {
  id: string;
  caption?: string;
  timestamp?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_type?: string;
  media_product_type?: string;
  view_count?: number;
  like_count?: number;
  comments_count?: number;
}

interface MetaMediaPaging {
  cursors?: { after?: string };
  next?: string;
}

interface MetaMediaResponse {
  data?: MetaMediaItem[];
  paging?: MetaMediaPaging;
}

interface MetaBusinessDiscoveryResponse {
  business_discovery?: {
    username?: string;
    name?: string;
    biography?: string;
    followers_count?: number;
    follows_count?: number;
    profile_picture_url?: string;
    ig_id?: number;
    media?: MetaMediaResponse;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

const MEDIA_FIELDS =
  "id,caption,timestamp,permalink,thumbnail_url,media_type,media_product_type,view_count,like_count,comments_count";
const INITIAL_LIMIT = 50;
const MAX_TOTAL_ITEMS = 150;

/**
 * Map a raw Meta media item to our canonical ReelItem.
 */
export function mapMetaItemToReel(
  item: MetaMediaItem,
  username: string
): ReelItem {
  return {
    id: item.id,
    username,
    caption: item.caption ?? null,
    timestamp: item.timestamp ?? new Date().toISOString(),
    views: typeof item.view_count === "number" ? item.view_count : null,
    likeCount: typeof item.like_count === "number" ? item.like_count : null,
    commentsCount: typeof item.comments_count === "number" ? item.comments_count : null,
    permalink: item.permalink ?? `https://www.instagram.com/p/${item.id}/`,
    thumbnailUrl: item.thumbnail_url ?? null,
    provider: "meta",
    rawMediaType: item.media_type ?? null,
    rawProductType: item.media_product_type ?? null,
  };
}

/** Map a ReelItem to a platform-agnostic ContentItem */
function reelToContentItem(reel: ReelItem): ContentItem {
  return {
    id: reel.id,
    platform: "instagram",
    username: reel.username,
    caption: reel.caption,
    timestamp: reel.timestamp,
    views: reel.views,
    likeCount: reel.likeCount ?? null,
    commentsCount: reel.commentsCount ?? null,
    permalink: reel.permalink,
    thumbnailUrl: reel.thumbnailUrl,
    provider: "meta",
    contentKind: reel.rawProductType ?? null,
    rawMetadata: {
      rawMediaType: reel.rawMediaType,
      rawProductType: reel.rawProductType,
    },
  };
}

export class MetaBusinessDiscoveryProvider implements PlatformProvider {
  readonly name = "meta" as const;

  private accessToken: string;
  private igUserId: string;
  private apiVersion: string;

  constructor() {
    const token = process.env.META_ACCESS_TOKEN;
    const userId = process.env.META_IG_USER_ID;
    const version = process.env.META_GRAPH_API_VERSION || "v23.0";

    if (!token || !userId) {
      throw new ProviderError(
        "INVALID_CREDENTIALS",
        "META_ACCESS_TOKEN and META_IG_USER_ID must be set.",
        401
      );
    }

    this.accessToken = token;
    this.igUserId = userId;
    this.apiVersion = version;
  }

  async fetchRecentMedia(username: string): Promise<ProviderResult> {
    const allItems: ReelItem[] = [];
    let totalFetched = 0;
    let afterCursor: string | undefined;
    let hasMore = true;
    let profileDiscovery: MetaBusinessDiscoveryResponse["business_discovery"] | null = null;

    while (hasMore && totalFetched < MAX_TOTAL_ITEMS) {
      const limit = Math.min(INITIAL_LIMIT, MAX_TOTAL_ITEMS - totalFetched);
      const url = this.buildUrl(username, limit, afterCursor);

      const response = await this.makeRequest(url);
      const data = await this.parseResponse(response);

      // Handle Meta API errors
      if (data.error) {
        this.handleMetaError(data.error);
      }

      const discovery = data.business_discovery;
      if (!discovery) {
        throw new ProviderError(
          "ACCOUNT_NOT_FOUND",
          `Could not find professional Instagram account: @${username}. The account may be private, personal, or does not exist.`,
          404
        );
      }

      // Capture profile data from the first response (profile fields only come on first page)
      if (!profileDiscovery) {
        profileDiscovery = discovery;
      }

      const mediaData = discovery.media?.data ?? [];
      const resolvedUsername = discovery.username ?? username;

      for (const item of mediaData) {
        allItems.push(mapMetaItemToReel(item, resolvedUsername));
      }

      totalFetched += mediaData.length;

      // Check pagination
      const paging = discovery.media?.paging;
      afterCursor = paging?.cursors?.after;
      hasMore = !!paging?.next && !!afterCursor;

      // If we got fewer items than requested, no more pages
      if (mediaData.length < limit) {
        hasMore = false;
      }
    }

    // Build profile summary from Meta discovery data
    const profile = this.extractProfile(profileDiscovery, username);

    return {
      items: allItems.map(reelToContentItem),
      totalFetched,
      source: "meta",
      platform: "instagram",
      reels: allItems,
      profile,
    };
  }

  /**
   * Extract ProfileSummary from Meta Business Discovery response.
   * Uses typeof checks to preserve 0 values (not falsey).
   */
  private extractProfile(
    discovery: MetaBusinessDiscoveryResponse["business_discovery"] | null,
    fallbackUsername: string
  ): ProfileSummary | null {
    if (!discovery) return null;

    return {
      platform: "instagram",
      username: discovery.username ?? fallbackUsername,
      displayName: discovery.name ?? null,
      followerCount: typeof discovery.followers_count === "number"
        ? discovery.followers_count
        : null,
      followingCount: typeof discovery.follows_count === "number"
        ? discovery.follows_count
        : null,
      verified: null, // Meta Business Discovery does not expose verified status
      profilePicUrl: discovery.profile_picture_url ?? null,
      source: "meta",
    };
  }

  private buildUrl(
    username: string,
    limit: number,
    after?: string
  ): string {
    const mediaQuery = after
      ? `media.limit(${limit}).after(${after}){${MEDIA_FIELDS}}`
      : `media.limit(${limit}){${MEDIA_FIELDS}}`;

    const profileFields = "username,name,biography,followers_count,follows_count,profile_picture_url";
    const fields = `business_discovery.username(${username}){${profileFields},${mediaQuery}}`;

    const params = new URLSearchParams({
      fields,
      access_token: this.accessToken,
    });

    return `https://graph.facebook.com/${this.apiVersion}/${this.igUserId}?${params.toString()}`;
  }

  private async makeRequest(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      return response;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ProviderError(
          "META_TIMEOUT",
          "The request to Meta API timed out. Please try again.",
          504
        );
      }
      throw new ProviderError(
        "UNKNOWN_ERROR",
        `Failed to connect to Meta API: ${err instanceof Error ? err.message : "Unknown error"}`,
        502
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponse(
    response: Response
  ): Promise<MetaBusinessDiscoveryResponse> {
    if (response.status === 429) {
      throw new ProviderError(
        "META_RATE_LIMIT",
        "Meta API rate limit exceeded. Please wait and try again.",
        429
      );
    }

    try {
      const data = await response.json();
      return data as MetaBusinessDiscoveryResponse;
    } catch {
      throw new ProviderError(
        "MALFORMED_RESPONSE",
        "Received an invalid response from Meta API.",
        502
      );
    }
  }

  private handleMetaError(error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  }): never {
    // IGApi error code 110 = invalid user / not found
    // OAuthException code 190 = invalid token
    // Code 10 = application does not have permission
    // Code 100 subcode 33 = object does not exist (private/non-discoverable)

    if (error.code === 190) {
      throw new ProviderError(
        "INVALID_CREDENTIALS",
        "The Meta access token is invalid or expired. " +
          "If using a Graph API Explorer token, migrate to a System User Token " +
          "(see docs/META_TOKEN_SETUP.md). Check token status at GET /api/token-health.",
        401
      );
    }

    if (error.code === 100 && error.error_subcode === 33) {
      throw new ProviderError(
        "ACCOUNT_NOT_FOUND",
        `Instagram account not found or not accessible via Business Discovery. The account may be private or personal.`,
        404
      );
    }

    if (error.code === 110) {
      throw new ProviderError(
        "ACCOUNT_NOT_FOUND",
        `Instagram account not found.`,
        404
      );
    }

    if (error.code === 10) {
      throw new ProviderError(
        "PROFESSIONAL_DATA_UNAVAILABLE",
        "The app does not have permission to access this account's data. Ensure the account is a professional (business or creator) account.",
        403
      );
    }

    if (error.code === 4) {
      throw new ProviderError(
        "META_RATE_LIMIT",
        "Meta API rate limit exceeded.",
        429
      );
    }

    throw new ProviderError(
      "UNKNOWN_ERROR",
      `Meta API error: ${error.message} (code: ${error.code})`,
      error.code >= 400 ? error.code : 500
    );
  }
}
