/**
 * History — Detail API
 *
 * GET — get a single run's full result snapshot
 *
 * Requires active team membership + run must belong to same team.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const { runId } = await params;

  // Build query — system admin with no team can access any run
  const whereClause = team
    ? and(eq(analysisRun.id, runId), eq(analysisRun.teamId, team.teamId))
    : eq(analysisRun.id, runId);

  const runs = await db
    .select({
      id: analysisRun.id,
      teamId: analysisRun.teamId,
      status: analysisRun.status,
      totalRows: analysisRun.totalRows,
      completeRows: analysisRun.completeRows,
      partialRows: analysisRun.partialRows,
      errorRows: analysisRun.errorRows,
      inputSummary: analysisRun.inputSummary,
      resultSnapshot: analysisRun.resultSnapshot,
      note: analysisRun.note,
      archived: analysisRun.archived,
      tags: analysisRun.tags,
      startedAt: analysisRun.startedAt,
      completedAt: analysisRun.completedAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(analysisRun)
    .innerJoin(user, eq(analysisRun.userId, user.id))
    .where(whereClause)
    .limit(1);

  if (runs.length === 0) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Run not found." } },
      { status: 404 }
    );
  }

  const run = runs[0];
  return NextResponse.json({
    ...run,
    inputSummary: JSON.parse(run.inputSummary as string),
    resultSnapshot: JSON.parse(run.resultSnapshot as string),
  });
}
