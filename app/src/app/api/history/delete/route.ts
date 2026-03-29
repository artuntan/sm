/**
 * History — Delete API
 *
 * DELETE — permanently delete one or more analysis runs
 *
 * Body: { runIds: string[] }
 *
 * Requires team membership (runs must belong to user's team) or system admin.
 * This is a destructive, irreversible operation.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function DELETE(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const body = await request.json();
  const { runIds } = body as { runIds: string[] };

  if (!Array.isArray(runIds) || runIds.length === 0) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "runIds array is required." } },
      { status: 400 }
    );
  }

  // Verify all runs belong to user's team (unless system admin with no team)
  if (team) {
    const existing = await db
      .select({ id: analysisRun.id })
      .from(analysisRun)
      .where(and(inArray(analysisRun.id, runIds), eq(analysisRun.teamId, team.teamId)));

    if (existing.length !== runIds.length) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Some runs not found or access denied." } },
        { status: 403 }
      );
    }
  }

  // Permanently delete
  await db
    .delete(analysisRun)
    .where(inArray(analysisRun.id, runIds));

  return NextResponse.json({ success: true, deleted: runIds.length });
}
