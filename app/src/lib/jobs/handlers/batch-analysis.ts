import { handleJobKey, type BatchImportRow, type BatchJobSnapshot } from "@/lib/domain/batch-types";
import {
  buildBatchJobSnapshot,
  createQueuedHandleJobs,
  deserializeHandleJobs,
} from "@/lib/domain/batch-engine";
import { extractUniqueHandles } from "@/lib/domain/batch-parser";
import {
  DEFAULT_BATCH_CONCURRENCY,
} from "@/lib/domain/batch-queue";
import type { Platform, PlatformAnalysis } from "@/lib/domain/types";
import {
  analyzeCreatorWithIdentity,
  buildErrorResult,
  persistBatchAnalysisRun,
} from "@/lib/services/analyze-service";
import { updateJobResult } from "@/lib/services/job-service";
import type { JobAttemptRecord, JobHandler, JobRecord } from "@/lib/jobs/types";
import { BATCH_ANALYSIS_JOB_KIND } from "@/lib/jobs/kinds";
export { BATCH_ANALYSIS_JOB_KIND } from "@/lib/jobs/kinds";

export type BatchAnalysisPayload = {
  rows: BatchImportRow[];
  forceRefresh?: boolean;
  startedAt?: string;
};

type SaveProgress = (
  jobId: string,
  snapshot: BatchJobSnapshot
) => Promise<unknown> | unknown;

type BatchJobHandlerInput = {
  job: JobRecord;
  attempt: JobAttemptRecord;
  saveProgress?: SaveProgress;
};

type AnalyzePlatform = (
  platform: Platform,
  username: string,
  options: { forceRefresh: boolean; pairedWith?: string | null }
) => Promise<PlatformAnalysis>;

type PersistAnalysisRun = (input: {
  teamId: string;
  userId: string;
  rows: BatchImportRow[];
  rowResults: BatchJobSnapshot["rowResults"];
  status: "complete" | "partial" | "error";
  startedAt: string;
  completedAt?: string;
}) => Promise<string | { runId: string }>;

type BatchAnalysisHandlerOptions = {
  analyzePlatform?: AnalyzePlatform;
  analyzeHandle?: AnalyzePlatform;
  persistAnalysisRun?: PersistAnalysisRun;
  saveBatchRun?: PersistAnalysisRun;
  saveProgress?: SaveProgress;
  updateSnapshot?: SaveProgress;
  now?: () => Date;
  retryDelayMs?: (attempt: number, platform: Platform) => number;
};

function isBatchImportRow(value: unknown): value is BatchImportRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    ("instagramUsername" in candidate) &&
    ("tiktokUsername" in candidate) &&
    typeof candidate.sourceRowIndex === "number"
  );
}

function parsePayload(payloadJson: Record<string, unknown>): BatchAnalysisPayload {
  const rows = Array.isArray(payloadJson.rows)
    ? payloadJson.rows.filter(isBatchImportRow)
    : [];

  return {
    rows,
    forceRefresh: payloadJson.forceRefresh === true,
    startedAt:
      typeof payloadJson.startedAt === "string" ? payloadJson.startedAt : undefined,
  };
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

function resolvePairUsername(row: BatchImportRow, platform: Platform): string | null {
  return platform === "instagram"
    ? row.tiktokUsername
    : row.instagramUsername;
}

function findPairUsername(
  rows: BatchImportRow[],
  platform: Platform,
  username: string
): string | null {
  const matchingRow = rows.find((row) =>
    platform === "instagram"
      ? row.instagramUsername === username
      : row.tiktokUsername === username
  );

  return matchingRow ? resolvePairUsername(matchingRow, platform) : null;
}

function toHistoryRunId(result: string | { runId: string }): string {
  return typeof result === "string" ? result : result.runId;
}

function resolveBatchStatus(
  snapshot: BatchJobSnapshot
): "complete" | "partial" | "error" {
  if (snapshot.summary.totalRows === 0) {
    return "error";
  }

  if (snapshot.summary.completeRows === snapshot.summary.totalRows) {
    return "complete";
  }

  if (snapshot.summary.errorRows === snapshot.summary.totalRows) {
    return "error";
  }

  return "partial";
}

function createInitialHandleJobs(
  rows: BatchImportRow[],
  snapshot: BatchJobSnapshot | null
) {
  if (!snapshot) {
    return createQueuedHandleJobs(rows);
  }

  const handleJobs = deserializeHandleJobs(snapshot.handleJobs);
  for (const handleJob of handleJobs.values()) {
    if (handleJob.status === "running") {
      handleJob.status = "queued";
      handleJob.error = null;
    }
  }

  return handleJobs;
}

export function getBatchSnapshotFromJob(job: JobRecord): BatchJobSnapshot {
  const payload = parsePayload(job.payloadJson);
  const existingSnapshot = isBatchJobSnapshot(job.resultJson)
    ? job.resultJson
    : null;
  const startedAt = payload.startedAt ?? job.startedAt ?? job.createdAt;
  const handleJobs = createInitialHandleJobs(payload.rows, existingSnapshot);

  return buildBatchJobSnapshot({
    rows: payload.rows,
    handleJobs,
    forceRefresh: payload.forceRefresh ?? false,
    phase: existingSnapshot?.phase ?? (
      job.status === "completed"
        ? "completed"
        : job.status === "running"
          ? "running"
          : "queued"
    ),
    startedAt,
    updatedAt: existingSnapshot?.updatedAt ?? job.updatedAt,
    completedAt: existingSnapshot?.completedAt ?? job.completedAt,
    historyRunId: existingSnapshot?.historyRunId ?? null,
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBatchAnalysisHandler({
  analyzePlatform = analyzeCreatorWithIdentity,
  analyzeHandle,
  persistAnalysisRun,
  saveBatchRun,
  saveProgress,
  updateSnapshot,
  now = () => new Date(),
  retryDelayMs = (attempt: number) => attempt * 1_000,
}: BatchAnalysisHandlerOptions = {}) {
  const analyze = analyzeHandle ?? analyzePlatform;
  const persist =
    saveBatchRun ??
    persistAnalysisRun ??
    (async (input) => persistBatchAnalysisRun(input));

  return async function batchAnalysisHandler(
    input: BatchJobHandlerInput
  ): Promise<BatchJobSnapshot> {
    const { job } = input;
    const payload = parsePayload(job.payloadJson);
    const startedAt = payload.startedAt ?? job.startedAt ?? job.createdAt;
    const existingSnapshot = isBatchJobSnapshot(job.resultJson)
      ? job.resultJson
      : null;
    const handleJobs = createInitialHandleJobs(payload.rows, existingSnapshot);
    const progressSavers = [saveProgress, updateSnapshot, input.saveProgress]
      .filter((value): value is SaveProgress => typeof value === "function");

    async function persistSnapshot(snapshot: BatchJobSnapshot) {
      await Promise.all(
        progressSavers.map((progressSaver) =>
          Promise.resolve(progressSaver(job.id, snapshot))
        )
      );
    }

    const queuedSnapshot = buildBatchJobSnapshot({
      rows: payload.rows,
      handleJobs,
      forceRefresh: payload.forceRefresh ?? false,
      phase: "running",
      startedAt,
      updatedAt: now().toISOString(),
      completedAt: null,
      historyRunId: existingSnapshot?.historyRunId ?? null,
    });

    await persistSnapshot(queuedSnapshot);

    async function processPlatformHandle(
      platform: Platform,
      username: string
    ) {
      const handleKey = handleJobKey(platform, username);
      const handleJob = handleJobs.get(handleKey);
      if (!handleJob || handleJob.status === "success" || handleJob.status === "error") {
        return;
      }

      const pairedWith = findPairUsername(payload.rows, platform, username);
      let finalResult: PlatformAnalysis | null = null;

      while (handleJob.attempts < handleJob.maxAttempts && !finalResult) {
        handleJob.status = "running";
        handleJob.attempts += 1;
        handleJob.error = null;

        await persistSnapshot(
          buildBatchJobSnapshot({
            rows: payload.rows,
            handleJobs,
            forceRefresh: payload.forceRefresh ?? false,
            phase: "running",
            startedAt,
            updatedAt: now().toISOString(),
            completedAt: null,
            historyRunId: existingSnapshot?.historyRunId ?? null,
          })
        );

        try {
          finalResult = await analyze(platform, username, {
            forceRefresh: payload.forceRefresh ?? false,
            pairedWith,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";

          if (handleJob.attempts >= handleJob.maxAttempts) {
            finalResult = buildErrorResult(platform, username, message);
            break;
          }

          await pause(retryDelayMs(handleJob.attempts, platform));
        }
      }

      if (!finalResult) {
        finalResult = buildErrorResult(platform, username, "Unknown error");
      }

      handleJob.result = finalResult;
      handleJob.error =
        finalResult.status === "error"
          ? finalResult.error ?? finalResult.limitations[0] ?? "Analysis failed"
          : null;
      handleJob.status = finalResult.status === "error" ? "error" : "success";

      await persistSnapshot(
        buildBatchJobSnapshot({
          rows: payload.rows,
          handleJobs,
          forceRefresh: payload.forceRefresh ?? false,
          phase: "running",
          startedAt,
          updatedAt: now().toISOString(),
          completedAt: null,
          historyRunId: existingSnapshot?.historyRunId ?? null,
        })
      );
    }

    async function processPlatformPool(
      platform: Platform,
      usernames: string[],
      concurrency: number
    ) {
      const queue = usernames.filter((username) => {
        const handleJob = handleJobs.get(handleJobKey(platform, username));
        return handleJob && handleJob.status !== "success" && handleJob.status !== "error";
      });

      if (queue.length === 0) {
        return;
      }

      const workerCount = Math.min(concurrency, queue.length);
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (queue.length > 0) {
            const nextUsername = queue.shift();
            if (!nextUsername) {
              return;
            }

            await processPlatformHandle(platform, nextUsername);
          }
        })
      );
    }

    const uniqueHandles = extractUniqueHandles(payload.rows);

    await Promise.all([
      processPlatformPool(
        "instagram",
        uniqueHandles.instagram,
        DEFAULT_BATCH_CONCURRENCY.instagram
      ),
      processPlatformPool(
        "tiktok",
        uniqueHandles.tiktok,
        DEFAULT_BATCH_CONCURRENCY.tiktok
      ),
    ]);

    const completedSnapshot = buildBatchJobSnapshot({
      rows: payload.rows,
      handleJobs,
      forceRefresh: payload.forceRefresh ?? false,
      phase: "completed",
      startedAt,
      updatedAt: now().toISOString(),
      completedAt: now().toISOString(),
      historyRunId: existingSnapshot?.historyRunId ?? null,
    });

    const historyRunId =
      job.teamId && job.createdBy
        ? toHistoryRunId(
            await persist({
              teamId: job.teamId,
              userId: job.createdBy,
              rows: payload.rows,
              rowResults: completedSnapshot.rowResults,
              status: resolveBatchStatus(completedSnapshot),
              startedAt,
              completedAt: now().toISOString(),
            })
          )
        : null;

    const finalSnapshot = {
      ...completedSnapshot,
      historyRunId,
      runId: historyRunId,
    } satisfies BatchJobSnapshot;

    await persistSnapshot(finalSnapshot);

    return finalSnapshot;
  } satisfies JobHandler;
}

export const createBatchAnalysisJobHandler = createBatchAnalysisHandler;

export function createRuntimeBatchAnalysisHandler() {
  return createBatchAnalysisHandler({
    saveProgress: async (jobId, snapshot) => {
      await updateJobResult(jobId, snapshot);
    },
  });
}
