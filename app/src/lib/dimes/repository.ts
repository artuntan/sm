/**
 * Dimes Content Coverage — Durable Repository
 *
 * All reads/writes go through SQLite via Drizzle ORM.
 * This is the SOLE source of truth for the Coverage product.
 *
 * No in-memory caching — every call reads/writes the DB file.
 * SQLite with WAL mode handles concurrent reads efficiently.
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

export function createScanRun(
  id: string,
  type: ScanType,
  startedAt: string
): void {
  db.insert(coverageScanRun)
    .values({
      id,
      type,
      status: "running",
      startedAt,
      errorsJson: "[]",
    })
    .run();
}

export function completeScanRun(
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
): void {
  db.update(coverageScanRun)
    .set({
      status: updates.status,
      completedAt: updates.completedAt,
      accountsScanned: updates.accountsScanned,
      postsFound: updates.postsFound,
      newPostsIngested: updates.newPostsIngested,
      clustersCreated: updates.clustersCreated,
      errorsJson: JSON.stringify(updates.errors),
    })
    .where(eq(coverageScanRun.id, id))
    .run();
}

export function getScanHistory(limit: number = 20): DimesScanRun[] {
  const rows = db
    .select()
    .from(coverageScanRun)
    .orderBy(desc(coverageScanRun.startedAt))
    .limit(limit)
    .all();

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
    errors: JSON.parse(r.errorsJson) as ScanError[],
  }));
}

// ---------------------------------------------------------------------------
// Post CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a post. Returns null if the platform+postId combo already exists
 * (dedup across requests, across scans, across restarts).
 */
export function insertPost(post: DimesContentPost, scanRunId: string): string | null {
  // Check for existing post with same platform + platformPostId
  const existing = db
    .select({ id: coveragePost.id })
    .from(coveragePost)
    .where(
      and(
        eq(coveragePost.platform, post.platform),
        eq(coveragePost.platformPostId, post.platformPostId)
      )
    )
    .get();

  if (existing) return null; // Already exists — dedup

  db.insert(coveragePost)
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
      hashtagsJson: JSON.stringify(post.hashtags),
      mentionsJson: JSON.stringify(post.mentions),
      publishedAt: post.publishedAt,
      fetchedAt: post.fetchedAt,
      mediaType: post.mediaType ?? null,
      thumbnailUrl: post.thumbnailUrl ?? null,
      classification: post.classification,
      classificationSignalsJson: JSON.stringify(post.classificationSignals),
      clusterFingerprint: post.clusterFingerprint ?? null,
    })
    .run();

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
    hashtags: JSON.parse(row.hashtagsJson) as string[],
    mentions: JSON.parse(row.mentionsJson) as string[],
    publishedAt: row.publishedAt,
    fetchedAt: row.fetchedAt,
    mediaType: row.mediaType ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    classification: row.classification as ContentClassification,
    classificationSignals: JSON.parse(row.classificationSignalsJson) as string[],
    clusterFingerprint: row.clusterFingerprint ?? null,
  };
}

export function getAllPosts(since?: string): DimesContentPost[] {
  const query = db.select().from(coveragePost);

  if (since) {
    const rows = db
      .select()
      .from(coveragePost)
      .where(gte(coveragePost.publishedAt, since))
      .all();
    return rows.map(rowToPost);
  }

  return query.all().map(rowToPost);
}

export function getPostsByBrand(brandId: string): DimesContentPost[] {
  const rows = db
    .select()
    .from(coveragePost)
    .where(eq(coveragePost.brandId, brandId))
    .all();
  return rows.map(rowToPost);
}

export function getEligiblePosts(brandId?: string): DimesContentPost[] {
  return getAllPosts().filter(
    (p) =>
      (p.classification === "recipe" || p.classification === "taste") &&
      (!brandId || p.brandId === brandId)
  );
}

export function getPostCount(): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(coveragePost)
    .get();
  return result?.count ?? 0;
}

/**
 * Delete all coverage data. Used in tests only.
 */
export function clearAllCoverageData(): void {
  db.delete(coveragePost).run();
  db.delete(coverageScanRun).run();
  db.delete(coverageAccountScanState).run();
}

// ---------------------------------------------------------------------------
// Scan evidence
// ---------------------------------------------------------------------------

/**
 * Count posts per platform for a specific brand.
 */
export function getPostCountByBrandAndPlatform(
  brandId: string,
  platform: DimesPlatform
): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(coveragePost)
    .where(
      and(eq(coveragePost.brandId, brandId), eq(coveragePost.platform, platform))
    )
    .get();
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
export function getScanEvidence(
  brandId: string,
  platforms: DimesPlatform[],
  accountIds: Map<DimesPlatform, string>
): ScanEvidence[] {
  // Get the most recent completed scan run
  const latestRun = db
    .select()
    .from(coverageScanRun)
    .where(
      sql`${coverageScanRun.status} IN ('complete', 'partial')`
    )
    .orderBy(desc(coverageScanRun.startedAt))
    .limit(1)
    .get();

  if (!latestRun) {
    // No scan has ever completed — everything is unknown
    return platforms.map((platform) => ({
      platform,
      scanned: false,
      postsFetched: 0,
      error: "no scan has been completed yet",
    }));
  }

  const errors: ScanError[] = JSON.parse(latestRun.errorsJson);

  return platforms.map((platform) => {
    const accountId = accountIds.get(platform);
    const postCount = getPostCountByBrandAndPlatform(brandId, platform);

    // Check if THIS SPECIFIC account had a scan error.
    // IMPORTANT: match by accountId only — not by handle.
    // Previously `e.handle` (always truthy) caused one brand's error
    // to poison all brands on the same platform.
    const scanError = errors.find(
      (e) => e.platform === platform && e.accountId === accountId
    );

    if (scanError) {
      return {
        platform,
        scanned: false,
        postsFetched: postCount,
        error: scanError.error,
      };
    }

    // No error = scan completed and the latest snapshot is now persisted
    return {
      platform,
      scanned: true,
      postsFetched: postCount,
      error: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Per-account scan state — durable cursor for fast scans
// ---------------------------------------------------------------------------

export function getAccountScanState(accountId: string): AccountScanState | null {
  const row = db
    .select()
    .from(coverageAccountScanState)
    .where(eq(coverageAccountScanState.accountId, accountId))
    .get();

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

export function upsertAccountScanState(state: AccountScanState): void {
  const existing = db
    .select({ accountId: coverageAccountScanState.accountId })
    .from(coverageAccountScanState)
    .where(eq(coverageAccountScanState.accountId, state.accountId))
    .get();

  if (existing) {
    db.update(coverageAccountScanState)
      .set({
        lastSuccessfulScanAt: state.lastSuccessfulScanAt,
        lastScanMode: state.lastScanMode,
        lastScanPostCount: state.lastScanPostCount,
        latestPostPublishedAt: state.latestPostPublishedAt,
        updatedAt: state.updatedAt,
      })
      .where(eq(coverageAccountScanState.accountId, state.accountId))
      .run();
  } else {
    db.insert(coverageAccountScanState)
      .values({
        accountId: state.accountId,
        platform: state.platform,
        brandId: state.brandId,
        lastSuccessfulScanAt: state.lastSuccessfulScanAt,
        lastScanMode: state.lastScanMode,
        lastScanPostCount: state.lastScanPostCount,
        latestPostPublishedAt: state.latestPostPublishedAt,
        updatedAt: state.updatedAt,
      })
      .run();
  }
}

export function getAllAccountScanStates(): AccountScanState[] {
  const rows = db.select().from(coverageAccountScanState).all();
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
