/**
 * Tests for ScanCacheService — tiered freshness logic.
 *
 * Tests the evaluateFreshness function which determines whether
 * a cached provider result is fresh, stale, or expired.
 */

import { evaluateFreshness } from "@/lib/services/scan-cache-service";

describe("ScanCacheService", () => {
  describe("evaluateFreshness", () => {
    it("returns 'fresh' for results fetched < 2 hours ago", () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      expect(evaluateFreshness(thirtyMinAgo)).toBe("fresh");
    });

    it("returns 'fresh' for results fetched 1 hour ago", () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(evaluateFreshness(oneHourAgo)).toBe("fresh");
    });

    it("returns 'stale' for results fetched 3 hours ago", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(evaluateFreshness(threeHoursAgo)).toBe("stale");
    });

    it("returns 'stale' for results fetched 12 hours ago", () => {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      expect(evaluateFreshness(twelveHoursAgo)).toBe("stale");
    });

    it("returns 'stale' for results fetched 23 hours ago", () => {
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
      expect(evaluateFreshness(twentyThreeHoursAgo)).toBe("stale");
    });

    it("returns 'expired' for results fetched 25 hours ago", () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      expect(evaluateFreshness(twentyFiveHoursAgo)).toBe("expired");
    });

    it("returns 'expired' for results fetched 3 days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(evaluateFreshness(threeDaysAgo)).toBe("expired");
    });

    it("returns 'expired' for results fetched 8 days ago", () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(evaluateFreshness(eightDaysAgo)).toBe("expired");
    });

    it("returns 'fresh' for results fetched just now", () => {
      const now = new Date().toISOString();
      expect(evaluateFreshness(now)).toBe("fresh");
    });
  });
});
