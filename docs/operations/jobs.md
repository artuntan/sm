# Durable Jobs Operations

## Purpose

Task 4 introduces the first durable job foundation inside the existing app so work can be enqueued, retried, and inspected outside the original HTTP request.

This is intentionally incremental and cost-aware:

- local development and the first beta keep a local queue abstraction
- the app does not require Redis
- SQS queue names are reserved now, but AWS queue provisioning happens later when the worker split is real

## Scope

This foundation currently covers:

- the `job` control-plane table
- the `job_attempt` audit table
- the `outbox_event` table for future publisher wiring
- a local queue adapter that can schedule work inside the app runtime
- an operator-facing job status endpoint: `GET /api/jobs/:id`
- a durable batch-analysis workflow via `POST /api/analyze-all`
- a batch polling endpoint: `GET /api/batch-jobs/:id`

Batch analysis no longer depends on a single browser request staying alive.

## Runtime model

### Current mode

- enqueue from application code through `enqueueJob()`
- persist durable state in PostgreSQL
- publish to the local queue adapter
- local queue dynamically invokes the in-process runner
- direct `run(jobId)` acts like an operator-triggered execution
- `runReadyJobs(limit)` respects `availableAt` and drains only jobs that are ready

### Why this mode exists

This lets us prove the job model, retry policy, and status API without paying the complexity cost of:

- a second container
- SQS infrastructure wiring
- cross-process worker coordination

That keeps infra efficient while we harden the model.

## Tables

### `job`

Primary job ledger.

Important columns:

- `kind`
- `status`
- `idempotencyKey`
- `payloadJson`
- `resultJson`
- `maxAttempts`
- `attemptCount`
- `priority`
- `availableAt`
- `lastError`

### `job_attempt`

Per-attempt audit trail.

Important columns:

- `attemptNumber`
- `status`
- `error`
- `startedAt`
- `completedAt`

### `outbox_event`

Reserved for future external/event publication.

Current topic emitted on enqueue:

- `job.enqueued`

## Job states

Job states:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

Attempt states:

- `running`
- `retrying`
- `completed`
- `failed`

## Retry and idempotency policy

### Idempotency

Every durable job must provide an `idempotencyKey`.

Current behavior:

- duplicate enqueue requests resolve to the existing job
- duplicate requests do not publish a second queue event

### Retry

Current retry model:

- exponential backoff
- base delay: `1s`
- capped delay: `30s`
- terminal failure when `attemptCount >= maxAttempts`

Important distinction:

- `runReadyJobs()` respects the backoff window through `availableAt`
- `run(jobId)` may run a queued job directly, even if it was delayed for retry, which is useful for explicit operator/admin execution and deterministic tests

## Commands

From [`app/package.json`](/Users/umut/.config/superpowers/worktrees/sm/sm-rebuild-phase0/app/package.json):

```bash
cd app
npm run jobs:test
npm run jobs:drain:once
npm run jobs:drain:once -- 25
```

Expected output for `jobs:drain:once`:

```json
{
  "limit": 10,
  "processedCount": 2,
  "summary": {
    "completed": 1,
    "queued": 1
  }
}
```

`queued` in the summary means the job re-entered the queue for another retry window.

## API surface

### `GET /api/jobs/:id`

Returns the durable job status payload for the active team or for a system admin.

Response shape:

- job metadata
- attempt history

Team members do not get access to jobs owned by another team.

### `POST /api/analyze-all`

Batch mode now accepts:

- `rows`
- `forceRefresh`

When `rows` is present, the route:

- requires an approved team member or system admin with an active team
- enqueues one durable `batch.analysis` job
- returns `202 Accepted`
- returns a `statusUrl` for polling

The legacy cross-platform single-request mode still works when the payload is:

- `instagram`
- `tiktok`
- `forceRefresh`

### `GET /api/batch-jobs/:id`

Returns the durable batch snapshot for the active team or a system admin.

Response shape includes:

- job metadata
- `rows`
- `handleJobs`
- `rowResults`
- `summary`
- `historyRunId`
- attempt history

The route reconstructs an initial queued snapshot even if the job has been enqueued but has not yet written progress.

## Dashboard behavior

Task 5 switches the dashboard from browser-owned execution to server-owned execution.

Current browser behavior:

- parse input locally for validation only
- submit rows to `POST /api/analyze-all`
- persist `activeBatchJobId` in `localStorage`
- poll `GET /api/batch-jobs/:id` every 2 seconds while the job is active
- restore progress after refresh from the persisted job id
- clear the local job pointer when the job reaches a terminal state

Important limitation for this checkpoint:

- cancel and retry buttons are intentionally hidden until server-side cancel/retry semantics exist

This keeps the UI honest and avoids pretending we support cancellation when the server does not.

## Infra notes

### Reserved SQS names

When Task 11 wires the external worker, use these exact names:

- primary queue: `sm-${stage}-jobs`
- dead-letter queue: `sm-${stage}-jobs-dlq`

Examples:

- `sm-production-jobs`
- `sm-production-jobs-dlq`
- `sm-staging-jobs`
- `sm-staging-jobs-dlq`

### Why we are not provisioning SQS yet

SQS itself is inexpensive, but the real cost comes from:

- another always-on worker process
- more deployment wiring
- more operational surfaces to monitor

We only pay that cost once the app has:

- a real job-backed batch workflow
- a separate worker execution path
- a reason to run work outside the web process

## Next step

Task 5 is the first real consumer:

- batch analysis becomes a parent durable job
- the UI stops depending on a single browser session
- retries move server-side
