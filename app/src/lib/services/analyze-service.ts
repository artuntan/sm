/**
 * Analyze Service — Shared creator analysis logic
 *
 * Extracted from analyze, analyze-all, and analyze-single routes
 * to eliminate duplication and centralize the analysis pipeline.
 *
 * The 7-step pipeline:
 *   1. Normalize + validate username
 *   2. Check durable cache (unless forceRefresh)
 *   3. Fetch from provider if not cached
 *   4. Cache the raw provider result
 *   5. Ingest items into media warehouse
 *   6. Update adaptive scan profile
 *   7. Run benchmark selection + visibility estimation
 */

import crypto from "crypto";
import { normalizeUsername } from "@/lib/domain/normalize";
import {
  selectDualBenchmark,
  selectDualBenchmarkFromItems,
} from "@/lib/domain/selection";
import { estimateStoryVisibility } from "@/lib/domain/story-visibility";
import { estimateCarouselVisibility } from "@/lib/domain/carousel-visibility";
import type {
  Platform,
  PlatformAnalysis,
  ProviderResult,
  ProviderSource,
} from "@/lib/domain/types";
import { getProvider } from "@/lib/providers/factory";
import { ProviderError } from "@/lib/providers/interface";
import { db } from "@/lib/db";
import { analysisRun } from "@/lib/db/schema";
import type {
  BatchHandleJob,
  BatchImportRow,
  BatchRowResult,
} from "@/lib/domain/batch-types";
import { computeBatchSummary } from "@/lib/domain/batch-queue";
import {
  getCachedProviderResult,
  cacheProviderResult,
} from "@/lib/services/scan-cache-service";
import { ingestContentItems } from "@/lib/services/media-warehouse-service";
import { updateScanProfile } from "@/lib/services/adaptive-scan-service";
import { ensureIdentity } from "@/lib/services/identity-service";

// ---------------------------------------------------------------------------
// Username validation
// ---------------------------------------------------------------------------

/**
 * Platform-specific username format validation.
 *
 * Instagram: [a-z0-9._]{1,30}
 * TikTok:    [a-z0-9._]{1,24}
 *
 * Returns an error message string if invalid, null if valid.
 */
export function validateUsername(
  username: string,
  platform: Platform,
): string | null {
  if (platform === "tiktok") {
    if (!/^[a-z0-9._]{1,24}$/.test(username)) {
      return "Invalid TikTok username format. Use only letters, numbers, dots, and underscores.";
    }
  } else {
    if (!/^[a-z0-9._]{1,30}$/.test(username)) {
      return "Invalid Instagram username format. Use only letters, numbers, dots, and underscores.";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Limitations helper
// ---------------------------------------------------------------------------

/**
 * Build provider-source limitations for a given platform and source.
 * analyze-all and analyze-single share this exact list; /api/analyze has
 * a slightly more verbose variant. Both converge here.
 */
export function getLimitations(
  platform: Platform,
  source: ProviderSource | string,
): string[] {
  const limitations: string[] = [];

  if (platform === "instagram") {
    if (source === "mock") {
      limitations.push(
        "Simulated mock data. Set META_ACCESS_TOKEN + META_IG_USER_ID for live Meta Graph API data.",
      );
    } else if (source === "meta") {
      limitations.push(
        "Live data via Meta Graph API. View counts available for Reels on professional/creator accounts.",
      );
    } else if (source === "instagram-apify") {
      limitations.push(
        "Apify fallback (Meta credentials not configured). View counts are real video play counts. Caption availability may vary.",
      );
    }
    // Meta source: no limitations needed (official API)
  } else if (platform === "tiktok") {
    if (source === "tiktok-mock") {
      limitations.push(
        "Simulated mock data. Set APIFY_API_TOKEN for live data.",
      );
    } else if (source === "tiktok-apify") {
      limitations.push(
        "Live data via Apify. Engagement metrics are real.",
      );
    } else if (source === "tiktok-research") {
      limitations.push(
        "TikTok Research API. Metrics may have slight delays.",
      );
    }
  }

  return limitations;
}

// ---------------------------------------------------------------------------
// Benchmark pipeline
// ---------------------------------------------------------------------------

/**
 * Run the platform-appropriate benchmark selection pipeline.
 *
 * Instagram: prefers legacy ReelItem[] path via selectDualBenchmark when
 * providerResult.reels is present; falls back to selectDualBenchmarkFromItems.
 * TikTok: always uses selectDualBenchmarkFromItems.
 */
export function runBenchmarkPipeline(
  providerResult: ProviderResult,
  platform: Platform,
) {
  if (platform === "tiktok") {
    return selectDualBenchmarkFromItems(providerResult.items, platform);
  }
  // Instagram backward-compatible path
  return providerResult.reels
    ? selectDualBenchmark(providerResult.reels)
    : selectDualBenchmarkFromItems(providerResult.items, platform);
}

// ---------------------------------------------------------------------------
// Instagram visibility estimations
// ---------------------------------------------------------------------------

/**
 * Compute story + carousel visibility estimates for Instagram.
 * Returns nulls for non-Instagram platforms.
 */
export function computeVisibilityEstimates(
  providerResult: ProviderResult,
  platform: Platform,
  organicAverageViews: number | null,
) {
  if (platform !== "instagram") {
    return { storyVisibility: null, carouselVisibility: null };
  }

  const followerCount = providerResult.profile?.followerCount ?? null;

  // Story visibility
  const storyVisibility = estimateStoryVisibility(
    followerCount,
    organicAverageViews,
  );

  // Carousel visibility
  let carouselVisibility = null;
  const carouselItems = providerResult.items.filter(
    (item) => item.rawMetadata?.rawMediaType === "CAROUSEL_ALBUM",
  );
  if (carouselItems.length > 0) {
    carouselVisibility = estimateCarouselVisibility({
      items: carouselItems.map((item) => ({
        mediaId: item.id,
        permalink: item.permalink,
        timestamp: item.timestamp,
        likeCount: item.likeCount ?? null,
        commentsCount: item.commentsCount ?? null,
      })),
      followerCount,
      avgReelViews: organicAverageViews,
    });
  }

  return { storyVisibility, carouselVisibility };
}

// ---------------------------------------------------------------------------
// Cache-or-fetch
// ---------------------------------------------------------------------------

export type FetchOutcome = {
  providerResult: ProviderResult;
  cacheHit: boolean;
  /** Human-readable cache info string (empty if fresh fetch) */
  cacheInfo: string;
};

/**
 * Resolve provider data: check durable cache first, fetch if miss.
 * On fresh fetch, caches the result before returning.
 */
export async function resolveProviderData(
  platform: Platform,
  username: string,
  forceRefresh: boolean,
): Promise<FetchOutcome> {
  if (!forceRefresh) {
    const cached = await getCachedProviderResult(platform, username);
    if (cached) {
      return {
        providerResult: cached.result,
        cacheHit: true,
        cacheInfo: `Cached (${cached.freshness}, ${Math.round(cached.ageMs / 60000)}m ago)`,
      };
    }
  }

  const provider = getProvider(platform);
  const providerResult = await provider.fetchRecentMedia(username);
  await cacheProviderResult(platform, username, providerResult);

  return {
    providerResult,
    cacheHit: false,
    cacheInfo: "",
  };
}

// ---------------------------------------------------------------------------
// Side-effect pipeline (warehouse + scan profile)
// ---------------------------------------------------------------------------

export type IngestionOutcome = {
  newItems: number;
  updatedItems: number;
  unchangedItems: number;
};

/**
 * Persist items to media warehouse and update adaptive scan profile.
 * Both steps are fire-and-forget-safe — analysis result is valid even
 * if these fail, but we let errors propagate for observability.
 */
export async function persistAndUpdateProfile(
  providerResult: ProviderResult,
  platform: Platform,
  username: string,
): Promise<void> {
  // M2: Ingest content items into warehouse
  const warehouseResult = await ingestContentItems(
    providerResult.items,
    platform,
    username,
  );
  if (warehouseResult.newItems > 0 || warehouseResult.updatedItems > 0) {
    console.log(
      `[M2] ${platform}/@${username}: +${warehouseResult.newItems} new, ` +
        `${warehouseResult.updatedItems} updated, ${warehouseResult.unchangedItems} unchanged`,
    );
  }

  // M3: Update scan profile (posting frequency -> adaptive TTL)
  const scanProfile = await updateScanProfile(
    platform,
    username,
    providerResult,
  );
  console.log(
    `[M3] ${platform}/@${username}: ${scanProfile.postsPerWeek} posts/wk, ` +
      `tier=${scanProfile.frequencyTier}, ttl=${Math.round(scanProfile.adaptiveTtlMs / 3600000)}h`,
  );
}

// ---------------------------------------------------------------------------
// Empty result factories
// ---------------------------------------------------------------------------

const EMPTY_BUCKET = {
  status: "empty" as const,
  averageViews: null,
  sampleSize: 0,
  maxSampleSize: 5,
  reels: [],
  warnings: [],
};

/**
 * Build a PlatformAnalysis error result for validation failures or
 * provider errors. Used when the pipeline cannot produce benchmark data.
 */
export function buildErrorResult(
  platform: Platform,
  username: string,
  errorMessage: string,
): PlatformAnalysis {
  return {
    platform,
    username,
    profile: null,
    organic: { ...EMPTY_BUCKET },
    commercial: { ...EMPTY_BUCKET },
    comparison: null,
    source: platform === "tiktok" ? "tiktok-mock" : "mock",
    totalContentCount: 0,
    limitations: [errorMessage],
    status: "error",
    error: errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Primary entry point: analyzeCreator
// ---------------------------------------------------------------------------

export type AnalyzeCreatorOptions = {
  forceRefresh?: boolean;
  pairedWith?: string | null;
};

/**
 * Full creator analysis pipeline. Performs:
 *
 *   1. Normalize + validate username
 *   2. Check durable cache (unless forceRefresh)
 *   3. Fetch from provider if not cached
 *   4. Cache the raw provider result
 *   5. Ingest items into media warehouse + update scan profile
 *   6. Run benchmark selection
 *   7. Compute visibility estimates (Instagram only)
 *
 * Returns a PlatformAnalysis object suitable for direct use in
 * /api/analyze-single or as a building block in /api/analyze-all.
 *
 * For /api/analyze (which returns AnalyzeResult), the route maps
 * from PlatformAnalysis fields into AnalyzeResult shape.
 *
 * Errors are caught and returned as status:"error" results rather
 * than thrown, so callers can safely run multiple analyses concurrently
 * with Promise.allSettled without one failure destroying the batch.
 */
export async function analyzeCreator(
  platform: Platform,
  rawUsername: string,
  options: AnalyzeCreatorOptions = {},
): Promise<PlatformAnalysis> {
  const { forceRefresh = false } = options;
  const username = normalizeUsername(rawUsername);

  // Step 1: Validate username format
  const validationError = validateUsername(username, platform);
  if (validationError) {
    return buildErrorResult(platform, username, validationError);
  }

  try {
    // Step 2-4: Cache check -> provider fetch -> cache store
    const { providerResult, cacheHit, cacheInfo } =
      await resolveProviderData(platform, username, forceRefresh);

    // Step 5: Warehouse ingestion + scan profile update
    await persistAndUpdateProfile(providerResult, platform, username);

    // Step 6: Benchmark selection
    const benchmark = runBenchmarkPipeline(providerResult, platform);

    // Step 7: Limitations
    const limitations = getLimitations(platform, providerResult.source);
    if (cacheHit) {
      limitations.push(cacheInfo);
    }

    const hasContent =
      benchmark.organic.sampleSize > 0 ||
      benchmark.commercial.sampleSize > 0;

    // Step 8: Visibility estimates (Instagram only)
    const { storyVisibility, carouselVisibility } =
      computeVisibilityEstimates(
        providerResult,
        platform,
        benchmark.organic.averageViews,
      );

    return {
      platform,
      username,
      profile: providerResult.profile || null,
      organic: benchmark.organic,
      commercial: benchmark.commercial,
      comparison: benchmark.comparison,
      storyVisibility,
      carouselVisibility,
      source: providerResult.source,
      totalContentCount: providerResult.totalFetched,
      limitations,
      status: hasContent ? "ok" : "partial",
    };
  } catch (err) {
    const message =
      err instanceof ProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error";

    return buildErrorResult(platform, username, message);
  }
}

function normalizeIdentityPair(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeUsername(value);
  return normalized.length > 0 ? normalized : null;
}

export async function analyzeCreatorWithIdentity(
  platform: Platform,
  rawUsername: string,
  options: AnalyzeCreatorOptions = {},
): Promise<PlatformAnalysis> {
  const result = await analyzeCreator(platform, rawUsername, options);

  try {
    const normalizedUsername = normalizeUsername(rawUsername);
    const pairedWith = normalizeIdentityPair(options.pairedWith);
    const instagramUsername =
      platform === "instagram" ? normalizedUsername : pairedWith;
    const tiktokUsername =
      platform === "tiktok" ? normalizedUsername : pairedWith;

    await ensureIdentity(instagramUsername, tiktokUsername);
  } catch (error) {
    console.error("[identity] Failed to update creator identity", {
      platform,
      username: rawUsername,
      pairedWith: options.pairedWith ?? null,
      error,
    });
  }

  return result;
}

export type PersistBatchAnalysisRunInput = {
  teamId: string;
  userId: string;
  rows: BatchImportRow[];
  rowResults: BatchRowResult[];
  status?: "complete" | "partial" | "error";
  startedAt: string | Date;
  completedAt?: string | Date | null;
  schemaVersion?: number;
};

function resolveBatchRunStatus(
  rowResults: BatchRowResult[],
): "complete" | "partial" | "error" {
  if (rowResults.length === 0) {
    return "error";
  }

  if (rowResults.every((rowResult) => rowResult.status === "error")) {
    return "error";
  }

  if (rowResults.every((rowResult) => rowResult.status === "complete")) {
    return "complete";
  }

  return "partial";
}

function toDate(value: string | Date | null | undefined): Date {
  if (value instanceof Date) {
    return value;
  }

  return value ? new Date(value) : new Date();
}

export async function persistBatchAnalysisRun(
  input: PersistBatchAnalysisRunInput,
): Promise<{ runId: string }> {
  const handleJobs = new Map<string, BatchHandleJob>(
    input.rowResults.flatMap((rowResult) => {
      const pairs: [string, BatchHandleJob][] = [];

      if (rowResult.row.instagramUsername) {
        pairs.push([
          `instagram:${rowResult.row.instagramUsername}`,
          {
            platform: "instagram",
            username: rowResult.row.instagramUsername,
            status: rowResult.instagram
              ? rowResult.instagram.status === "error"
                ? "error"
                : "success"
              : "queued",
            attempts: 1,
            maxAttempts: 1,
            error: rowResult.instagram?.error ?? null,
            result: rowResult.instagram,
          },
        ]);
      }

      if (rowResult.row.tiktokUsername) {
        pairs.push([
          `tiktok:${rowResult.row.tiktokUsername}`,
          {
            platform: "tiktok",
            username: rowResult.row.tiktokUsername,
            status: rowResult.tiktok
              ? rowResult.tiktok.status === "error"
                ? "error"
                : "success"
              : "queued",
            attempts: 1,
            maxAttempts: 1,
            error: rowResult.tiktok?.error ?? null,
            result: rowResult.tiktok,
          },
        ]);
      }

      return pairs;
    })
  );
  const summary = computeBatchSummary(
    input.rows,
    handleJobs
  );

  const runId = crypto.randomUUID();

  await db.insert(analysisRun).values({
    id: runId,
    teamId: input.teamId,
    userId: input.userId,
    status: input.status ?? resolveBatchRunStatus(input.rowResults),
    totalRows: summary.totalRows,
    completeRows: summary.completeRows,
    partialRows: summary.partialRows,
    errorRows: summary.errorRows,
    inputSummary: input.rows.map((row) => ({
      instagram: row.instagramUsername,
      tiktok: row.tiktokUsername,
      label: row.label,
    })),
    resultSnapshot: input.rowResults.map((rowResult) => ({
      _v: 2,
      row: {
        id: rowResult.row.id,
        instagramUsername: rowResult.row.instagramUsername,
        tiktokUsername: rowResult.row.tiktokUsername,
        label: rowResult.row.label,
      },
      status: rowResult.status,
      instagram: rowResult.instagram ?? null,
      tiktok: rowResult.tiktok ?? null,
      warnings: rowResult.warnings,
    })),
    schemaVersion: input.schemaVersion ?? 2,
    startedAt: toDate(input.startedAt),
    completedAt: toDate(input.completedAt ?? new Date()),
  });

  return { runId };
}
