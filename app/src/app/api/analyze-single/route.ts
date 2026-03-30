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
import { requireApproved } from "@/lib/auth/guards";
import { checkRateLimit, expensiveApiLimiter } from "@/lib/rate-limit";
import { ensureIdentity } from "@/lib/services/identity-service";
import { z } from "zod";
import { analyzeCreator } from "@/lib/services/analyze-service";

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
  // Auth guard
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  // Rate limit
  const limited = await checkRateLimit(expensiveApiLimiter, "analyze-single");
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

  const parseResult = AnalyzeSingleSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: parseResult.error.issues.map((i) => i.message).join("; ") } },
      { status: 400 }
    );
  }

  const { platform, username, pairedWith, forceRefresh } = parseResult.data;
  const result = await analyzeCreator(platform, username, { forceRefresh });

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
