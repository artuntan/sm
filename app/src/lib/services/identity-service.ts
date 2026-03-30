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
 * Three-phase approach:
 * Phase 1: Collect ALL pair evidence from analysis_run.inputSummary, then use
 *          majority-vote to determine the canonical pairing for each handle.
 *          This prevents contamination from occasional bad/typo data in history.
 * Phase 2: Apply canonical pairs via ensureIdentity().
 * Phase 3: Ensure every orphan platform account (scanned but not linked)
 *          has at least a single-platform identity row.
 *
 * Returns a summary of operations performed.
 */
export function reconcileIdentities(): {
  created: number;
  merged: number;
  alreadyOk: number;
  skipped: number;
  details: string[];
} {
  const details: string[] = [];
  let created = 0;
  let merged = 0;
  let alreadyOk = 0;
  let skipped = 0;

  // ── Phase 1: Collect pair evidence and compute majority vote ──
  // For each IG handle, tally how many runs pair it with each TT handle
  const igToTtVotes = new Map<string, Map<string, number>>();
  // For each TT handle, tally how many runs pair it with each IG handle
  const ttToIgVotes = new Map<string, Map<string, number>>();
  // Track all handles that have real scan data
  const scannedIg = new Set<string>();
  const scannedTt = new Set<string>();

  const allCache = db.select().from(creatorScanCache).all();
  const allProfiles = db.select().from(creatorScanProfile).all();
  for (const c of allCache) {
    if (c.platform === "instagram") scannedIg.add(c.username);
    if (c.platform === "tiktok") scannedTt.add(c.username);
  }
  for (const p of allProfiles) {
    if (p.platform === "instagram") scannedIg.add(p.username);
    if (p.platform === "tiktok") scannedTt.add(p.username);
  }

  const runs = db.select({ inputSummary: analysisRun.inputSummary }).from(analysisRun).all();

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
      if (!ig || !tt) continue; // Only count paired rows for voting

      // Sanity: skip if IG handle is actually a known TT-only username, or vice versa
      // This catches swapped-column errors (e.g. ig=bege, tt=berkcan when bege is a TT handle)
      if (scannedTt.has(ig) && !scannedIg.has(ig)) continue;
      if (scannedIg.has(tt) && !scannedTt.has(tt)) continue;

      // Tally IG→TT vote
      if (!igToTtVotes.has(ig)) igToTtVotes.set(ig, new Map());
      const igVotes = igToTtVotes.get(ig)!;
      igVotes.set(tt, (igVotes.get(tt) || 0) + 1);

      // Tally TT→IG vote
      if (!ttToIgVotes.has(tt)) ttToIgVotes.set(tt, new Map());
      const ttVotes = ttToIgVotes.get(tt)!;
      ttVotes.set(ig, (ttVotes.get(ig) || 0) + 1);
    }
  }

  // Resolve canonical pairs by majority vote
  const canonicalPairs = new Map<string, string>(); // ig → tt (canonical)
  const processedIg = new Set<string>();
  const processedTt = new Set<string>();

  // For each IG handle, find the TT handle with the most votes
  for (const [ig, ttVotes] of igToTtVotes.entries()) {
    let bestTt = "";
    let bestCount = 0;
    for (const [tt, count] of ttVotes.entries()) {
      if (count > bestCount) {
        bestTt = tt;
        bestCount = count;
      }
    }

    if (!bestTt) continue;

    // Verify the TT side also agrees: the IG handle should be the top vote for this TT
    const reverseVotes = ttToIgVotes.get(bestTt);
    if (reverseVotes) {
      let bestReverseIg = "";
      let bestReverseCount = 0;
      for (const [rIg, count] of reverseVotes.entries()) {
        if (count > bestReverseCount) {
          bestReverseIg = rIg;
          bestReverseCount = count;
        }
      }
      // If TT's top IG vote disagrees with this IG handle, skip (conflicting evidence)
      if (bestReverseIg && bestReverseIg !== ig) {
        details.push(`conflict: ig=${ig}→tt=${bestTt} but tt=${bestTt}→ig=${bestReverseIg}, skipped`);
        skipped++;
        continue;
      }
    }

    canonicalPairs.set(ig, bestTt);
    processedIg.add(ig);
    processedTt.add(bestTt);
  }

  // ── Phase 2: Apply canonical pairs ──
  for (const [ig, tt] of canonicalPairs.entries()) {
    const byIg = db.select().from(influencerIdentity).where(eq(influencerIdentity.instagramUsername, ig)).get();
    const byTt = db.select().from(influencerIdentity).where(eq(influencerIdentity.tiktokUsername, tt)).get();

    if (byIg && byTt && byIg.id === byTt.id) {
      alreadyOk++;
    } else if (byIg && byTt && byIg.id !== byTt.id) {
      ensureIdentity(ig, tt);
      merged++;
      details.push(`merged: ig=${ig} + tt=${tt}`);
    } else if (byIg || byTt) {
      ensureIdentity(ig, tt);
      merged++;
      details.push(`linked: ig=${ig} + tt=${tt}`);
    } else {
      ensureIdentity(ig, tt);
      created++;
      details.push(`created pair: ig=${ig} + tt=${tt}`);
    }
  }

  // ── Phase 3: Orphan sweep — platform accounts not covered by any identity ──
  const orphanKeys = new Set<string>();
  for (const c of allCache) orphanKeys.add(`${c.platform}:${c.username}`);
  for (const p of allProfiles) orphanKeys.add(`${p.platform}:${p.username}`);

  for (const key of orphanKeys) {
    const [platform, username] = key.split(":");

    const hasIdentity =
      platform === "instagram"
        ? db.select().from(influencerIdentity).where(eq(influencerIdentity.instagramUsername, username)).get()
        : db.select().from(influencerIdentity).where(eq(influencerIdentity.tiktokUsername, username)).get();

    if (hasIdentity) continue;

    const ig = platform === "instagram" ? username : null;
    const tt = platform === "tiktok" ? username : null;
    ensureIdentity(ig, tt);
    created++;
    details.push(`orphan: ${platform}=${username}`);
  }

  return { created, merged, alreadyOk, skipped, details };
}

