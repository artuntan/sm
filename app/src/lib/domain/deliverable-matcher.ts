/**
 * Deliverable Matcher — Brand Post Detection Engine
 *
 * Pure function that checks whether a ContentItem from a creator's account
 * matches a campaign's brand. Used by the campaign scan-creators API.
 *
 * Match signals (require actual brand evidence):
 * 1. Tagged users include a brand account handle
 * 2. Caption contains brand hashtag, @mention, or keyword
 *
 * IMPORTANT: isPaidPartnership alone is NOT a match — it only means the post
 * is sponsored, not necessarily for THIS brand. It's noted in the reason
 * when combined with actual brand evidence.
 */

import type { ContentItem } from "./types";
import type { DimesBrand } from "../dimes/types";

export interface MatchResult {
  matched: boolean;
  reason: string | null;
}

/**
 * Check if a post from a creator's account is related to a brand.
 *
 * @param post - A ContentItem fetched from the creator's account
 * @param brand - The campaign's linked brand with account handles
 * @param customKeywords - Optional campaign-specific keywords/hashtags/handles
 * @returns Whether the post matches and why
 */
export function matchPostToBrand(
  post: ContentItem,
  brand: DimesBrand,
  customKeywords?: string[]
): MatchResult {
  // Build keyword set from brand + campaign custom keywords
  const keywords = buildBrandKeywords(brand);
  if (customKeywords) {
    for (const kw of customKeywords) {
      const normalized = kw.replace(/^[#@]/, "").toLowerCase().trim();
      if (normalized.length >= 2) keywords.add(normalized);
    }
  }
  const isPaid = !!post.commercialMetadata?.isPaidPartnership;

  // 1. Tagged users include a brand account handle (strongest signal)
  const taggedUsers: string[] =
    (post.rawMetadata?.taggedUsers as string[]) || [];
  for (const tagged of taggedUsers) {
    const normalizedTag = tagged.replace(/^@/, "").toLowerCase();
    if (keywords.has(normalizedTag)) {
      const reason = isPaid
        ? `tagged_user: @${normalizedTag} + paid_partnership`
        : `tagged_user: @${normalizedTag}`;
      return { matched: true, reason };
    }
  }

  // 2. Caption content matching — hashtags, @mentions, standalone words
  const caption = (post.caption || "").toLowerCase();
  if (!caption) return { matched: false, reason: null };

  for (const keyword of keywords) {
    if (keyword.length < 3) continue; // Skip very short keywords

    // Hashtag match (most reliable)
    if (caption.includes(`#${keyword}`)) {
      const reason = isPaid
        ? `hashtag: #${keyword} + paid_partnership`
        : `hashtag: #${keyword}`;
      return { matched: true, reason };
    }

    // @mention match
    if (caption.includes(`@${keyword}`)) {
      const reason = isPaid
        ? `mention: @${keyword} + paid_partnership`
        : `mention: @${keyword}`;
      return { matched: true, reason };
    }

    // Standalone word match (word boundaries)
    const wordRegex = new RegExp(`(?:^|[\\s.,!?;:()\\[\\]{}])${escapeRegex(keyword)}(?:$|[\\s.,!?;:()\\[\\]{}])`, "i");
    if (wordRegex.test(caption)) {
      const reason = isPaid
        ? `caption_keyword: ${keyword} + paid_partnership`
        : `caption_keyword: ${keyword}`;
      return { matched: true, reason };
    }
  }

  // NOTE: isPaidPartnership alone is NOT a match signal.
  // A paid partnership could be for ANY brand (e.g., Orkid, P&G).
  // We require actual brand-specific evidence (tags, hashtags, keywords).

  return { matched: false, reason: null };
}

/**
 * Build a set of lowercase keywords from a brand configuration.
 * Includes: brand name, brand slug, and all social account handles.
 */
function buildBrandKeywords(brand: DimesBrand): Set<string> {
  const keywords = new Set<string>();

  // Brand name parts (e.g., "Dimes TR" → "dimes", "dimes tr")
  keywords.add(brand.name.toLowerCase());
  const nameParts = brand.name.toLowerCase().split(/\s+/);
  for (const part of nameParts) {
    if (part.length >= 3) keywords.add(part);
  }

  // Brand slug (e.g., "dimes-tr")
  keywords.add(brand.slug.toLowerCase());

  // All account handles across platforms
  for (const account of brand.accounts) {
    const handle = account.handle.toLowerCase().replace(/[._-]/g, "");
    keywords.add(account.handle.toLowerCase()); // exact handle
    if (handle.length >= 3) keywords.add(handle); // normalized handle
  }

  return keywords;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
