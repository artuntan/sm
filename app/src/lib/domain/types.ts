// ---------------------------------------------------------------------------
// Platform & cross-platform types for dual benchmark analysis
// ---------------------------------------------------------------------------

/** Supported platforms */
export type Platform = "instagram" | "tiktok";

/** Provider source label — shown in UI */
export type ProviderSource =
  | "meta"
  | "mock"
  | "instagram-apify"
  | "tiktok-research"
  | "tiktok-apify"
  | "tiktok-mock";

// ---------------------------------------------------------------------------
// Instagram-specific canonical item (preserved for backward compat)
// ---------------------------------------------------------------------------

export type ReelItem = {
  id: string;
  username: string;
  caption: string | null;
  timestamp: string;
  views: number | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  permalink: string;
  thumbnailUrl?: string | null;
  provider: "meta" | "mock";
  rawMediaType?: string | null;
  rawProductType?: string | null;
};

// ---------------------------------------------------------------------------
// Platform-agnostic content item
// ---------------------------------------------------------------------------

/**
 * A content item from any platform. Used by the shared benchmark pipeline.
 * Instagram Reels and TikTok videos both map into this shape.
 */
export type ContentItem = {
  id: string;
  platform: Platform;
  username: string;
  caption: string | null;
  timestamp: string;
  views: number | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  permalink: string;
  thumbnailUrl?: string | null;
  provider: ProviderSource;
  /** Content kind hint: "REELS" for IG, "VIDEO" for TikTok, etc. */
  contentKind?: string | null;
  /** Provider-reported commercial metadata (e.g. TikTok video_tag, Apify isAd) */
  commercialMetadata?: {
    isPaidPartnership?: boolean;
    isCreatorEarnsCommission?: boolean;
    isAIGenerated?: boolean;
    isSponsored?: boolean;
    rawTag?: Record<string, unknown>;
  } | null;
  /** Raw provider-specific data for debugging */
  rawMetadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Benchmark eligibility
// ---------------------------------------------------------------------------

/**
 * Benchmark eligibility: whether a content item qualifies for calculation.
 * Test/draft/internal content must be excluded before organic/commercial classification.
 */
export type IneligibilityCategory =
  | "test_reel"
  | "trial_reel"
  | "draft_content"
  | "internal_qa"
  | "accidental_post";

export type BenchmarkEligibility = {
  isEligible: boolean;
  ineligibilityCategory: IneligibilityCategory | null;
  matchedSignals: string[];
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type CommercialCategory =
  | "explicit_disclosure"
  | "brand_campaign"
  | "brand_affiliation"
  | "brand_mention"
  | "branded_hashtag"
  | "branded_promo_copy"
  | "paid_partnership_tag"
  | null;

/**
 * A content item with its classification result attached.
 * Used in both organic and commercial buckets so the UI can show
 * exclusion reasons for commercial content.
 */
export type ClassifiedReel = ReelItem & {
  isCommercial: boolean;
  classificationCategory: CommercialCategory;
  matchedSignals: string[];
  benchmarkEligible: boolean;
  ineligibilityCategory: IneligibilityCategory | null;
  ineligibilitySignals: string[];
};

/** Platform-agnostic classified item */
export type ClassifiedItem = ContentItem & {
  isCommercial: boolean;
  classificationCategory: CommercialCategory;
  matchedSignals: string[];
  benchmarkEligible: boolean;
  ineligibilityCategory: IneligibilityCategory | null;
  ineligibilitySignals: string[];
};

// ---------------------------------------------------------------------------
// Benchmark result types
// ---------------------------------------------------------------------------

/**
 * Benchmark status:
 * - 'complete': bucket has exactly MAX_BUCKET_SIZE items → full confidence
 * - 'partial': bucket has fewer items → average is computed but low confidence
 * - 'empty': bucket has no items → no average
 */
export type BenchmarkStatus = "complete" | "partial" | "empty";

/**
 * One side of the dual benchmark: either organic or commercial.
 */
export type BenchmarkBucket = {
  status: BenchmarkStatus;
  averageViews: number | null;
  sampleSize: number;
  maxSampleSize: number;
  reels: ClassifiedReel[] | ClassifiedItem[];
  warnings: string[];
};

/**
 * Comparison metrics between organic and commercial benchmarks.
 * Only present when both buckets have data.
 */
export type ComparisonMetrics = {
  /** Organic average minus commercial average */
  delta: number;
  /** Commercial / Organic ratio (e.g., 0.8 = ads get 80% of organic views) */
  adToOrganicRatio: number;
  /** Which bucket has higher average views */
  strongerBucket: "organic" | "commercial" | "equal";
};

export type AnalyzeResult = {
  platform: Platform;
  username: string;
  analyzedAt: string;
  source: ProviderSource;
  cacheHit: boolean;

  organic: BenchmarkBucket;
  commercial: BenchmarkBucket;
  comparison: ComparisonMetrics | null;

  excludedNonReelCount: number;
  excludedTestReelCount: number;
  totalReelCount: number;

  /** Warnings / limitation notes (e.g. TikTok research API restricted) */
  warnings?: string[];
  /** Provider capability notes for the UI */
  limitations?: string[];
};

// ---------------------------------------------------------------------------
// Profile summary (follower counts, display name, etc.)
// ---------------------------------------------------------------------------

export type { StoryVisibility, StorySourceMode, StoryConfidence, StoryEstimateRange } from "./story-visibility";
export type { CarouselVisibility, CarouselSourceMode, CarouselConfidence, CarouselItemEstimate } from "./carousel-visibility";
export type {
  DeliverableType, Money, QuoteSourceMode, PricingComponentType, PricingComponent,
  DeliverableQuote, PackageQuote, ImpressionForecastMode, ImpressionForecast,
  CpmMode, CpmRange, DeliverableCpmAnalysis, ForecastSignals, CreatorBudgetRow,
  BenchmarkEntry,
} from "./budget-cpm";

export type ProfileSummary = {
  platform: Platform;
  username: string;
  displayName: string | null;
  followerCount: number | null;
  followingCount: number | null;
  verified: boolean | null;
  profilePicUrl: string | null;
  source: ProviderSource;
};

export type ProviderResult = {
  items: ContentItem[];
  totalFetched: number;
  source: ProviderSource;
  platform: Platform;
  /** Profile stats extracted from provider (followers, display name, etc.) */
  profile?: ProfileSummary | null;
  /** Legacy alias for backward compat */
  reels?: ReelItem[];
};

// ---------------------------------------------------------------------------
// Cross-platform analysis types
// ---------------------------------------------------------------------------

/** Per-platform analysis result including profile + benchmarks */
export type PlatformAnalysis = {
  platform: Platform;
  username: string;
  profile: ProfileSummary | null;
  organic: BenchmarkBucket;
  commercial: BenchmarkBucket;
  comparison: ComparisonMetrics | null;
  /** Instagram Story Visibility (capability-gated) */
  storyVisibility?: import("./story-visibility").StoryVisibility | null;
  /** Instagram Carousel Visibility (capability-gated) */
  carouselVisibility?: import("./carousel-visibility").CarouselVisibility | null;
  source: ProviderSource;
  totalContentCount: number;
  limitations: string[];
  status: "ok" | "partial" | "error";
  error?: string;
};

/** Multi-platform response for the /api/analyze-all route */
export type MultiPlatformResult = {
  analyzedAt: string;
  query: {
    instagram?: string | null;
    tiktok?: string | null;
  };
  platforms: {
    instagram?: PlatformAnalysis;
    tiktok?: PlatformAnalysis;
  };
};

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type AnalyzeError = {
  code:
    | "INVALID_USERNAME"
    | "ACCOUNT_NOT_FOUND"
    | "PRIVATE_ACCOUNT"
    | "UNSUPPORTED_ACCOUNT"
    | "PROFESSIONAL_DATA_UNAVAILABLE"
    | "INVALID_CREDENTIALS"
    | "META_TIMEOUT"
    | "META_RATE_LIMIT"
    | "TIKTOK_ACCESS_RESTRICTED"
    | "TIKTOK_RATE_LIMIT"
    | "MALFORMED_RESPONSE"
    | "ZERO_REELS"
    | "ZERO_CONTENT"
    | "UNKNOWN_ERROR";
  message: string;
  statusCode: number;
};

