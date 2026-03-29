/**
 * Admin Analytics API — Read-Only
 *
 * GET — returns team productivity ratios and time-saved metrics
 * derived from real analysis_run data.
 *
 * Requires system_admin role.
 *
 * ── Manual-Time Estimation Formula ──────────────────────────────────────────
 *
 * For each analysis run, we estimate the manual effort that would have been
 * required without automation:
 *
 *   estimatedManualMinutes =
 *       6                                     // baseline: open tools, set up context
 *     + creatorCount * 0.9                    // per-creator overhead (navigate, copy, organize)
 *     + platformHandleCount * 0.75            // per-handle lookup (find profile, open page)
 *     + successfulPlatformAnalyses * 0.3      // per-analysis processing (extract metrics, benchmark)
 *     + partialRows * 0.4                     // partial results still require review
 *     + errorRows * 0.6                       // errors require investigation and retry
 *
 * Calibration: 100 creators × 2 platforms ≈ 6 + 90 + 150 + 60 + 0 + 0 = 306 min ≈ 5.1 hours
 *
 * Derived metrics:
 *   actualAutomationMinutes = max((completedAt - startedAt) / 60000, 0.5)
 *   runTimeSavedMinutes = max(estimatedManualMinutes - actualAutomationMinutes, 0)
 *   teamProductivityRatio = sum(estimatedManual) / max(sum(actualAutomation), 0.5)
 *   totalTimeSavedMinutes = sum(runTimeSavedMinutes)
 */

import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun, team as teamTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Manual-time estimation
// ---------------------------------------------------------------------------

function estimateManualMinutes(run: {
  totalRows: number;
  completeRows: number;
  partialRows: number;
  errorRows: number;
  inputSummary: string;
  resultSnapshot: string;
}): number {
  const creatorCount = run.totalRows;

  // Count platform handles from inputSummary JSON
  let platformHandleCount = 0;
  try {
    const handles: { instagram?: string; tiktok?: string }[] = JSON.parse(run.inputSummary);
    for (const h of handles) {
      if (h.instagram) platformHandleCount++;
      if (h.tiktok) platformHandleCount++;
    }
  } catch {
    platformHandleCount = creatorCount; // fallback
  }

  // Count successful platform analyses from resultSnapshot
  let successfulPlatformAnalyses = 0;
  try {
    const results: { instagram?: { status?: string } | null; tiktok?: { status?: string } | null }[] = JSON.parse(run.resultSnapshot);
    for (const r of results) {
      if (r.instagram && r.instagram.status !== "error") successfulPlatformAnalyses++;
      if (r.tiktok && r.tiktok.status !== "error") successfulPlatformAnalyses++;
    }
  } catch {
    successfulPlatformAnalyses = run.completeRows;
  }

  return (
    6 +
    creatorCount * 0.9 +
    platformHandleCount * 0.75 +
    successfulPlatformAnalyses * 0.3 +
    run.partialRows * 0.4 +
    run.errorRows * 0.6
  );
}

function actualMinutes(startedAt: Date | string | number, completedAt: Date | string | number | null): number {
  if (!completedAt) return 0.5;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return Math.max(ms / 60000, 0.5);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET() {
  const result = await requireSystemAdmin();
  if (result instanceof NextResponse) return result;

  // Fetch all runs with team context
  const runs = await db
    .select({
      id: analysisRun.id,
      teamId: analysisRun.teamId,
      totalRows: analysisRun.totalRows,
      completeRows: analysisRun.completeRows,
      partialRows: analysisRun.partialRows,
      errorRows: analysisRun.errorRows,
      inputSummary: analysisRun.inputSummary,
      resultSnapshot: analysisRun.resultSnapshot,
      startedAt: analysisRun.startedAt,
      completedAt: analysisRun.completedAt,
      teamName: teamTable.name,
    })
    .from(analysisRun)
    .innerJoin(teamTable, eq(analysisRun.teamId, teamTable.id));

  // Aggregate per team
  const teamMap = new Map<string, {
    teamId: string;
    teamName: string;
    runCount: number;
    totalManualMinutes: number;
    totalAutoMinutes: number;
    totalTimeSavedMinutes: number;
    totalCreators: number;
  }>();

  let globalManual = 0;
  let globalAuto = 0;
  let globalSaved = 0;
  let globalRuns = 0;
  let globalCreators = 0;

  for (const run of runs) {
    const manual = estimateManualMinutes(run);
    const auto = actualMinutes(run.startedAt, run.completedAt);
    const saved = Math.max(manual - auto, 0);

    globalManual += manual;
    globalAuto += auto;
    globalSaved += saved;
    globalRuns++;
    globalCreators += run.totalRows;

    const existing = teamMap.get(run.teamId);
    if (existing) {
      existing.runCount++;
      existing.totalManualMinutes += manual;
      existing.totalAutoMinutes += auto;
      existing.totalTimeSavedMinutes += saved;
      existing.totalCreators += run.totalRows;
    } else {
      teamMap.set(run.teamId, {
        teamId: run.teamId,
        teamName: run.teamName,
        runCount: 1,
        totalManualMinutes: manual,
        totalAutoMinutes: auto,
        totalTimeSavedMinutes: saved,
        totalCreators: run.totalRows,
      });
    }
  }

  // Build team productivity rankings (sorted by ratio desc)
  const teamProductivity = Array.from(teamMap.values())
    .map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      runCount: t.runCount,
      totalCreators: t.totalCreators,
      manualMinutes: Math.round(t.totalManualMinutes * 10) / 10,
      autoMinutes: Math.round(t.totalAutoMinutes * 10) / 10,
      timeSavedMinutes: Math.round(t.totalTimeSavedMinutes * 10) / 10,
      productivityRatio: Math.round((t.totalManualMinutes / Math.max(t.totalAutoMinutes, 0.5)) * 10) / 10,
    }))
    .sort((a, b) => b.productivityRatio - a.productivityRatio);

  return NextResponse.json({
    global: {
      totalRuns: globalRuns,
      totalCreators: globalCreators,
      avgCreatorsPerRun: globalRuns > 0 ? Math.round((globalCreators / globalRuns) * 10) / 10 : 0,
      manualMinutes: Math.round(globalManual * 10) / 10,
      autoMinutes: Math.round(globalAuto * 10) / 10,
      timeSavedMinutes: Math.round(globalSaved * 10) / 10,
      productivityRatio: Math.round((globalManual / Math.max(globalAuto, 0.5)) * 10) / 10,
    },
    teamProductivity,
    formula: {
      description: "estimatedManualMinutes = 6 + creatorCount×0.9 + platformHandleCount×0.75 + successfulAnalyses×0.3 + partialRows×0.4 + errorRows×0.6",
      calibration: "100 creators × 2 platforms ≈ 5.1 manual hours",
    },
  });
}
