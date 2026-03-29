/**
 * Dimes Content Coverage — Media Format Bucketing
 *
 * Canonical media-format taxonomy for Coverage grouping.
 * This is SEPARATE from contentType (recipe/taste/other) — that is
 * a classification signal. This module answers: "what kind of media IS it?"
 *
 * Three product-visible buckets:
 *   short_video  — TikTok videos, Instagram Reels, YouTube Shorts
 *   long_video   — YouTube regular (non-Short) videos
 *   photo_post   — Instagram carousel/photo, TikTok slideshow/carousel
 *
 * Plus an internal fallback:
 *   unclassified — insufficient metadata to determine format
 *
 * Derivation uses platform + raw mediaType string from providers.
 *
 * IMPORTANT: Instagram has TWO API fields with different semantics:
 *   - media_product_type: placement signal (REELS | FEED)
 *   - media_type: format signal (VIDEO | IMAGE | CAROUSEL_ALBUM)
 * Our provider now resolves this correctly (REELS → REELS, else → media_type).
 * But legacy data may still have "FEED" stored. This module handles both
 * current and legacy mediaType values defensively.
 */

import type { DimesPlatform, DimesContentPost, DimesContentCluster } from "./types";

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export type MediaFormatBucket =
  | "short_video"
  | "long_video"
  | "photo_post"
  | "unclassified";

// ---------------------------------------------------------------------------
// Per-post derivation
// ---------------------------------------------------------------------------

/**
 * Derive the canonical media-format bucket for a single post.
 *
 * Uses platform + raw mediaType string from the provider layer.
 * Does NOT guess — ambiguous cases map to `unclassified`.
 */
export function deriveMediaFormatBucket(
  platform: DimesPlatform,
  mediaType: string | null
): MediaFormatBucket {
  const mt = (mediaType || "").toUpperCase().trim();

  switch (platform) {
    // ----- TikTok -----
    // Provider tags: VIDEO | SLIDESHOW
    case "tiktok":
      if (mt === "SLIDESHOW") return "photo_post";
      if (mt === "VIDEO" || mt === "") return "short_video"; // TikTok is short-video-first
      return "short_video"; // defensive fallback — TikTok content is short-form

    // ----- Instagram -----
    // After provider fix, mediaType values reaching here will be:
    //   REELS        → from media_product_type when it's REELS
    //   VIDEO        → from media_type (feed video, typically short-form)
    //   IMAGE        → from media_type (single photo post)
    //   CAROUSEL_ALBUM → from media_type (multi-image carousel)
    //
    // Legacy data may still have "FEED" stored from the old lossy mapping
    // (media_product_type || media_type). FEED alone tells us nothing about
    // the actual format — it's a placement signal, not a format signal.
    // We map it to `unclassified` rather than guessing, because FEED can
    // be a carousel, a photo, OR a video.
    case "instagram":
      if (mt === "REELS") return "short_video";
      if (mt === "CAROUSEL_ALBUM") return "photo_post";
      if (mt === "IMAGE") return "photo_post";
      // VIDEO on Instagram: feed video (non-Reel). Typically short-form.
      if (mt === "VIDEO") return "short_video";
      // FEED is a PLACEMENT signal, NOT a format signal.
      // Legacy rows stored as FEED have lost their true subtype.
      // We CANNOT assume FEED = video — it could be carousel/photo/video.
      // Map to unclassified so operators see the ambiguity honestly.
      if (mt === "FEED") return "unclassified";
      return "unclassified";

    // ----- YouTube -----
    // Provider tags: SHORT (from our fetchYouTubeShorts search with videoDuration=short)
    // Regular YouTube videos would have VIDEO or empty mediaType
    case "youtube":
      if (mt === "SHORT") return "short_video";
      if (mt === "VIDEO" || mt === "LONG") return "long_video";
      return "unclassified";

    // ----- Facebook -----
    // Provider tags: VIDEO | POST
    case "facebook":
      if (mt === "VIDEO") return "short_video";
      if (mt === "POST" || mt === "IMAGE") return "photo_post";
      return "unclassified";

    // ----- Pinterest -----
    // Provider tags: VIDEO | IMAGE
    case "pinterest":
      if (mt === "VIDEO") return "short_video";
      if (mt === "IMAGE") return "photo_post";
      return "unclassified";

    default:
      return "unclassified";
  }
}

// ---------------------------------------------------------------------------
// Cluster-level derivation — source-post-leading semantics
// ---------------------------------------------------------------------------

/**
 * Derive the media-format bucket for a cluster.
 *
 * Previous implementation used majority-vote across all posts, which was
 * semantically wrong: a cluster containing an IG carousel (photo_post) and
 * a TikTok video (short_video) would be labeled short_video by majority,
 * causing photo posts to appear under "Short Format Videos".
 *
 * New approach — source-post-leading:
 * 1. Find source-platform posts (instagram, tiktok) — these are the
 *    canonical originals that operators care about
 * 2. If source posts have a single format, use it
 * 3. If source posts are mixed-format (e.g. IG photo + TT video),
 *    prefer the photo_post bucket — because a photo post that was
 *    cross-posted as a video should be shown under Photo Posts (the
 *    original intent matters more than the adaptation)
 * 4. Fall back to any classified post if no source posts have format
 *
 * This ensures operators see content grouped by its canonical source format,
 * not by whatever adaptation majority happened to dominate.
 */
export function clusterMediaFormat(
  cluster: DimesContentCluster,
  posts: DimesContentPost[]
): MediaFormatBucket {
  const postMap = new Map(posts.map((p) => [p.id, p]));

  const SOURCE_PLATFORMS = new Set(["instagram", "tiktok"]);

  // Buckets from source-platform posts only
  const sourceBuckets: MediaFormatBucket[] = [];
  // Buckets from all posts (fallback)
  const allBuckets: MediaFormatBucket[] = [];

  for (const cp of cluster.posts) {
    const post = postMap.get(cp.postId);
    if (!post) continue;
    const bucket = deriveMediaFormatBucket(post.platform, post.mediaType);
    allBuckets.push(bucket);
    if (SOURCE_PLATFORMS.has(post.platform)) {
      sourceBuckets.push(bucket);
    }
  }

  // Prefer source-platform buckets
  const primaryBuckets = sourceBuckets.length > 0 ? sourceBuckets : allBuckets;

  // Count classified votes
  const votes: Record<MediaFormatBucket, number> = {
    short_video: 0,
    long_video: 0,
    photo_post: 0,
    unclassified: 0,
  };
  for (const b of primaryBuckets) {
    votes[b]++;
  }

  // If any source post is a photo_post, the cluster is a photo_post.
  // Rationale: a carousel/photo that was cross-posted as a video
  // should still be grouped under Photo Posts — the original format
  // is what the operator recognizes and manages.
  if (votes.photo_post > 0) return "photo_post";

  // Otherwise, pick the most-voted classified bucket
  const classified: MediaFormatBucket[] = ["short_video", "long_video", "photo_post"];
  let bestBucket: MediaFormatBucket = "unclassified";
  let bestCount = 0;

  for (const bucket of classified) {
    if (votes[bucket] > bestCount) {
      bestCount = votes[bucket];
      bestBucket = bucket;
    }
  }

  if (bestCount === 0) return "unclassified";

  return bestBucket;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const FORMAT_BUCKET_LABELS: Record<MediaFormatBucket, string> = {
  short_video: "Short Format Videos",
  long_video: "Long Format Videos",
  photo_post: "Photo Posts",
  unclassified: "Other",
};

export const FORMAT_BUCKET_ORDER: MediaFormatBucket[] = [
  "short_video",
  "long_video",
  "photo_post",
  "unclassified",
];
