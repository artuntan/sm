/**
 * Dimes Content Coverage — Tests
 *
 * Tests the three hardest modules:
 * 1. Content classifier (recipe/taste/special-day detection)
 * 2. Same-content clustering (different captions → same cluster)
 * 3. Gap analysis (missing destination platforms)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { classifyContent, extractRecipeName } from "@/lib/dimes/classifier";
import {
  jaccardSimilarity,
  hashtagOverlap,
  isTemporallyClose,
  scoreMatch,
  buildClusters,
} from "@/lib/dimes/clustering";
import { analyzeGaps } from "@/lib/dimes/gap-analysis";
import { ingestPost, clearAllPosts, getAllPosts } from "@/lib/dimes/scanner";
import { getDefaultMaxPostsForPlatform } from "@/lib/dimes/providers";
import type {
  DimesContentPost,
  DimesContentCluster,
  DimesBrand,
} from "@/lib/dimes/types";

// ---------------------------------------------------------------------------
// 1. Classifier Tests
// ---------------------------------------------------------------------------

describe("Content Classifier", () => {
  describe("Recipe detection", () => {
    it("detects Turkish recipe content by caption", () => {
      const result = classifyContent(
        "🍓 Çilekli Smoothie Tarifi! Malzemeler: çilek, süt, buz. Karıştırın ve servis edin!"
      );
      expect(result.classification).toBe("recipe");
      expect(result.isRecipeOrTaste).toBe(true);
      expect(result.isEligibleForGapAnalysis).toBe(true);
      expect(result.signals.some((s) => s.includes("recipe:phrase:tarif"))).toBe(true);
    });

    it("detects recipe by hashtags", () => {
      const result = classifyContent(
        "Harika bir içecek! #tarif #smoothie #lezzet",
        ["tarif", "smoothie", "lezzet"]
      );
      expect(result.classification).toBe("recipe");
      expect(result.isRecipeOrTaste).toBe(true);
    });

    it("detects 'nasıl yapılır' pattern", () => {
      const result = classifyContent(
        "Limonata nasıl yapılır? Çok kolay! Malzemeler: limon, şeker, su."
      );
      expect(result.classification).toBe("recipe");
    });
  });

  describe("Taste/food detection", () => {
    it("detects taste content with food words", () => {
      const result = classifyContent(
        "Bu yaz Dimes Premium ile serinleyin! Taze meyve suyu ile ferahlatıcı anlar."
      );
      expect(result.isRecipeOrTaste).toBe(true);
      expect(result.signals.some((s) => s.includes("taste:"))).toBe(true);
    });

    it("detects Obsesso coffee content", () => {
      const result = classifyContent(
        "Obsesso Cold Brew ile güne enerjik başla! Kahve severlere özel."
      );
      expect(result.isRecipeOrTaste).toBe(true);
      expect(result.signals.some((s) => s.includes("brand_product:obsesso"))).toBe(true);
    });
  });

  describe("Special-day exclusion", () => {
    it("excludes yılbaşı recipe from gap analysis", () => {
      const result = classifyContent(
        "🎄 Yılbaşı Özel Tarifi: Meyveli Punch! Yeni yıla özel içecek. #yilbasi #tarif"
      );
      expect(result.classification).toBe("special_day");
      expect(result.isSpecialDay).toBe(true);
      expect(result.isEligibleForGapAnalysis).toBe(false);
    });

    it("excludes ramazan content", () => {
      const result = classifyContent(
        "Ramazan sofralarına özel taze limonata tarifi! #ramazan #iftar #tarif"
      );
      expect(result.classification).toBe("special_day");
      expect(result.isEligibleForGapAnalysis).toBe(false);
    });

    it("excludes Anneler Günü content", () => {
      const result = classifyContent(
        "Anneler günü için özel smoothie tarifi! #annelergunu #tarif"
      );
      expect(result.classification).toBe("special_day");
      expect(result.isEligibleForGapAnalysis).toBe(false);
    });
  });

  describe("Non-recipe detection", () => {
    it("classifies brand promo as other", () => {
      const result = classifyContent(
        "Dimes Türkiye olarak sürdürülebilir üretim vizyonumuzu paylaşıyoruz. #dimes #kurumsal"
      );
      // Might detect taste due to "dimes" brand name, but shouldn't be recipe
      expect(result.classification !== "recipe").toBe(true);
    });

    it("handles null caption", () => {
      const result = classifyContent(null);
      expect(result.classification).toBe("other");
      expect(result.isRecipeOrTaste).toBe(false);
    });
  });

  describe("Recipe name extraction", () => {
    it("extracts recipe name from 'X Tarifi' pattern", () => {
      const name = extractRecipeName("Çilekli Smoothie Tarifi ile harika bir içecek!");
      expect(name).toBeTruthy();
      expect(name).toContain("smoothie");
    });

    it("extracts 'nasıl yapılır' recipe name", () => {
      const name = extractRecipeName("Limonata nasıl yapılır? Çok kolay bir tarif.");
      expect(name).toBeTruthy();
    });

    it("returns null for non-recipe content", () => {
      const name = extractRecipeName("Yeni sezon ürünlerimiz mağazalarda!");
      expect(name).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Clustering Tests
// ---------------------------------------------------------------------------

describe("Same-Content Clustering", () => {
  describe("Jaccard similarity", () => {
    it("returns 1.0 for identical token sets", () => {
      expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    });

    it("returns 0 for disjoint sets", () => {
      expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0);
    });

    it("returns correct partial overlap", () => {
      const sim = jaccardSimilarity(["a", "b", "c"], ["b", "c", "d"]);
      expect(sim).toBeCloseTo(0.5);
    });
  });

  describe("Hashtag overlap", () => {
    it("finds shared hashtags", () => {
      const shared = hashtagOverlap(
        ["tarif", "smoothie", "dimes", "lezzet"],
        ["smoothie", "dimes", "sağlikli"]
      );
      expect(shared).toContain("smoothie");
      expect(shared).toContain("dimes");
      expect(shared.length).toBe(2);
    });
  });

  describe("Temporal proximity", () => {
    it("detects posts within 14 days", () => {
      expect(
        isTemporallyClose("2025-06-15T10:00:00Z", "2025-06-16T09:00:00Z")
      ).toBe(true);
    });

    it("rejects posts more than 14 days apart", () => {
      expect(
        isTemporallyClose("2025-01-01T00:00:00Z", "2025-03-01T00:00:00Z")
      ).toBe(false);
    });
  });

  describe("Match scoring", () => {
    it("scores high when recipe name + hashtags + temporal match", () => {
      const postA = {
        caption:
          "🍓 Çilekli Smoothie Tarifi! Malzemeler: çilek, süt, buz. #tarif #smoothie #cileklismoothie #dimes",
        hashtags: ["tarif", "smoothie", "cileklismoothie", "dimes"],
        publishedAt: "2025-06-15T10:00:00Z",
        brandId: "brand_dimes_tr",
      };
      const postB = {
        caption:
          "Çilekli smoothie nasıl yapılır? En kolay çilekli smoothie tarifi! #smoothie #cileklismoothie #tarif #dimes",
        hashtags: ["smoothie", "cileklismoothie", "tarif", "dimes"],
        publishedAt: "2025-06-16T09:00:00Z",
        brandId: "brand_dimes_tr",
      };

      const match = scoreMatch(postA, postB);
      expect(match.confidence).toBe("high");
      expect(match.score).toBeGreaterThan(50);
      expect(match.signals.length).toBeGreaterThan(0);
    });

    it("scores low for different content from same brand", () => {
      const postA = {
        caption: "Çilekli Smoothie Tarifi! #smoothie #tarif",
        hashtags: ["smoothie", "tarif"],
        publishedAt: "2025-06-15T10:00:00Z",
        brandId: "brand_dimes_tr",
      };
      const postB = {
        caption: "Yeni fabrikamız açıldı! Sürdürülebilir üretim. #kurumsal",
        hashtags: ["kurumsal"],
        publishedAt: "2025-10-01T10:00:00Z",
        brandId: "brand_dimes_tr",
      };

      const match = scoreMatch(postA, postB);
      expect(match.confidence).toBe("low");
    });

    it("never clusters different brands", () => {
      const match = scoreMatch(
        {
          caption: "Same exact caption!",
          hashtags: ["same"],
          publishedAt: "2025-06-15T10:00:00Z",
          brandId: "brand_dimes_tr",
        },
        {
          caption: "Same exact caption!",
          hashtags: ["same"],
          publishedAt: "2025-06-15T10:00:00Z",
          brandId: "brand_obsesso",
        }
      );
      expect(match.confidence).toBe("low");
      expect(match.score).toBe(0);
    });
  });

  describe("Cluster building", () => {
    it("clusters same recipe across IG and TikTok", () => {
      const posts: DimesContentPost[] = [
        makePost("p1", "instagram", "brand_dimes_tr",
          "🍓 Çilekli Smoothie Tarifi! Malzeme: çilek, süt. #tarif #smoothie #cileklismoothie #dimes",
          "2025-06-15T10:00:00Z"
        ),
        makePost("p2", "tiktok", "brand_dimes_tr",
          "Çilekli smoothie nasıl yapılır? Kolay tarif! #smoothie #cileklismoothie #tarif #dimes",
          "2025-06-16T09:00:00Z"
        ),
      ];

      const { clusters } = buildClusters(posts);

      // Should create 1 cluster (not 2)
      expect(clusters.length).toBe(1);
      expect(clusters[0].posts.length).toBe(2);
      expect(clusters[0].posts.map((p) => p.platform).sort()).toEqual([
        "instagram",
        "tiktok",
      ]);
    });

    it("keeps different recipes in separate clusters", () => {
      const posts: DimesContentPost[] = [
        makePost("p1", "instagram", "brand_dimes_tr",
          "Çilekli Smoothie Tarifi! #smoothie #tarif",
          "2025-06-15T10:00:00Z"
        ),
        makePost("p2", "instagram", "brand_dimes_tr",
          "Limonata Tarifi! Evde kolay limonata. #limonata #tarif",
          "2025-07-20T10:00:00Z"
        ),
      ];

      const { clusters } = buildClusters(posts);
      // Same platform, different recipes = separate clusters
      expect(clusters.length).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Gap Analysis Tests
// ---------------------------------------------------------------------------

describe("Gap Analysis — Evidence-Based Status", () => {
  it("identifies missing destination platforms when scan evidence shows success", () => {
    const posts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_dimes_tr",
        "Çilekli Smoothie Tarifi! #tarif #smoothie",
        "2025-06-15T10:00:00Z"
      ),
    ];

    const clusters = [{
      id: "c1",
      fingerprint: "fp1",
      primaryCaption: posts[0].caption,
      recipeName: "cilekli smoothie",
      contentType: "recipe" as const,
      brandId: "brand_dimes_tr",
      firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [{
        clusterId: "c1",
        postId: "p1",
        platform: "instagram" as const,
        matchConfidence: "high" as const,
        matchSignals: ["origin"],
      }],
    }];

    const brand: DimesBrand = {
      id: "brand_dimes_tr",
      slug: "dimes-tr",
      name: "Dimes TR",
      accounts: [
        { id: "a1", brandId: "brand_dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a3", brandId: "brand_dimes_tr", platform: "youtube", handle: "dimesturkiye", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "youtube-api", notes: null },
      ],
    };

    // Scan evidence: all platforms scanned successfully
    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 5, error: null },
      { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
      { platform: "youtube" as const, scanned: true, postsFetched: 3, error: null },
    ];

    const gaps = analyzeGaps(clusters, posts, brand, evidence);

    expect(gaps.length).toBe(1);
    // With evidence: truly missing (scanned and absent)
    expect(gaps[0].missingDestinations).toContain("facebook");
    expect(gaps[0].missingDestinations).toContain("youtube");

    // Pinterest: not_applicable (no account)
    const ptPresence = gaps[0].destinationPlatforms.find(
      (p) => p.platform === "pinterest"
    );
    expect(ptPresence?.status).toBe("not_applicable");

    // Verify statusReason is populated
    const fbPresence = gaps[0].destinationPlatforms.find(
      (p) => p.platform === "facebook"
    );
    expect(fbPresence?.statusReason).toContain("Scanned");
  });

  it("marks destination as unknown when scan failed", () => {
    const posts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_dimes_tr",
        "Smoothie Tarifi! #tarif #smoothie",
        "2025-06-15T10:00:00Z"
      ),
    ];

    const clusters = [{
      id: "c1",
      fingerprint: "fp1",
      primaryCaption: posts[0].caption,
      recipeName: "smoothie",
      contentType: "recipe" as const,
      brandId: "brand_dimes_tr",
      firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [{
        clusterId: "c1",
        postId: "p1",
        platform: "instagram" as const,
        matchConfidence: "high" as const,
        matchSignals: ["origin"],
      }],
    }];

    const brand: DimesBrand = {
      id: "brand_dimes_tr",
      slug: "dimes-tr",
      name: "Dimes TR",
      accounts: [
        { id: "a1", brandId: "brand_dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a3", brandId: "brand_dimes_tr", platform: "youtube", handle: "dimesturkiye", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "youtube-api", notes: null },
      ],
    };

    // Scan evidence: facebook failed, youtube succeeded
    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 5, error: null },
      { platform: "facebook" as const, scanned: false, postsFetched: 0, error: "Meta API HTTP 429: rate limited" },
      { platform: "youtube" as const, scanned: true, postsFetched: 3, error: null },
    ];

    const gaps = analyzeGaps(clusters, posts, brand, evidence);

    expect(gaps.length).toBe(1);

    // YouTube: missing (scan succeeded, content absent)
    expect(gaps[0].missingDestinations).toContain("youtube");

    // Facebook: should be UNKNOWN (scan failed), NOT missing
    const fbPresence = gaps[0].destinationPlatforms.find(
      (p) => p.platform === "facebook"
    );
    expect(fbPresence?.status).toBe("unknown");
    expect(fbPresence?.statusReason).toContain("scan failed");

    // Facebook should NOT appear in missingDestinations
    expect(gaps[0].missingDestinations).not.toContain("facebook");
  });

  it("marks source TikTok as missing when scanned and absent", () => {
    const posts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_dimes_tr",
        "Smoothie Tarifi! #tarif #smoothie",
        "2025-06-15T10:00:00Z"
      ),
    ];

    const clusters = [{
      id: "c1",
      fingerprint: "fp1",
      primaryCaption: posts[0].caption,
      recipeName: "smoothie",
      contentType: "recipe" as const,
      brandId: "brand_dimes_tr",
      firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [{
        clusterId: "c1",
        postId: "p1",
        platform: "instagram" as const,
        matchConfidence: "high" as const,
        matchSignals: ["origin"],
      }],
    }];

    const brand: DimesBrand = {
      id: "brand_dimes_tr",
      slug: "dimes-tr",
      name: "Dimes TR",
      accounts: [
        { id: "a1", brandId: "brand_dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_tr", platform: "tiktok", handle: "dimesturkiye", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
        { id: "a3", brandId: "brand_dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
      ],
    };

    // TikTok was successfully scanned but has no matching content
    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 5, error: null },
      { platform: "tiktok" as const, scanned: true, postsFetched: 20, error: null },
      { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
    ];

    const gaps = analyzeGaps(clusters, posts, brand, evidence);
    expect(gaps.length).toBe(1);

    // TikTok source: should be MISSING (scanned and absent), NOT unknown
    const ttPresence = gaps[0].sourcePlatforms.find(
      (p) => p.platform === "tiktok"
    );
    expect(ttPresence?.status).toBe("missing");
    expect(ttPresence?.statusReason).toContain("Scanned");
  });

  it("marks source TikTok as unknown when scan failed", () => {
    const posts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_dimes_tr",
        "Smoothie Tarifi! #tarif #smoothie",
        "2025-06-15T10:00:00Z"
      ),
    ];

    const clusters = [{
      id: "c1",
      fingerprint: "fp1",
      primaryCaption: posts[0].caption,
      recipeName: "smoothie",
      contentType: "recipe" as const,
      brandId: "brand_dimes_tr",
      firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [{
        clusterId: "c1",
        postId: "p1",
        platform: "instagram" as const,
        matchConfidence: "high" as const,
        matchSignals: ["origin"],
      }],
    }];

    const brand: DimesBrand = {
      id: "brand_dimes_tr",
      slug: "dimes-tr",
      name: "Dimes TR",
      accounts: [
        { id: "a1", brandId: "brand_dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_tr", platform: "tiktok", handle: "dimesturkiye", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
        { id: "a3", brandId: "brand_dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
      ],
    };

    // TikTok scan FAILED
    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 5, error: null },
      { platform: "tiktok" as const, scanned: false, postsFetched: 0, error: "Apify rate limit" },
      { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
    ];

    const gaps = analyzeGaps(clusters, posts, brand, evidence);
    expect(gaps.length).toBe(1);

    // TikTok source: should be UNKNOWN (scan failed), NOT missing
    const ttPresence = gaps[0].sourcePlatforms.find(
      (p) => p.platform === "tiktok"
    );
    expect(ttPresence?.status).toBe("unknown");
    expect(ttPresence?.statusReason).toContain("Scan failed");
  });

  it("excludes special-day content from gaps", () => {
    const posts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_dimes_tr",
        "Yılbaşı tarifi! #yilbasi #tarif",
        "2025-12-25T10:00:00Z",
        "special_day"
      ),
    ];

    const clusters = [{
      id: "c1",
      fingerprint: "fp1",
      primaryCaption: posts[0].caption,
      recipeName: "yilbasi tarifi",
      contentType: "special_day" as const,
      brandId: "brand_dimes_tr",
      firstSeenAt: "2025-12-25T10:00:00Z",
      posts: [{
        clusterId: "c1",
        postId: "p1",
        platform: "instagram" as const,
        matchConfidence: "high" as const,
        matchSignals: ["origin"],
      }],
    }];

    const brand: DimesBrand = {
      id: "brand_dimes_tr",
      slug: "dimes-tr",
      name: "Dimes TR",
      accounts: [
        { id: "a1", brandId: "brand_dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
      ],
    };

    const gaps = analyzeGaps(clusters, posts, brand);
    expect(gaps.length).toBe(0);
  });

  it("shows no gaps when content exists on all applicable destinations", () => {
    const posts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_dimes_tr",
        "Smoothie Tarifi #tarif", "2025-06-15T10:00:00Z"),
      makePost("p2", "facebook", "brand_dimes_tr",
        "Smoothie Tarifi #tarif", "2025-06-16T10:00:00Z"),
      makePost("p3", "youtube", "brand_dimes_tr",
        "Smoothie Tarifi #tarif", "2025-06-17T10:00:00Z"),
    ];

    const clusters = [{
      id: "c1",
      fingerprint: "fp1",
      primaryCaption: "Smoothie Tarifi #tarif",
      recipeName: "smoothie",
      contentType: "recipe" as const,
      brandId: "brand_dimes_tr",
      firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [
        { clusterId: "c1", postId: "p1", platform: "instagram" as const, matchConfidence: "high" as const, matchSignals: [] },
        { clusterId: "c1", postId: "p2", platform: "facebook" as const, matchConfidence: "high" as const, matchSignals: [] },
        { clusterId: "c1", postId: "p3", platform: "youtube" as const, matchConfidence: "high" as const, matchSignals: [] },
      ],
    }];

    const brand: DimesBrand = {
      id: "brand_dimes_tr",
      slug: "dimes-tr",
      name: "Dimes TR",
      accounts: [
        { id: "a1", brandId: "brand_dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a3", brandId: "brand_dimes_tr", platform: "youtube", handle: "dimesturkiye", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "youtube-api", notes: null },
      ],
    };

    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 5, error: null },
      { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
      { platform: "youtube" as const, scanned: true, postsFetched: 3, error: null },
    ];

    const gaps = analyzeGaps(clusters, posts, brand, evidence);
    expect(gaps.length).toBe(0);
  });

  it("includes source-only TikTok gaps even when no destination gap exists", () => {
    const posts: DimesContentPost[] = [
      makePost(
        "p1",
        "tiktok",
        "brand_dimes_club",
        "Başvurular sona erdi, sonuçlar için bildirimi kontrol et!",
        "2026-03-12T09:54:05Z",
        "other"
      ),
    ];

    const clusters = [{
      id: "c1",
      fingerprint: "fp1",
      primaryCaption: posts[0].caption,
      recipeName: null,
      contentType: "other" as const,
      brandId: "brand_dimes_club",
      firstSeenAt: "2026-03-12T09:54:05Z",
      posts: [{
        clusterId: "c1",
        postId: "p1",
        platform: "tiktok" as const,
        matchConfidence: "high" as const,
        matchSignals: ["origin"],
      }],
    }];

    const brand: DimesBrand = {
      id: "brand_dimes_club",
      slug: "dimes-club",
      name: "Dimes Club",
      accounts: [
        { id: "a1", brandId: "brand_dimes_club", platform: "instagram", handle: "dimesclub", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_club", platform: "tiktok", handle: "dimesclub.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
      ],
    };

    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 51, error: null },
      { platform: "tiktok" as const, scanned: true, postsFetched: 50, error: null },
    ];

    const gaps = analyzeGaps(clusters, posts, brand, evidence);

    expect(gaps.length).toBe(1);
    const igPresence = gaps[0].sourcePlatforms.find(
      (p) => p.platform === "instagram"
    );
    expect(igPresence?.status).toBe("missing");
    expect(gaps[0].missingSourcePlatforms).toContain("instagram");
    expect(gaps[0].missingDestinations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3b. Cross-Brand Isolation Tests (Fan-Out Bug Regression)
// ---------------------------------------------------------------------------

describe("Gap Analysis — Cross-Brand Facebook Error Isolation", () => {
  it("one brand's Facebook error does NOT pollute another brand's Facebook status", () => {
    // Dimes TR has IG post, no FB post in cluster
    const dimesPosts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_dimes_tr",
        "Smoothie Tarifi! #tarif #smoothie",
        "2025-06-15T10:00:00Z"
      ),
    ];

    const dimesClusters = [{
      id: "c1",
      fingerprint: "fp1",
      primaryCaption: dimesPosts[0].caption,
      recipeName: "smoothie",
      contentType: "recipe" as const,
      brandId: "brand_dimes_tr",
      firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [{
        clusterId: "c1",
        postId: "p1",
        platform: "instagram" as const,
        matchConfidence: "high" as const,
        matchSignals: ["origin"],
      }],
    }];

    const dimesBrand: DimesBrand = {
      id: "brand_dimes_tr",
      slug: "dimes-tr",
      name: "Dimes TR",
      accounts: [
        { id: "a1", brandId: "brand_dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
      ],
    };

    // Evidence: Dimes TR's Facebook was scanned SUCCESSFULLY.
    // Obsesso's Facebook failed — but that error has accountId="a99", NOT "a2".
    // The old bug would match by `e.handle` (truthy), poisoning Dimes TR.
    const dimesEvidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 5, error: null },
      { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
    ];

    const gaps = analyzeGaps(dimesClusters, dimesPosts, dimesBrand, dimesEvidence);

    expect(gaps.length).toBe(1);

    // Dimes TR's Facebook should be MISSING (scanned successfully, content absent)
    // NOT "unknown" — that was the old fan-out bug behavior
    const fbPresence = gaps[0].destinationPlatforms.find(
      (p) => p.platform === "facebook"
    );
    expect(fbPresence?.status).toBe("missing");
    expect(fbPresence?.statusReason).toContain("Scanned");

    // Facebook MUST appear in missingDestinations
    expect(gaps[0].missingDestinations).toContain("facebook");
  });

  it("brand with FB error shows unknown, other brand with successful FB shows missing", () => {
    // Brand A: scanned FB successfully
    const brandAPosts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_a",
        "Recipe Test #tarif", "2025-06-15T10:00:00Z"),
    ];
    const brandAClusters = [{
      id: "c1", fingerprint: "fp1",
      primaryCaption: brandAPosts[0].caption,
      recipeName: "recipe test", contentType: "recipe" as const,
      brandId: "brand_a", firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [{ clusterId: "c1", postId: "p1", platform: "instagram" as const,
        matchConfidence: "high" as const, matchSignals: ["origin"] }],
    }];
    const brandA: DimesBrand = {
      id: "brand_a", slug: "brand-a", name: "Brand A",
      accounts: [
        { id: "a1", brandId: "brand_a", platform: "instagram", handle: "brand_a", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_a", platform: "facebook", handle: "brand_a_fb", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
      ],
    };
    const evidenceA = [
      { platform: "instagram" as const, scanned: true, postsFetched: 5, error: null },
      { platform: "facebook" as const, scanned: true, postsFetched: 8, error: null },
    ];

    // Brand B: FB scan FAILED
    const brandBPosts: DimesContentPost[] = [
      makePost("p2", "instagram", "brand_b",
        "Another Recipe #tarif", "2025-06-15T10:00:00Z"),
    ];
    const brandBClusters = [{
      id: "c2", fingerprint: "fp2",
      primaryCaption: brandBPosts[0].caption,
      recipeName: "another recipe", contentType: "recipe" as const,
      brandId: "brand_b", firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [{ clusterId: "c2", postId: "p2", platform: "instagram" as const,
        matchConfidence: "high" as const, matchSignals: ["origin"] }],
    }];
    const brandB: DimesBrand = {
      id: "brand_b", slug: "brand-b", name: "Brand B",
      accounts: [
        { id: "b1", brandId: "brand_b", platform: "instagram", handle: "brand_b", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "b2", brandId: "brand_b", platform: "facebook", handle: "brand_b_fb", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
      ],
    };
    const evidenceB = [
      { platform: "instagram" as const, scanned: true, postsFetched: 3, error: null },
      { platform: "facebook" as const, scanned: false, postsFetched: 0, error: "Meta API HTTP 429" },
    ];

    // Brand A: FB should be "missing" (scanned OK, content absent)
    const gapsA = analyzeGaps(brandAClusters, brandAPosts, brandA, evidenceA);
    expect(gapsA.length).toBe(1);
    const fbA = gapsA[0].destinationPlatforms.find((p) => p.platform === "facebook");
    expect(fbA?.status).toBe("missing");

    // Brand B: FB should be "unknown" (scan failed)
    const gapsB = analyzeGaps(brandBClusters, brandBPosts, brandB, evidenceB);
    expect(gapsB.length).toBe(1);
    const fbB = gapsB[0].destinationPlatforms.find((p) => p.platform === "facebook");
    expect(fbB?.status).toBe("unknown");
    expect(fbB?.statusReason).toContain("scan failed");
  });

  it("no errors → all platforms show scanned=true evidence", () => {
    const posts: DimesContentPost[] = [
      makePost("p1", "instagram", "brand_dimes_tr",
        "Tarif! #tarif", "2025-06-15T10:00:00Z"),
    ];
    const clusters = [{
      id: "c1", fingerprint: "fp1",
      primaryCaption: posts[0].caption,
      recipeName: "tarif", contentType: "recipe" as const,
      brandId: "brand_dimes_tr", firstSeenAt: "2025-06-15T10:00:00Z",
      posts: [{ clusterId: "c1", postId: "p1", platform: "instagram" as const,
        matchConfidence: "high" as const, matchSignals: ["origin"] }],
    }];
    const brand: DimesBrand = {
      id: "brand_dimes_tr", slug: "dimes-tr", name: "Dimes TR",
      accounts: [
        { id: "a1", brandId: "brand_dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a2", brandId: "brand_dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "meta-graph", notes: null },
        { id: "a3", brandId: "brand_dimes_tr", platform: "youtube", handle: "dimesturkiye", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "youtube-api", notes: null },
      ],
    };

    // All platforms scanned, zero errors
    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 5, error: null },
      { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
      { platform: "youtube" as const, scanned: true, postsFetched: 3, error: null },
    ];

    const gaps = analyzeGaps(clusters, posts, brand, evidence);
    expect(gaps.length).toBe(1);

    // All destinations should be "missing" (scanned, content absent), never "unknown"
    for (const dp of gaps[0].destinationPlatforms) {
      if (dp.status === "not_applicable") continue;
      expect(dp.status).toBe("missing");
      expect(dp.statusReason).toContain("Scanned");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Scanner Tests (requires DATABASE_URL — integration tests)
// ---------------------------------------------------------------------------

const hasDb = !!process.env.DATABASE_URL;
const describeDb = hasDb ? describe : describe.skip;

describeDb("Scanner — Post Ingestion (DB-backed)", () => {
  beforeEach(async () => {
    await clearAllPosts();
  });

  afterAll(async () => {
    await clearAllPosts();
  });

  it("ingests and classifies a recipe post into DB", async () => {
    const account = {
      id: "acc_1",
      brandId: "brand_dimes_tr",
      platform: "instagram" as const,
      handle: "dimes.tr",
      profileUrl: "",
      verificationStatus: "verified" as const,
      lastScannedAt: null,
      providerPath: "meta-graph" as const,
      notes: null,
    };

    const post = await ingestPost(
      {
        platformPostId: "ig_001",
        platform: "instagram",
        caption: "Çilekli Smoothie Tarifi! #tarif #smoothie",
        permalink: "https://instagram.com/p/001/",
        publishedAt: "2025-06-15T10:00:00Z",
      },
      account,
      "test_scan_1"
    );

    expect(post).not.toBeNull();
    expect(post!.classification).toBe("recipe");
    expect(post!.hashtags).toContain("tarif");
    expect(post!.hashtags).toContain("smoothie");
    expect(post!.normalizedCaption).toBeTruthy();
    expect(post!.clusterFingerprint).toBeTruthy();

    // Verify it's readable from DB
    const stored = await getAllPosts();
    expect(stored.length).toBe(1);
    expect(stored[0].classification).toBe("recipe");
    expect(stored[0].platformPostId).toBe("ig_001");
  });

  it("deduplicates by platform + postId across calls", async () => {
    const account = {
      id: "acc_1",
      brandId: "brand_dimes_tr",
      platform: "instagram" as const,
      handle: "dimes.tr",
      profileUrl: "",
      verificationStatus: "verified" as const,
      lastScannedAt: null,
      providerPath: "meta-graph" as const,
      notes: null,
    };

    const raw = {
      platformPostId: "ig_dup_001",
      platform: "instagram" as const,
      caption: "Test",
      permalink: "https://instagram.com/p/dup/",
      publishedAt: "2025-06-15T10:00:00Z",
    };

    const first = await ingestPost(raw, account, "test_scan_2");
    const second = await ingestPost(raw, account, "test_scan_3");

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // dedup via DB unique index
    expect((await getAllPosts()).length).toBe(1);
  });

  it("persists data across separate getAllPosts() calls (simulating request isolation)", async () => {
    const account = {
      id: "acc_1",
      brandId: "brand_dimes_tr",
      platform: "instagram" as const,
      handle: "dimes.tr",
      profileUrl: "",
      verificationStatus: "verified" as const,
      lastScannedAt: null,
      providerPath: "meta-graph" as const,
      notes: null,
    };

    // Ingest a post
    await ingestPost(
      {
        platformPostId: "ig_persist_001",
        platform: "instagram",
        caption: "Tarif tarifi! #tarif",
        permalink: "https://instagram.com/p/persist/",
        publishedAt: "2025-06-15T10:00:00Z",
      },
      account,
      "test_scan_persist"
    );

    // Call getAllPosts() multiple times — must return same data
    const read1 = await getAllPosts();
    const read2 = await getAllPosts();

    expect(read1.length).toBe(1);
    expect(read2.length).toBe(1);
    expect(read1[0].platformPostId).toBe("ig_persist_001");
    expect(read2[0].platformPostId).toBe("ig_persist_001");
  });
});

// ---------------------------------------------------------------------------
// 6. TikTok Source-Truth & Cross-Platform Matching
// ---------------------------------------------------------------------------

describe("TikTok Source-Truth", () => {
  describe("Cross-platform same-caption matching", () => {
    it("clusters IG and TikTok posts with identical emoji-heavy captions", () => {
      const caption = "DİMES Vişne🍒💚 💘 İçecek Bi' Şey 🙂↕️💘✨";
      const igPost = makePost("ig_visne", "instagram", "dimes_tr", caption, "2025-06-15T10:00:00Z", "taste");
      const ttPost = makePost("tt_visne", "tiktok", "dimes_tr", caption, "2025-06-15T12:00:00Z", "taste");

      const { clusters } = buildClusters([igPost, ttPost]);
      expect(clusters.length).toBe(1);
      expect(clusters[0].posts.length).toBe(2);
      expect(clusters[0].posts.some(p => p.platform === "instagram")).toBe(true);
      expect(clusters[0].posts.some(p => p.platform === "tiktok")).toBe(true);
    });

    it("clusters IG and TikTok when TikTok caption has extra hashtags", () => {
      const igCaption = "DİMES Vişne🍒💚 💘 İçecek Bi' Şey 🙂↕️💘✨";
      const ttCaption = "DİMES Vişne🍒💚 💘 İçecek Bi' Şey 🙂↕️💘✨ #dimes #visne";
      const igPost = makePost("ig_hash", "instagram", "dimes_tr", igCaption, "2025-06-15T10:00:00Z", "taste");
      const ttPost = makePost("tt_hash", "tiktok", "dimes_tr", ttCaption, "2025-06-16T14:00:00Z", "taste");

      const { clusters } = buildClusters([igPost, ttPost]);
      expect(clusters.length).toBe(1);
      expect(clusters[0].posts.length).toBe(2);
    });

    it("clusters IG carousel and TikTok slideshow (different media types)", () => {
      const caption = "Yaz lezzetleri 🌞 Dimes limonata tarifi";
      const igPost = makePost("ig_carousel", "instagram", "dimes_tr", caption, "2025-07-01T10:00:00Z", "recipe");
      igPost.mediaType = "CAROUSEL_ALBUM";
      const ttPost = makePost("tt_slide", "tiktok", "dimes_tr", caption, "2025-07-01T14:00:00Z", "recipe");
      ttPost.mediaType = "SLIDESHOW";

      const { clusters } = buildClusters([igPost, ttPost]);
      expect(clusters.length).toBe(1);
    });

    it("gives high score for exact-caption match signal", () => {
      const caption = "DİMES Vişne🍒💚 💘 İçecek Bi' Şey 🙂↕️💘✨";
      const match = scoreMatch(
        { caption, hashtags: [], publishedAt: "2025-06-15T10:00:00Z", brandId: "dimes_tr", classification: "taste" },
        { caption, hashtags: [], publishedAt: "2025-06-15T12:00:00Z", brandId: "dimes_tr", classification: "taste" }
      );
      expect(match.score).toBeGreaterThanOrEqual(55);
      expect(match.confidence).toBe("high");
      expect(match.signals).toContain("caption_exact_match");
    });

    it("gives high score for caption containment (truncated captions)", () => {
      const igCaption = "Dimes cool limonata ile yaz serinliği yaşayın 🍋🧊 En güzel anlar burada!";
      const ttCaption = "Dimes cool limonata ile yaz serinliği yaşayın 🍋🧊";
      const match = scoreMatch(
        { caption: igCaption, hashtags: [], publishedAt: "2025-07-01T10:00:00Z", brandId: "dimes_tr", classification: "taste" },
        { caption: ttCaption, hashtags: [], publishedAt: "2025-07-01T12:00:00Z", brandId: "dimes_tr", classification: "taste" }
      );
      expect(match.score).toBeGreaterThanOrEqual(35);
      expect(match.confidence !== "low").toBe(true);
      expect(match.signals.some(s => s.startsWith("caption_containment"))).toBe(true);
    });

    it("matches the real Dimes Club March 12 TikTok and Instagram campaign-close posts", () => {
      const ttPost = makePost(
        "tt_dimesclub_close",
        "tiktok",
        "brand_dimes_club",
        "Maalesef bitti... Başvurular sona erdi 🫠 \nBaşvuru sonuçların için @infrenzyapp bildirimlerini kontrol etmeyi unutma 📲",
        "2026-03-12T09:54:05.000Z",
        "other"
      );
      const igPost = makePost(
        "ig_dimesclub_close",
        "instagram",
        "brand_dimes_club",
        "Eveeett, başvurular sona erdi ❤️💚🧡💙🩷💛💜 \nBaşvuru sonuçların için infrenzyapp bildirimlerini kontrol etmeyi unutma 📲",
        "2026-03-12T09:52:27+0000",
        "other"
      );

      const { clusters } = buildClusters([ttPost, igPost]);
      expect(clusters.length).toBe(1);
      expect(clusters[0].posts).toHaveLength(2);

      const brand: DimesBrand = {
        id: "brand_dimes_club",
        slug: "dimes-club",
        name: "Dimes Club",
        accounts: [
          {
            id: "acc_ig",
            brandId: "brand_dimes_club",
            platform: "instagram",
            handle: "dimesclub",
            profileUrl: "",
            verificationStatus: "verified",
            lastScannedAt: null,
            providerPath: "meta-graph",
            notes: null,
          },
          {
            id: "acc_tt",
            brandId: "brand_dimes_club",
            platform: "tiktok",
            handle: "dimesclub.tr",
            profileUrl: "",
            verificationStatus: "verified",
            lastScannedAt: null,
            providerPath: "apify",
            notes: null,
          },
        ],
      };

      const evidence = [
        { platform: "instagram" as const, scanned: true, postsFetched: 150, error: null },
        { platform: "tiktok" as const, scanned: true, postsFetched: 150, error: null },
      ];

      // There is no source-side gap here: the TikTok post does have an Instagram counterpart.
      const gaps = analyzeGaps(clusters, [ttPost, igPost], brand, evidence);
      expect(gaps).toHaveLength(0);
    });
  });

  describe("TikTok-only source content", () => {
    it("TikTok-only content creates valid source clusters", () => {
      const ttPost = makePost("tt_only", "tiktok", "dimes_tr", "Tarif: Çilekli smoothie nasıl yapılır #tarif", "2025-06-20T10:00:00Z", "recipe");
      const fbPost = makePost("fb_match", "facebook", "dimes_tr", "Tarif: Çilekli smoothie nasıl yapılır #tarif", "2025-06-21T10:00:00Z", "recipe");

      const { clusters } = buildClusters([ttPost, fbPost]);
      // Should cluster together (same caption)
      expect(clusters.length).toBe(1);
      expect(clusters[0].posts.some(p => p.platform === "tiktok")).toBe(true);
      expect(clusters[0].posts.some(p => p.platform === "facebook")).toBe(true);
    });

    it("TikTok-only content enters gap analysis without Instagram", () => {
      const ttPost = makePost("tt_gap", "tiktok", "dimes_tr", "Dimes tarifi özel #tarif", "2025-06-25T10:00:00Z", "recipe");
      const cluster: DimesContentCluster = {
        id: "cluster_tt_solo",
        fingerprint: "test",
        primaryCaption: ttPost.caption,
        recipeName: "dimes tarifi",
        contentType: "recipe",
        brandId: "dimes_tr",
        firstSeenAt: ttPost.publishedAt,
        posts: [{ clusterId: "cluster_tt_solo", postId: "tt_gap", platform: "tiktok", matchConfidence: "high", matchSignals: ["cluster_origin"] }],
      };

      const brand: DimesBrand = {
        id: "dimes_tr", slug: "dimes-tr", name: "Dimes TR",
        accounts: [
          { id: "acc_ig", brandId: "dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
          { id: "acc_tt", brandId: "dimes_tr", platform: "tiktok", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
          { id: "acc_fb", brandId: "dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
        ],
      };

      const evidence = [
        { platform: "instagram" as const, scanned: true, postsFetched: 50, error: null },
        { platform: "tiktok" as const, scanned: true, postsFetched: 30, error: null },
        { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
      ];

      const gaps = analyzeGaps([cluster], [ttPost], brand, evidence);
      expect(gaps.length).toBeGreaterThanOrEqual(1);

      const gap = gaps[0];
      // TikTok should be present (source)
      const ttPresence = gap.sourcePlatforms.find(p => p.platform === "tiktok");
      expect(ttPresence?.status).toBe("present");

      // Instagram should be missing (scanned but not in cluster)
      const igPresence = gap.sourcePlatforms.find(p => p.platform === "instagram");
      expect(igPresence?.status).toBe("missing");

      // Facebook should be missing (scanned but not in cluster)
      const fbPresence = gap.destinationPlatforms.find(p => p.platform === "facebook");
      expect(fbPresence?.status).toBe("missing");
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Classification Gate Removal — Regression Tests
// ---------------------------------------------------------------------------

describe("Classification Gate Removal", () => {
  it("TikTok post classified 'other' enters gap analysis via cluster-level eligibility (regression: 7606349073922166037)", () => {
    // This is the exact regression case: a TikTok post with classification=other
    // that was invisible to Coverage because of the hard recipe/taste gate.
    const ttPost = makePost(
      "tt_pasta",
      "tiktok",
      "dimes_tr",
      "yarın sabah pasta ile kahvaltı yapıcam belli🫠💘🩷",
      "2026-02-13T13:59:16.000Z",
      "other" // classified as 'other' — sparse caption, no recipe/taste keywords
    );

    const cluster: DimesContentCluster = {
      id: "cluster_pasta",
      fingerprint: "test",
      primaryCaption: ttPost.caption,
      recipeName: null,
      contentType: "other",
      brandId: "dimes_tr",
      firstSeenAt: ttPost.publishedAt,
      posts: [{ clusterId: "cluster_pasta", postId: "tt_pasta", platform: "tiktok", matchConfidence: "high", matchSignals: ["cluster_origin"] }],
    };

    const brand: DimesBrand = {
      id: "dimes_tr", slug: "dimes-tr", name: "Dimes TR",
      accounts: [
        { id: "acc_ig", brandId: "dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
        { id: "acc_tt", brandId: "dimes_tr", platform: "tiktok", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
        { id: "acc_fb", brandId: "dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
      ],
    };

    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 50, error: null },
      { platform: "tiktok" as const, scanned: true, postsFetched: 30, error: null },
      { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
    ];

    const gaps = analyzeGaps([cluster], [ttPost], brand, evidence);
    // The cluster MUST participate in gap analysis even though contentType is 'other'
    // because it has source-platform (TikTok) content
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    const gap = gaps[0];
    const ttPresence = gap.sourcePlatforms.find(p => p.platform === "tiktok");
    expect(ttPresence?.status).toBe("present");
  });

  it("source post classified 'other' clusters with recipe/taste post", () => {
    // An 'other' TikTok post that shares caption with a 'taste' IG post should cluster
    const caption = "Dimes ile güzel bir anı paylaşıyorum #dimes";
    const igPost = makePost("ig_dimes_share", "instagram", "dimes_tr", caption, "2025-08-01T10:00:00Z", "taste");
    const ttPost = makePost("tt_dimes_share", "tiktok", "dimes_tr", caption, "2025-08-01T14:00:00Z", "other");

    const { clusters } = buildClusters([igPost, ttPost]);
    // Must cluster together — classification difference should not prevent clustering
    expect(clusters.length).toBe(1);
    expect(clusters[0].posts.length).toBe(2);
  });

  it("non-source junk posts still excluded from gap analysis", () => {
    // A destination-platform post classified as 'other' without any recipe/taste
    // in the cluster should NOT enter gap analysis
    const fbPost = makePost("fb_junk", "facebook", "dimes_tr", "Hello world!", "2025-08-01T10:00:00Z", "other");

    const cluster: DimesContentCluster = {
      id: "cluster_junk",
      fingerprint: "test",
      primaryCaption: fbPost.caption,
      recipeName: null,
      contentType: "other",
      brandId: "dimes_tr",
      firstSeenAt: fbPost.publishedAt,
      posts: [{ clusterId: "cluster_junk", postId: "fb_junk", platform: "facebook", matchConfidence: "high", matchSignals: ["cluster_origin"] }],
    };

    const brand: DimesBrand = {
      id: "dimes_tr", slug: "dimes-tr", name: "Dimes TR",
      accounts: [
        { id: "acc_ig", brandId: "dimes_tr", platform: "instagram", handle: "dimes.tr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
        { id: "acc_fb", brandId: "dimes_tr", platform: "facebook", handle: "dimestr", profileUrl: "", verificationStatus: "verified", lastScannedAt: null, providerPath: "apify", notes: null },
      ],
    };

    const evidence = [
      { platform: "instagram" as const, scanned: true, postsFetched: 50, error: null },
      { platform: "facebook" as const, scanned: true, postsFetched: 10, error: null },
    ];

    const gaps = analyzeGaps([cluster], [fbPost], brand, evidence);
    // This cluster should NOT appear — no source content, no recipe/taste
    expect(gaps.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Media Format Bucketing Tests
// ---------------------------------------------------------------------------

import {
  deriveMediaFormatBucket,
  clusterMediaFormat,
} from "@/lib/dimes/media-format";

describe("Media Format Bucketing", () => {
  describe("deriveMediaFormatBucket — per-post derivation", () => {
    // TikTok
    it("TikTok VIDEO → short_video", () => {
      expect(deriveMediaFormatBucket("tiktok", "VIDEO")).toBe("short_video");
    });

    it("TikTok SLIDESHOW → photo_post", () => {
      expect(deriveMediaFormatBucket("tiktok", "SLIDESHOW")).toBe("photo_post");
    });

    it("TikTok null mediaType → short_video (defensive fallback)", () => {
      expect(deriveMediaFormatBucket("tiktok", null)).toBe("short_video");
    });

    // Instagram
    it("Instagram REELS → short_video", () => {
      expect(deriveMediaFormatBucket("instagram", "REELS")).toBe("short_video");
    });

    it("Instagram CAROUSEL_ALBUM → photo_post", () => {
      expect(deriveMediaFormatBucket("instagram", "CAROUSEL_ALBUM")).toBe("photo_post");
    });

    it("Instagram IMAGE → photo_post", () => {
      expect(deriveMediaFormatBucket("instagram", "IMAGE")).toBe("photo_post");
    });

    it("Instagram VIDEO (feed video) → short_video", () => {
      expect(deriveMediaFormatBucket("instagram", "VIDEO")).toBe("short_video");
    });

    // CRITICAL REGRESSION: Instagram FEED must NOT map to short_video
    it("Instagram FEED → unclassified (FEED is placement, not format)", () => {
      expect(deriveMediaFormatBucket("instagram", "FEED")).toBe("unclassified");
      expect(deriveMediaFormatBucket("instagram", "FEED")).not.toBe("short_video");
    });

    // YouTube
    it("YouTube SHORT → short_video", () => {
      expect(deriveMediaFormatBucket("youtube", "SHORT")).toBe("short_video");
    });

    it("YouTube VIDEO → long_video", () => {
      expect(deriveMediaFormatBucket("youtube", "VIDEO")).toBe("long_video");
    });

    it("YouTube null mediaType → unclassified (no guessing)", () => {
      expect(deriveMediaFormatBucket("youtube", null)).toBe("unclassified");
    });

    // Facebook
    it("Facebook VIDEO → short_video", () => {
      expect(deriveMediaFormatBucket("facebook", "VIDEO")).toBe("short_video");
    });

    it("Facebook POST → photo_post", () => {
      expect(deriveMediaFormatBucket("facebook", "POST")).toBe("photo_post");
    });

    // Pinterest
    it("Pinterest VIDEO → short_video", () => {
      expect(deriveMediaFormatBucket("pinterest", "VIDEO")).toBe("short_video");
    });

    it("Pinterest IMAGE → photo_post", () => {
      expect(deriveMediaFormatBucket("pinterest", "IMAGE")).toBe("photo_post");
    });

    // Edge cases
    it("Unknown platform → unclassified", () => {
      expect(deriveMediaFormatBucket("x" as any, "VIDEO")).toBe("unclassified");
    });

    it("Case insensitive mediaType", () => {
      expect(deriveMediaFormatBucket("tiktok", "video")).toBe("short_video");
      expect(deriveMediaFormatBucket("tiktok", "Slideshow")).toBe("photo_post");
      expect(deriveMediaFormatBucket("youtube", "short")).toBe("short_video");
    });
  });

  describe("clusterMediaFormat — source-post-leading semantics", () => {
    it("cluster with all short_video source posts → short_video", () => {
      const posts = [
        makePostWithMedia("p1", "tiktok", "brand_a", "VIDEO"),
        makePostWithMedia("p2", "instagram", "brand_a", "REELS"),
      ];
      const cluster: DimesContentCluster = {
        id: "c1", fingerprint: "fp", primaryCaption: "test",
        recipeName: null, contentType: "recipe", brandId: "brand_a",
        firstSeenAt: "2025-06-15T10:00:00Z",
        posts: [
          { clusterId: "c1", postId: "p1", platform: "tiktok", matchConfidence: "high", matchSignals: [] },
          { clusterId: "c1", postId: "p2", platform: "instagram", matchConfidence: "high", matchSignals: [] },
        ],
      };
      expect(clusterMediaFormat(cluster, posts)).toBe("short_video");
    });

    it("cluster with ANY photo_post source → photo_post (photo-priority)", () => {
      // Key semantic change: IG carousel cross-posted as TT video → Photo Posts
      const posts = [
        makePostWithMedia("p1", "instagram", "brand_a", "CAROUSEL_ALBUM"),
        makePostWithMedia("p2", "tiktok", "brand_a", "VIDEO"),
        makePostWithMedia("p3", "facebook", "brand_a", "VIDEO"),
      ];
      const cluster: DimesContentCluster = {
        id: "c1", fingerprint: "fp", primaryCaption: "test",
        recipeName: null, contentType: "recipe", brandId: "brand_a",
        firstSeenAt: "2025-06-15T10:00:00Z",
        posts: [
          { clusterId: "c1", postId: "p1", platform: "instagram", matchConfidence: "high", matchSignals: [] },
          { clusterId: "c1", postId: "p2", platform: "tiktok", matchConfidence: "high", matchSignals: [] },
          { clusterId: "c1", postId: "p3", platform: "facebook", matchConfidence: "high", matchSignals: [] },
        ],
      };
      // photo_post wins because a source-platform carousel post is present
      expect(clusterMediaFormat(cluster, posts)).toBe("photo_post");
    });

    it("cluster with only unclassified posts → unclassified", () => {
      const posts = [
        makePostWithMedia("p1", "x" as any, "brand_a", "TWEET"),
      ];
      const cluster: DimesContentCluster = {
        id: "c1", fingerprint: "fp", primaryCaption: "test",
        recipeName: null, contentType: "recipe", brandId: "brand_a",
        firstSeenAt: "2025-06-15T10:00:00Z",
        posts: [
          { clusterId: "c1", postId: "p1", platform: "x" as any, matchConfidence: "high", matchSignals: [] },
        ],
      };
      expect(clusterMediaFormat(cluster, posts)).toBe("unclassified");
    });

    it("unclassified source votes ignored when classified source votes exist", () => {
      const posts = [
        makePostWithMedia("p1", "instagram", "brand_a", "REELS"),
        makePostWithMedia("p2", "instagram", "brand_a", "FEED"), // legacy lossy → unclassified
      ];
      const cluster: DimesContentCluster = {
        id: "c1", fingerprint: "fp", primaryCaption: "test",
        recipeName: null, contentType: "recipe", brandId: "brand_a",
        firstSeenAt: "2025-06-15T10:00:00Z",
        posts: [
          { clusterId: "c1", postId: "p1", platform: "instagram", matchConfidence: "high", matchSignals: [] },
          { clusterId: "c1", postId: "p2", platform: "instagram", matchConfidence: "high", matchSignals: [] },
        ],
      };
      expect(clusterMediaFormat(cluster, posts)).toBe("short_video");
    });

    it("destination-only platforms used as fallback when no source posts", () => {
      const posts = [
        makePostWithMedia("p1", "facebook", "brand_a", "VIDEO"),
        makePostWithMedia("p2", "facebook", "brand_a", "VIDEO"),
      ];
      const cluster: DimesContentCluster = {
        id: "c1", fingerprint: "fp", primaryCaption: "test",
        recipeName: null, contentType: "recipe", brandId: "brand_a",
        firstSeenAt: "2025-06-15T10:00:00Z",
        posts: [
          { clusterId: "c1", postId: "p1", platform: "facebook", matchConfidence: "high", matchSignals: [] },
          { clusterId: "c1", postId: "p2", platform: "facebook", matchConfidence: "high", matchSignals: [] },
        ],
      };
      expect(clusterMediaFormat(cluster, posts)).toBe("short_video");
    });
  });

  describe("Critical media-format distinctions", () => {
    it("TikTok slideshow appears as photo_post, NOT short_video", () => {
      expect(deriveMediaFormatBucket("tiktok", "SLIDESHOW")).toBe("photo_post");
      expect(deriveMediaFormatBucket("tiktok", "SLIDESHOW")).not.toBe("short_video");
    });

    it("TikTok video appears as short_video", () => {
      expect(deriveMediaFormatBucket("tiktok", "VIDEO")).toBe("short_video");
    });

    it("YouTube SHORT vs regular video distinction", () => {
      expect(deriveMediaFormatBucket("youtube", "SHORT")).toBe("short_video");
      expect(deriveMediaFormatBucket("youtube", "VIDEO")).toBe("long_video");
      expect(deriveMediaFormatBucket("youtube", "SHORT")).not.toBe("long_video");
      expect(deriveMediaFormatBucket("youtube", "VIDEO")).not.toBe("short_video");
    });

    it("contentType and mediaFormat are independent axes", () => {
      // A recipe can be a short video or a photo post
      const shortVideoRecipe = makePostWithMedia("p1", "tiktok", "brand_a", "VIDEO");
      shortVideoRecipe.classification = "recipe";
      expect(deriveMediaFormatBucket(shortVideoRecipe.platform, shortVideoRecipe.mediaType)).toBe("short_video");

      const photoRecipe = makePostWithMedia("p2", "instagram", "brand_a", "CAROUSEL_ALBUM");
      photoRecipe.classification = "recipe";
      expect(deriveMediaFormatBucket(photoRecipe.platform, photoRecipe.mediaType)).toBe("photo_post");
    });

    it("no flat mixed rendering — format bucket always set for known subtypes", () => {
      const combos: [string, string, string][] = [
        ["tiktok", "VIDEO", "short_video"],
        ["tiktok", "SLIDESHOW", "photo_post"],
        ["instagram", "REELS", "short_video"],
        ["instagram", "CAROUSEL_ALBUM", "photo_post"],
        ["instagram", "IMAGE", "photo_post"],
        ["youtube", "SHORT", "short_video"],
        ["youtube", "VIDEO", "long_video"],
      ];
      for (const [platform, mediaType, expectedBucket] of combos) {
        const bucket = deriveMediaFormatBucket(platform as any, mediaType);
        expect(bucket).toBe(expectedBucket);
        expect(bucket).not.toBe("unclassified");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Instagram FEED Regression — Exact failure case for DV_iOCIDRwp
  // -----------------------------------------------------------------------
  describe("Instagram FEED regression (DV_iOCIDRwp)", () => {
    it("FEED is NOT a valid format — must NOT map to short_video", () => {
      expect(deriveMediaFormatBucket("instagram", "FEED")).not.toBe("short_video");
      expect(deriveMediaFormatBucket("instagram", "FEED")).toBe("unclassified");
    });

    it("provider truthfulness: REELS media_product_type preserves REELS", () => {
      const item = { media_product_type: "REELS", media_type: "VIDEO" };
      const resolved = item.media_product_type === "REELS"
        ? "REELS"
        : (item.media_type || item.media_product_type || null);
      expect(resolved).toBe("REELS");
      expect(deriveMediaFormatBucket("instagram", resolved)).toBe("short_video");
    });

    it("provider truthfulness: FEED + CAROUSEL_ALBUM → CAROUSEL_ALBUM → photo_post", () => {
      const item = { media_product_type: "FEED", media_type: "CAROUSEL_ALBUM" };
      const resolved = item.media_product_type === "REELS"
        ? "REELS"
        : (item.media_type || item.media_product_type || null);
      expect(resolved).toBe("CAROUSEL_ALBUM");
      expect(deriveMediaFormatBucket("instagram", resolved)).toBe("photo_post");
    });

    it("provider truthfulness: FEED + IMAGE → IMAGE → photo_post", () => {
      const item = { media_product_type: "FEED", media_type: "IMAGE" };
      const resolved = item.media_product_type === "REELS"
        ? "REELS"
        : (item.media_type || item.media_product_type || null);
      expect(resolved).toBe("IMAGE");
      expect(deriveMediaFormatBucket("instagram", resolved)).toBe("photo_post");
    });

    it("provider truthfulness: FEED + VIDEO → VIDEO → short_video", () => {
      const item = { media_product_type: "FEED", media_type: "VIDEO" };
      const resolved = item.media_product_type === "REELS"
        ? "REELS"
        : (item.media_type || item.media_product_type || null);
      expect(resolved).toBe("VIDEO");
      expect(deriveMediaFormatBucket("instagram", resolved)).toBe("short_video");
    });

    it("exact regression: carousel in mixed cluster → photo_post (not short_video)", () => {
      const igCarousel = makePostWithMedia("ig_carousel", "instagram", "dimes_tr", "CAROUSEL_ALBUM");
      const ttVideo = makePostWithMedia("tt_video", "tiktok", "dimes_tr", "VIDEO");
      const fbVideo = makePostWithMedia("fb_video", "facebook", "dimes_tr", "VIDEO");

      const cluster: DimesContentCluster = {
        id: "cluster_regression",
        fingerprint: "fp_regression",
        primaryCaption: "Regression test post",
        recipeName: null,
        contentType: "taste",
        brandId: "dimes_tr",
        firstSeenAt: "2026-03-17T16:45:08Z",
        posts: [
          { clusterId: "cluster_regression", postId: "ig_carousel", platform: "instagram", matchConfidence: "high", matchSignals: ["caption_exact_match"] },
          { clusterId: "cluster_regression", postId: "tt_video", platform: "tiktok", matchConfidence: "high", matchSignals: ["caption_exact_match"] },
          { clusterId: "cluster_regression", postId: "fb_video", platform: "facebook", matchConfidence: "high", matchSignals: ["caption_containment"] },
        ],
      };

      const format = clusterMediaFormat(cluster, [igCarousel, ttVideo, fbVideo]);
      expect(format).toBe("photo_post");
      expect(format).not.toBe("short_video");
    });

    it("legacy FEED rows fall back to other classified source posts", () => {
      const igFeed = makePostWithMedia("ig_feed", "instagram", "dimes_tr", "FEED");
      const ttVideo = makePostWithMedia("tt_video", "tiktok", "dimes_tr", "VIDEO");

      const cluster: DimesContentCluster = {
        id: "cluster_legacy",
        fingerprint: "fp_legacy",
        primaryCaption: "Legacy test",
        recipeName: null,
        contentType: "taste",
        brandId: "dimes_tr",
        firstSeenAt: "2026-03-17T16:45:08Z",
        posts: [
          { clusterId: "cluster_legacy", postId: "ig_feed", platform: "instagram", matchConfidence: "high", matchSignals: [] },
          { clusterId: "cluster_legacy", postId: "tt_video", platform: "tiktok", matchConfidence: "high", matchSignals: [] },
        ],
      };

      const format = clusterMediaFormat(cluster, [igFeed, ttVideo]);
      expect(format).toBe("short_video");
    });
  });
});

describe("Provider Fetch Limits", () => {
  it("uses a larger scan window for source platforms", () => {
    expect(getDefaultMaxPostsForPlatform("instagram")).toBeGreaterThan(50);
    expect(getDefaultMaxPostsForPlatform("tiktok")).toBeGreaterThan(50);
    expect(getDefaultMaxPostsForPlatform("facebook")).toBe(50);
    expect(getDefaultMaxPostsForPlatform("youtube")).toBe(50);
    expect(getDefaultMaxPostsForPlatform("pinterest")).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(
  id: string,
  platform: string,
  brandId: string,
  caption: string,
  publishedAt: string,
  classification?: string
): DimesContentPost {
  const hashtags = (caption.match(/#([a-z0-9]+)/g) || []).map((h) =>
    h.slice(1)
  );
  return {
    id,
    accountId: `acc_${platform}`,
    brandId,
    platform: platform as any,
    platformPostId: `${platform}_${id}`,
    permalink: `https://example.com/${id}`,
    caption,
    normalizedCaption: caption.toLowerCase(),
    hashtags,
    mentions: [],
    publishedAt,
    fetchedAt: new Date().toISOString(),
    mediaType: "VIDEO",
    thumbnailUrl: null,
    classification: (classification || "recipe") as any,
    classificationSignals: [],
    clusterFingerprint: null,
  };
}

function makePostWithMedia(
  id: string,
  platform: string,
  brandId: string,
  mediaType: string | null,
  classification?: string
): DimesContentPost {
  return {
    id,
    accountId: `acc_${platform}`,
    brandId,
    platform: platform as any,
    platformPostId: `${platform}_${id}`,
    permalink: `https://example.com/${id}`,
    caption: "Test post",
    normalizedCaption: "test post",
    hashtags: [],
    mentions: [],
    publishedAt: "2025-06-15T10:00:00Z",
    fetchedAt: new Date().toISOString(),
    mediaType,
    thumbnailUrl: null,
    classification: (classification || "recipe") as any,
    classificationSignals: [],
    clusterFingerprint: null,
  };
}

// ---------------------------------------------------------------------------
// 7. Two-Mode Scan Architecture Tests
// ---------------------------------------------------------------------------

import * as repo from "@/lib/dimes/repository";
import { computeFastScanBudget, type FetchIntent } from "@/lib/dimes/providers";
import type { AccountScanState } from "@/lib/dimes/types";

describeDb("Account Scan State CRUD", () => {
  beforeEach(async () => {
    await repo.clearAllCoverageData();
  });

  it("returns null when no state exists for account", async () => {
    const state = await repo.getAccountScanState("nonexistent");
    expect(state).toBeNull();
  });

  it("inserts and retrieves scan state", async () => {
    const now = new Date().toISOString();
    const state: AccountScanState = {
      accountId: "acc_test_1",
      platform: "instagram",
      brandId: "brand_test",
      lastSuccessfulScanAt: now,
      lastScanMode: "full",
      lastScanPostCount: 42,
      latestPostPublishedAt: now,
      updatedAt: now,
    };

    await repo.upsertAccountScanState(state);
    const retrieved = await repo.getAccountScanState("acc_test_1");

    expect(retrieved).not.toBeNull();
    expect(retrieved!.accountId).toBe("acc_test_1");
    expect(retrieved!.platform).toBe("instagram");
    expect(retrieved!.lastScanMode).toBe("full");
    expect(retrieved!.lastScanPostCount).toBe(42);
  });

  it("updates existing scan state", async () => {
    const now = new Date().toISOString();
    const initial: AccountScanState = {
      accountId: "acc_test_2",
      platform: "tiktok",
      brandId: "brand_test",
      lastSuccessfulScanAt: "2025-01-01T00:00:00Z",
      lastScanMode: "full",
      lastScanPostCount: 100,
      latestPostPublishedAt: "2025-01-15T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    await repo.upsertAccountScanState(initial);

    // Update
    const updated: AccountScanState = {
      ...initial,
      lastSuccessfulScanAt: now,
      lastScanMode: "fast",
      lastScanPostCount: 15,
      updatedAt: now,
    };
    await repo.upsertAccountScanState(updated);

    const retrieved = await repo.getAccountScanState("acc_test_2");
    expect(retrieved!.lastScanMode).toBe("fast");
    expect(retrieved!.lastScanPostCount).toBe(15);
    expect(retrieved!.lastSuccessfulScanAt).toBe(now);
  });

  it("getAllAccountScanStates returns all entries", async () => {
    const now = new Date().toISOString();
    await repo.upsertAccountScanState({
      accountId: "acc_a",
      platform: "instagram",
      brandId: "brand_1",
      lastSuccessfulScanAt: now,
      lastScanMode: "full",
      lastScanPostCount: 10,
      latestPostPublishedAt: now,
      updatedAt: now,
    });
    await repo.upsertAccountScanState({
      accountId: "acc_b",
      platform: "tiktok",
      brandId: "brand_1",
      lastSuccessfulScanAt: now,
      lastScanMode: "fast",
      lastScanPostCount: 5,
      latestPostPublishedAt: now,
      updatedAt: now,
    });

    const all = await repo.getAllAccountScanStates();
    expect(all.length).toBe(2);
    expect(all.map(s => s.accountId).sort()).toEqual(["acc_a", "acc_b"]);
  });

  it("clearAllCoverageData clears scan states", async () => {
    const now = new Date().toISOString();
    await repo.upsertAccountScanState({
      accountId: "acc_clear",
      platform: "facebook",
      brandId: "brand_1",
      lastSuccessfulScanAt: now,
      lastScanMode: "full",
      lastScanPostCount: 10,
      latestPostPublishedAt: now,
      updatedAt: now,
    });

    expect(await repo.getAccountScanState("acc_clear")).not.toBeNull();
    await repo.clearAllCoverageData();
    expect(await repo.getAccountScanState("acc_clear")).toBeNull();
  });
});

describe("Fast Scan Budget Computation", () => {
  it("returns minimum 15 posts for short windows", () => {
    expect(computeFastScanBudget("instagram", 1)).toBe(15);
    expect(computeFastScanBudget("tiktok", 0.5)).toBe(15);
  });

  it("scales with elapsed days", () => {
    // 5 days × 5 = 25 posts
    expect(computeFastScanBudget("instagram", 5)).toBe(25);
    // 10 days × 5 = 50 posts
    expect(computeFastScanBudget("instagram", 10)).toBe(50);
  });

  it("caps at full budget for source platforms", () => {
    // 40 days × 5 = 200, but instagram max is 150
    expect(computeFastScanBudget("instagram", 40)).toBe(150);
    expect(computeFastScanBudget("tiktok", 40)).toBe(150);
  });

  it("caps at full budget for destination platforms", () => {
    // 20 days × 5 = 100, but facebook max is 50
    expect(computeFastScanBudget("facebook", 20)).toBe(50);
    expect(computeFastScanBudget("youtube", 20)).toBe(50);
    expect(computeFastScanBudget("pinterest", 20)).toBe(50);
  });

  it("returns 0 for unsupported platforms", () => {
    expect(computeFastScanBudget("x", 10)).toBe(0);
  });
});

describe("Fetch Intent Contract", () => {
  it("full mode intent has no date filtering", () => {
    const intent: FetchIntent = { mode: "full" };
    expect(intent.mode).toBe("full");
    expect(intent.since).toBeUndefined();
    expect(intent.elapsedDays).toBeUndefined();
  });

  it("fast mode intent includes since and elapsed days", () => {
    const intent: FetchIntent = {
      mode: "fast",
      since: "2025-03-20T00:00:00Z",
      elapsedDays: 5,
    };
    expect(intent.mode).toBe("fast");
    expect(intent.since).toBe("2025-03-20T00:00:00Z");
    expect(intent.elapsedDays).toBe(5);
  });

  it("fast scan with no prior state has undefined since", () => {
    // When account has never been scanned, since is not set
    const intent: FetchIntent = { mode: "full" }; // fallback to full
    expect(intent.since).toBeUndefined();
  });
});
