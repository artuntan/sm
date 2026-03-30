/**
 * POST /api/analyze-single
 *
 * Single-platform analysis endpoint for the batch workspace.
 * Accepts { platform: "instagram" | "tiktok", username: string }
 * Returns PlatformAnalysis (with profile, benchmarks, visibility, source, limitations).
 *
 * This is the primitive the batch queue calls per-handle.
 * Shares the analyzePlatform() logic with /api/analyze-all.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureIdentity } from "@/lib/services/identity-service";
import { z } from "zod";
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
import { getCachedProviderResult, cacheProviderResult } from "@/lib/services/scan-cache-service";
import { ingestContentItems } from "@/lib/services/media-warehouse-service";
import { updateScanProfile } from "@/lib/services/adaptive-scan-service";

const AnalyzeSingleSchema = z.object({
  platform: z.enum(["instagram", "tiktok"]),
  username: z
    .string()
    .min(1, "Username is required")
    .max(100, "Username is too long"),
  forceRefresh: z.boolean().optional().default(false),
  /** Paired username on the OTHER platform (for identity linking) */
  pairedWith: z.string().min(1).optional(),
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
      limitations.push("Live data via Meta Graph API. View counts available for Reels on professional/creator accounts.");
    } else if (source === "instagram-apify") {
      limitations.push("Apify fallback (Meta credentials not configured). View counts are real video play counts.");
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
    // ── M1: Check durable cache first ─────────────────────────────────────
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

    // ── M2: Persist items to warehouse ────────────────────────────────────
    await ingestContentItems(providerResult.items, platform, username);

    // ── M3: Update scan profile ──────────────────────────────────────────
    await updateScanProfile(platform, username, providerResult);

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

    let storyVisibility = null;
    let carouselVisibility = null;
    if (platform === "instagram") {
      const followerCount = providerResult.profile?.followerCount ?? null;
      const avgReelViews = benchmark.organic.averageViews;
      storyVisibility = estimateStoryVisibility(followerCount, avgReelViews);

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

  const parseResult = AnalyzeSingleSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: parseResult.error.issues.map((i) => i.message).join("; ") } },
      { status: 400 }
    );
  }

  const { platform, username, pairedWith } = parseResult.data;
  const result = await analyzePlatform(platform, username, parseResult.data.forceRefresh);

  // ── Server-side identity linking ──
  // When pair context is provided, create/update identity at write time
  // This ensures identity rows exist before the warehouse reads them
  try {
    const ig = platform === "instagram" ? username.toLowerCase().trim() : (pairedWith?.toLowerCase().trim() || null);
    const tt = platform === "tiktok" ? username.toLowerCase().trim() : (pairedWith?.toLowerCase().trim() || null);
    // Always call ensureIdentity — even for single-platform (ig or tt alone)
    ensureIdentity(ig, tt);
  } catch (err) {
    // Identity linking failure should not fail the analyze response
    console.error("[analyze-single] Identity linking error:", err);
  }

  // Logical analysis failures get HTTP 502 — the fetch succeeded but the
  // platform analysis itself failed (provider error, memory limit, etc.)
  if (result.status === "error") {
    return NextResponse.json(result, { status: 502 });
  }

  return NextResponse.json(result);
}
