/**
 * GET /api/warehouse
 *
 * Returns all influencer identities with merged scan data from both platforms.
 * Groups IG + TT accounts into single identity rows.
 * Computes organic / commercial benchmark summaries from cached scan data.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  creatorScanCache,
  creatorScanProfile,
  influencerIdentity,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { evaluateFreshness } from "@/lib/services/scan-cache-service";
import { getAdaptiveTtl } from "@/lib/services/adaptive-scan-service";
import { selectDualBenchmarkFromItems } from "@/lib/domain/selection";
import type { Platform, ProviderResult } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BenchmarkItem = {
  id: string;
  views: number | null;
  caption: string | null;
  permalink: string;
  timestamp: string;
  isCommercial: boolean;
  classificationCategory: string | null;
};

type BenchmarkSummary = {
  organicAvg: number | null;
  organicSampleSize: number;
  organicStatus: string;
  organicItems: BenchmarkItem[];
  commercialAvg: number | null;
  commercialSampleSize: number;
  commercialStatus: string;
  commercialItems: BenchmarkItem[];
  adToOrganicRatio: number | null;
  totalContentCount: number;
};

type PlatformScanData = {
  platform: string;
  username: string;
  lastScanAt: string;
  expiresAt: string;
  freshness: "fresh" | "stale" | "expired";
  providerSource: string;
  scanCount: number;
  profileName: string | null;
  profileFollowers: number | null;
  profileFollowing: number | null;
  profilePicUrl: string | null;
  isVerified: boolean;
  contentCount: number;
  /** Pre-computed benchmark summary */
  benchmark: BenchmarkSummary | null;
};

export type WarehouseIdentity = {
  id: string;
  displayName: string | null;
  instagramUsername: string | null;
  tiktokUsername: string | null;
  freshness: "fresh" | "stale" | "expired";
  lastScanAt: string;
  totalScans: number;
  platforms: PlatformScanData[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBenchmark(
  providerResultJson: string | null,
  platform: Platform
): BenchmarkSummary | null {
  if (!providerResultJson) return null;

  try {
    const pr: ProviderResult = JSON.parse(providerResultJson);
    if (!pr.items || pr.items.length === 0) return null;

    const result = selectDualBenchmarkFromItems(pr.items, platform);

    const mapItems = (bucket: typeof result.organic): BenchmarkItem[] =>
      (bucket.reels ?? []).map((item: Record<string, unknown>) => ({
        id: (item.id as string) ?? "",
        views: (item.views as number | null) ?? null,
        caption: (item.caption as string | null) ?? null,
        permalink: (item.permalink as string) ?? "",
        timestamp: (item.timestamp as string) ?? "",
        isCommercial: (item.isCommercial as boolean) ?? false,
        classificationCategory: (item.classificationCategory as string | null) ?? null,
      }));

    return {
      organicAvg: result.organic.averageViews,
      organicSampleSize: result.organic.sampleSize,
      organicStatus: result.organic.status,
      organicItems: mapItems(result.organic),
      commercialAvg: result.commercial.averageViews,
      commercialSampleSize: result.commercial.sampleSize,
      commercialStatus: result.commercial.status,
      commercialItems: mapItems(result.commercial),
      adToOrganicRatio: result.comparison?.adToOrganicRatio ?? null,
      totalContentCount: pr.items.length,
    };
  } catch {
    return null;
  }
}

function buildPlatformData(
  platform: Platform,
  username: string
): PlatformScanData | null {
  const norm = username.toLowerCase().trim();

  const cacheRow = db
    .select()
    .from(creatorScanCache)
    .where(
      and(
        eq(creatorScanCache.platform, platform),
        eq(creatorScanCache.username, norm)
      )
    )
    .get();

  const profileRow = db
    .select()
    .from(creatorScanProfile)
    .where(
      and(
        eq(creatorScanProfile.platform, platform),
        eq(creatorScanProfile.username, norm)
      )
    )
    .get();

  if (!cacheRow && !profileRow) return null;

  const adaptiveTtl = getAdaptiveTtl(platform, norm);
  const lastScanAt = cacheRow?.fetchedAt ?? profileRow?.lastScanAt ?? "";
  const freshness = cacheRow
    ? evaluateFreshness(cacheRow.fetchedAt, adaptiveTtl)
    : "expired";

  // Parse profile snapshot
  let profileName: string | null = null;
  let profileFollowers: number | null = null;
  let profileFollowing: number | null = null;
  let profilePicUrl: string | null = null;
  let isVerified = false;
  if (profileRow?.profileSnapshotJson) {
    try {
      const snap = JSON.parse(profileRow.profileSnapshotJson);
      profileName = snap.displayName || snap.fullName || null;
      profileFollowers = snap.followerCount ?? null;
      profileFollowing = snap.followingCount ?? null;
      profilePicUrl = snap.profilePicUrl || snap.profilePicture || null;
      isVerified = snap.verified ?? false;
    } catch {}
  }

  // Compute benchmark from cached provider result
  const benchmark = computeBenchmark(
    cacheRow?.providerResultJson ?? null,
    platform
  );

  return {
    platform,
    username: norm,
    lastScanAt,
    expiresAt: cacheRow?.expiresAt ?? "",
    freshness,
    providerSource: cacheRow?.providerSource ?? "–",
    scanCount: profileRow?.scanCount ?? 1,
    profileName,
    profileFollowers,
    profileFollowing,
    profilePicUrl,
    isVerified,
    contentCount: cacheRow?.itemCount ?? 0,
    benchmark,
  };
}

function bestFreshness(
  platforms: PlatformScanData[]
): "fresh" | "stale" | "expired" {
  if (platforms.some((p) => p.freshness === "fresh")) return "fresh";
  if (platforms.some((p) => p.freshness === "stale")) return "stale";
  return "expired";
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const identities: WarehouseIdentity[] = [];
    const seenUsernames = new Set<string>();

    // Phase 1: Build from identity table (merged accounts)
    const idRows = db.select().from(influencerIdentity).all();

    for (const row of idRows) {
      const platforms: PlatformScanData[] = [];

      if (row.instagramUsername) {
        seenUsernames.add(`instagram:${row.instagramUsername}`);
        const data = buildPlatformData("instagram", row.instagramUsername);
        if (data) platforms.push(data);
      }

      if (row.tiktokUsername) {
        seenUsernames.add(`tiktok:${row.tiktokUsername}`);
        const data = buildPlatformData("tiktok", row.tiktokUsername);
        if (data) platforms.push(data);
      }

      if (platforms.length === 0) continue;

      const latestScan = platforms.reduce((a, b) =>
        new Date(b.lastScanAt).getTime() > new Date(a.lastScanAt).getTime()
          ? b
          : a
      );

      identities.push({
        id: row.id,
        displayName: row.displayName,
        instagramUsername: row.instagramUsername,
        tiktokUsername: row.tiktokUsername,
        freshness: bestFreshness(platforms),
        lastScanAt: latestScan.lastScanAt,
        totalScans: platforms.reduce((s, p) => s + p.scanCount, 0),
        platforms,
      });
    }

    // Phase 2: Orphan accounts (scanned but not linked to any identity)
    const allCache = db.select().from(creatorScanCache).all();
    const allProfiles = db.select().from(creatorScanProfile).all();

    const allKeys = new Set<string>();
    for (const c of allCache) allKeys.add(`${c.platform}:${c.username}`);
    for (const p of allProfiles) allKeys.add(`${p.platform}:${p.username}`);

    for (const key of allKeys) {
      if (seenUsernames.has(key)) continue;
      seenUsernames.add(key);

      const [platform, username] = key.split(":");
      const data = buildPlatformData(platform as Platform, username);
      if (!data) continue;

      identities.push({
        id: `orphan_${key}`,
        displayName: username,
        instagramUsername: platform === "instagram" ? username : null,
        tiktokUsername: platform === "tiktok" ? username : null,
        freshness: data.freshness,
        lastScanAt: data.lastScanAt,
        totalScans: data.scanCount,
        platforms: [data],
      });
    }

    identities.sort(
      (a, b) =>
        new Date(b.lastScanAt).getTime() - new Date(a.lastScanAt).getTime()
    );

    return NextResponse.json({
      identities,
      totalCount: identities.length,
      freshCount: identities.filter((i) => i.freshness === "fresh").length,
      staleCount: identities.filter((i) => i.freshness === "stale").length,
      expiredCount: identities.filter((i) => i.freshness === "expired").length,
    });
  } catch (err) {
    console.error("[warehouse] Error:", err);
    return NextResponse.json(
      { error: "Failed to load warehouse data" },
      { status: 500 }
    );
  }
}
