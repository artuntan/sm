/**
 * Dimes Content Coverage — Scan Orchestrator
 *
 * Manages content scanning: both historical backfill and daily monitoring.
 *
 * IMPORTANT: This module uses DURABLE STORAGE via SQLite.
 * All state is persisted through repository.ts.
 * There is NO in-memory state that could be lost between requests.
 *
 * The API route calls providers, then passes fetched posts here
 * for ingestion + classification + fingerprinting.
 * Clustering & gap analysis are computed on-read by the report route.
 */

import type {
  DimesSocialAccount,
  DimesContentPost,
  DimesScanRun,
  DimesPlatform,
  ScanError,
  ScanType,
} from "./types";
import { getAllBrands, getVerifiedAccounts } from "./accounts";
import { classifyContent } from "./classifier";
import { buildClusters, generateFingerprint } from "./clustering";
import { normalizeCaption, extractHashtags, extractMentions } from "../domain/normalize";
import * as repo from "./repository";

// ---------------------------------------------------------------------------
// Post ingestion
// ---------------------------------------------------------------------------

export type RawFetchedPost = {
  platformPostId: string;
  platform: DimesPlatform;
  caption: string | null;
  permalink: string;
  publishedAt: string;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
};

let postIdCounter = 0;
function makePostId(): string {
  return `post_${Date.now()}_${++postIdCounter}`;
}

let scanIdCounter = 0;
export function makeScanId(): string {
  return `scan_${Date.now()}_${++scanIdCounter}`;
}

/**
 * Ingest a raw fetched post into the DURABLE warehouse.
 * Handles normalization, classification, fingerprinting.
 * Returns null if already seen (dedup via DB unique constraint).
 */
export function ingestPost(
  raw: RawFetchedPost,
  account: DimesSocialAccount,
  scanRunId: string
): DimesContentPost | null {
  // Normalize & extract
  const normalized = raw.caption ? normalizeCaption(raw.caption) : null;
  const hashtags = raw.caption ? extractHashtags(normalizeCaption(raw.caption)) : [];
  const mentions = raw.caption ? extractMentions(normalizeCaption(raw.caption)) : [];

  // Classify
  const classification = classifyContent(raw.caption, hashtags);

  // Fingerprint
  const fingerprint = generateFingerprint(
    account.brandId,
    raw.caption,
    hashtags,
    raw.publishedAt
  );

  const post: DimesContentPost = {
    id: makePostId(),
    accountId: account.id,
    brandId: account.brandId,
    platform: raw.platform,
    platformPostId: raw.platformPostId,
    permalink: raw.permalink,
    caption: raw.caption,
    normalizedCaption: normalized,
    hashtags,
    mentions,
    publishedAt: raw.publishedAt,
    fetchedAt: new Date().toISOString(),
    mediaType: raw.mediaType || null,
    thumbnailUrl: raw.thumbnailUrl || null,
    classification: classification.classification,
    classificationSignals: classification.signals,
    clusterFingerprint: fingerprint,
  };

  // Insert into DB — returns null if duplicate (platform + platformPostId)
  const insertedId = repo.insertPost(post, scanRunId);
  if (!insertedId) return null;

  return post;
}

// ---------------------------------------------------------------------------
// Storage access (reads from DB)
// ---------------------------------------------------------------------------

export function getAllPosts(since?: string): DimesContentPost[] {
  return repo.getAllPosts(since);
}

export function getPostsByBrand(brandId: string): DimesContentPost[] {
  return repo.getPostsByBrand(brandId);
}

export function getEligiblePosts(brandId?: string): DimesContentPost[] {
  return repo.getEligiblePosts(brandId);
}

/**
 * WARNING: Deletes all coverage data. For testing only.
 */
export function clearAllPosts(): void {
  repo.clearAllCoverageData();
}

// ---------------------------------------------------------------------------
// Scan run lifecycle
// ---------------------------------------------------------------------------

export function getScanHistory(): DimesScanRun[] {
  return repo.getScanHistory();
}

/**
 * Execute a scan run — DURABLE version.
 *
 * 1. Creates a DB scan run record (status=running)
 * 2. Ingests posts (with DB dedup)
 * 3. Computes clusters on the full post set
 * 4. Updates the scan run record (status=complete/partial)
 * 5. Returns the finalized scan run
 */
export function executeScanRun(
  type: ScanType,
  fetchedPosts: { raw: RawFetchedPost; account: DimesSocialAccount }[],
  errors: ScanError[] = []
): DimesScanRun {
  const scanId = makeScanId();
  const startedAt = new Date().toISOString();

  // Step 1: Create DB record
  repo.createScanRun(scanId, type, startedAt);

  // Step 2: Ingest posts
  let newPostsIngested = 0;
  for (const { raw, account } of fetchedPosts) {
    const post = ingestPost(raw, account, scanId);
    if (post) {
      newPostsIngested++;
    }
  }

  // Step 3: Count clusters from all source-eligible posts
  // Source platform posts (IG/TT) enter clustering regardless of classification
  // (except special_day). Destination platform posts need recipe/taste.
  const allPosts = repo.getAllPosts();
  const SOURCE_SET = new Set(["instagram", "tiktok"]);
  const clusterCandidates = allPosts.filter((p) => {
    if (p.classification === "special_day") return false;
    if (SOURCE_SET.has(p.platform)) return true;
    return p.classification === "recipe" || p.classification === "taste";
  });
  const { clusters } = buildClusters(clusterCandidates);

  // Step 4: Finalize scan run in DB
  const completedAt = new Date().toISOString();
  const status = errors.length > 0 ? "partial" : "complete";

  repo.completeScanRun(scanId, {
    status: status as any,
    completedAt,
    accountsScanned: new Set(fetchedPosts.map((f) => f.account.id)).size,
    postsFound: fetchedPosts.length,
    newPostsIngested,
    clustersCreated: clusters.length,
    errors,
  });

  // Step 5: Return the finalized scan run
  return {
    id: scanId,
    type,
    status: status as any,
    startedAt,
    completedAt,
    accountsScanned: new Set(fetchedPosts.map((f) => f.account.id)).size,
    postsFound: fetchedPosts.length,
    newPostsIngested,
    clustersCreated: clusters.length,
    clustersUpdated: 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Daily scan config
// ---------------------------------------------------------------------------

export function getDailyScanConfig() {
  return {
    timezone: "Europe/Istanbul",
    cronExpression: "0 6 * * *",
    description: "Daily content coverage scan for all Dimes brand accounts",
    brands: getAllBrands().map((b) => ({
      id: b.id,
      name: b.name,
      accounts: getVerifiedAccounts(b).filter(
        (a) => a.providerPath !== "not-available"
      ),
    })),
  };
}
