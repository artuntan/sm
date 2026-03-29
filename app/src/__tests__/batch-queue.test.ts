/**
 * Tests for batch-queue.ts
 *
 * Covers row status derivation, result composition, summary computation,
 * handleKey utility, error-aware queue semantics, capacity error detection,
 * and per-platform concurrency.
 */

import {
  handleKey,
  deriveRowStatus,
  composeRowResult,
  computeBatchSummary,
  isCapacityError,
  runBatchQueue,
} from "@/lib/domain/batch-queue";
import type { BatchHandleJob, BatchImportRow } from "@/lib/domain/batch-types";
import type { PlatformAnalysis, Platform } from "@/lib/domain/types";

function makeRow(overrides: Partial<BatchImportRow> = {}): BatchImportRow {
  return {
    id: "row-1",
    instagramUsername: "ig_user",
    tiktokUsername: "tk_user",
    label: null,
    notes: null,
    sourceRowIndex: 1,
    ...overrides,
  };
}

function makeJob(overrides: Partial<BatchHandleJob> = {}): BatchHandleJob {
  return {
    platform: "instagram",
    username: "ig_user",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    error: null,
    result: null,
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<PlatformAnalysis> = {}): PlatformAnalysis {
  return {
    platform: "instagram",
    username: "test",
    profile: null,
    organic: { status: "complete", averageViews: 1000, sampleSize: 5, maxSampleSize: 5, reels: [], warnings: [] },
    commercial: { status: "empty", averageViews: null, sampleSize: 0, maxSampleSize: 5, reels: [], warnings: [] },
    comparison: null,
    source: "mock",
    totalContentCount: 5,
    limitations: [],
    status: "ok",
    ...overrides,
  } as PlatformAnalysis;
}

describe("handleKey", () => {
  it("creates platform:username key", () => {
    expect(handleKey("instagram", "user123")).toBe("instagram:user123");
    expect(handleKey("tiktok", "tk_user")).toBe("tiktok:tk_user");
  });
});

describe("deriveRowStatus", () => {
  it("returns 'queued' when all handles are queued", () => {
    const row = makeRow();
    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("instagram:ig_user", makeJob({ status: "queued" }));
    jobs.set("tiktok:tk_user", makeJob({ platform: "tiktok", username: "tk_user", status: "queued" }));

    expect(deriveRowStatus(row, jobs)).toBe("queued");
  });

  it("returns 'running' when any handle is running", () => {
    const row = makeRow();
    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("instagram:ig_user", makeJob({ status: "running" }));
    jobs.set("tiktok:tk_user", makeJob({ platform: "tiktok", username: "tk_user", status: "queued" }));

    expect(deriveRowStatus(row, jobs)).toBe("running");
  });

  it("returns 'complete' when all handles succeed", () => {
    const row = makeRow();
    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("instagram:ig_user", makeJob({ status: "success" }));
    jobs.set("tiktok:tk_user", makeJob({ platform: "tiktok", username: "tk_user", status: "success" }));

    expect(deriveRowStatus(row, jobs)).toBe("complete");
  });

  it("returns 'error' when all handles error", () => {
    const row = makeRow();
    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("instagram:ig_user", makeJob({ status: "error", error: "fail" }));
    jobs.set("tiktok:tk_user", makeJob({ platform: "tiktok", username: "tk_user", status: "error", error: "fail" }));

    expect(deriveRowStatus(row, jobs)).toBe("error");
  });

  it("returns 'partial' when one succeeds and one errors", () => {
    const row = makeRow();
    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("instagram:ig_user", makeJob({ status: "success" }));
    jobs.set("tiktok:tk_user", makeJob({ platform: "tiktok", username: "tk_user", status: "error", error: "fail" }));

    expect(deriveRowStatus(row, jobs)).toBe("partial");
  });

  it("handles single-platform rows (IG only)", () => {
    const row = makeRow({ tiktokUsername: null });
    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("instagram:ig_user", makeJob({ status: "success" }));

    expect(deriveRowStatus(row, jobs)).toBe("complete");
  });

  it("handles single-platform rows (TK only)", () => {
    const row = makeRow({ instagramUsername: null });
    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("tiktok:tk_user", makeJob({ platform: "tiktok", username: "tk_user", status: "success" }));

    expect(deriveRowStatus(row, jobs)).toBe("complete");
  });

  it("returns 'running' when one is done and one still queued", () => {
    const row = makeRow();
    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("instagram:ig_user", makeJob({ status: "success" }));
    jobs.set("tiktok:tk_user", makeJob({ platform: "tiktok", username: "tk_user", status: "queued" }));

    expect(deriveRowStatus(row, jobs)).toBe("running");
  });
});

describe("composeRowResult", () => {
  it("composes result from handle jobs", () => {
    const row = makeRow();
    const jobs = new Map<string, BatchHandleJob>();
    const mockResult = { platform: "instagram", status: "ok" } as any;
    jobs.set("instagram:ig_user", makeJob({ status: "success", result: mockResult }));
    jobs.set("tiktok:tk_user", makeJob({ platform: "tiktok", username: "tk_user", status: "error", error: "Not found" }));

    const result = composeRowResult(row, jobs);
    expect(result.row).toBe(row);
    expect(result.status).toBe("partial");
    expect(result.instagram).toBe(mockResult);
    expect(result.tiktok).toBeNull();
    expect(result.warnings).toContain("TikTok: Not found");
  });

  it("handles success case with no warnings", () => {
    const row = makeRow({ tiktokUsername: null });
    const jobs = new Map<string, BatchHandleJob>();
    const mockResult = { platform: "instagram", status: "ok" } as any;
    jobs.set("instagram:ig_user", makeJob({ status: "success", result: mockResult }));

    const result = composeRowResult(row, jobs);
    expect(result.status).toBe("complete");
    expect(result.warnings).toHaveLength(0);
  });
});

describe("computeBatchSummary", () => {
  it("computes correct summary counts", () => {
    const rows = [
      makeRow({ id: "1", instagramUsername: "a", tiktokUsername: null, sourceRowIndex: 1 }),
      makeRow({ id: "2", instagramUsername: "b", tiktokUsername: "tk_b", sourceRowIndex: 2 }),
      makeRow({ id: "3", instagramUsername: null, tiktokUsername: "tk_c", sourceRowIndex: 3 }),
    ];

    const jobs = new Map<string, BatchHandleJob>();
    jobs.set("instagram:a", makeJob({ username: "a", status: "success" }));
    jobs.set("instagram:b", makeJob({ username: "b", status: "running" }));
    jobs.set("tiktok:tk_b", makeJob({ platform: "tiktok", username: "tk_b", status: "queued" }));
    jobs.set("tiktok:tk_c", makeJob({ platform: "tiktok", username: "tk_c", status: "error", error: "fail" }));

    const summary = computeBatchSummary(rows, jobs);
    expect(summary.totalRows).toBe(3);
    expect(summary.completeRows).toBe(1); // row 1 (IG a success)
    expect(summary.runningRows).toBe(1); // row 2 (IG b running, TK tk_b queued)
    expect(summary.errorRows).toBe(1); // row 3 (TK tk_c error)
    expect(summary.totalUniqueInstagramHandles).toBe(2);
    expect(summary.totalUniqueTikTokHandles).toBe(2);
    expect(summary.completedHandles).toBe(2); // a success + tk_c error
    expect(summary.totalHandles).toBe(4);
  });
});

// ===========================================================================
// Reliability Debug Scenarios
// ===========================================================================

describe("isCapacityError", () => {
  it("detects actor-memory-limit-exceeded", () => {
    expect(isCapacityError("Apify returned HTTP 402: actor-memory-limit-exceeded")).toBe(true);
  });

  it("detects rate limit", () => {
    expect(isCapacityError("Rate limit exceeded")).toBe(true);
  });

  it("detects HTTP 429", () => {
    expect(isCapacityError("Request failed: HTTP 429")).toBe(true);
  });

  it("does NOT flag normal errors", () => {
    expect(isCapacityError("Account not found")).toBe(false);
    expect(isCapacityError("Network timeout")).toBe(false);
  });
});

describe("Scenario 1 — Logical error payload must not count as success", () => {
  it("fetchFn returning status:'error' result causes handle to be marked as error", async () => {
    const rows = [makeRow({ id: "r1", instagramUsername: null, tiktokUsername: "tkuser" })];
    const jobs = new Map<string, BatchHandleJob>();

    const errorResult = makeAnalysis({
      platform: "tiktok",
      username: "tkuser",
      status: "error",
      error: "Apify returned HTTP 402: actor-memory-limit-exceeded",
      source: "tiktok-mock",
    });

    const fetchFn = jest.fn().mockResolvedValue(errorResult);
    const onUpdate = jest.fn();
    const onComplete = jest.fn();

    const handle = runBatchQueue(rows, jobs, fetchFn, { onUpdate, onComplete });

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    const job = jobs.get("tiktok:tkuser");
    expect(job).toBeDefined();
    expect(job!.status).toBe("error");
    expect(job!.error).toContain("actor-memory-limit-exceeded");

    // Row status should be error, not complete
    const rowStatus = deriveRowStatus(rows[0], jobs);
    expect(rowStatus).toBe("error");

    handle.cancel();
  });
});

describe("Scenario 2 — Mixed success/error row must not show complete", () => {
  it("row with one success and one error is 'partial'", async () => {
    const rows = [makeRow({ id: "r1" })];
    const jobs = new Map<string, BatchHandleJob>();

    const successResult = makeAnalysis({ platform: "instagram", status: "ok" });
    const errorResult = makeAnalysis({
      platform: "tiktok",
      status: "error",
      error: "actor-memory-limit-exceeded",  // capacity error → no retry
      source: "tiktok-mock",
    });

    const fetchFn = jest.fn().mockImplementation((platform: Platform) => {
      if (platform === "instagram") return Promise.resolve(successResult);
      return Promise.resolve(errorResult);
    });

    const onUpdate = jest.fn();
    const onComplete = jest.fn();

    const handle = runBatchQueue(rows, jobs, fetchFn, { onUpdate, onComplete });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const rowStatus = deriveRowStatus(rows[0], jobs);
    expect(rowStatus).toBe("partial");
    expect(rowStatus).not.toBe("complete");

    handle.cancel();
  });
});

describe("Scenario 3 — Batch finished with errors must reflect in summary", () => {
  it("summary counts errors correctly when all handles terminal", async () => {
    const rows = [
      makeRow({ id: "r1", instagramUsername: "a", tiktokUsername: "tk_a" }),
      makeRow({ id: "r2", instagramUsername: "b", tiktokUsername: null, sourceRowIndex: 2 }),
    ];
    const jobs = new Map<string, BatchHandleJob>();

    const fetchFn = jest.fn().mockImplementation((platform: Platform, username: string) => {
      if (platform === "tiktok") {
        return Promise.resolve(makeAnalysis({
          platform: "tiktok",
          status: "error",
          error: "actor-memory-limit-exceeded",
          source: "tiktok-mock",
        }));
      }
      return Promise.resolve(makeAnalysis({ platform: "instagram", status: "ok" }));
    });

    const onUpdate = jest.fn();
    const onComplete = jest.fn();

    const handle = runBatchQueue(rows, jobs, fetchFn, { onUpdate, onComplete });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const summary = computeBatchSummary(rows, jobs);
    // Row 1: IG success + TK error → partial
    // Row 2: IG success → complete
    expect(summary.partialRows).toBe(1);
    expect(summary.completeRows).toBe(1);
    expect(summary.errorRows).toBe(0);
    // Total handles: IG a, IG b, TK tk_a = 3
    expect(summary.totalHandles).toBe(3);

    handle.cancel();
  });
});

describe("Scenario 4 — TikTok concurrency is lower than Instagram", () => {
  it("TikTok processes sequentially (concurrency 1) while Instagram processes 3", async () => {
    const igUsers = ["a", "b", "c"];
    const tkUsers = ["x", "y", "z"];
    const rows = igUsers.map((ig, i) => makeRow({
      id: `r${i}`,
      instagramUsername: ig,
      tiktokUsername: tkUsers[i],
      sourceRowIndex: i,
    }));
    const jobs = new Map<string, BatchHandleJob>();

    let maxConcurrentTiktok = 0;
    let currentConcurrentTiktok = 0;
    let maxConcurrentInstagram = 0;
    let currentConcurrentInstagram = 0;

    const fetchFn = jest.fn().mockImplementation(async (platform: Platform) => {
      if (platform === "tiktok") {
        currentConcurrentTiktok++;
        maxConcurrentTiktok = Math.max(maxConcurrentTiktok, currentConcurrentTiktok);
        await new Promise((r) => setTimeout(r, 50));
        currentConcurrentTiktok--;
      } else {
        currentConcurrentInstagram++;
        maxConcurrentInstagram = Math.max(maxConcurrentInstagram, currentConcurrentInstagram);
        await new Promise((r) => setTimeout(r, 50));
        currentConcurrentInstagram--;
      }
      return makeAnalysis({ platform, status: "ok" });
    });

    const onUpdate = jest.fn();
    const onComplete = jest.fn();

    const handle = runBatchQueue(rows, jobs, fetchFn, { onUpdate, onComplete });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // TikTok should only run 1 at a time
    expect(maxConcurrentTiktok).toBe(1);
    // Instagram can run up to 3 at a time
    expect(maxConcurrentInstagram).toBeLessThanOrEqual(3);
    expect(maxConcurrentInstagram).toBeGreaterThanOrEqual(2); // at least 2 concurrent with 3 items

    handle.cancel();
  });
});

describe("Scenario 5 — Memory-limit error is visible and retryable", () => {
  it("capacity error does not trigger retry, stays as error, and is retryable via retryHandle", async () => {
    const rows = [makeRow({ id: "r1", instagramUsername: null, tiktokUsername: "tkuser" })];
    const jobs = new Map<string, BatchHandleJob>();

    const capacityError = makeAnalysis({
      platform: "tiktok",
      username: "tkuser",
      status: "error",
      error: "Apify returned HTTP 402: actor-memory-limit-exceeded",
      source: "tiktok-mock",
    });

    const fetchFn = jest.fn().mockResolvedValue(capacityError);
    const onUpdate = jest.fn();
    const onComplete = jest.fn();

    const handle = runBatchQueue(rows, jobs, fetchFn, { onUpdate, onComplete });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const job = jobs.get("tiktok:tkuser");
    expect(job).toBeDefined();
    // Should be error immediately — no retry for capacity errors
    expect(job!.status).toBe("error");
    expect(job!.attempts).toBe(1); // Only 1 attempt, no retry

    // Error message preserved for detail panel
    expect(job!.error).toContain("actor-memory-limit-exceeded");
    expect(job!.result).not.toBeNull(); // result preserved for detail panel

    // Verify it's retryable
    const successResult = makeAnalysis({
      platform: "tiktok",
      username: "tkuser",
      status: "ok",
      source: "tiktok-apify",
    });
    fetchFn.mockResolvedValue(successResult);
    handle.retryHandle("tiktok", "tkuser");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(job!.status).toBe("success");

    handle.cancel();
  });
});

