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
export async function ensureIdentity(
  instagramUsername?: string | null,
  tiktokUsername?: string | null
): Promise<string> {
  const ig = instagramUsername?.toLowerCase().trim() || null;
  const tt = tiktokUsername?.toLowerCase().trim() || null;

  if (!ig && !tt) {
    throw new Error("ensureIdentity requires at least one username");
  }

  const now = new Date().toISOString();

  // Find existing identities for each platform
  const byIgRows = ig
    ? await db
        .select()
        .from(influencerIdentity)
        .where(eq(influencerIdentity.instagramUsername, ig))
        .limit(1)
    : [];
  const byIg: IdentityRow | undefined = byIgRows[0];

  const byTtRows = tt
    ? await db
        .select()
        .from(influencerIdentity)
        .where(eq(influencerIdentity.tiktokUsername, tt))
        .limit(1)
    : [];
  const byTt: IdentityRow | undefined = byTtRows[0];

  // ── Case 1: Both exist and are the SAME row → already merged ──
  if (byIg && byTt && byIg.id === byTt.id) {
    return byIg.id;
  }

  // ── Case 2: Both exist but are DIFFERENT rows → merge ──
  if (byIg && byTt && byIg.id !== byTt.id) {
    const keepRow = byIg;
    const deleteRow = byTt;

    // Delete orphan FIRST to avoid UNIQUE constraint violation
    await db.delete(influencerIdentity)
      .where(eq(influencerIdentity.id, deleteRow.id));

    // Now safe to update the kept row with merged usernames
    await db.update(influencerIdentity)
      .set({
        instagramUsername: ig,
        tiktokUsername: tt,
        displayName: keepRow.displayName || ig || tt,
        updatedAt: now,
      })
      .where(eq(influencerIdentity.id, keepRow.id));

    console.log(
      `[identity] Merged split identities: kept=${keepRow.id}, deleted=${deleteRow.id} → ig=${ig}, tt=${tt}`
    );

    return keepRow.id;
  }

  // ── Case 3: Only IG identity exists → update with TT if provided ──
  if (byIg && !byTt) {
    if (tt) {
      await db.update(influencerIdentity)
        .set({ tiktokUsername: tt, updatedAt: now })
        .where(eq(influencerIdentity.id, byIg.id));
    }
    return byIg.id;
  }

  // ── Case 4: Only TT identity exists → update with IG if provided ──
  if (!byIg && byTt) {
    if (ig) {
      await db.update(influencerIdentity)
        .set({ instagramUsername: ig, updatedAt: now })
        .where(eq(influencerIdentity.id, byTt.id));
    }
    return byTt.id;
  }

  // ── Case 5: No identity exists → create new ──
  const id = `identity_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(influencerIdentity)
    .values({
      id,
      instagramUsername: ig,
      tiktokUsername: tt,
      displayName: ig || tt,
      createdAt: now,
      updatedAt: now,
    });

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
export async function reconcileIdentities(): Promise<{
  created: number;
  merged: number;
  alreadyOk: number;
  skipped: number;
  details: string[];
}> {
  const details: string[] = [];
  let created = 0;
  let merged = 0;
  let alreadyOk = 0;
  let skipped = 0;

  // ── Phase 1: Collect pair evidence and compute majority vote ──
  const igToTtVotes = new Map<string, Map<string, number>>();
  const ttToIgVotes = new Map<string, Map<string, number>>();
  const scannedIg = new Set<string>();
  const scannedTt = new Set<string>();

  const allCache = await db.select().from(creatorScanCache);
  const allProfiles = await db.select().from(creatorScanProfile);
  for (const c of allCache) {
    if (c.platform === "instagram") scannedIg.add(c.username);
    if (c.platform === "tiktok") scannedTt.add(c.username);
  }
  for (const p of allProfiles) {
    if (p.platform === "instagram") scannedIg.add(p.username);
    if (p.platform === "tiktok") scannedTt.add(p.username);
  }

  // inputSummary is now jsonb — no JSON.parse needed
  const runs = await db.select({ inputSummary: analysisRun.inputSummary }).from(analysisRun);

  for (const run of runs) {
    const rows = run.inputSummary as Array<{ instagram?: string; tiktok?: string }> | null;
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      const ig = row.instagram?.toLowerCase().trim() || null;
      const tt = row.tiktok?.toLowerCase().trim() || null;
      if (!ig || !tt) continue;

      // Sanity: skip if IG handle is actually a known TT-only username, or vice versa
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
  const canonicalPairs = new Map<string, string>();
  const processedIg = new Set<string>();
  const processedTt = new Set<string>();

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

    // Verify the TT side also agrees
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
    const byIgRows = await db.select().from(influencerIdentity).where(eq(influencerIdentity.instagramUsername, ig)).limit(1);
    const byIg = byIgRows[0];
    const byTtRows = await db.select().from(influencerIdentity).where(eq(influencerIdentity.tiktokUsername, tt)).limit(1);
    const byTt = byTtRows[0];

    if (byIg && byTt && byIg.id === byTt.id) {
      alreadyOk++;
    } else if (byIg && byTt && byIg.id !== byTt.id) {
      await ensureIdentity(ig, tt);
      merged++;
      details.push(`merged: ig=${ig} + tt=${tt}`);
    } else if (byIg || byTt) {
      await ensureIdentity(ig, tt);
      merged++;
      details.push(`linked: ig=${ig} + tt=${tt}`);
    } else {
      await ensureIdentity(ig, tt);
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

    const identityRows = platform === "instagram"
      ? await db.select().from(influencerIdentity).where(eq(influencerIdentity.instagramUsername, username)).limit(1)
      : await db.select().from(influencerIdentity).where(eq(influencerIdentity.tiktokUsername, username)).limit(1);

    if (identityRows[0]) continue;

    const ig = platform === "instagram" ? username : null;
    const tt = platform === "tiktok" ? username : null;
    await ensureIdentity(ig, tt);
    created++;
    details.push(`orphan: ${platform}=${username}`);
  }

  return { created, merged, alreadyOk, skipped, details };
}
