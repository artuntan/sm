import type { BatchImportRow } from "@/lib/domain/batch-types";
import type { PlatformAnalysis } from "@/lib/domain/types";
import { createBatchAnalysisJobHandler } from "@/lib/jobs/handlers/batch-analysis";

function makeRows(): BatchImportRow[] {
  return [
    {
      id: "row_1",
      instagramUsername: "ig_user",
      tiktokUsername: "tk_user",
      label: "Creator One",
      notes: null,
      sourceRowIndex: 1,
    },
  ];
}

function makeAnalysis(
  platform: "instagram" | "tiktok",
  username: string,
  overrides: Partial<PlatformAnalysis> = {}
): PlatformAnalysis {
  return {
    platform,
    username,
    profile: null,
    organic: {
      status: "complete",
      averageViews: 1000,
      sampleSize: 5,
      maxSampleSize: 5,
      reels: [],
      warnings: [],
    },
    commercial: {
      status: "empty",
      averageViews: null,
      sampleSize: 0,
      maxSampleSize: 5,
      reels: [],
      warnings: [],
    },
    comparison: null,
    source: platform === "instagram" ? "meta" : "tiktok-apify",
    totalContentCount: 5,
    limitations: [],
    status: "ok",
    ...overrides,
  };
}

describe("batch analysis job handler", () => {
  const now = new Date("2026-04-02T10:00:00.000Z");

  it("processes handles, persists progress, and saves the final run snapshot", async () => {
    const updateSnapshot = jest.fn().mockResolvedValue(undefined);
    const saveBatchRun = jest.fn().mockResolvedValue({ runId: "run_1" });
    const analyzeHandle = jest
      .fn()
      .mockResolvedValueOnce(makeAnalysis("instagram", "ig_user"))
      .mockResolvedValueOnce(
        makeAnalysis("tiktok", "tk_user", {
          status: "error",
          error: "actor-memory-limit-exceeded",
        })
      );

    const handler = createBatchAnalysisJobHandler({
      analyzeHandle,
      updateSnapshot,
      saveBatchRun,
      now: () => now,
    });

    const result = await handler({
      job: {
        id: "job_1",
        kind: "batch.analysis",
        status: "running",
        teamId: "team_1",
        createdBy: "user_1",
        payloadJson: {
          rows: makeRows(),
          forceRefresh: false,
        },
        resultJson: null,
        idempotencyKey: "batch_1",
        maxAttempts: 1,
        attemptCount: 1,
        priority: 100,
        availableAt: now.toISOString(),
        leaseExpiresAt: null,
        startedAt: now.toISOString(),
        completedAt: null,
        lastError: null,
        parentJobId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      attempt: {
        id: "attempt_1",
        jobId: "job_1",
        attemptNumber: 1,
        status: "running",
        error: null,
        startedAt: now.toISOString(),
        completedAt: null,
        createdAt: now.toISOString(),
      },
    });

    expect(analyzeHandle).toHaveBeenCalledTimes(2);
    expect(updateSnapshot).toHaveBeenCalled();
    expect(saveBatchRun).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team_1",
        userId: "user_1",
        status: "partial",
      })
    );
    expect(result).toMatchObject({
      runId: "run_1",
      summary: {
        totalRows: 1,
        partialRows: 1,
      },
      rowResults: [
        expect.objectContaining({
          status: "partial",
        }),
      ],
    });
  });

  it("retries transient handle failures inside the server-side batch flow", async () => {
    const updateSnapshot = jest.fn().mockResolvedValue(undefined);
    const saveBatchRun = jest.fn().mockResolvedValue({ runId: "run_2" });
    const analyzeHandle = jest
      .fn()
      .mockResolvedValueOnce(makeAnalysis("instagram", "ig_user"))
      .mockRejectedValueOnce(new Error("temporary upstream failure"))
      .mockResolvedValueOnce(makeAnalysis("tiktok", "tk_user"));

    const handler = createBatchAnalysisJobHandler({
      analyzeHandle,
      updateSnapshot,
      saveBatchRun,
      now: () => now,
      retryDelayMs: () => 0,
    });

    const result = await handler({
      job: {
        id: "job_2",
        kind: "batch.analysis",
        status: "running",
        teamId: "team_1",
        createdBy: "user_1",
        payloadJson: {
          rows: makeRows(),
          forceRefresh: false,
        },
        resultJson: null,
        idempotencyKey: "batch_2",
        maxAttempts: 1,
        attemptCount: 1,
        priority: 100,
        availableAt: now.toISOString(),
        leaseExpiresAt: null,
        startedAt: now.toISOString(),
        completedAt: null,
        lastError: null,
        parentJobId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      attempt: {
        id: "attempt_2",
        jobId: "job_2",
        attemptNumber: 1,
        status: "running",
        error: null,
        startedAt: now.toISOString(),
        completedAt: null,
        createdAt: now.toISOString(),
      },
    });

    expect(analyzeHandle).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      runId: "run_2",
      summary: {
        totalRows: 1,
        completeRows: 1,
        partialRows: 0,
        errorRows: 0,
      },
      rowResults: [
        expect.objectContaining({
          status: "complete",
        }),
      ],
    });
  });
});
