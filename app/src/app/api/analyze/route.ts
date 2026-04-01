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
import * as Sentry from "@sentry/nextjs";
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
import {
  attachRequestId,
  getOrCreateRequestId,
} from "@/lib/logging/request-context";
import { getRouteLogger } from "@/lib/logging/logger";

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
  const requestId = getOrCreateRequestId(request);
  const routeLogger = getRouteLogger(request, "/api/analyze", {}, requestId);

  // Auth guard
  const user = await requireApproved();
  if (user instanceof NextResponse) return attachRequestId(user, requestId);

  // Rate limit
  const limited = await checkRateLimit(expensiveApiLimiter, "analyze");
  if (limited) return attachRequestId(limited, requestId);

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return attachRequestId(
      errorResponse({
        code: "INVALID_USERNAME",
        message: "Request body must be valid JSON with a 'username' field.",
        statusCode: 400,
      }),
      requestId
    );
  }

  const parseResult = AnalyzeRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const message = parseResult.error.issues
      .map((i) => i.message)
      .join("; ");
    return attachRequestId(
      errorResponse({
        code: "INVALID_USERNAME",
        message,
        statusCode: 400,
      }),
      requestId
    );
  }

  const platform = parseResult.data.platform;
  const username = normalizeUsername(parseResult.data.username);
  const forceRefresh = parseResult.data.forceRefresh;

  // Platform-specific username format validation
  const usernameError = validateUsername(username, platform);
  if (usernameError) {
    return attachRequestId(
      errorResponse({
        code: "INVALID_USERNAME",
        message: usernameError,
        statusCode: 400,
      }),
      requestId
    );
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
      return attachRequestId(
        errorResponse({
          code: platform === "tiktok" ? "ZERO_CONTENT" : "ZERO_REELS",
          message: `No ${contentLabel} found for @${username}. The account may have no ${contentLabel}.`,
          statusCode: 404,
        }),
        requestId
      );
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

    return attachRequestId(NextResponse.json(result), requestId);
  } catch (err) {
    if (err instanceof ProviderError) {
      return attachRequestId(
        errorResponse({
          code: err.code as AnalyzeError["code"],
          message: err.message,
          statusCode: err.statusCode,
        }),
        requestId
      );
    }

    routeLogger.error({ err }, "Unexpected error during analysis request");
    Sentry.captureException(err, {
      tags: { route: "/api/analyze" },
      extra: { requestId },
    });

    return attachRequestId(
      errorResponse({
        code: "UNKNOWN_ERROR",
        message: "An unexpected error occurred. Please try again.",
        statusCode: 500,
      }),
      requestId
    );
  }
}
