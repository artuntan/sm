/**
 * Create campaign tables in SQLite.
 * Run once: npx tsx src/lib/db/create-campaign-tables.ts
 */
import Database from "better-sqlite3";
import { DB_PATH } from "./db-path";

const sqlite = new Database(DB_PATH);

console.log(`[Campaign Tables] Using DB: ${DB_PATH}`);

// Create campaign table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS campaign (
    id TEXT PRIMARY KEY,
    teamId TEXT NOT NULL REFERENCES team(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    brandId TEXT,
    startDate TEXT,
    endDate TEXT,
    notes TEXT,
    budgetAmount INTEGER,
    budgetCurrency TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    meta TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    createdBy TEXT NOT NULL REFERENCES user(id)
  )
`);

console.log("[Campaign Tables] ✓ campaign created");

// Create campaign_creator table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS campaign_creator (
    id TEXT PRIMARY KEY,
    campaignId TEXT NOT NULL REFERENCES campaign(id),
    instagramHandle TEXT,
    tiktokHandle TEXT,
    label TEXT,
    role TEXT NOT NULL DEFAULT 'primary',
    analysisRunId TEXT,
    budgetAmount INTEGER,
    budgetCurrency TEXT,
    notes TEXT,
    addedAt TEXT NOT NULL
  )
`);

console.log("[Campaign Tables] ✓ campaign_creator created");

// Create campaign_deliverable table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS campaign_deliverable (
    id TEXT PRIMARY KEY,
    campaignId TEXT NOT NULL REFERENCES campaign(id),
    creatorId TEXT NOT NULL REFERENCES campaign_creator(id),
    platform TEXT NOT NULL,
    postId TEXT NOT NULL,
    permalink TEXT NOT NULL,
    caption TEXT,
    thumbnailUrl TEXT,
    views INTEGER,
    likes INTEGER,
    publishedAt TEXT,
    contentKind TEXT,
    matchType TEXT NOT NULL DEFAULT 'auto',
    matchReason TEXT,
    detectedAt TEXT NOT NULL
  )
`);

console.log("[Campaign Tables] ✓ campaign_deliverable created");

// Create indexes
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_campaign_team
  ON campaign (teamId)
`);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_campaign_status
  ON campaign (status)
`);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_campaign_brand
  ON campaign (brandId)
`);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_campaign_creator_campaign
  ON campaign_creator (campaignId)
`);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_campaign_creator_run
  ON campaign_creator (analysisRunId)
`);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_deliverable_campaign
  ON campaign_deliverable (campaignId)
`);

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_deliverable_creator
  ON campaign_deliverable (creatorId)
`);

sqlite.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_deliverable_dedup
  ON campaign_deliverable (campaignId, platform, postId)
`);

console.log("[Campaign Tables] ✓ indexes created");
console.log("[Campaign Tables] Done.");

sqlite.close();
