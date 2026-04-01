# Database Migrations

This project uses committed Drizzle SQL migrations under `app/drizzle/`.

## Rules

- Do not use `db:push` for normal development or production changes.
- Every schema change must generate a committed migration.
- Apply migrations with `npm run db:migrate`.
- Review generated SQL before committing.
- Use `npm run db:baseline` only for databases that already match the committed baseline schema.

## Workflow

```bash
cd app
npm run db:generate
npm run db:migrate
```

If you need to bootstrap a local disposable environment from scratch, apply migrations and then seed:

```bash
cd app
npm run db:migrate
npm run db:seed
```

If you need to stamp migration history into an older database that was created before committed migrations existed:

```bash
cd app
ALLOW_BASELINE_STAMP=1 npm run db:baseline
```
