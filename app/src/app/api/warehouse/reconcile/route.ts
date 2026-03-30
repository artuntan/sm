/**
 * GET /api/warehouse/reconcile
 *
 * Reconciles all existing scan data with the identity table.
 * Creates missing identity rows and merges split identities.
 * Safe to call multiple times — idempotent.
 */
import { requireApproved } from "@/lib/auth/guards";
import { NextResponse } from "next/server";
import { reconcileIdentities } from "@/lib/services/identity-service";

export async function GET() {
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

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
