/**
 * History — Note API
 *
 * PATCH — update the note on an analysis run
 *
 * Body: { runId: string, note: string }
 *
 * Requires team membership (run must belong to user's team) or system admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const body = await request.json();
  const { runId, note } = body as { runId: string; note: string };

  if (!runId) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "runId is required." } },
      { status: 400 }
    );
  }

  // Verify run exists and belongs to user's team
  const whereClause = team
    ? and(eq(analysisRun.id, runId), eq(analysisRun.teamId, team.teamId))
    : eq(analysisRun.id, runId);

  const existing = await db
    .select({ id: analysisRun.id })
    .from(analysisRun)
    .where(whereClause)
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Run not found or access denied." } },
      { status: 404 }
    );
  }

  // Update note (allow empty string to clear)
  await db
    .update(analysisRun)
    .set({ note: note?.trim() || null })
    .where(eq(analysisRun.id, runId));

  return NextResponse.json({ success: true });
}
