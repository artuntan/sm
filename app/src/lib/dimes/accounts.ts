/**
 * Dimes Content Coverage — Verified Account Registry
 *
 * This is the source-of-truth for brand → platform account mappings.
 * Verified by the marketing team on 2026-03-21.
 *
 * IMPORTANT: This module uses in-memory data for V1.
 * Future versions will migrate to the database schema.
 */

import type {
  DimesBrand,
  DimesSocialAccount,
  DimesPlatform,
  DimesProviderPath,
  PlatformAccessInfo,
} from "./types";

// ---------------------------------------------------------------------------
// Platform access reality (March 2026)
// ---------------------------------------------------------------------------

export const PLATFORM_ACCESS: Record<DimesPlatform, PlatformAccessInfo> = {
  instagram: {
    platform: "instagram",
    providerPath: "meta-graph",
    isOfficial: true,
    limitations: [
      "Meta Graph API — Business Discovery endpoint",
      "Requires META_ACCESS_TOKEN + META_IG_USER_ID",
      "Only professional (business/creator) accounts",
    ],
  },
  tiktok: {
    platform: "tiktok",
    providerPath: "apify",
    isOfficial: false,
    limitations: [
      "Uses Apify TikTok Scraper actor",
      "Official Research API requires approved academic/business access",
      "Subject to rate limits",
    ],
  },
  facebook: {
    platform: "facebook",
    providerPath: "apify",
    isOfficial: false,
    limitations: [
      "Uses Apify Facebook Posts Scraper",
      "Facebook Graph API requires page admin access (no business_discovery equivalent)",
      "Reads public page content without admin/token requirements",
      "Same token as Instagram",
    ],
  },
  youtube: {
    platform: "youtube",
    providerPath: "youtube-api",
    isOfficial: true,
    limitations: [
      "YouTube Data API v3 — official, free quota",
      "Shorts detection via videoDuration=short filter",
      "May include non-Shorts short videos (<4 min)",
    ],
  },
  pinterest: {
    platform: "pinterest",
    providerPath: "apify",
    isOfficial: false,
    limitations: [
      "Uses Apify Pinterest Scraper",
      "Official API v5 requires OAuth + only own-content access",
      "Board-based pin listing via scraper",
    ],
  },
  x: {
    platform: "x",
    providerPath: "not-available",
    isOfficial: false,
    limitations: [
      "X API v2 is expensive and rate-limited",
      "Deferred to Phase 2",
    ],
  },
};

// ---------------------------------------------------------------------------
// Verified brand registry
// ---------------------------------------------------------------------------

let accountIdCounter = 0;
function makeAccountId(): string {
  return `acc_${++accountIdCounter}`;
}

function makeAccount(
  brandId: string,
  platform: DimesPlatform,
  handle: string,
  profileUrl: string,
  status: "verified" | "unverified" = "verified",
  notes: string | null = null
): DimesSocialAccount {
  return {
    id: makeAccountId(),
    brandId,
    platform,
    handle,
    profileUrl,
    verificationStatus: status,
    lastScannedAt: null,
    providerPath: PLATFORM_ACCESS[platform].providerPath,
    notes,
  };
}

export const BRANDS: DimesBrand[] = [
  {
    id: "brand_dimes_tr",
    slug: "dimes-tr",
    name: "Dimes TR",
    accounts: [
      makeAccount("brand_dimes_tr", "instagram", "dimes.tr", "https://www.instagram.com/dimes.tr/"),
      makeAccount("brand_dimes_tr", "tiktok", "dimesturkiye", "https://www.tiktok.com/@dimesturkiye"),
      makeAccount("brand_dimes_tr", "facebook", "dimestr", "https://www.facebook.com/dimestr/"),
      makeAccount("brand_dimes_tr", "youtube", "dimesturkiye", "https://www.youtube.com/@dimesturkiye"),
      makeAccount("brand_dimes_tr", "x", "dimestr", "https://x.com/dimestr", "verified", "Phase 2 — X monitoring deferred"),
      // Dimes TR has NO Pinterest account (confirmed by user)
    ],
  },
  {
    id: "brand_dimes_club",
    slug: "dimes-club",
    name: "Dimes Club",
    accounts: [
      makeAccount("brand_dimes_club", "instagram", "dimesclub", "https://www.instagram.com/dimesclub/"),
      makeAccount("brand_dimes_club", "tiktok", "dimesclub.tr", "https://www.tiktok.com/@dimesclub.tr"),
      makeAccount("brand_dimes_club", "facebook", "dimesclub", "https://www.facebook.com/dimesclub/"),
      makeAccount("brand_dimes_club", "youtube", "UCSNUfQe-wdxisDxrb_WaBsQ", "https://www.youtube.com/channel/UCSNUfQe-wdxisDxrb_WaBsQ"),
      makeAccount("brand_dimes_club", "pinterest", "dimesclub", "https://tr.pinterest.com/dimesclub/"),
    ],
  },
  {
    id: "brand_obsesso",
    slug: "obsesso",
    name: "Obsesso",
    accounts: [
      makeAccount("brand_obsesso", "instagram", "obsesso.tr", "https://www.instagram.com/obsesso.tr/"),
      makeAccount("brand_obsesso", "tiktok", "obsesso.tr", "https://www.tiktok.com/@obsesso.tr"),
      makeAccount("brand_obsesso", "facebook", "obsesso.tr", "https://www.facebook.com/obsesso.tr/"),
      makeAccount("brand_obsesso", "youtube", "ObsessoCoffee", "https://www.youtube.com/@ObsessoCoffee"),
      makeAccount("brand_obsesso", "pinterest", "obsesso_tr", "https://tr.pinterest.com/obsesso_tr/"),
      makeAccount("brand_obsesso", "x", "obsesso_tr", "https://x.com/obsesso_tr", "verified", "Phase 2 — X monitoring deferred"),
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getBrandById(brandId: string): DimesBrand | undefined {
  return BRANDS.find((b) => b.id === brandId);
}

export function getBrandBySlug(slug: string): DimesBrand | undefined {
  return BRANDS.find((b) => b.slug === slug);
}

export function getAllBrands(): DimesBrand[] {
  return BRANDS;
}

export function getAccountsForPlatform(
  brand: DimesBrand,
  platform: DimesPlatform
): DimesSocialAccount[] {
  return brand.accounts.filter((a) => a.platform === platform);
}

export function getVerifiedAccounts(
  brand: DimesBrand,
  platform?: DimesPlatform
): DimesSocialAccount[] {
  return brand.accounts.filter(
    (a) =>
      a.verificationStatus === "verified" &&
      (!platform || a.platform === platform) &&
      a.providerPath !== "not-available"
  );
}

/**
 * For each brand, determine which destination platforms are applicable.
 * A destination is "not_applicable" if the brand has no account on that platform.
 */
export function getApplicableDestinations(
  brand: DimesBrand
): { platform: DimesPlatform; applicable: boolean; account: DimesSocialAccount | null }[] {
  const destinations: DimesPlatform[] = ["facebook", "youtube", "pinterest"];
  return destinations.map((p) => {
    const accts = getAccountsForPlatform(brand, p);
    return {
      platform: p,
      applicable: accts.length > 0,
      account: accts[0] || null,
    };
  });
}
