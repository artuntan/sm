/**
 * History — Archive API
 *
 * PATCH — archive or unarchive one or more analysis runs
 *
 * Body: { runIds: string[], archived: boolean }
 *
 * Requires team membership (runs must belong to user's team) or system admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function PATCH(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const body = await request.json();
  const { runIds, archived } = body as { runIds: string[]; archived: boolean };

  if (!Array.isArray(runIds) || runIds.length === 0) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "runIds array is required." } },
      { status: 400 }
    );
  }

  if (typeof archived !== "boolean") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "archived must be a boolean." } },
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

  // Update archived status
  await db
    .update(analysisRun)
    .set({ archived })
    .where(inArray(analysisRun.id, runIds));

  return NextResponse.json({ success: true, affected: runIds.length });
}
