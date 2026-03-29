/**
 * Instagram Carousel Visibility — Capability-Gated Model
 *
 * Three truth states:
 *
 * 1. exact_connected  — Official Meta Media Insights for connected creator accounts.
 *                       Reads views/reach at carousel container level (not child-media).
 *                       "Album metrics: Insights data is not available for any media
 *                        within an Instagram Media album." — Meta docs.
 *
 * 2. estimated        — Multi-signal model for arbitrary public influencers.
 *                       Combines follower prior + engagement inversion + account calibration
 *                       + age normalization. Range-based, confidence-scored.
 *
 * 3. unavailable      — Insufficient data for any estimate.
 */

// ---------------------------------------------------------------------------
// Shared types (reuse some patterns from story-visibility)
// ---------------------------------------------------------------------------

export type CarouselSourceMode =
  | "exact_connected"
  | "observed_vendor"
  | "estimated"
  | "unavailable";

export type CarouselConfidence = "low" | "medium" | "high";

export type CarouselSourceProvider =
  | "meta"
  | "vendor"
  | "heuristic"
  | "none";

export type EstimateRange = {
  low: number;
  high: number;
};

// ---------------------------------------------------------------------------
// Per-post carousel estimate
// ---------------------------------------------------------------------------

export type CarouselItemEstimate = {
  mediaId: string;
  permalink: string | null;
  timestamp: string;
  sourceMode: CarouselSourceMode;

  /** Exact values (only in exact_connected) */
  exactViews: number | null;
  exactReach: number | null;

  /** Estimated ranges (only in estimated mode) */
  estimatedViews: EstimateRange | null;
  estimatedReach: EstimateRange | null;

  /** Public engagement counts used as estimation inputs */
  likeCount: number | null;
  commentsCount: number | null;

  /** Post age in hours at time of estimation */
  postAgeHours: number | null;

  confidence: CarouselConfidence;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Aggregate carousel visibility for an account
// ---------------------------------------------------------------------------

export type CarouselVisibility = {
  sourceMode: CarouselSourceMode;
  sourceProvider: CarouselSourceProvider;
  confidence: CarouselConfidence;

  /** Number of carousel posts analyzed */
  carouselCount: number;

  /** Aggregate estimated views across carousels */
  aggregateEstimatedViews: EstimateRange | null;

  /** Aggregate estimated reach across carousels */
  aggregateEstimatedReach: EstimateRange | null;

  /** Per-post breakdown (top N) */
  items: CarouselItemEstimate[];

  limitations: string[];
  modelVersion: string | null;
};

// ---------------------------------------------------------------------------
// Tier-based carousel view rate benchmarks
// ---------------------------------------------------------------------------

/**
 * Carousel posts typically get lower distribution than Reels.
 * Industry data suggests carousel reach is ~30-60% of Reel reach for same account.
 *
 * View rates below are views-per-follower for carousel posts.
 */
const CAROUSEL_TIER_BENCHMARKS = [
  { maxFollowers: 1_000,     viewRate: 0.30,  reachMultiplier: 1.10, confidence: "medium" as CarouselConfidence },
  { maxFollowers: 5_000,     viewRate: 0.20,  reachMultiplier: 1.10, confidence: "medium" as CarouselConfidence },
  { maxFollowers: 10_000,    viewRate: 0.15,  reachMultiplier: 1.15, confidence: "medium" as CarouselConfidence },
  { maxFollowers: 50_000,    viewRate: 0.10,  reachMultiplier: 1.15, confidence: "low"    as CarouselConfidence },
  { maxFollowers: 100_000,   viewRate: 0.08,  reachMultiplier: 1.20, confidence: "low"    as CarouselConfidence },
  { maxFollowers: 500_000,   viewRate: 0.06,  reachMultiplier: 1.20, confidence: "low"    as CarouselConfidence },
  { maxFollowers: Infinity,  viewRate: 0.04,  reachMultiplier: 1.25, confidence: "low"    as CarouselConfidence },
];

/**
 * Expected engagement rates for carousel posts by tier.
 * Used for engagement inversion (backsolving views from likes/comments).
 */
const ENGAGEMENT_RATE_BENCHMARKS = [
  { maxFollowers: 1_000,     likeRate: 0.08,  commentRate: 0.005 },
  { maxFollowers: 5_000,     likeRate: 0.06,  commentRate: 0.004 },
  { maxFollowers: 10_000,    likeRate: 0.045, commentRate: 0.003 },
  { maxFollowers: 50_000,    likeRate: 0.03,  commentRate: 0.002 },
  { maxFollowers: 100_000,   likeRate: 0.025, commentRate: 0.0015 },
  { maxFollowers: 500_000,   likeRate: 0.02,  commentRate: 0.001 },
  { maxFollowers: Infinity,  likeRate: 0.015, commentRate: 0.0008 },
];

/** Carousel-to-Reel view ratio (carousels typically get 30-60% of Reel views) */
const CAROUSEL_TO_REEL_RATIO = { low: 0.30, central: 0.45, high: 0.60 };

function getCarouselTier(followerCount: number) {
  return CAROUSEL_TIER_BENCHMARKS.find((t) => followerCount <= t.maxFollowers)
    ?? CAROUSEL_TIER_BENCHMARKS[CAROUSEL_TIER_BENCHMARKS.length - 1];
}

function getEngagementTier(followerCount: number) {
  return ENGAGEMENT_RATE_BENCHMARKS.find((t) => followerCount <= t.maxFollowers)
    ?? ENGAGEMENT_RATE_BENCHMARKS[ENGAGEMENT_RATE_BENCHMARKS.length - 1];
}

// ---------------------------------------------------------------------------
// Multi-signal carousel estimator
// ---------------------------------------------------------------------------

export type CarouselEstimationInput = {
  mediaId: string;
  permalink: string | null;
  timestamp: string;
  likeCount: number | null;
  commentsCount: number | null;
  followerCount: number;
  avgReelViews: number | null;
  /** Current time for age calculation */
  now?: Date;
};

/**
 * Estimate views for a single carousel post using multi-signal model.
 *
 * Signal families:
 * A. Follower prior (tier-based baseline)
 * B. Account calibration (from observed Reel performance × carousel-to-reel ratio)
 * C. Engagement inversion (backsolve from likes/comments)
 * D. Age normalization (widen uncertainty for recent posts)
 *
 * Combination: weighted geometric mean in log-space with disagreement penalty.
 */
export function estimateCarouselItemViews(
  input: CarouselEstimationInput
): CarouselItemEstimate {
  const {
    mediaId, permalink, timestamp, likeCount, commentsCount,
    followerCount, avgReelViews,
  } = input;
  const now = input.now ?? new Date();

  const tier = getCarouselTier(followerCount);
  const engTier = getEngagementTier(followerCount);

  // --- Signal A: Follower prior ---
  const followerPrior = followerCount * tier.viewRate;

  // --- Signal B: Account calibration from Reels ---
  let accountCalibration: number | null = null;
  if (avgReelViews !== null && avgReelViews > 0) {
    accountCalibration = avgReelViews * CAROUSEL_TO_REEL_RATIO.central;
  }

  // --- Signal C: Engagement inversion ---
  let likeInversion: number | null = null;
  let commentInversion: number | null = null;

  if (typeof likeCount === "number" && likeCount > 0 && engTier.likeRate > 0) {
    likeInversion = likeCount / engTier.likeRate;
  }

  if (typeof commentsCount === "number" && commentsCount > 0 && engTier.commentRate > 0) {
    commentInversion = commentsCount / engTier.commentRate;
  }

  // --- Collect valid estimates with weights ---
  const estimates: { value: number; weight: number; label: string }[] = [];

  estimates.push({ value: followerPrior, weight: 1.0, label: "follower_prior" });

  if (accountCalibration !== null) {
    estimates.push({ value: accountCalibration, weight: 2.0, label: "account_calibration" });
  }

  if (likeInversion !== null) {
    estimates.push({ value: likeInversion, weight: 1.5, label: "like_inversion" });
  }

  if (commentInversion !== null) {
    // Comments are noisier → lower weight
    estimates.push({ value: commentInversion, weight: 0.8, label: "comment_inversion" });
  }

  // --- Combine via weighted geometric mean in log-space ---
  let totalWeight = 0;
  let logSum = 0;

  for (const est of estimates) {
    const safeValue = Math.max(est.value, 1);
    logSum += est.weight * Math.log(safeValue);
    totalWeight += est.weight;
  }

  const centralEstimate = totalWeight > 0
    ? Math.exp(logSum / totalWeight)
    : followerPrior;

  // --- Disagreement penalty ---
  // If estimates diverge widely, widen the range and lower confidence
  let disagreementFactor = 1.0;
  if (estimates.length >= 2) {
    const logValues = estimates.map((e) => Math.log(Math.max(e.value, 1)));
    const logMean = logValues.reduce((a, b) => a + b, 0) / logValues.length;
    const logVariance = logValues.reduce((a, v) => a + (v - logMean) ** 2, 0) / logValues.length;
    const logStd = Math.sqrt(logVariance);
    // If log-std > 1.0 (estimates differ by ~3x), penalize
    disagreementFactor = Math.min(logStd, 2.0);
  }

  // --- Signal D: Age normalization ---
  const postDate = new Date(timestamp);
  const ageHours = Math.max(0, (now.getTime() - postDate.getTime()) / (1000 * 60 * 60));

  let ageFactor = 1.0;
  if (ageHours < 6) {
    ageFactor = 2.0;   // Very recent: double uncertainty
  } else if (ageHours < 24) {
    ageFactor = 1.5;   // Less than a day
  } else if (ageHours < 48) {
    ageFactor = 1.2;   // Still accumulating
  }

  // --- Build range ---
  // Base uncertainty: ±35%, widened by disagreement and age
  const uncertaintyMultiplier = 0.35 * (1 + disagreementFactor * 0.3) * ageFactor;
  const viewsLow = Math.max(1, Math.round(centralEstimate * (1 - uncertaintyMultiplier)));
  const viewsHigh = Math.round(centralEstimate * (1 + uncertaintyMultiplier));

  const reachLow = Math.round(viewsLow * tier.reachMultiplier);
  const reachHigh = Math.round(viewsHigh * tier.reachMultiplier);

  // --- Confidence scoring ---
  let confidence: CarouselConfidence = tier.confidence;

  // Upgrade to medium if we have engagement signals AND account calibration
  if (accountCalibration !== null && (likeInversion !== null || commentInversion !== null)) {
    confidence = "medium";
  }

  // Downgrade if high disagreement
  if (disagreementFactor > 1.0) {
    confidence = "low";
  }

  // Downgrade if very recent
  if (ageHours < 6) {
    confidence = "low";
  }

  // Build limitations
  const limitations: string[] = [];

  if (avgReelViews === null) {
    limitations.push("No Reel performance data for account calibration.");
  }
  if (likeCount === null && commentsCount === null) {
    limitations.push("No engagement data available — estimate relies on follower prior only.");
  }
  if (ageHours < 48) {
    limitations.push("Post is less than 48 hours old — engagement may still be accumulating.");
  }
  if (disagreementFactor > 1.0) {
    limitations.push("Estimation signals disagree — range is widened to reflect uncertainty.");
  }

  return {
    mediaId,
    permalink,
    timestamp,
    sourceMode: "estimated",
    exactViews: null,
    exactReach: null,
    estimatedViews: { low: viewsLow, high: viewsHigh },
    estimatedReach: { low: reachLow, high: reachHigh },
    likeCount,
    commentsCount,
    postAgeHours: Math.round(ageHours),
    confidence,
    limitations,
  };
}

// ---------------------------------------------------------------------------
// Aggregate estimator — runs across all carousel items for an account
// ---------------------------------------------------------------------------

export type AggregateEstimationInput = {
  items: {
    mediaId: string;
    permalink: string | null;
    timestamp: string;
    likeCount: number | null;
    commentsCount: number | null;
  }[];
  followerCount: number | null;
  avgReelViews: number | null;
  now?: Date;
};

/**
 * Estimate carousel visibility across all carousel posts for an account.
 */
export function estimateCarouselVisibility(
  input: AggregateEstimationInput
): CarouselVisibility {
  const { items, followerCount, avgReelViews } = input;
  const now = input.now ?? new Date();

  // Guard: no follower data → unavailable
  if (followerCount === null || followerCount <= 0) {
    return makeCarouselUnavailable(
      "Follower count not available. Cannot estimate carousel visibility."
    );
  }

  // Guard: no carousel items
  if (items.length === 0) {
    return makeCarouselUnavailable(
      "No carousel posts found in recent content."
    );
  }

  // Estimate each carousel item
  const estimates: CarouselItemEstimate[] = items.map((item) =>
    estimateCarouselItemViews({
      ...item,
      followerCount,
      avgReelViews,
      now,
    })
  );

  // Aggregate ranges
  const totalViewsLow = estimates.reduce(
    (sum, e) => sum + (e.estimatedViews?.low ?? 0), 0
  );
  const totalViewsHigh = estimates.reduce(
    (sum, e) => sum + (e.estimatedViews?.high ?? 0), 0
  );
  const totalReachLow = estimates.reduce(
    (sum, e) => sum + (e.estimatedReach?.low ?? 0), 0
  );
  const totalReachHigh = estimates.reduce(
    (sum, e) => sum + (e.estimatedReach?.high ?? 0), 0
  );

  // Average per-post for display
  const avgViewsLow = Math.round(totalViewsLow / estimates.length);
  const avgViewsHigh = Math.round(totalViewsHigh / estimates.length);
  const avgReachLow = Math.round(totalReachLow / estimates.length);
  const avgReachHigh = Math.round(totalReachHigh / estimates.length);

  // Worst-case confidence
  const confRank = { low: 0, medium: 1, high: 2 };
  const worstConf = estimates.reduce(
    (worst, e) => (confRank[e.confidence] < confRank[worst] ? e.confidence : worst),
    "high" as CarouselConfidence
  );

  const limitations: string[] = [
    `Estimated from ${estimates.length} carousel post${estimates.length > 1 ? "s" : ""}.`,
    "Carousel views are not available via public Meta API — values are modeled.",
  ];

  return {
    sourceMode: "estimated",
    sourceProvider: "heuristic",
    confidence: worstConf,
    carouselCount: estimates.length,
    aggregateEstimatedViews: { low: avgViewsLow, high: avgViewsHigh },
    aggregateEstimatedReach: { low: avgReachLow, high: avgReachHigh },
    items: estimates.slice(0, 5), // Top 5 for UI
    limitations,
    modelVersion: "carousel-v1",
  };
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

export function makeCarouselUnavailable(reason: string): CarouselVisibility {
  return {
    sourceMode: "unavailable",
    sourceProvider: "none",
    confidence: "low",
    carouselCount: 0,
    aggregateEstimatedViews: null,
    aggregateEstimatedReach: null,
    items: [],
    limitations: [reason],
    modelVersion: null,
  };
}

export function makeExactCarousel(metrics: {
  views: number;
  reach?: number;
  mediaId: string;
  permalink: string;
  timestamp: string;
}): CarouselItemEstimate {
  return {
    mediaId: metrics.mediaId,
    permalink: metrics.permalink,
    timestamp: metrics.timestamp,
    sourceMode: "exact_connected",
    exactViews: metrics.views,
    exactReach: metrics.reach ?? null,
    estimatedViews: null,
    estimatedReach: null,
    likeCount: null,
    commentsCount: null,
    postAgeHours: null,
    confidence: "high",
    limitations: [],
  };
}
