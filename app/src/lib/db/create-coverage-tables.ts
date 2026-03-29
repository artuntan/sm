/**
 * Create coverage tables in SQLite.
 * Run once: npx tsx src/lib/db/create-coverage-tables.ts
 */
import Database from "better-sqlite3";
import { DB_PATH } from "./db-path";

const sqlite = new Database(DB_PATH);

console.log(`[Coverage Tables] Using DB: ${DB_PATH}`);

// Create coverage_scan_run table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS coverage_scan_run (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    startedAt TEXT NOT NULL,
    completedAt TEXT,
    accountsScanned INTEGER NOT NULL DEFAULT 0,
    postsFound INTEGER NOT NULL DEFAULT 0,
    newPostsIngested INTEGER NOT NULL DEFAULT 0,
    clustersCreated INTEGER NOT NULL DEFAULT 0,
    errorsJson TEXT NOT NULL DEFAULT '[]'
  )
`);

console.log("[Coverage Tables] ✓ coverage_scan_run created");

// Create coverage_post table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS coverage_post (
    id TEXT PRIMARY KEY,
    scanRunId TEXT NOT NULL,
    accountId TEXT NOT NULL,
    brandId TEXT NOT NULL,
    platform TEXT NOT NULL,
    platformPostId TEXT NOT NULL,
    permalink TEXT NOT NULL,
    caption TEXT,
    normalizedCaption TEXT,
    hashtagsJson TEXT NOT NULL DEFAULT '[]',
    mentionsJson TEXT NOT NULL DEFAULT '[]',
    publishedAt TEXT NOT NULL,
    fetchedAt TEXT NOT NULL,
    mediaType TEXT,
    thumbnailUrl TEXT,
    classification TEXT NOT NULL,
    classificationSignalsJson TEXT NOT NULL DEFAULT '[]',
    clusterFingerprint TEXT
  )
`);

console.log("[Coverage Tables] ✓ coverage_post created");

// Create unique index for dedup
sqlite.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_post_platform_postid
  ON coverage_post (platform, platformPostId)
`);

console.log("[Coverage Tables] ✓ unique index on (platform, platformPostId) created");

// Create performance indexes
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_coverage_post_brand
  ON coverage_post (brandId)
`);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_coverage_post_classification
  ON coverage_post (classification)
`);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_coverage_post_published
  ON coverage_post (publishedAt)
`);

console.log("[Coverage Tables] ✓ performance indexes created");

// Create coverage_account_scan_state table — per-account scan cursor for fast scans
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

console.log("[Coverage Tables] ✓ coverage_account_scan_state created");
console.log("[Coverage Tables] Done.");

sqlite.close();
