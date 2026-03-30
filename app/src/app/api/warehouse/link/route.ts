/**
 * POST /api/warehouse/link
 *
 * Links Instagram and TikTok usernames as belonging to the same influencer.
 * Uses the canonical identity service for merge-safe linking.
 *
 * Body: { instagramUsername?: string, tiktokUsername?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureIdentity } from "@/lib/services/identity-service";

const LinkSchema = z.object({
  instagramUsername: z.string().min(1).optional(),
  tiktokUsername: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = LinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ig = parsed.data.instagramUsername || null;
  const tt = parsed.data.tiktokUsername || null;

  if (!ig && !tt) {
    return NextResponse.json({ error: "At least one username required" }, { status: 400 });
  }

  try {
    const id = ensureIdentity(ig, tt);
    return NextResponse.json({ id, action: "linked" });
  } catch (err) {
    console.error("[warehouse/link] Error:", err);
    return NextResponse.json(
      { error: "Failed to link identity" },
      { status: 500 }
    );
  }
}

