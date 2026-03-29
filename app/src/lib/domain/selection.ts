/**
 * Dual benchmark selection and average-views calculation.
 *
 * Supports both Instagram Reels (ReelItem) and platform-agnostic
 * content items (ContentItem) for cross-platform benchmarking.
 *
 * Partitions content into two buckets:
 * - Organic: non-commercial content
 * - Commercial: content classified as sponsored/brand-affiliated
 *
 * Hard product rule:
 * A benchmark is valid ONLY when it has exactly MAX_BUCKET_SIZE (5) items.
 * If fewer are found, the bucket status is "insufficient" and no average
 * is computed or displayed.
 */
import type {
  ReelItem,
  ContentItem,
  ClassifiedReel,
  ClassifiedItem,
  BenchmarkBucket,
  BenchmarkStatus,
  ComparisonMetrics,
  Platform,
} from "./types";
import {
  classifyBenchmarkExclusion,
  checkBenchmarkEligibility,
} from "./normalize";

const MAX_BUCKET_SIZE = 5;

/**
 * Trial reel detection threshold.
 * A content item with views < TRIAL_THRESHOLD_RATIO × median is flagged as a trial.
 * Only applies when the account median >= MIN_MEDIAN_FOR_TRIAL_DETECTION.
 */
const TRIAL_THRESHOLD_RATIO = 0.02; // 2% of median
const MIN_MEDIAN_FOR_TRIAL_DETECTION = 10000; // 10K views minimum median

export type DualBenchmarkResult = {
  organic: BenchmarkBucket;
  commercial: BenchmarkBucket;
  comparison: ComparisonMetrics | null;
  excludedNonReelCount: number;
  excludedTestReelCount: number;
  totalReelCount: number;
};

/**
 * Compute the median of a sorted numeric array.
 */
function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Detect trial Reels by identifying view-count statistical anomalies.
 * Only used for Instagram (trial reels are an Instagram feature).
 */
export function detectTrialReels(reels: ReelItem[]): Set<string> {
  const flagged = new Set<string>();

  const viewCounts: number[] = [];
  for (const reel of reels) {
    if (typeof reel.views === "number") {
      viewCounts.push(reel.views);
    }
  }

  if (viewCounts.length < 3) return flagged;

  viewCounts.sort((a, b) => a - b);
  const median = computeMedian(viewCounts);

  if (median < MIN_MEDIAN_FOR_TRIAL_DETECTION) return flagged;

  const threshold = median * TRIAL_THRESHOLD_RATIO;

  for (const reel of reels) {
    if (typeof reel.views === "number" && reel.views < threshold) {
      flagged.add(reel.id);
    }
  }

  return flagged;
}

// ---------------------------------------------------------------------------
// Classify a ContentItem for the benchmark pipeline
// ---------------------------------------------------------------------------

function classifyContentItem(
  item: ContentItem
): ClassifiedItem {
  const eligibility = checkBenchmarkEligibility(item.caption);
  const classification = classifyBenchmarkExclusion(item.caption);

  // For TikTok: use provider-reported commercial metadata as a strong signal
  let isCommercial = classification.shouldExclude;
  let category = classification.exclusionCategory;
  const signals = [...classification.matchedSignals];

  if (item.commercialMetadata) {
    if (item.commercialMetadata.isPaidPartnership) {
      isCommercial = true;
      if (!category) category = "paid_partnership_tag";
      signals.push("provider:paid_partnership_tag");
    }
    if (item.commercialMetadata.isCreatorEarnsCommission) {
      isCommercial = true;
      if (!category) category = "paid_partnership_tag";
      signals.push("provider:creator_earns_commission");
    }
    if (item.commercialMetadata.isSponsored) {
      isCommercial = true;
      if (!category) category = "paid_partnership_tag";
      signals.push("provider:is_sponsored");
    }
  }

  return {
    ...item,
    isCommercial,
    classificationCategory: category,
    matchedSignals: signals,
    benchmarkEligible: eligibility.isEligible,
    ineligibilityCategory: eligibility.ineligibilityCategory,
    ineligibilitySignals: eligibility.matchedSignals,
  };
}

// ---------------------------------------------------------------------------
// Platform-agnostic dual benchmark pipeline using ContentItem
// ---------------------------------------------------------------------------

/**
 * Two-pass benchmark pipeline for ContentItem (platform-agnostic).
 *
 * For Instagram: filters by contentKind === "REELS", applies trial detection
 * For TikTok: all videos are eligible (no REELS filter needed)
 */
export function selectDualBenchmarkFromItems(
  items: ContentItem[],
  platform: Platform = "instagram"
): DualBenchmarkResult {
  let excludedNonReelCount = 0;
  let excludedTestReelCount = 0;

  // --- Filter by content kind (Instagram-specific: REELS only) ---
  const eligible: ContentItem[] = [];
  for (const item of items) {
    if (platform === "instagram" && item.contentKind !== "REELS") {
      excludedNonReelCount++;
    } else {
      eligible.push(item);
    }
  }

  // --- Trial detection (Instagram-only, needs ReelItem) ---
  const trialIds = new Set<string>();
  if (platform === "instagram") {
    // Convert to view-count array for trial detection
    const viewItems = eligible.filter(
      (i) => typeof i.views === "number"
    );
    if (viewItems.length >= 3) {
      const viewCounts = viewItems
        .map((i) => i.views!)
        .sort((a, b) => a - b);
      const median = computeMedian(viewCounts);
      if (median >= MIN_MEDIAN_FOR_TRIAL_DETECTION) {
        const threshold = median * TRIAL_THRESHOLD_RATIO;
        for (const item of eligible) {
          if (typeof item.views === "number" && item.views < threshold) {
            trialIds.add(item.id);
          }
        }
      }
    }
  }

  // --- Classify and partition ---
  const organicItems: ClassifiedItem[] = [];
  const commercialItems: ClassifiedItem[] = [];

  for (const item of eligible) {
    if (trialIds.has(item.id)) {
      excludedTestReelCount++;
      continue;
    }

    const classified = classifyContentItem(item);
    if (!classified.benchmarkEligible) {
      excludedTestReelCount++;
      continue;
    }

    if (classified.isCommercial) {
      commercialItems.push(classified);
    } else {
      organicItems.push(classified);
    }
  }

  // Sort newest first
  const sortNewest = (a: ClassifiedItem, b: ClassifiedItem) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

  organicItems.sort(sortNewest);
  commercialItems.sort(sortNewest);

  // Take up to MAX_BUCKET_SIZE
  const organicSlice = organicItems.slice(0, MAX_BUCKET_SIZE);
  const commercialSlice = commercialItems.slice(0, MAX_BUCKET_SIZE);

  // Build buckets — averages computed for any non-empty bucket
  const organic = buildBucketFromItems(organicSlice);
  const commercial = buildBucketFromItems(commercialSlice);

  // Comparison — valid whenever both buckets have averages
  const comparison =
    organic.averageViews !== null && commercial.averageViews !== null
      ? calculateComparison(organic, commercial)
      : null;

  const totalReelCount = organicItems.length + commercialItems.length;

  return {
    organic,
    commercial,
    comparison,
    excludedNonReelCount,
    excludedTestReelCount,
    totalReelCount,
  };
}

// ---------------------------------------------------------------------------
// Instagram backward-compatible pipeline (ReelItem-based)
// ---------------------------------------------------------------------------

/**
 * Original two-pass benchmark pipeline for Instagram ReelItems.
 * Preserved for backward compatibility with existing tests.
 */
export function selectDualBenchmark(items: ReelItem[]): DualBenchmarkResult {
  let excludedNonReelCount = 0;
  let excludedTestReelCount = 0;

  // --- Pass 1: Collect REELS and detect trial anomalies ---
  const reels: ReelItem[] = [];
  for (const item of items) {
    if (item.rawProductType !== "REELS") {
      excludedNonReelCount++;
    } else {
      reels.push(item);
    }
  }

  const trialReelIds = detectTrialReels(reels);

  // --- Pass 2: Filter, classify, partition ---
  const organicReels: ClassifiedReel[] = [];
  const commercialReels: ClassifiedReel[] = [];

  for (const reel of reels) {
    // Trial reel detection (view-count anomaly)
    if (trialReelIds.has(reel.id)) {
      excludedTestReelCount++;
      continue;
    }

    // Caption-based eligibility (test markers)
    const eligibility = checkBenchmarkEligibility(reel.caption);
    if (!eligibility.isEligible) {
      excludedTestReelCount++;
      continue;
    }

    // Classify organic vs commercial
    const classification = classifyBenchmarkExclusion(reel.caption);
    const classified: ClassifiedReel = {
      ...reel,
      isCommercial: classification.shouldExclude,
      classificationCategory: classification.exclusionCategory,
      matchedSignals: classification.matchedSignals,
      benchmarkEligible: true,
      ineligibilityCategory: null,
      ineligibilitySignals: [],
    };

    if (classified.isCommercial) {
      commercialReels.push(classified);
    } else {
      organicReels.push(classified);
    }
  }

  // Sort newest first
  const sortNewest = (a: ClassifiedReel, b: ClassifiedReel) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

  organicReels.sort(sortNewest);
  commercialReels.sort(sortNewest);

  // Take up to MAX_BUCKET_SIZE
  const organicEligible = organicReels.slice(0, MAX_BUCKET_SIZE);
  const commercialEligible = commercialReels.slice(0, MAX_BUCKET_SIZE);

  // Build buckets — averages computed for any non-empty bucket
  const organic = buildBucket(organicEligible);
  const commercial = buildBucket(commercialEligible);

  // Comparison — valid whenever both buckets have averages
  const comparison =
    organic.averageViews !== null && commercial.averageViews !== null
      ? calculateComparison(organic, commercial)
      : null;

  const totalReelCount = organicReels.length + commercialReels.length;

  return {
    organic,
    commercial,
    comparison,
    excludedNonReelCount,
    excludedTestReelCount,
    totalReelCount,
  };
}

// ---------------------------------------------------------------------------
// Bucket builders
// ---------------------------------------------------------------------------

/**
 * Build a benchmark bucket from ClassifiedReel items (Instagram backward compat).
 */
function buildBucket(reels: ClassifiedReel[]): BenchmarkBucket {
  if (reels.length === 0) {
    return {
      status: "empty",
      averageViews: null,
      sampleSize: 0,
      maxSampleSize: MAX_BUCKET_SIZE,
      reels: [],
      warnings: [],
    };
  }

  // Benchmark completeness requires items with REAL numeric views.
  const reelsWithViews = reels.filter(
    (r) => typeof r.views === "number"
  ).length;

  const status: BenchmarkStatus =
    reelsWithViews >= MAX_BUCKET_SIZE ? "complete" : "partial";

  const { averageViews, warnings } = calculateAverageViews(reels);

  if (status === "partial" && reels.length > 0) {
    warnings.push(
      `${reels.length} of ${MAX_BUCKET_SIZE} target Reels available — thin sample.`
    );
  }

  return {
    status,
    averageViews,
    sampleSize: reels.length,
    maxSampleSize: MAX_BUCKET_SIZE,
    reels,
    warnings,
  };
}

/**
 * Build a benchmark bucket from ClassifiedItem items (platform-agnostic).
 */
function buildBucketFromItems(items: ClassifiedItem[]): BenchmarkBucket {
  if (items.length === 0) {
    return {
      status: "empty",
      averageViews: null,
      sampleSize: 0,
      maxSampleSize: MAX_BUCKET_SIZE,
      reels: [],
      warnings: [],
    };
  }

  const isTikTok = items[0]?.platform === "tiktok";
  const contentLabel = isTikTok ? "videos" : "Reels";

  // Count items with real numeric views
  const itemsWithViews = items.filter(
    (i) => typeof i.views === "number"
  ).length;

  // For Instagram: also check caption completeness for classification validity
  const itemsFullyValid = isTikTok
    ? itemsWithViews
    : items.filter(
        (i) =>
          typeof i.views === "number" &&
          i.caption !== null &&
          i.caption !== undefined &&
          i.caption.trim().length > 0
      ).length;

  const status: BenchmarkStatus =
    itemsFullyValid >= MAX_BUCKET_SIZE ? "complete" : "partial";

  const { averageViews, warnings } = calculateAverageViews(items);

  if (status === "partial" && items.length > 0) {
    if (itemsWithViews < items.length) {
      warnings.push(
        `${itemsWithViews} of ${items.length} ${contentLabel} have view data.`
      );
    }
    if (!isTikTok && itemsFullyValid < itemsWithViews) {
      const noCaptionCount = items.filter(
        (i) => typeof i.views === "number" && (!i.caption || i.caption.trim().length === 0)
      ).length;
      if (noCaptionCount > 0) {
        warnings.push(
          `${noCaptionCount} ${contentLabel} missing captions — classification may be less accurate.`
        );
      }
    }
    warnings.push(
      `${items.length} of ${MAX_BUCKET_SIZE} target ${contentLabel} — thin sample.`
    );
  }

  return {
    status,
    averageViews,
    sampleSize: items.length,
    maxSampleSize: MAX_BUCKET_SIZE,
    reels: items,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Calculate comparison metrics between organic and commercial buckets.
 * Returns null if either bucket has no valid data.
 */
export function calculateComparison(
  organic: BenchmarkBucket,
  commercial: BenchmarkBucket
): ComparisonMetrics | null {
  if (
    organic.averageViews === null ||
    commercial.averageViews === null ||
    organic.sampleSize === 0 ||
    commercial.sampleSize === 0
  ) {
    return null;
  }

  const delta = organic.averageViews - commercial.averageViews;
  const adToOrganicRatio =
    organic.averageViews === 0
      ? 0
      : Math.round((commercial.averageViews / organic.averageViews) * 100) /
        100;

  let strongerBucket: ComparisonMetrics["strongerBucket"];
  if (delta > 0) strongerBucket = "organic";
  else if (delta < 0) strongerBucket = "commercial";
  else strongerBucket = "equal";

  return { delta, adToOrganicRatio, strongerBucket };
}

// ---------------------------------------------------------------------------
// Average calculation
// ---------------------------------------------------------------------------

/**
 * Calculate average views from a list of content items.
 * Reusable for both organic and commercial buckets, any platform.
 */
export function calculateAverageViews(
  reels: (ReelItem | ClassifiedReel | ContentItem | ClassifiedItem)[]
): {
  averageViews: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const numericViews: number[] = [];

  for (const reel of reels) {
    if (reel.views !== null && reel.views !== undefined) {
      numericViews.push(reel.views);
    } else {
      warnings.push(
        `Item ${reel.id} has no view count and was excluded from the average.`
      );
    }
  }

  if (numericViews.length === 0) {
    return { averageViews: null, warnings };
  }

  const sum = numericViews.reduce((acc, v) => acc + v, 0);
  const averageViews = Math.round(sum / numericViews.length);

  return { averageViews, warnings };
}

// ---------------------------------------------------------------------------
// Legacy wrapper for backward compat
// ---------------------------------------------------------------------------
export type SelectionResult = {
  eligible: ReelItem[];
  excludedSponsoredCount: number;
  excludedNonReelCount: number;
};

export function selectEligibleReels(items: ReelItem[]): SelectionResult {
  const result = selectDualBenchmark(items);
  return {
    eligible: result.organic.reels as ClassifiedReel[],
    excludedSponsoredCount: result.commercial.sampleSize,
    excludedNonReelCount: result.excludedNonReelCount,
  };
}
