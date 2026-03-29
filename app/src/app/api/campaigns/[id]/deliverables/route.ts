/**
 * POST /api/campaigns/[id]/deliverables — Manually add a deliverable
 *
 * Allows operators to manually link a post URL that wasn't auto-detected.
 *
 * Body: {
 *   creatorId: string,    // campaign_creator ID
 *   platform: "instagram" | "tiktok",
 *   permalink: string,    // the post URL
 *   caption?: string,
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { campaign, campaignCreator, campaignDeliverable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const { id } = await params;

  let body: { creatorId?: string; platform?: string; permalink?: string; caption?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { creatorId, platform, permalink, caption } = body;

  if (!creatorId || !platform || !permalink) {
    return NextResponse.json(
      { error: "Required: creatorId, platform, permalink" },
      { status: 400 }
    );
  }

  if (platform !== "instagram" && platform !== "tiktok") {
    return NextResponse.json(
      { error: "platform must be 'instagram' or 'tiktok'" },
      { status: 400 }
    );
  }

  try {
    // Verify campaign
    const whereClause = team
      ? and(eq(campaign.id, id), eq(campaign.teamId, team.teamId))
      : eq(campaign.id, id);

    const campaigns = await db.select().from(campaign).where(whereClause).limit(1);
    if (campaigns.length === 0) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Verify creator belongs to campaign
    const creators = await db
      .select()
      .from(campaignCreator)
      .where(
        and(
          eq(campaignCreator.id, creatorId),
          eq(campaignCreator.campaignId, id)
        )
      )
      .limit(1);

    if (creators.length === 0) {
      return NextResponse.json(
        { error: "Creator not found in this campaign" },
        { status: 404 }
      );
    }

    // Extract postId from permalink
    const postId = extractPostId(permalink, platform) || `manual_${Date.now()}`;

    // Dedup check
    const existing = await db
      .select({ id: campaignDeliverable.id })
      .from(campaignDeliverable)
      .where(
        and(
          eq(campaignDeliverable.campaignId, id),
          eq(campaignDeliverable.platform, platform),
          eq(campaignDeliverable.postId, postId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: "This post is already linked" }, { status: 409 });
    }

    const deliverableId = `del_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await db.insert(campaignDeliverable).values({
      id: deliverableId,
      campaignId: id,
      creatorId,
      platform,
      postId,
      permalink,
      caption: caption?.slice(0, 500) || null,
      thumbnailUrl: null,
      views: null,
      likes: null,
      publishedAt: null,
      contentKind: null,
      matchType: "manual",
      matchReason: "manually_added",
      detectedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      deliverable: {
        id: deliverableId,
        postId,
        permalink,
        platform,
        matchType: "manual",
      },
    });
  } catch (err) {
    console.error(`[POST /api/campaigns/${id}/deliverables] Error:`, err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

function extractPostId(permalink: string, platform: string): string | null {
  try {
    const url = new URL(permalink);
    if (platform === "instagram") {
      // https://www.instagram.com/p/ABC123/ or /reel/ABC123/
      const match = url.pathname.match(/\/(?:p|reel)\/([^/]+)/);
      return match?.[1] || null;
    }
    if (platform === "tiktok") {
      // https://www.tiktok.com/@user/video/1234567890
      const match = url.pathname.match(/\/video\/(\d+)/);
      return match?.[1] || null;
    }
  } catch {
    // Not a valid URL
  }
  return null;
}
