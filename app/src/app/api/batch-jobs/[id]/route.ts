import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import type { BatchImportRow, BatchJobSnapshot } from "@/lib/domain/batch-types";
import {
  buildBatchJobSnapshot,
  createQueuedHandleJobs,
  deserializeHandleJobs,
} from "@/lib/domain/batch-engine";
import { getJobDetails } from "@/lib/services/job-service";
import { BATCH_ANALYSIS_JOB_KIND } from "@/lib/jobs/kinds";

function isBatchImportRow(value: unknown): value is BatchImportRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.sourceRowIndex === "number" &&
    "instagramUsername" in candidate &&
    "tiktokUsername" in candidate
  );
}

function isBatchJobSnapshot(value: unknown): value is BatchJobSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.rows) &&
    candidate.handleJobs !== null &&
    typeof candidate.handleJobs === "object"
  );
}

function isSnapshotLike(
  value: unknown
): value is Partial<BatchJobSnapshot> & { handleJobs?: Record<string, unknown> } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.version === 1 || "handleJobs" in candidate || "historyRunId" in candidate;
}

function coerceBatchSnapshot(details: Awaited<ReturnType<typeof getJobDetails>>) {
  if (!details) {
    return null;
  }

  const rows = Array.isArray(details.job.payloadJson.rows)
    ? details.job.payloadJson.rows.filter(isBatchImportRow)
    : [];

  if (isBatchJobSnapshot(details.job.resultJson)) {
    if (details.job.status === "failed" && details.job.resultJson.phase !== "failed") {
      return {
        ...details.job.resultJson,
        phase: "failed" as const,
      };
    }

    return details.job.resultJson;
  }

  if (isSnapshotLike(details.job.resultJson)) {
    return buildBatchJobSnapshot({
      rows,
      handleJobs: deserializeHandleJobs(
        (details.job.resultJson.handleJobs as Record<string, never> | undefined) ?? {}
      ),
      forceRefresh: details.job.payloadJson.forceRefresh === true,
      phase:
        details.job.status === "completed"
          ? "completed"
          : details.job.status === "failed"
            ? "failed"
            : details.job.status === "running"
              ? "running"
              : "queued",
      startedAt:
        typeof details.job.payloadJson.startedAt === "string"
          ? details.job.payloadJson.startedAt
          : details.job.startedAt ?? details.job.createdAt,
      updatedAt: details.job.updatedAt,
      historyRunId:
        typeof details.job.resultJson.historyRunId === "string"
          ? details.job.resultJson.historyRunId
          : null,
    });
  }

  return buildBatchJobSnapshot({
    rows,
    handleJobs: createQueuedHandleJobs(rows),
    forceRefresh: details.job.payloadJson.forceRefresh === true,
    phase:
      details.job.status === "completed"
        ? "completed"
        : details.job.status === "failed"
          ? "failed"
          : details.job.status === "running"
            ? "running"
            : "queued",
    startedAt:
      typeof details.job.payloadJson.startedAt === "string"
        ? details.job.payloadJson.startedAt
        : details.job.startedAt ?? details.job.createdAt,
    updatedAt: details.job.updatedAt,
    historyRunId: null,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireTeamMemberOrSystemAdmin();
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { user, team } = authResult;
  const { id } = await params;
  const details = await getJobDetails(id);

  if (!details || details.job.kind !== BATCH_ANALYSIS_JOB_KIND) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Batch job not found." } },
      { status: 404 }
    );
  }

  if (
    user.systemRole !== "system_admin" &&
    details.job.teamId !== team?.teamId
  ) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Batch job not found." } },
      { status: 404 }
    );
  }

  const snapshot = coerceBatchSnapshot(details);
  if (!snapshot) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Batch job not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: details.job.id,
    kind: details.job.kind,
    status: details.job.status,
    rows: snapshot.rows,
    handleJobs: snapshot.handleJobs,
    rowResults: snapshot.rowResults,
    summary: snapshot.summary,
    historyRunId: snapshot.historyRunId,
    attempts: details.attempts,
    lastError: details.job.lastError,
    startedAt: details.job.startedAt ?? snapshot.startedAt,
    completedAt: details.job.completedAt,
  });
}
