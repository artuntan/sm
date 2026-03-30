/**
 * Shared formatting utilities
 *
 * These helpers were duplicated across dashboard pages and detail panels.
 * Import from here instead of re-declaring locally.
 */

import type { ProviderSource } from "@/lib/domain/types";

/** Compact number display: 1234 → "1.2K", 2500000 → "2.5M" */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Short date: "Mar 30" style */
export function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Truncate with ellipsis, defaulting to "No caption" for empty values */
export function truncate(text: string | null, max = 80): string {
  if (!text) return "No caption";
  return text.length <= max ? text : text.slice(0, max) + "…";
}

/** Human-readable label for a data provider source */
export function sourceLabel(source: ProviderSource): string {
  const map: Record<string, string> = {
    meta: "Meta API",
    mock: "Mock",
    "instagram-apify": "Apify Fallback",
    "tiktok-research": "Research API",
    "tiktok-apify": "Apify Live",
    "tiktok-mock": "Mock",
  };
  return map[source] || source;
}
