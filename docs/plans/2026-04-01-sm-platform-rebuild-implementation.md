# SM Platform Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Rebuild SM incrementally into a cost-efficient, multi-tenant, sellable creator intelligence platform without throwing away the existing product.

**Architecture:** Keep the current Next.js product surface and TypeScript domain logic, but replace request-bound execution with durable jobs, split global public intelligence from tenant-private workflow data, introduce a real usage ledger, and stage infrastructure upgrades so cost only rises when the business actually needs it. The immediate target is a safer modular monolith with jobs and a dedicated database; the later target is a web service plus worker topology with clearer platform boundaries.

**Tech Stack:** Next.js 16, TypeScript, React 19, PostgreSQL, Drizzle ORM, Better Auth, AWS CloudFront, EC2 (phase 1), SQS, S3, dedicated RDS PostgreSQL, CloudWatch, Sentry, Pino, Stripe, AWS WAF

---

## Non-Negotiable Decisions

These decisions are fixed for this plan. Do not reopen them unless new business constraints appear.

1. **No full rewrite.** We are doing a strangler rebuild.
2. **TypeScript stays the primary language** through the safe-to-sell milestone.
3. **Next.js stays as the product web surface** through the safe-to-sell milestone.
4. **The backend stays a modular monolith** through at least the first 10-20 customers.
5. **Durable async work uses AWS SQS.**
6. **PostgreSQL remains the primary transactional database.**
7. **S3 becomes the raw payload and artifact store.**
8. **Stripe is the billing provider.**
9. **Better Auth stays.**
10. **Python, ClickHouse, and a dedicated search engine are deferred** until after paid beta proves the need.
11. **Infrastructure is staged for cost efficiency.**
12. **Security, observability, tenant isolation, and billing controls are blockers** for charging customers.

## Cost Guardrails

This rebuild must stay economically rational.

### Baseline Targets

| Phase | Target Baseline Cost | Notes |
| --- | --- | --- |
| Phase 0-2 | `< $120/mo` excluding variable API spend | Keep CloudFront + single ARM EC2 web, add SQS/S3, move to dedicated small RDS |
| Phase 3 private beta | `< $180/mo` excluding variable API spend | Monitoring, logging, backups, billing, usage controls all live |
| Phase 4+ growth | `< 5% of MRR` infra baseline | Move to ALB + ECS only when customer count or workload justifies it |

### Cost Decisions

- **Do not migrate to ALB + ECS immediately.** That adds reliability, but it also adds fixed monthly cost before the business has earned it.
- **Keep one ARM EC2 web node through the first paid beta**, but remove heavy work from the request path so the single node is no longer the main execution engine.
- **Run workers off SQS with a separate process/container first.**
- **Move to ALB + ECS when one of these is true:**
  - more than 5 paying customers
  - worker CPU contention affects web latency
  - you need blue/green or multi-instance rollout safety
  - you want to make an uptime commitment above "best effort beta"

## Execution Rules

1. **Work in phases.** Do not blend phases unless the plan explicitly says so.
2. **Every behavior change must be tested.**
3. **Every schema change must use versioned migrations.**
4. **Do not deploy half-finished tenancy changes.**
5. **Do not add infrastructure before the application is ready to use it.**
6. **No new major dependencies unless they remove clear operational or business risk.**
7. **Update this document as work progresses.**
8. **If execution stops mid-phase, the next LLM must resume from this file, not from memory.**

## Resume Protocol

When resuming in a later session:

1. Read this file fully.
2. Read the latest commit diff.
3. Check the status checkboxes in the current phase.
4. Run the verification commands in the most recently touched phase.
5. Continue with the next unchecked step only after verification passes.

## Status Board

- [ ] Phase 0 complete: current app stabilized and secured
- [x] Phase 1 complete: observability and deploy safety live
- [ ] Phase 2 complete: durable jobs framework live
- [ ] Phase 3 complete: tenant model and data boundaries corrected
- [ ] Phase 4 complete: usage ledger and billing controls live
- [ ] Phase 5 complete: raw payload lake and provenance live
- [ ] Phase 6 complete: safe paid beta launch criteria met
- [ ] Phase 7 complete: post-beta intelligence platform foundations live

## Execution Progress

- [x] Task 1 complete on branch `sm-rebuild-phase0`
  - Removed global TLS bypass from deployment scripts
  - Added explicit `DATABASE_CA_CERT` deployment/runtime contract
  - Replaced PostgreSQL-incompatible `group_concat`
  - Added targeted regression tests for DB SSL config and coverage SQL aggregation
  - Updated runtime baseline documentation and top-level README
- [x] Task 2 complete on branch `sm-rebuild-phase0`
  - Added structured logging helpers and request ID propagation
  - Added `/api/health` and `/api/ready`
  - Wired Sentry into Next.js server/client builds and critical routes
  - Added targeted tests for readiness probes and request ID behavior
  - Repaired the pre-existing UI test harness so the documented verification command set is green
  - Documented the observability baseline and known remaining gaps
- [ ] Task 3 next: versioned migrations and safe database evolution

## Global Verification Commands

Run these at the end of every major task unless a narrower command is specified:

```bash
cd app
npm test -- --runInBand
npm run test:ui
npm run build
```

For database and migration work:

```bash
cd app
npm run db:generate
npm run db:migrate
```

---

## Task 1: Stabilize The Current Runtime And Remove Known Launch Risks

**Goal:** Eliminate immediate correctness and security issues in the existing runtime before deeper refactors begin.

**Files:**
- Modify: `app/src/lib/db/index.ts`
- Modify: `app/src/app/api/campaigns/[id]/scan/route.ts`
- Modify: `redeploy.sh`
- Modify: `deploy.sh`
- Modify: `infra/lib/sm-stack.ts`
- Modify: `README.md`
- Create: `docs/operations/current-runtime-baseline.md`

**Required changes:**

- remove `NODE_TLS_REJECT_UNAUTHORIZED=0`
- enable proper RDS SSL validation
- document the current production env contract
- replace PostgreSQL-incompatible `group_concat` usage
- document the current deployment path and its risks
- update stale docs that still mention SQLite / old stack assumptions

**Verification:**

```bash
cd app
npm test -- --runInBand
npm run build
```

Expected:

- tests pass
- build passes
- no runtime path depends on disabled TLS verification

**Exit criteria:**

- no production script disables TLS validation
- current runtime behavior is documented
- current known PostgreSQL query mismatch is removed

**Effort:** `S`

---

## Task 2: Add Observability And Operational Hygiene Before Architecture Work

**Goal:** Make the system operable before making it more complex.

**Files:**
- Create: `app/src/lib/logging/logger.ts`
- Create: `app/src/lib/logging/request-context.ts`
- Create: `app/src/app/api/health/route.ts`
- Create: `app/src/app/api/ready/route.ts`
- Modify: `app/src/middleware.ts`
- Modify: `app/src/app/api/analyze/route.ts`
- Modify: `app/src/app/api/analyze-single/route.ts`
- Modify: `app/src/app/api/dimes/scan/route.ts`
- Modify: `app/src/app/api/warehouse/route.ts`
- Create: `app/sentry.server.config.ts`
- Create: `app/sentry.client.config.ts`
- Modify: `app/package.json`
- Create: `docs/operations/observability.md`

**Dependencies to add:**

- `pino`
- `pino-http`
- `@sentry/nextjs`

**Required changes:**

- replace ad hoc `console.*` logging in critical routes with structured logs
- add request IDs now and defer job correlation IDs to the durable jobs task
- expose `/api/health` and `/api/ready`
- wire Sentry for server and client exceptions
- define minimum CloudWatch alarms and uptime checks in docs

**Verification:**

```bash
cd app
npm test -- --runInBand
npm run build
```

Manual verification:

- `GET /api/health` returns 200
- `GET /api/ready` returns 200 only when app dependencies are ready
- forced handled error path appears in logs with request ID

**Exit criteria:**

- there is a production-safe logging layer
- there are health and readiness endpoints
- there is an error reporting path

**Effort:** `S/M`

---

## Task 3: Introduce Versioned Migrations And Stop Treating Schema Changes Casually

**Goal:** Make database evolution safe before changing tenancy, jobs, and billing.

**Files:**
- Modify: `app/drizzle.config.ts`
- Create: `app/drizzle/`
- Create: `app/src/lib/db/migrations/README.md`
- Modify: `app/package.json`
- Create: `docs/operations/database-migrations.md`
- Create: `.github/workflows/` equivalent if CI exists later, otherwise document locally in `docs/operations/database-migrations.md`

**Required changes:**

- create and commit versioned Drizzle migrations
- define local and production migration procedure
- explicitly ban `db:push` in production
- document rollback expectations and pre-deploy checks

**Verification:**

```bash
cd app
npm run db:generate
npm run db:migrate
npm test -- --runInBand
```

Expected:

- migration files are generated and committed
- migrations apply cleanly to a fresh database

**Exit criteria:**

- schema work now has a controlled migration path
- future LLMs have one obvious way to change the database

**Effort:** `S`

---

## Task 4: Build The Durable Jobs Foundation Inside The Existing App

**Goal:** Move the system from request-bound execution to durable asynchronous execution without splitting the app yet.

**Files:**
- Create: `app/src/lib/jobs/types.ts`
- Create: `app/src/lib/jobs/queue.ts`
- Create: `app/src/lib/jobs/handlers.ts`
- Create: `app/src/lib/jobs/runner.ts`
- Create: `app/src/lib/jobs/idempotency.ts`
- Modify: `app/src/lib/db/schema.ts`
- Create: `app/src/lib/services/job-service.ts`
- Create: `app/src/app/api/jobs/[id]/route.ts`
- Modify: `app/package.json`
- Create: `docs/operations/jobs.md`
- Create: `infra/` notes in `docs/operations/jobs.md` for SQS queue names and DLQ names

**New tables to add:**

- `job`
- `job_attempt`
- `outbox_event`

**Required changes:**

- define job states and retry policy
- define idempotency keys
- create a queue abstraction that can run locally before SQS is fully wired
- add a status endpoint for jobs

**Verification:**

```bash
cd app
npm test -- --runInBand
npm run build
```

Add targeted tests for:

- idempotent reprocessing
- retry behavior
- terminal failure state
- job status retrieval

**Exit criteria:**

- there is a real job model in the database
- work can be enqueued and tracked outside a request

**Effort:** `M`

---

## Task 5: Move Batch Analysis Off The Request Lifecycle

**Goal:** Make batch analysis durable, resumable, and cost-governed.

**Files:**
- Modify: `app/src/lib/domain/batch-engine.ts`
- Modify: `app/src/lib/domain/batch-queue.ts`
- Modify: `app/src/app/api/analyze-all/route.ts`
- Modify: `app/src/app/api/analyze-single/route.ts`
- Modify: `app/src/lib/services/analyze-service.ts`
- Create: `app/src/lib/jobs/handlers/batch-analysis.ts`
- Create: `app/src/app/api/batch-jobs/[id]/route.ts`
- Create: `app/src/__tests__/batch-jobs.test.ts`
- Update docs: `docs/operations/jobs.md`

**Required changes:**

- batch requests create one parent job
- each handle becomes a child work item or deterministic internal unit
- UI polls job status instead of holding execution state in React only
- retries happen via jobs, not browser retries
- concurrency limits move server-side

**Verification:**

```bash
cd app
npm test -- --runInBand batch-jobs.test.ts
npm run build
```

Manual verification:

- submit a batch
- refresh browser mid-run
- confirm status and results persist

**Exit criteria:**

- batch analysis no longer depends on a single browser session remaining alive

**Effort:** `M`

---

## Task 6: Lock Down Coverage And Warehouse Boundaries Before More Features Ship

**Goal:** Correct the most dangerous tenancy and platform-data mistakes before they become customer incidents.

**Files:**
- Modify: `app/src/lib/auth/guards.ts`
- Modify: `app/src/app/api/dimes/scan/route.ts`
- Modify: `app/src/app/api/dimes/report/route.ts`
- Modify: `app/src/app/api/dimes/brands/route.ts`
- Modify: `app/src/app/api/warehouse/route.ts`
- Modify: `app/src/app/api/warehouse/link/route.ts`
- Modify: `app/src/app/api/warehouse/reconcile/route.ts`
- Modify: `app/src/app/api/campaigns/[id]/scan/route.ts`
- Create: `app/src/__tests__/tenant-isolation.test.ts`
- Create: `docs/architecture/public-vs-private-data.md`

**Required changes:**

- define which global datasets are platform-owned and internal-only
- remove customer access to global mutation endpoints
- ensure campaign-scoped actions do not trigger global scans
- enforce clearer authorization boundaries around shared intelligence

**Verification:**

```bash
cd app
npm test -- --runInBand tenant-isolation.test.ts
npm run build
```

Expected:

- customer-scoped actions only touch customer-authorized data
- global platform maintenance actions are not callable by normal approved users

**Exit criteria:**

- no obvious cross-tenant or global-data mutation path remains open in customer routes

**Effort:** `M/L`

---

## Task 7: Introduce The Real Tenant Model: Organization + Workspace

**Goal:** Replace `team` as the long-term tenant boundary with a model that supports agencies, brands, billing, and future enterprise features.

**Files:**
- Modify: `app/src/lib/db/schema.ts`
- Modify: `app/src/lib/auth/index.ts`
- Modify: `app/src/lib/auth/guards.ts`
- Modify: `app/src/app/api/teams/route.ts`
- Modify: `app/src/app/api/campaigns/route.ts`
- Modify: `app/src/app/api/history/route.ts`
- Create: `app/src/lib/organizations/`
- Create: `app/src/lib/workspaces/`
- Create: `app/src/__tests__/organizations.test.ts`
- Create: `docs/architecture/tenant-model.md`

**New model direction:**

- `organization` = billing and security boundary
- `workspace` = client/brand/program boundary
- `team` = optional collaboration grouping or legacy compatibility shim

**Required changes:**

- add organization/workspace tables and membership models
- map existing team-owned data into the new model incrementally
- document how legacy team records are treated during migration

**Verification:**

```bash
cd app
npm run db:generate
npm run db:migrate
npm test -- --runInBand
npm run build
```

**Exit criteria:**

- every tenant-private row has a durable long-term ownership model
- authz logic no longer depends on "first active team" style shortcuts

**Effort:** `L`

---

## Task 8: Build The Usage Ledger, Credit System, And Cost Controls

**Goal:** Ensure paid-source usage is metered, priced, and bounded before charging customers.

**Files:**
- Modify: `app/src/lib/db/schema.ts`
- Create: `app/src/lib/billing/ledger.ts`
- Create: `app/src/lib/billing/plans.ts`
- Create: `app/src/lib/billing/entitlements.ts`
- Create: `app/src/lib/billing/usage-meter.ts`
- Modify: `app/src/lib/providers/factory.ts`
- Modify: `app/src/lib/providers/meta-provider.ts`
- Modify: `app/src/lib/providers/instagram-apify-provider.ts`
- Modify: `app/src/lib/providers/tiktok-apify-provider.ts`
- Modify: `app/src/lib/dimes/providers.ts`
- Create: `app/src/app/api/billing/usage/route.ts`
- Create: `app/src/app/api/billing/credits/route.ts`
- Create: `app/src/__tests__/billing-ledger.test.ts`
- Create: `docs/architecture/billing-and-credits.md`

**New tables to add:**

- `plan`
- `subscription`
- `credit_ledger`
- `usage_event`
- `source_cost_event`
- `tracked_brand`

**Required changes:**

- every provider call records source cost metadata
- every customer action records usage
- credits are consumed for billable actions
- tracked brands are billed separately from ad hoc analysis credits
- hard budget ceilings and plan-based limits are enforced

**Verification:**

```bash
cd app
npm test -- --runInBand billing-ledger.test.ts
npm run build
```

Manual verification:

- one analysis request consumes expected credits
- one coverage target consumes tracked-brand entitlement
- over-limit requests fail with a clear error

**Exit criteria:**

- no variable-cost operation runs without accounting

**Effort:** `M/L`

---

## Task 9: Add Stripe Integration Without Letting Stripe Own The Business Logic

**Goal:** Use Stripe for money movement and subscriptions, while keeping product usage logic internal.

**Files:**
- Create: `app/src/lib/billing/stripe.ts`
- Create: `app/src/app/api/stripe/webhook/route.ts`
- Create: `app/src/app/api/billing/checkout/route.ts`
- Create: `app/src/app/api/billing/portal/route.ts`
- Modify: `app/src/lib/billing/plans.ts`
- Modify: `app/src/lib/billing/entitlements.ts`
- Create: `app/src/__tests__/stripe-webhook.test.ts`
- Create: `docs/operations/billing.md`

**Required changes:**

- Stripe handles subscriptions, invoices, and customer portal
- internal ledger remains the source of truth for entitlements and cost governance
- webhook processing is idempotent and audited

**Verification:**

```bash
cd app
npm test -- --runInBand stripe-webhook.test.ts
npm run build
```

**Exit criteria:**

- plans can be sold
- entitlements sync correctly
- Stripe events cannot corrupt local state through double processing

**Effort:** `M`

---

## Task 10: Add Raw Payload Storage And Source Provenance

**Goal:** Turn SM into a data platform by storing external source payloads immutably before normalization.

**Files:**
- Create: `app/src/lib/storage/raw-payloads.ts`
- Modify: `app/src/lib/providers/meta-provider.ts`
- Modify: `app/src/lib/providers/instagram-apify-provider.ts`
- Modify: `app/src/lib/providers/tiktok-apify-provider.ts`
- Modify: `app/src/lib/dimes/providers.ts`
- Modify: `app/src/lib/services/scan-cache-service.ts`
- Modify: `app/src/lib/services/media-warehouse-service.ts`
- Create: `app/src/__tests__/raw-payload-storage.test.ts`
- Create: `docs/architecture/raw-data-provenance.md`

**S3 object metadata must include:**

- source provider
- fetch timestamp
- checksum
- adapter version
- subject key if known
- retention class

**Verification:**

```bash
cd app
npm test -- --runInBand raw-payload-storage.test.ts
npm run build
```

Manual verification:

- one real or mocked fetch writes raw payload to S3
- the same payload can be traced back from normalized records

**Exit criteria:**

- raw data is replayable and auditable
- source drift can be debugged from stored payloads

**Effort:** `M`

---

## Task 11: Move To The Cost-Efficient Private Beta Topology

**Goal:** Upgrade the runtime enough for paying beta customers without jumping to a more expensive topology too early.

**Files:**
- Modify: `infra/lib/sm-stack.ts`
- Modify: `deploy.sh`
- Modify: `redeploy.sh`
- Create: `infra/README.md`
- Create: `docs/operations/private-beta-topology.md`

**Private beta topology decision:**

- keep `CloudFront`
- keep one small ARM `EC2` instance for web
- add dedicated small `RDS PostgreSQL`
- add `SQS`
- add `S3`
- run one separate worker process/container off the queue
- add `AWS WAF`
- add CloudWatch alarms and log retention

**Do not do yet:**

- ALB
- ECS Fargate
- multi-instance web

**Trigger to leave this topology:**

- more than 5 paying customers
- sustained worker contention
- need for safer deploy rollouts
- customer-facing uptime commitment

**Verification:**

- deploy to a staging environment first
- verify health/readiness endpoints
- verify queued work completes through the worker
- verify restore from backup

**Exit criteria:**

- paid beta can run with bounded cost and better operational control than the current single-process model

**Effort:** `M`

---

## Task 12: Define And Enforce Safe-To-Sell Exit Criteria

**Goal:** Refuse to charge customers until the product actually meets the minimum operational and security bar.

**Files:**
- Create: `docs/operations/safe-to-sell-checklist.md`
- Create: `docs/operations/beta-go-live-checklist.md`
- Create: `docs/operations/incident-response.md`
- Create: `docs/operations/backup-restore-drill.md`
- Modify: `README.md`

**Safe-to-sell criteria:**

- tenant isolation tests pass
- all heavy workflows use jobs
- billing and usage metering are enforced
- health checks and alerts are live
- logs and Sentry are live
- backups and restore are verified
- TLS and transport issues are fixed
- pricing and support workflows are documented

**Verification:**

Use this task as a human gate. Do not mark complete until every prior blocker task is complete and verified.

**Exit criteria:**

- product is ready for 3-5 paying design partners

**Effort:** `S`

---

## Task 13: Upgrade To Growth Topology Only When Beta Proves It

**Goal:** Move to a more scalable runtime after the product earns the fixed-cost increase.

**Files:**
- Modify: `infra/lib/sm-stack.ts`
- Create: `docs/operations/growth-topology.md`
- Create: `docs/operations/ecs-cutover.md`

**Growth topology decision:**

- `CloudFront -> ALB -> ECS web service + ECS worker service`
- dedicated `RDS`
- `SQS + DLQ`
- `S3`
- `WAF`

**Trigger conditions:**

- paid beta successful
- more than 5 paying customers
- need for safer rollouts and separate scaling

**Verification:**

- web deploy without downtime in staging
- worker scaling verified independently
- cost model reviewed against current MRR

**Exit criteria:**

- runtime can scale web and workers independently

**Effort:** `M`

---

## Task 14: Build The Post-Beta Intelligence Layer, Not Before

**Goal:** Start the moat-building work only after the product is safe, sellable, and metered.

**Files:**
- Modify: `app/src/lib/db/schema.ts`
- Create: `app/src/lib/intelligence/`
- Create: `app/src/lib/entities/`
- Create: `app/src/lib/coverage/`
- Create: `app/src/lib/benchmarks/`
- Create: `docs/architecture/intelligence-layer.md`
- Create: `docs/research/clickhouse-adoption.md`

**Capabilities to add after beta:**

- append-only profile snapshots
- append-only content metric snapshots
- explicit entity/account link evidence
- hot/warm/cold coverage scheduling
- public benchmark rollups
- clearer public intelligence graph

**Do not do yet:**

- ClickHouse adoption
- Python enrichment services
- vector retrieval infrastructure

These should only begin once production usage justifies them.

**Verification:**

- historical snapshots accumulate correctly
- benchmark queries have known cost/latency
- no tenant-private data leaks into public benchmark rollups

**Exit criteria:**

- the platform starts behaving like a reusable intelligence asset, not a fresh-scrape utility

**Effort:** `L`

---

## Suggested Commit Strategy

Keep commits small and phase-aligned:

1. `chore: remove tls bypasses and fix runtime blockers`
2. `feat: add health checks and structured logging`
3. `chore: introduce versioned drizzle migrations`
4. `feat: add durable jobs foundation`
5. `feat: move batch analysis to async jobs`
6. `fix: lock down warehouse and coverage tenant boundaries`
7. `feat: add organization and workspace tenancy model`
8. `feat: add usage ledger and credit accounting`
9. `feat: integrate stripe billing and entitlements`
10. `feat: store raw provider payloads in s3`
11. `ops: deploy private beta topology`
12. `docs: add safe-to-sell runbooks and checklists`

## Not In Scope For This Plan

- full microservice decomposition
- Kafka
- Kubernetes / EKS
- Rust or Go replatforming
- Neo4j
- full-text search engine migration
- Python enrichment platform
- ClickHouse rollout
- SSO/SCIM
- public API platform
- custom scraper fleet

## Handoff Notes For Future LLMs

- Do not skip directly to "interesting" platform work. The blocking work is security, jobs, tenancy, billing, and observability.
- Do not introduce more infrastructure than the current revenue stage can support.
- Do not treat in-memory state as acceptable once a feature matters operationally.
- If a task touches authorization, always add or update leakage tests.
- If a task touches provider calls, always add usage and source cost accounting hooks.
- If a task touches schema, migrations are mandatory.
