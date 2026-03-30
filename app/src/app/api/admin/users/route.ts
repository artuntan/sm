/**
 * System Admin — User Approval API
 *
 * GET  — list users (pending by default, or all with ?status=all)
 * POST — approve or reject a user
 *
 * Requires system_admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { user, teamMembership, team } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const status = request.nextUrl.searchParams.get("status") || "pending";

  // Parse pagination
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

  let rows;
  if (status === "all") {
    rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        systemRole: user.systemRole,
        approvalStatus: user.approvalStatus,
        createdAt: user.createdAt,
      })
      .from(user)
      .limit(limit)
      .offset(offset);
  } else {
    rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        systemRole: user.systemRole,
        approvalStatus: user.approvalStatus,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.approvalStatus, status as "pending" | "approved" | "rejected" | "suspended"))
      .limit(limit)
      .offset(offset);
  }

  // Enrich with team membership info
  const usersWithTeams = await Promise.all(
    rows.map(async (u) => {
      const memberships = await db
        .select({
          teamId: teamMembership.teamId,
          role: teamMembership.role,
          active: teamMembership.active,
          teamName: team.name,
          teamSlug: team.slug,
        })
        .from(teamMembership)
        .innerJoin(team, eq(teamMembership.teamId, team.id))
        .where(eq(teamMembership.userId, u.id));

      return { ...u, teams: memberships };
    })
  );

  return NextResponse.json({ users: usersWithTeams });
}

export async function POST(request: NextRequest) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await request.json();
  const { userId, action, reason } = body as {
    userId: string;
    action: "approve" | "reject" | "suspend";
    reason?: string;
  };

  if (!userId || !action) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "userId and action required." } },
      { status: 400 }
    );
  }

  const statusMap: Record<string, string> = {
    approve: "approved",
    reject: "rejected",
    suspend: "suspended",
  };

  const newStatus = statusMap[action];
  if (!newStatus) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid action." } },
      { status: 400 }
    );
  }

  await db
    .update(user)
    .set({
      approvalStatus: newStatus as "pending" | "approved" | "rejected" | "suspended",
      approvedBy: admin.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));

  return NextResponse.json({ success: true, userId, status: newStatus });
}
