/**
 * Shared platform analysis function.
 *
 * Extracted from the analyze-all route to be reused by:
 * - POST /api/analyze-all (existing pair-analysis route)
 * - POST /api/analyze-single (new single-platform route)
 */
import { normalizeUsername } from "@/lib/domain/normalize";
import { selectDualBenchmark, selectDualBenchmarkFromItems } from "@/lib/domain/selection";
import type {
  Platform,
  PlatformAnalysis,
  ProviderResult,
} from "@/lib/domain/types";
import { getProvider } from "@/lib/providers/factory";
import { ProviderError } from "@/lib/providers/interface";
import { estimateStoryVisibility } from "@/lib/domain/story-visibility";
import { estimateCarouselVisibility } from "@/lib/domain/carousel-visibility";

function validateUsername(username: string, platform: Platform): string | null {
  if (platform === "tiktok") {
    if (!/^[a-z0-9._]{1,24}$/.test(username)) {
      return "Invalid TikTok username format.";
    }
  } else {
    if (!/^[a-z0-9._]{1,30}$/.test(username)) {
      return "Invalid Instagram username format.";
    }
  }
  return null;
}

function getLimitations(platform: Platform, source: string): string[] {
  const limitations: string[] = [];
  if (platform === "instagram") {
    if (source === "mock") {
      limitations.push("Simulated mock data. Set META_ACCESS_TOKEN + META_IG_USER_ID for live Meta Graph API data.");
    } else if (source === "meta") {
      limitations.push(
        "Live data via Meta Graph API. View counts available for Reels on professional/creator accounts."
      );
    } else if (source === "instagram-apify") {
      limitations.push(
        "Apify fallback (Meta credentials not configured). View counts are real video play counts. Caption availability may vary."
      );
    }
  } else if (platform === "tiktok") {
    if (source === "tiktok-mock") {
      limitations.push("Simulated mock data. Set APIFY_API_TOKEN for live data.");
    } else if (source === "tiktok-apify") {
      limitations.push("Live data via Apify. Engagement metrics are real.");
    } else if (source === "tiktok-research") {
      limitations.push("TikTok Research API. Metrics may have slight delays.");
    }
  }
  return limitations;
}

/**
 * Analyze a single platform for a given username.
 * Returns a PlatformAnalysis result (never throws — errors are encoded in the result).
 */
export async function analyzePlatform(
  platform: Platform,
  rawUsername: string
): Promise<PlatformAnalysis> {
  const username = normalizeUsername(rawUsername);

  // Validate format
  const validationError = validateUsername(username, platform);
  if (validationError) {
    return {
      platform,
      username,
      profile: null,
      organic: { status: "empty", averageViews: null, sampleSize: 0, maxSampleSize: 5, reels: [], warnings: [] },
      commercial: { status: "empty", averageViews: null, sampleSize: 0, maxSampleSize: 5, reels: [], warnings: [] },
      comparison: null,
      source: "mock",
      totalContentCount: 0,
      limitations: [validationError],
      status: "error",
      error: validationError,
    };
  }

  try {
    const provider = getProvider(platform);
    const providerResult: ProviderResult = await provider.fetchRecentMedia(username);

    // Run benchmark pipeline
    let benchmark;
    if (platform === "tiktok") {
      benchmark = selectDualBenchmarkFromItems(providerResult.items, platform);
    } else {
      benchmark = providerResult.reels
        ? selectDualBenchmark(providerResult.reels)
        : selectDualBenchmarkFromItems(providerResult.items, platform);
    }

    const limitations = getLimitations(platform, providerResult.source);
    const hasContent =
      benchmark.organic.sampleSize > 0 || benchmark.commercial.sampleSize > 0;

    // Story visibility estimation (Instagram only)
    let storyVisibility = null;
    let carouselVisibility = null;
    if (platform === "instagram") {
      const followerCount = providerResult.profile?.followerCount ?? null;
      const avgReelViews = benchmark.organic.averageViews;
      storyVisibility = estimateStoryVisibility(followerCount, avgReelViews);

      // Extract carousel items from provider results
      const carouselItems = providerResult.items.filter(
        (item) => item.rawMetadata?.rawMediaType === "CAROUSEL_ALBUM"
      );
      if (carouselItems.length > 0) {
        carouselVisibility = estimateCarouselVisibility({
          items: carouselItems.map((item) => ({
            mediaId: item.id,
            permalink: item.permalink,
            timestamp: item.timestamp,
            likeCount: item.likeCount ?? null,
            commentsCount: item.commentsCount ?? null,
          })),
          followerCount,
          avgReelViews,
        });
      }
    }

    return {
      platform,
      username,
      profile: providerResult.profile || null,
      organic: benchmark.organic,
      commercial: benchmark.commercial,
      comparison: benchmark.comparison,
      storyVisibility,
      carouselVisibility,
      source: providerResult.source,
      totalContentCount: providerResult.totalFetched,
      limitations,
      status: hasContent ? "ok" : "partial",
    };
  } catch (err) {
    const message =
      err instanceof ProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error";

    return {
      platform,
      username,
      profile: null,
      organic: { status: "empty", averageViews: null, sampleSize: 0, maxSampleSize: 5, reels: [], warnings: [] },
      commercial: { status: "empty", averageViews: null, sampleSize: 0, maxSampleSize: 5, reels: [], warnings: [] },
      comparison: null,
      source: platform === "tiktok" ? "tiktok-mock" : "mock",
      totalContentCount: 0,
      limitations: [],
      status: "error",
      error: message,
    };
  }
}
