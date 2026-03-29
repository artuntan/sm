/**
 * MediaWarehouseService — M2 Normalized Media Warehouse
 *
 * Stores individual ContentItems with platform + externalId dedup.
 * Tracks metric drift (view count changes over time).
 *
 * On each scan:
 * 1. New items are inserted (firstSeenAt = now)
 * 2. Existing items get metrics updated (views, likes, comments)
 * 3. Previous views are snapshotted for drift detection
 */
import { db } from "@/lib/db";
import { creatorMediaItem } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { ContentItem, Platform } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WarehouseItem = {
  id: string;
  platform: Platform;
  username: string;
  externalId: string;
  permalink: string;
  caption: string | null;
  publishedAt: string;
  contentKind: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  isCommercial: boolean;
  firstSeenAt: string;
  lastMetricUpdateAt: string;
  previousViews: number | null;
  metricUpdateCount: number;
};

export type IngestResult = {
  newItems: number;
  updatedItems: number;
  unchangedItems: number;
  totalProcessed: number;
};

export type MetricDrift = {
  externalId: string;
  permalink: string;
  previousViews: number | null;
  currentViews: number | null;
  delta: number;
  percentChange: number | null;
};

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

let warehouseIdCounter = 0;

/**
 * Ingest a batch of ContentItems into the warehouse.
 * - New items are inserted
 * - Existing items get metrics updated (views, likes, comments)
 * - Returns summary of what happened
 */
export function ingestContentItems(
  items: ContentItem[],
  platform: Platform,
  username: string
): IngestResult {
  const normalizedUsername = username.toLowerCase().trim();
  const now = new Date().toISOString();
  let newItems = 0;
  let updatedItems = 0;
  let unchangedItems = 0;

  for (const item of items) {
    const externalId = item.id;

    // Check for existing item
    const existing = db
      .select()
      .from(creatorMediaItem)
      .where(
        and(
          eq(creatorMediaItem.platform, platform),
          eq(creatorMediaItem.externalId, externalId)
        )
      )
      .get();

    if (existing) {
      // Update metrics if they changed
      const viewsChanged = item.views !== existing.views;
      const likesChanged = (item.likeCount ?? null) !== existing.likes;
      const commentsChanged = (item.commentsCount ?? null) !== existing.comments;

      if (viewsChanged || likesChanged || commentsChanged) {
        db.update(creatorMediaItem)
          .set({
            views: item.views ?? existing.views,
            likes: item.likeCount ?? existing.likes,
            comments: item.commentsCount ?? existing.comments,
            previousViews: existing.views,
            lastMetricUpdateAt: now,
            metricUpdateCount: existing.metricUpdateCount + 1,
            // Update caption if it was previously null
            caption: item.caption ?? existing.caption,
          })
          .where(eq(creatorMediaItem.id, existing.id))
          .run();
        updatedItems++;
      } else {
        unchangedItems++;
      }
    } else {
      // Insert new item
      const id = `mi_${Date.now()}_${++warehouseIdCounter}`;
      const isCommercial = !!(
        item.commercialMetadata?.isPaidPartnership ||
        item.commercialMetadata?.isSponsored
      );

      db.insert(creatorMediaItem)
        .values({
          id,
          platform,
          username: normalizedUsername,
          externalId,
          permalink: item.permalink,
          caption: item.caption ?? null,
          publishedAt: item.timestamp,
          contentKind: item.contentKind ?? null,
          thumbnailUrl: item.thumbnailUrl ?? null,
          views: item.views ?? null,
          likes: item.likeCount ?? null,
          comments: item.commentsCount ?? null,
          isCommercial,
          commercialMetadataJson: item.commercialMetadata
            ? JSON.stringify(item.commercialMetadata)
            : null,
          rawMetadataJson: item.rawMetadata
            ? JSON.stringify(item.rawMetadata)
            : null,
          firstSeenAt: now,
          lastMetricUpdateAt: now,
          previousViews: null,
          metricUpdateCount: 1,
        })
        .run();
      newItems++;
    }
  }

  return {
    newItems,
    updatedItems,
    unchangedItems,
    totalProcessed: items.length,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get all warehouse items for a creator, newest first.
 */
export function getCreatorItems(
  platform: Platform,
  username: string
): WarehouseItem[] {
  const normalizedUsername = username.toLowerCase().trim();
  const rows = db
    .select()
    .from(creatorMediaItem)
    .where(
      and(
        eq(creatorMediaItem.platform, platform),
        eq(creatorMediaItem.username, normalizedUsername)
      )
    )
    .orderBy(desc(creatorMediaItem.publishedAt))
    .all();

  return rows.map(rowToItem);
}

/**
 * Get items with significant metric drift (view count changed).
 */
export function getMetricDrifts(
  platform: Platform,
  username: string
): MetricDrift[] {
  const items = getCreatorItems(platform, username);
  return items
    .filter((item) => item.previousViews !== null && item.views !== null)
    .map((item) => {
      const delta = (item.views ?? 0) - (item.previousViews ?? 0);
      const percentChange =
        item.previousViews && item.previousViews > 0
          ? (delta / item.previousViews) * 100
          : null;
      return {
        externalId: item.externalId,
        permalink: item.permalink,
        previousViews: item.previousViews,
        currentViews: item.views,
        delta,
        percentChange,
      };
    })
    .filter((d) => d.delta !== 0);
}

/**
 * Count total items in warehouse for a creator.
 */
export function getCreatorItemCount(
  platform: Platform,
  username: string
): number {
  const normalizedUsername = username.toLowerCase().trim();
  const rows = db
    .select({ id: creatorMediaItem.id })
    .from(creatorMediaItem)
    .where(
      and(
        eq(creatorMediaItem.platform, platform),
        eq(creatorMediaItem.username, normalizedUsername)
      )
    )
    .all();
  return rows.length;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToItem(row: typeof creatorMediaItem.$inferSelect): WarehouseItem {
  return {
    id: row.id,
    platform: row.platform as Platform,
    username: row.username,
    externalId: row.externalId,
    permalink: row.permalink,
    caption: row.caption ?? null,
    publishedAt: row.publishedAt,
    contentKind: row.contentKind ?? null,
    views: row.views ?? null,
    likes: row.likes ?? null,
    comments: row.comments ?? null,
    isCommercial: !!row.isCommercial,
    firstSeenAt: row.firstSeenAt,
    lastMetricUpdateAt: row.lastMetricUpdateAt,
    previousViews: row.previousViews ?? null,
    metricUpdateCount: row.metricUpdateCount,
  };
}
