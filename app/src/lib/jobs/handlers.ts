import type { JobHandler } from "./types";

const handlers = new Map<string, JobHandler>();

handlers.set("jobs.noop", async ({ job }) => {
  return {
    echoedPayload: job.payloadJson,
  };
});

export function registerJobHandler(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export function getJobHandler(kind: string): JobHandler | undefined {
  return handlers.get(kind);
}
