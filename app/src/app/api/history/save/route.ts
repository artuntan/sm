/**
 * History — Save API (V2)
 *
 * POST — persist a completed batch run to team history
 *
 * Team resolution:
 * - If user has active team membership → use that team
 * - If system admin without membership → attribute to first active team
 * - If no teams exist → return explicit error
 *
 * Requires active team membership or system admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun, team as teamTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { user, team } = result;

  // ── Resolve teamId explicitly — never fallback to "system" ──────────────
  let resolvedTeamId: string;
  if (team?.teamId) {
    resolvedTeamId = team.teamId;
  } else {
    // System admin without team membership → attribute to first active team
    const firstTeam = await db
      .select({ id: teamTable.id })
      .from(teamTable)
      .where(eq(teamTable.active, true))
      .limit(1);

    if (firstTeam.length === 0) {
      return NextResponse.json(
        { error: { code: "NO_TEAM", message: "No active team exists. Cannot persist history without team ownership." } },
        { status: 422 }
      );
    }
    resolvedTeamId = firstTeam[0].id;
  }

  const body = await request.json();

  const {
    status,
    totalRows,
    completeRows,
    partialRows,
    errorRows,
    inputSummary,
    resultSnapshot,
    startedAt,
    schemaVersion,
  } = body as {
    status: string;
    totalRows: number;
    completeRows: number;
    partialRows: number;
    errorRows: number;
    inputSummary: unknown[];
    resultSnapshot: unknown[];
    startedAt: string;
    schemaVersion?: number;
  };

  const runId = crypto.randomUUID();

  try {
    await db.insert(analysisRun).values({
      id: runId,
      teamId: resolvedTeamId,
      userId: user.id,
      status: status as "running" | "complete" | "partial" | "error",
      totalRows: totalRows || 0,
      completeRows: completeRows || 0,
      partialRows: partialRows || 0,
      errorRows: errorRows || 0,
      inputSummary: inputSummary || [],
      resultSnapshot: resultSnapshot || [],
      schemaVersion: schemaVersion ?? 1,
      startedAt: new Date(startedAt),
      completedAt: new Date(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown DB error";
    console.error("[history/save] Insert failed:", msg);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: `Failed to persist run: ${msg}` } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, runId });
}
