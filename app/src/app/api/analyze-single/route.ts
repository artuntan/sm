/**
 * POST /api/analyze-single
 *
 * Single-platform analysis endpoint for the batch workspace.
 * Accepts { platform: "instagram" | "tiktok", username: string }
 * Returns PlatformAnalysis (with profile, benchmarks, visibility, source, limitations).
 *
 * This is the primitive the batch queue calls per-handle.
 * Delegates to analyzeCreator() from analyze-service.
 */
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireApproved } from "@/lib/auth/guards";
import { checkRateLimit, expensiveApiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { analyzeCreatorWithIdentity } from "@/lib/services/analyze-service";
import {
  attachRequestId,
  getOrCreateRequestId,
} from "@/lib/logging/request-context";
import { getRouteLogger } from "@/lib/logging/logger";

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

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request);
  const routeLogger = getRouteLogger(
    request,
    "/api/analyze-single",
    {},
    requestId
  );

  // Auth guard
  const user = await requireApproved();
  if (user instanceof NextResponse) return attachRequestId(user, requestId);

  // Rate limit
  const limited = await checkRateLimit(expensiveApiLimiter, "analyze-single");
  if (limited) return attachRequestId(limited, requestId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return attachRequestId(
      NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." } },
        { status: 400 }
      ),
      requestId
    );
  }

  const parseResult = AnalyzeSingleSchema.safeParse(body);
  if (!parseResult.success) {
    return attachRequestId(
      NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: parseResult.error.issues.map((i) => i.message).join("; ") } },
        { status: 400 }
      ),
      requestId
    );
  }

  const { platform, username, pairedWith, forceRefresh } = parseResult.data;
  const result = await analyzeCreatorWithIdentity(platform, username, {
    forceRefresh,
    pairedWith,
  });

  // Logical analysis failures get HTTP 502 — the fetch succeeded but the
  // platform analysis itself failed (provider error, memory limit, etc.)
  if (result.status === "error") {
    return attachRequestId(NextResponse.json(result, { status: 502 }), requestId);
  }

  return attachRequestId(NextResponse.json(result), requestId);
}
