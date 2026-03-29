/**
 * Tests for Instagram Carousel Visibility capability-gated model.
 * Covers multi-signal estimator, confidence scoring, age normalization,
 * and truth-state distinguishability.
 */
import {
  estimateCarouselItemViews,
  estimateCarouselVisibility,
  makeCarouselUnavailable,
  makeExactCarousel,
  type CarouselEstimationInput,
} from "@/lib/domain/carousel-visibility";

// Fixed reference time for deterministic tests
const NOW = new Date("2026-03-14T12:00:00Z");

function makeInput(overrides: Partial<CarouselEstimationInput> = {}): CarouselEstimationInput {
  return {
    mediaId: "carousel_1",
    permalink: "https://instagram.com/p/test1/",
    timestamp: "2026-03-10T12:00:00Z", // 4 days ago — mature post
    likeCount: 500,
    commentsCount: 20,
    followerCount: 50_000,
    avgReelViews: 10_000,
    now: NOW,
    ...overrides,
  };
}

describe("Carousel Visibility — multi-signal estimator", () => {
  it("returns estimated mode with range and confidence", () => {
    const result = estimateCarouselItemViews(makeInput());

    expect(result.sourceMode).toBe("estimated");
    expect(result.estimatedViews).not.toBeNull();
    expect(result.estimatedViews!.low).toBeGreaterThan(0);
    expect(result.estimatedViews!.low).toBeLessThan(result.estimatedViews!.high);
    expect(result.estimatedReach).not.toBeNull();
    expect(result.estimatedReach!.low).toBeGreaterThan(0);
    expect(result.exactViews).toBeNull();
    expect(result.exactReach).toBeNull();
  });

  it("uses engagement inversion when likes/comments are available", () => {
    const withEngagement = estimateCarouselItemViews(makeInput({
      likeCount: 1000,
      commentsCount: 50,
    }));
    const withoutEngagement = estimateCarouselItemViews(makeInput({
      likeCount: null,
      commentsCount: null,
    }));

    // With engagement signals, the estimate should differ from follower-only
    expect(withEngagement.estimatedViews!.low).not.toBe(
      withoutEngagement.estimatedViews!.low
    );
  });

  it("uses account calibration from Reel performance", () => {
    const highReels = estimateCarouselItemViews(makeInput({ avgReelViews: 50_000 }));
    const lowReels = estimateCarouselItemViews(makeInput({ avgReelViews: 1_000 }));

    // Higher Reel performance → higher carousel estimate
    expect(highReels.estimatedViews!.high).toBeGreaterThan(
      lowReels.estimatedViews!.high
    );
  });

  it("degrades confidence when engagement data is missing", () => {
    const withSignals = estimateCarouselItemViews(makeInput({
      likeCount: 500,
      commentsCount: 20,
      avgReelViews: 10_000,
    }));
    const withoutSignals = estimateCarouselItemViews(makeInput({
      likeCount: null,
      commentsCount: null,
      avgReelViews: null,
    }));

    // With multiple signals, should get medium confidence
    // Without signals, should stay low
    expect(withoutSignals.limitations).toContainEqual(
      expect.stringContaining("No Reel performance data")
    );
    expect(withoutSignals.limitations).toContainEqual(
      expect.stringContaining("No engagement data")
    );
  });
});

describe("Carousel Visibility — age normalization", () => {
  it("widens range for very recent posts (< 6h)", () => {
    const recentPost = estimateCarouselItemViews(makeInput({
      timestamp: "2026-03-14T10:00:00Z", // 2 hours ago
    }));
    const maturePost = estimateCarouselItemViews(makeInput({
      timestamp: "2026-03-10T12:00:00Z", // 4 days ago
    }));

    // Recent post should have wider range (higher uncertainty)
    const recentSpread = recentPost.estimatedViews!.high - recentPost.estimatedViews!.low;
    const matureSpread = maturePost.estimatedViews!.high - maturePost.estimatedViews!.low;
    expect(recentSpread).toBeGreaterThan(matureSpread);
  });

  it("marks very recent posts with age limitation", () => {
    const result = estimateCarouselItemViews(makeInput({
      timestamp: "2026-03-14T10:00:00Z",
    }));

    expect(result.limitations).toContainEqual(
      expect.stringContaining("less than 48 hours")
    );
    expect(result.confidence).toBe("low");
  });

  it("reports post age in hours", () => {
    const result = estimateCarouselItemViews(makeInput({
      timestamp: "2026-03-12T12:00:00Z", // 2 days ago
    }));

    expect(result.postAgeHours).toBe(48);
  });
});

describe("Carousel Visibility — disagreement penalty", () => {
  it("widens range when signals disagree materially", () => {
    // Huge likes but tiny follower count → signals should disagree
    const disagreeing = estimateCarouselItemViews(makeInput({
      followerCount: 1_000,
      likeCount: 5_000,   // Unrealistically high for 1K followers
      commentsCount: 100,
      avgReelViews: 500,
    }));

    expect(disagreeing.limitations).toContainEqual(
      expect.stringContaining("signals disagree")
    );
  });
});

describe("Carousel Visibility — aggregate estimator", () => {
  it("aggregates across multiple carousel posts", () => {
    const result = estimateCarouselVisibility({
      items: [
        { mediaId: "c1", permalink: null, timestamp: "2026-03-10T12:00:00Z", likeCount: 500, commentsCount: 20 },
        { mediaId: "c2", permalink: null, timestamp: "2026-03-09T12:00:00Z", likeCount: 300, commentsCount: 10 },
        { mediaId: "c3", permalink: null, timestamp: "2026-03-08T12:00:00Z", likeCount: 700, commentsCount: 30 },
      ],
      followerCount: 50_000,
      avgReelViews: 10_000,
      now: NOW,
    });

    expect(result.sourceMode).toBe("estimated");
    expect(result.carouselCount).toBe(3);
    expect(result.aggregateEstimatedViews).not.toBeNull();
    expect(result.aggregateEstimatedViews!.low).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(5);
    expect(result.modelVersion).toBe("carousel-v1");
  });

  it("returns unavailable when follower count is null", () => {
    const result = estimateCarouselVisibility({
      items: [{ mediaId: "c1", permalink: null, timestamp: "2026-03-10T12:00:00Z", likeCount: 100, commentsCount: 5 }],
      followerCount: null,
      avgReelViews: null,
      now: NOW,
    });

    expect(result.sourceMode).toBe("unavailable");
    expect(result.aggregateEstimatedViews).toBeNull();
  });

  it("returns unavailable when no carousel items exist", () => {
    const result = estimateCarouselVisibility({
      items: [],
      followerCount: 50_000,
      avgReelViews: 10_000,
      now: NOW,
    });

    expect(result.sourceMode).toBe("unavailable");
  });
});

describe("Carousel Visibility — truth states are distinguishable", () => {
  it("estimated mode cannot be mistaken for exact mode", () => {
    const estimated = estimateCarouselItemViews(makeInput());
    const exact = makeExactCarousel({
      views: 5000,
      reach: 6000,
      mediaId: "carousel_exact",
      permalink: "https://instagram.com/p/exact/",
      timestamp: "2026-03-10T12:00:00Z",
    });

    expect(estimated.sourceMode).toBe("estimated");
    expect(exact.sourceMode).toBe("exact_connected");
    expect(estimated.estimatedViews).not.toBeNull();
    expect(estimated.exactViews).toBeNull();
    expect(exact.exactViews).toBe(5000);
    expect(exact.estimatedViews).toBeNull();
  });

  it("unavailable is distinct", () => {
    const unavailable = makeCarouselUnavailable("No data");

    expect(unavailable.sourceMode).toBe("unavailable");
    expect(unavailable.aggregateEstimatedViews).toBeNull();
    expect(unavailable.carouselCount).toBe(0);
  });
});

describe("Carousel Visibility — range integrity", () => {
  it("range always has low < high across follower tiers", () => {
    const tiers = [100, 1_000, 10_000, 100_000, 1_000_000];
    for (const fc of tiers) {
      const result = estimateCarouselItemViews(makeInput({ followerCount: fc }));
      expect(result.estimatedViews!.low).toBeLessThan(result.estimatedViews!.high);
      expect(result.estimatedReach!.low).toBeLessThan(result.estimatedReach!.high);
    }
  });
});
