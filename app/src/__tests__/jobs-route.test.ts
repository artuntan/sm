jest.mock("@/lib/auth/guards", () => ({
  requireTeamMemberOrSystemAdmin: jest.fn(),
}));

jest.mock("@/lib/services/job-service", () => ({
  getJobDetails: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/jobs/[id]/route";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { getJobDetails } from "@/lib/services/job-service";

const mockRequireTeamMemberOrSystemAdmin =
  requireTeamMemberOrSystemAdmin as jest.MockedFunction<
    typeof requireTeamMemberOrSystemAdmin
  >;

const mockGetJobDetails = getJobDetails as jest.MockedFunction<
  typeof getJobDetails
>;

describe("GET /api/jobs/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns job details for the active team", async () => {
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
      job: {
        id: "job_1",
        kind: "batch.analysis",
        status: "queued",
        teamId: "team_1",
        createdBy: "user_1",
        payloadJson: { rows: 5 },
        resultJson: null,
        idempotencyKey: "job_1_key",
        maxAttempts: 3,
        attemptCount: 0,
        priority: 100,
        availableAt: "2026-04-01T10:00:00.000Z",
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
        parentJobId: null,
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
      attempts: [],
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/jobs/job_1"),
      { params: Promise.resolve({ id: "job_1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "job_1",
      kind: "batch.analysis",
      status: "queued",
      attempts: [],
    });
  });

  it("returns 404 when the job belongs to another team", async () => {
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
      job: {
        id: "job_2",
        kind: "batch.analysis",
        status: "queued",
        teamId: "team_2",
        createdBy: "user_2",
        payloadJson: {},
        resultJson: null,
        idempotencyKey: "job_2_key",
        maxAttempts: 3,
        attemptCount: 0,
        priority: 100,
        availableAt: "2026-04-01T10:00:00.000Z",
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
        parentJobId: null,
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
      attempts: [],
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/jobs/job_2"),
      { params: Promise.resolve({ id: "job_2" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("returns 404 for a teamless job when the caller is not a system admin", async () => {
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
      job: {
        id: "job_3",
        kind: "jobs.noop",
        status: "queued",
        teamId: null,
        createdBy: "user_1",
        payloadJson: {},
        resultJson: null,
        idempotencyKey: "job_3_key",
        maxAttempts: 3,
        attemptCount: 0,
        priority: 100,
        availableAt: "2026-04-01T10:00:00.000Z",
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
        parentJobId: null,
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
      attempts: [],
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/jobs/job_3"),
      { params: Promise.resolve({ id: "job_3" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("returns 404 for team members when the job is not team scoped", async () => {
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
      job: {
        id: "job_3",
        kind: "maintenance.cleanup",
        status: "queued",
        teamId: null,
        createdBy: null,
        payloadJson: {},
        resultJson: null,
        idempotencyKey: "job_3_key",
        maxAttempts: 3,
        attemptCount: 0,
        priority: 100,
        availableAt: "2026-04-01T10:00:00.000Z",
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
        parentJobId: null,
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
      attempts: [],
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/jobs/job_3"),
      { params: Promise.resolve({ id: "job_3" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});
