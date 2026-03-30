/**
 * POST /api/analyze-all
 *
 * Cross-platform benchmark analysis endpoint.
 * Accepts { instagram?: string, tiktok?: string }
 * Runs both platform fetches concurrently and returns MultiPlatformResult.
 *
 * Partial failures: one platform failing does not destroy the other's result.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeUsername } from "@/lib/domain/normalize";
import { selectDualBenchmark, selectDualBenchmarkFromItems } from "@/lib/domain/selection";
import type {
  Platform,
  PlatformAnalysis,
  MultiPlatformResult,
  ProviderResult,
} from "@/lib/domain/types";
import { getProvider } from "@/lib/providers/factory";
import { ProviderError } from "@/lib/providers/interface";
import { estimateStoryVisibility } from "@/lib/domain/story-visibility";
import { estimateCarouselVisibility } from "@/lib/domain/carousel-visibility";
import { getCachedProviderResult, cacheProviderResult } from "@/lib/services/scan-cache-service";
import { ingestContentItems } from "@/lib/services/media-warehouse-service";
import { updateScanProfile } from "@/lib/services/adaptive-scan-service";

const AnalyzeAllSchema = z.object({
  instagram: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .nullable(),
  tiktok: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .nullable(),
  forceRefresh: z.boolean().optional().default(false),
});

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

async function analyzePlatform(
  platform: Platform,
  rawUsername: string,
  forceRefresh: boolean = false
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
    // Check durable cache first
    let providerResult: ProviderResult;
    let cacheHit = false;
    let cacheInfo = "";

    if (!forceRefresh) {
      const cached = await getCachedProviderResult(platform, username);
      if (cached) {
        providerResult = cached.result;
        cacheHit = true;
        cacheInfo = `Cached (${cached.freshness}, ${Math.round(cached.ageMs / 60000)}m ago)`;
      } else {
        const provider = getProvider(platform);
        providerResult = await provider.fetchRecentMedia(username);
        await cacheProviderResult(platform, username, providerResult);
      }
    } else {
      const provider = getProvider(platform);
      providerResult = await provider.fetchRecentMedia(username);
      await cacheProviderResult(platform, username, providerResult);
    }

    // M2: Persist items to warehouse (dedup + metric updates)
    const warehouseResult = await ingestContentItems(providerResult.items, platform, username);
    if (warehouseResult.newItems > 0 || warehouseResult.updatedItems > 0) {
      console.log(
        `[M2] ${platform}/@${username}: +${warehouseResult.newItems} new, ` +
        `${warehouseResult.updatedItems} updated, ${warehouseResult.unchangedItems} unchanged`
      );
    }

    // M3: Update scan profile (posting frequency → adaptive TTL)
    const scanProfile = await updateScanProfile(platform, username, providerResult);
    console.log(
      `[M3] ${platform}/@${username}: ${scanProfile.postsPerWeek} posts/wk, ` +
      `tier=${scanProfile.frequencyTier}, ttl=${Math.round(scanProfile.adaptiveTtlMs / 3600000)}h`
    );

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
    if (cacheHit) limitations.push(cacheInfo);
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

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." } },
      { status: 400 }
    );
  }

  const parseResult = AnalyzeAllSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: parseResult.error.issues.map((i) => i.message).join("; ") } },
      { status: 400 }
    );
  }

  const { instagram, tiktok } = parseResult.data;

  if (!instagram && !tiktok) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "At least one username (instagram or tiktok) is required." } },
      { status: 400 }
    );
  }

  // Run both platform analyses concurrently
  const tasks: Promise<[Platform, PlatformAnalysis]>[] = [];

  if (instagram) {
    tasks.push(
      analyzePlatform("instagram", instagram, parseResult.data.forceRefresh).then((r) => ["instagram", r])
    );
  }
  if (tiktok) {
    tasks.push(
      analyzePlatform("tiktok", tiktok, parseResult.data.forceRefresh).then((r) => ["tiktok", r])
    );
  }

  const results = await Promise.allSettled(tasks);

  const platforms: MultiPlatformResult["platforms"] = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      const [platform, analysis] = result.value;
      platforms[platform] = analysis;
    }
  }

  const response: MultiPlatformResult = {
    analyzedAt: new Date().toISOString(),
    query: {
      instagram: instagram || null,
      tiktok: tiktok || null,
    },
    platforms,
  };

  // Auto-link influencer identities — every scan creates/updates an identity
  try {
    const { ensureIdentity } = await import("@/lib/services/identity-service");
    const igNorm = instagram?.toLowerCase().trim() || null;
    const ttNorm = tiktok?.toLowerCase().trim() || null;
    await ensureIdentity(igNorm, ttNorm);
  } catch (err) {
    console.error("[identity] Auto-link error:", err);
  }

  return NextResponse.json(response);
}
