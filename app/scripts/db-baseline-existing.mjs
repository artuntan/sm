#!/usr/bin/env node

import { createRequire } from "node:module";
import { resolve } from "node:path";
import pg from "pg";

const require = createRequire(import.meta.url);
const { loadProjectEnv } = require("./lib/load-env.cjs");
const {
  buildActualSchema,
  compareSchemaBaseline,
  loadLatestBaseline,
} = require("./lib/migration-baseline.cjs");

const { Pool } = pg;

loadProjectEnv({ cwd: process.cwd() });

if (process.env.ALLOW_BASELINE_STAMP !== "1") {
  console.error(
    [
      "Baseline stamping is intentionally guarded.",
      "Set ALLOW_BASELINE_STAMP=1 after you have confirmed this database already matches the committed baseline schema.",
      "Example: ALLOW_BASELINE_STAMP=1 npm run db:baseline",
    ].join("\n")
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to baseline an existing database.");
  process.exit(1);
}

const baseline = loadLatestBaseline(resolve(process.cwd(), "drizzle"));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const migrationHistory = await client.query(
      "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC"
    );

    if (migrationHistory.rows.length > 0) {
      const latestRow = migrationHistory.rows[0];

      if (
        latestRow.hash === baseline.hash &&
        Number(latestRow.created_at) === baseline.createdAt
      ) {
        console.log(
          `Database already contains baseline migration ${baseline.tag}; nothing to do.`
        );
        await client.query("ROLLBACK");
        return;
      }

      throw new Error(
        "drizzle.__drizzle_migrations already contains history. Refusing to stamp over an existing migration state."
      );
    }

    const schemas = Array.from(
      new Set([
        ...Object.values(baseline.expected.tables).map((table) => table.schema),
        ...Object.values(baseline.expected.enums).map((enumValue) => enumValue.schema),
      ])
    );

    const tableRows = await client.query(
      `
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema = ANY($1::text[])
          AND table_type = 'BASE TABLE'
      `,
      [schemas]
    );
    const columnRows = await client.query(
      `
        SELECT table_schema, table_name, column_name, is_nullable, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = ANY($1::text[])
      `,
      [schemas]
    );
    const enumRows = await client.query(
      `
        SELECT
          n.nspname AS enum_schema,
          t.typname AS enum_name,
          e.enumlabel AS enum_value,
          e.enumsortorder
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = ANY($1::text[])
        ORDER BY n.nspname, t.typname, e.enumsortorder
      `,
      [schemas]
    );
    const constraintRows = await client.query(
      `
        WITH key_constraints AS (
          SELECT
            tc.table_schema,
            tc.table_name,
            tc.constraint_name,
            tc.constraint_type,
            array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns,
            NULL::text AS foreign_table_schema,
            NULL::text AS foreign_table_name,
            NULL::text[] AS foreign_columns,
            NULL::text AS on_update,
            NULL::text AS on_delete
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_schema = kcu.constraint_schema
           AND tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
           AND tc.table_name = kcu.table_name
          WHERE tc.table_schema = ANY($1::text[])
            AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
          GROUP BY tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type
        ),
        foreign_constraints AS (
          SELECT
            tc.table_schema,
            tc.table_name,
            tc.constraint_name,
            tc.constraint_type,
            array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            array_agg(ccu.column_name ORDER BY kcu.position_in_unique_constraint) AS foreign_columns,
            lower(rc.update_rule) AS on_update,
            lower(rc.delete_rule) AS on_delete
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_schema = kcu.constraint_schema
           AND tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
           AND tc.table_name = kcu.table_name
          JOIN information_schema.referential_constraints rc
            ON tc.constraint_schema = rc.constraint_schema
           AND tc.constraint_name = rc.constraint_name
          JOIN information_schema.constraint_column_usage ccu
            ON rc.unique_constraint_schema = ccu.constraint_schema
           AND rc.unique_constraint_name = ccu.constraint_name
          WHERE tc.table_schema = ANY($1::text[])
            AND tc.constraint_type = 'FOREIGN KEY'
          GROUP BY
            tc.table_schema,
            tc.table_name,
            tc.constraint_name,
            tc.constraint_type,
            ccu.table_schema,
            ccu.table_name,
            rc.update_rule,
            rc.delete_rule
        )
        SELECT * FROM key_constraints
        UNION ALL
        SELECT * FROM foreign_constraints
      `,
      [schemas]
    );

    const actual = buildActualSchema({
      tables: tableRows.rows,
      columns: columnRows.rows,
      enums: enumRows.rows,
      constraints: constraintRows.rows,
    });

    const issues = compareSchemaBaseline(baseline.expected, actual);
    if (issues.length > 0) {
      throw new Error(
        [
          `Database does not match committed baseline ${baseline.tag}.`,
          "Fix the schema drift manually, or migrate from a clean copy instead of stamping history.",
          "",
          ...issues.map((issue) => `- ${issue}`),
        ].join("\n")
      );
    }

    await client.query(
      `
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ($1, $2)
      `,
      [baseline.hash, baseline.createdAt]
    );

    await client.query("COMMIT");

    console.log(
      [
        `Stamped baseline migration ${baseline.tag}.`,
        `hash=${baseline.hash}`,
        `created_at=${baseline.createdAt}`,
      ].join("\n")
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
