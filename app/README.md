# IG Reels Benchmark

Analyze average Instagram Reel views for any public professional account. Enter a username, get the latest 5 eligible Reels and their average view count — excluding sponsored collaborations.

## What It Does

1. Takes an Instagram username as input
2. Fetches recent media via the **Meta Instagram Graph API** (Business Discovery)
3. Keeps only Reels (`media_product_type === "REELS"`)
4. Excludes Reels with `#işbirliği` or `#isbirligi` in the caption (sponsored content)
5. Selects the latest 5 eligible Reels
6. Calculates and displays the average view count

## Supported Account Types

| Type | Supported |
|------|-----------|
| Public Business accounts | ✅ |
| Public Creator accounts | ✅ |
| Private accounts | ❌ |
| Personal accounts | ❌ |

If the target account is private, personal, or otherwise inaccessible via Business Discovery, the app returns a clear error.

## Required Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
META_ACCESS_TOKEN=your_meta_access_token
META_IG_USER_ID=your_instagram_user_id
META_GRAPH_API_VERSION=v23.0
RESULT_CACHE_TTL_SECONDS=21600
```

### How to Get These

1. **META_ACCESS_TOKEN**: A Page Access Token or System User Token from a Facebook App with the `instagram_basic` and `instagram_manage_insights` permissions granted via Facebook Login for Business.
2. **META_IG_USER_ID**: The Instagram Professional Account ID linked to your Facebook Page. Find it via the Graph API Explorer: `GET /me/accounts` → get the page ID → `GET /{page-id}?fields=instagram_business_account`.

## Local Development

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Open http://localhost:3000
```

## Production Considerations

For production use, the Meta access requires:

- An approved Facebook App with Business Login
- Completed App Review for `instagram_basic` and `instagram_manage_insights` permissions
- Business Verification if accessing other businesses' data
- A long-lived or system user access token (not the short-lived Graph API Explorer token)

## Architecture

```
src/
├── app/
│   ├── api/analyze/route.ts    # POST /api/analyze endpoint
│   ├── globals.css             # Tailwind + custom animations
│   ├── layout.tsx              # Root layout with SEO metadata
│   └── page.tsx                # Main UI (client component)
└── lib/
    ├── cache.ts                # In-memory TTL cache
    ├── domain/
    │   ├── types.ts            # Canonical types (ReelItem, AnalyzeResult)
    │   ├── normalize.ts        # Username/caption normalization
    │   └── selection.ts        # Reel filtering + average calculation
    └── providers/
        ├── interface.ts        # Provider interface + ProviderError
        ├── meta-provider.ts    # Real Meta Graph API client
        ├── mock-provider.ts    # Mock fixture data for local dev
        └── factory.ts          # Provider selection based on env
```

## Real Integration vs Mock Fallback

- **Real integration**: `MetaBusinessDiscoveryProvider` in `meta-provider.ts` implements the full Business Discovery API call with pagination, error handling, and field mapping. It is used when `META_ACCESS_TOKEN` and `META_IG_USER_ID` are set.
- **Mock fallback**: `MockProvider` in `mock-provider.ts` returns fixture data for local development when credentials are unavailable. It is clearly labeled in the UI with a "MOCK DATA" badge and `source: "mock"` in the API response.

## Testing

```bash
npm test
```

Tests cover: username normalization, caption normalization, sponsor detection, Reel selection, average calculation, Meta field mapping, API validation, and UI rendering.
