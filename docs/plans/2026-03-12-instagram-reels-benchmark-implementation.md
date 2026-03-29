# Instagram Reels Benchmark Implementation Plan

> **For Claude:** implement this as a production-lean MVP, not a prototype. Prefer the real Meta integration first, and add a clearly labeled mock path only if live credentials are unavailable.

**Goal:** Build a web app where a user enters an Instagram username and receives the average views of the latest 5 non-sponsored Reels for that public professional account.

**Architecture:** Next.js App Router application with server-side Meta Business Discovery integration, a canonical Reel domain model, deterministic filtering rules, lightweight caching, and one-page UI.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Zod, Vitest or Jest, React Testing Library

---

## Task 1: Bootstrap The App Shell

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `.env.example`
- Create: `README.md`

**Environment variables:**

```env
META_ACCESS_TOKEN=
META_IG_USER_ID=
META_GRAPH_API_VERSION=v23.0
RESULT_CACHE_TTL_SECONDS=21600
```

**Requirements:**

- minimal Next.js App Router scaffold
- clean landing page shell
- short product description
- username input and analyze CTA placeholder

**Verification:**

```bash
npm install
npm run build
```

Expected:

- install succeeds
- build succeeds

## Task 2: Implement Domain Logic With Tests First

**Files:**
- Create: `src/lib/instagram/types.ts`
- Create: `src/lib/instagram/normalize.ts`
- Create: `src/lib/instagram/analyze.ts`
- Create: `tests/instagram/normalize.test.ts`
- Create: `tests/instagram/analyze.test.ts`

**Write failing tests for:**

- username normalization
- caption normalization
- Turkish hashtag folding
- sponsor hashtag detection
- non-Reels exclusion
- sponsored Reels exclusion
- newest 5 eligible Reels selection
- average calculation
- fewer than 5 eligible Reels behavior

**Implement:**

- `normalizeUsername`
- `normalizeCaptionForSponsorCheck`
- `containsSponsoredHashtag`
- `isReelItem`
- `selectLatestEligibleReels`
- `computeAverageViews`
- `analyzeReels`

**Verification:**

```bash
npm test -- tests/instagram/normalize.test.ts tests/instagram/analyze.test.ts
```

Expected:

- all tests pass

## Task 3: Add Provider Contract And Meta Provider

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/instagram/provider.ts`
- Create: `src/lib/instagram/providers/meta-business-discovery.ts`
- Create: `src/lib/instagram/providers/mock.ts`
- Create: `tests/instagram/meta-provider.test.ts`

**Provider contract:**

```ts
export interface InstagramDataProvider {
  getRecentMediaByUsername(
    username: string,
    options?: { limit?: number; maxPages?: number }
  ): Promise<ReelItem[]>;
}
```

**Meta provider requirements:**

- server-side only
- uses Business Discovery
- uses app-configured professional Instagram user id and access token
- maps raw Meta response into canonical `ReelItem[]`
- normalizes:
  - `view_count -> views`
  - `thumbnail_url -> thumbnailUrl`
  - `media_product_type -> rawProductType`
  - `media_type -> rawMediaType`
- fetches enough recent media to find 5 eligible Reels
- starts with at least 25 recent items
- if cursors are available and needed, continues until enough eligible Reels or a safe cap such as 50 items

**Use a request shape equivalent to:**

```text
/{META_IG_USER_ID}?fields=business_discovery.username({username}){username,media.limit(25){id,caption,timestamp,permalink,thumbnail_url,media_type,media_product_type,view_count}}
```

**Handle errors explicitly:**

- missing env vars
- invalid access token
- target account not found
- private account
- unsupported account type
- malformed Meta response
- rate limit / timeout

**Mock provider requirements:**

- only for local fallback
- clearly labeled in code and README
- must not pretend live integration is verified

**Verification:**

```bash
npm test -- tests/instagram/meta-provider.test.ts
```

Expected:

- provider mapping and error-path tests pass

## Task 4: Build The Analyze API Route

**Files:**
- Create: `app/api/analyze/route.ts`
- Create: `src/lib/cache/result-cache.ts`
- Create: `tests/api/analyze-route.test.ts`

**Route requirements:**

- method: `POST`
- validate with Zod
- normalize username
- check cache
- call provider
- run domain analysis
- return `AnalyzeResult`

**Request schema:**

```ts
const AnalyzeSchema = z.object({
  username: z.string().min(1).max(64),
});
```

**Response behavior:**

- `400` for invalid input
- `404` for missing target
- `422` for unsupported/private/non-professional target
- `502` for upstream Meta failures
- `200` for successful analysis, even when `sampleSize < 5`

**Verification:**

```bash
npm test -- tests/api/analyze-route.test.ts
```

Expected:

- all route tests pass

## Task 5: Build The UI

**Files:**
- Update: `app/page.tsx`
- Create: `src/components/username-form.tsx`
- Create: `src/components/analysis-result.tsx`
- Create: `tests/ui/page.test.tsx`

**UI requirements:**

- single clean page
- input + button
- loading state
- error state
- success state

**Success state must show:**

- username
- average views
- sample size
- analyzed time
- source
- list of included Reels
- caption preview
- date
- permalink

**UX requirements:**

- clear empty state
- disabled button during request
- user-facing unsupported-account messaging
- explicit note that only public professional accounts are supported

**Verification:**

```bash
npm test -- tests/ui/page.test.tsx
```

Expected:

- UI tests pass

## Task 6: Finalize Operational Details

**Requirements:**

- `.env.example` complete
- `README.md` includes:
  - what the app does
  - public professional account limitation
  - Meta prerequisites
  - required env vars
  - local run steps
  - live vs mock explanation
- lightweight in-memory cache or file-backed cache acceptable for MVP

**README must mention these Meta prerequisites:**

- public professional target account requirement
- app review / advanced access / business verification may be required for real production use
- local mock mode is not equal to verified live Meta behavior

## Task 7: Verify End-To-End

Run:

```bash
npm run build
npm test
```

If live credentials are available, also verify one real request locally.

If live credentials are not available:

- verify mock path end-to-end
- leave the real Meta provider implemented and wired
- clearly mark live integration as unverified

## Delivery Requirements

When finished, provide:

1. file tree
2. short architecture summary
3. env vars
4. exact run commands
5. known limitations
6. explicit distinction between live Meta integration and mock fallback

## Non-Goals

Do not add:

- user auth
- billing
- history dashboard
- multi-user agency features
- CSV export
- scraping fallback in this iteration
