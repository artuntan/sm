jest.mock("@/lib/auth/guards", () => ({
  requireApproved: jest.fn(),
  requireTeamMemberOrSystemAdmin: jest.fn(),
}));

jest.mock("@/lib/services/job-service", () => ({
  enqueueJob: jest.fn(),
  getJobDetails: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST as enqueueBatch } from "@/app/api/analyze-all/route";
import { GET as getBatchJob } from "@/app/api/batch-jobs/[id]/route";
import {
  BATCH_ANALYSIS_JOB_KIND,
  createBatchAnalysisHandler,
} from "@/lib/jobs/handlers/batch-analysis";
import {
  requireApproved,
  requireTeamMemberOrSystemAdmin,
} from "@/lib/auth/guards";
import { enqueueJob, getJobDetails } from "@/lib/services/job-service";
import type { PlatformAnalysis } from "@/lib/domain/types";
import type { JobAttemptRecord, JobRecord } from "@/lib/jobs/types";

const mockRequireApproved = requireApproved as jest.MockedFunction<
  typeof requireApproved
>;
const mockRequireTeamMemberOrSystemAdmin =
  requireTeamMemberOrSystemAdmin as jest.MockedFunction<
    typeof requireTeamMemberOrSystemAdmin
  >;
const mockEnqueueJob = enqueueJob as jest.MockedFunction<typeof enqueueJob>;
const mockGetJobDetails = getJobDetails as jest.MockedFunction<typeof getJobDetails>;

function makePlatformAnalysis(
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
      averageViews: 1200,
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
    source: platform === "instagram" ? "mock" : "tiktok-mock",
    totalContentCount: 5,
    limitations: [],
    status: "ok",
    ...overrides,
  };
}

function makeJob(
  overrides: Partial<JobRecord> = {}
): JobRecord {
  return {
    id: "job_1",
    kind: BATCH_ANALYSIS_JOB_KIND,
    status: "queued",
    teamId: "team_1",
    createdBy: "user_1",
    payloadJson: {
      rows: [
        {
          id: "row_1",
          instagramUsername: "creator_one",
          tiktokUsername: "creatortok",
          label: "Creator One",
          notes: null,
          sourceRowIndex: 1,
        },
      ],
      forceRefresh: false,
      startedAt: "2026-04-02T10:00:00.000Z",
    },
    resultJson: null,
    idempotencyKey: "batch-analysis:job_1",
    maxAttempts: 3,
    attemptCount: 0,
    priority: 100,
    availableAt: "2026-04-02T10:00:00.000Z",
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
    lastError: null,
    parentJobId: null,
    createdAt: "2026-04-02T10:00:00.000Z",
    updatedAt: "2026-04-02T10:00:00.000Z",
    ...overrides,
  };
}

function makeAttempt(
  overrides: Partial<JobAttemptRecord> = {}
): JobAttemptRecord {
  return {
    id: "job_attempt_1",
    jobId: "job_1",
    attemptNumber: 1,
    status: "running",
    error: null,
    startedAt: "2026-04-02T10:00:00.000Z",
    completedAt: null,
    createdAt: "2026-04-02T10:00:00.000Z",
    ...overrides,
  };
}

describe("Task 5 batch jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("enqueues a durable batch job for submitted rows", async () => {
    mockRequireTeamMemberOrSystemAdmin.mockResolvedValue({
      user: {
        id: "user_1",
        name: "Test User",
        email: "test@example.com",
        systemRole: "user",
        approvalStatus: "approved",
      },
      team: {
        teamId: "team_1",
        teamName: "Team One",
        teamSlug: "team-one",
        role: "team_admin",
      },
    });

    mockRequireApproved.mockResolvedValue({
      id: "user_1",
      name: "Test User",
      email: "test@example.com",
      systemRole: "user",
      approvalStatus: "approved",
    });

    mockEnqueueJob.mockResolvedValue(makeJob());

    const response = await enqueueBatch(
      new NextRequest("http://localhost:3000/api/analyze-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            {
              id: "row_1",
              instagramUsername: "creator_one",
              tiktokUsername: "creatortok",
              label: "Creator One",
              notes: null,
              sourceRowIndex: 1,
            },
          ],
          forceRefresh: true,
        }),
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      jobId: "job_1",
      status: "queued",
      statusUrl: "/api/batch-jobs/job_1",
    });

    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: BATCH_ANALYSIS_JOB_KIND,
        teamId: "team_1",
        createdBy: "user_1",
        payload: expect.objectContaining({
          rows: [
            expect.objectContaining({
              instagramUsername: "creator_one",
              tiktokUsername: "creatortok",
            }),
          ],
          forceRefresh: true,
        }),
      })
    );
  });

  it("returns batch job progress for the active team", async () => {
    mockRequireTeamMemberOrSystemAdmin.mockResolvedValue({
      user: {
        id: "user_1",
        name: "Test User",
        email: "test@example.com",
        systemRole: "user",
        approvalStatus: "approved",
      },
      team: {
        teamId: "team_1",
        teamName: "Team One",
        teamSlug: "team-one",
        role: "team_admin",
      },
    });

    mockGetJobDetails.mockResolvedValue({
      job: makeJob({
        status: "completed",
        resultJson: {
          version: 1,
          phase: "completed",
          historyRunId: "run_1",
          handleJobs: {
            "instagram:creator_one": {
              platform: "instagram",
              username: "creator_one",
              status: "success",
              attempts: 1,
              maxAttempts: 3,
              error: null,
              result: makePlatformAnalysis("instagram", "creator_one"),
            },
            "tiktok:creatortok": {
              platform: "tiktok",
              username: "creatortok",
              status: "success",
              attempts: 1,
              maxAttempts: 3,
              error: null,
              result: makePlatformAnalysis("tiktok", "creatortok"),
            },
          },
        },
      }),
      attempts: [makeAttempt({ status: "completed", completedAt: "2026-04-02T10:01:00.000Z" })],
    });

    const response = await getBatchJob(
      new NextRequest("http://localhost:3000/api/batch-jobs/job_1"),
      { params: Promise.resolve({ id: "job_1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "job_1",
      kind: BATCH_ANALYSIS_JOB_KIND,
      status: "completed",
      historyRunId: "run_1",
      rows: [
        expect.objectContaining({
          instagramUsername: "creator_one",
          tiktokUsername: "creatortok",
        }),
      ],
      summary: expect.objectContaining({
        totalRows: 1,
        completeRows: 1,
      }),
      attempts: [expect.objectContaining({ status: "completed" })],
    });
  });

  it("runs a server-side batch handler and persists the final history run", async () => {
    const analyzePlatform = jest
      .fn()
      .mockResolvedValueOnce(makePlatformAnalysis("instagram", "creator_one"))
      .mockResolvedValueOnce(makePlatformAnalysis("tiktok", "creatortok"));
    const persistAnalysisRun = jest.fn().mockResolvedValue("run_1");
    const saveProgress = jest.fn().mockResolvedValue(undefined);

    const handler = createBatchAnalysisHandler({
      analyzePlatform,
      persistAnalysisRun,
      now: () => new Date("2026-04-02T10:00:00.000Z"),
    });

    const result = await handler({
      job: makeJob(),
      attempt: makeAttempt(),
      saveProgress,
    });

    expect(analyzePlatform).toHaveBeenCalledTimes(2);
    expect(saveProgress).toHaveBeenCalled();
    expect(persistAnalysisRun).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team_1",
        userId: "user_1",
        rows: expect.any(Array),
        rowResults: expect.any(Array),
      })
    );
    expect(result).toMatchObject({
      version: 1,
      phase: "completed",
      historyRunId: "run_1",
      summary: expect.objectContaining({
        totalRows: 1,
        completeRows: 1,
      }),
    });
  });
});
