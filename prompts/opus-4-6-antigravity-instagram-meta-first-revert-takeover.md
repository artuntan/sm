You are Claude Opus 4.6 inside Antigravity, working on an existing cross-platform creator benchmark app.

This is an Instagram provider revert takeover.
Do not debate the direction.
The product decision has been made:

Instagram must be moved back to Meta Graph API as the primary live provider.

Reason:
The current Apify-first Instagram path is not reliably capturing the correct set of recent Instagram videos/Reels, and the resulting benchmark is not trustworthy enough.

The user explicitly wants Instagram reverted to Meta Graph API.

Your job is to implement that cleanly, truthfully, and without regressing the rest of the product.

## Product decision

Instagram provider policy must become:

1. Meta Graph API first
2. Apify only as explicit fallback / secondary path if still retained
3. UI and API messaging must reflect this truthfully

Do not keep Instagram on Apify-first `auto` mode.
Do not leave the current priority order in place.

## Current code reality you must inspect first

Read these files before patching:

- `app/src/lib/providers/factory.ts`
- `app/src/lib/providers/meta-provider.ts`
- `app/src/lib/providers/instagram-apify-provider.ts`
- `app/src/app/api/analyze/route.ts`
- `app/src/app/api/analyze-all/route.ts`
- `app/src/app/page.tsx`
- `app/src/lib/domain/types.ts`
- `app/src/__tests__/platform-api.test.ts`
- `app/src/__tests__/api.test.ts`
- `app/src/__tests__/page.test.tsx`

You must start from the code, not assumptions.

## Root problem to fix

Right now, the Instagram provider selection still effectively prefers Apify in `factory.ts` whenever `APIFY_API_TOKEN` exists.

That means:

- Instagram can still show `Apify Live`
- Instagram can still depend on Apify item coverage
- Instagram can still miss or mis-order recent Reels

This must stop.

## Required implementation direction

### 1. Make Meta the default Instagram live path

Patch provider selection so that Instagram resolves like this:

- if Meta credentials exist, use `MetaBusinessDiscoveryProvider`
- only if Meta is unavailable, decide whether Apify should be used as a labeled fallback or whether mock should be used

Expected direction:

- `INSTAGRAM_PROVIDER_MODE` should no longer default to Apify-first behavior
- default / auto behavior should resolve to Meta-first

You may preserve an explicit override mode if useful, for example:

- `meta`
- `apify`
- `auto`

But `auto` must no longer mean “prefer Apify”.
It must mean “prefer Meta”.

### 2. Keep source truthfulness explicit

If Instagram is now Meta-driven:

- UI source badges must say `Meta API` or equivalent
- limitation banners must stop implying Instagram is live via Apify by default
- no text should imply Apify is the canonical Instagram source unless it actually is

### 3. Preserve cross-platform product behavior

Do not break:

- `/api/analyze`
- `/api/analyze-all`
- follower/profile surfaces
- TikTok behavior
- current benchmark UI structure

This is an Instagram provider routing and truthfulness correction, not a product rebuild.

### 4. Meta limitations must be handled honestly

Meta Graph API only works for public professional/business/creator accounts available through the configured Business Discovery setup.

You must reflect this cleanly:

- in limitation text
- in error handling
- in source messaging

Do not hide this scope limitation.

But do not let that limitation justify leaving Instagram on Apify-first.

## Fallback policy

You must choose one of these and implement it clearly:

### Preferred policy

Meta-first, Apify-second fallback:

- if Meta credentials are available, use Meta
- if Meta credentials are missing or unusable, optionally use Apify fallback
- if Apify fallback is used, label it explicitly as fallback

### Acceptable alternative

Meta-first, no silent live fallback:

- if Meta credentials are available, use Meta
- if Meta is unavailable, fail truthfully or fall back to mock/dev behavior

What is NOT acceptable:

- silent Instagram Apify-first in `auto`
- UI that still presents Instagram as `Apify Live` by default

## API / UI expectations

Patch all relevant messaging surfaces.

That includes at minimum:

- source label mapping in the page UI
- limitation banner logic in `/api/analyze`
- limitation banner logic in `/api/analyze-all`
- any tests that still assume Instagram defaults to Apify

If the UI still says “Apify Live” for Instagram after this change, you have not finished.

## Testing requirements

Add or update tests to prove:

1. Instagram provider selection is Meta-first in default/auto mode
2. explicit `INSTAGRAM_PROVIDER_MODE=meta` still works
3. explicit `INSTAGRAM_PROVIDER_MODE=apify` still works if retained
4. analyze/analyze-all responses surface the correct source label
5. UI reflects the new source correctly

Likely files to update:

- `app/src/__tests__/platform-api.test.ts`
- `app/src/__tests__/api.test.ts`
- `app/src/__tests__/page.test.tsx`
- add provider factory tests if they do not yet exist

## Verification requirements

When implementation is complete, run the relevant checks from `app/`:

- `npm run test`
- `npm run test:ui`
- `npm run build`

If a verification step cannot run, say exactly why.

## Hard rules

- do not keep Instagram Apify-first in `auto`
- do not leave Instagram source copy saying `Apify Live` by default
- do not hide Meta scope limitations
- do not regress TikTok behavior
- do not rebuild unrelated parts of the app

## Acceptance criteria

You are only done if:

1. Instagram default live provider is Meta Graph API
2. current factory logic no longer prefers Apify for Instagram in default mode
3. API source fields reflect the actual provider
4. UI source badge and limitation copy reflect Meta-first reality
5. fallback behavior is explicit and truthful
6. tests and build verification pass or are explicitly explained

## Final report format

When finished, report exactly:

1. what the old Instagram provider priority was
2. what you changed in `factory.ts`
3. whether Apify still exists and in what role
4. what API/UI source messaging changed
5. what tests were updated
6. which verification commands passed

Start by patching `app/src/lib/providers/factory.ts` so Instagram is no longer Apify-first.
