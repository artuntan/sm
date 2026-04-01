import type { JobHandler } from "./types";
import { BATCH_ANALYSIS_JOB_KIND } from "./kinds";

const handlers = new Map<string, JobHandler>();

handlers.set("jobs.noop", async ({ job }) => {
  return {
    echoedPayload: job.payloadJson,
  };
});
handlers.set(BATCH_ANALYSIS_JOB_KIND, async (input) => {
  const { createRuntimeBatchAnalysisHandler } = await import("./handlers/batch-analysis");
  const handler = createRuntimeBatchAnalysisHandler();
  return handler(input);
});

export function registerJobHandler(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export function getJobHandler(kind: string): JobHandler | undefined {
  return handlers.get(kind);
}
