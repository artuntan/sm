/**
 * /api/auth/me — Custom User Status Endpoint
 *
 * Returns the current user's approval status, system role,
 * active team context, and pending team request status.
 *
 * Used by the client-side auth gate to determine which screen to show.
 */

import { NextResponse } from "next/server";
import { getSessionUser, getTeamContext } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teamJoinRequest } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated." } },
      { status: 401 }
    );
  }

  // Get team context
  const team = await getTeamContext(user.id);

  // Check for pending team requests if no active membership
  let hasPendingTeamRequest = false;
  if (!team) {
    const pending = await db
      .select()
      .from(teamJoinRequest)
      .where(
        and(
          eq(teamJoinRequest.userId, user.id),
          eq(teamJoinRequest.status, "pending")
        )
      )
      .limit(1);
    hasPendingTeamRequest = pending.length > 0;
  }

  const isSystemAdmin = user.systemRole === "system_admin";

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    systemRole: user.systemRole,
    approvalStatus: user.approvalStatus,
    isSystemAdmin,
    team,
    hasPendingTeamRequest,
  });
}
