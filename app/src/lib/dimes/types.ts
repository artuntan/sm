/**
 * Dimes Content Coverage Intelligence — Type Definitions
 *
 * These types are SEPARATE from the creator benchmark domain.
 * They model brand-level content monitoring, not creator analysis.
 */

// ---------------------------------------------------------------------------
// Platform universe (broader than benchmark's instagram | tiktok)
// ---------------------------------------------------------------------------

export type DimesPlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "pinterest"
  | "x";

/** Platforms that serve as content SOURCES (where recipes originate) */
export const SOURCE_PLATFORMS: DimesPlatform[] = ["instagram", "tiktok"];

/** Platforms that are GAP DESTINATIONS (where recipes should be cross-posted) */
export const DESTINATION_PLATFORMS: DimesPlatform[] = [
  "facebook",
  "youtube",
  "pinterest",
];

// ---------------------------------------------------------------------------
// Provider access path transparency
// ---------------------------------------------------------------------------

export type DimesProviderPath =
  | "apify"           // Apify managed actor (IG, TikTok, FB, Pinterest)
  | "youtube-api"     // YouTube Data API v3
  | "meta-graph"      // Meta Graph API (FB pages with admin access)
  | "pinterest-api"   // Pinterest API v5
  | "manual"          // Manually entered / verified by operator
  | "not-available";  // No access path exists

export type PlatformAccessInfo = {
  platform: DimesPlatform;
  providerPath: DimesProviderPath;
  isOfficial: boolean;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Brand & Account Registry
// ---------------------------------------------------------------------------

export type VerificationStatus = "verified" | "unverified" | "error";

export type DimesBrand = {
  id: string;
  slug: string;
  name: string;
  accounts: DimesSocialAccount[];
};

export type DimesSocialAccount = {
  id: string;
  brandId: string;
  platform: DimesPlatform;
  handle: string;
  profileUrl: string;
  verificationStatus: VerificationStatus;
  lastScannedAt: string | null;
  providerPath: DimesProviderPath;
  notes: string | null;
};

// ---------------------------------------------------------------------------
// Content Classification
// ---------------------------------------------------------------------------

export type ContentClassification =
  | "recipe"        // Recipe / tarif content
  | "taste"         // Taste-led / lezzet content (not full recipe)
  | "special_day"   // Special-day recipe (excluded from gap analysis)
  | "brand_promo"   // Generic brand promotion
  | "other";        // Non-food content

export type ClassificationResult = {
  classification: ContentClassification;
  confidence: "high" | "medium" | "low";
  signals: string[];
  isRecipeOrTaste: boolean;     // recipe || taste
  isSpecialDay: boolean;
  isEligibleForGapAnalysis: boolean;  // recipe/taste AND NOT special_day
};

// ---------------------------------------------------------------------------
// Content Post (warehouse)
// ---------------------------------------------------------------------------

export type DimesContentPost = {
  id: string;
  accountId: string;
  brandId: string;
  platform: DimesPlatform;
  platformPostId: string;
  permalink: string;
  caption: string | null;
  normalizedCaption: string | null;
  hashtags: string[];
  mentions: string[];
  publishedAt: string;
  fetchedAt: string;
  mediaType: string | null;
  thumbnailUrl: string | null;
  classification: ContentClassification;
  classificationSignals: string[];
  clusterFingerprint: string | null;
};

// ---------------------------------------------------------------------------
// Content Cluster (canonical content unit)
// ---------------------------------------------------------------------------

export type MatchConfidence = "high" | "medium" | "low";

export type DimesContentCluster = {
  id: string;
  fingerprint: string;
  primaryCaption: string | null;
  recipeName: string | null;
  contentType: ContentClassification;
  brandId: string;
  firstSeenAt: string;
  posts: DimesClusterPost[];
};

export type DimesClusterPost = {
  clusterId: string;
  postId: string;
  platform: DimesPlatform;
  matchConfidence: MatchConfidence;
  matchSignals: string[];
};

// ---------------------------------------------------------------------------
// Gap Analysis
// ---------------------------------------------------------------------------

export type PlatformPresence = {
  platform: DimesPlatform;
  status: "present" | "missing" | "unknown" | "not_applicable";
  postId: string | null;
  permalink: string | null;
  /** Operator-readable reason for this status determination */
  statusReason: string;
};

// ---------------------------------------------------------------------------
// Scan Evidence — per-platform scan outcome tracking
// ---------------------------------------------------------------------------

/**
 * Evidence about whether a platform was actually scanned for a brand.
 * This drives the distinction between:
 * - missing: scanned and content is absent
 * - unknown: scan failed, incomplete, or never ran
 */
export type ScanEvidence = {
  platform: DimesPlatform;
  /** Was this platform successfully scanned in the most recent run? */
  scanned: boolean;
  /** How many posts were fetched from this platform for this brand */
  postsFetched: number;
  /** Error message if scan failed, null if succeeded */
  error: string | null;
};

export type ContentGap = {
  cluster: DimesContentCluster;
  brand: DimesBrand;
  sourcePlatforms: PlatformPresence[];
  destinationPlatforms: PlatformPresence[];
  missingSourcePlatforms: DimesPlatform[];
  missingDestinations: DimesPlatform[];
  sourceLink: string | null;  // Legacy convenience field — prefer platform-level permalinks in sourcePlatforms/destinationPlatforms
};

// ---------------------------------------------------------------------------
// Scan Run
// ---------------------------------------------------------------------------

export type ScanType = "backfill" | "daily" | "full" | "fast";
export type ScanStatus = "running" | "complete" | "partial" | "error";

export type DimesScanRun = {
  id: string;
  type: ScanType;
  status: ScanStatus;
  startedAt: string;
  completedAt: string | null;
  accountsScanned: number;
  postsFound: number;
  newPostsIngested: number;
  clustersCreated: number;
  clustersUpdated: number;
  errors: ScanError[];
};

export type ScanError = {
  accountId: string;
  platform: DimesPlatform;
  handle: string;
  error: string;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Per-Account Scan State — durable cursor for fast scans
// ---------------------------------------------------------------------------

export type AccountScanState = {
  accountId: string;
  platform: DimesPlatform;
  brandId: string;
  lastSuccessfulScanAt: string | null;
  lastScanMode: ScanType | null;
  lastScanPostCount: number;
  latestPostPublishedAt: string | null;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Daily Report
// ---------------------------------------------------------------------------

export type DimesDailyReport = {
  date: string;
  scanRunId: string;
  brandReports: BrandDailyReport[];
  totalNewContent: number;
  totalGaps: number;
};

export type BrandDailyReport = {
  brand: DimesBrand;
  newPosts: DimesContentPost[];
  newGaps: ContentGap[];
  resolvedGaps: ContentGap[];
};
