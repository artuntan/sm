/**
 * System Admin — Team Members Management API
 *
 * GET    — list all members of a team
 * PATCH  — change member role (member <-> team_admin)
 * DELETE — deactivate a membership
 *
 * Requires system_admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teamMembership, user, team } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const { teamId } = await context.params;

  // Verify team exists
  const teamRow = await db
    .select()
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);

  if (teamRow.length === 0) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Team not found." } },
      { status: 404 }
    );
  }

  const members = await db
    .select({
      membershipId: teamMembership.id,
      userId: teamMembership.userId,
      role: teamMembership.role,
      active: teamMembership.active,
      joinedAt: teamMembership.joinedAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(teamMembership)
    .innerJoin(user, eq(teamMembership.userId, user.id))
    .where(eq(teamMembership.teamId, teamId));

  return NextResponse.json({
    team: teamRow[0],
    members,
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const { teamId } = await context.params;
  const body = await request.json();
  const { membershipId, role } = body as {
    membershipId: string;
    role: "team_admin" | "member";
  };

  if (!membershipId || !role) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "membershipId and role required." } },
      { status: 400 }
    );
  }

  if (!["team_admin", "member"].includes(role)) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Role must be 'team_admin' or 'member'." } },
      { status: 400 }
    );
  }

  await db
    .update(teamMembership)
    .set({ role })
    .where(
      and(
        eq(teamMembership.id, membershipId),
        eq(teamMembership.teamId, teamId)
      )
    );

  return NextResponse.json({ success: true, membershipId, role });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const { teamId } = await context.params;
  const body = await request.json();
  const { membershipId } = body as { membershipId: string };

  if (!membershipId) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "membershipId required." } },
      { status: 400 }
    );
  }

  await db
    .update(teamMembership)
    .set({ active: false })
    .where(
      and(
        eq(teamMembership.id, membershipId),
        eq(teamMembership.teamId, teamId)
      )
    );

  return NextResponse.json({ success: true, membershipId, deactivated: true });
}
