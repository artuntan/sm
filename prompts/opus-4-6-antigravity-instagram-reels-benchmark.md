# Antigravity / Claude Opus 4.6 Prompt

You are Claude Opus 4.6 inside Antigravity. Build a production-lean MVP for an agency-focused Instagram analysis tool.

Build the system directly. Do not brainstorm endlessly. Do not expand scope. Deliver a working app.

## Product Goal

The user enters an Instagram username.

The system:

1. analyzes that account's recent Instagram content using the official Meta API
2. keeps only Reels
3. excludes Reels whose caption contains `#işbirliği` or `#isbirligi`
4. selects the latest 5 eligible Reels
5. calculates their average views
6. shows the result and the included Reels in the UI

## Critical Scope Decision

This MVP supports only:

- public professional Instagram accounts
- business accounts
- creator accounts

This MVP does **not** support:

- private accounts
- personal accounts
- accounts whose professional public data cannot be resolved by Meta

If the target account is unsupported, return a clear product error. Do not silently fall back to scraping in this iteration.

## Required Data Source

Use the official Meta Instagram Graph API first.

Use:

- Business Discovery
- server-side Meta access token
- server-side configured professional Instagram user id

Choose the Meta integration path that reliably provides the fields needed for this feature.

Important:

- you need access to `caption`
- you need access to `media_product_type`
- you need access to `view_count`

If one login path does not provide those fields, do **not** choose it. Prefer the Meta path that supports those required fields for Business Discovery based access. In practice, bias toward the Facebook Login for Business / Instagram Graph API route for this MVP.

## Exact Technical Goal

Build a Next.js App Router app with:

- TypeScript
- Tailwind CSS
- Zod
- server-side Meta client
- provider abstraction
- Meta provider as the primary real provider
- clearly labeled mock fallback only for local development when live credentials are unavailable

No auth. No billing. No dashboard history. No export. No team features.

## Required Architecture

Use this structure:

- UI page for input and results
- `POST /api/analyze`
- domain layer for normalization and selection rules
- provider interface for Instagram data access
- `MetaBusinessDiscoveryProvider`
- lightweight cache

Keep domain logic independent from provider-specific response shapes.

## Canonical Types

Use a result shape equivalent to this:

```ts
type ReelItem = {
  id: string;
  username: string;
  caption: string | null;
  timestamp: string;
  views: number | null;
  permalink: string;
  thumbnailUrl?: string | null;
  provider: "meta" | "mock";
  rawMediaType?: string | null;
  rawProductType?: string | null;
};

type AnalyzeResult = {
  username: string;
  averageViews: number | null;
  sampleSize: number;
  analyzedAt: string;
  source: "meta" | "mock";
  eligibleReels: ReelItem[];
  excludedSponsoredCount: number;
  excludedNonReelCount: number;
  cacheHit: boolean;
  warnings: string[];
};
```

## Username Rules

- trim whitespace
- remove leading `@`
- lowercase

## Sponsor Filter Rules

Implement deterministic normalization:

- lowercase
- Unicode normalize
- strip diacritics
- fold Turkish characters

After normalization, both:

- `#işbirliği`
- `#isbirligi`

must be matchable as:

- `#isbirligi`

If normalized caption contains `#isbirligi`, exclude the Reel.

## Reel Selection Rules

1. fetch recent media for the target public professional account
2. identify Reels using `media_product_type === "REELS"` as the primary rule
3. sort newest first
4. exclude sponsored items
5. take the latest 5 eligible Reels
6. if fewer than 5 exist, use available items and return the real `sampleSize`

## View Rules

Use Meta `view_count` as the primary source of views.

Map raw Meta fields into canonical fields:

- `view_count -> views`
- `thumbnail_url -> thumbnailUrl`
- `media_type -> rawMediaType`
- `media_product_type -> rawProductType`

If a selected Reel has no numeric view count:

- keep `views: null`
- include a warning
- compute the average only from numeric view values
- if no numeric values exist, return `averageViews: null`

## Meta Request Requirements

Implement the real Meta client. Use a Business Discovery request shape equivalent to:

```text
/{META_IG_USER_ID}?fields=business_discovery.username({targetUsername}){username,media.limit(25){id,caption,timestamp,permalink,thumbnail_url,media_type,media_product_type,view_count}}
```

Behavior requirements:

- start with at least 25 recent media items
- if fewer than 5 eligible Reels are found and pagination is available, continue until enough items are found or a safe cap such as 50 total media items is reached
- keep secrets server-side only

## Error Handling Requirements

Handle these cases explicitly:

- invalid username
- account not found
- private account
- unsupported account type
- professional public data unavailable
- invalid Meta credentials
- Meta upstream timeout or rate limit
- malformed Meta response
- zero eligible Reels

The UI message should be user-friendly but technically accurate.

## UI Requirements

Build a single clean page with:

- title
- short explanation
- explicit note that only public professional accounts are supported
- username input
- analyze button
- loading state
- error state
- success state

In success state show:

- username
- average views
- sample size
- analyzed time
- source
- included Reels list
- each Reel's date
- views
- caption preview
- permalink

## Caching Requirements

Add lightweight caching for repeated username lookups.

Use a TTL-based cache.

Suggested default:

- `RESULT_CACHE_TTL_SECONDS=21600`

## Environment Variables

Create `.env.example` with:

```env
META_ACCESS_TOKEN=
META_IG_USER_ID=
META_GRAPH_API_VERSION=v23.0
RESULT_CACHE_TTL_SECONDS=21600
```

## README Requirements

`README.md` must explain:

- what the product does
- supported account types
- unsupported account types
- required env vars
- local run commands
- live Meta prerequisites
- that real production use may require advanced access, app review, and business verification
- what is real integration versus mock fallback

## Mock Fallback Rule

If live Meta credentials are unavailable:

- still implement the real Meta provider interface and real request code
- add a clearly labeled mock provider or fixture path for local development
- do not pretend live fetching was verified if it was not

## Testing Requirements

Write tests for:

- username normalization
- caption normalization
- sponsored hashtag detection
- Reels selection logic
- average calculation
- Meta raw-to-canonical mapping
- API validation and response behavior
- main UI happy path

## Delivery Requirements

When done, provide:

1. the file tree
2. a short architecture summary
3. required environment variables
4. exact commands to run locally
5. known limitations
6. a clear statement of what is live Meta integration vs mock fallback

## Important Constraints

- do not add scraping fallback in this iteration
- do not add auth
- do not add extra product features
- do not use client-side secrets
- do not produce pseudo-code
- build the actual project files
- favor clean modular code over cleverness

Start by briefly stating the implementation plan, then build the full system.
