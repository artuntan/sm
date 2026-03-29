You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis application for marketing teams.

This is the bulk cross-platform search workspace takeover.

The next product step is not another single-creator polish pass.
The product must let a user submit and work through 100+ creator searches in one workflow across Instagram and TikTok.

Do not interpret "same time" as "fire 200 upstream requests at once and hope for the best."
Interpret it as:

- one batch intake action from the user
- one coherent batch-analysis workspace in the UI
- controlled background processing with bounded concurrency
- progressive row-by-row results
- partial failures that do not destroy the full batch

Do not build a fake bulk mode that is just two text inputs repeated many times.
Do not render the current full single-creator deep-analysis surface 100 times in a long page.
Do not introduce heavyweight infra unless the existing repo truly needs it.

## Product Mission

Upgrade the app from:

- single Instagram + single TikTok lookup

to:

- a batch creator search workspace where a marketing operator can paste or import 100+ rows,
- start analysis once,
- watch progress,
- review compact results in a matrix,
- and open one selected row for deep drill-down.

This must feel native to the current product, not like an admin afterthought.

## Existing Codebase Reality You Must Verify First

Read these files first:

- `app/package.json`
- `app/src/app/page.tsx`
- `app/src/app/globals.css`
- `app/src/app/api/analyze-all/route.ts`
- `app/src/lib/domain/types.ts`
- `app/src/lib/domain/selection.ts`
- `app/src/lib/domain/story-visibility.ts`
- `app/src/lib/domain/carousel-visibility.ts`
- `app/src/lib/domain/budget-cpm.ts`
- `app/src/lib/providers/interface.ts`
- `app/src/lib/providers/factory.ts`
- `app/src/lib/providers/meta-provider.ts`
- `app/src/lib/providers/instagram-apify-provider.ts`
- `app/src/lib/providers/tiktok-apify-provider.ts`
- `app/src/lib/providers/tiktok-research-provider.ts`
- `app/src/__tests__/page.test.tsx`
- `app/src/__tests__/platform-api.test.ts`
- `app/src/__tests__/budget-cpm.test.ts`
- `app/src/__tests__/story-visibility.test.ts`
- `app/src/__tests__/carousel-visibility.test.ts`

Current realities you must design from:

- the app is a Next.js 16 + React 19 app with a very light dependency surface
- there is no existing durable queue, database, or background worker infrastructure in this repo
- the current search UI is a two-field form in `page.tsx`
- the current `POST /api/analyze-all` route only accepts one Instagram handle and one TikTok handle
- that route currently runs both platform fetches concurrently
- provider calls are expensive and can take a long time
- the app already has valuable single-creator detail modules:
  - benchmark panels
  - profile surfaces
  - story visibility
  - carousel visibility
  - budget + CPM workbench

Do not throw away those assets.
You are upgrading the real system that exists.

## The Core Product Truth You Must Respect

For a 100+ creator workflow, the product needs two separate layers:

### 1. Batch workspace layer

This is where operators:

- paste or import rows
- validate handles
- run analysis
- monitor progress
- compare many creators

### 2. Single-row deep detail layer

This is where operators inspect one creator pair in depth using the rich modules that already exist.

This means the correct UI is:

- compact and matrix-oriented by default
- deep and module-oriented only for the selected row

If you try to make the batch page just stack 100 copies of the current detailed analysis surface, you are building the wrong product.

## What “100+ Accounts at the Same Time” Actually Means

The system must support a user workflow like:

- paste a spreadsheet range or CSV with many rows
- each row may include:
  - Instagram only
  - TikTok only
  - both Instagram and TikTok
  - optional label / notes
- start one batch run
- see rows move from queued -> running -> partial -> complete / error
- inspect results as they arrive
- retry only failed rows or failed handles

The system does NOT need to launch every upstream fetch simultaneously.

The correct system should use:

- deduplication
- normalized handle maps
- provider-aware bounded concurrency
- retry / backoff behavior
- progressive hydration of row summaries

## Architecture Requirement

You must think through at least these architecture options before choosing:

### Option A — Client-orchestrated batch over single-handle platform requests

- the client owns the batch queue
- the client deduplicates handles
- the client calls a single-platform route with bounded concurrency pools
- results are stored in local session state

### Option B — Server-owned ephemeral batch job with streaming progress

- the client submits the whole batch once
- the server creates an in-memory job
- progress streams back via SSE / chunked responses / polling
- still no durable infra

### Option C — Durable job queue with persistence

- queue + storage + resumability beyond refresh
- highest durability
- highest implementation cost

You must choose the best option for this repo after inspecting the real codebase.

My strong bias, unless you can justify otherwise from the codebase, is:

- do not jump straight to durable infra
- prefer a high-quality session-bound batch workspace first
- but architect types and APIs so a future durable job backend is possible

## Hard Product Recommendation You Should Strongly Consider

The smartest architecture is likely handle-centric, not row-centric.

That means:

- parse the operator input into row records
- extract unique Instagram handles
- extract unique TikTok handles
- analyze unique handles once
- store results in lookup maps
- compose row summaries from those maps

Why this matters:

- repeated handles across rows do not trigger repeated fetches
- platform concurrency is easier to control
- retries can happen per handle instead of rerunning whole rows
- row UI updates naturally as each platform result resolves

Do not build a bulk system that blindly calls the current pair-analysis route 100 times without first evaluating this handle-centric model.

## Domain Model You Must Add

Add canonical types for the batch workspace.

Names can differ, but the system needs equivalents to:

```ts
type BatchImportRow = {
  id: string;
  instagramUsername: string | null;
  tiktokUsername: string | null;
  label?: string | null;
  notes?: string | null;
  sourceRowIndex: number;
};

type BatchHandleStatus = "queued" | "running" | "success" | "error";

type BatchRowStatus =
  | "queued"
  | "running"
  | "partial"
  | "complete"
  | "error";

type BatchHandleJob = {
  platform: "instagram" | "tiktok";
  username: string;
  status: BatchHandleStatus;
  attempts: number;
  error?: string;
  result?: PlatformAnalysis;
};

type BatchRowResult = {
  rowId: string;
  instagramUsername: string | null;
  tiktokUsername: string | null;
  label?: string | null;
  notes?: string | null;
  status: BatchRowStatus;
  instagram?: PlatformAnalysis | null;
  tiktok?: PlatformAnalysis | null;
  warnings: string[];
};

type BatchRunSummary = {
  totalRows: number;
  queuedRows: number;
  runningRows: number;
  completeRows: number;
  partialRows: number;
  errorRows: number;
  totalUniqueInstagramHandles: number;
  totalUniqueTikTokHandles: number;
};
```

Design these so they can power:

- a session-local queue now
- a durable job system later

## API Direction

Do not leave bulk behavior trapped inside `page.tsx`.
Introduce clear boundaries.

You may choose the exact contract, but the system likely needs some combination of:

- a single-platform analysis endpoint
- a batch intake / parsing contract
- batch progress state models

If you introduce a single-platform route, it should be generic and reusable, not platform-specific copy-paste.

If you keep the current `analyze-all` route, decide deliberately whether it remains:

- a single-row pair-analysis primitive
- or becomes an internal helper only

If you add batch orchestration on the client, be explicit that:

- this is a session-bound batch job
- progress is local to the open page
- browser refresh does not promise resumability unless you add real persistence

Do not fake durability.

## Concurrency, Rate Safety, and Reliability

This section is non-negotiable.

The system must not saturate providers irresponsibly.

You must implement or design:

- bounded concurrency
- separate concurrency pools by platform or provider path when appropriate
- jittered retry for transient failures
- row-level and handle-level error isolation
- cancellation support if feasible
- a safe default concurrency, not an aggressive fantasy number

The user requirement is 100+ creators in one workflow.
That does not mean 100+ simultaneous upstream requests.

Good behavior looks like:

- user can submit 100+ rows at once
- system safely works through them in controlled parallelism
- UI remains responsive
- progress is visible

## Input UX Requirements

Replace the current two-input search surface with a batch-first intake system.

The best intake UX should support at least:

- direct paste from Excel / Google Sheets
- CSV / TSV-style parsing
- newline-separated fallback input
- template guidance so operators know the accepted format

Strongly consider an intake that accepts spreadsheet-style paste with columns like:

- `instagram`
- `tiktok`
- `label`
- `notes`

Examples:

```text
instagram,tiktok,label
uberkuloz,,beauty
,dogaozdas,tech
creator_a,creator_b,mix
```

and tab-separated spreadsheet paste should also parse cleanly.

The system must:

- normalize handles
- remove leading `@`
- deduplicate intelligently
- surface row validation errors before processing
- avoid dropping malformed rows silently

## Result UX Requirements

The batch result UI must be workbench-style, not report-style.

### Required default view

A compact comparison surface that can handle 100+ rows.

That likely means:

- a dense table or matrix
- sticky identity columns
- clear row statuses
- compact benchmark indicators
- filtering / sorting
- search within results

### Required detail behavior

Selecting a row should open a detail surface that reuses the current rich components.

That means:

- do not render all detail modules for all rows
- render compact summaries in the batch matrix
- render full deep analysis only for the selected row

This selected-row detail area can be:

- a right detail panel
- a lower detail rail
- a modal only if done extremely well

But it must feel native and fast.

### Required result columns / signals

At minimum, the matrix should help an operator compare:

- row identity
- Instagram handle
- TikTok handle
- per-platform status
- follower counts if available
- organic average benchmark
- commercial average benchmark
- ratio / delta indicators
- story / carousel availability signals where relevant
- data-source / warning badges

Do not overload the matrix with every single metric.
Use the detail panel for depth.

If Budget + CPM surfaces are preserved in this workflow, they belong in selected-row detail, not in every row.

## UI Composition Direction

The current app already has a premium dark visual language.
Preserve it.

But the bulk workspace must feel like an operator console, not a consumer search page.

On desktop, strongly consider a composition like:

- top intake + controls zone
- compact progress / batch stats strip
- main result matrix as the dominant canvas
- selected-row detail rail or lower panel

On mobile:

- keep the intake legible
- collapse the matrix into row cards or horizontally scrollable compact rows
- selected-row detail must remain accessible without feeling broken

Do not create a visually noisy enterprise table.
Do not create an under-powered toy list.

## Reuse Strategy

You must deliberately reuse and refactor existing logic.

Good reuse targets include:

- existing platform analysis types
- existing provider fetch logic
- existing benchmark selection pipeline
- existing story / carousel estimators
- existing budget + CPM workbench as selected-row detail

Bad behavior would be:

- copy-pasting the single-page logic into a second giant component
- duplicating provider orchestration paths
- rebuilding benchmark computation in a separate batch-only pipeline

## Performance Expectations

This bulk workspace must feel operationally credible.

That means:

- no full-page re-render chaos on every row update
- state shape must support incremental row updates cleanly
- derived row summaries should be stable and cheap
- if the row list becomes heavy, use a deliberate strategy:
  - pagination
  - windowing
  - or careful conditional rendering

Do not prematurely add a huge data-grid dependency unless you can justify it from the repo constraints.

## Test Requirements

You must not ship this as an untested UI rewrite.

Add or update tests for:

- batch input parsing
- normalization and deduplication
- row validation behavior
- bounded concurrency / queue progression logic
- row status derivation from per-handle results
- page-level bulk workflow rendering
- selected-row detail rendering

If you add new API contracts, test them.
If you extract reusable queue helpers, test them directly.

## Delivery Standard

When you implement:

1. first explain which architecture you chose and why
2. explain why the rejected options were not the right fit for this repo now
3. implement the real system end-to-end
4. update tests
5. ensure the UX is clearly batch-first

Do not stop at a speculative plan.
Do not stop at a mockup.
Do not stop at a half-built textarea.

The final outcome must let a user realistically work through 100+ creator rows in one session with a professional workflow and a UI that feels intentionally designed.
