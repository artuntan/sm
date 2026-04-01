# Database Migration Workflow

This document is the operational source of truth for schema changes in SM.

## Principles

- Production and shared environments must use committed migrations only.
- Direct schema pushes are not part of the supported workflow.
- Generated SQL must be reviewed before merge.
- A migration must land in the same change set as the schema change it represents.

## Standard Workflow

Preflight before any DB-touching command:

- confirm `DATABASE_URL` points to the intended database
- review the generated SQL before applying it anywhere shared
- prefer the compose-network verification path below when validating a new migration from scratch

```bash
cd app
npm run db:generate
npm run db:migrate
```

Then run the normal verification suite:

```bash
cd app
npm test -- --runInBand
npm run test:ui -- --runInBand
npm run build
```

## Existing Database Baseline

If you have an existing database that predates committed migrations, do not manually insert rows into `drizzle.__drizzle_migrations`.

Use the guarded baseline command instead:

```bash
cd app
ALLOW_BASELINE_STAMP=1 npm run db:baseline
```

The baseline command only stamps history when all of the following are true:

- `drizzle.__drizzle_migrations` is empty
- every expected table exists
- every expected enum exists with the expected labels
- every expected column exists with the expected type and nullability
- the expected primary keys, unique constraints, and foreign keys are present

If validation fails, the command exits without modifying migration history.

## Local Bootstrap

```bash
docker compose up postgres -d --wait
cd app
npm install
cp .env.example .env.local
set -a
source .env.local
set +a
npm run db:migrate
npm run db:seed
```

If you want a deterministic fresh-database verification path, or your host machine already has another PostgreSQL instance bound to `localhost:5432`, verify migrations through the compose network instead of assuming localhost points at the project database:

```bash
docker build --target builder -t sm-task3-migrate ./app
docker run --rm --network sm-rebuild-phase0_default \
  -e DATABASE_URL=postgresql://smdev:smdev@postgres:5432/smdev \
  sm-task3-migrate npm run db:migrate
```

## Production Rules

- Never use `drizzle-kit push` in production.
- Never rely on uncommitted schema state.
- Apply migrations before starting a new app revision that depends on them.
- Take a backup or snapshot before destructive schema changes.

## Rollback Expectations

- Prefer forward fixes over ad hoc rollbacks.
- If a migration is destructive, document the recovery path in the pull request or deployment notes.
- Restore from backup when data loss or irreversible destructive change is involved.

## Current Notes

- `db:push` is intentionally blocked and replaced with a safety message.
- `db:push:unsafe` exists only for disposable local environments.
- `db:baseline` is the only supported way to stamp migration history into an older database that already matches the current baseline schema.
- The committed migration directory is `app/drizzle/`.
