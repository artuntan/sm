You are Claude Opus 4.6 inside Antigravity, working on an existing creator benchmark app.

This is a product-and-implementation takeover task.
Do not rebuild the app from scratch.
Inspect the current workspace first, identify the actual architecture constraints, then upgrade the product into a professional cross-platform marketing workbench.

The product is no longer just a creator benchmark toy.
It must become a serious tool that a company marketing team can use.

Your work must cover:

1. professional search UX
2. simultaneous Instagram + TikTok search
3. follower count visibility for both platforms
4. a premium interface in the `skills.name` visual language

Do not stop at superficial UI tweaks.
This requires backend, domain-model, API-contract, and frontend changes.

Current implementation reality you must verify first:

- the current app is still centered around a single selected platform, not true dual-platform lookup
- the current API route is `POST /api/analyze` and accepts one `platform` + one `username`
- current provider interfaces return recent media only
- current canonical result shape does not expose profile-level stats like followers
- the current UI is still a gradient benchmark dashboard, not the `skills.name` design language

Read these files first:

- `app/src/app/page.tsx`
- `app/src/app/api/analyze/route.ts`
- `app/src/app/layout.tsx`
- `app/src/app/globals.css`
- `app/src/lib/domain/types.ts`
- `app/src/lib/domain/normalize.ts`
- `app/src/lib/domain/selection.ts`
- `app/src/lib/providers/interface.ts`
- `app/src/lib/providers/factory.ts`
- `app/src/lib/providers/instagram-apify-provider.ts`
- `app/src/lib/providers/meta-provider.ts`
- `app/src/lib/providers/tiktok-apify-provider.ts`
- `app/src/lib/providers/tiktok-research-provider.ts`
- `app/src/__tests__/page.test.tsx`
- `app/src/__tests__/platform-api.test.ts`
- `app/src/__tests__/tiktok-benchmark.test.ts`
- `app/src/__tests__/instagram-pipeline-regression.test.ts`

You must reason from the existing code before patching.

## Product Mission

Upgrade the app into a dual-platform creator analysis surface for marketing teams.

The upgraded product must let a user analyze Instagram and TikTok together in one professional search flow and see, side by side:

- platform presence
- follower count
- source transparency
- organic benchmark
- commercial benchmark
- comparison states
- missing-data states

This is not just “toggle between apps”.
It is a single coordinated lookup experience.

## Core Product Requirements

### 1. Professional search system

The app must no longer behave like a demo input plus platform toggle.

It needs a marketing-team-grade search flow.

That means:

- the user can search both platforms in one submission
- the system should not assume the Instagram and TikTok handles are always identical
- the form should support a professional dual-handle workflow
- the interaction should feel like a premium analysis console, not a social toy

Important product nuance:
Do not hardcode a naive “same username everywhere” assumption.
Many creators and brands have different handles on Instagram vs TikTok.

Preferred UX direction:

- either a dual-input search bar
- or a primary search row with platform-specific fields
- plus one action that launches both lookups concurrently

What is NOT acceptable:

- keeping the existing platform toggle as the primary search mechanic
- forcing the user to run Instagram first and TikTok second
- shipping two disconnected pages disguised as one product

### 2. Instagram + TikTok must be analyzed at the same time

This is a true concurrency / product-structure requirement.

Required behavior:

- one submission can request both Instagram and TikTok
- both platform fetches should run in parallel where possible
- the UI should render partial success states gracefully
- one platform failing must not destroy the other platform’s result

This means you likely need a new top-level response shape.

You may:

- add a new route such as `POST /api/analyze-all`
- or refactor the current route contract carefully

But the final product must clearly support dual-platform lookup in one run.

### 3. Show follower counts for both platforms

This requirement is mandatory.

The UI must expose follower counts for:

- Instagram
- TikTok

Do not fake or infer follower counts from engagement.
Use truthful provider data only.

You must inspect the current providers and determine the strongest truthful path for profile stats.

Likely implications:

- extend canonical types with a profile summary shape
- extend provider outputs beyond recent media only
- update API responses
- render the new profile stats in the UI

If a provider cannot truthfully provide follower counts, say so in the code comments / source messaging and choose the best available provider path.

### 4. Entire system must adopt the `skills.name` design language

The app should look like a premium discovery / intelligence platform in the visual language of the attached `skills.name` reference.

Do not copy markup blindly.
Extract and apply the design language.

## Required Design Analysis

Treat the `skills.name` screenshot as a style system reference.

Its design language is roughly:

- matte black / near-black background
- subtle dotted or grid-like atmospheric texture
- sharp rectangular cards and segmented controls
- minimal glow, not soft consumer gradients
- mono-forward typography / technical catalog aesthetic
- restrained hierarchy
- selective neon green for active states and positive metrics
- sparse magenta / pink brand accent
- thin charcoal borders
- premium data-discovery layout

You must bring this language into the app.

That means:

- do not keep the current purple/cyan blob-gradient aesthetic
- do not keep the current glossy creator-tool look
- do not use generic SaaS hero gradients
- do not use soft rounded “AI slop” panels

The upgraded interface should feel closer to:

- a high-end research index
- a product intelligence terminal
- a premium internal marketing analysis console

### Design implementation expectations

You should introduce a coherent design system, likely including:

- CSS variables / theme tokens
- revised typography strategy
- revised spacing scale
- revised border, chip, and card system
- intentional states for active / idle / unavailable / partial / live source

If needed, update:

- `app/src/app/globals.css`
- `app/src/app/layout.tsx`
- `app/src/app/page.tsx`

Prefer a consistent, opinionated system over one-off class churn.

## Architecture Direction

You must upgrade the product model from single-platform analysis to a cross-platform workbench.

The current domain model is too narrow.

You likely need new canonical shapes similar to:

```ts
type Platform = "instagram" | "tiktok";

type ProfileSummary = {
  platform: Platform;
  username: string;
  displayName?: string | null;
  followerCount: number | null;
  verified?: boolean | null;
  source: ProviderSource;
  limitations?: string[];
};

type PlatformAnalysis = {
  platform: Platform;
  profile: ProfileSummary;
  organic: BenchmarkBucket;
  commercial: BenchmarkBucket;
  comparison: ComparisonMetrics | null;
  totalContentCount: number;
  warnings?: string[];
  limitations?: string[];
  status: "ok" | "partial" | "unavailable";
};

type MultiPlatformAnalyzeResult = {
  analyzedAt: string;
  query: {
    instagramUsername?: string | null;
    tiktokUsername?: string | null;
  };
  platforms: {
    instagram?: PlatformAnalysis;
    tiktok?: PlatformAnalysis;
  };
};
```

You do not need to use these exact names, but the product needs this level of structure.

## Provider Truthfulness Requirements

Follower counts and content data must be provider-truthful.

You must inspect the current provider layer and decide the strongest truthful approach.

### Instagram

Audit whether the strongest path for follower count is:

- Meta Business Discovery
- Instagram Apify profile data
- both, depending on mode / availability

Do not silently ship misleading stats.

If Instagram follower truth is better from Meta for professional accounts but broader content coverage is better via Apify, design that tradeoff explicitly and transparently.

### TikTok

Audit whether the strongest path for follower count is:

- TikTok Research API
- TikTok Apify actor profile or author data
- another existing truthful path already represented in the repo

Do not invent a stat from video-level items if the provider does not expose it.

## Search / API Behavior

The new product must support:

- both platforms requested together
- only Instagram requested
- only TikTok requested
- partial platform failures
- clear unavailable states
- validation errors for malformed usernames

Do not regress the existing benchmark logic.

Shared benchmark rules must remain:

- benchmark eligibility filtering first
- deterministic commercial classification
- latest eligible items
- exact-5 benchmark rule for valid averages

No fake averages on insufficient sample sizes.

## UX Requirements

The resulting page should feel like a professional marketing analysis workspace.

Recommended content structure:

1. a high-signal professional header
2. a dual-platform search surface
3. platform presence cards with follower counts
4. cross-platform summary strip if both exist
5. per-platform benchmark panels
6. strong empty / unavailable / partial states

Important:
Follower counts must be visible high enough in the hierarchy that they feel like profile intelligence, not buried in footnotes.

Potentially good placement:

- in platform summary cards
- in account headers
- in a dual-platform summary row

### Partial state behavior

If Instagram succeeds and TikTok fails:

- show Instagram normally
- show a truthful TikTok unavailable state
- keep the whole run useful

If follower count is unavailable but media analysis is available:

- show the platform result
- show follower count as unavailable
- explain why if known

## Testing Requirements

Add or update tests to prove:

1. the new request/response contract works
2. dual-platform search can return both platforms in one run
3. one platform can fail without collapsing the other
4. follower counts are carried through canonical types and API responses
5. the UI renders follower counts
6. the UI renders partial/unavailable states correctly
7. existing benchmark logic still works

Minimum likely test files to touch:

- `app/src/__tests__/platform-api.test.ts`
- `app/src/__tests__/page.test.tsx`
- add new tests if needed for multi-platform contract coverage

## Verification Requirements

When implementation is complete, run the relevant verification commands from `app/`:

- `npm run test`
- `npm run test:ui`
- `npm run build`

If something cannot be run, say exactly why.

## Hard Rules

- do not rebuild the app from scratch
- do not keep the existing single-platform toggle as the core search interaction
- do not assume the same handle across Instagram and TikTok
- do not fabricate follower counts
- do not regress exact-5 benchmark validity rules
- do not ship generic gradient SaaS styling and call it `skills.name`
- do not stop at surface CSS changes if the data model is still single-platform
- do not hide provider limitations

## Acceptance Criteria

Your work is only complete if all of the following are true:

1. the product supports a real professional dual-platform search flow
2. Instagram and TikTok can be analyzed in the same run
3. follower counts are shown for both platforms when truthfully available
4. the API/domain/provider model supports profile stats rather than only media lists
5. the UI clearly handles partial and unavailable platform states
6. the visual system is materially transformed into the `skills.name` language
7. existing benchmark logic remains deterministic and trustworthy
8. tests and build verification are completed or explicitly explained

## Final Report Format

When finished, report exactly:

1. what the old architecture could not do
2. what API/domain/provider changes you made
3. how simultaneous Instagram + TikTok search now works
4. how follower counts are sourced for each platform
5. what `skills.name` design-system changes you introduced
6. what partial/unavailable state protections you added
7. which tests and build commands passed

Start by auditing the current single-platform flow in:

- `app/src/app/page.tsx`
- `app/src/app/api/analyze/route.ts`
- `app/src/lib/domain/types.ts`
- `app/src/lib/providers/interface.ts`

Then patch the product into a truthful dual-platform marketing workbench.
