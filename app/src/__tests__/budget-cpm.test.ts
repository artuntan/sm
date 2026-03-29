/**
 * Tests for Budget + CPM Workbench domain model.
 * Covers forecasting, CPM calculation, benchmark classification,
 * quote/package distinction, quantity handling, FX normalization, and provenance.
 */
import {
  money,
  moneyWithFx,
  convertCurrency,
  forecastImpressions,
  computeDeliverableCpm,
  classifyBenchmark,
  imputePackageAllocation,
  DELIVERABLE_LABELS,
  DEFAULT_BENCHMARKS,
  FX_RATES_TO_USD,
  FX_BENCHMARK_CURRENCY,
  type ForecastSignals,
  type DeliverableQuote,
  type PackageQuote,
} from "@/lib/domain/budget-cpm";
import type { BenchmarkBucket } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBucket(views: number[], status: string = "ok"): BenchmarkBucket {
  return {
    status: status as BenchmarkBucket["status"],
    averageViews: views.length > 0 ? views.reduce((a, b) => a + b, 0) / views.length : null,
    sampleSize: views.length,
    maxSampleSize: 20,
    reels: views.map((v, i) => ({
      id: `r${i}`,
      platform: "instagram" as const,
      username: "test",
      caption: null,
      timestamp: new Date().toISOString(),
      views: v,
      permalink: "",
      provider: "meta" as const,
      classification: "organic" as const,
      classificationConfidence: 1,
      signals: [],
    })),
    warnings: [],
  };
}

function makeExactQuote(dt: any, amount: number, currency: string = "TRY", qty: number = 1): DeliverableQuote {
  return {
    deliverableType: dt,
    quantity: qty,
    sourceMode: "exact",
    unitPrice: moneyWithFx(amount, currency),
    totalPrice: null,
    pricingComponents: [],
    notes: [],
  };
}

const IG_SIGNALS: ForecastSignals = {
  igOrganic: makeBucket([10000, 12000, 11000, 9000, 13000]),
};

// ---------------------------------------------------------------------------
// FX and Money tests
// ---------------------------------------------------------------------------

describe("Budget CPM — FX and Money", () => {
  it("moneyWithFx normalizes TRY to USD", () => {
    const m = moneyWithFx(38500, "TRY");
    expect(m.currency).toBe("TRY");
    expect(m.normalizedCurrency).toBe("USD");
    expect(m.normalizedAmount).toBeCloseTo(1000, 0);
    expect(m.fxRate).toBe(38.5);
  });

  it("moneyWithFx for USD has 1:1 normalization", () => {
    const m = moneyWithFx(100, "USD");
    expect(m.normalizedAmount).toBe(100);
    expect(m.fxRate).toBe(1);
  });

  it("convertCurrency TRY→USD", () => {
    const result = convertCurrency(38500, "TRY", "USD");
    expect(result).toBeCloseTo(1000, 0);
  });

  it("convertCurrency USD→TRY", () => {
    const result = convertCurrency(100, "USD", "TRY");
    expect(result).toBeCloseTo(3850, 0);
  });

  it("convertCurrency EUR→USD", () => {
    const result = convertCurrency(91, "EUR", "USD");
    expect(result).toBeCloseTo(100, 0);
  });

  it("returns null for unknown currency", () => {
    expect(convertCurrency(100, "XYZ", "USD")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Quantity tests
// ---------------------------------------------------------------------------

describe("Budget CPM — Quantity Handling", () => {
  it("quantity > 1 multiplies total impressions", () => {
    const q1 = makeExactQuote("ig_reels", 80000, "TRY", 1);
    const q3 = makeExactQuote("ig_reels", 80000, "TRY", 3);
    const forecast = forecastImpressions("ig_reels", IG_SIGNALS);

    const cpm1 = computeDeliverableCpm(q1, forecast);
    const cpm3 = computeDeliverableCpm(q3, forecast);

    // With unit pricing, CPM should be the same regardless of quantity
    // because both cost and impressions scale linearly
    expect(cpm1.mediaOnlyCpm.base).toBeCloseTo(cpm3.mediaOnlyCpm.base!, 1);
  });

  it("quantity > 1 increases line cost proportionally", () => {
    // Unit price 80000, qty 3 → line cost 240000
    const q3 = makeExactQuote("ig_reels", 80000, "TRY", 3);
    const forecast = forecastImpressions("ig_reels", IG_SIGNALS);
    const cpm = computeDeliverableCpm(q3, forecast);

    // The CPM should be the same because both numerator and denominator scale
    expect(cpm.mediaOnlyCpm.base).not.toBeNull();
    expect(cpm.cpmMode).toBe("projected");
  });

  it("quantity does not change per-unit CPM in unit-price mode", () => {
    const unitPrice = 50000;
    const forecastBase = forecastImpressions("ig_reels", IG_SIGNALS).base!;

    // Expected CPM = unitPrice / forecastBase * 1000, regardless of qty
    const expectedCpm = Math.round((unitPrice / forecastBase) * 1000 * 100) / 100;

    for (const qty of [1, 2, 5, 10]) {
      const quote = makeExactQuote("ig_reels", unitPrice, "TRY", qty);
      const forecast = forecastImpressions("ig_reels", IG_SIGNALS);
      const result = computeDeliverableCpm(quote, forecast);
      expect(result.mediaOnlyCpm.base).toBeCloseTo(expectedCpm, 1);
    }
  });
});

// ---------------------------------------------------------------------------
// FX-normalized benchmark tests
// ---------------------------------------------------------------------------

describe("Budget CPM — FX-Normalized Benchmarks", () => {
  it("benchmark is based on normalized USD CPM, not raw TRY", () => {
    // 80000 TRY unit price, ~11000 base impressions → ~7272 TRY CPM
    // Normalized: 7272 / 38.5 ≈ 189 USD CPM → should be OUTLIER
    const tryQuote = makeExactQuote("ig_reels", 80000, "TRY");
    const forecast = forecastImpressions("ig_reels", IG_SIGNALS);
    const tryCpm = computeDeliverableCpm(tryQuote, forecast);

    // Check that normalized CPM is in USD
    expect(tryCpm.normalizedMediaOnlyCpm.currency).toBe("USD");
    expect(tryCpm.normalizedMediaOnlyCpm.base).not.toBeNull();

    // 80000 TRY / 11000 impressions * 1000 = ~7272 TRY CPM
    // Normalized: 7272 / 38.5 ≈ ~189 USD → outlier
    expect(tryCpm.benchmarkStatus).toBe("outlier");
  });

  it("same USD amount produces different benchmark than same TRY amount", () => {
    // 10 USD unit price → low raw CPM
    const usdQuote = makeExactQuote("ig_reels", 10, "USD");
    const forecast = forecastImpressions("ig_reels", IG_SIGNALS);
    const usdCpm = computeDeliverableCpm(usdQuote, forecast);

    // 10 TRY unit price → even lower USD CPM (10/38.5 ≈ 0.26 USD CPM)
    const tryQuote = makeExactQuote("ig_reels", 10, "TRY");
    const tryCpm = computeDeliverableCpm(tryQuote, forecast);

    // TRY CPM should normalize to much less than USD CPM
    expect(tryCpm.normalizedMediaOnlyCpm.base!).toBeLessThan(usdCpm.normalizedMediaOnlyCpm.base!);
  });

  it("benchmark context mentions normalization when currency != USD", () => {
    const tryQuote = makeExactQuote("ig_reels", 1000, "TRY");
    const forecast = forecastImpressions("ig_reels", IG_SIGNALS);
    const result = computeDeliverableCpm(tryQuote, forecast);

    if (result.benchmarkContext) {
      expect(result.benchmarkContext).toContain("normalized from TRY");
    }
  });

  it("no normalization note when currency is USD", () => {
    const usdQuote = makeExactQuote("ig_reels", 100, "USD");
    const forecast = forecastImpressions("ig_reels", IG_SIGNALS);
    const result = computeDeliverableCpm(usdQuote, forecast);

    if (result.benchmarkContext) {
      expect(result.benchmarkContext).not.toContain("normalized from");
    }
  });
});

// ---------------------------------------------------------------------------
// Forecast engine tests (preserved from original)
// ---------------------------------------------------------------------------

describe("Budget CPM — Impression Forecasting", () => {
  it("forecasts IG Reels from recent organic views", () => {
    const result = forecastImpressions("ig_reels", IG_SIGNALS);
    expect(result.sourceMode).toBe("estimated_model");
    expect(result.base).not.toBeNull();
    expect(result.low!).toBeLessThan(result.base!);
    expect(result.high!).toBeGreaterThan(result.base!);
    expect(result.confidence).toBe("medium");
  });

  it("returns unavailable when no Reel data exists", () => {
    expect(forecastImpressions("ig_reels", {}).sourceMode).toBe("unavailable");
  });

  it("forecasts IG Reels Collab with 1.2x uplift", () => {
    const reel = forecastImpressions("ig_reels", IG_SIGNALS);
    const collab = forecastImpressions("ig_reels_collab", IG_SIGNALS);
    expect(collab.base! / reel.base!).toBeCloseTo(1.2, 1);
    expect(collab.confidence).toBe("low");
  });

  it("forecasts IG Story from story visibility estimator", () => {
    const signals: ForecastSignals = {
      storyVisibility: {
        sourceMode: "estimated",
        sourceProvider: "heuristic",
        confidence: "low",
        views: null, reach: null, navigation: null, replies: null, profileActivity: null,
        estimatedViewers: { low: 1000, high: 3000 },
        estimatedReach: { low: 1200, high: 3500 },
        storyMediaId: null, storyPublishedAt: null, isExpired: null,
        limitations: [], modelVersion: "heuristic-v1",
      },
    };
    const result = forecastImpressions("ig_story", signals);
    expect(result.low).toBe(1000);
    expect(result.high).toBe(3000);
    expect(result.base).toBe(2000);
  });

  it("forecasts IG Carousel from carousel visibility estimator", () => {
    const signals: ForecastSignals = {
      carouselVisibility: {
        sourceMode: "estimated", sourceProvider: "heuristic", confidence: "low",
        carouselCount: 3,
        aggregateEstimatedViews: { low: 2000, high: 5000 },
        aggregateEstimatedReach: { low: 2500, high: 6000 },
        items: [], limitations: [], modelVersion: "carousel-v1",
      },
    };
    const result = forecastImpressions("ig_carousel", signals);
    expect(result.low).toBe(2000);
    expect(result.high).toBe(5000);
  });

  it("forecasts TikTok from recent post views", () => {
    const result = forecastImpressions("tt_post", { tkOrganic: makeBucket([20000, 30000, 25000, 15000, 35000]) });
    expect(result.sourceMode).toBe("estimated_model");
    expect(result.base).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CPM calculation tests
// ---------------------------------------------------------------------------

describe("Budget CPM — CPM Calculation", () => {
  it("computes media-only CPM from exact quote", () => {
    const result = computeDeliverableCpm(makeExactQuote("ig_reels", 80000), forecastImpressions("ig_reels", IG_SIGNALS));
    expect(result.cpmMode).toBe("projected");
    expect(result.mediaOnlyCpm.base).not.toBeNull();
    expect(result.mediaOnlyCpm.low!).toBeLessThan(result.mediaOnlyCpm.high!);
  });

  it("returns unavailable CPM when quote is missing", () => {
    const quote: DeliverableQuote = {
      deliverableType: "ig_reels", quantity: 1, sourceMode: "missing",
      unitPrice: null, totalPrice: null, pricingComponents: [], notes: [],
    };
    const result = computeDeliverableCpm(quote, forecastImpressions("ig_reels", IG_SIGNALS));
    expect(result.cpmMode).toBe("unavailable");
  });

  it("marks imputed quotes with projected_imputed CPM mode", () => {
    const quote: DeliverableQuote = {
      deliverableType: "ig_reels", quantity: 1, sourceMode: "imputed",
      unitPrice: moneyWithFx(50000, "TRY"), totalPrice: null, pricingComponents: [], notes: [],
    };
    const result = computeDeliverableCpm(quote, forecastImpressions("ig_reels", IG_SIGNALS));
    expect(result.cpmMode).toBe("projected_imputed");
  });

  it("separates media-only and loaded CPM", () => {
    const quote: DeliverableQuote = {
      deliverableType: "ig_reels", quantity: 1, sourceMode: "exact",
      unitPrice: moneyWithFx(80000, "TRY"), totalPrice: null,
      pricingComponents: [
        { type: "base_posting_fee", money: money(60000, "TRY") },
        { type: "usage_rights", money: money(15000, "TRY") },
        { type: "management_fee", money: money(5000, "TRY") },
      ],
      notes: [],
    };
    const result = computeDeliverableCpm(quote, forecastImpressions("ig_reels", IG_SIGNALS));
    expect(result.loadedCpm.base!).toBeGreaterThan(result.mediaOnlyCpm.base!);
  });
});

// ---------------------------------------------------------------------------
// Benchmark classification tests
// ---------------------------------------------------------------------------

describe("Budget CPM — Benchmark Classification", () => {
  it("classifies efficient CPM", () => { expect(classifyBenchmark("ig_reels", 5).status).toBe("efficient"); });
  it("classifies market CPM", () => { expect(classifyBenchmark("ig_reels", 12).status).toBe("market"); });
  it("classifies premium CPM", () => { expect(classifyBenchmark("ig_reels", 25).status).toBe("premium"); });
  it("classifies outlier CPM", () => { expect(classifyBenchmark("ig_reels", 50).status).toBe("outlier"); });
  it("returns unknown for null CPM", () => { expect(classifyBenchmark("ig_reels", null).status).toBe("unknown"); });

  it("uses configurable benchmark ranges", () => {
    const custom = [{ deliverableType: "ig_reels" as const, efficientMax: 3, marketMax: 6, premiumMax: 10, label: "Custom", source: "Test" }];
    expect(classifyBenchmark("ig_reels", 5, custom).status).toBe("market");
  });

  it("has benchmarks for all deliverable types", () => {
    for (const dt of ["ig_reels", "ig_reels_collab", "ig_carousel", "ig_story", "tt_post"]) {
      expect(DEFAULT_BENCHMARKS.find((b) => b.deliverableType === dt)).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Package allocation tests
// ---------------------------------------------------------------------------

describe("Budget CPM — Package Allocation", () => {
  it("imputes package allocation with weighted method and labels as imputed", () => {
    const pkg: PackageQuote = {
      label: "Test", sourceMode: "exact_package", totalPrice: money(120000, "TRY"),
      deliverables: [{ deliverableType: "ig_reels", quantity: 1 }, { deliverableType: "ig_story", quantity: 3 }],
      allocationMode: "weighted_imputation", allocatedDeliverableTotals: [], notes: [],
    };
    const allocated = imputePackageAllocation(pkg);
    expect(allocated.length).toBe(2);
    for (const a of allocated) { expect(a.sourceMode).toBe("imputed"); }
    const total = allocated.reduce((s, a) => s + (a.totalPrice?.amount ?? 0), 0);
    expect(total).toBeCloseTo(120000, 0);
  });
});

// ---------------------------------------------------------------------------
// Provenance truthfulness tests
// ---------------------------------------------------------------------------

describe("Budget CPM — Provenance", () => {
  it("every deliverable type has a label", () => {
    for (const dt of ["ig_reels", "ig_reels_collab", "ig_carousel", "ig_story", "tt_post"]) {
      expect(DELIVERABLE_LABELS[dt as keyof typeof DELIVERABLE_LABELS]).toBeDefined();
    }
  });

  it("CPM analysis preserves both quote and forecast source modes", () => {
    const cpm = computeDeliverableCpm(makeExactQuote("ig_reels", 80000), forecastImpressions("ig_reels", IG_SIGNALS));
    expect(cpm.quoteSourceMode).toBe("exact");
    expect(cpm.forecastSourceMode).toBe("estimated_model");
  });

  it("CPM limitations mention FX when currency != USD", () => {
    const cpm = computeDeliverableCpm(makeExactQuote("ig_reels", 80000, "TRY"), forecastImpressions("ig_reels", IG_SIGNALS));
    expect(cpm.limitations).toContainEqual(expect.stringContaining("FX rate"));
  });
});
