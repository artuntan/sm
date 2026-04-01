export const JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_ATTEMPT_STATUSES = [
  "running",
  "retrying",
  "completed",
  "failed",
] as const;

export type JobAttemptStatus = (typeof JOB_ATTEMPT_STATUSES)[number];

export type JobRecord = {
  id: string;
  kind: string;
  status: JobStatus;
  teamId: string | null;
  createdBy: string | null;
  payloadJson: Record<string, unknown>;
  resultJson: unknown;
  idempotencyKey: string;
  maxAttempts: number;
  attemptCount: number;
  priority: number;
  availableAt: string;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  parentJobId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobAttemptRecord = {
  id: string;
  jobId: string;
  attemptNumber: number;
  status: JobAttemptStatus;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

export type JobDetails = {
  job: JobRecord;
  attempts: JobAttemptRecord[];
};

export type OutboxEventRecord = {
  id: string;
  topic: string;
  aggregateType: string | null;
  aggregateId: string | null;
  payloadJson: Record<string, unknown>;
  status: "pending" | "processing" | "published" | "failed";
  attempts: number;
  availableAt: string;
  publishedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateJobInput = {
  kind: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  teamId?: string | null;
  createdBy?: string | null;
  maxAttempts?: number;
  priority?: number;
  parentJobId?: string | null;
  availableAt?: Date;
};

export type QueueAdapter = {
  publish: (jobId: string) => Promise<void>;
};

export type JobHandler = (input: {
  job: JobRecord;
  attempt: JobAttemptRecord;
}) => Promise<unknown>;

export type JobStore = {
  findById: (jobId: string) => Promise<JobRecord | null>;
  findByIdempotencyKey: (idempotencyKey: string) => Promise<JobRecord | null>;
  getJobDetails: (jobId: string) => Promise<JobDetails | null>;
  insertJob: (input: CreateJobInput, now: Date) => Promise<JobRecord>;
  updateJobResult: (
    jobId: string,
    result: unknown,
    now: Date
  ) => Promise<JobRecord>;
  insertOutboxEvent: (event: OutboxEventRecord) => Promise<void>;
  claimJob: (
    jobId: string,
    now: Date
  ) => Promise<{ job: JobRecord; attempt: JobAttemptRecord } | null>;
  markJobCompleted: (
    jobId: string,
    attemptId: string,
    result: unknown,
    now: Date
  ) => Promise<JobRecord>;
  markJobRetrying: (
    jobId: string,
    attemptId: string,
    error: string,
    nextRunAt: Date,
    now: Date
  ) => Promise<JobRecord>;
  markJobFailed: (
    jobId: string,
    attemptId: string,
    error: string,
    now: Date
  ) => Promise<JobRecord>;
  listReadyJobIds: (now: Date, limit: number) => Promise<string[]>;
};
