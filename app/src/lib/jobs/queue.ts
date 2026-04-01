import type { QueueAdapter } from "./types";

const scheduledJobIds = new Set<string>();

async function scheduleLocalJob(jobId: string): Promise<void> {
  if (scheduledJobIds.has(jobId)) {
    return;
  }

  scheduledJobIds.add(jobId);

  setTimeout(async () => {
    try {
      const { runJobById } = await import("./runner");
      await runJobById(jobId);
    } catch (error) {
      console.error("[jobs] Failed to run local job", { jobId, error });
    } finally {
      scheduledJobIds.delete(jobId);
    }
  }, 0);
}

export function getQueueAdapter(): QueueAdapter {
  return {
    publish: scheduleLocalJob,
  };
}

export async function publishJob(jobId: string): Promise<void> {
  await getQueueAdapter().publish(jobId);
}
