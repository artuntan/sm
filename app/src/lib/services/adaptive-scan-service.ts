/**
 * AdaptiveScanService — M3 Adaptive Re-Scan Policy
 *
 * Calculates optimal refresh cadence per creator based on posting frequency.
 *
 * Frequency tiers:
 *   High (7+ posts/week)  → 4 hour TTL (active creators produce content fast)
 *   Medium (3-6/week)     → 12 hour TTL
 *   Normal (1-2/week)     → 24 hour TTL (default for most creators)
 *   Low (<1/week)         → 48 hour TTL (rarely posts → don't waste credits)
 *   Unknown (first scan)  → 24 hour TTL (conservative default)
 *
 * The profile is updated after each successful scan, using warehouse data
 * to compute posting frequency.
 */
import { db } from "@/lib/db";
import { creatorScanProfile, creatorMediaItem } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { Platform, ProviderResult } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// TTL tiers (milliseconds)
// ---------------------------------------------------------------------------

const TTL_HIGH_FREQUENCY = 4 * 60 * 60 * 1000;      // 4 hours
const TTL_MEDIUM_FREQUENCY = 12 * 60 * 60 * 1000;    // 12 hours
const TTL_NORMAL_FREQUENCY = 24 * 60 * 60 * 1000;    // 24 hours
const TTL_LOW_FREQUENCY = 48 * 60 * 60 * 1000;       // 48 hours
const TTL_DEFAULT = TTL_NORMAL_FREQUENCY;             // 24 hours

// Frequency thresholds (posts per week)
const HIGH_THRESHOLD = 7;
const MEDIUM_THRESHOLD = 3;
const NORMAL_THRESHOLD = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanProfile = {
  platform: Platform;
  username: string;
  totalItemsSeen: number;
  scanCount: number;
  postsPerWeek: number;
  adaptiveTtlMs: number;
  firstScanAt: string;
  lastScanAt: string;
  latestPostAt: string | null;
  earliestPostAt: string | null;
  frequencyTier: "high" | "medium" | "normal" | "low" | "unknown";
};

export type FrequencyTier = ScanProfile["frequencyTier"];

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Get the adaptive TTL for a creator. Returns the default if no profile exists.
 */
export async function getAdaptiveTtl(platform: Platform, username: string): Promise<number> {
  const normalizedUsername = username.toLowerCase().trim();

  const rows = await db
    .select({ adaptiveTtlMs: creatorScanProfile.adaptiveTtlMs })
    .from(creatorScanProfile)
    .where(
      and(
        eq(creatorScanProfile.platform, platform),
        eq(creatorScanProfile.username, normalizedUsername)
      )
    )
    .limit(1);
  const row = rows[0];

  return row?.adaptiveTtlMs ?? TTL_DEFAULT;
}

/**
 * Get the full scan profile for a creator. Returns null if never scanned.
 */
export async function getScanProfile(
  platform: Platform,
  username: string
): Promise<ScanProfile | null> {
  const normalizedUsername = username.toLowerCase().trim();

  const rows = await db
    .select()
    .from(creatorScanProfile)
    .where(
      and(
        eq(creatorScanProfile.platform, platform),
        eq(creatorScanProfile.username, normalizedUsername)
      )
    )
    .limit(1);
  const row = rows[0];

  if (!row) return null;

  return {
    platform: row.platform as Platform,
    username: row.username,
    totalItemsSeen: row.totalItemsSeen,
    scanCount: row.scanCount,
    postsPerWeek: row.postsPerWeek,
    adaptiveTtlMs: row.adaptiveTtlMs,
    firstScanAt: row.firstScanAt,
    lastScanAt: row.lastScanAt,
    latestPostAt: row.latestPostAt ?? null,
    earliestPostAt: row.earliestPostAt ?? null,
    frequencyTier: classifyFrequency(row.postsPerWeek),
  };
}

/**
 * Update the scan profile after a successful scan.
 * Computes posting frequency from warehouse items and derives adaptive TTL.
 */
export async function updateScanProfile(
  platform: Platform,
  username: string,
  providerResult: ProviderResult
): Promise<ScanProfile> {
  const normalizedUsername = username.toLowerCase().trim();
  const now = new Date().toISOString();

  // Get all items from warehouse to compute frequency
  const warehouseItems = await db
    .select({
      publishedAt: creatorMediaItem.publishedAt,
    })
    .from(creatorMediaItem)
    .where(
      and(
        eq(creatorMediaItem.platform, platform),
        eq(creatorMediaItem.username, normalizedUsername)
      )
    )
    .orderBy(desc(creatorMediaItem.publishedAt));

  // Compute posting frequency
  const postsPerWeek = computePostsPerWeek(
    warehouseItems.map((r) => r.publishedAt)
  );
  const adaptiveTtlMs = frequencyToTtl(postsPerWeek);
  const tier = classifyFrequency(postsPerWeek);

  // Find date bounds
  const latestPostAt = warehouseItems.length > 0
    ? warehouseItems[0].publishedAt
    : null;
  const earliestPostAt = warehouseItems.length > 0
    ? warehouseItems[warehouseItems.length - 1].publishedAt
    : null;

  // Upsert profile
  const existingRows = await db
    .select({ id: creatorScanProfile.id, scanCount: creatorScanProfile.scanCount, firstScanAt: creatorScanProfile.firstScanAt })
    .from(creatorScanProfile)
    .where(
      and(
        eq(creatorScanProfile.platform, platform),
        eq(creatorScanProfile.username, normalizedUsername)
      )
    )
    .limit(1);
  const existing = existingRows[0];

  const profileData = {
    totalItemsSeen: warehouseItems.length,
    scanCount: (existing?.scanCount ?? 0) + 1,
    postsPerWeek,
    adaptiveTtlMs,
    lastScanAt: now,
    latestPostAt,
    earliestPostAt,
    profileSnapshotJson: providerResult.profile ?? null,
    updatedAt: now,
  };

  if (existing) {
    await db.update(creatorScanProfile)
      .set(profileData)
      .where(eq(creatorScanProfile.id, existing.id));
  } else {
    const id = `sp_${platform}_${normalizedUsername}_${Date.now()}`;
    await db.insert(creatorScanProfile)
      .values({
        id,
        platform,
        username: normalizedUsername,
        firstScanAt: now,
        ...profileData,
      });
  }

  return {
    platform: platform as Platform,
    username: normalizedUsername,
    totalItemsSeen: warehouseItems.length,
    scanCount: profileData.scanCount,
    postsPerWeek,
    adaptiveTtlMs,
    firstScanAt: existing?.firstScanAt ?? now,
    lastScanAt: now,
    latestPostAt,
    earliestPostAt,
    frequencyTier: tier,
  };
}

// ---------------------------------------------------------------------------
// Frequency computation
// ---------------------------------------------------------------------------

/**
 * Compute posts-per-week from a list of publish timestamps.
 *
 * Strategy: look at the time span between earliest and latest post,
 * divide by number of posts to get average frequency.
 * If we only have <3 posts, assume "normal" frequency.
 */
export function computePostsPerWeek(publishTimestamps: string[]): number {
  if (publishTimestamps.length < 3) return 0; // Not enough data

  const sorted = publishTimestamps
    .map((ts) => new Date(ts).getTime())
    .sort((a, b) => a - b);

  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const spanMs = latest - earliest;

  if (spanMs < 24 * 60 * 60 * 1000) return 0; // Less than 1 day span

  const spanWeeks = spanMs / (7 * 24 * 60 * 60 * 1000);
  const ppw = Math.round(sorted.length / spanWeeks);

  return ppw;
}

/**
 * Map posts-per-week to a TTL value.
 */
export function frequencyToTtl(postsPerWeek: number): number {
  if (postsPerWeek >= HIGH_THRESHOLD) return TTL_HIGH_FREQUENCY;
  if (postsPerWeek >= MEDIUM_THRESHOLD) return TTL_MEDIUM_FREQUENCY;
  if (postsPerWeek >= NORMAL_THRESHOLD) return TTL_NORMAL_FREQUENCY;
  if (postsPerWeek > 0) return TTL_LOW_FREQUENCY;
  return TTL_DEFAULT; // Unknown frequency
}

/**
 * Classify posting frequency into a human-readable tier.
 */
export function classifyFrequency(postsPerWeek: number): FrequencyTier {
  if (postsPerWeek >= HIGH_THRESHOLD) return "high";
  if (postsPerWeek >= MEDIUM_THRESHOLD) return "medium";
  if (postsPerWeek >= NORMAL_THRESHOLD) return "normal";
  if (postsPerWeek > 0) return "low";
  return "unknown";
}
