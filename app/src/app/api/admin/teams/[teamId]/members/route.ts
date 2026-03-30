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
import { z } from "zod";
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

const UpdateRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["team_admin", "member"]),
});

const DeactivateMemberSchema = z.object({
  membershipId: z.string().min(1),
});

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const { teamId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid JSON" } },
      { status: 400 }
    );
  }

  const parsed = UpdateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      { status: 422 }
    );
  }
  const { membershipId, role } = parsed.data;

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid JSON" } },
      { status: 400 }
    );
  }

  const parsed = DeactivateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      { status: 422 }
    );
  }
  const { membershipId } = parsed.data;

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
