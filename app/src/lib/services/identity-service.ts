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
import { influencerIdentity, creatorScanCache, creatorScanProfile } from "@/lib/db/schema";
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
    // Keep the older row (or IG row), absorb the TT row's data
    const keepRow = byIg;
    const deleteRow = byTt;

    db.update(influencerIdentity)
      .set({
        instagramUsername: ig,
        tiktokUsername: tt,
        displayName: keepRow.displayName || ig || tt,
        updatedAt: now,
      })
      .where(eq(influencerIdentity.id, keepRow.id))
      .run();

    // Delete the orphan row
    db.delete(influencerIdentity)
      .where(eq(influencerIdentity.id, deleteRow.id))
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
 * Scans creator_scan_cache and creator_scan_profile tables,
 * finds platform accounts without identity rows, and creates them.
 * Also merges split identities where possible.
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

  // Collect all unique platform:username pairs
  const allCache = db.select().from(creatorScanCache).all();
  const allProfiles = db.select().from(creatorScanProfile).all();

  const platformAccounts = new Map<string, Set<string>>(); // username → Set<platform>
  const allPairs = new Set<string>();

  for (const row of [...allCache, ...allProfiles]) {
    const key = `${row.platform}:${row.username}`;
    if (allPairs.has(key)) continue;
    allPairs.add(key);

    const existing = platformAccounts.get(row.username) || new Set();
    existing.add(row.platform);
    platformAccounts.set(row.username, existing);
  }

  // For each platform account, ensure an identity exists
  for (const [username, platforms] of platformAccounts) {
    const ig = platforms.has("instagram") ? username : null;
    const tt = platforms.has("tiktok") ? username : null;

    // Check if this account already has an identity
    const hasIgIdentity = ig
      ? db
          .select()
          .from(influencerIdentity)
          .where(eq(influencerIdentity.instagramUsername, ig))
          .get()
      : undefined;
    const hasTtIdentity = tt
      ? db
          .select()
          .from(influencerIdentity)
          .where(eq(influencerIdentity.tiktokUsername, tt))
          .get()
      : undefined;

    if (hasIgIdentity || hasTtIdentity) {
      // If same username has both platforms AND both have identity rows,
      // and they're different rows, merge will happen via ensureIdentity
      if (hasIgIdentity && hasTtIdentity && hasIgIdentity.id !== hasTtIdentity.id) {
        ensureIdentity(ig, tt);
        merged++;
        details.push(`merged: ig=${ig}, tt=${tt}`);
      } else if (ig && tt) {
        // Same username on both platforms, one identity exists → update
        ensureIdentity(ig, tt);
        alreadyOk++;
      } else {
        alreadyOk++;
      }
    } else {
      // No identity exists for this account at all → create
      ensureIdentity(ig, tt);
      created++;
      details.push(`created: ${ig ? `ig=${ig}` : ""}${tt ? `tt=${tt}` : ""}`);
    }
  }

  return { created, merged, alreadyOk, details };
}
