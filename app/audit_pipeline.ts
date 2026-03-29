/**
 * Diagnostic audit script for the commercial benchmark pipeline.
 * Fetches ALL recent media for a username, classifies every Reel,
 * and prints a full audit table showing why the commercial bucket
 * ends up with N items.
 *
 * Usage: npx tsx /tmp/audit_pipeline.ts dogaozdas
 */
import * as fs from "fs";
import * as path from "path";

// Read .env.local manually
const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  process.env[key] = val;
}

const TOKEN = process.env.META_ACCESS_TOKEN!;
const USER_ID = process.env.META_IG_USER_ID!;
const VERSION = process.env.META_GRAPH_API_VERSION || "v23.0";

// Import the classifier directly
import { classifyBenchmarkExclusion } from "./src/lib/domain/normalize";

const username = process.argv[2] || "dogaozdas";

const MEDIA_FIELDS =
  "id,caption,timestamp,permalink,thumbnail_url,media_type,media_product_type,view_count";

interface MediaItem {
  id: string;
  caption?: string;
  timestamp?: string;
  permalink?: string;
  media_type?: string;
  media_product_type?: string;
  view_count?: number;
}

async function fetchAllMedia(targetUsername: string): Promise<MediaItem[]> {
  const allItems: MediaItem[] = [];
  let afterCursor: string | undefined;
  let hasMore = true;
  let page = 0;
  const MAX_PAGES = 10;

  while (hasMore && page < MAX_PAGES) {
    page++;
    const limit = 25;
    const mediaQuery = afterCursor
      ? `media.limit(${limit}).after(${afterCursor}){${MEDIA_FIELDS}}`
      : `media.limit(${limit}){${MEDIA_FIELDS}}`;
    const fields = `business_discovery.username(${targetUsername}){username,${mediaQuery}}`;
    const params = new URLSearchParams({ fields, access_token: TOKEN });
    const url = `https://graph.facebook.com/${VERSION}/${USER_ID}?${params}`;

    console.log(`[Page ${page}] Fetching...`);

    const res = await fetch(url);
    const data: any = await res.json();

    if (data.error) {
      console.error("API Error:", data.error.message, "(code:", data.error.code, ")");
      process.exit(1);
    }

    const mediaData = data.business_discovery?.media?.data ?? [];
    console.log(`[Page ${page}] Got ${mediaData.length} items`);
    allItems.push(...mediaData);

    const paging = data.business_discovery?.media?.paging;
    afterCursor = paging?.cursors?.after;
    hasMore = !!paging?.next && !!afterCursor;

    if (mediaData.length < limit) hasMore = false;
  }

  return allItems;
}

async function main() {
  console.log(`=== Pipeline Audit for @${username} ===\n`);

  const allMedia = await fetchAllMedia(username);
  console.log(`\nTotal fetched: ${allMedia.length}`);

  // Categorize by type
  const byType: Record<string, number> = {};
  for (const item of allMedia) {
    const key = `${item.media_type}/${item.media_product_type}`;
    byType[key] = (byType[key] || 0) + 1;
  }
  console.log("\nMedia type breakdown:");
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  // Filter to REELS only
  const reels = allMedia.filter((m) => m.media_product_type === "REELS");
  console.log(`\nReels: ${reels.length} of ${allMedia.length} total items`);

  // The current provider fetches MAX 50 total items
  const first50 = allMedia.slice(0, 50);
  const reelsInFirst50 = first50.filter((m) => m.media_product_type === "REELS");
  console.log(`Reels in first 50 items (current scan): ${reelsInFirst50.length}`);

  // Classify every Reel
  console.log("\n=== FULL REEL AUDIT ===\n");

  let commercialInFirst50 = 0;
  let commercialTotal = 0;

  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    const classification = classifyBenchmarkExclusion(reel.caption ?? null);
    const date = reel.timestamp
      ? new Date(reel.timestamp).toISOString().slice(0, 10)
      : "unknown";
    const isInFirst50 = first50.some((m) => m.id === reel.id);
    const label = classification.shouldExclude ? "COMMERCIAL" : "organic";

    if (classification.shouldExclude) {
      commercialTotal++;
      if (isInFirst50) commercialInFirst50++;
    }

    const captionExcerpt = (reel.caption ?? "(no caption)")
      .replace(/\n/g, " ")
      .slice(0, 70);
    const signals = classification.matchedSignals.join("; ") || "—";
    const category = classification.exclusionCategory || "—";

    console.log(
      `[${i + 1}] ${date} | ${label.padEnd(10)} | cat: ${category.padEnd(20)} | in50: ${isInFirst50 ? "YES" : "no "} | ${captionExcerpt}`
    );
    if (classification.shouldExclude) {
      console.log(`     signals: ${signals}`);
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total media items fetched: ${allMedia.length}`);
  console.log(`Total Reels found: ${reels.length}`);
  console.log(`Commercial Reels total: ${commercialTotal}`);
  console.log(`Commercial Reels in first 50 items (current scan): ${commercialInFirst50}`);
  console.log(
    `\n→ Current system: fetches 50 items → gets ${reelsInFirst50.length} Reels → ${commercialInFirst50} commercial`
  );
  if (commercialTotal > commercialInFirst50) {
    console.log(
      `→ SCAN DEPTH BUG: ${commercialTotal - commercialInFirst50} commercial Reels missed because they fall outside the 50-item window`
    );
  }
  if (commercialTotal < 5) {
    console.log(`→ Even with deep scan, only ${commercialTotal} commercial Reels found. Need wider classifier or more scan depth.`);
  }
}

main().catch(console.error);
