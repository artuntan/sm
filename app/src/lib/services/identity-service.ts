/**
 * Identity Service — Canonical creator identity management
 *
 * ensureIdentity(ig?, tt?) is the single entry point for all identity
 * creation/merge operations. It guarantees:
 * - Every scanned platform account has an identity row
 * - Paired IG+TT accounts are always merged into one identity
 * - Pre-existing split rows are detected and merged
 * - No duplicate identity rows for the same username
 */
import { db } from "@/lib/db";
import { influencerIdentity, creatorScanCache, creatorScanProfile, analysisRun } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type IdentityRow = typeof influencerIdentity.$inferSelect;

/**
 * Ensure a single identity row exists for the given username(s).
 *
 * Handles all cases:
 * - Single IG only → create or find identity
 * - Single TT only → create or find identity
 * - Both IG + TT → create, update, or merge identity rows
 *
 * Returns the canonical identity ID.
 */
export function ensureIdentity(
  instagramUsername?: string | null,
  tiktokUsername?: string | null
): string {
  const ig = instagramUsername?.toLowerCase().trim() || null;
  const tt = tiktokUsername?.toLowerCase().trim() || null;

  if (!ig && !tt) {
    throw new Error("ensureIdentity requires at least one username");
  }

  const now = new Date().toISOString();

  // Find existing identities for each platform
  const byIg: IdentityRow | undefined = ig
    ? db
        .select()
        .from(influencerIdentity)
        .where(eq(influencerIdentity.instagramUsername, ig))
        .get()
    : undefined;

  const byTt: IdentityRow | undefined = tt
    ? db
        .select()
        .from(influencerIdentity)
        .where(eq(influencerIdentity.tiktokUsername, tt))
        .get()
    : undefined;

  // ── Case 1: Both exist and are the SAME row → already merged ──
  if (byIg && byTt && byIg.id === byTt.id) {
    return byIg.id;
  }

  // ── Case 2: Both exist but are DIFFERENT rows → merge ──
  if (byIg && byTt && byIg.id !== byTt.id) {
    // Keep the IG row, absorb the TT row's data
    const keepRow = byIg;
    const deleteRow = byTt;

    // Delete orphan FIRST to avoid UNIQUE constraint violation
    db.delete(influencerIdentity)
      .where(eq(influencerIdentity.id, deleteRow.id))
      .run();

    // Now safe to update the kept row with merged usernames
    db.update(influencerIdentity)
      .set({
        instagramUsername: ig,
        tiktokUsername: tt,
        displayName: keepRow.displayName || ig || tt,
        updatedAt: now,
      })
      .where(eq(influencerIdentity.id, keepRow.id))
      .run();

    console.log(
      `[identity] Merged split identities: kept=${keepRow.id}, deleted=${deleteRow.id} → ig=${ig}, tt=${tt}`
    );

    return keepRow.id;
  }

  // ── Case 3: Only IG identity exists → update with TT if provided ──
  if (byIg && !byTt) {
    if (tt) {
      db.update(influencerIdentity)
        .set({ tiktokUsername: tt, updatedAt: now })
        .where(eq(influencerIdentity.id, byIg.id))
        .run();
    }
    return byIg.id;
  }

  // ── Case 4: Only TT identity exists → update with IG if provided ──
  if (!byIg && byTt) {
    if (ig) {
      db.update(influencerIdentity)
        .set({ instagramUsername: ig, updatedAt: now })
        .where(eq(influencerIdentity.id, byTt.id))
        .run();
    }
    return byTt.id;
  }

  // ── Case 5: No identity exists → create new ──
  const id = `identity_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.insert(influencerIdentity)
    .values({
      id,
      instagramUsername: ig,
      tiktokUsername: tt,
      displayName: ig || tt,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return id;
}

/**
 * Reconcile all existing scan data into proper identity rows.
 *
 * Two-phase approach:
 * Phase 1: Read pair provenance from analysis_run.inputSummary — this contains
 *          the exact {instagram, tiktok} pairs from every batch input. Call
 *          ensureIdentity(ig, tt) for each, which will merge split rows.
 * Phase 2: Ensure every orphan platform account (scanned but not linked)
 *          has at least a single-platform identity row.
 *
 * Returns a summary of operations performed.
 */
export function reconcileIdentities(): {
  created: number;
  merged: number;
  alreadyOk: number;
  details: string[];
} {
  const details: string[] = [];
  let created = 0;
  let merged = 0;
  let alreadyOk = 0;

  // ── Phase 1: Pair provenance from analysis_run.inputSummary ──
  // Each inputSummary is a JSON array of {instagram?, tiktok?, label?}
  // Process most recent runs first so latest evidence takes precedence
  const runs = db.select({ inputSummary: analysisRun.inputSummary })
    .from(analysisRun)
    .all()
    .reverse();

  const processedPairs = new Set<string>();

  for (const run of runs) {
    let rows: Array<{ instagram?: string; tiktok?: string }>;
    try {
      rows = JSON.parse(run.inputSummary);
    } catch {
      continue;
    }

    for (const row of rows) {
      const ig = row.instagram?.toLowerCase().trim() || null;
      const tt = row.tiktok?.toLowerCase().trim() || null;
      if (!ig && !tt) continue;

      const pairKey = `${ig || ""}|${tt || ""}`;
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      // Check current state before calling ensureIdentity
      const byIg = ig
        ? db.select().from(influencerIdentity).where(eq(influencerIdentity.instagramUsername, ig)).get()
        : undefined;
      const byTt = tt
        ? db.select().from(influencerIdentity).where(eq(influencerIdentity.tiktokUsername, tt)).get()
        : undefined;

      if (ig && tt) {
        // Paired row — this is the key case
        if (byIg && byTt && byIg.id === byTt.id) {
          alreadyOk++;
        } else if (byIg && byTt && byIg.id !== byTt.id) {
          // Split rows exist — merge them
          ensureIdentity(ig, tt);
          merged++;
          details.push(`merged: ig=${ig} + tt=${tt}`);
        } else if (byIg || byTt) {
          // One side exists — update with the other
          ensureIdentity(ig, tt);
          merged++;
          details.push(`linked: ig=${ig} + tt=${tt}`);
        } else {
          // Neither exists — create paired identity
          ensureIdentity(ig, tt);
          created++;
          details.push(`created pair: ig=${ig} + tt=${tt}`);
        }
      } else {
        // Single-platform row
        if (byIg || byTt) {
          alreadyOk++;
        } else {
          ensureIdentity(ig, tt);
          created++;
          details.push(`created single: ${ig ? `ig=${ig}` : `tt=${tt}`}`);
        }
      }
    }
  }

  // ── Phase 2: Orphan sweep — platform accounts not covered by any identity ──
  const allCache = db.select().from(creatorScanCache).all();
  const allProfiles = db.select().from(creatorScanProfile).all();

  const orphanKeys = new Set<string>();
  for (const c of allCache) orphanKeys.add(`${c.platform}:${c.username}`);
  for (const p of allProfiles) orphanKeys.add(`${p.platform}:${p.username}`);

  for (const key of orphanKeys) {
    const [platform, username] = key.split(":");

    // Check if this account already has an identity
    const hasIdentity =
      platform === "instagram"
        ? db.select().from(influencerIdentity).where(eq(influencerIdentity.instagramUsername, username)).get()
        : db.select().from(influencerIdentity).where(eq(influencerIdentity.tiktokUsername, username)).get();

    if (hasIdentity) continue;

    // No identity for this orphan — create one
    const ig = platform === "instagram" ? username : null;
    const tt = platform === "tiktok" ? username : null;
    ensureIdentity(ig, tt);
    created++;
    details.push(`orphan: ${platform}=${username}`);
  }

  return { created, merged, alreadyOk, details };
}

