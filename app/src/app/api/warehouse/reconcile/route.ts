/**
 * GET /api/warehouse/reconcile
 *
 * Reconciles all existing scan data with the identity table.
 * Creates missing identity rows and merges split identities.
 * Safe to call multiple times — idempotent.
 */
import { NextResponse } from "next/server";
import { reconcileIdentities } from "@/lib/services/identity-service";

export async function GET() {
  try {
    const result = await reconcileIdentities();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("[reconcile] Error:", err);
    return NextResponse.json(
      { error: "Reconciliation failed", details: String(err) },
      { status: 500 }
    );
  }
}
