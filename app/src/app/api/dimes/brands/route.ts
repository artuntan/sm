/**
 * Dimes Content Coverage — Brands API
 *
 * GET /api/dimes/brands — list all brands with their accounts
 */

import { requireApproved } from "@/lib/auth/guards";
import { NextResponse } from "next/server";
import { internalError } from "@/lib/api-error";
import { getAllBrands, PLATFORM_ACCESS } from "@/lib/dimes/accounts";

export async function GET() {
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  try {
    const brands = getAllBrands();

    return NextResponse.json({
      brands: brands.map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        accounts: b.accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          handle: a.handle,
          profileUrl: a.profileUrl,
          verificationStatus: a.verificationStatus,
          providerPath: a.providerPath,
          lastScannedAt: a.lastScannedAt,
          notes: a.notes,
          accessInfo: PLATFORM_ACCESS[a.platform],
        })),
      })),
      platformAccess: PLATFORM_ACCESS,
    });
  } catch (error) {
    console.error("[Dimes Brands]", error);
    return internalError("Failed to list brands.");
  }
}
