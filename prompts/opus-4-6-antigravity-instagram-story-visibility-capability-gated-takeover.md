You are Claude Opus 4.6 inside Antigravity, working on an existing creator benchmark application for marketing teams.

This is an Instagram Story visibility research-to-integration takeover.

Do not fake certainty.
Do not present estimated story visibility as if it were exact.

The product question has already been researched:

## Ground truth you must respect

### 1. Exact Instagram Story view data exists, but only in limited conditions

Official Meta / Instagram documentation shows that story-level metrics such as:

- `views`
- `reach`
- `navigation`
- `replies`
- `profile_activity`
- `profile_visits`
- `shares`
- `total_interactions`

exist on the Instagram Media Insights endpoint for `STORY` media.

But those insights are for **your app user’s own Instagram Media object**, not arbitrary public influencers.

### 2. Exact story views for arbitrary public influencers are not available via the official public Meta route

Business Discovery can read:

- `followers_count`
- `media_count`
- public media fields

for another business/creator account.

But Business Discovery does **not** expose arbitrary external story insights as a public, official capability.

That means:

- you cannot truthfully show exact story views for any public influencer just because you know their username
- you must not imply otherwise in product copy, API responses, or UI

### 3. Third-party vendors may track active or historical Stories, but that is not the same thing as an official Meta capability

There are market vendors that claim Story monitoring/tracking for arbitrary influencers.
That can be integrated as a vendor-backed source if the product chooses it.

But you must treat that as:

- vendor-observed / proprietary
- not Meta-official
- source-labeled
- compliance-reviewed

### 4. Estimation is possible, but must be clearly labeled as estimation

Story visibility can be estimated from benchmarks and observed public performance signals.

It must be presented as:

- estimated
- confidence-banded
- range-based where appropriate
- not exact

## Product direction you must implement

Build a capability-gated Instagram Story Visibility layer with **three truth states**:

1. `exact_connected`
2. `observed_vendor`
3. `estimated`

Do not collapse these into a single generic “story views” number.

## Required implementation direction

### 1. Extend the domain model

Add a new canonical Story Visibility model, or equivalent, that can represent:

- platform
- username
- story media id (if known)
- source mode (`exact_connected` | `observed_vendor` | `estimated`)
- source provider (`meta`, `vendor_name`, `model`)
- views
- reach
- navigation
- replies
- profile activity / profile visits if available
- confidence level
- estimation range (low / high) when estimated
- story published time
- story expiry / freshness state
- limitations / caveats

This model must preserve whether a metric is:

- exact
- observed from vendor
- estimated
- unavailable

### 2. Add exact-connected Story Insights support for creator-authorized accounts

Implement the official Meta-compatible path for exact story insights **only** when the creator account is connected / authorized.

That means:

- detect or model a “creator-authorized” state
- support fetching story media insights for connected professional accounts
- capture story metrics before the story expires
- handle the 24-hour availability limitation

If the codebase lacks the required auth/persistence primitives, implement the cleanest viable foundation:

- interfaces
- provider contracts
- capability flags
- API response shape
- UI state

and do not fake a working connected flow if the underlying auth is absent.

### 3. Add an estimation mode for arbitrary influencers

For influencers who are not connected:

- do not show exact story views
- provide a clearly labeled estimate only if there is enough data to support it

Expected estimation inputs can include:

- follower count
- account size tier
- story format hint if known
- posting cadence / story burst length if known
- public content performance already collected in the platform
- historical internal calibration data if available

You may start with a benchmark-driven heuristic model, but it must be framed as a first-pass estimator.

Do not overfit a fake precision model.
Do not output a single exact integer without confidence context.

Preferred output shape:

- estimated viewers low
- estimated viewers high
- estimated reach low
- estimated reach high
- confidence (`low` / `medium` / `high`)

### 4. Make UI truthfulness explicit

The UI must visually distinguish:

- `Exact (Connected via Meta)`
- `Observed (Vendor)`
- `Estimated`
- `Unavailable`

For estimated mode, show range + confidence + explanation.

For unavailable mode, explain why:

- not creator-connected
- story expired
- insufficient evidence
- vendor source not enabled

Do not let users confuse modeled output with measured output.

### 5. Preserve current benchmark system integrity

Do not regress:

- current Instagram post/reel benchmark pipeline
- TikTok behavior
- follower/profile cards
- Meta-first Instagram source messaging

Story visibility is an additive capability, not a rewrite of the existing benchmark core.

## Official constraints you must encode in product behavior

Your implementation must account for these constraints:

- story insights are time-sensitive
- some story metrics are only available for 24 hours
- metrics may be delayed
- some story metrics return errors for very low viewership
- some metrics have regional caveats
- Instagram Login and Facebook Login have different operational constraints

Do not bury these in code comments only.
Surface them through limitations / capability metadata.

## Vendor path rules

If you add a vendor adapter interface or placeholder:

- make it optional
- source-label it clearly
- do not claim Meta provenance
- do not make vendor mode the default truth source unless explicitly configured

You may implement:

- adapter interfaces
- source enums
- API schema support
- UI treatment

without hardcoding a live vendor integration if credentials/contracts are absent.

## API expectations

Patch the relevant API routes so Story Visibility is returned in a clean, explicit structure.

The API must never return a bare `storyViews` field without provenance.

Instead, return a structured object that includes:

- value(s)
- source mode
- confidence
- limitations

## Testing requirements

Add or update tests to prove:

1. exact-connected, observed-vendor, estimated, and unavailable states are distinguishable
2. estimated mode cannot be mistaken for exact mode
3. UI labels and disclaimers render correctly
4. API responses preserve provenance and confidence metadata
5. existing Instagram benchmark behavior is not broken

## Verification requirements

When implementation is complete, run the relevant checks from `app/`:

- `npm run test`
- `npm run test:ui`
- `npm run build`

If any command cannot run, say exactly why.

## Hard rules

- do not fake exact story views for arbitrary public influencers
- do not treat Business Discovery as a story insights API for other users
- do not hide whether a number is modeled vs measured
- do not regress existing Instagram or TikTok benchmark behavior

## Acceptance criteria

You are only done if:

1. the system can represent story visibility truthfully across exact / vendor / estimated / unavailable modes
2. arbitrary influencers are no longer implicitly treated as exact-measurable for stories
3. creator-connected exact story insights have a clean integration path or foundation
4. estimated mode is range-based and confidence-labeled
5. UI and API preserve provenance explicitly
6. tests and build verification pass or are explicitly explained

## Final report format

When finished, report exactly:

1. what official story visibility capability exists
2. what official capability does **not** exist
3. what domain model you added
4. what API/UI provenance treatment you added
5. whether you implemented exact-connected flow, estimated flow, or both
6. what tests were updated
7. which verification commands passed

Start by inspecting the current domain types, provider contracts, and analysis API response shapes before patching.
