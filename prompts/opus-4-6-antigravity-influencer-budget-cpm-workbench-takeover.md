You are Claude Opus 4.6 inside Antigravity, working on an existing creator analysis application for marketing teams.

This is a spreadsheet-replacement Budget + CPM workbench takeover.

Do not fake precision.
Do not use follower count as the CPM denominator.
Do not collapse package pricing, usage rights, whitelisting, exclusivity, and creator posting fee into one opaque number.

The product is moving beyond a benchmark viewer.
It is becoming a serious campaign-planning system that must replace a manual Excel workflow.

## Product Context You Must Understand

The spreadsheet shape being replaced has grouped columns like:

- Followers
  - IG followers
  - TikTok followers
- Budget
  - IG Reels
  - IG Reels Collab
  - IG Carousel
  - IG Story
  - TikTok Post
- Impression
  - IG Reels
  - IG Reels Collab
  - IG Carousel
  - IG Story
  - TikTok Post
- CPM
  - IG Reels
  - IG Reels Collab
  - IG Carousel
  - IG Story
  - TikTok Post

That means each row is effectively a creator quote row inside a campaign planning sheet.

The app must evolve toward that exact planning job:

- store or edit what the influencer asked for
- forecast impressions by deliverable
- compute CPM by deliverable and by package
- make modeled versus exact values explicit
- help a marketing team compare creators without returning to Excel

This is not a cosmetic add-on.
It requires domain model, API contract, forecasting logic, pricing decomposition, UI workbench, and tests.

## Existing Codebase Reality You Must Verify First

Read these files first:

- `app/src/app/page.tsx`
- `app/src/app/api/analyze-all/route.ts`
- `app/src/app/globals.css`
- `app/src/lib/domain/types.ts`
- `app/src/lib/domain/selection.ts`
- `app/src/lib/domain/story-visibility.ts`
- `app/src/lib/domain/carousel-visibility.ts`
- `app/src/lib/providers/interface.ts`
- `app/src/lib/providers/factory.ts`
- `app/src/lib/providers/meta-provider.ts`
- `app/src/lib/providers/instagram-apify-provider.ts`
- `app/src/lib/providers/tiktok-apify-provider.ts`
- `app/src/lib/providers/tiktok-research-provider.ts`
- `app/src/__tests__/page.test.tsx`
- `app/src/__tests__/platform-api.test.ts`
- `app/src/__tests__/story-visibility.test.ts`
- `app/src/__tests__/carousel-visibility.test.ts`
- `app/src/__tests__/instagram-pipeline-regression.test.ts`
- `app/src/__tests__/tiktok-benchmark.test.ts`

Current realities you must reason from:

- the app already has a cross-platform `POST /api/analyze-all` flow
- the app already has profile-level follower counts
- the app already has benchmark buckets for Instagram and TikTok
- the app already has capability-gated Instagram Story and Carousel visibility estimators
- there is no serious budget / quote / package / CPM domain yet
- the UI is still creator-analysis-first, not spreadsheet-replacement workbench-first

Do not rebuild from scratch.
Upgrade the real architecture that exists.

## Research-Grounded Truths You Must Respect

### 1. CPM must be impression-based, not follower-based

For this product, CPM means:

- cost per 1,000 expected or realized impressions

Not:

- cost per 1,000 followers
- cost per 1,000 reach proxies
- cost per 1,000 likes

Follower count can be an input to forecasting, but never the CPM denominator unless the UI explicitly says it is a crude fallback and not true CPM.

### 2. Influencer CPM has no single universal benchmark

Research across pricing guides and vendor benchmarks shows wide dispersion:

- broad-market references often place Instagram CPM roughly around `$5-$15`
- broad-market references often place TikTok CPM roughly around `$3-$10`
- some marketer guidance uses `$10 CPM` as a rough awareness baseline
- some market-specific vendor data shows much higher format-specific CPMs, for example:
  - Instagram Stories around `EUR 43 CPM`
  - Instagram Reels around `EUR 32 CPM`
  - TikTok around `EUR 20 CPM`

Interpret this correctly:

- benchmarks vary by region
- benchmarks vary by format
- benchmarks vary by creator tier
- benchmarks vary by niche / audience quality / usage scope

Therefore:

- do not hardcode one global CPM truth
- build a configurable benchmark engine
- treat external benchmark values as priors / ranges, not universal facts

### 3. A creator quote is not one number

A professional pricing system must distinguish:

- posting / creator fee
- production fee
- editing / revision fee
- usage rights
- paid usage / whitelisting
- exclusivity
- management / agency fee
- gifting / COGS / logistics
- package discount

If you flatten these into a single fee, the resulting CPM becomes analytically weak.

### 4. Rights and distribution extras often materially change CPM

Market guidance commonly indicates that:

- usage rights can add roughly `15%-25%` for short usage windows, and sometimes materially more
- whitelisting / paid usage can add roughly `25%-35%` per month, sometimes more
- exclusivity can add roughly `20%-50%+` depending on category, duration, and creator leverage

These are not constants.
They are directional priors.

Implement this correctly:

- store these as separate cost components
- expose them explicitly in UI and API
- never silently bake them into an unlabeled “budget” field

### 5. Package quotes cannot be treated like exact per-format quotes

If the influencer says:

- `1 Reel + 3 Story frames for 120,000 TRY`

then the exact information is:

- exact package total
- exact deliverable mix

What is NOT exact:

- the per-deliverable internal allocation unless the creator actually provided it

If you derive per-format values from a package:

- label them as imputed / allocated
- preserve the exact package quote separately

### 6. A serious CPM system needs projected and realized states

Before campaign execution, the product will often have:

- exact or negotiated fee
- forecasted impressions

That means CPM is:

- projected CPM

After campaign execution, if actual impressions arrive, CPM can become:

- realized CPM

Do not confuse these.

## Product Mission

Build a professional Budget + CPM workbench that plugs into the current creator analysis flow and moves the app toward a real spreadsheet replacement.

The result must support:

1. exact quote entry for deliverables
2. exact package quote entry for bundles
3. impression forecasting by deliverable
4. projected CPM ranges
5. market benchmark comparison
6. explicit provenance and confidence
7. a premium workbench UI that belongs to the site

This must work for these deliverable types at minimum:

- `ig_reels`
- `ig_reels_collab`
- `ig_carousel`
- `ig_story`
- `tt_post`

Make the taxonomy extensible for future formats.

## Architecture Direction

Do not ship a dead-end widget.
The architecture must be row-based and collection-aware because the product goal is replacing a multi-row spreadsheet.

Even if the first UI starts from the currently searched creator(s), the domain must support many creator rows cleanly.

### Required core models

Add canonical pricing / CPM domain types.

You may name them differently, but the system needs structures equivalent to:

```ts
type DeliverableType =
  | "ig_reels"
  | "ig_reels_collab"
  | "ig_carousel"
  | "ig_story"
  | "tt_post";

type Money = {
  amount: number;
  currency: string;
  normalizedAmount: number | null;
  normalizedCurrency: string | null;
  fxRate: number | null;
};

type QuoteSourceMode = "exact" | "imputed" | "missing";

type PricingComponentType =
  | "base_posting_fee"
  | "production"
  | "editing"
  | "usage_rights"
  | "whitelisting"
  | "exclusivity"
  | "management_fee"
  | "gifted_value"
  | "shipping"
  | "package_discount"
  | "other";

type PricingComponent = {
  type: PricingComponentType;
  money: Money;
  notes?: string[];
};

type DeliverableQuote = {
  deliverableType: DeliverableType;
  quantity: number;
  sourceMode: QuoteSourceMode;
  unitPrice: Money | null;
  totalPrice: Money | null;
  pricingComponents: PricingComponent[];
  notes: string[];
};

type PackageQuote = {
  label: string;
  sourceMode: "exact_package" | "imputed_allocation";
  totalPrice: Money;
  deliverables: Array<{
    deliverableType: DeliverableType;
    quantity: number;
  }>;
  allocationMode: "manual" | "weighted_imputation" | "none";
  allocatedDeliverableTotals: DeliverableQuote[];
  notes: string[];
};

type ImpressionForecastMode =
  | "exact_historical"
  | "estimated_model"
  | "manual_override"
  | "unavailable";

type ImpressionForecast = {
  deliverableType: DeliverableType;
  sourceMode: ImpressionForecastMode;
  confidence: "low" | "medium" | "high";
  low: number | null;
  base: number | null;
  high: number | null;
  limitations: string[];
  sourceLabel: string;
};

type CpmMode =
  | "projected"
  | "projected_imputed"
  | "realized"
  | "guaranteed"
  | "unavailable";

type CpmRange = {
  low: number | null;
  base: number | null;
  high: number | null;
  currency: string | null;
};

type DeliverableCpmAnalysis = {
  deliverableType: DeliverableType;
  cpmMode: CpmMode;
  quoteSourceMode: QuoteSourceMode;
  forecastSourceMode: ImpressionForecastMode;
  mediaOnlyCpm: CpmRange;
  loadedCpm: CpmRange;
  benchmarkStatus: "efficient" | "market" | "premium" | "outlier" | "unknown";
  benchmarkContext: string | null;
  limitations: string[];
};
```

### Currency rules

Do not assume USD.

Requirements:

- support arbitrary entered currency, especially `TRY`, `USD`, `EUR`
- compute CPM in entered currency
- if you introduce normalization, make it explicit and configurable
- do not hardcode stale FX rates into the product
- if no live FX integration exists, allow manual campaign FX configuration instead of pretending

## Impression Forecasting Requirements

The CPM denominator must come from the strongest truthful visibility signal the app can produce.

### Required deliverable forecast strategy

#### 1. IG Reels

Use the best available signal surface from current app data:

- observed recent Reel views when available
- robust account-level calibration using recency weighting
- winsorization or median-heavy aggregation so one viral outlier does not dominate

Do not just use a simple arithmetic average if it makes the model fragile.

#### 2. IG Reels Collab

Treat this as a separate deliverable type.

If the codebase has no exact collab-specific forecast surface:

- derive from Reel forecast
- apply a configurable collab uplift / adjustment layer
- lower confidence explicitly
- expose the limitation

Do not silently treat collab as exactly equal to standard Reel without saying so.

#### 3. IG Carousel

Consume the existing carousel visibility capability.

Reuse or extend:

- `app/src/lib/domain/carousel-visibility.ts`

If needed, improve its integration, but do not duplicate that logic in UI code.

#### 4. IG Story

Consume the existing story visibility capability.

Reuse or extend:

- `app/src/lib/domain/story-visibility.ts`

Again:

- no duplicate heuristics scattered in UI

#### 5. TT Post

Forecast from the creator’s recent TikTok post performance:

- recent post views
- robust central tendency
- recency weighting
- outlier control

If you have multiple provider paths, preserve provenance.

### Forecast output rules

Every deliverable forecast must return:

- `low`
- `base`
- `high`
- confidence
- source label
- limitations

Do not output a naked single integer and call it the truth.

## Budget / Quote Modeling Requirements

### 1. Support exact single-deliverable quotes

Example:

- `IG Reels = 80,000 TRY`
- `IG Story = 25,000 TRY`

These should remain exact.

### 2. Support exact package quotes

Example:

- `1 IG Reels + 1 IG Story = 95,000 TRY`

The package total is exact.
The per-format allocation is not exact unless user provided it.

### 3. Allocation rules for packages

If package allocation is needed for per-format comparison:

- allow manual allocation first
- otherwise use a clearly labeled weighted-imputation method

Weighted-imputation should use a combination of:

- format-specific benchmark price weights
- format-specific impression weights
- quantity

But the final allocated numbers must be labeled:

- `imputed`

Never display imputed per-format package values as exact creator quotes.

### 4. Cost decomposition

The system must distinguish at least:

- creator media cost
- rights / amplification cost
- operational / admin cost
- discounts

At minimum, support these two CPM lenses:

- `media-only CPM`
- `loaded CPM`

## CPM Calculation Requirements

### Core formulas

For each deliverable:

```ts
expectedImpressions = forecast.base
mediaOnlyCost = creator posting + production + editing - applicable discounts
loadedCost = mediaOnlyCost + rights + whitelisting + exclusivity + management + logistics

mediaOnlyCpm = (mediaOnlyCost / expectedImpressions) * 1000
loadedCpm = (loadedCost / expectedImpressions) * 1000
```

For forecast ranges:

- use `forecast.low` and `forecast.high` to create low/base/high CPM ranges

For packages:

```ts
packageExpectedImpressions = sum(deliverable forecast.base * quantity)
packageMediaOnlyCpm = (package media cost / packageExpectedImpressions) * 1000
packageLoadedCpm = (package loaded cost / packageExpectedImpressions) * 1000
```

### Required CPM modes

Support at minimum:

1. `projected`
   - exact quote + estimated impressions
2. `projected_imputed`
   - imputed allocation and/or modeled denominator
3. `realized`
   - actual spend + actual impressions, if later available
4. `guaranteed`
   - if a guaranteed impression/view commitment exists

UI and API must preserve which one is being shown.

### Secondary metrics

A strong system should not stop at CPM.
If straightforward within current architecture, also support:

- `CPV` for video-view-based planning
- `CPE` for engagement efficiency
- `cost per reach`

But CPM remains the primary planning metric.

Do not bloat the first UI with every metric if it hurts clarity.
Choose a hierarchy that serves campaign planners.

## Benchmark Engine Requirements

Build a benchmark layer for CPM interpretation.

### Required benchmark dimensions

At minimum, support the ability to benchmark by:

- platform
- deliverable type
- follower tier
- market / region
- niche / vertical

If some dimensions are not yet available in the codebase, design the model so they can be added cleanly later.

### Benchmark behavior rules

Because research sources disagree materially, your benchmark engine must:

- store benchmark ranges, not one number
- preserve benchmark provenance
- preserve benchmark context
- allow internal calibration later from observed deals

Expected benchmark statuses:

- `efficient`
- `market`
- `premium`
- `outlier`
- `unknown`

Do not label a creator as “overpriced” from one global constant.

## Quality / Audience Fit Considerations

Pure CPM is not enough for serious decision-making.

If the app currently lacks audience quality / geo-fit / authenticity data, do not invent it.

But architect for it.

Preferred future-ready hook:

- optional `qualityAdjustedCpm`
- optional `onTargetImpressions`

If such signals do not exist yet:

- keep the interface ready
- do not surface fake values

## UI / UX Requirements

This module must feel like the Excel replacement inside the site’s actual design language.

Do not build a detached random card bolted underneath the benchmark panels.

### Product shape

Create a workbench-style pricing surface that can grow into a row-based planning table.

The UI should support grouped columns conceptually similar to:

- Followers
- Budget
- Impressions
- CPM

But upgraded for the product:

- better hierarchy
- provenance badges
- package disclosure
- confidence-aware ranges
- premium readability

### UI requirements

At minimum, support:

1. deliverable-level quote entry
2. package quote entry
3. per-deliverable projected impressions
4. per-deliverable CPM range
5. package CPM range
6. exact vs imputed badges
7. benchmark status chips
8. tooltips or inline explanations for limitations

### UI truthfulness rules

Never show:

- a naked CPM number with no indication of whether denominator is estimated
- imputed package allocation as if it were creator-provided
- loaded CPM without making extra cost layers visible

The user must be able to distinguish:

- exact quote
- imputed quote
- estimated impressions
- projected CPM
- realized CPM

### Workbench direction

Do not design only for one creator forever.
The structure should clearly support:

- multiple creator rows
- sorting / scanning later
- spreadsheet replacement behavior

If full multi-row persistence is too much for this pass, still build:

- the row model
- the collection model
- the components in a way that can expand naturally

## Persistence Direction

If the codebase does not already include a backend persistence layer:

- do not invent heavyweight infrastructure
- implement a clean local-first store abstraction
- use local state or `localStorage` only behind a proper interface

The point is to avoid dead-end component state spaghetti.

## API Requirements

You may extend `POST /api/analyze-all` or add a new route if cleaner.

But the final API contract must return structured pricing / CPM objects, not loose scalar fields.

The API must preserve:

- quote provenance
- forecast provenance
- CPM mode
- benchmark context
- limitations

Do not return a bare `cpm` number without context.

## Integration Requirements

The Budget + CPM work must plug into current platform analysis instead of bypassing it.

Use current analysis outputs where they are already the strongest truth surface:

- profile follower counts
- Instagram Reel benchmark data
- TikTok recent post performance
- story visibility estimator
- carousel visibility estimator

Do not fork a separate inconsistent forecasting path unless absolutely necessary.

## Testing Requirements

Add tests proving:

1. exact single-deliverable quotes and exact package quotes are represented differently
2. package allocations can be imputed and are visibly labeled as imputed
3. media-only CPM and loaded CPM are computed separately and correctly
4. projected CPM uses forecast ranges correctly
5. benchmark status logic works with configurable ranges
6. IG Story CPM consumes story visibility forecast rather than follower count directly
7. IG Carousel CPM consumes carousel visibility forecast rather than follower count directly
8. TikTok CPM uses recent TikTok performance calibration
9. UI badges for exact / imputed / projected render correctly
10. existing benchmark behavior for Instagram and TikTok does not regress

## Verification Requirements

When implementation is complete, run from `app/`:

- `npm run test`
- `npm run test:ui`
- `npm run build`

If something cannot run, say exactly why.

## Hard Rules

- do not use followers as the CPM denominator except in an explicitly labeled crude fallback mode
- do not show projected CPM as if it were realized CPM
- do not show imputed package allocations as if they were creator-provided prices
- do not hide rights / whitelisting / exclusivity inside an unlabeled fee
- do not hardcode one global CPM benchmark and pretend it applies everywhere
- do not regress existing Instagram / TikTok benchmark pipelines
- do not ship a UI-only fake module with no clean domain model

## Deliverable Standard

When you finish, the app should feel materially closer to replacing the spreadsheet:

- a marketer can enter or review creator pricing
- the system can forecast impressions by deliverable
- the system can compute CPM ranges professionally
- the system distinguishes exact, imputed, projected, and unavailable states honestly
- the UI looks intentional and native to the site rather than a bolted-on calculator
