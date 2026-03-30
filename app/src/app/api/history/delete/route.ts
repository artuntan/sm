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
import { z } from "zod";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

const DeleteSchema = z.object({
  runIds: z.array(z.string().min(1)).min(1),
});

export async function DELETE(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON" } },
      { status: 400 }
    );
  }

  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      { status: 422 }
    );
  }
  const { runIds } = parsed.data;

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
