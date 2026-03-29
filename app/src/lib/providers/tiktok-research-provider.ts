/**
 * TikTok Research API provider.
 *
 * Uses the TikTok Research API (POST /v2/research/video/query/) to fetch
 * recent public videos for a given username, including view counts and
 * commercial signals (video_tag).
 *
 * ACCESS RESTRICTION:
 * The Research API requires the `research.data.basic` scope which is
 * restricted to approved academic/research applications. It is NOT
 * available for general agency production use via self-serve sign-up.
 *
 * This provider is implemented to be ready for use if/when Research API
 * credentials become available. Until then, the TikTokMockProvider is
 * used as the default.
 *
 * Official docs:
 * - https://developers.tiktok.com/doc/research-api-specs-query-videos
 */
import type { ContentItem, ProviderResult } from "../domain/types";
import type { PlatformProvider } from "./interface";
import { ProviderError } from "./interface";

// ---------------------------------------------------------------------------
// Raw TikTok Research API types
// ---------------------------------------------------------------------------

interface TikTokVideoTag {
  type?: string;
  number?: number;
}

interface TikTokVideo {
  id?: number | string;
  video_description?: string;
  create_time?: number;
  username?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  hashtag_names?: string[];
  video_mention_list?: string[];
  video_tag?: TikTokVideoTag[];
  region_code?: string;
  video_duration?: number;
  favorites_count?: number;
}

interface TikTokQueryResponse {
  data?: {
    videos?: TikTokVideo[];
    cursor?: number;
    has_more?: boolean;
    search_id?: string;
  };
  error?: {
    code: string;
    message: string;
    log_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Video tag → commercial signal mapping
// ---------------------------------------------------------------------------

/**
 * Detect paid partnership from TikTok video_tag metadata.
 * - type = "Branded Type", number = 1 → "Paid Partnership"
 * - type = "Branded Type", number = 7 → "Creator Earns Commission"
 */
function extractCommercialMetadata(tags?: TikTokVideoTag[]) {
  if (!tags || tags.length === 0) return null;

  let isPaidPartnership = false;
  let isCreatorEarnsCommission = false;
  let isAIGenerated = false;

  for (const tag of tags) {
    const type = (tag.type ?? "").toLowerCase();
    if (type.includes("branded")) {
      if (tag.number === 1) isPaidPartnership = true;
      if (tag.number === 7) isCreatorEarnsCommission = true;
    }
    if (type.includes("aigc")) {
      if (tag.number === 1 || tag.number === 2) isAIGenerated = true;
    }
  }

  if (!isPaidPartnership && !isCreatorEarnsCommission && !isAIGenerated) {
    return null;
  }

  return {
    isPaidPartnership,
    isCreatorEarnsCommission,
    isAIGenerated,
    rawTag: tags as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Map TikTok video to ContentItem
// ---------------------------------------------------------------------------

function mapTikTokVideoToContentItem(
  video: TikTokVideo,
  username: string
): ContentItem {
  const videoId = String(video.id ?? "");
  const createTime = video.create_time
    ? new Date(video.create_time * 1000).toISOString()
    : new Date().toISOString();

  return {
    id: videoId,
    platform: "tiktok",
    username: video.username ?? username,
    caption: video.video_description ?? null,
    timestamp: createTime,
    views: typeof video.view_count === "number" ? video.view_count : null,
    permalink: `https://www.tiktok.com/@${video.username ?? username}/video/${videoId}`,
    thumbnailUrl: null,
    provider: "tiktok-research",
    contentKind: "VIDEO",
    commercialMetadata: extractCommercialMetadata(video.video_tag),
    rawMetadata: video as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

const QUERY_FIELDS =
  "id,video_description,create_time,username,view_count,like_count,comment_count,share_count,hashtag_names,video_mention_list,video_tag,video_duration";
const MAX_COUNT = 100;

export class TikTokResearchProvider implements PlatformProvider {
  readonly name = "tiktok-research" as const;

  private clientKey: string;
  private clientSecret: string;
  private accessToken: string | null = null;

  constructor() {
    const key = process.env.TIKTOK_RESEARCH_CLIENT_KEY;
    const secret = process.env.TIKTOK_RESEARCH_CLIENT_SECRET;

    if (!key || !secret) {
      throw new ProviderError(
        "TIKTOK_ACCESS_RESTRICTED",
        "TikTok Research API credentials not configured. " +
          "The Research API requires approved access (research.data.basic scope). " +
          "Set TIKTOK_RESEARCH_CLIENT_KEY and TIKTOK_RESEARCH_CLIENT_SECRET.",
        403
      );
    }

    this.clientKey = key;
    this.clientSecret = secret;
  }

  async fetchRecentMedia(username: string): Promise<ProviderResult> {
    await this.ensureAccessToken();

    // Query videos by username for the last 30 days (API max window)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = formatDate(thirtyDaysAgo);
    const endDate = formatDate(now);

    const body = {
      query: {
        and: [
          {
            operation: "EQ",
            field_name: "username",
            field_values: [username],
          },
        ],
      },
      start_date: startDate,
      end_date: endDate,
      max_count: MAX_COUNT,
    };

    const response = await this.makeRequest(
      `https://open.tiktokapis.com/v2/research/video/query/?fields=${QUERY_FIELDS}`,
      body
    );

    const data: TikTokQueryResponse = await this.parseResponse(response);

    if (data.error && data.error.code !== "ok") {
      this.handleTikTokError(data.error);
    }

    const videos = data.data?.videos ?? [];
    const items = videos.map((v) => mapTikTokVideoToContentItem(v, username));

    return {
      items,
      totalFetched: items.length,
      source: "tiktok-research",
      platform: "tiktok",
    };
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken) return;

    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: this.clientKey,
          client_secret: this.clientSecret,
          grant_type: "client_credentials",
        }),
      }
    );

    const data = await response.json();
    if (!data.access_token) {
      throw new ProviderError(
        "TIKTOK_ACCESS_RESTRICTED",
        "Failed to obtain TikTok Research API access token. " +
          "Ensure your application has approved research.data.basic scope.",
        403
      );
    }

    this.accessToken = data.access_token;
  }

  private async makeRequest(
    url: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ProviderError(
          "TIKTOK_RATE_LIMIT",
          "The request to TikTok API timed out.",
          504
        );
      }
      throw new ProviderError(
        "UNKNOWN_ERROR",
        `Failed to connect to TikTok API: ${err instanceof Error ? err.message : "Unknown error"}`,
        502
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponse(response: Response): Promise<TikTokQueryResponse> {
    if (response.status === 429) {
      throw new ProviderError(
        "TIKTOK_RATE_LIMIT",
        "TikTok API rate limit exceeded. Please wait and try again.",
        429
      );
    }

    try {
      return (await response.json()) as TikTokQueryResponse;
    } catch {
      throw new ProviderError(
        "MALFORMED_RESPONSE",
        "Received an invalid response from TikTok API.",
        502
      );
    }
  }

  private handleTikTokError(error: {
    code: string;
    message: string;
  }): never {
    throw new ProviderError(
      "TIKTOK_ACCESS_RESTRICTED",
      `TikTok API error: ${error.message} (code: ${error.code})`,
      403
    );
  }
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
