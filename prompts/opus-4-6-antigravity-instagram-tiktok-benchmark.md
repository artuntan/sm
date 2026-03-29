# Antigravity / Claude Opus 4.6 Prompt

You are Claude Opus 4.6 inside Antigravity, working on an existing benchmark app.

Do not rebuild the app.
Inspect the current workspace first, understand the current Instagram benchmark system, then extend the product into a truthful, production-lean cross-platform benchmark tool for both Instagram and TikTok.

This is not just a coding task.
It is also a product, architecture, and capability-audit task.

## Existing Workspace

The current app already exists under `app/`.

Read these first and treat them as the initial source of truth:

- `app/README.md`
- `docs/research/2026-03-12-instagram-reels-benchmark-research.md`
- `docs/plans/2026-03-12-instagram-reels-benchmark-design.md`
- `docs/plans/2026-03-12-instagram-reels-benchmark-implementation.md`
- `docs/research/2026-03-13-tiktok-benchmark-research.md`

Then inspect the current implementation in:

- `app/src/app/page.tsx`
- `app/src/app/api/analyze/route.ts`
- `app/src/lib/domain/types.ts`
- `app/src/lib/domain/normalize.ts`
- `app/src/lib/domain/selection.ts`
- `app/src/lib/providers/*`

## Mission

Extend the current Instagram benchmark app so it supports both:

1. Instagram
2. TikTok

The app should help agency users benchmark creator performance with two buckets per platform:

- Organic Performance
- Commercial Performance

## Product Behavior

For each platform, the app should:

1. accept a username
2. fetch recent public content for that username
3. exclude benchmark-ineligible content
4. classify remaining content into organic vs commercial
5. sort newest first inside each bucket
6. take the latest 5 eligible items per bucket
7. compute average views only when the bucket has exactly 5 items
8. return an explicit insufficient-data state otherwise

This exact-5 rule applies to both Instagram and TikTok.

## Hard Product Rule

A benchmark is valid only when it is based on exactly 5 eligible items.

That means:

- if a bucket has 5 eligible items, show the average
- if a bucket has fewer than 5 eligible items, do not show the average
- show an intentional insufficient-data state instead

No partial benchmark averages.
No fake confidence.

## Current Instagram Baseline

Preserve the current Instagram behavior unless clearly broken:

- public professional accounts only
- Meta Graph API / Business Discovery based
- latest 5 eligible Reels
- commercial detection via deterministic rules
- benchmark eligibility exclusion before classification
- exact-5 benchmark enforcement

Do not regress the current Instagram implementation.

## TikTok Research Requirement

Before writing TikTok integration code, research the CURRENT official TikTok capabilities using official TikTok developer documentation only.

At minimum, inspect and reason about:

- TikTok Display API
- TikTok Research API overview
- TikTok Research API video query capabilities
- TikTok Research API FAQ notes on data freshness
- any official TikTok fields or endpoints relevant to:
  - username-based lookup
  - public video retrieval
  - view counts
  - video descriptions / captions
  - commercial / paid partnership signals

Use these official docs as key references:

- https://developers.tiktok.com/doc/display-api-overview
- https://developers.tiktok.com/doc/research-api-overview/
- https://developers.tiktok.com/doc/research-api-specs-query-videos
- https://developers.tiktok.com/doc/research-api-faqs
- https://developers.tiktok.com/doc/research-api-specs-query-user-pinned-videos

## TikTok Truthfulness Rule

Do not pretend the official TikTok API can do more than it actually can.

You must explicitly determine whether the official TikTok path can support this product requirement:

> benchmark arbitrary public TikTok usernames for agency use with recent video view counts and commercial-vs-organic separation

If official TikTok APIs are insufficient, restricted, delayed, or not appropriate for general production agency usage:

- say that clearly
- do not hide the limitation
- design the implementation accordingly

## Required TikTok Strategy

Choose the strongest truthful architecture after your TikTok capability audit.

In practice, you should bias toward this structure:

- shared benchmark domain logic
- platform-specific provider layer
- official-ready TikTok provider path
- fallback-ready TikTok provider path if the product requires real public coverage and the official path is insufficient

Do not hardcode a lie into the product.

If you implement a non-official TikTok provider or mock path:

- label it clearly
- keep it isolated behind the provider abstraction
- state exactly what is official vs restricted vs fallback

## Recommended Architecture Direction

Refactor the current Instagram-centric structure into a platform-aware one.

Use canonical platform-agnostic types where helpful, for example:

```ts
type Platform = "instagram" | "tiktok";

type ContentItem = {
  id: string;
  platform: Platform;
  username: string;
  caption: string | null;
  timestamp: string;
  views: number | null;
  permalink: string;
  thumbnailUrl?: string | null;
  provider: string;
  contentKind?: string | null;
  rawMetadata?: Record<string, unknown>;
};
```

Preserve the existing dual-benchmark idea:

- organic bucket
- commercial bucket
- comparison metrics when both are complete

## Shared Domain Rules

Keep benchmark logic deterministic, explainable, and auditable.

Required shared layers:

1. username normalization
2. benchmark eligibility filtering
3. commercial classification
4. latest-5 selection
5. average calculation
6. insufficient-data handling

### Benchmark eligibility

Benchmark-ineligible content must be removed before organic/commercial classification and before latest-5 selection.

Preserve or generalize the current logic for:

- test content
- trial content
- drafts / accidental posts / internal QA markers

Do not use weak naive substring hacks.

### Commercial classification

Commercial detection must remain deterministic and explainable.

It should support:

- explicit disclosure markers
- branded hashtags
- brand mentions
- campaign clusters
- official commercial metadata if a provider exposes it

For TikTok specifically:

- if official metadata such as ad / paid partnership signals exists and is available from the provider, use it as a strong signal
- if not, fall back to deterministic caption / hashtag / mention logic

## Platform-Specific Rules

### Instagram

- benchmark the latest 5 eligible Reels
- preserve Meta provider behavior

### TikTok

- benchmark the latest 5 eligible public TikTok videos
- use the strongest truthful provider path
- if the provider cannot reliably produce 5 valid items, return insufficient-data

## API Requirements

Patch the API contract so the request is platform-aware, for example:

```ts
type AnalyzeRequest = {
  platform: "instagram" | "tiktok";
  username: string;
};
```

The response should include:

- platform
- source / provider
- analyzedAt
- organic bucket
- commercial bucket
- comparison metrics when both are complete
- exclusion counts
- warnings
- any explicit capability limitations if needed

Keep backward compatibility only if it is low-risk and clearly worthwhile.
Otherwise, prefer a clean platform-aware contract.

## UI / UX Mandate

The Instagram and TikTok experience must be clearly separated.

This is a major product requirement.

The UI must not feel like TikTok was bolted onto an Instagram screen.

### Required UX outcome

The user should instantly understand:

- which platform they are analyzing
- that Instagram and TikTok are distinct analysis surfaces
- that each platform has its own organic and commercial benchmarks
- what is complete vs insufficient
- what data source was used
- what limitations apply

### Strong design direction

Use a platform-separating UI system such as:

- a strong two-platform selector
- two clearly different platform panels
- platform-specific summary shells
- platform-coded labels and source badges

Do not choose a weak generic toggle with no product identity.

The split should happen at the platform layer first, then inside each platform at the benchmark layer:

1. Instagram vs TikTok
2. Organic vs Commercial

### UX requirements

- platform selection must be obvious and intentional
- Instagram and TikTok should have clearly separated states
- desktop and mobile must both feel deliberate
- source labels must be visible, e.g. Meta / TikTok Official / TikTok Fallback / Mock
- incomplete TikTok official support must be surfaced honestly, not hidden
- no generic AI dashboard styling
- preserve the current design language if strong; otherwise upgrade it coherently

### Good output structure

The main page should likely include:

- platform chooser
- platform-specific analyze input
- benchmark summary
- organic benchmark section
- commercial benchmark section
- comparison section
- included content evidence
- provider/source + limitation notes

If you find a stronger information architecture after inspecting the current UI, use it and explain why.

## Implementation Expectations

Do not rebuild from scratch.

You must:

1. inspect the existing app
2. explain the current Instagram benchmark flow briefly
3. explain the official TikTok feasibility result briefly
4. propose the architecture and UI approach in 5-8 bullets
5. implement the changes
6. run relevant tests
7. clearly state what is official vs fallback vs mock

## Testing Requirements

Add or update tests for:

- platform-aware request validation
- Instagram regression coverage
- TikTok provider mapping
- shared normalization
- benchmark eligibility rules
- commercial classification
- latest-5 exact selection
- insufficient-data behavior
- platform-specific UI rendering
- platform switch UX happy path

If live TikTok credentials or provider access are unavailable:

- still implement the real provider interface
- add clearly labeled test fixtures or mock paths
- do not pretend live verification succeeded

## Verification Requirements

Run the relevant test suite.

At minimum verify:

- Instagram still works
- the UI cleanly separates Instagram and TikTok
- TikTok requests return the correct state shape
- insufficient-data states are honest
- source/provider labels are visible

## Hard Rules

- do not rebuild the app from scratch
- do not regress current Instagram functionality
- do not pretend official TikTok support exists where it does not
- do not hide TikTok limitations
- do not compute benchmarks from fewer than 5 items
- do not make the UI ambiguous between platforms
- do not stop at a research memo; actually patch the app

## Final Reporting Requirements

When finished, report exactly:

1. current Instagram architecture summary
2. official TikTok feasibility summary
3. what architecture changes you made
4. what UI system you chose and why
5. what is official vs fallback vs mock
6. what was tested
7. what limitations remain

Start by inspecting the current workspace, summarizing the existing Instagram benchmark flow, and then performing the TikTok official capability audit before making implementation decisions.
