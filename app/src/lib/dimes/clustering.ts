/**
 * Dimes Content Coverage — Same-Content Clustering Engine
 *
 * The core hard problem: detecting that the same content posted on
 * different platforms (with different captions, hashtags, lengths)
 * is actually the same content.
 *
 * Multi-signal matching approach:
 * 1. Recipe name extraction → primary anchor
 * 2. Normalized caption token Jaccard similarity
 * 3. Hashtag overlap
 * 4. Temporal proximity (within same brand)
 * 5. Confidence scoring with manual review path
 *
 * IMPORTANT: This does NOT use exact caption equality.
 * Two posts can have completely different caption wording and
 * still be correctly clustered if recipe name + hashtag + temporal
 * signals agree.
 */

import {
  normalizeCaption,
  toTokenizedView,
  toCompactView,
  extractHashtags,
} from "../domain/normalize";
import { extractRecipeName } from "./classifier";
import type {
  DimesContentPost,
  DimesContentCluster,
  DimesClusterPost,
  MatchConfidence,
} from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum Jaccard similarity for token-set overlap */
const JACCARD_THRESHOLD = 0.25;

/** Maximum days between posts to consider temporal proximity */
const TEMPORAL_WINDOW_DAYS = 14;

/** Minimum hashtag overlap count for a matching signal */
const MIN_HASHTAG_OVERLAP = 1;

/** Weights for multi-signal scoring */
const SIGNAL_WEIGHTS = {
  exactCaption: 45,   // Strongest: normalized captions are identical
  captionContainment: 30, // Strong: one caption contains the other (truncation)
  recipeName: 40,     // Strong: same recipe name
  highJaccard: 25,    // Caption token similarity ≥ 0.5
  medJaccard: 15,     // Caption token similarity ≥ 0.25
  hashtagOverlap: 20, // ≥1 shared hashtag
  temporal: 10,       // Within temporal window
  classificationMatch: 5, // Same classification (recipe=recipe)
} as const;

/** Confidence thresholds */
const HIGH_CONFIDENCE_THRESHOLD = 55;
const MEDIUM_CONFIDENCE_THRESHOLD = 35;

// ---------------------------------------------------------------------------
// Token similarity
// ---------------------------------------------------------------------------

/**
 * Compute Jaccard similarity between two sets of tokens.
 * J(A,B) = |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute hashtag overlap count (after normalization).
 */
export function hashtagOverlap(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((tag) => setB.has(tag));
}

/**
 * Check temporal proximity between two ISO timestamps.
 * Returns true if posts are within TEMPORAL_WINDOW_DAYS of each other.
 */
export function isTemporallyClose(
  tsA: string,
  tsB: string,
  windowDays: number = TEMPORAL_WINDOW_DAYS
): boolean {
  const a = new Date(tsA).getTime();
  const b = new Date(tsB).getTime();
  const diffMs = Math.abs(a - b);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
}

// ---------------------------------------------------------------------------
// Fingerprint generation
// ---------------------------------------------------------------------------

/**
 * Generate a clustering fingerprint for a post.
 * This is a compact representation for quick comparison.
 *
 * Format: brandId:recipeName|topHashtags|dateWeek
 */
export function generateFingerprint(
  brandId: string,
  caption: string | null,
  hashtags: string[],
  publishedAt: string
): string {
  const recipeName = extractRecipeName(caption);
  const normalized = caption ? normalizeCaption(caption) : "";
  const tokenized = caption ? toTokenizedView(normalized) : "";

  // Top meaningful tokens (skip very short/common words)
  const meaningfulTokens = tokenized
    .split(" ")
    .filter((t) => t.length >= 4)
    .slice(0, 5)
    .sort()
    .join(",");

  // Top hashtags (sorted for stability)
  const topTags = hashtags
    .filter((t) => t.length >= 4)
    .slice(0, 5)
    .sort()
    .join(",");

  // Week bucket for temporal grouping
  const date = new Date(publishedAt);
  const weekNum = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));

  return `${brandId}:${recipeName || meaningfulTokens}|${topTags}|w${weekNum}`;
}

// ---------------------------------------------------------------------------
// Match scoring
// ---------------------------------------------------------------------------

export type MatchResult = {
  score: number;
  confidence: MatchConfidence;
  signals: string[];
};

/**
 * Score the match between two posts.
 * Returns a score (0-100), confidence level, and list of matching signals.
 */
export function scoreMatch(
  postA: {
    caption: string | null;
    hashtags: string[];
    publishedAt: string;
    brandId: string;
    classification?: string;
  },
  postB: {
    caption: string | null;
    hashtags: string[];
    publishedAt: string;
    brandId: string;
    classification?: string;
  }
): MatchResult {
  // Different brands → never cluster
  if (postA.brandId !== postB.brandId) {
    return { score: 0, confidence: "low", signals: ["different_brand"] };
  }

  let score = 0;
  const signals: string[] = [];

  // --- Signal 1: Recipe name match ---
  const recipeA = extractRecipeName(postA.caption);
  const recipeB = extractRecipeName(postB.caption);

  if (recipeA && recipeB) {
    const normalizedA = normalizeCaption(recipeA);
    const normalizedB = normalizeCaption(recipeB);
    if (normalizedA === normalizedB) {
      score += SIGNAL_WEIGHTS.recipeName;
      signals.push(`recipe_name_match:${recipeA}`);
    } else {
      // Partial recipe name similarity
      const recipeTokensA = toTokenizedView(normalizedA).split(" ");
      const recipeTokensB = toTokenizedView(normalizedB).split(" ");
      const recipeJaccard = jaccardSimilarity(recipeTokensA, recipeTokensB);
      if (recipeJaccard >= 0.5) {
        score += SIGNAL_WEIGHTS.recipeName * 0.7;
        signals.push(
          `recipe_name_partial:${recipeA}↔${recipeB}(J=${recipeJaccard.toFixed(2)})`
        );
      }
    }
  }

  // --- Signal 2: Exact caption equality (strongest cross-platform signal) ---
  // Same-caption posts across IG/TikTok should always cluster even if
  // they differ only in emojis, whitespace, or Turkish characters.
  let captionExactMatch = false;
  if (postA.caption && postB.caption) {
    const compactA = toCompactView(normalizeCaption(postA.caption));
    const compactB = toCompactView(normalizeCaption(postB.caption));

    if (compactA.length >= 3 && compactA === compactB) {
      score += SIGNAL_WEIGHTS.exactCaption;
      signals.push(`caption_exact_match`);
      captionExactMatch = true;
    } else if (compactA.length >= 10 && compactB.length >= 10) {
      // Containment check for truncated captions (one is prefix of other)
      const longer = compactA.length >= compactB.length ? compactA : compactB;
      const shorter = compactA.length < compactB.length ? compactA : compactB;
      const ratio = shorter.length / longer.length;
      if (longer.startsWith(shorter) && ratio >= 0.6) {
        score += SIGNAL_WEIGHTS.captionContainment;
        signals.push(`caption_containment:ratio=${ratio.toFixed(2)}`);
        captionExactMatch = true;
      }
    }
  }

  // --- Signal 3: Caption token similarity (Jaccard) ---
  if (postA.caption && postB.caption && !captionExactMatch) {
    const tokensA = toTokenizedView(normalizeCaption(postA.caption))
      .split(" ")
      .filter((t) => t.length >= 3);
    const tokensB = toTokenizedView(normalizeCaption(postB.caption))
      .split(" ")
      .filter((t) => t.length >= 3);
    const jaccard = jaccardSimilarity(tokensA, tokensB);

    if (jaccard >= 0.5) {
      score += SIGNAL_WEIGHTS.highJaccard;
      signals.push(`caption_similarity_high:J=${jaccard.toFixed(2)}`);
    } else if (jaccard >= JACCARD_THRESHOLD) {
      score += SIGNAL_WEIGHTS.medJaccard;
      signals.push(`caption_similarity_med:J=${jaccard.toFixed(2)}`);
    }
  }

  // --- Signal 4: Hashtag overlap ---
  const sharedTags = hashtagOverlap(postA.hashtags, postB.hashtags);
  if (sharedTags.length >= MIN_HASHTAG_OVERLAP) {
    score += SIGNAL_WEIGHTS.hashtagOverlap;
    signals.push(`hashtag_overlap:${sharedTags.length}(${sharedTags.slice(0, 3).join(",")})`);
  }

  // --- Signal 5: Temporal proximity ---
  if (isTemporallyClose(postA.publishedAt, postB.publishedAt)) {
    score += SIGNAL_WEIGHTS.temporal;
    signals.push("temporal_proximity");
  }

  // --- Signal 6: Same classification (recipe=recipe, taste=taste) ---
  if (
    postA.classification &&
    postB.classification &&
    postA.classification === postB.classification &&
    (postA.classification === "recipe" || postA.classification === "taste")
  ) {
    score += SIGNAL_WEIGHTS.classificationMatch;
    signals.push(`classification_match:${postA.classification}`);
  }

  // --- Determine confidence ---
  let confidence: MatchConfidence;
  if (score >= HIGH_CONFIDENCE_THRESHOLD) {
    confidence = "high";
  } else if (score >= MEDIUM_CONFIDENCE_THRESHOLD) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return { score, confidence, signals };
}

// ---------------------------------------------------------------------------
// Cluster builder
// ---------------------------------------------------------------------------

let clusterIdCounter = 0;
function makeClusterId(): string {
  return `cluster_${Date.now()}_${++clusterIdCounter}`;
}

/**
 * Build content clusters from a list of posts.
 *
 * Algorithm:
 * 1. For each post, compare against existing clusters
 * 2. If a match is found above threshold, add to cluster
 * 3. If no match, create a new cluster
 *
 * Posts from the SAME platform+brand are NOT clustered together
 * (they're different posts, not cross-platform duplicates).
 * Clustering only connects posts from DIFFERENT platforms.
 */
export function buildClusters(
  posts: DimesContentPost[]
): { clusters: DimesContentCluster[]; assignments: DimesClusterPost[] } {
  const clusters: DimesContentCluster[] = [];
  const assignments: DimesClusterPost[] = [];

  // Sort posts by publishedAt for deterministic clustering
  const sortedPosts = [...posts].sort(
    (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
  );

  for (const post of sortedPosts) {
    let bestCluster: DimesContentCluster | null = null;
    let bestMatch: MatchResult = { score: 0, confidence: "low", signals: [] };

    // Compare against existing clusters
    for (const cluster of clusters) {
      // Skip if same brand already has a post from same platform in this cluster
      const hasSamePlatform = assignments.some(
        (a) =>
          a.clusterId === cluster.id &&
          posts.find((p) => p.id === a.postId)?.platform === post.platform &&
          posts.find((p) => p.id === a.postId)?.brandId === post.brandId
      );
      if (hasSamePlatform) continue;

      // Must be same brand
      if (cluster.brandId !== post.brandId) continue;

      // Find the best match against any post in this cluster
      for (const assignment of assignments.filter(
        (a) => a.clusterId === cluster.id
      )) {
        const clusterPost = posts.find((p) => p.id === assignment.postId);
        if (!clusterPost) continue;

        const match = scoreMatch(
          {
            caption: post.caption,
            hashtags: post.hashtags,
            publishedAt: post.publishedAt,
            brandId: post.brandId,
            classification: post.classification,
          },
          {
            caption: clusterPost.caption,
            hashtags: clusterPost.hashtags,
            publishedAt: clusterPost.publishedAt,
            brandId: clusterPost.brandId,
            classification: clusterPost.classification,
          }
        );

        if (match.score > bestMatch.score) {
          bestMatch = match;
          bestCluster = cluster;
        }
      }
    }

    // Threshold: only cluster if medium+ confidence
    if (bestCluster && bestMatch.confidence !== "low") {
      assignments.push({
        clusterId: bestCluster.id,
        postId: post.id,
        platform: post.platform,
        matchConfidence: bestMatch.confidence,
        matchSignals: bestMatch.signals,
      });
    } else {
      // Create new cluster
      const recipeName = extractRecipeName(post.caption);
      const fingerprint = generateFingerprint(
        post.brandId,
        post.caption,
        post.hashtags,
        post.publishedAt
      );

      const newCluster: DimesContentCluster = {
        id: makeClusterId(),
        fingerprint,
        primaryCaption: post.caption,
        recipeName,
        contentType: post.classification,
        brandId: post.brandId,
        firstSeenAt: post.publishedAt,
        posts: [],
      };

      clusters.push(newCluster);
      assignments.push({
        clusterId: newCluster.id,
        postId: post.id,
        platform: post.platform,
        matchConfidence: "high",
        matchSignals: ["cluster_origin"],
      });
    }
  }

  // Attach assignments to clusters
  for (const cluster of clusters) {
    cluster.posts = assignments.filter((a) => a.clusterId === cluster.id);
  }

  return { clusters, assignments };
}
