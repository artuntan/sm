/**
 * Auth Guards — Server-Side Authorization Utilities
 *
 * Each guard reads the session from the request headers,
 * resolves the user, and checks authorization conditions.
 * Returns the user/session or a NextResponse error.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { teamMembership, team as teamTable, user as userTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  systemRole: string;
  approvalStatus: string;
};

export type TeamContext = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  role: string;
};

/**
 * Get the current session user. Returns null if not authenticated.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) return null;

    // Fetch fresh user data from DB to get custom fields
    const rows = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1);

    if (rows.length === 0) return null;

    const u = rows[0];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      systemRole: u.systemRole,
      approvalStatus: u.approvalStatus,
    };
  } catch {
    return null;
  }
}

/**
 * Require an authenticated session. Returns 401 if not.
 */
export async function requireSession(): Promise<
  AuthUser | NextResponse
> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 }
    );
  }
  return user;
}

/**
 * Require an approved user. Returns 401/403 as appropriate.
 */
export async function requireApproved(): Promise<
  AuthUser | NextResponse
> {
  const result = await requireSession();
  if (result instanceof NextResponse) return result;

  if (result.approvalStatus !== "approved") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Account not yet approved." } },
      { status: 403 }
    );
  }
  return result;
}

/**
 * Require system_admin role. Returns 403 if not.
 */
export async function requireSystemAdmin(): Promise<
  AuthUser | NextResponse
> {
  const result = await requireApproved();
  if (result instanceof NextResponse) return result;

  if (result.systemRole !== "system_admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "System admin access required." } },
      { status: 403 }
    );
  }
  return result;
}

/**
 * Get the user's active team membership. Returns null if none.
 */
export async function getTeamContext(
  userId: string
): Promise<TeamContext | null> {
  const rows = await db
    .select({
      teamId: teamMembership.teamId,
      role: teamMembership.role,
      teamName: teamTable.name,
      teamSlug: teamTable.slug,
    })
    .from(teamMembership)
    .innerJoin(teamTable, eq(teamMembership.teamId, teamTable.id))
    .where(
      and(
        eq(teamMembership.userId, userId),
        eq(teamMembership.active, true)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  return {
    teamId: rows[0].teamId,
    teamName: rows[0].teamName,
    teamSlug: rows[0].teamSlug,
    role: rows[0].role,
  };
}

/**
 * Require an approved user with active team membership.
 * Returns the user + team context, or an error response.
 */
export async function requireTeamMember(): Promise<
  { user: AuthUser; team: TeamContext } | NextResponse
> {
  const userResult = await requireApproved();
  if (userResult instanceof NextResponse) return userResult;

  const teamCtx = await getTeamContext(userResult.id);
  if (!teamCtx) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Team membership required." } },
      { status: 403 }
    );
  }

  return { user: userResult, team: teamCtx };
}

/**
 * Require an approved user with active team membership, OR system_admin role.
 * System admins can access team-scoped resources without team membership.
 */
export async function requireTeamMemberOrSystemAdmin(): Promise<
  { user: AuthUser; team: TeamContext | null } | NextResponse
> {
  const userResult = await requireApproved();
  if (userResult instanceof NextResponse) return userResult;

  // System admins bypass team membership requirement
  if (userResult.systemRole === "system_admin") {
    const teamCtx = await getTeamContext(userResult.id);
    return { user: userResult, team: teamCtx };
  }

  const teamCtx = await getTeamContext(userResult.id);
  if (!teamCtx) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Team membership required." } },
      { status: 403 }
    );
  }
  return { user: userResult, team: teamCtx };
}

/**
 * Require team_admin role for a specific team.
 */
export async function requireTeamAdmin(
  teamId: string
): Promise<AuthUser | NextResponse> {
  const result = await requireApproved();
  if (result instanceof NextResponse) return result;

  // System admins can manage any team
  if (result.systemRole === "system_admin") return result;

  const rows = await db
    .select()
    .from(teamMembership)
    .where(
      and(
        eq(teamMembership.userId, result.id),
        eq(teamMembership.teamId, teamId),
        eq(teamMembership.active, true),
        eq(teamMembership.role, "team_admin")
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Team admin access required." } },
      { status: 403 }
    );
  }

  return result;
}
