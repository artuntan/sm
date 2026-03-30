/**
 * POST /api/campaigns/[id]/scan-creators — Scan Creator Accounts for Deliverables
 *
 * The core Campaign Deliverable Tracking endpoint.
 *
 * Flow:
 * 1. Load campaign + linked creators
 * 2. For each creator, fetch recent posts from Instagram/TikTok via Apify
 * 3. Run each post through the brand matcher
 * 4. Save matched posts as deliverables (dedup by platform + postId)
 * 5. Return scan summary
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { campaign, campaignCreator, campaignDeliverable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { matchPostToBrand } from "@/lib/domain/deliverable-matcher";
import { getBrandById } from "@/lib/dimes/accounts";
import { InstagramApifyProvider } from "@/lib/providers/instagram-apify-provider";
import { TikTokApifyProvider } from "@/lib/providers/tiktok-apify-provider";
import type { ContentItem } from "@/lib/domain/types";

const igProvider = new InstagramApifyProvider();
const ttProvider = new TikTokApifyProvider();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const { id } = await params;

  try {
    // 1. Load campaign
    const whereClause = team
      ? and(eq(campaign.id, id), eq(campaign.teamId, team.teamId))
      : eq(campaign.id, id);

    const campaigns = await db
      .select()
      .from(campaign)
      .where(whereClause)
      .limit(1);

    if (campaigns.length === 0) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const camp = campaigns[0];

    if (!camp.brandId) {
      return NextResponse.json(
        { error: "Campaign has no linked brand. Link a brand before scanning creators." },
        { status: 400 }
      );
    }

    const brand = getBrandById(camp.brandId);
    if (!brand) {
      return NextResponse.json(
        { error: `Brand not found: ${camp.brandId}` },
        { status: 400 }
      );
    }

    // 2. Load creators
    const creators = await db
      .select()
      .from(campaignCreator)
      .where(eq(campaignCreator.campaignId, id));

    if (creators.length === 0) {
      return NextResponse.json(
        { error: "No creators linked to this campaign. Add creators first." },
        { status: 400 }
      );
    }
    // Custom match keywords
    const customKeywords: string[] = (camp.matchKeywords as string[]) ?? [];

    // 3. Scan each creator
    const now = new Date().toISOString();
    const scanResults: Array<{
      creatorId: string;
      label: string;
      platforms: string[];
      postsChecked: number;
      deliverables: number;
      errors: string[];
    }> = [];

    let totalNewDeliverables = 0;

    for (const creator of creators) {
      const creatorResult = {
        creatorId: creator.id,
        label: creator.label || creator.instagramHandle || creator.tiktokHandle || "unknown",
        platforms: [] as string[],
        postsChecked: 0,
        deliverables: 0,
        errors: [] as string[],
      };

      const allPosts: Array<{ post: ContentItem; platform: "instagram" | "tiktok" }> = [];

      // Fetch Instagram posts
      if (creator.instagramHandle) {
        try {
          const igResult = await igProvider.fetchRecentMedia(creator.instagramHandle);
          for (const item of igResult.items) {
            allPosts.push({ post: item, platform: "instagram" });
          }
          creatorResult.platforms.push("instagram");
        } catch (err) {
          creatorResult.errors.push(
            `IG @${creator.instagramHandle}: ${err instanceof Error ? err.message : "failed"}`
          );
        }
      }

      // Fetch TikTok posts
      if (creator.tiktokHandle) {
        try {
          const ttResult = await ttProvider.fetchRecentMedia(creator.tiktokHandle);
          for (const item of ttResult.items) {
            allPosts.push({ post: item, platform: "tiktok" });
          }
          creatorResult.platforms.push("tiktok");
        } catch (err) {
          creatorResult.errors.push(
            `TT @${creator.tiktokHandle}: ${err instanceof Error ? err.message : "failed"}`
          );
        }
      }

      creatorResult.postsChecked = allPosts.length;

      // 4. Match posts against brand
      for (const { post, platform } of allPosts) {
        const match = matchPostToBrand(post, brand, customKeywords);
        if (!match.matched) continue;

        // Dedup check: skip if this postId + platform already exists for this campaign
        const existing = await db
          .select({ id: campaignDeliverable.id })
          .from(campaignDeliverable)
          .where(
            and(
              eq(campaignDeliverable.campaignId, id),
              eq(campaignDeliverable.platform, platform),
              eq(campaignDeliverable.postId, post.id)
            )
          )
          .limit(1);

        if (existing.length > 0) continue;

        // Insert new deliverable
        const deliverableId = `del_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await db.insert(campaignDeliverable).values({
          id: deliverableId,
          campaignId: id,
          creatorId: creator.id,
          platform: platform as "instagram" | "tiktok",
          postId: post.id,
          permalink: post.permalink,
          caption: post.caption ? post.caption.slice(0, 500) : null,
          thumbnailUrl: post.thumbnailUrl || null,
          views: typeof post.views === "number" ? post.views : null,
          likes: typeof post.rawMetadata?.likesCount === "number"
            ? (post.rawMetadata.likesCount as number)
            : null,
          publishedAt: post.timestamp || null,
          contentKind: post.contentKind || null,
          matchType: "auto",
          matchReason: match.reason,
          detectedAt: now,
        });

        creatorResult.deliverables++;
        totalNewDeliverables++;
      }

      scanResults.push(creatorResult);
    }

    // 5. Count total deliverables for this campaign
    const allDeliverables = await db
      .select({ id: campaignDeliverable.id })
      .from(campaignDeliverable)
      .where(eq(campaignDeliverable.campaignId, id));

    return NextResponse.json({
      success: true,
      campaignId: id,
      brandName: brand.name,
      creatorsScanned: scanResults.length,
      totalPostsChecked: scanResults.reduce((s, r) => s + r.postsChecked, 0),
      newDeliverables: totalNewDeliverables,
      totalDeliverables: allDeliverables.length,
      perCreator: scanResults,
    });
  } catch (err) {
    console.error(`[POST /api/campaigns/${id}/scan-creators] Error:`, err);
    return NextResponse.json(
      { error: "Scan failed", details: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
