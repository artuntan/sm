/**
 * History — List API (V2)
 *
 * GET — list team history (team-scoped, paginated)
 *
 * Query params:
 *   ?q=        — search by creator handle/label within inputSummary JSON
 *   ?status=   — filter by run status (complete, partial, error)
 *   ?archived= — "1" to include archived runs, "only" for only archived (default: exclude)
 *   ?tag=      — filter by tag (runs must contain this tag)
 *   ?limit=    — max results (default 50, max 100)
 *
 * Requires active team membership or system admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun, user } from "@/lib/db/schema";
import { eq, desc, and, like, type SQL } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const params = request.nextUrl.searchParams;
  const limit = Math.min(
    parseInt(params.get("limit") || "50", 10),
    100
  );
  const statusFilter = params.get("status") || null;
  const searchQuery = params.get("q") || null;
  const archivedParam = params.get("archived") || null;

  // Build where conditions
  const conditions: SQL[] = [];

  // Team scoping — system admin with no team sees all runs
  if (team) {
    conditions.push(eq(analysisRun.teamId, team.teamId));
  }

  // Status filter
  if (statusFilter && ["complete", "partial", "error", "running"].includes(statusFilter)) {
    conditions.push(eq(analysisRun.status, statusFilter as "complete" | "partial" | "error" | "running"));
  }

  // Search — matches against inputSummary JSON via LIKE
  if (searchQuery && searchQuery.trim()) {
    conditions.push(like(analysisRun.inputSummary, `%${searchQuery.trim()}%`));
  }

  // Archive filter — default: hide archived. "1" = include all. "only" = only archived.
  if (archivedParam === "only") {
    conditions.push(eq(analysisRun.archived, true));
  } else if (archivedParam !== "1") {
    conditions.push(eq(analysisRun.archived, false));
  }

  // Tag filter — matches against tags JSON via LIKE
  const tagFilter = params.get("tag") || null;
  if (tagFilter && tagFilter.trim()) {
    conditions.push(like(analysisRun.tags, `%"${tagFilter.trim().toLowerCase()}"%`));
  }

  const baseQuery = db
    .select({
      id: analysisRun.id,
      status: analysisRun.status,
      totalRows: analysisRun.totalRows,
      completeRows: analysisRun.completeRows,
      partialRows: analysisRun.partialRows,
      errorRows: analysisRun.errorRows,
      inputSummary: analysisRun.inputSummary,
      note: analysisRun.note,
      archived: analysisRun.archived,
      tags: analysisRun.tags,
      startedAt: analysisRun.startedAt,
      completedAt: analysisRun.completedAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(analysisRun)
    .innerJoin(user, eq(analysisRun.userId, user.id));

  const runs = conditions.length > 0
    ? await baseQuery
        .where(and(...conditions))
        .orderBy(desc(analysisRun.startedAt))
        .limit(limit)
    : await baseQuery
        .orderBy(desc(analysisRun.startedAt))
        .limit(limit);

  return NextResponse.json({ runs });
}
