# Antigravity / Claude Opus 4.6 Prompt

You are Claude Opus 4.6 inside Antigravity, working on an existing cross-platform benchmark app.

The UI work is already partially done.
The current failure is that TikTok still runs on mock data instead of a live provider.

This is an integration takeover task, not a greenfield feature task.

Do not rebuild the app.
Do not stop at research.
Do not leave TikTok in mock mode unless you prove that every realistic live path is blocked.

## Immediate Problem

The app currently shows:

- `Source: TikTok Mock (dev)`
- `MOCK DATA`

That means the TikTok path is not actually live.

Your job is to take over the current TikTok implementation and drive it to the strongest truthful live state possible.

## Current Workspace

Inspect these first:

- `app/README.md`
- `docs/research/2026-03-13-tiktok-benchmark-research.md`
- `docs/research/2026-03-13-tiktok-live-integration-options.md`
- `prompts/opus-4-6-antigravity-instagram-tiktok-benchmark.md`

Then inspect the current TikTok code path:

- `app/src/lib/providers/factory.ts`
- `app/src/lib/providers/tiktok-research-provider.ts`
- `app/src/lib/providers/tiktok-mock-provider.ts`
- `app/src/lib/providers/interface.ts`
- `app/src/lib/domain/types.ts`
- `app/src/app/api/analyze/route.ts`
- `app/src/app/page.tsx`

You must start by explaining exactly why the app is still using mock mode.

## Root-Cause Requirement

Do not jump to fixes.

First prove:

1. how provider selection currently works
2. what env vars are required
3. whether the Research provider is technically implemented
4. what exact condition causes fallback to `TikTokMockProvider`
5. whether the blocker is:
   - missing credentials
   - wrong activation logic
   - broken Research API assumptions
   - restricted TikTok access
   - or a combination

## Research Requirement

You must perform a comprehensive current-state capability audit before choosing the final integration path.

### First priority: official TikTok sources

Use official TikTok developer docs first and treat them as the primary source of truth.

At minimum evaluate:

- Display API
- Research API
- Research API token flow
- Research API user query
- Research API video query
- Research API data freshness / FAQ limitations
- Commercial Content API

Use these official docs:

- https://developers.tiktok.com/doc/display-api-overview
- https://developers.tiktok.com/doc/client-access-token-management
- https://developers.tiktok.com/doc/research-api-get-started/
- https://developers.tiktok.com/doc/research-api-specs-query-videos/
- https://developers.tiktok.com/doc/research-api-specs-query-user-info/
- https://developers.tiktok.com/doc/research-api-faqs
- https://developers.tiktok.com/doc/commercial-content-api-getting-started/
- https://developers.tiktok.com/doc/commercial-content-api-query-commercial-content/

### Second priority: managed live fallback providers

If official TikTok APIs are restricted, impractical, or not suitable for this product's real agency use case, then research managed fallback providers using their own official docs / product docs.

At minimum evaluate:

- Apify TikTok scraper products
- Bright Data TikTok scraping APIs

Use these references:

- https://apify.com/clockworks/tiktok-scraper/api
- https://apify.com/apidojo/tiktok-scraper-api
- https://docs.brightdata.com/api-reference/web-scraper-api/social-media-apis/tiktok

## Decision Standard

You must choose the strongest truthful path that can make the app actually work.

That means:

### Option A: Official live path

Use official TikTok Research / Commercial Content APIs if:

- access is actually available
- credentials can actually be obtained
- the APIs can actually support the product goal

### Option B: Managed fallback live path

If official access is blocked or not realistic for this product, then:

- do not keep TikTok on mock mode
- integrate one managed fallback provider
- prefer a provider with reliable public profile/video access and engagement metrics
- keep the implementation behind the existing provider abstraction

## Truthfulness Rules

Do not pretend official support exists if it does not.
Do not pretend live verification succeeded if you only used fixtures.
Do not leave a “ready but unused” provider and call the task complete.

If the final system uses:

- official TikTok APIs, say so clearly
- managed fallback, say so clearly
- mock only as last resort, say so clearly and explain the blocker precisely

## Product Goal

TikTok must support the same benchmark experience conceptually as Instagram:

- latest 5 eligible organic videos
- latest 5 eligible commercial videos
- exact-5 benchmark rule
- insufficient-data state when fewer than 5 exist
- deterministic commercial classification
- visible source/provider labeling

Do not regress the current UI separation between Instagram and TikTok.

## Commercial Detection Expectations

TikTok commercial classification should use the strongest deterministic signals available, in this priority order:

1. official provider metadata if available
   - paid partnership signals
   - creator commission / ad metadata
   - commercial content API signals
2. provider metadata fields such as tags / labels
3. deterministic caption / hashtag / mention rules

Do not use opaque ML classification.

## Implementation Requirements

You must:

1. inspect current code
2. identify the exact mock fallback path
3. choose the best live TikTok strategy
4. patch provider selection and env wiring
5. implement any missing provider logic
6. keep the shared benchmark pipeline intact
7. run the app locally
8. verify a real TikTok username against a live provider if credentials and network access allow

## Environment / Operator Behavior

You are responsible for doing as much of the setup yourself as possible.

That includes:

- inspecting `.env.example`
- adding missing TikTok env vars if needed
- creating or updating `.env.local` if values are available
- installing any SDK/client dependency if needed
- wiring provider selection so TikTok does not silently stay on mock

If Antigravity has browser / operator capabilities, use them.

If credentials or provider accounts must be created manually, push the process as far as possible yourself and ask only for the smallest missing thing.

## Minimal User Interruptions

Only ask me for action when truly necessary, such as:

- TikTok developer login
- 2FA
- approving provider credentials / API key creation
- a billing or provider dashboard confirmation that cannot be automated

Do not ask me to manually write env files if you can do it.
Do not stop at “here is what you should do next.”

## API / Code Expectations

Preserve the current platform-aware architecture where possible.

Keep TikTok behind a provider abstraction.

If needed, introduce or refine provider labels such as:

- `tiktok-research`
- `tiktok-commercial-content`
- `tiktok-apify`
- `tiktok-brightdata`
- `tiktok-mock`

The UI must clearly surface whichever source is actually in use.

## Testing Requirements

Add or update tests for:

- provider selection logic
- TikTok live provider mapping
- TikTok fallback provider mapping
- commercial signal extraction
- exact-5 rule for TikTok
- insufficient-data behavior
- API response source labeling
- UI rendering of provider state

## Verification Requirements

You must verify more than just unit tests.

At minimum:

1. confirm provider selection does not default to mock when live configuration exists
2. run the local app
3. make a real TikTok analysis request if a live provider is configured
4. verify that the response source is not `tiktok-mock`
5. verify the UI no longer shows `MOCK DATA` for the live path

If live verification is impossible, state the exact blocker and the exact furthest-working state you reached.

## Strong Preference

If official TikTok access is not realistically obtainable in this environment, prefer integrating a managed fallback provider over leaving the app in mock mode.

Do not default to “official only or nothing.”

The product goal is a working system.

## Hard Rules

- do not rebuild the app
- do not keep TikTok mock-only and call the task done
- do not stop at research without integrating a live path
- do not use raw brittle scraping if a managed provider is the stronger option
- do not hide whether the final TikTok source is official or fallback
- do not compute invalid partial benchmarks

## Final Report

When finished, report exactly:

1. why TikTok was stuck on mock mode
2. what official TikTok path is realistically available
3. what live path you chose
4. whether it is official or managed fallback
5. what env vars / setup were added
6. whether you verified a real live TikTok request
7. whether the UI still shows mock mode or now shows a live source
8. what blockers remain, if any

Start by auditing the current TikTok provider flow and proving exactly why the app is still rendering `TikTok Mock (dev)` before making implementation changes.
