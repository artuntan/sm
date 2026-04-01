# Observability Baseline

This document defines the minimum production observability contract for SM during the rebuild.

## Goals

- Make API failures visible before customers report them.
- Attach a request ID to critical API flows for debugging and support.
- Expose health and readiness probes for infra automation.
- Create a clear path for alerting without introducing high fixed-cost tooling too early.

## Implemented In Task 2

- `pino` structured logging via `app/src/lib/logging/logger.ts`
- request ID propagation via `app/src/lib/logging/request-context.ts`
- `GET /api/health` liveness probe
- `GET /api/ready` readiness probe with database dependency check
- Sentry wiring for Next.js server/client exceptions
- Next.js Sentry initialization via `instrumentation.ts` and `instrumentation-client.ts`
- request ID echo on critical API routes:
  - `/api/analyze`
  - `/api/analyze-single`
  - `/api/dimes/scan`
  - `/api/warehouse`

## Request ID Contract

- Header name: `x-request-id`
- If the client sends a request ID, the app reuses it.
- If the client does not send one, middleware or route code generates one.
- Responses from instrumented routes must echo the request ID header.
- Error logs and Sentry captures should include the request ID whenever available.
- Durable job correlation IDs are intentionally deferred until the durable jobs task introduces job execution state.

## Probe Semantics

### `GET /api/health`

Use for liveness only.

Expected response:

- HTTP `200`
- JSON payload with:
  - `status: "ok"`
  - `service`
  - `timestamp`

This endpoint must not depend on database availability.

### `GET /api/ready`

Use for readiness and deployment gating.

Expected response:

- HTTP `200` when dependencies are ready
- HTTP `503` when dependencies are not ready
- JSON payload with:
  - `status: "ready"` or `status: "not_ready"`
  - `service`
  - `timestamp`
  - `checks`

Current readiness checks:

- PostgreSQL connectivity via `select 1`
- query timeout capped at 2 seconds for probe safety

## Logging Baseline

Structured logs must include:

- `service`
- `environment`
- `requestId`
- `route`
- `path`
- `method`
- structured error object under `err` where relevant

Current policy:

- production default log level: `info`
- non-production default log level: `debug`
- override with `LOG_LEVEL`

## Sentry Baseline

Environment variables to provide in deployed environments:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`

Capture policy:

- unexpected API exceptions in critical routes
- client runtime exceptions
- server runtime exceptions

Do not send expected validation failures or user mistakes to Sentry by default.

## AWS Monitoring Baseline

Minimum monitors before paid beta:

- Better Stack or UptimeRobot check for:
  - `/api/health`
  - `/api/ready`
- CloudWatch alarms for:
  - instance or service CPU
  - instance or service memory
  - RDS CPU
  - RDS free storage
  - RDS database connections
  - ALB or instance 5xx rate once ALB is introduced

## Known Gaps After Task 2

- Logs are not yet consistently centralized outside process output.
- Request ID propagation is not yet wired across async jobs because the job system does not exist yet.
- The current Next.js `middleware.ts` file triggers a framework deprecation warning and should be renamed to `proxy.ts` in a later cleanup task.
- Build-time Better Auth warnings still appear without full production auth environment variables; this predates Task 2 and is not introduced by the observability changes.

## Verification Commands

```bash
cd app
npm test -- --runInBand src/__tests__/request-context.test.ts
npm test -- --runInBand src/__tests__/health-routes.test.ts
npm test -- --runInBand src/__tests__/logger.test.ts
npm test -- --runInBand src/__tests__/readiness.test.ts
npm test -- --runInBand
npm run test:ui -- --runInBand
npm run build
```
