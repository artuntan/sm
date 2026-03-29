/**
 * Dimes Content Coverage — Brands API
 *
 * GET /api/dimes/brands — list all brands with their accounts
 */

import { NextResponse } from "next/server";
import { getAllBrands, PLATFORM_ACCESS } from "@/lib/dimes/accounts";

export async function GET() {
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
    return NextResponse.json(
      { error: "Failed to list brands" },
      { status: 500 }
    );
  }
}
