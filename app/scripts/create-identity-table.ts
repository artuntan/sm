/**
 * Migration: Create influencer_identity table
 *
 * Links Instagram and TikTok usernames as belonging to the same creator.
 * Used by the Warehouse page to display merged rows.
 *
 * Run with: npx tsx scripts/create-identity-table.ts
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "app.db");

function main() {
  console.log("[migrate] Opening database:", DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  console.log("[migrate] Creating influencer_identity table...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS influencer_identity (
      id                  TEXT PRIMARY KEY,
      instagramUsername   TEXT,
      tiktokUsername      TEXT,
      displayName         TEXT,
      createdAt           TEXT NOT NULL,
      updatedAt           TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_ig
    ON influencer_identity(instagramUsername) WHERE instagramUsername IS NOT NULL;
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_tt
    ON influencer_identity(tiktokUsername) WHERE tiktokUsername IS NOT NULL;
  `);

  console.log("[migrate] ✅ influencer_identity table created");

  const count = db.prepare("SELECT count(*) as cnt FROM influencer_identity").get() as { cnt: number };
  console.log(`[migrate] Current rows: ${count.cnt}`);

  db.close();
}

main();
