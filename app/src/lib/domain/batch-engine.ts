/**
 * Batch Analysis Engine — Client-Side Orchestrator
 *
 * Handle-centric model:
 * - Decomposes import rows into unique platform handles
 * - Processes handles with bounded concurrency per platform
 * - Progressive updates via callback
 * - Jittered retry with exponential backoff
 * - Cancellation support
 *
 * This is a session-bound engine. State lives in React component state.
 * No server-side persistence.
 */

import type { Platform, PlatformAnalysis } from "./types";
import type {
  BatchImportRow,
  BatchHandleJob,
  BatchJobPhase,
  BatchJobSnapshot,
} from "./batch-types";
import { handleJobKey } from "./batch-types";
import {
  composeRowResult,
  computeBatchSummary,
  DEFAULT_BATCH_HANDLE_MAX_ATTEMPTS,
} from "./batch-queue";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type BatchEngineConfig = {
  /** Max concurrent Instagram fetches (default: 3) */
  igConcurrency: number;
  /** Max concurrent TikTok fetches (default: 3) */
  tkConcurrency: number;
  /** Max retry attempts per handle (default: 2) */
  maxRetries: number;
  /** Base delay for retry backoff in ms (default: 2000) */
  retryBaseDelayMs: number;
  /** API endpoint for single-platform analysis */
  apiEndpoint: string;
};

const DEFAULT_CONFIG: BatchEngineConfig = {
  igConcurrency: 3,
  tkConcurrency: 3,
  maxRetries: 2,
  retryBaseDelayMs: 2000,
  apiEndpoint: "/api/analyze-single",
};

export function createQueuedHandleJobs(
  rows: BatchImportRow[],
  maxAttempts = DEFAULT_BATCH_HANDLE_MAX_ATTEMPTS
): Map<string, BatchHandleJob> {
  const handleJobs = new Map<string, BatchHandleJob>();

  for (const row of rows) {
    if (row.instagramUsername) {
      const key = handleJobKey("instagram", row.instagramUsername);
      if (!handleJobs.has(key)) {
        handleJobs.set(key, {
          platform: "instagram",
          username: row.instagramUsername,
          status: "queued",
          attempts: 0,
          maxAttempts,
          error: null,
          result: null,
        });
      }
    }

    if (row.tiktokUsername) {
      const key = handleJobKey("tiktok", row.tiktokUsername);
      if (!handleJobs.has(key)) {
        handleJobs.set(key, {
          platform: "tiktok",
          username: row.tiktokUsername,
          status: "queued",
          attempts: 0,
          maxAttempts,
          error: null,
          result: null,
        });
      }
    }
  }

  return handleJobs;
}

export function serializeHandleJobs(
  handleJobs: Map<string, BatchHandleJob>
): Record<string, BatchHandleJob> {
  return Object.fromEntries(handleJobs.entries());
}

export function deserializeHandleJobs(
  serialized: Record<string, BatchHandleJob> | null | undefined
): Map<string, BatchHandleJob> {
  return new Map(Object.entries(serialized ?? {}));
}

export function buildBatchJobSnapshot({
  rows,
  handleJobs,
  forceRefresh,
  phase,
  startedAt,
  updatedAt,
  completedAt = null,
  historyRunId = null,
}: {
  rows: BatchImportRow[];
  handleJobs: Map<string, BatchHandleJob>;
  forceRefresh: boolean;
  phase: BatchJobPhase;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  historyRunId?: string | null;
}): BatchJobSnapshot {
  return {
    version: 1,
    phase,
    rows,
    forceRefresh,
    handleJobs: serializeHandleJobs(handleJobs),
    rowResults: rows.map((row) => composeRowResult(row, handleJobs)),
    summary: computeBatchSummary(rows, handleJobs),
    startedAt,
    updatedAt,
    completedAt,
    historyRunId,
    runId: historyRunId,
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export type HandleUpdateCallback = (
  key: string,
  job: BatchHandleJob
) => void;

export class BatchEngine {
  private config: BatchEngineConfig;
  private handleJobs: Map<string, BatchHandleJob> = new Map();
  private cancelled = false;
  private onUpdate: HandleUpdateCallback;

  constructor(
    onUpdate: HandleUpdateCallback,
    config: Partial<BatchEngineConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onUpdate = onUpdate;
  }

  /**
   * Start processing a batch of import rows.
   * Returns when all handles are processed or cancelled.
   */
  async run(
    rows: BatchImportRow[],
    uniqueIgHandles: string[],
    uniqueTkHandles: string[]
  ): Promise<Map<string, BatchHandleJob>> {
    this.cancelled = false;
    this.handleJobs.clear();

    // Initialize all handle jobs as queued
    for (const username of uniqueIgHandles) {
      const key = handleJobKey("instagram", username);
      const job: BatchHandleJob = {
        platform: "instagram",
        username,
        status: "queued",
        attempts: 0,
        maxAttempts: this.config.maxRetries + 1,
        error: null,
        result: null,
      };
      this.handleJobs.set(key, job);
      this.onUpdate(key, job);
    }

    for (const username of uniqueTkHandles) {
      const key = handleJobKey("tiktok", username);
      const job: BatchHandleJob = {
        platform: "tiktok",
        username,
        status: "queued",
        attempts: 0,
        maxAttempts: this.config.maxRetries + 1,
        error: null,
        result: null,
      };
      this.handleJobs.set(key, job);
      this.onUpdate(key, job);
    }

    // Process both platform pools concurrently
    await Promise.all([
      this.processPool("instagram", uniqueIgHandles, this.config.igConcurrency),
      this.processPool("tiktok", uniqueTkHandles, this.config.tkConcurrency),
    ]);

    return this.handleJobs;
  }

  /**
   * Cancel all pending work.
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Get current handle jobs snapshot.
   */
  getHandleJobs(): Map<string, BatchHandleJob> {
    return new Map(this.handleJobs);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async processPool(
    platform: Platform,
    usernames: string[],
    concurrency: number
  ): Promise<void> {
    const queue = [...usernames];
    const workers: Promise<void>[] = [];

    for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
      workers.push(this.worker(platform, queue));
    }

    await Promise.all(workers);
  }

  private async worker(
    platform: Platform,
    queue: string[]
  ): Promise<void> {
    while (queue.length > 0 && !this.cancelled) {
      const username = queue.shift()!;
      await this.processHandle(platform, username);
    }
  }

  private async processHandle(
    platform: Platform,
    username: string
  ): Promise<void> {
    const key = handleJobKey(platform, username);
    const job = this.handleJobs.get(key);
    if (!job) return;

    // Mark as running
    job.status = "running";
    job.attempts++;
    this.onUpdate(key, { ...job });

    try {
      const result = await this.fetchAnalysis(platform, username);
      if (this.cancelled) return;

      job.status = "success";
      job.result = result;
      job.error = null;
      this.onUpdate(key, { ...job });
    } catch (err) {
      if (this.cancelled) return;

      const message =
        err instanceof Error ? err.message : "Unknown error";

      if (job.attempts < job.maxAttempts) {
        // Retry with jittered backoff
        const delay = this.config.retryBaseDelayMs * Math.pow(2, job.attempts - 1);
        const jitter = delay * (0.5 + Math.random() * 0.5);
        await this.sleep(jitter);

        if (!this.cancelled) {
          // Re-queue for retry
          await this.processHandle(platform, username);
        }
      } else {
        job.status = "error";
        job.error = message;
        this.onUpdate(key, { ...job });
      }
    }
  }

  private async fetchAnalysis(
    platform: Platform,
    username: string
  ): Promise<PlatformAnalysis> {
    const res = await fetch(this.config.apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, username }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(
        err?.error?.message || `HTTP ${res.status} for ${platform}/${username}`
      );
    }

    return res.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
