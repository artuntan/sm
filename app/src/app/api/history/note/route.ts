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
import { z } from "zod";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const UpdateNoteSchema = z.object({
  runId: z.string().min(1),
  note: z.string().max(2000),
});

export async function PATCH(request: NextRequest) {
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

  const parsed = UpdateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      { status: 422 }
    );
  }
  const { runId, note } = parsed.data;

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
