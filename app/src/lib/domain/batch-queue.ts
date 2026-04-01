/**
 * Batch Queue Engine — Handle-Centric Bounded Concurrency
 *
 * Client-side orchestrator for batch creator analysis.
 * Processes unique handles with platform-aware concurrency pools,
 * jittered retry, and progressive result callbacks.
 *
 * Architecture:
 * - Extracts unique handles from import rows
 * - Processes handles (not rows) — deduplication is automatic
 * - Results stored in lookup maps keyed by "platform:username"
 * - Row results derived from handle lookup maps
 * - One handle failure doesn't block or break other handles
 */

import type { PlatformAnalysis, Platform } from "./types";
import type {
  BatchImportRow,
  BatchHandleJob,
  BatchHandleStatus,
  BatchRowResult,
  BatchRowStatus,
  BatchRunSummary,
} from "./batch-types";
import { extractUniqueHandles } from "./batch-parser";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Per-platform concurrency limits */
export const DEFAULT_BATCH_CONCURRENCY: Record<Platform, number> = {
  instagram: 3,
  tiktok: 1,   // Apify TikTok actors have strict memory limits
};

/** Max retry attempts per handle */
export const DEFAULT_BATCH_HANDLE_MAX_ATTEMPTS = 3;

/** Base delay for jittered exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 2000;

/** TikTok gets a longer base delay to avoid memory pressure */
const TIKTOK_RETRY_BASE_DELAY_MS = 5000;

/** Max delay cap (ms) */
const RETRY_MAX_DELAY_MS = 15000;

// ---------------------------------------------------------------------------
// Capacity error detection
// ---------------------------------------------------------------------------

/** Patterns that indicate upstream capacity exhaustion — retrying makes it worse */
const CAPACITY_ERROR_PATTERNS = [
  "actor-memory-limit-exceeded",
  "memory limit",
  "out of memory",
  "resource exhausted",
  "rate limit",
  "HTTP 402",
  "HTTP 429",
];

/** Check if an error message indicates a capacity/resource error */
export function isCapacityError(message: string): boolean {
  const lower = message.toLowerCase();
  return CAPACITY_ERROR_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Handle key utility
// ---------------------------------------------------------------------------

export function handleKey(platform: Platform, username: string): string {
  return `${platform}:${username}`;
}

// ---------------------------------------------------------------------------
// Jittered backoff
// ---------------------------------------------------------------------------

function jitteredDelay(attempt: number, platform: Platform): number {
  const baseDelay = platform === "tiktok" ? TIKTOK_RETRY_BASE_DELAY_MS : RETRY_BASE_DELAY_MS;
  const base = Math.min(
    baseDelay * Math.pow(2, attempt - 1),
    RETRY_MAX_DELAY_MS
  );
  // Add ±30% jitter
  const jitter = base * (0.7 + Math.random() * 0.6);
  return Math.round(jitter);
}

// ---------------------------------------------------------------------------
// Row status derivation
// ---------------------------------------------------------------------------

/**
 * Derive a row's composite status from its handle jobs.
 */
export function deriveRowStatus(
  row: BatchImportRow,
  handleJobs: Map<string, BatchHandleJob>
): BatchRowStatus {
  const jobs: BatchHandleJob[] = [];

  if (row.instagramUsername) {
    const job = handleJobs.get(handleKey("instagram", row.instagramUsername));
    if (job) jobs.push(job);
  }
  if (row.tiktokUsername) {
    const job = handleJobs.get(handleKey("tiktok", row.tiktokUsername));
    if (job) jobs.push(job);
  }

  if (jobs.length === 0) return "error";

  const statuses = jobs.map((j) => j.status);

  // All queued → queued
  if (statuses.every((s) => s === "queued")) return "queued";

  // Any running → running
  if (statuses.some((s) => s === "running")) return "running";

  // Any still queued while others done → running (still in progress)
  if (statuses.some((s) => s === "queued")) return "running";

  // All complete → complete
  if (statuses.every((s) => s === "success")) return "complete";

  // All error → error
  if (statuses.every((s) => s === "error")) return "error";

  // Mix of success + error → partial
  return "partial";
}

/**
 * Compose a BatchRowResult from handle lookup maps.
 */
export function composeRowResult(
  row: BatchImportRow,
  handleJobs: Map<string, BatchHandleJob>
): BatchRowResult {
  const igJob = row.instagramUsername
    ? handleJobs.get(handleKey("instagram", row.instagramUsername))
    : null;
  const tkJob = row.tiktokUsername
    ? handleJobs.get(handleKey("tiktok", row.tiktokUsername))
    : null;

  const warnings: string[] = [];
  if (igJob?.error) warnings.push(`Instagram: ${igJob.error}`);
  if (tkJob?.error) warnings.push(`TikTok: ${tkJob.error}`);

  return {
    row,
    status: deriveRowStatus(row, handleJobs),
    instagram: igJob?.result ?? null,
    tiktok: tkJob?.result ?? null,
    warnings,
  };
}

/**
 * Compute batch-level summary statistics.
 */
export function computeBatchSummary(
  rows: BatchImportRow[],
  handleJobs: Map<string, BatchHandleJob>
): BatchRunSummary {
  const uniqueHandles = extractUniqueHandles(rows);

  let queuedRows = 0;
  let runningRows = 0;
  let completeRows = 0;
  let partialRows = 0;
  let errorRows = 0;

  for (const row of rows) {
    const status = deriveRowStatus(row, handleJobs);
    switch (status) {
      case "queued":
        queuedRows++;
        break;
      case "running":
        runningRows++;
        break;
      case "complete":
        completeRows++;
        break;
      case "partial":
        partialRows++;
        break;
      case "error":
        errorRows++;
        break;
    }
  }

  let completedHandles = 0;
  let totalHandles = 0;
  for (const job of handleJobs.values()) {
    totalHandles++;
    if (job.status === "success" || job.status === "error") {
      completedHandles++;
    }
  }

  return {
    totalRows: rows.length,
    queuedRows,
    runningRows,
    completeRows,
    partialRows,
    errorRows,
    totalUniqueInstagramHandles: uniqueHandles.instagram.length,
    totalUniqueTikTokHandles: uniqueHandles.tiktok.length,
    completedHandles,
    totalHandles,
  };
}

// ---------------------------------------------------------------------------
// Batch Queue Runner
// ---------------------------------------------------------------------------

export type BatchQueueCallbacks = {
  /** Called when any handle's status changes */
  onUpdate: () => void;
  /** Called when the entire batch is finished */
  onComplete: () => void;
};

export type BatchQueueHandle = {
  /** Cancel all in-flight and pending work */
  cancel: () => void;
  /** Retry all errored handles */
  retryErrors: () => void;
  /** Retry a specific handle */
  retryHandle: (platform: Platform, username: string) => void;
};

/**
 * Run the batch queue — process all unique handles with bounded concurrency.
 *
 * @param rows       - The batch import rows
 * @param handleJobs - Mutable map of handle jobs (will be mutated in place)
 * @param fetchFn    - Function to fetch a single platform analysis
 * @param callbacks  - Progress callbacks
 * @returns Control handle for cancellation and retry
 */
export function runBatchQueue(
  rows: BatchImportRow[],
  handleJobs: Map<string, BatchHandleJob>,
  fetchFn: (platform: Platform, username: string, signal?: AbortSignal) => Promise<PlatformAnalysis>,
  callbacks: BatchQueueCallbacks
): BatchQueueHandle {
  const abortController = new AbortController();
  let cancelled = false;

  // Initialize handle jobs if not already present
  const uniqueHandles = extractUniqueHandles(rows);

  for (const username of uniqueHandles.instagram) {
    const key = handleKey("instagram", username);
    if (!handleJobs.has(key)) {
      handleJobs.set(key, {
        platform: "instagram",
        username,
        status: "queued",
        attempts: 0,
        maxAttempts: DEFAULT_BATCH_HANDLE_MAX_ATTEMPTS,
        error: null,
        result: null,
      });
    }
  }

  for (const username of uniqueHandles.tiktok) {
    const key = handleKey("tiktok", username);
    if (!handleJobs.has(key)) {
      handleJobs.set(key, {
        platform: "tiktok",
        username,
        status: "queued",
        attempts: 0,
        maxAttempts: DEFAULT_BATCH_HANDLE_MAX_ATTEMPTS,
        error: null,
        result: null,
      });
    }
  }

  callbacks.onUpdate();

  // Build per-platform queues from jobs that need processing
  const igQueue: string[] = [];
  const tkQueue: string[] = [];

  for (const [, job] of handleJobs) {
    if (job.status === "queued") {
      if (job.platform === "instagram") igQueue.push(job.username);
      else tkQueue.push(job.username);
    }
  }

  // Process a single handle
  async function processHandle(
    platform: Platform,
    username: string
  ): Promise<void> {
    const key = handleKey(platform, username);
    const job = handleJobs.get(key);
    if (!job || cancelled) return;

    job.status = "running";
    job.attempts++;
    job.error = null;
    callbacks.onUpdate();

    try {
      const result = await fetchFn(platform, username, abortController.signal);
      if (cancelled) return;

      // CRITICAL: Check logical error status — HTTP 200 does NOT mean success
      if (result.status === "error") {
        const errorMessage = result.error || "Platform analysis failed";

        // Capacity errors (actor-memory-limit-exceeded) — don't retry,
        // retrying under memory pressure makes it worse
        if (isCapacityError(errorMessage)) {
          job.status = "error";
          job.error = errorMessage;
          job.result = result; // preserve for detail panel
          callbacks.onUpdate();
          return;
        }

        // Other logical errors — retry if under max attempts
        if (job.attempts < job.maxAttempts) {
          const delay = jitteredDelay(job.attempts, platform);
          job.status = "queued";
          job.error = null;
          callbacks.onUpdate();
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (!cancelled) {
            return processHandle(platform, username);
          }
          return;
        }

        // Exhausted retries
        job.status = "error";
        job.error = errorMessage;
        job.result = result; // preserve for detail panel
        callbacks.onUpdate();
        return;
      }

      // True success — result.status is "ok" or "partial" (data quality)
      job.status = "success";
      job.result = result;
      job.error = null;
    } catch (err) {
      if (cancelled) return;

      const message =
        err instanceof Error ? err.message : "Unknown error";

      // Capacity errors from HTTP-level failures — don't retry
      if (isCapacityError(message)) {
        job.status = "error";
        job.error = message;
        callbacks.onUpdate();
        return;
      }

      // Retry if under max attempts
      if (job.attempts < job.maxAttempts) {
        const delay = jitteredDelay(job.attempts, platform);
        job.status = "queued";
        job.error = null;
        callbacks.onUpdate();
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (!cancelled) {
          return processHandle(platform, username);
        }
      } else {
        job.status = "error";
        job.error = message;
      }
    }

    callbacks.onUpdate();
  }

  // Bounded concurrency pool per platform
  async function processPool(
    platform: Platform,
    queue: string[],
    concurrency: number
  ): Promise<void> {
    let index = 0;

    async function worker(): Promise<void> {
      while (index < queue.length && !cancelled) {
        const username = queue[index++];
        await processHandle(platform, username);
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      () => worker()
    );
    await Promise.all(workers);
  }

  // Run both platform pools concurrently
  const batchPromise = Promise.all([
    processPool("instagram", igQueue, DEFAULT_BATCH_CONCURRENCY.instagram),
    processPool("tiktok", tkQueue, DEFAULT_BATCH_CONCURRENCY.tiktok),
  ]).then(() => {
    if (!cancelled) {
      callbacks.onComplete();
    }
  });

  // Control handle
  return {
    cancel() {
      cancelled = true;
      abortController.abort();
    },

    retryErrors() {
      for (const [, job] of handleJobs) {
        if (job.status === "error") {
          job.status = "queued";
          job.attempts = 0;
          job.error = null;
          job.result = null;
        }
      }

      // Rebuild queues and rerun
      const newIgQueue: string[] = [];
      const newTkQueue: string[] = [];
      for (const [, job] of handleJobs) {
        if (job.status === "queued") {
          if (job.platform === "instagram") newIgQueue.push(job.username);
          else newTkQueue.push(job.username);
        }
      }

      cancelled = false;
      callbacks.onUpdate();

      Promise.all([
        processPool("instagram", newIgQueue, DEFAULT_BATCH_CONCURRENCY.instagram),
        processPool("tiktok", newTkQueue, DEFAULT_BATCH_CONCURRENCY.tiktok),
      ]).then(() => {
        if (!cancelled) callbacks.onComplete();
      });
    },

    retryHandle(platform: Platform, username: string) {
      const key = handleKey(platform, username);
      const job = handleJobs.get(key);
      if (!job || job.status !== "error") return;

      job.status = "queued";
      job.attempts = 0;
      job.error = null;
      job.result = null;
      callbacks.onUpdate();

      processHandle(platform, username).then(() => {
        // Check if all handles are done
        const allDone = Array.from(handleJobs.values()).every(
          (j) => j.status === "success" || j.status === "error"
        );
        if (allDone && !cancelled) {
          callbacks.onComplete();
        }
      });
    },
  };
}
