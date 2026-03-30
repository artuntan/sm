/**
 * Database Connection — PostgreSQL + Drizzle ORM
 *
 * Uses node-postgres (pg) with connection pooling.
 * Pool size adjusts for Lambda (1) vs server (10).
 * Lazy initialization to avoid failing during Next.js build.
 */

import { Pool } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _pool = new Pool({
      connectionString: url,
      max: process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : 10,
    });
  }
  return _pool;
}

function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

// Proxy that lazily initializes on first property access
export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getDb(), prop, receiver);
    },
  }
);

export { getPool as pool };
