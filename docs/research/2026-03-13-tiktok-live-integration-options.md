# TikTok Live Integration Options

## Current Root Cause

Current app behavior is not blocked by missing UI work.

The real blocker is provider activation:

- `app/src/lib/providers/factory.ts` selects `TikTokMockProvider` whenever:
  - `TIKTOK_RESEARCH_CLIENT_KEY` is missing, or
  - `TIKTOK_RESEARCH_CLIENT_SECRET` is missing
- `app/src/lib/providers/tiktok-research-provider.ts` is implemented but only usable when TikTok Research API credentials exist
- screenshot evidence shows the UI still renders:
  - `Source: TikTok Mock (dev)`
  - `MOCK DATA`

So the issue is:

- either credentials do not exist
- or official TikTok Research access is not realistically available for this product setup
- or the current official-only strategy is too narrow for the product goal

## Official TikTok Paths

### 1. Display API

Display API is not the right foundation for arbitrary public influencer benchmark use cases.

It is more appropriate for self-authorized display scenarios.

Source:

- https://developers.tiktok.com/doc/display-api-overview

### 2. Research API

Research API is the most relevant official path for public data query.

Relevant official facts:

- `research.data.basic` scope is required for video and user query endpoints
- `client_credentials` token flow is valid for Research API
- `query videos` supports `username`, `view_count`, `video_description`, `hashtag_names`, `video_mention_list`, `video_tag`
- `query user info` supports username-based lookup

Sources:

- https://developers.tiktok.com/doc/client-access-token-management
- https://developers.tiktok.com/doc/research-api-get-started/
- https://developers.tiktok.com/doc/research-api-specs-query-videos/
- https://developers.tiktok.com/doc/research-api-specs-query-user-info/

### 3. Commercial Content API

Commercial Content API exists and also uses client access tokens.

This is relevant because it may offer better official commercial/ad signals than plain public video query.

Source:

- https://developers.tiktok.com/doc/commercial-content-api-getting-started/
- https://developers.tiktok.com/doc/commercial-content-api-query-commercial-content/

## Practical Product Conclusion

For a general agency benchmark product, official TikTok access may still be too restricted or operationally narrow even though technically relevant endpoints exist.

So the strongest truthful engineering direction is:

1. try to activate official TikTok Research / Commercial Content APIs if access is actually available
2. if that path is blocked for real product use, integrate a production-grade fallback provider
3. keep the provider abstraction honest and explicit

## Production-Grade Fallback Providers Worth Evaluating

### Apify

Apify exposes production-ready TikTok scraping products with profile, posts, and engagement data.

Relevant docs / product pages:

- https://apify.com/clockworks/tiktok-scraper/api
- https://apify.com/apidojo/tiktok-scraper-api

Useful because:

- public profile/video scraping is already productized
- views / captions / engagement data are exposed
- no need to build a raw scraper from scratch

### Bright Data

Bright Data also exposes TikTok scraping APIs for profile and post data.

Relevant docs:

- https://docs.brightdata.com/api-reference/web-scraper-api/social-media-apis/tiktok

Useful because:

- public TikTok profile and posts surfaces are already normalized
- can be used as a managed fallback instead of maintaining brittle custom scraping

## Recommended Decision Rule

The app should not stay in mock mode waiting for perfect official access.

Best decision rule:

- if official TikTok credentials are actually available and working, use official provider
- otherwise integrate one managed fallback provider and verify live public username fetch end-to-end

## What Opus Should Be Forced To Do

1. inspect the current TikTok provider code
2. prove why mock mode is being selected
3. research official TikTok capability and access reality
4. if official access is blocked, evaluate managed fallback providers
5. choose the strongest live path
6. wire env vars and provider selection
7. run a real live request
8. remove the current default behavior where TikTok remains mock-only in practice
