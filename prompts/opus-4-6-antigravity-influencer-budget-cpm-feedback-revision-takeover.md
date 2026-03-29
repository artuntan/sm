You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis app for marketing teams.

This is NOT a greenfield Budget + CPM task.
The module already exists in the workspace and now needs a professional revision based on real product feedback.

Your job is to inspect the current implementation, understand exactly where it falls short, and upgrade it without blowing up the existing architecture.

Do not fake completion.
Do not ignore the current code and rebuild from scratch.

## Current Product Feedback You Must Solve

There are three explicit feedback items:

1. The UI must show how CPM math works behind an info control.
2. The system currently does not truly account for content quantity, but quantity must affect CPM.
3. Switching between `USD / TRY / EUR` currently does not materially change anything. FX impact is not being computed correctly.

In addition to these, you must think like a senior product engineer and make the module more professional where it obviously needs it, while staying grounded in the current codebase.

## Files You Must Read First

Read these files before patching:

- `app/src/app/page.tsx`
- `app/src/lib/domain/budget-cpm.ts`
- `app/src/lib/domain/story-visibility.ts`
- `app/src/lib/domain/carousel-visibility.ts`
- `app/src/lib/domain/types.ts`
- `app/src/__tests__/budget-cpm.test.ts`
- `app/src/__tests__/page.test.tsx`

Also verify the current platform-analysis plumbing:

- `app/src/app/api/analyze-all/route.ts`

## Current Implementation Reality You Must Respect

You must verify these current implementation issues and fix them:

### 1. CPM explanation is currently too weak

Today the workbench only has a footer note like:

- `CPM = cost per 1,000 projected impressions`

That is not enough.
There is no real info button / formula disclosure / row-level math explanation.

### 2. Quantity is effectively hardcoded

The current `BudgetWorkbench` logic creates quotes with:

- `quantity: 1`

This means the workbench behaves as though every line is exactly one piece of content.

That is not acceptable for campaign planning.

### 3. Currency support is mostly cosmetic

The current system already has:

- a currency selector in UI
- `Money.normalizedAmount`
- `Money.normalizedCurrency`
- `Money.fxRate`

But the current implementation does not use normalization seriously.

The benchmark engine also hardcodes benchmark context strings with dollar symbols like:

- `≤$8 CPM`

That is incorrect once the selected currency is TRY or EUR.

### 4. Benchmark classification is likely wrong under currency switching

The current benchmark comments suggest:

- benchmark ranges are USD-equivalent

But the current classifier appears to compare raw CPM against those thresholds directly.

That means:

- if user enters `10,000 TRY`, `10,000 USD`, or `10,000 EUR`
- the benchmark logic can become misleading or outright wrong

You must fix this.

## Product Mission For This Revision

Upgrade the existing Budget + CPM workbench so it becomes a trustworthy planning tool, not a pretty calculator.

Specifically:

1. formula transparency must be excellent
2. quantity must be first-class
3. FX and currency normalization must be real
4. benchmark interpretation must remain truthful under currency changes

## Revision Requirements

### A. Add a real CPM info / math explanation control

The user explicitly asked to understand the math.

You must add a proper info surface, not just a vague footer line.

Preferred direction:

- info icon in the `Budget + CPM Workbench` header and/or CPM column header
- opens a tooltip, popover, or compact modal
- explains the math in plain language and formula form

The explanation must cover:

1. What CPM means
   - `Cost per 1,000 projected impressions`

2. Per-line formula
   - `Line CPM = (Line Cost / Line Projected Impressions) * 1000`

3. Quantity handling
   - `Line Projected Impressions = Per-Unit Forecast * Quantity`
   - `Line Cost = Unit Price * Quantity`
   - OR, if line total mode is used, explain line total mode explicitly

4. Forecast ranges
   - low / base / high impressions
   - why CPM can also have low / base / high interpretations

5. Currency / FX handling
   - display currency vs normalized benchmark currency
   - why benchmark status can change when currency changes

6. Provenance
   - quote exact vs imputed
   - impressions estimated vs observed
   - projected CPM vs realized CPM

This info surface must be understandable by a marketer, not only a developer.

### B. Make quantity a first-class input and calculation driver

This is mandatory.

The system must stop behaving like every deliverable count is `1`.

#### Required behavior

Each deliverable row must support quantity.

At minimum:

- `IG Reels`
- `IG Reels Collab`
- `IG Carousel`
- `IG Story`
- `TikTok Post`

must all support quantity input.

#### Required calculation rules

If the row is unit-priced:

```ts
lineCost = unitPrice * quantity
lineProjectedImpressions = perUnitForecast * quantity
lineCPM = (lineCost / lineProjectedImpressions) * 1000
```

If the row is total-line-priced:

```ts
lineCost = enteredLineTotal
lineProjectedImpressions = perUnitForecast * quantity
lineCPM = (lineCost / lineProjectedImpressions) * 1000
```

You may choose the cleanest UX, but you must not keep the ambiguity hidden.

#### Preferred UX direction

The most professional solution is probably one of:

1. `Qty` + `Unit Price`
   - then auto-compute line total
2. `Qty` + `Line Total`
   - with explicit label that amount is for all items in that row
3. advanced row mode supporting both with a toggle

Choose the best product design.
But quantity must materially change:

- total cost
- total impressions
- CPM

#### Forecast display rules

The workbench should distinguish:

- per-unit forecast
- total forecast

Do not make the user guess which one they are seeing.

If space is tight, show one primary value and surface the other in tooltip / subtext.

### C. Make FX and currency normalization real

This is the highest-risk truthfulness issue in the current implementation.

You must fix the difference between:

- display currency
- entered quote currency
- normalized comparison currency

#### Required architecture

Use the existing `Money` structure seriously.

At minimum:

- `amount`
- `currency`
- `normalizedAmount`
- `normalizedCurrency`
- `fxRate`

must become meaningful in real computation.

#### Required behavior

When the user changes display currency between:

- `TRY`
- `USD`
- `EUR`

the workbench must not merely relabel the UI.

It must recompute:

- displayed cost
- displayed CPM
- displayed benchmark context

correctly.

#### Benchmark normalization rules

If benchmark tables are stored in one canonical currency, for example USD:

- convert user-entered costs into the benchmark currency before classification
- convert benchmark context back into display currency for UI if helpful

Do NOT compare raw TRY CPM to USD thresholds directly.

That is mathematically wrong.

#### FX sourcing rules

Do not fake a live FX feed if one does not exist.

Choose one truthful approach:

1. configurable FX table in code with clear timestamp / source labeling
2. manually editable campaign FX settings
3. a live FX integration, only if you can make it robust and clearly sourced

If you introduce static priors:

- label them
- make them easy to replace

#### UI rules

The user must be able to understand:

- quote currency
- display currency
- benchmark currency basis

without reading code.

### D. Fix benchmark messaging under currency conversion

The current benchmark context strings are dollar-specific.

That must be corrected.

Examples of wrong behavior:

- showing `MARKET` in TRY with a tooltip that still says `$8-$15 CPM`
- keeping benchmark chip stable when switching from TRY to USD even though normalization is wrong

Required outcome:

- benchmark status must be based on normalized CPM
- benchmark explanation must match current display / normalization context
- no hardcoded dollar semantics in a multi-currency UI

### E. Make CPM output more professional

The current table appears to show a single CPM value.

That is weak given the app already has low / base / high impression forecasts.

You should strongly consider upgrading the presentation so that CPM reflects forecast uncertainty better.

Good options:

- show base CPM, with low/high on hover or popover
- show compact range like `7.1 - 9.3 - 12.8`
- show base CPM plus confidence badge

You do not need to make the table noisy, but do not pretend a single base CPM is the whole story if the denominator is estimated.

### F. Preserve and extend tests

Current tests already cover some budget CPM behavior.
You must extend them for the new requirements.

Add tests proving:

1. quantity > 1 changes total impressions and CPM correctly
2. quantity-aware cost math works for both simple and package-like rows if applicable
3. FX conversion changes normalized CPM correctly
4. benchmark status is based on normalized currency, not raw entered amount
5. TRY / USD / EUR switching changes display and benchmark context appropriately
6. CPM info explanation renders and mentions quantity + formula + FX normalization
7. projected CPM remains distinguishable from realized CPM
8. existing story / carousel / TikTok forecast integrations do not regress

## Strong Product Guidance

Do not implement this as a shallow patch.
This revision is about making the module trustworthy.

The module should feel like a professional media planning surface where:

- the math is inspectable
- quantity is explicit
- currency behavior is sane
- benchmark labels can be defended

## Hard Rules

- do not keep `quantity: 1` hardcoded in the final workbench flow
- do not keep currency switching as a cosmetic relabel
- do not compare TRY or EUR CPM directly to USD thresholds
- do not ship an info tooltip that only says “CPM = cost per 1000 impressions” and nothing else
- do not regress existing story / carousel / TikTok forecast usage
- do not rebuild the module from scratch if the current domain model can be upgraded cleanly

## Verification Requirements

When complete, run from `app/`:

- `npm run test`
- `npm run test:ui`
- `npm run build`

If any command fails, say exactly why.
