/**
 * POST /api/analyze
 *
 * Platform-aware benchmark analysis endpoint.
 * Accepts { platform: "instagram" | "tiktok", username: string }
 * Returns dual benchmark AnalyzeResult.
 *
 * Backward compatible: if platform is omitted, defaults to "instagram".
 * Delegates to analyze-service for the core pipeline.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth/guards";
import { checkRateLimit, expensiveApiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { normalizeUsername } from "@/lib/domain/normalize";
import type { AnalyzeResult, AnalyzeError } from "@/lib/domain/types";
import { ProviderError } from "@/lib/providers/interface";
import {
  validateUsername,
  resolveProviderData,
  runBenchmarkPipeline,
  getLimitations,
  persistAndUpdateProfile,
} from "@/lib/services/analyze-service";

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

export async function POST(request: NextRequest) {
  // Auth guard
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  // Rate limit
  const limited = await checkRateLimit(expensiveApiLimiter, "analyze");
  if (limited) return limited;

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

  try {
    // Cache check -> provider fetch -> cache store
    const { providerResult, cacheHit, cacheInfo } =
      await resolveProviderData(platform, username, forceRefresh);

    // Run benchmark pipeline
    const benchmark = runBenchmarkPipeline(providerResult, platform);

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

    // Build limitations list
    const limitations = getLimitations(platform, providerResult.source);
    if (cacheHit) {
      limitations.push(cacheInfo);
    }

    const result: AnalyzeResult = {
      platform,
      username,
      analyzedAt: new Date().toISOString(),
      source: providerResult.source,
      cacheHit,
      organic: benchmark.organic,
      commercial: benchmark.commercial,
      comparison: benchmark.comparison,
      excludedNonReelCount: benchmark.excludedNonReelCount,
      excludedTestReelCount: benchmark.excludedTestReelCount,
      totalReelCount: benchmark.totalReelCount,
      limitations,
    };

    // Persist to warehouse + update scan profile (fire after response build)
    await persistAndUpdateProfile(providerResult, platform, username);

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
