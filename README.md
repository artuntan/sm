# Creator Benchmark

Cross-platform influencer analytics workbench. Batch-analyze Instagram and TikTok creators — benchmark organic vs commercial performance, track data freshness, manage campaigns, and monitor content coverage.

## Features

### Workspace
Batch creator analysis — paste Instagram and TikTok handles (CSV/TSV/Sheets format), run parallel analysis across platforms, and get unified benchmark reports with organic vs commercial performance splits.

### Warehouse
Influencer data warehouse with identity linking. Scans are cached with adaptive TTL, creators are unified across platforms (Instagram + TikTok = one identity), and data freshness is tracked with FRESH / STALE / EXPIRED status indicators.

### Campaigns
Campaign management with creator assignment, deliverable tracking, milestone planning, and budget/CPM analysis. Link batch scan results directly to campaigns.

### Coverage (Dimes)
Content coverage analysis — scan brand mentions, classify content (organic vs commercial), cluster by media format, and run gap analysis to identify coverage opportunities.

### History
Full batch run history with result replay, comparison tools, tagging, archiving, and CSV/JSON export.

### Admin
System administration — user approval workflow, team directory, role management, and operational insights.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Auth | [Better Auth](https://www.better-auth.com) |
| Database | PostgreSQL on AWS RDS |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Styling | Tailwind CSS v4 + custom design system |
| Language | TypeScript (strict) |

## Architecture

```
app/src/
├── app/
│   ├── (dashboard)/          # Authenticated pages
│   │   ├── page.tsx          # Workspace — batch creator analysis
│   │   ├── warehouse/        # Influencer data warehouse
│   │   ├── campaigns/        # Campaign management
│   │   ├── coverage/         # Content coverage analysis
│   │   ├── history/          # Batch run history
│   │   ├── admin/            # System admin panel
│   │   └── settings/         # User settings
│   ├── api/
│   │   ├── analyze-single/   # Single platform analysis
│   │   ├── analyze-all/      # Multi-platform batch
│   │   ├── campaigns/        # Campaign CRUD + deliverables
│   │   ├── dimes/            # Coverage scan/report/brands
│   │   ├── warehouse/        # Warehouse data + identity linking
│   │   ├── history/          # Run persistence + export
│   │   ├── auth/             # Auth endpoints (me, profile)
│   │   ├── teams/            # Team management
│   │   ├── admin/            # Admin operations
│   │   └── token-health/     # API token monitoring
│   └── components/
│       └── ui/               # AppShell, Modal, Drawer, etc.
├── lib/
│   ├── auth/                 # Better Auth config + guards
│   ├── db/                   # Drizzle schema + migrations
│   ├── domain/               # Core business logic
│   │   ├── types.ts          # Canonical domain types
│   │   ├── batch-*.ts        # Batch processing engine
│   │   ├── budget-cpm.ts     # Budget & CPM calculations
│   │   ├── selection.ts      # Content selection & filtering
│   │   └── normalize.ts      # Username/caption normalization
│   ├── providers/            # Platform data providers
│   │   ├── meta-provider.ts          # Instagram (Meta Graph API)
│   │   ├── instagram-apify-provider  # Instagram (Apify fallback)
│   │   ├── tiktok-research-provider  # TikTok (Research API)
│   │   ├── tiktok-apify-provider     # TikTok (Apify Live)
│   │   └── factory.ts               # Provider selection
│   ├── dimes/                # Coverage engine
│   │   ├── scanner.ts        # Content scanner
│   │   ├── classifier.ts     # Commercial/organic classifier
│   │   ├── clustering.ts     # Media format clustering
│   │   └── gap-analysis.ts   # Coverage gap analysis
│   ├── services/             # Application services
│   │   ├── scan-cache-service.ts     # Scan result caching
│   │   ├── adaptive-scan-service.ts  # Smart scan frequency
│   │   └── media-warehouse-service.ts # Warehouse operations
│   └── cache.ts              # In-memory TTL cache
```

## Data Providers

| Platform | Provider | Source | Fallback |
|----------|----------|--------|----------|
| Instagram | Meta Graph API | Business Discovery | Apify scraper |
| TikTok | Research API | Official API | Apify Live scraper |

The system automatically selects providers based on available credentials and falls back gracefully when primary sources are unavailable.

## Design System

Dark-first editorial aesthetic with light mode support:
- **Palette**: Cold-black surfaces, emerald accents, mono-forward typography
- **Typography**: Inter (sans) + JetBrains Mono (mono)
- **Responsive**: Horizontal scroll nav, card layouts on mobile, adaptive density
- **Theme**: Dark / Light / System (OS preference)

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/smdb

# Auth
BETTER_AUTH_SECRET=your_secret
BETTER_AUTH_URL=http://localhost:3000

# Instagram — Meta Graph API
META_ACCESS_TOKEN=your_meta_page_access_token
META_IG_USER_ID=your_instagram_business_account_id
META_GRAPH_API_VERSION=v23.0

# PostgreSQL TLS
# Recommended format: store the PEM as a single-line string with \n escapes.
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"

# Shared Apify token
APIFY_API_TOKEN=your_apify_token

# Optional
YOUTUBE_API_KEY=your_youtube_api_key
```

## Getting Started

```bash
# Navigate to app directory
cd app

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Fill in your API credentials

# Run development server
npm run dev

# Open http://localhost:3000
```

## Testing

```bash
cd app

# Run all tests
npm test

# Run with coverage
npm test -- --coverage
```

## Current Production Runtime

Today the production runtime is a single ARM EC2 instance behind CloudFront with a shared PostgreSQL instance on RDS. Deployment is still script-driven and uses SSM Parameter Store for secrets. See [docs/operations/current-runtime-baseline.md](docs/operations/current-runtime-baseline.md) for the exact current contract, known limitations, and the staged rebuild plan.

## Auth & Multi-Tenancy

- **User Registration** → Admin approval required
- **Team System** → Users join teams, team admins manage access
- **System Admin** → Full system control, bypasses team gating
- **Role Hierarchy**: `system_admin` → `team_admin` → `user`

## Known Limitations

- Production is currently single-instance and not horizontally scaled.
- Heavy work is still being migrated out of the HTTP request lifecycle.
- The architecture is in the middle of a staged rebuild toward durable jobs, stronger tenant isolation, and explicit billing controls.

## License

Private — All rights reserved.
