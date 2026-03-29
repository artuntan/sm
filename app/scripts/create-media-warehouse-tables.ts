/**
 * Migration: Create M2 + M3 tables
 *
 * M2: creator_media_item — normalized content items with metric tracking
 * M3: creator_scan_profile — per-creator scan metadata for adaptive TTL
 *
 * Run with: npx tsx scripts/create-media-warehouse-tables.ts
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "app.db");

function main() {
  console.log("[migrate] Opening database:", DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // ── M2: Normalized Media Warehouse ──────────────────────────────────────
  console.log("[migrate] Creating creator_media_item table...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_media_item (
      id                      TEXT PRIMARY KEY,
      platform                TEXT NOT NULL,
      username                TEXT NOT NULL,
      externalId              TEXT NOT NULL,
      permalink               TEXT NOT NULL,
      caption                 TEXT,
      publishedAt             TEXT NOT NULL,
      contentKind             TEXT,
      thumbnailUrl            TEXT,
      views                   INTEGER,
      likes                   INTEGER,
      comments                INTEGER,
      isCommercial            INTEGER NOT NULL DEFAULT 0,
      commercialMetadataJson  TEXT,
      rawMetadataJson         TEXT,
      firstSeenAt             TEXT NOT NULL,
      lastMetricUpdateAt      TEXT NOT NULL,
      previousViews           INTEGER,
      metricUpdateCount       INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Unique index: one row per (platform, externalId) — dedup across scans
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_media_item_platform_external
    ON creator_media_item(platform, externalId);
  `);

  // Lookup index: all items for a creator
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_media_item_platform_username
    ON creator_media_item(platform, username);
  `);

  console.log("[migrate] ✅ creator_media_item table created");

  // ── M3: Creator Scan Profile ────────────────────────────────────────────
  console.log("[migrate] Creating creator_scan_profile table...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_scan_profile (
      id                    TEXT PRIMARY KEY,
      platform              TEXT NOT NULL,
      username              TEXT NOT NULL,
      totalItemsSeen        INTEGER NOT NULL DEFAULT 0,
      scanCount             INTEGER NOT NULL DEFAULT 0,
      postsPerWeek          INTEGER NOT NULL DEFAULT 0,
      adaptiveTtlMs         INTEGER NOT NULL DEFAULT 86400000,
      firstScanAt           TEXT NOT NULL,
      lastScanAt            TEXT NOT NULL,
      latestPostAt          TEXT,
      earliestPostAt        TEXT,
      profileSnapshotJson   TEXT,
      updatedAt             TEXT NOT NULL
    );
  `);

  // Unique index: one profile per (platform, username)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_profile_platform_username
    ON creator_scan_profile(platform, username);
  `);

  console.log("[migrate] ✅ creator_scan_profile table created");

  // Verify
  const mediaCount = db.prepare("SELECT count(*) as cnt FROM creator_media_item").get() as { cnt: number };
  const profileCount = db.prepare("SELECT count(*) as cnt FROM creator_scan_profile").get() as { cnt: number };
  console.log(`[migrate] creator_media_item rows: ${mediaCount.cnt}`);
  console.log(`[migrate] creator_scan_profile rows: ${profileCount.cnt}`);

  db.close();
}

main();
