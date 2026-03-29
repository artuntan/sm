/**
 * POST /api/warehouse/link
 *
 * Links Instagram and TikTok usernames as belonging to the same influencer.
 * Called automatically when the workspace scans a row with both handles,
 * or can be called manually.
 *
 * Body: { instagramUsername?: string, tiktokUsername?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { influencerIdentity } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

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

  const ig = parsed.data.instagramUsername?.toLowerCase().trim() || null;
  const tt = parsed.data.tiktokUsername?.toLowerCase().trim() || null;

  if (!ig && !tt) {
    return NextResponse.json({ error: "At least one username required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Check for existing identity by either username
  let existingId: string | null = null;

  if (ig) {
    const byIg = db
      .select({ id: influencerIdentity.id })
      .from(influencerIdentity)
      .where(eq(influencerIdentity.instagramUsername, ig))
      .get();
    if (byIg) existingId = byIg.id;
  }

  if (!existingId && tt) {
    const byTt = db
      .select({ id: influencerIdentity.id })
      .from(influencerIdentity)
      .where(eq(influencerIdentity.tiktokUsername, tt))
      .get();
    if (byTt) existingId = byTt.id;
  }

  if (existingId) {
    // Update existing identity — merge usernames
    const updates: Record<string, string> = { updatedAt: now };
    if (ig) updates.instagramUsername = ig;
    if (tt) updates.tiktokUsername = tt;

    db.update(influencerIdentity)
      .set(updates)
      .where(eq(influencerIdentity.id, existingId))
      .run();

    return NextResponse.json({ id: existingId, action: "updated" });
  } else {
    // Create new identity
    const id = `identity_${Date.now()}`;
    db.insert(influencerIdentity)
      .values({
        id,
        instagramUsername: ig,
        tiktokUsername: tt,
        displayName: ig || tt,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return NextResponse.json({ id, action: "created" });
  }
}
