/**
 * Dimes Content Coverage — Platform Providers
 *
 * Real data-fetching providers for coverage scanning.
 * These are specialized for the coverage use-case (fetching page content
 * by username/handle), NOT the benchmark use-case.
 *
 * Access paths:
 * - Instagram: Meta Graph API (business_discovery) — reuses existing provider
 * - Facebook:  Meta Graph API (/{page_id}/published_posts) — same token
 * - YouTube:   YouTube Data API v3 (search.list with videoDuration=short)
 * - TikTok:    Apify TikTok scraper — reuses existing provider
 * - Pinterest: Apify Pinterest scraper
 *
 * Each provider returns an array of RawFetchedPost objects that the
 * scanner can ingest.
 */

import type { DimesPlatform, DimesSocialAccount } from "./types";
import type { RawFetchedPost } from "./scanner";

// ---------------------------------------------------------------------------
// Scan window sizing
// ---------------------------------------------------------------------------

const DEFAULT_MAX_POSTS_BY_PLATFORM: Record<DimesPlatform, number> = {
  instagram: 150,
  tiktok: 150,
  facebook: 50,
  youtube: 50,
  pinterest: 50,
  x: 0,
};

export function getDefaultMaxPostsForPlatform(platform: DimesPlatform): number {
  return DEFAULT_MAX_POSTS_BY_PLATFORM[platform];
}

// ---------------------------------------------------------------------------
// 1. Instagram — via existing Meta Graph API
// ---------------------------------------------------------------------------

export async function fetchInstagramPosts(
  account: DimesSocialAccount,
  maxPosts: number = 50
): Promise<{ posts: RawFetchedPost[]; error: string | null }> {
  const token = process.env.META_ACCESS_TOKEN;
  const userId = process.env.META_IG_USER_ID;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";

  if (!token || !userId) {
    return { posts: [], error: "META_ACCESS_TOKEN or META_IG_USER_ID not configured" };
  }

  try {
    const fields = `business_discovery.username(${account.handle}){media.limit(${maxPosts}){id,caption,timestamp,permalink,thumbnail_url,media_type,media_product_type}}`;
    const url = `https://graph.facebook.com/${apiVersion}/${userId}?fields=${encodeURIComponent(fields)}&access_token=${token}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { posts: [], error: `Meta API HTTP ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = await res.json();
    const mediaItems = data?.business_discovery?.media?.data || [];

    const posts: RawFetchedPost[] = mediaItems.map((item: any) => ({
      platformPostId: item.id,
      platform: "instagram" as const,
      caption: item.caption || null,
      permalink: item.permalink || `https://www.instagram.com/p/${item.id}/`,
      publishedAt: item.timestamp || new Date().toISOString(),
      // IMPORTANT: media_product_type is a PLACEMENT signal (REELS | FEED),
      // media_type is a FORMAT signal (VIDEO | IMAGE | CAROUSEL_ALBUM).
      // When media_product_type is REELS, that IS the format — use it.
      // When media_product_type is FEED, it tells us nothing about format —
      // use media_type instead to get the true subtype (CAROUSEL_ALBUM, IMAGE, VIDEO).
      // Previously `media_product_type || media_type` would persist "FEED" and
      // lose the actual format, causing carousels/photos to appear as videos.
      mediaType: item.media_product_type === "REELS"
        ? "REELS"
        : (item.media_type || item.media_product_type || null),
      thumbnailUrl: item.thumbnail_url || null,
    }));

    return { posts, error: null };
  } catch (err) {
    return {
      posts: [],
      error: `Instagram fetch failed: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Facebook — via Apify Facebook Posts Scraper
//
// Facebook Graph API requires page admin access (no cross-discovery API
// like Instagram's business_discovery). Apify scrapes public page content
// without needing admin access or Page Tokens.
//
// Actor: apify/facebook-posts-scraper
// Input: startUrls with Facebook page URLs
// Output: postId, text, url, time, media, likes, comments, shares
// ---------------------------------------------------------------------------

export async function fetchFacebookPosts(
  account: DimesSocialAccount,
  maxPosts: number = 50
): Promise<{ posts: RawFetchedPost[]; error: string | null }> {
  const token = process.env.APIFY_API_TOKEN;

  if (!token) {
    return { posts: [], error: "APIFY_API_TOKEN not configured" };
  }

  try {
    const actorId = "apify~facebook-posts-scraper";
    const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;

    // Build the Facebook page URL from the account's profileUrl or handle
    const pageUrl = account.profileUrl || `https://www.facebook.com/${account.handle}/`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: pageUrl }],
        resultsPerPage: maxPosts,
      }),
      signal: AbortSignal.timeout(120000), // 2 min — Apify actors can be slow
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { posts: [], error: `Apify Facebook HTTP ${res.status} for @${account.handle}: ${body.slice(0, 200)}` };
    }

    const items: any[] = await res.json();

    const posts: RawFetchedPost[] = items
      .filter((item: any) => item.postId && (item.time || item.timestamp))
      .map((item: any) => {
        // Composite caption: text is the main post content
        const caption = item.text || null;

        return {
          platformPostId: item.postId,
          platform: "facebook" as const,
          caption,
          permalink: item.url || item.topLevelUrl || `https://www.facebook.com/${item.postId}`,
          publishedAt: item.time || new Date(item.timestamp * 1000).toISOString(),
          mediaType: item.media?.[0]?.__typename === "Video" ? "VIDEO" : "POST",
          thumbnailUrl: item.media?.[0]?.thumbnail || item.media?.[0]?.photo_image?.uri || null,
        };
      });

    console.log(`[Facebook] @${account.handle}: ${posts.length} posts fetched via Apify`);
    return { posts, error: null };
  } catch (err) {
    return {
      posts: [],
      error: `Facebook fetch failed for @${account.handle}: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. YouTube — via YouTube Data API v3
//
// Uses search.list with:
// - channelId (resolved from handle)
// - videoDuration=short (filters for Shorts ≤ 4 min)
// - publishedAfter/publishedBefore for date range
// - type=video
//
// Then uses videos.list to get snippet + statistics for each video.
// ---------------------------------------------------------------------------

export async function fetchYouTubeShorts(
  account: DimesSocialAccount,
  maxResults: number = 50,
  since?: string
): Promise<{ posts: RawFetchedPost[]; error: string | null }> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return { posts: [], error: "YOUTUBE_API_KEY not configured" };
  }

  try {
    // Step 1: Resolve channel ID from handle
    let channelId = account.handle;

    // If it starts with UC (already a channel ID), use directly
    if (!channelId.startsWith("UC")) {
      // Try to resolve from handle/username
      const handle = channelId.replace(/^@/, "");
      const resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${handle}&key=${apiKey}`;
      const resolveRes = await fetch(resolveUrl, { signal: AbortSignal.timeout(10000) });

      if (resolveRes.ok) {
        const resolveData = await resolveRes.json();
        if (resolveData.items && resolveData.items.length > 0) {
          channelId = resolveData.items[0].id;
        } else {
          return { posts: [], error: `YouTube channel not found for handle: ${handle}` };
        }
      } else {
        return { posts: [], error: `YouTube channel resolve failed: HTTP ${resolveRes.status}` };
      }
    }

    // Step 2: Search for short videos from this channel
    const params = new URLSearchParams({
      part: "id,snippet",
      channelId,
      type: "video",
      videoDuration: "short",
      maxResults: String(Math.min(maxResults, 50)),
      order: "date",
      key: apiKey,
    });

    if (since) {
      params.set("publishedAfter", new Date(since).toISOString());
    } else {
      // Default: last ~15 months (Jan 2025)
      params.set("publishedAfter", "2025-01-01T00:00:00Z");
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });

    if (!searchRes.ok) {
      const body = await searchRes.text().catch(() => "");
      return { posts: [], error: `YouTube search API HTTP ${searchRes.status}: ${body.slice(0, 200)}` };
    }

    const searchData = await searchRes.json();
    const searchItems = searchData.items || [];

    if (searchItems.length === 0) {
      return { posts: [], error: null };  // No shorts found, not an error
    }

    // Step 3: Get video details (description, etc.)
    const videoIds = searchItems.map((item: any) => item.id.videoId).join(",");
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(10000) });

    let videoDetails: Record<string, any> = {};
    if (detailsRes.ok) {
      const detailsData = await detailsRes.json();
      for (const item of (detailsData.items || [])) {
        videoDetails[item.id] = item;
      }
    }

    // Step 4: Map to RawFetchedPost
    const posts: RawFetchedPost[] = searchItems.map((item: any) => {
      const videoId = item.id.videoId;
      const detail = videoDetails[videoId];
      const snippet = detail?.snippet || item.snippet;

      return {
        platformPostId: videoId,
        platform: "youtube" as const,
        caption: snippet?.description || snippet?.title || null,
        permalink: `https://www.youtube.com/shorts/${videoId}`,
        publishedAt: snippet?.publishedAt || new Date().toISOString(),
        mediaType: "SHORT",
        thumbnailUrl: snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url || null,
      };
    });

    return { posts, error: null };
  } catch (err) {
    return {
      posts: [],
      error: `YouTube fetch failed: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. TikTok — via Apify
// ---------------------------------------------------------------------------

export async function fetchTikTokPosts(
  account: DimesSocialAccount,
  maxPosts: number = 50
): Promise<{ posts: RawFetchedPost[]; error: string | null }> {
  const token = process.env.APIFY_API_TOKEN;

  if (!token) {
    return { posts: [], error: "APIFY_API_TOKEN not configured" };
  }

  try {
    const actorId = "clockworks~free-tiktok-scraper";
    const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profiles: [account.handle],
        resultsPerPage: maxPosts,
        shouldDownloadVideos: false,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { posts: [], error: `Apify TikTok HTTP ${res.status}: ${body.slice(0, 200)}` };
    }

    const items: any[] = await res.json();

    const posts: RawFetchedPost[] = items
      .filter((item: any) => {
        // Only require id — timestamps will be handled with fallbacks
        if (!item.id) return false;
        // Must have either createTimeISO or createTime (unix)
        if (!item.createTimeISO && !item.createTime) return false;
        return true;
      })
      .map((item: any) => {
        // Caption source chain: text → desc → imagePost.title (slideshow)
        const caption = item.text || item.desc || item.imagePost?.title || null;

        // Timestamp: prefer ISO, fallback to unix conversion
        let publishedAt: string;
        if (item.createTimeISO) {
          publishedAt = item.createTimeISO;
        } else if (item.createTime) {
          publishedAt = new Date(item.createTime * 1000).toISOString();
        } else {
          publishedAt = new Date().toISOString();
        }

        // Media type: detect slideshows vs videos
        const isSlideshow = item.isSlideshow === true || item.imagePost != null;
        const mediaType = isSlideshow ? "SLIDESHOW" : "VIDEO";

        return {
          platformPostId: item.id,
          platform: "tiktok" as const,
          caption,
          permalink: item.webVideoUrl || `https://www.tiktok.com/@${account.handle}/video/${item.id}`,
          publishedAt,
          mediaType,
          thumbnailUrl: item.covers?.[0] || item.imagePost?.images?.[0]?.imageURL || null,
        };
      });

    console.log(`[TikTok] @${account.handle}: ${posts.length} posts fetched (from ${items.length} raw items, ${items.filter((i: any) => i.isSlideshow).length} slideshows)`);
    return { posts, error: null };
  } catch (err) {
    return {
      posts: [],
      error: `TikTok fetch failed: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 5. Pinterest — via Apify
// ---------------------------------------------------------------------------

export async function fetchPinterestPins(
  account: DimesSocialAccount,
  maxPins: number = 50
): Promise<{ posts: RawFetchedPost[]; error: string | null }> {
  const token = process.env.APIFY_API_TOKEN;

  if (!token) {
    return { posts: [], error: "APIFY_API_TOKEN not configured" };
  }

  try {
    const actorId = "apify~pinterest-scraper";
    const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: `https://pinterest.com/${account.handle}/` }],
        maxItems: maxPins,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { posts: [], error: `Apify Pinterest HTTP ${res.status}: ${body.slice(0, 200)}` };
    }

    const items: any[] = await res.json();

    const posts: RawFetchedPost[] = items
      .filter((item: any) => item.id || item.pinId)
      .map((item: any) => ({
        platformPostId: item.id || item.pinId || `pin_${Date.now()}`,
        platform: "pinterest" as const,
        caption: item.description || item.title || null,
        permalink: item.url || item.link || `https://pinterest.com/pin/${item.id || item.pinId}/`,
        publishedAt: item.createdAt || new Date().toISOString(),
        mediaType: item.isVideo ? "VIDEO" : "IMAGE",
        thumbnailUrl: item.images?.orig?.url || item.imageUrl || null,
      }));

    return { posts, error: null };
  } catch (err) {
    return {
      posts: [],
      error: `Pinterest fetch failed: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Fetch intent — for full vs fast scan modes
// ---------------------------------------------------------------------------

export type FetchIntent = {
  mode: "full" | "fast";
  /** ISO timestamp — only fetch content published after this date */
  since?: string;
  /** Days since last successful scan — used for post budget calculation */
  elapsedDays?: number;
};

/**
 * Compute the post fetch budget for a fast scan.
 * Scales with elapsed days but caps low for short windows.
 * Never exceeds the platform's full-scan default.
 */
export function computeFastScanBudget(
  platform: DimesPlatform,
  elapsedDays: number
): number {
  const fullBudget = DEFAULT_MAX_POSTS_BY_PLATFORM[platform];
  if (fullBudget === 0) return 0;
  // min 15 posts, scale by ~5 per elapsed day, cap at full budget
  return Math.min(fullBudget, Math.max(15, Math.ceil(elapsedDays * 5)));
}

// ---------------------------------------------------------------------------
// Dispatch — fetch from any platform
// ---------------------------------------------------------------------------

export async function fetchPostsForAccount(
  account: DimesSocialAccount,
  maxPosts: number = getDefaultMaxPostsForPlatform(account.platform),
  intent?: FetchIntent
): Promise<{ posts: RawFetchedPost[]; error: string | null }> {
  // Compute effective parameters based on intent
  let effectiveMax = maxPosts;
  let since: string | undefined;

  if (intent?.mode === "fast") {
    since = intent.since;
    if (intent.elapsedDays != null) {
      effectiveMax = computeFastScanBudget(account.platform, intent.elapsedDays);
    }
  }

  let result: { posts: RawFetchedPost[]; error: string | null };

  switch (account.platform) {
    case "instagram":
      result = await fetchInstagramPosts(account, effectiveMax);
      break;
    case "facebook":
      result = await fetchFacebookPosts(account, effectiveMax);
      break;
    case "youtube":
      // YouTube natively supports `since` via publishedAfter
      result = await fetchYouTubeShorts(account, effectiveMax, since);
      break;
    case "tiktok":
      result = await fetchTikTokPosts(account, effectiveMax);
      break;
    case "pinterest":
      result = await fetchPinterestPins(account, effectiveMax);
      break;
    case "x":
      result = { posts: [], error: "X (Twitter) not supported in V1" };
      break;
    default:
      result = { posts: [], error: `Unknown platform: ${account.platform}` };
      break;
  }

  // App-side date filtering for fast scans on providers that don't support
  // native date queries (everything except YouTube)
  if (intent?.mode === "fast" && since && account.platform !== "youtube" && result.posts.length > 0) {
    const sinceMs = new Date(since).getTime();
    const beforeCount = result.posts.length;
    result.posts = result.posts.filter(
      (p) => new Date(p.publishedAt).getTime() >= sinceMs
    );
    if (beforeCount !== result.posts.length) {
      console.log(
        `[Fast Scan] ${account.platform}/@${account.handle}: filtered ${beforeCount} → ${result.posts.length} posts (since ${since})`
      );
    }
  }

  return result;
}
