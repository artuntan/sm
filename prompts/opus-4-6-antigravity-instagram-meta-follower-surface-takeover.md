You are Claude Opus 4.6 inside Antigravity, working on an existing creator benchmark application.

This is an Instagram Meta profile-surface takeover.
Do not treat this as a cosmetic tweak.

The user reports a real product bug:

- Instagram is now sourced from Meta API
- the Instagram profile card renders
- but follower count is showing as blank / em dash

The user explicitly wants Instagram follower count to be visible.

Your job is to trace this from provider to API to UI and fix it properly.

## Product requirement

When Instagram analysis is powered by Meta Graph API, the profile card must surface follower count whenever Meta returns it.

This is not optional.

If Meta does not return a field, degrade truthfully.
But do not leave the current implementation where follower count is effectively never populated because the provider does not request or map profile stats.

## Current code reality you must inspect first

Read these files before patching:

- `app/src/lib/providers/meta-provider.ts`
- `app/src/lib/domain/types.ts`
- `app/src/app/api/analyze/route.ts`
- `app/src/app/api/analyze-all/route.ts`
- `app/src/app/page.tsx`
- `app/src/__tests__/api.test.ts`
- `app/src/__tests__/platform-api.test.ts`
- `app/src/__tests__/page.test.tsx`

Start from the code, not assumptions.

## Root problem to fix

The Meta provider currently requests media but does not properly surface profile summary stats.

The likely failure chain is:

1. the Business Discovery query only asks for media-centric fields
2. `meta-provider.ts` returns no `profile` object
3. `/api/analyze-all` passes through `providerResult.profile || null`
4. the page renders `profile.followerCount`, which becomes `null`
5. UI shows `—`

This is a provider-level data omission, not a formatting issue.

## Required implementation direction

### 1. Fix Meta profile field retrieval

Update the Meta Business Discovery query so the provider requests profile summary fields needed by the UI.

At minimum, follower count must be retrieved if Meta exposes it for the discovered account.

Also retrieve and map other truthful profile fields if available and appropriate for the current UI contract, such as:

- username
- display name
- following count
- profile picture URL
- verified state

Do not invent unsupported fields.
Do not fabricate values.
Only map what Meta actually returns.

### 2. Return `ProviderResult.profile` from Meta provider

`MetaBusinessDiscoveryProvider.fetchRecentMedia()` must return a populated `profile` object when Meta provides the data.

It must match the existing `ProfileSummary` contract in `app/src/lib/domain/types.ts`.

Important:

- follower count must map to `followerCount`
- following count must map to `followingCount`
- keep numeric nullability correct
- do not accidentally drop `0` because of falsey checks

### 3. Preserve API passthrough

Verify that:

- `/api/analyze` returns the profile payload correctly
- `/api/analyze-all` returns the profile payload correctly

If any endpoint currently strips or fails to surface Meta profile data, patch it.

### 4. Preserve UI rendering truthfully

The UI in `app/src/app/page.tsx` already formats counts.

Do not hack around the issue by hardcoding UI text.
The UI should work because the underlying data is now present.

If minor rendering logic is needed, keep it minimal and truthful.

### 5. Keep provider source and Meta-first behavior intact

Do not regress the recent Meta-first Instagram provider revert.

Instagram should still be:

- Meta-first by default
- truthfully labeled as `Meta API`

This task is about restoring missing profile stats on the Meta path.

## Testing requirements

Add or update tests to prove:

1. Meta provider maps follower count into `ProviderResult.profile`
2. Meta provider maps following count correctly if returned
3. analyze/analyze-all responses include Instagram profile follower count
4. the page renders the formatted follower count when API response includes it

Prefer focused tests over vague snapshots.

Likely files to update:

- `app/src/__tests__/api.test.ts`
- `app/src/__tests__/platform-api.test.ts`
- `app/src/__tests__/page.test.tsx`

If provider-level tests do not exist yet, add them.

## Verification requirements

When implementation is complete, run the relevant checks from `app/`:

- `npm run test`
- `npm run test:ui`
- `npm run build`

If any command cannot run, say exactly why.

## Hard rules

- do not ship a UI-only workaround
- do not leave Meta provider without `profile` mapping
- do not regress Instagram media fetching
- do not regress TikTok behavior
- do not fabricate follower counts

## Acceptance criteria

You are only done if:

1. Instagram Meta provider returns `profile.followerCount` when Meta exposes it
2. API responses carry that value through
3. the Instagram card no longer shows blank follower count for valid Meta responses
4. tests cover provider + API/UI path
5. verification commands pass or are explicitly explained

## Final report format

When finished, report exactly:

1. which Meta profile fields were missing before
2. what you changed in `meta-provider.ts`
3. whether API routes needed patching
4. what UI behavior changed
5. what tests were updated
6. which verification commands passed

Start by patching `app/src/lib/providers/meta-provider.ts` so Meta follower data is actually requested and mapped.
