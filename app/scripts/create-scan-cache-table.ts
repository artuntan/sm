/**
 * Migration: Create creator_scan_cache table
 *
 * Durable cache for provider results. Eliminates redundant Apify calls
 * when the same creator is scanned multiple times within the freshness window.
 *
 * Run with: npx tsx scripts/create-scan-cache-table.ts
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "app.db");

function main() {
  console.log("[migrate] Opening database:", DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  console.log("[migrate] Creating creator_scan_cache table...");

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_scan_cache (
      id                  TEXT PRIMARY KEY,
      platform            TEXT NOT NULL,
      username            TEXT NOT NULL,
      providerResultJson  TEXT NOT NULL,
      providerSource      TEXT NOT NULL,
      itemCount           INTEGER NOT NULL DEFAULT 0,
      fetchedAt           TEXT NOT NULL,
      expiresAt           TEXT NOT NULL
    );
  `);

  // Unique index: one cache entry per (platform, username)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_cache_platform_username
    ON creator_scan_cache(platform, username);
  `);

  console.log("[migrate] ✅ creator_scan_cache table created successfully");

  // Verify
  const count = db.prepare("SELECT count(*) as cnt FROM creator_scan_cache").get() as { cnt: number };
  console.log(`[migrate] Current rows: ${count.cnt}`);

  db.close();
}

main();
