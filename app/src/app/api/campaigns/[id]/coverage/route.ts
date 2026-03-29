/**
 * GET /api/campaigns/[id]/coverage — Campaign coverage summary
 *
 * Joins campaign's brand + date range against coverage posts
 * to compute per-platform gap counts and overall coverage rate.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { campaign, coveragePost } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const { id } = await params;

  try {
    // Get campaign
    const whereClause = team
      ? and(eq(campaign.id, id), eq(campaign.teamId, team.teamId))
      : eq(campaign.id, id);

    const campaigns = await db
      .select()
      .from(campaign)
      .where(whereClause)
      .limit(1);

    if (campaigns.length === 0) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const camp = campaigns[0];

    if (!camp.brandId) {
      return NextResponse.json({
        campaignId: id,
        brandId: null,
        totalPosts: 0,
        platformBreakdown: [],
        message: "No brand linked to this campaign",
      });
    }

    // Query coverage posts for brand, optionally filtered by date range
    const conditions = [eq(coveragePost.brandId, camp.brandId)];

    if (camp.startDate) {
      conditions.push(gte(coveragePost.publishedAt, camp.startDate));
    }
    if (camp.endDate) {
      // Add 1 day to endDate to be inclusive
      const endPlusOne = new Date(camp.endDate);
      endPlusOne.setDate(endPlusOne.getDate() + 1);
      conditions.push(lte(coveragePost.publishedAt, endPlusOne.toISOString()));
    }

    // Get platform-level stats
    const platformStats = await db
      .select({
        platform: coveragePost.platform,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(coveragePost)
      .where(and(...conditions))
      .groupBy(coveragePost.platform);

    // Get cluster coverage stats
    const clusterStats = await db
      .select({
        clusterFingerprint: coveragePost.clusterFingerprint,
        platformCount: sql<number>`count(DISTINCT ${coveragePost.platform})`.as("platformCount"),
        platforms: sql<string>`group_concat(DISTINCT ${coveragePost.platform})`.as("platforms"),
      })
      .from(coveragePost)
      .where(and(...conditions))
      .groupBy(coveragePost.clusterFingerprint);

    // Expected platforms for this brand
    const ALL_PLATFORMS = ["instagram", "tiktok", "facebook", "youtube", "pinterest"];
    
    const totalClusters = clusterStats.filter(c => c.clusterFingerprint).length;
    const fullyCoveredClusters = clusterStats.filter(
      (c) => c.clusterFingerprint && c.platformCount >= 3 // at least 3 platforms = considered covered
    ).length;
    const gapClusters = totalClusters - fullyCoveredClusters;

    const totalPosts = platformStats.reduce((sum, p) => sum + p.count, 0);

    return NextResponse.json({
      campaignId: id,
      brandId: camp.brandId,
      dateRange: {
        start: camp.startDate,
        end: camp.endDate,
      },
      totalPosts,
      totalClusters,
      fullyCoveredClusters,
      gapClusters,
      coverageRate: totalClusters > 0
        ? Math.round((fullyCoveredClusters / totalClusters) * 100)
        : 0,
      platformBreakdown: platformStats.map((p) => ({
        platform: p.platform,
        postCount: p.count,
      })),
      platforms: ALL_PLATFORMS,
    });
  } catch (err) {
    console.error(`[GET /api/campaigns/${id}/coverage] Error:`, err);
    return NextResponse.json(
      { error: "Failed to compute coverage summary" },
      { status: 500 }
    );
  }
}
