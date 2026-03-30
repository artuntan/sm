# Creator Benchmark — App

Next.js application directory. See the [root README](../README.md) for full project documentation.

## Quick Start

**Prerequisites:** Docker Desktop running.

```bash
# From the project root (one command does everything):
./setup.sh
```

This starts Postgres, installs deps, pushes the schema, and seeds data. Then:

```bash
cd app && npm run dev    # http://localhost:3000
```

## Manual Setup

If you prefer to do it step by step:

```bash
# 1. Start Postgres
docker compose up postgres -d

# 2. Install dependencies
cd app && npm install

# 3. Copy env file
cp .env.example .env.local

# 4. Push schema to database
npx drizzle-kit push

# 5. Seed data
npx tsx src/lib/db/seed.ts

# 6. Start dev server
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm test` | Run test suite |
| `npm run lint` | ESLint check |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
| `npm run db:seed` | Seed teams + admin |

## Environment Variables

See `.env.example` for all required and optional variables. The only required ones for local dev are:

- `DATABASE_URL` — Postgres connection string (default: the docker-compose Postgres)
- `BETTER_AUTH_SECRET` — Any random string for session signing
