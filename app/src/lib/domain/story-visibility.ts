/**
 * Instagram Story Visibility — Capability-Gated Model
 *
 * Three truth states for story visibility data:
 *
 * 1. exact_connected  — Official Meta Story Insights for creator-authorized accounts.
 *                       Requires the creator's own IG account to be connected via Instagram Login.
 *                       Provides exact views, reach, navigation, replies, profile_activity.
 *                       Subject to 24-hour availability window after story expiry.
 *
 * 2. observed_vendor  — Third-party vendor-tracked story data. Not Meta-official.
 *                       Source-labeled, compliance-reviewed, optional integration.
 *
 * 3. estimated        — Heuristic model using follower count + engagement signals.
 *                       Always range-based and confidence-labeled. Never exact.
 *
 * 4. unavailable      — No data available. Explains why.
 */

// ---------------------------------------------------------------------------
// Source and confidence enums
// ---------------------------------------------------------------------------

export type StorySourceMode =
  | "exact_connected"
  | "observed_vendor"
  | "estimated"
  | "unavailable";

export type StoryConfidence = "low" | "medium" | "high";

export type StorySourceProvider =
  | "meta"           // Official Meta Story Insights (exact_connected)
  | "vendor"         // Generic vendor placeholder
  | "heuristic"      // Built-in estimation model
  | "none";          // No provider

// ---------------------------------------------------------------------------
// Metric types
// ---------------------------------------------------------------------------

/** A single metric value with provenance */
export type StoryMetricValue = {
  value: number | null;
  isExact: boolean;
};

/** An estimated range for a metric */
export type StoryEstimateRange = {
  low: number;
  high: number;
};

// ---------------------------------------------------------------------------
// Core Story Visibility model
// ---------------------------------------------------------------------------

export type StoryVisibility = {
  /** Which truth state this data represents */
  sourceMode: StorySourceMode;

  /** Which provider sourced this data */
  sourceProvider: StorySourceProvider;

  /** Confidence in the data quality */
  confidence: StoryConfidence;

  // --- Exact metrics (only populated in exact_connected or observed_vendor) ---

  /** Exact story views (null if estimated or unavailable) */
  views: StoryMetricValue | null;

  /** Exact reach (null if estimated or unavailable) */
  reach: StoryMetricValue | null;

  /** Navigation actions (taps forward/back/exit) */
  navigation: StoryMetricValue | null;

  /** Direct replies to the story */
  replies: StoryMetricValue | null;

  /** Profile visits from the story */
  profileActivity: StoryMetricValue | null;

  // --- Estimated ranges (only populated in estimated mode) ---

  /** Estimated viewer range */
  estimatedViewers: StoryEstimateRange | null;

  /** Estimated reach range */
  estimatedReach: StoryEstimateRange | null;

  // --- Metadata ---

  /** Story media ID if known */
  storyMediaId: string | null;

  /** When the story was published */
  storyPublishedAt: string | null;

  /** Whether the story has expired (>24h) */
  isExpired: boolean | null;

  /** Human-readable limitations and caveats */
  limitations: string[];

  /** Model version for estimated mode (for future calibration tracking) */
  modelVersion: string | null;
};

// ---------------------------------------------------------------------------
// Estimation engine
// ---------------------------------------------------------------------------

/**
 * Story view rate benchmarks by follower tier.
 *
 * Source: Industry aggregates (Later, Socialinsider, Rival IQ 2024-2025).
 * These are starting heuristics, not calibrated models.
 */
const TIER_BENCHMARKS = [
  { maxFollowers: 1_000,     viewRate: 0.10,  reachMultiplier: 1.15, confidence: "medium" as StoryConfidence },
  { maxFollowers: 5_000,     viewRate: 0.08,  reachMultiplier: 1.15, confidence: "medium" as StoryConfidence },
  { maxFollowers: 10_000,    viewRate: 0.06,  reachMultiplier: 1.20, confidence: "medium" as StoryConfidence },
  { maxFollowers: 50_000,    viewRate: 0.04,  reachMultiplier: 1.20, confidence: "low"    as StoryConfidence },
  { maxFollowers: 100_000,   viewRate: 0.035, reachMultiplier: 1.25, confidence: "low"    as StoryConfidence },
  { maxFollowers: 500_000,   viewRate: 0.025, reachMultiplier: 1.25, confidence: "low"    as StoryConfidence },
  { maxFollowers: Infinity,  viewRate: 0.02,  reachMultiplier: 1.30, confidence: "low"    as StoryConfidence },
];

function getTierBenchmark(followerCount: number) {
  return TIER_BENCHMARKS.find((t) => followerCount <= t.maxFollowers) ?? TIER_BENCHMARKS[TIER_BENCHMARKS.length - 1];
}

/**
 * Estimate Instagram Story Visibility for an arbitrary public influencer.
 *
 * This is a first-pass heuristic model based on industry benchmarks.
 * It outputs range-based estimates with explicit confidence labels.
 *
 * @param followerCount - The account's follower count (from Meta or Apify)
 * @param avgReelViews  - Average Reel views if available (for cross-reference calibration)
 * @returns StoryVisibility in estimated mode, or unavailable if insufficient data
 */
export function estimateStoryVisibility(
  followerCount: number | null,
  avgReelViews: number | null
): StoryVisibility {
  // Guard: no follower data → unavailable
  if (followerCount === null || followerCount <= 0) {
    return makeUnavailable(
      "Follower count not available. Cannot estimate story visibility without audience size data."
    );
  }

  const tier = getTierBenchmark(followerCount);
  let baseViewRate = tier.viewRate;

  // Cross-reference calibration: if Reel engagement rate is significantly
  // different from expected, adjust story view rate proportionally
  if (avgReelViews !== null && avgReelViews > 0) {
    const reelEngagementRate = avgReelViews / followerCount;
    // Expected Reel view rate is roughly 3-8x story view rate
    const expectedReelRate = baseViewRate * 5;
    if (expectedReelRate > 0) {
      const calibrationFactor = Math.min(
        Math.max(reelEngagementRate / expectedReelRate, 0.5),
        2.0
      );
      baseViewRate *= calibrationFactor;
    }
  }

  // Calculate estimated viewers (range: ±30% around central estimate)
  const centralViewers = Math.round(followerCount * baseViewRate);
  const viewersLow = Math.max(1, Math.round(centralViewers * 0.7));
  const viewersHigh = Math.round(centralViewers * 1.3);

  // Calculate estimated reach (slightly higher than views due to non-follower discovery)
  const reachLow = Math.round(viewersLow * tier.reachMultiplier);
  const reachHigh = Math.round(viewersHigh * tier.reachMultiplier);

  const limitations: string[] = [
    "Story visibility is estimated from follower count and engagement benchmarks.",
    "Actual story views depend on posting time, content type, story length, and audience activity.",
    "This is a range estimate, not an exact measurement.",
  ];

  if (avgReelViews !== null) {
    limitations.push(
      "Estimate was calibrated using observed Reel performance."
    );
  }

  return {
    sourceMode: "estimated",
    sourceProvider: "heuristic",
    confidence: tier.confidence,

    // Exact metrics are null in estimated mode
    views: null,
    reach: null,
    navigation: null,
    replies: null,
    profileActivity: null,

    // Estimated ranges
    estimatedViewers: { low: viewersLow, high: viewersHigh },
    estimatedReach: { low: reachLow, high: reachHigh },

    // Metadata
    storyMediaId: null,
    storyPublishedAt: null,
    isExpired: null,
    limitations,
    modelVersion: "heuristic-v1",
  };
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

export function makeUnavailable(reason: string): StoryVisibility {
  return {
    sourceMode: "unavailable",
    sourceProvider: "none",
    confidence: "low",
    views: null,
    reach: null,
    navigation: null,
    replies: null,
    profileActivity: null,
    estimatedViewers: null,
    estimatedReach: null,
    storyMediaId: null,
    storyPublishedAt: null,
    isExpired: null,
    limitations: [reason],
    modelVersion: null,
  };
}

/**
 * Create a StoryVisibility from exact Meta Story Insights.
 * This is a foundation interface — actual usage requires creator-authorized auth flow.
 */
export function makeExactConnected(metrics: {
  views: number;
  reach?: number;
  navigation?: number;
  replies?: number;
  profileActivity?: number;
  storyMediaId: string;
  publishedAt: string;
  isExpired: boolean;
}): StoryVisibility {
  return {
    sourceMode: "exact_connected",
    sourceProvider: "meta",
    confidence: "high",
    views: { value: metrics.views, isExact: true },
    reach: metrics.reach !== undefined ? { value: metrics.reach, isExact: true } : null,
    navigation: metrics.navigation !== undefined ? { value: metrics.navigation, isExact: true } : null,
    replies: metrics.replies !== undefined ? { value: metrics.replies, isExact: true } : null,
    profileActivity: metrics.profileActivity !== undefined ? { value: metrics.profileActivity, isExact: true } : null,
    estimatedViewers: null,
    estimatedReach: null,
    storyMediaId: metrics.storyMediaId,
    storyPublishedAt: metrics.publishedAt,
    isExpired: metrics.isExpired,
    limitations: metrics.isExpired
      ? ["Story has expired. Metrics reflect final state."]
      : ["Story is active. Metrics may still be updating."],
    modelVersion: null,
  };
}

/**
 * Vendor adapter interface placeholder.
 * Implement this when a vendor integration is configured.
 */
export interface StoryVendorAdapter {
  readonly vendorName: string;
  fetchStoryVisibility(username: string): Promise<StoryVisibility>;
}
