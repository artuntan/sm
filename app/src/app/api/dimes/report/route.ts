/**
 * Dimes Content Coverage — Report API
 *
 * GET /api/dimes/report
 * Returns the content coverage gap analysis for all brands.
 *
 * READS FROM DATABASE — not in-memory state.
 * Posts are retrieved from the durable coverage_post table.
 * Clusters and gaps are computed on-read (derived data).
 *
 * Query params:
 *   ?brand=dimes-tr    — filter by brand slug
 *   ?since=2025-01-01  — filter posts after this date
 */

import { requireApproved } from "@/lib/auth/guards";
import { NextResponse } from "next/server";
import { getAllBrands, getBrandBySlug } from "@/lib/dimes/accounts";
import * as repo from "@/lib/dimes/repository";
import { buildClusters } from "@/lib/dimes/clustering";
import { analyzeGaps, computeGapSummary } from "@/lib/dimes/gap-analysis";
import { clusterMediaFormat } from "@/lib/dimes/media-format";

export async function GET(request: Request) {
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  try {
    const url = new URL(request.url);
    const brandSlug = url.searchParams.get("brand");
    const since = url.searchParams.get("since");

    // Get brands
    const brands = brandSlug
      ? [getBrandBySlug(brandSlug)].filter(Boolean)
      : getAllBrands();

    if (brands.length === 0) {
      return NextResponse.json(
        { error: "Brand not found" },
        { status: 404 }
      );
    }

    // Read all posts from DB
    const allPosts = await repo.getAllPosts(since || undefined);
    const totalPostCount = await repo.getPostCount();

    // Build per-brand reports
    const brandReports = [];

    for (const brand of brands) {
      if (!brand) continue;

      // Source-inclusive clustering:
      // Source platform posts (IG/TT) enter clustering regardless of classification
      // (except special_day which is explicitly excluded from coverage).
      // Destination platform posts (FB/YT/PT) still need recipe/taste to be relevant.
      // Classification is a SIGNAL, not a gate — cluster-level eligibility is
      // determined downstream in gap-analysis.
      const brandPosts = allPosts.filter((p) => p.brandId === brand.id);
      const SOURCE_SET = new Set(["instagram", "tiktok"]);
      const clusterCandidates = brandPosts.filter((p) => {
        if (p.classification === "special_day") return false;
        if (SOURCE_SET.has(p.platform)) return true;
        return p.classification === "recipe" || p.classification === "taste";
      });

      // Cluster all candidates
      const { clusters } = buildClusters(clusterCandidates);

      // Build scan evidence for this brand
      const allPlatforms = brand.accounts
        .filter((a) => a.providerPath !== "not-available")
        .map((a) => a.platform);
      const accountIdMap = new Map(
        brand.accounts.map((a) => [a.platform, a.id] as const)
      );
      const evidence = await repo.getScanEvidence(brand.id, allPlatforms, accountIdMap);

      // Compute gaps with evidence-based status
      const gaps = analyzeGaps(clusters, brandPosts, brand, evidence);
      const summary = computeGapSummary(gaps, clusters.length);

      brandReports.push({
        brand: {
          id: brand.id,
          slug: brand.slug,
          name: brand.name,
          accountCount: brand.accounts.length,
          accounts: brand.accounts.map((a) => ({
            platform: a.platform,
            handle: a.handle,
            verificationStatus: a.verificationStatus,
            providerPath: a.providerPath,
            lastScannedAt: a.lastScannedAt,
          })),
        },
        stats: {
          totalPosts: brandPosts.length,
          recipePosts: brandPosts.filter((p) => p.classification === "recipe").length,
          tastePosts: brandPosts.filter((p) => p.classification === "taste").length,
          specialDayPosts: brandPosts.filter((p) => p.classification === "special_day").length,
          otherPosts: brandPosts.filter(
            (p) =>
              p.classification !== "recipe" &&
              p.classification !== "taste" &&
              p.classification !== "special_day"
          ).length,
        },
        scanEvidence: evidence.map((e) => ({
          platform: e.platform,
          scanned: e.scanned,
          postsFetched: e.postsFetched,
          error: e.error,
        })),
        clusters: clusters.map((c) => ({
          id: c.id,
          recipeName: c.recipeName,
          contentType: c.contentType,
          mediaFormat: clusterMediaFormat(c, brandPosts),
          firstSeenAt: c.firstSeenAt,
          primaryCaption: c.primaryCaption?.slice(0, 200) || null,
          platforms: c.posts.map((cp) => cp.platform),
          postCount: c.posts.length,
        })),
        gaps: gaps.map((g) => ({
          clusterId: g.cluster.id,
          recipeName: g.cluster.recipeName,
          contentType: g.cluster.contentType,
          mediaFormat: clusterMediaFormat(g.cluster, brandPosts),
          firstSeenAt: g.cluster.firstSeenAt,
          sourceLink: g.sourceLink,
          primaryCaption: g.cluster.primaryCaption?.slice(0, 200) || null,
          sourcePlatforms: g.sourcePlatforms,
          destinationPlatforms: g.destinationPlatforms,
          missingSourcePlatforms: g.missingSourcePlatforms,
          missingDestinations: g.missingDestinations,
        })),
        summary,
      });
    }

    // Get recent scan history
    const recentScans = await repo.getScanHistory(5);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      dateRange: {
        since: since || "2025-01-01",
        until: new Date().toISOString().split("T")[0],
      },
      brands: brandReports,
      totalGaps: brandReports.reduce(
        (sum, r) => sum + r.gaps.length,
        0
      ),
      totalPostsInDb: totalPostCount,
      recentScans,
    });
  } catch (error) {
    console.error("[Dimes Report]", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
