/**
 * Dimes Content Coverage — Durable Repository
 *
 * All reads/writes go through Postgres via Drizzle ORM.
 * This is the SOLE source of truth for the Coverage product.
 *
 * No in-memory caching — every call reads/writes the DB.
 */

import { db } from "@/lib/db";
import { coverageScanRun, coveragePost, coverageAccountScanState } from "@/lib/db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import type {
  DimesContentPost,
  DimesScanRun,
  DimesPlatform,
  ContentClassification,
  ScanError,
  ScanType,
  ScanStatus,
  ScanEvidence,
  AccountScanState,
} from "./types";

// ---------------------------------------------------------------------------
// Scan Run CRUD
// ---------------------------------------------------------------------------

export async function createScanRun(
  id: string,
  type: ScanType,
  startedAt: string
): Promise<void> {
  await db.insert(coverageScanRun)
    .values({
      id,
      type,
      status: "running",
      startedAt,
      errorsJson: [],
    });
}

export async function completeScanRun(
  id: string,
  updates: {
    status: ScanStatus;
    completedAt: string;
    accountsScanned: number;
    postsFound: number;
    newPostsIngested: number;
    clustersCreated: number;
    errors: ScanError[];
  }
): Promise<void> {
  await db.update(coverageScanRun)
    .set({
      status: updates.status,
      completedAt: updates.completedAt,
      accountsScanned: updates.accountsScanned,
      postsFound: updates.postsFound,
      newPostsIngested: updates.newPostsIngested,
      clustersCreated: updates.clustersCreated,
      errorsJson: updates.errors,
    })
    .where(eq(coverageScanRun.id, id));
}

export async function getScanHistory(limit: number = 20): Promise<DimesScanRun[]> {
  const rows = await db
    .select()
    .from(coverageScanRun)
    .orderBy(desc(coverageScanRun.startedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type as ScanType,
    status: r.status as ScanStatus,
    startedAt: r.startedAt,
    completedAt: r.completedAt ?? null,
    accountsScanned: r.accountsScanned,
    postsFound: r.postsFound,
    newPostsIngested: r.newPostsIngested,
    clustersCreated: r.clustersCreated,
    clustersUpdated: 0,
    errors: r.errorsJson as ScanError[],
  }));
}

// ---------------------------------------------------------------------------
// Post CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a post. Returns null if the platform+postId combo already exists
 * (dedup across requests, across scans, across restarts).
 */
export async function insertPost(post: DimesContentPost, scanRunId: string): Promise<string | null> {
  // Check for existing post with same platform + platformPostId
  const existingRows = await db
    .select({ id: coveragePost.id })
    .from(coveragePost)
    .where(
      and(
        eq(coveragePost.platform, post.platform),
        eq(coveragePost.platformPostId, post.platformPostId)
      )
    )
    .limit(1);
  const existing = existingRows[0];

  if (existing) return null; // Already exists — dedup

  await db.insert(coveragePost)
    .values({
      id: post.id,
      scanRunId,
      accountId: post.accountId,
      brandId: post.brandId,
      platform: post.platform,
      platformPostId: post.platformPostId,
      permalink: post.permalink,
      caption: post.caption ?? null,
      normalizedCaption: post.normalizedCaption ?? null,
      hashtagsJson: post.hashtags,
      mentionsJson: post.mentions,
      publishedAt: post.publishedAt,
      fetchedAt: post.fetchedAt,
      mediaType: post.mediaType ?? null,
      thumbnailUrl: post.thumbnailUrl ?? null,
      classification: post.classification,
      classificationSignalsJson: post.classificationSignals,
      clusterFingerprint: post.clusterFingerprint ?? null,
    });

  return post.id;
}

// ---------------------------------------------------------------------------
// Post queries
// ---------------------------------------------------------------------------

function rowToPost(row: typeof coveragePost.$inferSelect): DimesContentPost {
  return {
    id: row.id,
    accountId: row.accountId,
    brandId: row.brandId,
    platform: row.platform as DimesPlatform,
    platformPostId: row.platformPostId,
    permalink: row.permalink,
    caption: row.caption ?? null,
    normalizedCaption: row.normalizedCaption ?? null,
    hashtags: row.hashtagsJson as string[],
    mentions: row.mentionsJson as string[],
    publishedAt: row.publishedAt,
    fetchedAt: row.fetchedAt,
    mediaType: row.mediaType ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    classification: row.classification as ContentClassification,
    classificationSignals: row.classificationSignalsJson as string[],
    clusterFingerprint: row.clusterFingerprint ?? null,
  };
}

export async function getAllPosts(since?: string): Promise<DimesContentPost[]> {
  if (since) {
    const rows = await db
      .select()
      .from(coveragePost)
      .where(gte(coveragePost.publishedAt, since));
    return rows.map(rowToPost);
  }

  const rows = await db.select().from(coveragePost);
  return rows.map(rowToPost);
}

export async function getPostsByBrand(brandId: string): Promise<DimesContentPost[]> {
  const rows = await db
    .select()
    .from(coveragePost)
    .where(eq(coveragePost.brandId, brandId));
  return rows.map(rowToPost);
}

export async function getEligiblePosts(brandId?: string): Promise<DimesContentPost[]> {
  const posts = await getAllPosts();
  return posts.filter(
    (p) =>
      (p.classification === "recipe" || p.classification === "taste") &&
      (!brandId || p.brandId === brandId)
  );
}

export async function getPostCount(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(coveragePost)
    .limit(1);
  const result = rows[0];
  return result?.count ?? 0;
}

/**
 * Delete all coverage data. Used in tests only.
 */
export async function clearAllCoverageData(): Promise<void> {
  await db.delete(coveragePost);
  await db.delete(coverageScanRun);
  await db.delete(coverageAccountScanState);
}

// ---------------------------------------------------------------------------
// Scan evidence
// ---------------------------------------------------------------------------

/**
 * Count posts per platform for a specific brand.
 */
export async function getPostCountByBrandAndPlatform(
  brandId: string,
  platform: DimesPlatform
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(coveragePost)
    .where(
      and(eq(coveragePost.brandId, brandId), eq(coveragePost.platform, platform))
    )
    .limit(1);
  const result = rows[0];
  return result?.count ?? 0;
}

/**
 * Build scan evidence for a brand across all platforms.
 *
 * For each platform that the brand has an account on:
 * - Check the most recent scan run for errors on that platform/account
 * - Count posts fetched for that platform
 * - Determine if the platform was successfully scanned
 *
 * If no scan has ever run, all platforms show scanned=false.
 */
export async function getScanEvidence(
  brandId: string,
  platforms: DimesPlatform[],
  accountIds: Map<DimesPlatform, string>
): Promise<ScanEvidence[]> {
  // Get the most recent completed scan run
  const latestRunRows = await db
    .select()
    .from(coverageScanRun)
    .where(
      sql`${coverageScanRun.status} IN ('complete', 'partial')`
    )
    .orderBy(desc(coverageScanRun.startedAt))
    .limit(1);
  const latestRun = latestRunRows[0];

  if (!latestRun) {
    // No scan has ever completed — everything is unknown
    return platforms.map((platform) => ({
      platform,
      scanned: false,
      postsFetched: 0,
      error: "no scan has been completed yet",
    }));
  }

  const errors: ScanError[] = latestRun.errorsJson as ScanError[];

  const results: ScanEvidence[] = [];
  for (const platform of platforms) {
    const accountId = accountIds.get(platform);
    const postCount = await getPostCountByBrandAndPlatform(brandId, platform);

    // Check if THIS SPECIFIC account had a scan error.
    // IMPORTANT: match by accountId only — not by handle.
    // Previously `e.handle` (always truthy) caused one brand's error
    // to poison all brands on the same platform.
    const scanError = errors.find(
      (e) => e.platform === platform && e.accountId === accountId
    );

    if (scanError) {
      results.push({
        platform,
        scanned: false,
        postsFetched: postCount,
        error: scanError.error,
      });
    } else {
      // No error = scan completed and the latest snapshot is now persisted
      results.push({
        platform,
        scanned: true,
        postsFetched: postCount,
        error: null,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Per-account scan state — durable cursor for fast scans
// ---------------------------------------------------------------------------

export async function getAccountScanState(accountId: string): Promise<AccountScanState | null> {
  const rows = await db
    .select()
    .from(coverageAccountScanState)
    .where(eq(coverageAccountScanState.accountId, accountId))
    .limit(1);
  const row = rows[0];

  if (!row) return null;

  return {
    accountId: row.accountId,
    platform: row.platform as DimesPlatform,
    brandId: row.brandId,
    lastSuccessfulScanAt: row.lastSuccessfulScanAt ?? null,
    lastScanMode: (row.lastScanMode as AccountScanState["lastScanMode"]) ?? null,
    lastScanPostCount: row.lastScanPostCount,
    latestPostPublishedAt: row.latestPostPublishedAt ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function upsertAccountScanState(state: AccountScanState): Promise<void> {
  const existingRows = await db
    .select({ accountId: coverageAccountScanState.accountId })
    .from(coverageAccountScanState)
    .where(eq(coverageAccountScanState.accountId, state.accountId))
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    await db.update(coverageAccountScanState)
      .set({
        lastSuccessfulScanAt: state.lastSuccessfulScanAt,
        lastScanMode: state.lastScanMode,
        lastScanPostCount: state.lastScanPostCount,
        latestPostPublishedAt: state.latestPostPublishedAt,
        updatedAt: state.updatedAt,
      })
      .where(eq(coverageAccountScanState.accountId, state.accountId));
  } else {
    await db.insert(coverageAccountScanState)
      .values({
        accountId: state.accountId,
        platform: state.platform,
        brandId: state.brandId,
        lastSuccessfulScanAt: state.lastSuccessfulScanAt,
        lastScanMode: state.lastScanMode,
        lastScanPostCount: state.lastScanPostCount,
        latestPostPublishedAt: state.latestPostPublishedAt,
        updatedAt: state.updatedAt,
      });
  }
}

export async function getAllAccountScanStates(): Promise<AccountScanState[]> {
  const rows = await db.select().from(coverageAccountScanState);
  return rows.map((row) => ({
    accountId: row.accountId,
    platform: row.platform as DimesPlatform,
    brandId: row.brandId,
    lastSuccessfulScanAt: row.lastSuccessfulScanAt ?? null,
    lastScanMode: (row.lastScanMode as AccountScanState["lastScanMode"]) ?? null,
    lastScanPostCount: row.lastScanPostCount,
    latestPostPublishedAt: row.latestPostPublishedAt ?? null,
    updatedAt: row.updatedAt,
  }));
}
