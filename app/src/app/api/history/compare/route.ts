/**
 * History — Cross-Run Comparison API
 *
 * GET — find a specific creator across all runs for the team
 *
 * Query params:
 *   ?creator=  — creator handle to search for (required)
 *   ?platform= — "instagram" or "tiktok" (optional, default: both)
 *
 * Returns an array of { runId, runDate, runStatus, platform, followers,
 *   organicAvgViews, commercialAvgViews, adToOrganicRatio, totalContent }
 * sorted by runDate ascending (chronological for trend analysis).
 *
 * Requires team membership or system admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun } from "@/lib/db/schema";
import { eq, desc, like, and, type SQL } from "drizzle-orm";

type SnapshotRow = {
  row: {
    instagramUsername?: string | null;
    tiktokUsername?: string | null;
    label?: string | null;
  };
  instagram: PlatformData | null;
  tiktok: PlatformData | null;
};

type PlatformData = {
  platform: string;
  username: string;
  profile: { followerCount: number | null } | null;
  organic: { averageViews: number | null; sampleSize: number } | null;
  commercial: { averageViews: number | null; sampleSize: number } | null;
  comparison: { adToOrganicRatio: number | null } | null;
  totalContentCount: number;
  status: string;
};

type ComparisonPoint = {
  runId: string;
  runDate: string;
  runStatus: string;
  platform: string;
  username: string;
  followers: number | null;
  organicAvgViews: number | null;
  commercialAvgViews: number | null;
  adToOrganicRatio: number | null;
  totalContent: number;
};

export async function GET(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const params = request.nextUrl.searchParams;
  const creator = params.get("creator")?.trim().toLowerCase();
  const platformFilter = params.get("platform") || null;

  if (!creator) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "creator param required." } },
      { status: 400 }
    );
  }

  // Fetch all non-archived runs that might contain this creator
  const conditions: SQL[] = [
    like(analysisRun.inputSummary, `%${creator}%`),
    eq(analysisRun.archived, false),
  ];
  if (team) conditions.push(eq(analysisRun.teamId, team.teamId));

  const runs = await db
    .select({
      id: analysisRun.id,
      status: analysisRun.status,
      startedAt: analysisRun.startedAt,
      resultSnapshot: analysisRun.resultSnapshot,
    })
    .from(analysisRun)
    .where(and(...conditions))
    .orderBy(desc(analysisRun.startedAt))
    .limit(50);

  const points: ComparisonPoint[] = [];

  for (const run of runs) {
    let snapshot: SnapshotRow[] = [];
    try { snapshot = JSON.parse(run.resultSnapshot as string); } catch { continue; }

    const runDate = run.startedAt
      ? new Date(run.startedAt as unknown as number * 1000).toISOString()
      : "";

    for (const entry of snapshot) {
      const platforms: [string, PlatformData | null][] = [];
      if (!platformFilter || platformFilter === "instagram") {
        platforms.push(["instagram", entry.instagram]);
      }
      if (!platformFilter || platformFilter === "tiktok") {
        platforms.push(["tiktok", entry.tiktok]);
      }

      for (const [pName, pd] of platforms) {
        if (!pd) continue;
        // Match creator handle
        const handle = pd.username?.toLowerCase();
        if (handle !== creator) continue;

        points.push({
          runId: run.id,
          runDate,
          runStatus: run.status,
          platform: pName,
          username: pd.username,
          followers: pd.profile?.followerCount ?? null,
          organicAvgViews: pd.organic?.averageViews ?? null,
          commercialAvgViews: pd.commercial?.averageViews ?? null,
          adToOrganicRatio: pd.comparison?.adToOrganicRatio ?? null,
          totalContent: pd.totalContentCount ?? 0,
        });
      }
    }
  }

  // Sort chronologically (oldest first for trend)
  points.sort((a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime());

  return NextResponse.json({ creator, points });
}
