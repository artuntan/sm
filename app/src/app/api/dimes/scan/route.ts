/**
 * Dimes Content Coverage — Scan API
 *
 * POST /api/dimes/scan
 *
 * Three modes:
 *   1. Full scan: complete rescan across all verified accounts
 *      POST /api/dimes/scan  { mode: "full" }
 *
 *   2. Fast scan: incremental scan since last successful scan
 *      POST /api/dimes/scan  { mode: "fast" }
 *
 *   3. Demo ingest: accepts pre-fetched post data
 *      POST /api/dimes/scan?auto=false  { posts: [...] }
 *
 * All ingested posts are DURABLY stored in SQLite.
 * Results survive page refreshes and server restarts.
 *
 * Per-account scan state is tracked durably in coverage_account_scan_state.
 * Only accounts whose fetch succeeds advance their scan cursor.
 */

import { requireApproved } from "@/lib/auth/guards";
import { checkRateLimit, expensiveApiLimiter } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import {
  executeScanRun,
  getDailyScanConfig,
  type RawFetchedPost,
} from "@/lib/dimes/scanner";
import { getAllBrands, getVerifiedAccounts } from "@/lib/dimes/accounts";
import { fetchPostsForAccount, type FetchIntent } from "@/lib/dimes/providers";
import * as repo from "@/lib/dimes/repository";
import type { DimesSocialAccount, ScanType, ScanError } from "@/lib/dimes/types";

// Safety overlap for fast scans — avoids boundary misses
const FAST_SCAN_OVERLAP_HOURS = 6;

export async function POST(request: Request) {
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  const limited = await checkRateLimit(expensiveApiLimiter, "dimes-scan");
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const autoScan = url.searchParams.get("auto") !== "false"; // default true

    const body = await request.json().catch(() => ({}));

    // Determine scan mode — "full" | "fast" | legacy "daily" | "backfill"
    const rawMode: string = body.mode || url.searchParams.get("mode") || url.searchParams.get("type") || body.type || "full";
    const scanMode: "full" | "fast" = rawMode === "fast" ? "fast" : "full";
    const scanType: ScanType = scanMode;

    // Build account lookup
    const brands = getAllBrands();
    const accountMap = new Map<string, DimesSocialAccount>();
    for (const brand of brands) {
      for (const account of brand.accounts) {
        accountMap.set(account.id, account);
      }
    }

    const allFetchedPosts: Array<{
      raw: RawFetchedPost;
      account: DimesSocialAccount;
    }> = [];
    const scanErrors: ScanError[] = [];
    const accountWindows: Record<string, { since: string | null; mode: string; fallbackToFull: boolean }> = {};
    const successfulAccountIds = new Set<string>();

    // --- Mode: Accept manual pre-fetched posts ---
    const inputPosts: Array<{
      raw: RawFetchedPost;
      accountId: string;
    }> = body.posts || [];

    for (const { raw, accountId } of inputPosts) {
      const account = accountMap.get(accountId);
      if (account) {
        allFetchedPosts.push({ raw, account });
      }
    }

    // --- Mode: Live scan — call real platform providers ---
    if (autoScan && inputPosts.length === 0) {
      console.log(`[Dimes Scan] Starting ${scanMode} scan for ${brands.length} brands`);

      for (const brand of brands) {
        const accounts = getVerifiedAccounts(brand);

        for (const account of accounts) {
          // Build per-account fetch intent
          let intent: FetchIntent | undefined;
          let effectiveSince: string | null = null;
          let fallbackToFull = false;

          if (scanMode === "fast") {
            const state = await repo.getAccountScanState(account.id);

            if (state?.lastSuccessfulScanAt) {
              // Compute window with safety overlap
              const lastScanMs = new Date(state.lastSuccessfulScanAt).getTime();
              const overlapMs = FAST_SCAN_OVERLAP_HOURS * 60 * 60 * 1000;
              const sinceMs = lastScanMs - overlapMs;
              effectiveSince = new Date(sinceMs).toISOString();

              const elapsedDays = Math.max(
                0.5,
                (Date.now() - lastScanMs) / (24 * 60 * 60 * 1000)
              );

              intent = {
                mode: "fast",
                since: effectiveSince,
                elapsedDays,
              };

              console.log(
                `[Dimes Scan] ${account.platform}/@${account.handle}: fast scan since ${effectiveSince} (${elapsedDays.toFixed(1)} days elapsed)`
              );
            } else {
              // No prior scan — fall back to full for this account
              fallbackToFull = true;
              intent = { mode: "full" };
              console.log(
                `[Dimes Scan] ${account.platform}/@${account.handle}: no prior scan — falling back to full`
              );
            }
          }

          accountWindows[account.id] = {
            since: effectiveSince,
            mode: fallbackToFull ? "full (fallback)" : scanMode,
            fallbackToFull,
          };

          console.log(`[Dimes Scan] Fetching ${account.platform}/@${account.handle}...`);

          try {
            const result = await fetchPostsForAccount(
              account,
              undefined, // use default maxPosts (intent will override for fast)
              intent
            );

            if (result.error) {
              console.warn(`[Dimes Scan] ${account.platform}/@${account.handle}: ${result.error}`);
              scanErrors.push({
                accountId: account.id,
                platform: account.platform,
                handle: account.handle,
                error: result.error,
                timestamp: new Date().toISOString(),
              });
            } else {
              // Mark account as successfully scanned
              successfulAccountIds.add(account.id);
            }

            for (const raw of result.posts) {
              allFetchedPosts.push({ raw, account });
            }

            console.log(
              `[Dimes Scan] ${account.platform}/@${account.handle}: ${result.posts.length} posts fetched`
            );
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "unknown error";
            console.error(`[Dimes Scan] ${account.platform}/@${account.handle}: ${errorMsg}`);
            scanErrors.push({
              accountId: account.id,
              platform: account.platform,
              handle: account.handle,
              error: errorMsg,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Execute scan (ingestion + classification + clustering) — writes to DB
    const scanRun = await executeScanRun(scanType, allFetchedPosts, scanErrors);

    // Update per-account scan state — ONLY for successful accounts
    const now = new Date().toISOString();
    for (const accountId of successfulAccountIds) {
      const account = accountMap.get(accountId);
      if (!account) continue;

      // Find the latest publishedAt among posts fetched for this account
      const accountPosts = allFetchedPosts
        .filter((fp) => fp.account.id === accountId)
        .map((fp) => fp.raw.publishedAt)
        .filter(Boolean)
        .sort()
        .reverse();

      const latestPostPublishedAt = accountPosts[0] || null;

      await repo.upsertAccountScanState({
        accountId: account.id,
        platform: account.platform,
        brandId: account.brandId,
        lastSuccessfulScanAt: now,
        lastScanMode: scanMode,
        lastScanPostCount: allFetchedPosts.filter((fp) => fp.account.id === accountId).length,
        latestPostPublishedAt,
        updatedAt: now,
      });
    }

    // Read actual post count from DB to confirm truthfulness
    const totalPostsInDb = await repo.getPostCount();

    // Build honest status message
    let statusLabel: string;
    if (scanRun.status === "error") {
      statusLabel = "FAILED";
    } else if (scanRun.status === "partial") {
      statusLabel = "PARTIAL SUCCESS";
    } else if (scanRun.newPostsIngested === 0 && allFetchedPosts.length > 0) {
      statusLabel = "NO NEW POSTS";
    } else if (scanRun.newPostsIngested === 0) {
      statusLabel = "EMPTY";
    } else {
      statusLabel = "SUCCESS";
    }

    const modeLabel = scanMode === "fast" ? "FAST" : "FULL";

    return NextResponse.json({
      scanRun,
      totalPostsInDb,
      statusLabel,
      scanMode,
      accountWindows,
      message:
        `[${statusLabel}] [${modeLabel}] ` +
        `${scanRun.newPostsIngested} new posts ingested ` +
        `(${allFetchedPosts.length - scanRun.newPostsIngested} duplicates skipped). ` +
        `${scanRun.clustersCreated} clusters. ` +
        `${totalPostsInDb} total posts in DB. ` +
        `${scanErrors.length > 0 ? `${scanErrors.length} provider errors.` : ""}`,
    });
  } catch (error) {
    console.error("[Dimes Scan]", error);
    return NextResponse.json(
      { error: "Scan failed", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dimes/scan
 * Returns the daily scan configuration, scan history (from DB),
 * and per-account scan states for UI preview.
 */
export async function GET() {
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  try {
    const config = getDailyScanConfig();
    const history = await repo.getScanHistory();
    const accountScanStates = await repo.getAllAccountScanStates();

    return NextResponse.json({
      config,
      history: history.slice(-20),
      accountScanStates,
    });
  } catch (error) {
    console.error("[Dimes Scan Config]", error);
    return NextResponse.json(
      { error: "Failed to get scan config" },
      { status: 500 }
    );
  }
}
