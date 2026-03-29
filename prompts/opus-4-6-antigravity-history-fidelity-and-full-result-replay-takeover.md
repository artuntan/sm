You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis application with team-scoped shared history.

This is a history fidelity and full-result replay takeover.

The user is reporting that opening a past scan from history no longer gives a meaningful result view.
Instead, the history detail screen shows a largely empty / meaningless surface.

The user requirement is not just:

- "show something in history"

The real requirement is:

- when a scan is completed, the full meaningful result state must be durably persisted
- when a user opens that past run from history, they must be able to see the actual result experience again
- CPM and all other important analysis outputs must be visible from history

And the user explicitly says:

Do not stay limited to the literal request.
Understand the whole system, think for yourself, and make the best version of this history layer.

## What Is Happening Right Now

The user reports:

- history entries are being created after scans
- opening a history run does not show meaningful data
- the detail page does not reflect the full post-scan result experience
- CPM and related outputs are missing

That means the current history system is not functioning as a trustworthy replay of prior analysis work.

## Verified Code Reality You Must Start From

### Verified fact 1 — history persistence exists

The main workspace already attempts to save a run to history after analysis completes.

### Verified fact 2 — the saved snapshot is reduced / lossy

The current persistence logic in the main page appears to save a narrowed result projection instead of a full replay-grade snapshot.

This is likely the core architectural problem.

### Verified fact 3 — the history detail page is trying to read the wrong shape

The current history detail page appears to interpret the stored result snapshot as if it were a flat metrics object.
But the saved structure is nested differently.

That means the detail page and the persisted snapshot contract are misaligned.

So the problem is not only visual.
It is a data contract failure between:

- saved history payload
- history detail API
- history detail UI

### Verified fact 4 — CPM-related surfaces are not being persisted faithfully

The workspace has richer budgeting / deliverable CPM logic.
But the current history snapshot appears to store only a partial subset of the analysis and not the full detail state needed to replay the result view.

This is why CPM and other important decision-making outputs are missing from history.

## Read These Files First

Inspect these files carefully before implementing:

- `app/src/app/page.tsx`
- `app/src/app/history/page.tsx`
- `app/src/app/history/[runId]/page.tsx`
- `app/src/app/api/history/route.ts`
- `app/src/app/api/history/[runId]/route.ts`
- `app/src/app/api/history/save/route.ts`
- `app/src/app/components/DetailPanels.tsx`
- `app/src/lib/domain/types.ts`
- `app/src/lib/domain/budget-cpm.ts`
- `app/src/lib/db/schema.ts`

Also inspect any helpers or derived-result structures you need in order to persist and replay the analysis correctly.

## Core Problem You Must Solve

History is currently behaving like an audit stub.
It needs to become a durable replay surface.

That means:

- a completed analysis run must store enough structured information to reconstruct a meaningful past-result screen
- the history detail page must render from that stored structure faithfully
- important decision surfaces like CPM must not disappear just because the run is in the past

## Required Product Standard

When a user clicks a history item, the screen should feel like:

- "I am reopening a real past analysis"

not:

- "I am seeing a degraded debug dump"

The result view should be trustworthy, decision-useful, and legible.

## Required Implementation Direction

### 1. Redesign the history snapshot contract if needed

If the current `resultSnapshot` shape is too weak or too lossy, fix it.

Do not keep a broken snapshot format just because it already exists.

You may:

- expand the stored payload
- version the snapshot format
- store richer per-row analysis detail
- store enough derived state to render the history detail screen properly

But do this deliberately.

### 2. Make history replay-grade, not audit-grade

The stored run must include enough information to reproduce the important outputs of the result experience, including where applicable:

- creator row identity
- Instagram analysis
- TikTok analysis
- profile metrics
- organic benchmark data
- commercial benchmark data
- comparison metrics
- warnings / limitations
- any visibility intelligence that is part of the user-facing result
- CPM / deliverable budgeting outputs that matter to the decision surface

If some result panels are derived from saved data rather than stored directly, that is acceptable only if the replay is faithful and deterministic.

### 3. Fix the mismatch between saved data shape and history detail UI

The current detail page must stop guessing at the stored payload incorrectly.

You must make the history detail UI consume the actual stored contract correctly.

Do not leave a page that shows empty labels because the data model no longer matches.

### 4. Reuse product-grade detail components

Do not build the history page as a shallow custom summary if the app already has richer reusable result components.

Strong direction:

- reuse or extract existing detail/result components
- build the history detail screen on top of the same conceptual UI primitives as the live result view

If `DetailPanels.tsx` or related components can be reused cleanly, do that.

## CPM Requirement

The user explicitly wants CPM and the rest of the meaningful analysis data visible in history.

You must not treat CPM as optional.

You need to think through how CPM is produced now and then choose the right persistence strategy.

For example, determine whether CPM currently depends on:

- user-entered budget values
- derived forecast values
- computed deliverable rows
- quote source modes / forecast source modes

Then decide the correct durable design:

- persist the fully computed CPM rows
- or persist enough structured inputs to recompute them exactly in history
- or persist both if that is the cleanest replay model

But do not leave history unable to show CPM in a truthful way.

## Think Beyond the Literal Request

The user told you not to stop at exactly what they named.
Use judgment and improve this history product layer properly.

Good adjacent improvements include:

- better run metadata in history detail
- clearer run status and counts
- stronger creator row summaries in the list
- a more intentional run-detail layout
- explicit handling for legacy runs that were saved with incomplete snapshots
- graceful fallback messaging instead of blank screens

Bad adjacent improvements include:

- unrelated redesign work
- speculative features unrelated to result persistence/replay

## Legacy Data Handling

You must think about already-saved runs.

If older runs were stored using an incomplete snapshot shape, do not just break them.

Implement a clean strategy such as:

- snapshot versioning
- migration / normalization on read
- degraded but explicit legacy rendering
- clear empty-state messaging for data that genuinely was never stored

But do not silently show empty panels without explanation.

## Authorization and Scope Rules

History remains team-scoped.

Your changes must preserve the existing access rules:

- a user can only access runs they are allowed to see
- no cross-team leakage
- system admin behavior remains consistent with the product’s admin model

Do not solve fidelity problems by weakening authorization.

## Specific Things You Must Verify

You must explicitly verify and fix:

### 1. Save-time fidelity

Check exactly what the live workspace is sending to `/api/history/save`.
If it does not contain enough data for replay, expand it.

### 2. API contract fidelity

Check exactly what the detail API returns.
Normalize or reshape it only if needed, but keep the contract deliberate and stable.

### 3. UI rendering fidelity

Check exactly what the history detail page expects.
Make it consume the real run structure or transform the data before rendering.

### 4. CPM replay

Ensure CPM can be shown historically in a truthful, comprehensible way.

## Testing Requirements

You are not done without verification.

Add or update tests for at least:

- saving a completed run persists the required result data
- history detail route returns replay-usable data
- history detail page renders meaningful values from stored snapshot data
- CPM-related data is present and renderable for runs where it should exist
- legacy / partial runs degrade gracefully rather than appearing blank
- authorization still blocks unauthorized access

If full UI tests are heavy, add focused API/component/domain tests that still prove correctness.

## Final Standard

After your work:

- opening a history run must feel like reopening a real past scan
- the detail page must no longer be blank or semantically empty
- CPM and other important outputs must be visible from history
- the saved snapshot must be durable and replay-grade
- the system must handle incomplete legacy runs gracefully

Do not deliver a cosmetic patch.
Turn history into a proper full-fidelity product surface.
