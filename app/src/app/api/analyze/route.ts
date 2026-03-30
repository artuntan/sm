/**
 * POST /api/analyze
 *
 * Platform-aware benchmark analysis endpoint.
 * Accepts { platform: "instagram" | "tiktok", username: string }
 * Returns dual benchmark AnalyzeResult.
 *
 * Backward compatible: if platform is omitted, defaults to "instagram".
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeUsername } from "@/lib/domain/normalize";
import { selectDualBenchmark, selectDualBenchmarkFromItems } from "@/lib/domain/selection";
import type { AnalyzeResult, AnalyzeError, Platform } from "@/lib/domain/types";
import { getProvider } from "@/lib/providers/factory";
import { ProviderError } from "@/lib/providers/interface";
import { getCachedProviderResult, cacheProviderResult } from "@/lib/services/scan-cache-service";
import { ingestContentItems } from "@/lib/services/media-warehouse-service";
import { updateScanProfile } from "@/lib/services/adaptive-scan-service";

const AnalyzeRequestSchema = z.object({
  platform: z
    .enum(["instagram", "tiktok"])
    .optional()
    .default("instagram"),
  username: z
    .string()
    .min(1, "Username is required")
    .max(100, "Username is too long"),
  forceRefresh: z.boolean().optional().default(false),
});

function errorResponse(error: AnalyzeError): NextResponse {
  return NextResponse.json({ error }, { status: error.statusCode });
}

/**
 * Platform-specific username validation.
 * Instagram: [a-z0-9._]{1,30}
 * TikTok: [a-z0-9._]{1,24} (TikTok allows up to 24 chars)
 */
function validateUsername(
  username: string,
  platform: Platform
): string | null {
  if (platform === "tiktok") {
    if (!/^[a-z0-9._]{1,24}$/.test(username)) {
      return "Invalid TikTok username format. Use only letters, numbers, dots, and underscores.";
    }
  } else {
    if (!/^[a-z0-9._]{1,30}$/.test(username)) {
      return "Invalid Instagram username format. Use only letters, numbers, dots, and underscores.";
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse({
      code: "INVALID_USERNAME",
      message: "Request body must be valid JSON with a 'username' field.",
      statusCode: 400,
    });
  }

  const parseResult = AnalyzeRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const message = parseResult.error.issues
      .map((i) => i.message)
      .join("; ");
    return errorResponse({
      code: "INVALID_USERNAME",
      message,
      statusCode: 400,
    });
  }

  const platform = parseResult.data.platform;
  const username = normalizeUsername(parseResult.data.username);
  const forceRefresh = parseResult.data.forceRefresh;

  // Platform-specific username format validation
  const usernameError = validateUsername(username, platform);
  if (usernameError) {
    return errorResponse({
      code: "INVALID_USERNAME",
      message: usernameError,
      statusCode: 400,
    });
  }

  // Check durable cache (unless force refresh)
  if (!forceRefresh) {
    const cached = await getCachedProviderResult(platform, username);
    if (cached) {
      // Re-run benchmark pipeline on cached raw items (always uses latest code)
      let benchmark;
      if (platform === "tiktok") {
        benchmark = selectDualBenchmarkFromItems(cached.result.items, platform);
      } else {
        benchmark = cached.result.reels
          ? selectDualBenchmark(cached.result.reels)
          : selectDualBenchmarkFromItems(cached.result.items, platform);
      }

      const result: AnalyzeResult = {
        platform,
        username,
        analyzedAt: cached.fetchedAt,
        source: cached.result.source,
        cacheHit: true,
        organic: benchmark.organic,
        commercial: benchmark.commercial,
        comparison: benchmark.comparison,
        excludedNonReelCount: benchmark.excludedNonReelCount,
        excludedTestReelCount: benchmark.excludedTestReelCount,
        totalReelCount: benchmark.totalReelCount,
        limitations: [`Cached result (${cached.freshness}, ${Math.round(cached.ageMs / 60000)}m ago)`],
      };
      return NextResponse.json(result);
    }
  }

  // Fetch from provider
  try {
    const provider = getProvider(platform);
    const providerResult = await provider.fetchRecentMedia(username);

    // Use platform-appropriate selection pipeline
    let benchmark;
    if (platform === "tiktok") {
      benchmark = selectDualBenchmarkFromItems(
        providerResult.items,
        platform
      );
    } else {
      // Instagram backward-compatible path using reels
      benchmark = providerResult.reels
        ? selectDualBenchmark(providerResult.reels)
        : selectDualBenchmarkFromItems(providerResult.items, platform);
    }

    // Both buckets empty = no content
    const contentLabel = platform === "tiktok" ? "videos" : "Reels";
    if (
      benchmark.organic.sampleSize === 0 &&
      benchmark.commercial.sampleSize === 0
    ) {
      return errorResponse({
        code: platform === "tiktok" ? "ZERO_CONTENT" : "ZERO_REELS",
        message: `No ${contentLabel} found for @${username}. The account may have no ${contentLabel}.`,
        statusCode: 404,
      });
    }

    // Build limitations list based on provider source
    const limitations: string[] = [];
    if (platform === "instagram") {
      if (providerResult.source === "mock") {
        limitations.push(
          "This result uses simulated mock data. Set APIFY_API_TOKEN for live Instagram data."
        );
      } else if (providerResult.source === "instagram-apify") {
        limitations.push(
          "Live data via Apify. View counts are real video views. Caption availability may vary by account — incomplete captions can affect benchmark validity."
        );
      }
      // Meta source: no limitations needed (official API)
    } else if (platform === "tiktok") {
      if (providerResult.source === "tiktok-mock") {
        limitations.push(
          "This result uses simulated mock data. Set APIFY_API_TOKEN for live TikTok data."
        );
      } else if (providerResult.source === "tiktok-apify") {
        limitations.push(
          "Live data via Apify managed scraping. Engagement metrics are real but may have minor delays."
        );
      } else if (providerResult.source === "tiktok-research") {
        limitations.push(
          "TikTok Research API data may have delayed engagement metrics (not guaranteed real-time)."
        );
      }
    }

    const result: AnalyzeResult = {
      platform,
      username,
      analyzedAt: new Date().toISOString(),
      source: providerResult.source,
      cacheHit: false,
      organic: benchmark.organic,
      commercial: benchmark.commercial,
      comparison: benchmark.comparison,
      excludedNonReelCount: benchmark.excludedNonReelCount,
      excludedTestReelCount: benchmark.excludedTestReelCount,
      totalReelCount: benchmark.totalReelCount,
      limitations,
    };

    // Cache the raw provider result durably
    await cacheProviderResult(platform, username, providerResult);

    // M2: Persist items to warehouse
    await ingestContentItems(providerResult.items, platform, username);

    // M3: Update scan profile
    await updateScanProfile(platform, username, providerResult);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProviderError) {
      return errorResponse({
        code: err.code as AnalyzeError["code"],
        message: err.message,
        statusCode: err.statusCode,
      });
    }

    console.error("[/api/analyze] Unexpected error:", err);
    return errorResponse({
      code: "UNKNOWN_ERROR",
      message: "An unexpected error occurred. Please try again.",
      statusCode: 500,
    });
  }
}
