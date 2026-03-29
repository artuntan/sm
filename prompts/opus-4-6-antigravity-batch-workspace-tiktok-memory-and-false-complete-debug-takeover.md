You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis application for marketing teams.

This is a critical batch-workspace reliability debug takeover.

The user-reported failure is severe because it breaks trust in both the backend orchestration and the UI truthfulness layer.

## The User-Visible Bug You Must Fix

When the operator runs a batch with 2 influencers, the system behaves acceptably.

When the operator runs a batch with 3+ influencers:

- TikTok can fail even when the handle is correct
- the detail panel shows a TikTok error
- but the batch header still shows `100%`
- the batch stats still imply all rows are done successfully
- the matrix row can still look `OK`

The screenshot shows a real example:

- TikTok detail error:
  - `Apify returned HTTP 402`
  - `actor-memory-limit-exceeded`
- yet the batch shell still presents a success-looking completion state

This must be treated as a production-grade correctness bug.

Do not patch this cosmetically.
Do not merely reduce copy ambiguity.
Fix the actual failure semantics and the actual avoidable provider pressure.

## What You Must Prove or Falsify First

Before changing code, inspect the real implementation and verify whether these hypotheses are true.

### Hypothesis A — TikTok batch concurrency is too aggressive

There is likely a provider-pressure issue where the batch engine pushes too many TikTok Apify jobs concurrently and triggers:

- `actor-memory-limit-exceeded`
- or nearby upstream capacity failures

### Hypothesis B — Platform analysis payloads with `status: "error"` are being treated as queue success

There is likely a semantic bug where:

- the API returns a JSON body with `status: "error"`
- but the batch queue marks that handle as successful because the HTTP request itself resolved

If true, that would explain:

- row shows `OK` when a platform actually failed
- batch summary counts are wrong
- `ERROR 0` can appear while detail panel shows failure
- progress can hit `100%` under a false-success model

### Hypothesis C — The progress model confuses “processed” with “successfully completed”

Even after fixing the queue semantics, the UI may still need to separate:

- processing completion
- batch success state

If every handle reaches a terminal state, progress may be `100% processed`.
That does NOT mean the batch is truly `complete` in a success sense.

Do not conflate these.

## Read These Files First

- `app/src/app/page.tsx`
- `app/src/app/api/analyze-single/route.ts`
- `app/src/app/api/analyze-all/route.ts`
- `app/src/lib/domain/batch-types.ts`
- `app/src/lib/domain/batch-parser.ts`
- `app/src/lib/domain/batch-queue.ts`
- `app/src/lib/domain/types.ts`
- `app/src/lib/providers/interface.ts`
- `app/src/lib/providers/factory.ts`
- `app/src/lib/providers/tiktok-apify-provider.ts`
- `app/src/lib/providers/tiktok-research-provider.ts`
- `app/src/__tests__/batch-queue.test.ts`
- `app/src/__tests__/page.test.tsx`
- `app/src/__tests__/platform-api.test.ts`

## Strong Clues You Must Verify in Code

These are not assumptions to blindly trust.
Verify them in the repo.

### Clue 1

The batch queue currently uses a single:

- `CONCURRENCY_PER_PLATFORM = 3`

If TikTok Apify actor memory limits are being hit at 3+ creators, this value is a likely trigger or at least part of the trigger.

### Clue 2

The single-platform batch primitive may be returning HTTP 200 even when analysis failed logically, for example:

- payload has `status: "error"`
- payload has `error: "..."`

If so, the queue layer must not interpret that as success.

### Clue 3

The queue’s `processHandle()` path may be doing something equivalent to:

- `const result = await fetchFn(...)`
- then unconditionally `job.status = "success"`

If the returned `result.status` can still be `"error"`, that is a core bug.

### Clue 4

Batch summary and row status are likely derived from queue handle statuses, not from deeper platform-analysis truth.

If the queue marks a logical failure as `success`, the entire UI truthfulness chain becomes wrong:

- row badge
- filters
- counts
- progress strip
- retry availability

## Non-Negotiable Requirements

### 1. A failed platform analysis must never be represented as a successful handle

If TikTok analysis failed, the queue must mark TikTok as failed.

That means:

- row cannot be `complete`
- row cannot be `OK`
- batch counts cannot hide it
- retry affordances must appear correctly

### 2. Batch header semantics must be truthful

The top strip must not present a green `COMPLETE` state if the batch finished with errors.

If all handles are terminal but some failed, a truthful state is something like:

- `FINISHED WITH ERRORS`
- or `PARTIAL`

You may still show a processed percentage, but do not let the success language lie.

### 3. Avoidable TikTok provider failures must be reduced materially

You may not be able to guarantee that Apify never fails upstream.
But you must ensure the app is not causing avoidable failures through reckless concurrency.

That means you must examine whether TikTok should use:

- lower concurrency than Instagram
- provider-specific concurrency settings
- smarter retry / backoff behavior for capacity errors
- temporary queue pausing or throttling for memory-limit failures

### 4. Error counts, row status, detail state, and retry state must all agree

This system cannot say:

- header: success
- row: ok
- detail: error

All surfaces must reflect the same truth.

## Architecture Direction

Do not “fix” this by only tweaking one label in the UI.
The reliability fix likely spans both:

- queue orchestration semantics
- API contract semantics

You must decide whether the best repair is:

### Option A — Make `/api/analyze-single` return non-2xx for logical analysis failure

Pros:

- cleaner fetch semantics
- batch queue can rely on `res.ok`
- fewer false-success paths

Cons:

- changes route contract

### Option B — Keep HTTP 200 for analysis payloads, but make the batch fetch layer reject when `result.status === "error"`

Pros:

- smaller contract change

Cons:

- easier for future call sites to miss again

### Option C — Combine both

- stronger route semantics
- stronger client-side guard
- most robust

Choose deliberately.
Explain why.

## Specific Areas You Must Audit

### Queue semantics

Inspect:

- handle initialization
- `processHandle()`
- retry paths
- `retryErrors()`
- `retryHandle()`
- completion callback conditions

Make sure a logical platform failure does not flow through the queue as success.

### Row-status semantics

Inspect:

- `deriveRowStatus()`
- `composeRowResult()`
- `computeBatchSummary()`

Confirm that:

- `completeRows`
- `partialRows`
- `errorRows`
- `completedHandles`

all align with the new truth model.

### UI truthfulness

Inspect:

- `BatchProgressStrip`
- matrix status badges
- selected-row detail warnings
- retry buttons
- status filters

The batch shell must represent:

- in progress
- finished successfully
- finished partially
- finished with errors

with no ambiguity.

### TikTok provider pressure

Inspect:

- `tiktok-apify-provider.ts`
- queue concurrency settings
- the shape and weight of TikTok actor requests
- whether retries make memory-limit pressure worse

If `actor-memory-limit-exceeded` is a capacity / concurrency-triggered failure, treat it as a first-class case, not a generic unknown error.

## Robustness Expectations

This repair should make the product resilient, not just less embarrassing.

That means:

- no false green states
- no silent logical failures
- no detail-only failures hidden from summary
- bounded TikTok pressure
- clear retry path
- deterministic summary counts

## Test Requirements

You must add or update tests for at least these scenarios:

### Scenario 1 — Logical error payload must not count as success

Simulate a batch fetch that resolves to a `PlatformAnalysis` with:

- `status: "error"`

and prove that:

- handle status becomes failed, not success
- row status becomes `partial` or `error` as appropriate
- summary counts reflect the failure

### Scenario 2 — Mixed success/error row must not show `complete`

One platform succeeds.
One platform fails.

Expected:

- row is not `complete`
- batch header is not success-green

### Scenario 3 — Batch finished with errors must not display misleading completion label

If all work is terminal but some failed:

- processed percentage may be full
- success label must not be full-success language

### Scenario 4 — TikTok concurrency is constrained

Add tests around queue configuration or queue behavior that prove TikTok is not processed with the same unsafe pressure pattern if you introduce provider-specific throttling.

### Scenario 5 — Memory-limit error remains visible and retryable

If upstream still fails:

- it must surface in row summary
- it must surface in detail
- retry affordance must be available
- batch counts must reflect the failed state

## Delivery Standard

When you respond and implement:

1. explain the confirmed root causes with file references
2. explain which failures were avoidable vs upstream-only
3. implement the real repair
4. update tests
5. ensure the UI cannot lie about batch success anymore

Do not stop at “probably concurrency”.
Do not stop at “probably a status bug”.
Prove it in code, then fix it end-to-end.
