/**
 * History — Tags API
 *
 * PATCH — set tags on an analysis run
 *
 * Body: { runId: string, tags: string[] }
 *
 * Requires team membership or system admin.
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
  const { runId, tags } = body as { runId: string; tags: string[] };

  if (!runId || !Array.isArray(tags)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "runId and tags[] required." } },
      { status: 400 }
    );
  }

  // Normalize: lowercase, trim, deduplicate, max 10 tags
  const normalizedTags = [...new Set(
    tags.map(t => t.trim().toLowerCase()).filter(Boolean)
  )].slice(0, 10);

  // Verify run belongs to team
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
      { error: { code: "NOT_FOUND", message: "Run not found." } },
      { status: 404 }
    );
  }

  await db
    .update(analysisRun)
    .set({ tags: normalizedTags })
    .where(eq(analysisRun.id, runId));

  return NextResponse.json({ success: true, tags: normalizedTags });
}
