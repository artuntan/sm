import { getErrorMessage, getNextRetryAt, isTerminalFailure } from "./idempotency";
import { getJobHandler } from "./handlers";
import type { JobHandler, JobStore } from "./types";
import { dbJobStore } from "@/lib/services/job-service";

export function createJobRunner({
  store,
  getHandler = getJobHandler,
  now = () => new Date(),
  retryDelayMs,
}: {
  store: JobStore;
  getHandler?: (kind: string) => JobHandler | undefined;
  now?: () => Date;
  retryDelayMs?: (attemptCount: number) => number;
}) {
  async function claimJobForDirectRun(jobId: string) {
    const currentTime = now();
    const claimed = await store.claimJob(jobId, currentTime);
    if (claimed) {
      return claimed;
    }

    const existing = await store.findById(jobId);
    if (!existing || existing.status !== "queued") {
      return null;
    }

    const availableAt = new Date(existing.availableAt);
    if (availableAt.getTime() <= currentTime.getTime()) {
      return null;
    }

    // Direct runs act like an operator-triggered retry and may bypass the
    // scheduled backoff window. Scheduled drains still use listReadyJobIds().
    return store.claimJob(jobId, availableAt);
  }

  return {
    async run(jobId: string) {
      const claim = await claimJobForDirectRun(jobId);
      if (!claim) {
        return null;
      }

      const handler = getHandler(claim.job.kind);
      if (!handler) {
        return store.markJobFailed(
          claim.job.id,
          claim.attempt.id,
          `No job handler registered for ${claim.job.kind}`,
          now()
        );
      }

      try {
        const result = await handler({
          job: claim.job,
          attempt: claim.attempt,
        });

        return store.markJobCompleted(claim.job.id, claim.attempt.id, result, now());
      } catch (error) {
        const message = getErrorMessage(error);

        if (isTerminalFailure(claim.job)) {
          return store.markJobFailed(claim.job.id, claim.attempt.id, message, now());
        }

        const baseNow = now();
        const nextRunAt = retryDelayMs
          ? new Date(baseNow.getTime() + retryDelayMs(claim.job.attemptCount))
          : getNextRetryAt(baseNow, claim.job.attemptCount);

        return store.markJobRetrying(
          claim.job.id,
          claim.attempt.id,
          message,
          nextRunAt,
          baseNow
        );
      }
    },
    async runReady(limit = 10) {
      const jobIds = await store.listReadyJobIds(now(), limit);
      const results = [];

      for (const jobId of jobIds) {
        results.push(await this.run(jobId));
      }

      return results;
    },
  };
}

const defaultJobRunner = createJobRunner({
  store: dbJobStore,
});

export async function runJobById(jobId: string) {
  return defaultJobRunner.run(jobId);
}

export async function runReadyJobs(limit = 10) {
  return defaultJobRunner.runReady(limit);
}
