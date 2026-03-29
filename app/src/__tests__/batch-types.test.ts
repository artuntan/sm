/**
 * Tests for batch-types derivation functions.
 * Covers deriveRowStatus, composeRowResult, deriveBatchSummary.
 */
import type { BatchImportRow, BatchHandleJob } from "@/lib/domain/batch-types";
import {
  handleJobKey,
  deriveRowStatus,
  composeRowResult,
  deriveBatchSummary,
} from "@/lib/domain/batch-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<BatchImportRow> = {}): BatchImportRow {
  return {
    id: "row_1",
    instagramUsername: "iguser",
    tiktokUsername: "tkuser",
    label: null,
    notes: null,
    sourceRowIndex: 1,
    ...overrides,
  };
}

function makeJob(
  platform: "instagram" | "tiktok",
  username: string,
  status: BatchHandleJob["status"],
  error: string | null = null
): [string, BatchHandleJob] {
  return [
    handleJobKey(platform, username),
    {
      platform,
      username,
      status,
      attempts: 1,
      maxAttempts: 3,
      error,
      result: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// handleJobKey
// ---------------------------------------------------------------------------

describe("handleJobKey", () => {
  it("creates correct keys", () => {
    expect(handleJobKey("instagram", "user1")).toBe("instagram:user1");
    expect(handleJobKey("tiktok", "user2")).toBe("tiktok:user2");
  });
});

// ---------------------------------------------------------------------------
// deriveRowStatus
// ---------------------------------------------------------------------------

describe("deriveRowStatus", () => {
  it("returns queued when all handles are queued", () => {
    const row = makeRow();
    const jobs = new Map([
      makeJob("instagram", "iguser", "queued"),
      makeJob("tiktok", "tkuser", "queued"),
    ]);
    expect(deriveRowStatus(row, jobs)).toBe("queued");
  });

  it("returns running when any handle is running", () => {
    const row = makeRow();
    const jobs = new Map([
      makeJob("instagram", "iguser", "running"),
      makeJob("tiktok", "tkuser", "queued"),
    ]);
    expect(deriveRowStatus(row, jobs)).toBe("running");
  });

  it("returns complete when all handles succeed", () => {
    const row = makeRow();
    const jobs = new Map([
      makeJob("instagram", "iguser", "success"),
      makeJob("tiktok", "tkuser", "success"),
    ]);
    expect(deriveRowStatus(row, jobs)).toBe("complete");
  });

  it("returns error when all handles fail", () => {
    const row = makeRow();
    const jobs = new Map([
      makeJob("instagram", "iguser", "error", "fail1"),
      makeJob("tiktok", "tkuser", "error", "fail2"),
    ]);
    expect(deriveRowStatus(row, jobs)).toBe("error");
  });

  it("returns partial when one succeeds and one fails", () => {
    const row = makeRow();
    const jobs = new Map([
      makeJob("instagram", "iguser", "success"),
      makeJob("tiktok", "tkuser", "error", "fail"),
    ]);
    expect(deriveRowStatus(row, jobs)).toBe("partial");
  });

  it("returns complete for IG-only row with success", () => {
    const row = makeRow({ tiktokUsername: null });
    const jobs = new Map([makeJob("instagram", "iguser", "success")]);
    expect(deriveRowStatus(row, jobs)).toBe("complete");
  });

  it("returns queued for missing handle jobs (new job map)", () => {
    const row = makeRow();
    const jobs = new Map<string, BatchHandleJob>();
    expect(deriveRowStatus(row, jobs)).toBe("queued");
  });
});

// ---------------------------------------------------------------------------
// composeRowResult
// ---------------------------------------------------------------------------

describe("composeRowResult", () => {
  it("composes row result with warnings for errors", () => {
    const row = makeRow();
    const jobs = new Map([
      makeJob("instagram", "iguser", "success"),
      makeJob("tiktok", "tkuser", "error", "API timeout"),
    ]);

    const result = composeRowResult(row, jobs);
    expect(result.status).toBe("partial");
    expect(result.warnings).toContain("TikTok: API timeout");
  });

  it("composes complete row with no warnings", () => {
    const row = makeRow();
    const jobs = new Map([
      makeJob("instagram", "iguser", "success"),
      makeJob("tiktok", "tkuser", "success"),
    ]);

    const result = composeRowResult(row, jobs);
    expect(result.status).toBe("complete");
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deriveBatchSummary
// ---------------------------------------------------------------------------

describe("deriveBatchSummary", () => {
  it("computes correct summary", () => {
    const rows = [
      makeRow({ id: "r1", instagramUsername: "a", tiktokUsername: "x" }),
      makeRow({ id: "r2", instagramUsername: "b", tiktokUsername: "x" }),
      makeRow({ id: "r3", instagramUsername: "a", tiktokUsername: null }),
    ];

    const jobs = new Map([
      makeJob("instagram", "a", "success"),
      makeJob("instagram", "b", "error", "fail"),
      makeJob("tiktok", "x", "success"),
    ]);

    const summary = deriveBatchSummary(rows, jobs);

    expect(summary.totalRows).toBe(3);
    expect(summary.completeRows).toBe(2); // r1 (both success), r3 (ig-only success)
    expect(summary.partialRows).toBe(1); // r2 (ig error, tt success)
    expect(summary.errorRows).toBe(0);
    expect(summary.totalUniqueInstagramHandles).toBe(2); // a, b
    expect(summary.totalUniqueTikTokHandles).toBe(1); // x
  });
});
