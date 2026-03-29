/**
 * Dimes Content Coverage — Gap Analysis Engine
 *
 * The core business question: which recipe/taste content is on IG/TikTok
 * but NOT on Facebook, YouTube Shorts, or Pinterest?
 *
 * This module takes clustered content and produces the gap report.
 *
 * IMPORTANT: Status semantics are EVIDENCE-BASED.
 * - present: confirmed platform presence via cluster membership
 * - missing: platform was SUCCESSFULLY SCANNED and content is absent
 * - unknown: scan failed, incomplete, or never ran — cannot determine
 * - not_applicable: brand has no account on that platform
 */

import type {
  DimesContentCluster,
  DimesContentPost,
  DimesBrand,
  DimesPlatform,
  ContentGap,
  PlatformPresence,
  ScanEvidence,
} from "./types";
import { SOURCE_PLATFORMS, DESTINATION_PLATFORMS } from "./types";
import { getApplicableDestinations } from "./accounts";

// ---------------------------------------------------------------------------
// Gap computation
// ---------------------------------------------------------------------------

/**
 * Analyze a set of clusters and identify content gaps.
 *
 * A gap exists when:
 * 1. A cluster has content on at least one SOURCE platform (IG/TikTok)
 * 2. A cluster is MISSING content on one or more DESTINATION platforms (FB/YT/Pinterest)
 * 3. The destination platform is applicable (brand has an account there)
 * 4. The content is eligible (recipe/taste, not special-day)
 *
 * Status semantics are EVIDENCE-BASED:
 * - If a platform was successfully scanned and content is absent → `missing`
 * - If a platform scan failed or never ran → `unknown`
 * - If brand has no account → `not_applicable`
 *
 * @param scanEvidence Per-platform scan outcome evidence for this brand
 */
export function analyzeGaps(
  clusters: DimesContentCluster[],
  posts: DimesContentPost[],
  brand: DimesBrand,
  scanEvidence?: ScanEvidence[]
): ContentGap[] {
  const gaps: ContentGap[] = [];
  const applicableDestinations = getApplicableDestinations(brand);
  const postMap = new Map(posts.map((p) => [p.id, p]));

  // Build evidence lookup: platform → ScanEvidence
  const evidenceMap = new Map<DimesPlatform, ScanEvidence>();
  if (scanEvidence) {
    for (const e of scanEvidence) {
      evidenceMap.set(e.platform, e);
    }
  }

  for (const cluster of clusters) {
    // Cluster-level eligibility: at least one post in the cluster must be
    // recipe/taste, OR the cluster has source-platform content that deserves
    // coverage tracking. Special-day clusters are excluded (handled upstream).
    // This replaces the old hard gate of cluster.contentType === recipe/taste.
    const clusterPosts = cluster.posts.map(cp => postMap.get(cp.postId)).filter(Boolean);
    const hasRecipeOrTaste = clusterPosts.some(
      p => p!.classification === "recipe" || p!.classification === "taste"
    ) || cluster.contentType === "recipe" || cluster.contentType === "taste";
    const hasSourceContent = cluster.posts.some(cp =>
      SOURCE_PLATFORMS.includes(cp.platform)
    );
    
    // Skip clusters with no recipe/taste evidence AND no source-platform content
    if (!hasRecipeOrTaste && !hasSourceContent) continue;
    // Skip special_day clusters
    if (cluster.contentType === "special_day") continue;

    // Must belong to this brand
    if (cluster.brandId !== brand.id) continue;

    // Determine which platforms have this content
    const platformsWithContent = new Set<DimesPlatform>();
    for (const cp of cluster.posts) {
      platformsWithContent.add(cp.platform);
    }

    // Check if content exists on at least one source platform
    const hasSource = SOURCE_PLATFORMS.some((p) =>
      platformsWithContent.has(p)
    );
    if (!hasSource) continue;

    // Build source platform presence — EVIDENCE-BASED
    const sourcePlatforms: PlatformPresence[] = SOURCE_PLATFORMS.map((p) => {
      const clusterPost = cluster.posts.find((cp) => cp.platform === p);
      const post = clusterPost ? postMap.get(clusterPost.postId) : null;

      if (clusterPost) {
        return {
          platform: p,
          status: "present" as const,
          postId: clusterPost.postId,
          permalink: post?.permalink || null,
          statusReason: `Confirmed: post ${clusterPost.postId} in cluster`,
        };
      }

      // No cluster post — check scan evidence
      const evidence = evidenceMap.get(p);
      const brandHasAccount = brand.accounts.some(
        (a) => a.platform === p && a.providerPath !== "not-available"
      );

      if (!brandHasAccount) {
        return {
          platform: p,
          status: "not_applicable" as const,
          postId: null,
          permalink: null,
          statusReason: `Brand has no ${p} account`,
        };
      }

      if (evidence && evidence.scanned) {
        // Platform was successfully scanned and content is absent
        return {
          platform: p,
          status: "missing" as const,
          postId: null,
          permalink: null,
          statusReason: `Scanned (${evidence.postsFetched} posts fetched), content not found in cluster`,
        };
      }

      // Scan didn't happen or failed
      return {
        platform: p,
        status: "unknown" as const,
        postId: null,
        permalink: null,
        statusReason: evidence?.error
          ? `Scan failed: ${evidence.error}`
          : "No successful scan on record",
      };
    });

    // Build destination platform presence — EVIDENCE-BASED
    const destinationPlatforms: PlatformPresence[] =
      applicableDestinations.map(({ platform, applicable }) => {
        if (!applicable) {
          return {
            platform,
            status: "not_applicable" as const,
            postId: null,
            permalink: null,
            statusReason: `Brand has no ${platform} account`,
          };
        }

        const clusterPost = cluster.posts.find(
          (cp) => cp.platform === platform
        );
        const post = clusterPost ? postMap.get(clusterPost.postId) : null;

        if (clusterPost) {
          return {
            platform,
            status: "present" as const,
            postId: clusterPost.postId,
            permalink: post?.permalink || null,
            statusReason: `Confirmed: post ${clusterPost.postId} in cluster`,
          };
        }

        // No cluster post — check scan evidence
        const evidence = evidenceMap.get(platform);

        if (evidence && evidence.scanned) {
          // Platform was successfully scanned and content is absent → truly missing
          return {
            platform,
            status: "missing" as const,
            postId: null,
            permalink: null,
            statusReason: `Scanned (${evidence.postsFetched} posts fetched), content not in cluster`,
          };
        }

        // Scan failed or never ran → cannot confirm absence
        return {
          platform,
          status: "unknown" as const,
          postId: null,
          permalink: null,
          statusReason: evidence?.error
            ? `Cannot confirm: scan failed (${evidence.error})`
            : "Cannot confirm: no successful scan on record",
        };
      });

    // Identify missing source platforms (only truly missing, not unknown)
    const missingSourcePlatforms = sourcePlatforms
      .filter((sp) => sp.status === "missing")
      .map((sp) => sp.platform);

    const unknownSourcePlatforms = sourcePlatforms
      .filter((sp) => sp.status === "unknown")
      .map((sp) => sp.platform);

    // Identify missing destinations (only truly missing, not unknown)
    const missingDestinations = destinationPlatforms
      .filter((dp) => dp.status === "missing")
      .map((dp) => dp.platform);

    // Count unknowns separately for reporting
    const unknownDestinations = destinationPlatforms
      .filter((dp) => dp.status === "unknown")
      .map((dp) => dp.platform);

    // Report if there's at least one confirmed gap OR ambiguous status on
    // either source or destination platforms. This is important for
    // TikTok-only or Instagram-only source content; operators need to see
    // source asymmetry even when every destination platform is either absent
    // or not applicable.
    if (
      missingSourcePlatforms.length === 0 &&
      unknownSourcePlatforms.length === 0 &&
      missingDestinations.length === 0 &&
      unknownDestinations.length === 0
    ) {
      continue;
    }

    // Legacy convenience: first available source permalink (UI now uses platform-level permalinks)
    const sourcePost = cluster.posts
      .filter((cp) => SOURCE_PLATFORMS.includes(cp.platform))
      .map((cp) => postMap.get(cp.postId))
      .find((p) => p?.permalink);

    gaps.push({
      cluster,
      brand,
      sourcePlatforms,
      destinationPlatforms,
      missingSourcePlatforms,
      missingDestinations,
      sourceLink: sourcePost?.permalink || null,
    });
  }

  // Sort by most recent first
  gaps.sort(
    (a, b) =>
      new Date(b.cluster.firstSeenAt).getTime() -
      new Date(a.cluster.firstSeenAt).getTime()
  );

  return gaps;
}

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------

export type GapSummary = {
  totalClusters: number;
  eligibleClusters: number;
  clustersWithGaps: number;
  gapsByDestination: Record<DimesPlatform, number>;
  gapsByBrand: Record<string, number>;
  coverageRate: number; // 0-1: how many eligible clusters have full coverage
};

export function computeGapSummary(
  gaps: ContentGap[],
  totalEligibleClusters: number
): GapSummary {
  const gapsByDestination: Record<string, number> = {};
  const gapsByBrand: Record<string, number> = {};

  for (const gap of gaps) {
    for (const dest of gap.missingDestinations) {
      gapsByDestination[dest] = (gapsByDestination[dest] || 0) + 1;
    }
    const brandName = gap.brand.name;
    gapsByBrand[brandName] = (gapsByBrand[brandName] || 0) + 1;
  }

  const clustersWithGaps = new Set(gaps.map((g) => g.cluster.id)).size;
  const coverageRate =
    totalEligibleClusters > 0
      ? (totalEligibleClusters - clustersWithGaps) / totalEligibleClusters
      : 1;

  return {
    totalClusters: totalEligibleClusters,
    eligibleClusters: totalEligibleClusters,
    clustersWithGaps,
    gapsByDestination: gapsByDestination as Record<DimesPlatform, number>,
    gapsByBrand,
    coverageRate,
  };
}
