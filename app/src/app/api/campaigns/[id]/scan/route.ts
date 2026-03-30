/**
 * POST /api/campaigns/[id]/scan — Trigger campaign-linked coverage scan
 *
 * Runs a fast scan focused on the campaign's linked brand.
 * After scan completes, checks for coverage gaps and fires
 * the campaign's webhook if configured.
 *
 * Body: { mode?: "full" | "fast" }  — defaults to "fast"
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { campaign, coveragePost } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function POST(
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
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "full" ? "full" : "fast";

    // Trigger the scan via internal API
    const scanRes = await fetch(new URL("/api/dimes/scan", request.url).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({ mode }),
    });

    const scanData = await scanRes.json();

    // Compute post-scan gap summary for this campaign's brand
    let gapSummary = null;
    if (camp.brandId) {
      const conditions = [eq(coveragePost.brandId, camp.brandId)];

      const clusterStats = await db
        .select({
          clusterFingerprint: coveragePost.clusterFingerprint,
          platformCount: sql<number>`count(DISTINCT ${coveragePost.platform})`.as("platformCount"),
          platforms: sql<string>`group_concat(DISTINCT ${coveragePost.platform})`.as("platforms"),
        })
        .from(coveragePost)
        .where(and(...conditions))
        .groupBy(coveragePost.clusterFingerprint);

      const totalClusters = clusterStats.filter(c => c.clusterFingerprint).length;
      const gapClusters = clusterStats.filter(
        (c) => c.clusterFingerprint && c.platformCount < 3
      );

      gapSummary = {
        totalClusters,
        gapCount: gapClusters.length,
        gaps: gapClusters.slice(0, 5).map((g) => ({
          fingerprint: g.clusterFingerprint,
          presentPlatforms: g.platforms?.split(",") || [],
          platformCount: g.platformCount,
        })),
      };

      // Fire webhook if configured and there are new gaps
      const meta = (camp.meta as Record<string, unknown>) ?? {};
      const webhookUrl = meta.gapAlertWebhook;

      if (typeof webhookUrl === "string" && gapClusters.length > 0) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "campaign_gap_alert",
              campaignId: camp.id,
              campaignName: camp.name,
              brandId: camp.brandId,
              scanMode: mode,
              gapCount: gapClusters.length,
              totalClusters,
              coverageRate: totalClusters > 0
                ? Math.round(((totalClusters - gapClusters.length) / totalClusters) * 100)
                : 0,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (err) {
          console.error(`[Campaign ${id}] Webhook failed:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      campaignId: id,
      scanMode: mode,
      scanResult: {
        status: scanData.statusLabel || "UNKNOWN",
        newPosts: scanData.scanRun?.newPostsIngested || 0,
        totalPostsInDb: scanData.totalPostsInDb || 0,
        message: scanData.message,
      },
      gapSummary,
    });
  } catch (err) {
    console.error(`[POST /api/campaigns/${id}/scan] Error:`, err);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 }
    );
  }
}
