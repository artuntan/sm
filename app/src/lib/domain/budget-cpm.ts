/**
 * Budget + CPM Workbench — Domain Model, Forecast Engine, CPM Calculator
 *
 * Professional pricing system for influencer campaign planning.
 * Replaces manual Excel workflows with structured, provenance-aware computation.
 *
 * Core principles:
 * - CPM denominator is IMPRESSIONS, never followers
 * - Exact vs imputed vs projected states always explicit
 * - Package allocations clearly labeled as imputed
 * - Media-only and loaded CPM computed separately
 * - Benchmark comparison with configurable ranges
 * - Benchmarks are in USD; user-entered currency is FX-normalized before comparison
 */

import type { BenchmarkBucket } from "./types";
import type { StoryVisibility } from "./story-visibility";
import type { CarouselVisibility } from "./carousel-visibility";

// ---------------------------------------------------------------------------
// Deliverable taxonomy
// ---------------------------------------------------------------------------

export type DeliverableType =
  | "ig_reels"
  | "ig_reels_collab"
  | "ig_carousel"
  | "ig_story"
  | "tt_post";

export const DELIVERABLE_LABELS: Record<DeliverableType, string> = {
  ig_reels: "IG Reels",
  ig_reels_collab: "IG Reels Collab",
  ig_carousel: "IG Carousel",
  ig_story: "IG Story",
  tt_post: "TikTok Post",
};

// ---------------------------------------------------------------------------
// FX Table — configurable static priors
// ---------------------------------------------------------------------------

/**
 * Static FX rates to USD.  Rates are directional priors, not live quotes.
 * To update: replace values and update FX_SNAPSHOT_DATE.
 *
 * rate = how many units of this currency per 1 USD.
 * E.g. TRY 38.5 means 1 USD = 38.5 TRY.
 */
export const FX_RATES_TO_USD: Record<string, number> = {
  USD: 1,
  TRY: 38.5,
  EUR: 0.91,
};

/** When the FX snapshot was taken (for provenance labeling) */
export const FX_SNAPSHOT_DATE = "2025-03-01";
export const FX_BENCHMARK_CURRENCY = "USD";

/** Symbol map for display */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  TRY: "₺",
  EUR: "€",
};

/**
 * Convert an amount from one currency to another using the static FX table.
 * Returns null if either currency is unknown.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number | null {
  const fromRate = FX_RATES_TO_USD[fromCurrency];
  const toRate = FX_RATES_TO_USD[toCurrency];
  if (fromRate === undefined || toRate === undefined) return null;
  // amount in FROM → USD → TO
  const usdAmount = amount / fromRate;
  return usdAmount * toRate;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type Money = {
  amount: number;
  currency: string;           // TRY, USD, EUR, etc.
  normalizedAmount: number | null;
  normalizedCurrency: string | null;
  fxRate: number | null;
};

/** Create Money without FX normalization */
export function money(amount: number, currency: string): Money {
  return { amount, currency, normalizedAmount: null, normalizedCurrency: null, fxRate: null };
}

/** Create Money with FX normalization to USD */
export function moneyWithFx(amount: number, currency: string): Money {
  const rate = FX_RATES_TO_USD[currency];
  if (rate === undefined) {
    return money(amount, currency);
  }
  const normalizedAmount = Math.round((amount / rate) * 100) / 100;
  return {
    amount,
    currency,
    normalizedAmount,
    normalizedCurrency: FX_BENCHMARK_CURRENCY,
    fxRate: rate,
  };
}

// ---------------------------------------------------------------------------
// Pricing decomposition
// ---------------------------------------------------------------------------

export type PricingComponentType =
  | "base_posting_fee"
  | "production"
  | "editing"
  | "usage_rights"
  | "whitelisting"
  | "exclusivity"
  | "management_fee"
  | "gifted_value"
  | "shipping"
  | "package_discount"
  | "other";

export type PricingComponent = {
  type: PricingComponentType;
  money: Money;
  notes?: string[];
};

// ---------------------------------------------------------------------------
// Quote types
// ---------------------------------------------------------------------------

export type QuoteSourceMode = "exact" | "imputed" | "missing";

export type DeliverableQuote = {
  deliverableType: DeliverableType;
  quantity: number;
  sourceMode: QuoteSourceMode;
  unitPrice: Money | null;
  totalPrice: Money | null;
  pricingComponents: PricingComponent[];
  notes: string[];
};

export type PackageQuote = {
  label: string;
  sourceMode: "exact_package" | "imputed_allocation";
  totalPrice: Money;
  deliverables: Array<{
    deliverableType: DeliverableType;
    quantity: number;
  }>;
  allocationMode: "manual" | "weighted_imputation" | "none";
  allocatedDeliverableTotals: DeliverableQuote[];
  notes: string[];
};

// ---------------------------------------------------------------------------
// Impression forecasting
// ---------------------------------------------------------------------------

export type ImpressionForecastMode =
  | "exact_historical"
  | "estimated_model"
  | "manual_override"
  | "unavailable";

export type ImpressionForecast = {
  deliverableType: DeliverableType;
  sourceMode: ImpressionForecastMode;
  confidence: "low" | "medium" | "high";
  low: number | null;
  base: number | null;
  high: number | null;
  limitations: string[];
  sourceLabel: string;
};

// ---------------------------------------------------------------------------
// CPM
// ---------------------------------------------------------------------------

export type CpmMode =
  | "projected"
  | "projected_imputed"
  | "realized"
  | "guaranteed"
  | "unavailable";

export type CpmRange = {
  low: number | null;
  base: number | null;
  high: number | null;
  currency: string | null;
};

export type DeliverableCpmAnalysis = {
  deliverableType: DeliverableType;
  cpmMode: CpmMode;
  quoteSourceMode: QuoteSourceMode;
  forecastSourceMode: ImpressionForecastMode;
  mediaOnlyCpm: CpmRange;
  loadedCpm: CpmRange;
  /** CPM normalized to benchmark currency (USD) for comparison */
  normalizedMediaOnlyCpm: CpmRange;
  benchmarkStatus: "efficient" | "market" | "premium" | "outlier" | "unknown";
  benchmarkContext: string | null;
  limitations: string[];
};

// ---------------------------------------------------------------------------
// Forecast engine
// ---------------------------------------------------------------------------

/** Input signals from the platform analysis for forecasting */
export type ForecastSignals = {
  igOrganic?: BenchmarkBucket | null;
  igCommercial?: BenchmarkBucket | null;
  storyVisibility?: StoryVisibility | null;
  carouselVisibility?: CarouselVisibility | null;
  tkOrganic?: BenchmarkBucket | null;
  tkCommercial?: BenchmarkBucket | null;
  igFollowerCount?: number | null;
  tkFollowerCount?: number | null;
};

/**
 * Compute a winsorized median from a set of views.
 * Trims top/bottom 10% before taking median to resist outliers.
 */
function winsorizedMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.max(1, Math.floor(sorted.length * 0.1));

  // Winsorize: clamp extremes to the 10th/90th percentile value
  const lower = sorted[Math.min(trimCount, sorted.length - 1)];
  const upper = sorted[Math.max(0, sorted.length - 1 - trimCount)];
  const winsorized = sorted.map((v) => Math.min(Math.max(v, lower), upper));

  const mid = Math.floor(winsorized.length / 2);
  return winsorized.length % 2 === 0
    ? Math.round((winsorized[mid - 1] + winsorized[mid]) / 2)
    : winsorized[mid];
}

/** Extract view counts from a benchmark bucket's classified items */
function extractViews(bucket: BenchmarkBucket): number[] {
  return (bucket.reels ?? [])
    .map((r) => ("views" in r ? r.views : null))
    .filter((v): v is number => v !== null && v > 0);
}

/**
 * Forecast impressions for a single deliverable type.
 * Routes to the correct estimation strategy per format.
 */
export function forecastImpressions(
  deliverableType: DeliverableType,
  signals: ForecastSignals
): ImpressionForecast {
  switch (deliverableType) {
    case "ig_reels":
      return forecastIgReels(signals);
    case "ig_reels_collab":
      return forecastIgReelsCollab(signals);
    case "ig_carousel":
      return forecastIgCarousel(signals);
    case "ig_story":
      return forecastIgStory(signals);
    case "tt_post":
      return forecastTtPost(signals);
    default:
      return makeUnavailableForecast(deliverableType, "Unknown deliverable type.");
  }
}

function forecastIgReels(signals: ForecastSignals): ImpressionForecast {
  const views = extractViews(signals.igOrganic ?? { status: "empty", averageViews: null, sampleSize: 0, maxSampleSize: 0, reels: [], warnings: [] });
  const median = winsorizedMedian(views);

  if (median === null || views.length < 2) {
    return makeUnavailableForecast("ig_reels", "Insufficient Reel data for forecasting.");
  }

  const low = Math.round(median * 0.7);
  const high = Math.round(median * 1.4);
  const confidence = views.length >= 5 ? "medium" : "low";

  return {
    deliverableType: "ig_reels",
    sourceMode: "estimated_model",
    confidence,
    low,
    base: median,
    high,
    limitations: views.length < 5
      ? [`Only ${views.length} Reels available — estimate may be volatile.`]
      : [],
    sourceLabel: `Winsorized median of ${views.length} recent Reels`,
  };
}

function forecastIgReelsCollab(signals: ForecastSignals): ImpressionForecast {
  const reelForecast = forecastIgReels(signals);

  if (reelForecast.base === null) {
    return makeUnavailableForecast("ig_reels_collab", "Cannot forecast collab — no Reel baseline.");
  }

  // Collab uplift: co-posted Reels often reach ~1.2x standard Reel audience
  const COLLAB_UPLIFT = 1.2;

  return {
    deliverableType: "ig_reels_collab",
    sourceMode: "estimated_model",
    confidence: "low", // Always lower than standard Reel
    low: Math.round(reelForecast.low! * COLLAB_UPLIFT),
    base: Math.round(reelForecast.base * COLLAB_UPLIFT),
    high: Math.round(reelForecast.high! * COLLAB_UPLIFT),
    limitations: [
      "Derived from standard Reel forecast with 1.2× collab uplift.",
      "Actual collab performance depends on partner audience overlap.",
    ],
    sourceLabel: "Reel forecast × 1.2 collab uplift",
  };
}

function forecastIgCarousel(signals: ForecastSignals): ImpressionForecast {
  const cv = signals.carouselVisibility;

  if (cv && cv.sourceMode === "estimated" && cv.aggregateEstimatedViews) {
    const base = Math.round((cv.aggregateEstimatedViews.low + cv.aggregateEstimatedViews.high) / 2);
    return {
      deliverableType: "ig_carousel",
      sourceMode: "estimated_model",
      confidence: cv.confidence === "high" ? "high" : cv.confidence === "medium" ? "medium" : "low",
      low: cv.aggregateEstimatedViews.low,
      base,
      high: cv.aggregateEstimatedViews.high,
      limitations: ["Carousel views estimated — not available via public Meta API."],
      sourceLabel: "Carousel visibility estimator (multi-signal model)",
    };
  }

  return makeUnavailableForecast("ig_carousel", "No carousel visibility data available.");
}

function forecastIgStory(signals: ForecastSignals): ImpressionForecast {
  const sv = signals.storyVisibility;

  if (sv && sv.sourceMode === "estimated" && sv.estimatedViewers) {
    const base = Math.round((sv.estimatedViewers.low + sv.estimatedViewers.high) / 2);
    return {
      deliverableType: "ig_story",
      sourceMode: "estimated_model",
      confidence: sv.confidence === "high" ? "high" : sv.confidence === "medium" ? "medium" : "low",
      low: sv.estimatedViewers.low,
      base,
      high: sv.estimatedViewers.high,
      limitations: ["Story views estimated — not available for arbitrary public accounts."],
      sourceLabel: "Story visibility estimator (tier-based heuristic)",
    };
  }

  return makeUnavailableForecast("ig_story", "No story visibility data available.");
}

function forecastTtPost(signals: ForecastSignals): ImpressionForecast {
  const views = extractViews(signals.tkOrganic ?? { status: "empty", averageViews: null, sampleSize: 0, maxSampleSize: 0, reels: [], warnings: [] });
  const median = winsorizedMedian(views);

  if (median === null || views.length < 2) {
    return makeUnavailableForecast("tt_post", "Insufficient TikTok data for forecasting.");
  }

  // TikTok has higher variance — wider range
  const low = Math.round(median * 0.6);
  const high = Math.round(median * 1.5);
  const confidence = views.length >= 5 ? "medium" : "low";

  return {
    deliverableType: "tt_post",
    sourceMode: "estimated_model",
    confidence,
    low,
    base: median,
    high,
    limitations: views.length < 5
      ? [`Only ${views.length} TikTok posts available — estimate may be volatile.`]
      : [],
    sourceLabel: `Winsorized median of ${views.length} recent TikTok posts`,
  };
}

function makeUnavailableForecast(dt: DeliverableType, reason: string): ImpressionForecast {
  return {
    deliverableType: dt,
    sourceMode: "unavailable",
    confidence: "low",
    low: null,
    base: null,
    high: null,
    limitations: [reason],
    sourceLabel: "Unavailable",
  };
}

// ---------------------------------------------------------------------------
// CPM Calculator  (quantity-aware, FX-normalized)
// ---------------------------------------------------------------------------

/**
 * Compute CPM for a single deliverable.
 *
 * Quantity handling:
 *   lineCost        = unitPrice.amount × quantity   (or totalPrice.amount if already a line total)
 *   lineImpressions = perUnitForecast × quantity
 *   lineCPM         = (lineCost / lineImpressions) × 1000
 *
 * FX handling:
 *   CPM is first computed in entered currency (display CPM).
 *   Then normalized to USD via FX table for benchmark comparison.
 */
export function computeDeliverableCpm(
  quote: DeliverableQuote,
  forecast: ImpressionForecast
): DeliverableCpmAnalysis {
  const limitations: string[] = [];
  const qty = Math.max(1, quote.quantity);

  // --- Resolve line cost ---
  let lineCost: number | null = null;
  let currency: string = "USD";

  if (quote.unitPrice !== null && quote.unitPrice.amount > 0) {
    // Unit price mode: line cost = unit × qty
    lineCost = quote.unitPrice.amount * qty;
    currency = quote.unitPrice.currency;
  } else if (quote.totalPrice !== null && quote.totalPrice.amount > 0) {
    // Line total mode: cost is the entered total (already covers all units)
    lineCost = quote.totalPrice.amount;
    currency = quote.totalPrice.currency;
  }

  if (lineCost === null || lineCost <= 0) {
    return makeUnavailableCpm(quote.deliverableType, quote.sourceMode, forecast.sourceMode, "No quote amount entered.");
  }

  // --- Resolve line impressions ---
  if (forecast.base === null || forecast.base <= 0) {
    return makeUnavailableCpm(quote.deliverableType, quote.sourceMode, forecast.sourceMode, "No impression forecast available.");
  }

  // Line impressions = per-unit forecast × quantity
  const lineImpLow = (forecast.low ?? forecast.base) * qty;
  const lineImpBase = forecast.base * qty;
  const lineImpHigh = (forecast.high ?? forecast.base) * qty;

  // --- Split into media-only and loaded costs ---
  const mediaComponentTypes: PricingComponentType[] = [
    "base_posting_fee", "production", "editing", "package_discount",
  ];
  const loadedComponentTypes: PricingComponentType[] = [
    "usage_rights", "whitelisting", "exclusivity", "management_fee",
    "gifted_value", "shipping", "other",
  ];

  let mediaOnlyCost = lineCost;
  let loadedExtra = 0;

  if (quote.pricingComponents.length > 0) {
    mediaOnlyCost = quote.pricingComponents
      .filter((c) => mediaComponentTypes.includes(c.type))
      .reduce((sum, c) => sum + c.money.amount, 0);
    loadedExtra = quote.pricingComponents
      .filter((c) => loadedComponentTypes.includes(c.type))
      .reduce((sum, c) => sum + c.money.amount, 0);
  }

  const loadedCost = mediaOnlyCost + loadedExtra;

  // --- Compute CPM in display currency ---
  const makeCpmRange = (cost: number): CpmRange => ({
    low: lineImpHigh > 0 ? Math.round((cost / lineImpHigh) * 1000 * 100) / 100 : null,
    base: lineImpBase > 0 ? Math.round((cost / lineImpBase) * 1000 * 100) / 100 : null,
    high: lineImpLow > 0 ? Math.round((cost / lineImpLow) * 1000 * 100) / 100 : null,
    currency,
  });

  const mediaOnlyCpm = makeCpmRange(mediaOnlyCost);
  const loadedCpm = makeCpmRange(loadedCost);

  // --- FX-normalize media-only CPM to USD for benchmark ---
  const normalizedMediaOnlyCpm = normalizeCpmRange(mediaOnlyCpm, currency);

  // --- Determine CPM mode ---
  let cpmMode: CpmMode = "projected";
  if (quote.sourceMode === "imputed") {
    cpmMode = "projected_imputed";
  }

  if (quote.sourceMode === "imputed") {
    limitations.push("Quote is imputed from package allocation — not creator-provided.");
  }
  if (forecast.sourceMode === "estimated_model") {
    limitations.push("Impressions are model-estimated, not observed.");
  }
  if (currency !== FX_BENCHMARK_CURRENCY) {
    limitations.push(`Benchmark comparison uses FX rate ${currency}/${FX_BENCHMARK_CURRENCY} = ${FX_RATES_TO_USD[currency] ?? "?"} (snapshot: ${FX_SNAPSHOT_DATE}).`);
  }

  // --- Benchmark comparison on NORMALIZED CPM ---
  const benchmarkResult = classifyBenchmark(
    quote.deliverableType,
    normalizedMediaOnlyCpm.base,
    DEFAULT_BENCHMARKS,
    currency
  );

  return {
    deliverableType: quote.deliverableType,
    cpmMode,
    quoteSourceMode: quote.sourceMode,
    forecastSourceMode: forecast.sourceMode,
    mediaOnlyCpm,
    loadedCpm,
    normalizedMediaOnlyCpm,
    benchmarkStatus: benchmarkResult.status,
    benchmarkContext: benchmarkResult.context,
    limitations,
  };
}

/** Normalize a CPM range from display currency to benchmark currency (USD) */
function normalizeCpmRange(cpm: CpmRange, fromCurrency: string): CpmRange {
  const convert = (v: number | null): number | null => {
    if (v === null) return null;
    const converted = convertCurrency(v, fromCurrency, FX_BENCHMARK_CURRENCY);
    return converted !== null ? Math.round(converted * 100) / 100 : null;
  };
  return {
    low: convert(cpm.low),
    base: convert(cpm.base),
    high: convert(cpm.high),
    currency: FX_BENCHMARK_CURRENCY,
  };
}

function makeUnavailableCpm(
  dt: DeliverableType,
  qs: QuoteSourceMode,
  fs: ImpressionForecastMode,
  reason: string
): DeliverableCpmAnalysis {
  return {
    deliverableType: dt,
    cpmMode: "unavailable",
    quoteSourceMode: qs,
    forecastSourceMode: fs,
    mediaOnlyCpm: { low: null, base: null, high: null, currency: null },
    loadedCpm: { low: null, base: null, high: null, currency: null },
    normalizedMediaOnlyCpm: { low: null, base: null, high: null, currency: null },
    benchmarkStatus: "unknown",
    benchmarkContext: null,
    limitations: [reason],
  };
}

// ---------------------------------------------------------------------------
// Benchmark engine  (USD-normalized, currency-aware context)
// ---------------------------------------------------------------------------

/** CPM benchmark ranges by deliverable type (in USD) */
export type BenchmarkEntry = {
  deliverableType: DeliverableType;
  efficientMax: number;
  marketMax: number;
  premiumMax: number;
  label: string;
  source: string;
};

export const DEFAULT_BENCHMARKS: BenchmarkEntry[] = [
  { deliverableType: "ig_reels",       efficientMax: 8,  marketMax: 15, premiumMax: 30, label: "IG Reels",       source: "Industry aggregate 2024-2025" },
  { deliverableType: "ig_reels_collab",efficientMax: 10, marketMax: 18, premiumMax: 35, label: "IG Reels Collab",source: "Industry aggregate 2024-2025" },
  { deliverableType: "ig_carousel",    efficientMax: 6,  marketMax: 12, premiumMax: 25, label: "IG Carousel",    source: "Industry aggregate 2024-2025" },
  { deliverableType: "ig_story",       efficientMax: 15, marketMax: 35, premiumMax: 60, label: "IG Story",       source: "Industry aggregate 2024-2025" },
  { deliverableType: "tt_post",        efficientMax: 5,  marketMax: 10, premiumMax: 22, label: "TikTok Post",    source: "Industry aggregate 2024-2025" },
];

/**
 * Classify a CPM value against benchmark ranges.
 * cpm must already be in USD (the benchmark currency).
 * displayCurrency is used only for formatting the context string.
 */
export function classifyBenchmark(
  deliverableType: DeliverableType,
  cpm: number | null,
  benchmarks: BenchmarkEntry[] = DEFAULT_BENCHMARKS,
  displayCurrency: string = "USD"
): { status: "efficient" | "market" | "premium" | "outlier" | "unknown"; context: string | null } {
  if (cpm === null) {
    return { status: "unknown", context: null };
  }

  const entry = benchmarks.find((b) => b.deliverableType === deliverableType);
  if (!entry) {
    return { status: "unknown", context: `No benchmark available for ${deliverableType}` };
  }

  // Format context in benchmark currency (USD) to avoid confusion
  const sym = CURRENCY_SYMBOLS[FX_BENCHMARK_CURRENCY] ?? FX_BENCHMARK_CURRENCY;
  const fxNote = displayCurrency !== FX_BENCHMARK_CURRENCY
    ? ` (normalized from ${displayCurrency})`
    : "";

  if (cpm <= entry.efficientMax) {
    return { status: "efficient", context: `Below ${entry.label} market rate (≤${sym}${entry.efficientMax} CPM${fxNote})` };
  }
  if (cpm <= entry.marketMax) {
    return { status: "market", context: `Within ${entry.label} market range (${sym}${entry.efficientMax}-${sym}${entry.marketMax} CPM${fxNote})` };
  }
  if (cpm <= entry.premiumMax) {
    return { status: "premium", context: `Premium for ${entry.label} (${sym}${entry.marketMax}-${sym}${entry.premiumMax} CPM${fxNote})` };
  }
  return { status: "outlier", context: `Above typical ${entry.label} range (>${sym}${entry.premiumMax} CPM${fxNote})` };
}

// ---------------------------------------------------------------------------
// Package allocation via weighted imputation
// ---------------------------------------------------------------------------

/**
 * Weight priors for allocating a package total across deliverable types.
 * These represent relative "standard market value" per impression unit.
 */
const FORMAT_WEIGHT_PRIORS: Record<DeliverableType, number> = {
  ig_reels: 1.0,
  ig_reels_collab: 1.3,
  ig_carousel: 0.7,
  ig_story: 0.5,
  tt_post: 0.8,
};

/**
 * Allocate a package total across its deliverables using weighted imputation.
 * Returns DeliverableQuote[] with sourceMode = "imputed".
 */
export function imputePackageAllocation(
  pkg: PackageQuote
): DeliverableQuote[] {
  const totalWeight = pkg.deliverables.reduce(
    (sum, d) => sum + (FORMAT_WEIGHT_PRIORS[d.deliverableType] ?? 1) * d.quantity,
    0
  );

  if (totalWeight <= 0) return [];

  return pkg.deliverables.map((d) => {
    const weight = (FORMAT_WEIGHT_PRIORS[d.deliverableType] ?? 1) * d.quantity;
    const allocatedAmount = Math.round((weight / totalWeight) * pkg.totalPrice.amount * 100) / 100;

    return {
      deliverableType: d.deliverableType,
      quantity: d.quantity,
      sourceMode: "imputed" as QuoteSourceMode,
      unitPrice: money(
        Math.round((allocatedAmount / d.quantity) * 100) / 100,
        pkg.totalPrice.currency
      ),
      totalPrice: money(allocatedAmount, pkg.totalPrice.currency),
      pricingComponents: [],
      notes: [
        `Imputed from package "${pkg.label}" via weighted allocation.`,
        `Weight: ${(weight / totalWeight * 100).toFixed(0)}% of package total.`,
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Creator budget row (the "spreadsheet row" model)
// ---------------------------------------------------------------------------

export type CreatorBudgetRow = {
  username: string;
  platform: "instagram" | "tiktok" | "both";
  igFollowerCount: number | null;
  tkFollowerCount: number | null;
  quotes: DeliverableQuote[];
  packageQuote: PackageQuote | null;
  forecasts: ImpressionForecast[];
  cpmAnalyses: DeliverableCpmAnalysis[];
};
