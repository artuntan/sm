/**
 * POST /api/analyze-all
 *
 * Cross-platform benchmark analysis endpoint.
 * Accepts { instagram?: string, tiktok?: string }
 * Runs both platform fetches concurrently and returns MultiPlatformResult.
 *
 * Partial failures: one platform failing does not destroy the other's result.
 * Delegates to analyzeCreator() from analyze-service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth/guards";
import { checkRateLimit, expensiveApiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import type {
  Platform,
  PlatformAnalysis,
  MultiPlatformResult,
} from "@/lib/domain/types";
import { analyzeCreator } from "@/lib/services/analyze-service";

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

export async function POST(request: NextRequest) {
  // Auth guard
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  // Rate limit
  const limited = await checkRateLimit(expensiveApiLimiter, "analyze-all");
  if (limited) return limited;

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

  const { instagram, tiktok, forceRefresh } = parseResult.data;

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
      analyzeCreator("instagram", instagram, { forceRefresh }).then((r) => ["instagram", r])
    );
  }
  if (tiktok) {
    tasks.push(
      analyzeCreator("tiktok", tiktok, { forceRefresh }).then((r) => ["tiktok", r])
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
