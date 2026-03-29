/**
 * Tests for Instagram Story Visibility capability-gated model.
 * Covers the estimator, factory helpers, and truth-state distinguishability.
 */
import {
  estimateStoryVisibility,
  makeUnavailable,
  makeExactConnected,
  type StoryVisibility,
} from "@/lib/domain/story-visibility";

describe("Story Visibility — estimator", () => {
  it("returns 'estimated' mode with range and confidence for a valid follower count", () => {
    const result = estimateStoryVisibility(50_000, null);

    expect(result.sourceMode).toBe("estimated");
    expect(result.sourceProvider).toBe("heuristic");
    expect(result.confidence).toBe("low"); // 50K followers → low confidence tier
    expect(result.estimatedViewers).not.toBeNull();
    expect(result.estimatedViewers!.low).toBeGreaterThan(0);
    expect(result.estimatedViewers!.low).toBeLessThan(result.estimatedViewers!.high);
    expect(result.estimatedReach).not.toBeNull();
    expect(result.estimatedReach!.low).toBeGreaterThan(0);
    expect(result.estimatedReach!.low).toBeLessThan(result.estimatedReach!.high);
    expect(result.modelVersion).toBe("heuristic-v1");
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("returns 'unavailable' when follower count is null", () => {
    const result = estimateStoryVisibility(null, null);

    expect(result.sourceMode).toBe("unavailable");
    expect(result.sourceProvider).toBe("none");
    expect(result.estimatedViewers).toBeNull();
    expect(result.estimatedReach).toBeNull();
    expect(result.limitations).toContainEqual(
      expect.stringContaining("Follower count not available")
    );
  });

  it("returns 'unavailable' when follower count is 0", () => {
    const result = estimateStoryVisibility(0, null);

    expect(result.sourceMode).toBe("unavailable");
  });

  it("gives medium confidence for small accounts (<10K followers)", () => {
    const result = estimateStoryVisibility(5_000, null);

    expect(result.sourceMode).toBe("estimated");
    expect(result.confidence).toBe("medium");
    // Small accounts should have higher view rate → bigger relative range
    expect(result.estimatedViewers!.low).toBeGreaterThan(0);
  });

  it("gives low confidence for large accounts (>100K followers)", () => {
    const result = estimateStoryVisibility(500_000, null);

    expect(result.sourceMode).toBe("estimated");
    expect(result.confidence).toBe("low");
  });

  it("calibrates estimate when avgReelViews is provided", () => {
    // Same follower count, different Reel engagement
    const baseResult = estimateStoryVisibility(100_000, null);
    const calibratedHigh = estimateStoryVisibility(100_000, 50_000); // high engagement
    const calibratedLow = estimateStoryVisibility(100_000, 1_000);  // low engagement

    // Higher Reel engagement → higher story estimate
    expect(calibratedHigh.estimatedViewers!.high).toBeGreaterThan(
      calibratedLow.estimatedViewers!.high
    );

    // Calibrated estimate should differ from base (uncalibrated)
    expect(calibratedHigh.estimatedViewers!.low).not.toBe(
      baseResult.estimatedViewers!.low
    );
  });

  it("includes calibration note when avgReelViews is used", () => {
    const result = estimateStoryVisibility(50_000, 10_000);

    expect(result.limitations).toContainEqual(
      expect.stringContaining("calibrated using observed Reel performance")
    );
  });

  it("exact metrics are null in estimated mode", () => {
    const result = estimateStoryVisibility(100_000, null);

    expect(result.views).toBeNull();
    expect(result.reach).toBeNull();
    expect(result.navigation).toBeNull();
    expect(result.replies).toBeNull();
    expect(result.profileActivity).toBeNull();
  });

  it("range always has low < high", () => {
    const testCounts = [100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000];
    for (const count of testCounts) {
      const result = estimateStoryVisibility(count, null);
      if (result.estimatedViewers) {
        expect(result.estimatedViewers.low).toBeLessThan(result.estimatedViewers.high);
      }
      if (result.estimatedReach) {
        expect(result.estimatedReach.low).toBeLessThan(result.estimatedReach.high);
      }
    }
  });
});

describe("Story Visibility — truth states are distinguishable", () => {
  it("estimated mode cannot be mistaken for exact mode", () => {
    const estimated = estimateStoryVisibility(100_000, null);
    const exact = makeExactConnected({
      views: 5000,
      reach: 6000,
      storyMediaId: "story_123",
      publishedAt: "2026-03-14T10:00:00Z",
      isExpired: false,
    });

    // Source modes are explicitly different
    expect(estimated.sourceMode).toBe("estimated");
    expect(exact.sourceMode).toBe("exact_connected");

    // Estimated has ranges, not exact values
    expect(estimated.estimatedViewers).not.toBeNull();
    expect(estimated.views).toBeNull();

    // Exact has exact values, not ranges
    expect(exact.views).not.toBeNull();
    expect(exact.views!.isExact).toBe(true);
    expect(exact.estimatedViewers).toBeNull();
  });

  it("unavailable mode is distinct from estimated mode", () => {
    const unavailable = makeUnavailable("No data source available");
    const estimated = estimateStoryVisibility(100_000, null);

    expect(unavailable.sourceMode).toBe("unavailable");
    expect(estimated.sourceMode).toBe("estimated");
    expect(unavailable.estimatedViewers).toBeNull();
    expect(unavailable.limitations).toContain("No data source available");
  });
});

describe("Story Visibility — exact_connected factory", () => {
  it("creates exact story with full metrics", () => {
    const result = makeExactConnected({
      views: 10000,
      reach: 12000,
      navigation: 500,
      replies: 25,
      profileActivity: 150,
      storyMediaId: "story_456",
      publishedAt: "2026-03-14T10:00:00Z",
      isExpired: false,
    });

    expect(result.sourceMode).toBe("exact_connected");
    expect(result.sourceProvider).toBe("meta");
    expect(result.confidence).toBe("high");
    expect(result.views!.value).toBe(10000);
    expect(result.views!.isExact).toBe(true);
    expect(result.reach!.value).toBe(12000);
    expect(result.navigation!.value).toBe(500);
    expect(result.replies!.value).toBe(25);
    expect(result.profileActivity!.value).toBe(150);
    expect(result.storyMediaId).toBe("story_456");
    expect(result.isExpired).toBe(false);
  });

  it("handles expired stories with appropriate limitation", () => {
    const result = makeExactConnected({
      views: 5000,
      storyMediaId: "story_expired",
      publishedAt: "2026-03-13T10:00:00Z",
      isExpired: true,
    });

    expect(result.isExpired).toBe(true);
    expect(result.limitations).toContainEqual(
      expect.stringContaining("expired")
    );
  });
});

describe("Story Visibility — API response shape", () => {
  it("preserves provenance and confidence in all modes", () => {
    const modes: StoryVisibility[] = [
      estimateStoryVisibility(50_000, null),
      makeUnavailable("Test reason"),
      makeExactConnected({
        views: 1000,
        storyMediaId: "s1",
        publishedAt: "2026-03-14T10:00:00Z",
        isExpired: false,
      }),
    ];

    for (const story of modes) {
      // Every mode must have explicit source provenance
      expect(story.sourceMode).toBeDefined();
      expect(story.sourceProvider).toBeDefined();
      expect(story.confidence).toBeDefined();
      expect(story.limitations).toBeDefined();
      expect(Array.isArray(story.limitations)).toBe(true);
    }
  });
});
