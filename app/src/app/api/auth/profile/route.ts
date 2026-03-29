/**
 * Profile API — Self-Service Profile Management
 *
 * PATCH — Update display name
 *
 * Requires authenticated session. Users can only edit their own profile.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated." } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { name } = body as { name?: string };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "A non-empty name is required." } },
      { status: 400 }
    );
  }

  if (name.trim().length > 100) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Name must be 100 characters or fewer." } },
      { status: 400 }
    );
  }

  await db
    .update(user)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(user.id, sessionUser.id));

  return NextResponse.json({
    success: true,
    name: name.trim(),
  });
}
