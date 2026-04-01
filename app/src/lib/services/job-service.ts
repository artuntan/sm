import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  job as jobTable,
  jobAttempt as jobAttemptTable,
  outboxEvent as outboxEventTable,
} from "@/lib/db/schema";
import { createEntityId, toIsoString } from "@/lib/jobs/idempotency";
import { publishJob } from "@/lib/jobs/queue";
import type {
  CreateJobInput,
  JobAttemptRecord,
  JobDetails,
  JobRecord,
  JobStore,
  OutboxEventRecord,
  QueueAdapter,
} from "@/lib/jobs/types";

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function mapJobRow(row: typeof jobTable.$inferSelect): JobRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    teamId: row.teamId,
    createdBy: row.createdBy,
    payloadJson: (row.payloadJson ?? {}) as Record<string, unknown>,
    resultJson: row.resultJson ?? null,
    idempotencyKey: row.idempotencyKey,
    maxAttempts: row.maxAttempts,
    attemptCount: row.attemptCount,
    priority: row.priority,
    availableAt: toIsoString(row.availableAt),
    leaseExpiresAt: toIsoOrNull(row.leaseExpiresAt),
    startedAt: toIsoOrNull(row.startedAt),
    completedAt: toIsoOrNull(row.completedAt),
    lastError: row.lastError,
    parentJobId: row.parentJobId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function mapAttemptRow(row: typeof jobAttemptTable.$inferSelect): JobAttemptRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    attemptNumber: row.attemptNumber,
    status: row.status as JobAttemptRecord["status"],
    error: row.error,
    startedAt: toIsoString(row.startedAt),
    completedAt: toIsoOrNull(row.completedAt),
    createdAt: toIsoString(row.createdAt),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createJobRecord(input: CreateJobInput, now: Date): JobRecord {
  const isoNow = now.toISOString();

  return {
    id: createEntityId("job"),
    kind: input.kind,
    status: "queued",
    teamId: input.teamId ?? null,
    createdBy: input.createdBy ?? null,
    payloadJson: input.payload,
    resultJson: null,
    idempotencyKey: input.idempotencyKey,
    maxAttempts: input.maxAttempts ?? 3,
    attemptCount: 0,
    priority: input.priority ?? 100,
    availableAt: (input.availableAt ?? now).toISOString(),
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
    lastError: null,
    parentJobId: input.parentJobId ?? null,
    createdAt: isoNow,
    updatedAt: isoNow,
  };
}

function createOutboxEventRecord(job: JobRecord): OutboxEventRecord {
  const now = new Date().toISOString();

  return {
    id: createEntityId("outbox"),
    topic: "job.enqueued",
    aggregateType: "job",
    aggregateId: job.id,
    payloadJson: {
      jobId: job.id,
      kind: job.kind,
      status: job.status,
    },
    status: "pending",
    attempts: 0,
    availableAt: now,
    publishedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createInMemoryJobStore(): JobStore {
  const jobs = new Map<string, JobRecord>();
  const jobsByIdempotencyKey = new Map<string, string>();
  const attemptsByJobId = new Map<string, JobAttemptRecord[]>();
  const outboxEvents = new Map<string, OutboxEventRecord>();

  return {
    async findById(jobId) {
      const job = jobs.get(jobId);
      return job ? clone(job) : null;
    },
    async findByIdempotencyKey(idempotencyKey) {
      const jobId = jobsByIdempotencyKey.get(idempotencyKey);
      return jobId ? clone(jobs.get(jobId) ?? null) : null;
    },
    async getJobDetails(jobId) {
      const job = jobs.get(jobId);
      if (!job) {
        return null;
      }

      return {
        job: clone(job),
        attempts: clone(attemptsByJobId.get(jobId) ?? []),
      };
    },
    async insertJob(input, now) {
      const existingId = jobsByIdempotencyKey.get(input.idempotencyKey);
      if (existingId) {
        return clone(jobs.get(existingId)!);
      }

      const job = createJobRecord(input, now);
      jobs.set(job.id, clone(job));
      jobsByIdempotencyKey.set(job.idempotencyKey, job.id);
      attemptsByJobId.set(job.id, []);
      return clone(job);
    },
    async updateJobResult(jobId, result, now) {
      const job = jobs.get(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      job.resultJson = result;
      job.updatedAt = now.toISOString();
      jobs.set(jobId, clone(job));

      return clone(job);
    },
    async insertOutboxEvent(event) {
      outboxEvents.set(event.id, clone(event));
    },
    async claimJob(jobId, now) {
      const current = jobs.get(jobId);
      if (!current) {
        return null;
      }

      if (current.status !== "queued") {
        return null;
      }

      if (new Date(current.availableAt).getTime() > now.getTime()) {
        return null;
      }

      current.status = "running";
      current.attemptCount += 1;
      current.startedAt = current.startedAt ?? now.toISOString();
      current.updatedAt = now.toISOString();
      jobs.set(jobId, clone(current));

      const attempt: JobAttemptRecord = {
        id: createEntityId("job_attempt"),
        jobId,
        attemptNumber: current.attemptCount,
        status: "running",
        error: null,
        startedAt: now.toISOString(),
        completedAt: null,
        createdAt: now.toISOString(),
      };

      const attempts = attemptsByJobId.get(jobId) ?? [];
      attempts.push(clone(attempt));
      attemptsByJobId.set(jobId, attempts);

      return {
        job: clone(current),
        attempt: clone(attempt),
      };
    },
    async markJobCompleted(jobId, attemptId, result, now) {
      const job = jobs.get(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      const attempts = attemptsByJobId.get(jobId) ?? [];
      const attempt = attempts.find((item) => item.id === attemptId);
      if (!attempt) {
        throw new Error(`Job attempt ${attemptId} not found`);
      }

      attempt.status = "completed";
      attempt.completedAt = now.toISOString();
      job.status = "completed";
      job.resultJson = result;
      job.completedAt = now.toISOString();
      job.lastError = null;
      job.updatedAt = now.toISOString();

      jobs.set(jobId, clone(job));
      attemptsByJobId.set(jobId, clone(attempts));

      return clone(job);
    },
    async markJobRetrying(jobId, attemptId, error, nextRunAt, now) {
      const job = jobs.get(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      const attempts = attemptsByJobId.get(jobId) ?? [];
      const attempt = attempts.find((item) => item.id === attemptId);
      if (!attempt) {
        throw new Error(`Job attempt ${attemptId} not found`);
      }

      attempt.status = "retrying";
      attempt.error = error;
      attempt.completedAt = now.toISOString();

      job.status = "queued";
      job.availableAt = nextRunAt.toISOString();
      job.lastError = error;
      job.updatedAt = now.toISOString();

      jobs.set(jobId, clone(job));
      attemptsByJobId.set(jobId, clone(attempts));

      return clone(job);
    },
    async markJobFailed(jobId, attemptId, error, now) {
      const job = jobs.get(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      const attempts = attemptsByJobId.get(jobId) ?? [];
      const attempt = attempts.find((item) => item.id === attemptId);
      if (!attempt) {
        throw new Error(`Job attempt ${attemptId} not found`);
      }

      attempt.status = "failed";
      attempt.error = error;
      attempt.completedAt = now.toISOString();

      job.status = "failed";
      job.lastError = error;
      job.completedAt = now.toISOString();
      job.updatedAt = now.toISOString();

      jobs.set(jobId, clone(job));
      attemptsByJobId.set(jobId, clone(attempts));

      return clone(job);
    },
    async listReadyJobIds(now, limit) {
      return [...jobs.values()]
        .filter(
          (job) =>
            job.status === "queued" &&
            new Date(job.availableAt).getTime() <= now.getTime()
        )
        .sort((left, right) => {
          if (left.priority !== right.priority) {
            return left.priority - right.priority;
          }

          return (
            new Date(left.availableAt).getTime() -
            new Date(right.availableAt).getTime()
          );
        })
        .slice(0, limit)
        .map((job) => job.id);
    },
  };
}

export const dbJobStore: JobStore = {
  async findById(jobId) {
    const rows = await db.select().from(jobTable).where(eq(jobTable.id, jobId)).limit(1);
    return rows[0] ? mapJobRow(rows[0]) : null;
  },
  async findByIdempotencyKey(idempotencyKey) {
    const rows = await db
      .select()
      .from(jobTable)
      .where(eq(jobTable.idempotencyKey, idempotencyKey))
      .limit(1);

    return rows[0] ? mapJobRow(rows[0]) : null;
  },
  async getJobDetails(jobId) {
    const rows = await db.select().from(jobTable).where(eq(jobTable.id, jobId)).limit(1);
    if (!rows[0]) {
      return null;
    }

    const attempts = await db
      .select()
      .from(jobAttemptTable)
      .where(eq(jobAttemptTable.jobId, jobId))
      .orderBy(asc(jobAttemptTable.attemptNumber));

    return {
      job: mapJobRow(rows[0]),
      attempts: attempts.map(mapAttemptRow),
    };
  },
  async insertJob(input, now) {
    const candidate = createJobRecord(input, now);
    const inserted = await db
      .insert(jobTable)
      .values({
        id: candidate.id,
        kind: candidate.kind,
        status: candidate.status,
        teamId: candidate.teamId,
        createdBy: candidate.createdBy,
        payloadJson: candidate.payloadJson,
        resultJson: null,
        idempotencyKey: candidate.idempotencyKey,
        maxAttempts: candidate.maxAttempts,
        attemptCount: candidate.attemptCount,
        priority: candidate.priority,
        availableAt: new Date(candidate.availableAt),
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
        parentJobId: candidate.parentJobId,
        createdAt: new Date(candidate.createdAt),
        updatedAt: new Date(candidate.updatedAt),
      })
      .onConflictDoNothing({ target: jobTable.idempotencyKey })
      .returning();

    if (inserted[0]) {
      return mapJobRow(inserted[0]);
    }

    const existing = await this.findByIdempotencyKey(candidate.idempotencyKey);
    if (!existing) {
      throw new Error(`Failed to insert or resolve job for ${candidate.idempotencyKey}`);
    }

    return existing;
  },
  async updateJobResult(jobId, result, now) {
    const rows = await db
      .update(jobTable)
      .set({
        resultJson: result,
        updatedAt: now,
      })
      .where(eq(jobTable.id, jobId))
      .returning();

    if (!rows[0]) {
      throw new Error(`Job ${jobId} not found`);
    }

    return mapJobRow(rows[0]);
  },
  async insertOutboxEvent(event) {
    await db.insert(outboxEventTable).values({
      id: event.id,
      topic: event.topic,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payloadJson: event.payloadJson,
      status: event.status,
      attempts: event.attempts,
      availableAt: new Date(event.availableAt),
      publishedAt: event.publishedAt ? new Date(event.publishedAt) : null,
      lastError: event.lastError,
      createdAt: new Date(event.createdAt),
      updatedAt: new Date(event.updatedAt),
    });
  },
  async claimJob(jobId, now) {
    return db.transaction(async (tx) => {
      const currentRows = await tx
        .select()
        .from(jobTable)
        .where(eq(jobTable.id, jobId))
        .limit(1);

      const current = currentRows[0];
      if (!current) {
        return null;
      }

      if (
        current.status !== "queued" ||
        current.availableAt.getTime() > now.getTime()
      ) {
        return null;
      }

      const updatedRows = await tx
        .update(jobTable)
        .set({
          status: "running",
          attemptCount: current.attemptCount + 1,
          startedAt: current.startedAt ?? now,
          updatedAt: now,
        })
        .where(and(eq(jobTable.id, jobId), eq(jobTable.status, "queued")))
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        return null;
      }

      const attemptRows = await tx
        .insert(jobAttemptTable)
        .values({
          id: createEntityId("job_attempt"),
          jobId,
          attemptNumber: updated.attemptCount,
          status: "running",
          error: null,
          startedAt: now,
          completedAt: null,
          createdAt: now,
        })
        .returning();

      return {
        job: mapJobRow(updated),
        attempt: mapAttemptRow(attemptRows[0]),
      };
    });
  },
  async markJobCompleted(jobId, attemptId, result, now) {
    return db.transaction(async (tx) => {
      await tx
        .update(jobAttemptTable)
        .set({
          status: "completed",
          error: null,
          completedAt: now,
        })
        .where(eq(jobAttemptTable.id, attemptId));

      const rows = await tx
        .update(jobTable)
        .set({
          status: "completed",
          resultJson: result,
          completedAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(jobTable.id, jobId))
        .returning();

      return mapJobRow(rows[0]);
    });
  },
  async markJobRetrying(jobId, attemptId, error, nextRunAt, now) {
    return db.transaction(async (tx) => {
      await tx
        .update(jobAttemptTable)
        .set({
          status: "retrying",
          error,
          completedAt: now,
        })
        .where(eq(jobAttemptTable.id, attemptId));

      const rows = await tx
        .update(jobTable)
        .set({
          status: "queued",
          availableAt: nextRunAt,
          lastError: error,
          updatedAt: now,
        })
        .where(eq(jobTable.id, jobId))
        .returning();

      return mapJobRow(rows[0]);
    });
  },
  async markJobFailed(jobId, attemptId, error, now) {
    return db.transaction(async (tx) => {
      await tx
        .update(jobAttemptTable)
        .set({
          status: "failed",
          error,
          completedAt: now,
        })
        .where(eq(jobAttemptTable.id, attemptId));

      const rows = await tx
        .update(jobTable)
        .set({
          status: "failed",
          lastError: error,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(jobTable.id, jobId))
        .returning();

      return mapJobRow(rows[0]);
    });
  },
  async listReadyJobIds(now, limit) {
    const rows = await db
      .select({ id: jobTable.id })
      .from(jobTable)
      .where(and(eq(jobTable.status, "queued"), lte(jobTable.availableAt, now)))
      .orderBy(asc(jobTable.priority), asc(jobTable.availableAt), asc(jobTable.createdAt))
      .limit(limit);

    return rows.map((row) => row.id);
  },
};

export function createJobService({
  store,
  queue,
  now = () => new Date(),
}: {
  store: JobStore;
  queue: QueueAdapter;
  now?: () => Date;
}) {
  return {
    async enqueue(input: CreateJobInput): Promise<JobRecord> {
      const existing = await store.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }

      const created = await store.insertJob(input, now());
      await store.insertOutboxEvent(createOutboxEventRecord(created));
      await queue.publish(created.id);
      return created;
    },
    async getJobDetails(jobId: string): Promise<JobDetails | null> {
      return store.getJobDetails(jobId);
    },
    async updateJobResult(jobId: string, result: unknown): Promise<JobRecord> {
      return store.updateJobResult(jobId, result, now());
    },
  };
}

const defaultJobService = createJobService({
  store: dbJobStore,
  queue: { publish: publishJob },
});

export async function enqueueJob(input: CreateJobInput): Promise<JobRecord> {
  return defaultJobService.enqueue(input);
}

export async function getJobDetails(jobId: string): Promise<JobDetails | null> {
  return defaultJobService.getJobDetails(jobId);
}

export async function updateJobResult(
  jobId: string,
  result: unknown
): Promise<JobRecord> {
  return defaultJobService.updateJobResult(jobId, result);
}
