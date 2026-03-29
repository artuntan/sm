/**
 * Database Connection — SQLite + Drizzle ORM
 *
 * Single-file SQLite database with deterministic path resolution.
 * The DB file is gitignored — each environment creates its own.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { DB_PATH } from "./db-path";

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-create coverage_account_scan_state if missing (new table — no migration needed)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS coverage_account_scan_state (
    accountId TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    brandId TEXT NOT NULL,
    lastSuccessfulScanAt TEXT,
    lastScanMode TEXT,
    lastScanPostCount INTEGER NOT NULL DEFAULT 0,
    latestPostPublishedAt TEXT,
    updatedAt TEXT NOT NULL
  )
`);

export const db = drizzle(sqlite, { schema });
export { sqlite, DB_PATH };
