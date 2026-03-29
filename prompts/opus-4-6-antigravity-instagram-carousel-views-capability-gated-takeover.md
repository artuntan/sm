You are Claude Opus 4.6 inside Antigravity, working on an existing creator benchmark application for marketing teams.

This is an Instagram carousel post visibility research-to-integration takeover.

Do not fake certainty.
Do not present estimated carousel views as if they were exact.

## Ground truth you must respect

The product question has already been researched.

### 1. Exact carousel visibility is possible for connected / owned professional accounts

Official Instagram Media Insights documentation states:

- `GET /<INSTAGRAM_MEDIA_ID>/insights`
- insights are for **your app user's Instagram Media object**
- the `views` metric now exists for `FEED (posts)`, `REELS`, and `STORY`
- `reach` also exists for `FEED (posts)`, `REELS`, and `STORY`
- `likes`, `comments`, `saved`, `shares`, `profile_activity`, and `profile_visits` are available on `FEED (posts)` as applicable

Important constraint:

- “Album metrics: Insights data is not available for any media within an Instagram Media album.”

Interpret this correctly:

- do **not** try to read insights from carousel child media
- if exact connected support is implemented for carousel posts, operate at the **carousel container post level**

If documentation ambiguity remains in one edge case, be conservative and encode limitations clearly.

### 2. Exact carousel views are NOT available for arbitrary public influencers via the official public Meta route

Official Instagram Media reference states:

- `view_count` is public
- but `view_count` is for **Instagram reels**
- and is available for **Business Discovery API only**

Business Discovery sample responses can return:

- `comments_count`
- `like_count`
- `view_count`

But that does **not** mean public carousel posts expose exact view counts.

Ground truth:

- public Business Discovery can expose exact Reel view counts
- public Business Discovery does **not** give you exact public carousel views

Therefore:

- for an arbitrary public influencer’s carousel post, official public Meta API does **not** give you exact views
- if the influencer is not connected / authorized, you must estimate

### 3. Public estimation inputs are narrower than connected inputs

For arbitrary public accounts, the official/public path can support or partially support:

- follower count
- like count
- comment count
- timestamp
- media type / product type

For connected media insights, you may also get:

- exact views
- exact reach
- saved
- shares
- profile activity
- profile visits

Do not design the estimator as if public `shares` or `saved` are always available.

If third-party providers expose additional public signals, treat them as provider-specific, optional signals, not guaranteed Meta truth.

## Existing codebase facts you must account for

You are working inside a codebase that is still reel-centric for Instagram.

Current realities:

- `app/src/lib/providers/meta-provider.ts` currently requests only `view_count` for Instagram media
- official docs say that public `view_count` is reel-only
- `app/src/lib/domain/selection.ts` explicitly filters Instagram items to `contentKind === "REELS"`
- non-Reels are intentionally excluded from the benchmark pipeline

That means carousel view work must **not** accidentally contaminate or break the existing reel benchmark system.

Carousel visibility is a separate capability.

## Product direction you must implement

Build a capability-gated Instagram Carousel Visibility layer with **three truth states**:

1. `exact_connected`
2. `estimated`
3. `unavailable`

If you choose to leave room for vendor support, that may be added as:

4. `observed_vendor`

But do not make vendor support required unless the codebase already has a real vendor contract for it.

## Required implementation direction

### 1. Add a canonical carousel visibility model

Create a new domain model, or an equivalent extension, for Instagram carousel post visibility.

It must represent:

- source mode (`exact_connected` | `estimated` | `unavailable` | optional `observed_vendor`)
- source provider (`meta` | `heuristic` | `vendor` | `none`)
- media id
- permalink
- username
- post timestamp
- media type / content kind
- exact views
- exact reach
- estimated views range
- estimated reach range
- exact or inferred engagement counts
- confidence
- limitations
- model version

Preserve whether the number is:

- exact
- estimated
- unavailable

### 2. Add exact-connected carousel insights support

Implement the official connected-account path for carousel visibility.

Requirements:

- only for creator/business accounts that are actually connected / authorized
- request media insights at the carousel container level, not child-media level
- read `views` and `reach` where supported
- also surface `likes`, `comments`, `saved`, `shares`, `profile_activity`, `profile_visits` if available and useful
- encode any Meta limitations honestly

If the current codebase lacks the auth foundation for connected Instagram media insights:

- build the interfaces, provider contracts, API shape, and capability flags cleanly
- do not fake a live connected implementation

### 3. Extend public provider data so estimation has real inputs

You must improve the public-input foundation for carousel estimation.

At minimum:

- extend the Meta Business Discovery provider to fetch `like_count` and `comments_count` where appropriate
- preserve raw `media_type` and `media_product_type`
- preserve follower count
- preserve timestamp

Also use the existing Apify Instagram provider signal surface when available:

- `likesCount`
- `commentsCount`
- `mediaType`
- `productType`

These should flow into a normalized content-level signal model so the estimator can work consistently across sources.

### 4. Build a PROFESSIONAL carousel views estimator

Do not ship a toy heuristic.
Do not output a fake single number.

Build a serious first-pass estimator that is:

- range-based
- confidence-scored
- source-aware
- robust to sparse signals
- explicit about uncertainty

#### Required estimation strategy

Use a multi-signal model, not a one-feature guess.

The estimate should combine at least these families of evidence:

##### A. Follower prior

Create a follower-tier prior for expected carousel distribution:

- views per follower
- reach per follower

This is the coarse baseline.

##### B. Account-specific performance prior

Calibrate from observed account performance already collected in the app.

For example:

- recent Reel average / median views
- organic vs commercial split quality
- recent content consistency

But do not assume carousels perform exactly like Reels.
Use a calibrated **carousel-to-reel ratio prior** rather than direct substitution.

##### C. Engagement inversion

Backsolve likely views from engagement counts using expected rates.

Examples:

- `estimated_views_from_likes = like_count / expected_like_rate`
- `estimated_views_from_comments = comments_count / expected_comment_rate`

Expected rates should be conditioned on:

- follower tier
- creator performance tier
- content type = carousel
- commercial vs organic if inferable

Do not use naive global constants if you can avoid it.

##### D. Optional richer signals

If available from connected or vendor paths, incorporate:

- shares
- saves
- profile activity
- profile visits

But public estimation must not depend on these.

#### Required combination method

Combine the different estimators in **log space** or another robust aggregation method.

Good options:

- weighted log-mean
- Bayesian posterior-style blending
- quantile blending with winsorization

Bad options:

- plain arithmetic average of incompatible estimates
- choosing one signal blindly
- hardcoding a magic multiplier with no confidence logic

#### Required output behavior

The estimator must output:

- `estimatedViews.low`
- `estimatedViews.high`
- `estimatedReach.low`
- `estimatedReach.high`
- `confidence`
- `limitations`
- `modelVersion`

The range should reflect uncertainty honestly.

Confidence should degrade when:

- follower count is missing
- engagement counts are missing
- account calibration is weak
- post age is too recent
- multiple estimators disagree materially

### 5. Handle post-age correctly

Carousel engagement accumulates over time.

Your estimator must not treat:

- a post from 2 hours ago
- and a post from 10 days ago

as comparable without normalization.

Add a post-age factor:

- early-life uncertainty penalty
- optional maturation curve
- conservative widening of estimate ranges for very recent posts

### 6. Keep the reel benchmark system isolated

Do not break:

- existing Instagram reel benchmarks
- TikTok benchmarks
- story visibility capability
- current profile cards

Carousel visibility should be additive and modular.

Do not force carousel posts through the reel benchmark selector.

### 7. Make UI/API truthfulness explicit

The UI and API must clearly distinguish:

- `Exact (Connected via Meta)`
- `Estimated`
- `Unavailable`

For estimated mode, show:

- view range
- reach range
- confidence
- compact explanation

Do not present estimated carousel views with the same visual treatment as exact views unless provenance is obvious.

### 8. Suggested modeling detail

A strong v1 design looks like this:

- follower prior in follower-tier bands
- account calibration from recent observed reel median
- engagement inversion from likes/comments
- age normalization
- disagreement-based confidence penalty
- output quantile range rather than point prediction

If enough calibration data exists, prefer medians and winsorized ratios over means.

If not enough calibration data exists, bias toward wider ranges, not false precision.

## Implementation quality bar

This must feel production-minded:

- clear domain model
- clear provenance
- robust fallbacks
- confidence-aware
- no fake precision
- no breaking changes to the existing benchmark pipeline

## Verification

After implementation:

- run the relevant tests from `app/`
- add or update tests for:
  - connected exact carousel mode
  - public estimated carousel mode
  - missing-signal / unavailable mode
  - confidence downgrade paths
  - preservation of existing reel-only benchmark behavior
- run build validation

Do not stop at a rough heuristic.
Build the strongest truthful v1 carousel visibility system this codebase can support.
