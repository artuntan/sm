import { randomUUID } from "node:crypto";
import type { JobRecord } from "./types";

export function createEntityId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function toIsoString(value: Date): string {
  return value.toISOString();
}

export function getRetryDelayMs(attemptCount: number): number {
  const baseDelayMs = 1_000;
  const maxDelayMs = 30_000;

  return Math.min(baseDelayMs * 2 ** Math.max(attemptCount - 1, 0), maxDelayMs);
}

export function getNextRetryAt(now: Date, attemptCount: number): Date {
  return new Date(now.getTime() + getRetryDelayMs(attemptCount));
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isTerminalFailure(job: JobRecord): boolean {
  return job.attemptCount >= job.maxAttempts;
}
