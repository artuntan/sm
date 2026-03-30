/**
 * System Admin — Teams Management API
 *
 * GET  — list all teams with member counts and admin info
 * POST — create a new team
 *
 * Requires system_admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { team, teamMembership, user } from "@/lib/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  // Parse pagination
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  // Get teams with member counts (paginated)
  const teams = await db
    .select({
      id: team.id,
      slug: team.slug,
      name: team.name,
      active: team.active,
      createdAt: team.createdAt,
    })
    .from(team)
    .limit(limit)
    .offset(offset);

  // For each team, get member count and admins
  const teamsWithDetails = await Promise.all(
    teams.map(async (t) => {
      const memberRows = await db
        .select({
          count: count(),
        })
        .from(teamMembership)
        .where(
          and(
            eq(teamMembership.teamId, t.id),
            eq(teamMembership.active, true)
          )
        );

      const adminRows = await db
        .select({
          userId: teamMembership.userId,
          userName: user.name,
          userEmail: user.email,
        })
        .from(teamMembership)
        .innerJoin(user, eq(teamMembership.userId, user.id))
        .where(
          and(
            eq(teamMembership.teamId, t.id),
            eq(teamMembership.active, true),
            eq(teamMembership.role, "team_admin")
          )
        );

      return {
        ...t,
        memberCount: memberRows[0]?.count ?? 0,
        admins: adminRows.map((a) => ({
          id: a.userId,
          name: a.userName,
          email: a.userEmail,
        })),
      };
    })
  );

  return NextResponse.json({ teams: teamsWithDetails });
}

export async function POST(request: NextRequest) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await request.json();
  const { name, slug, initialAdminId } = body as {
    name: string;
    slug: string;
    initialAdminId?: string;
  };

  if (!name || !slug) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "name and slug required." } },
      { status: 400 }
    );
  }

  // Check for duplicate slug
  const existing = await db
    .select()
    .from(team)
    .where(eq(team.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: { code: "DUPLICATE", message: "A team with this slug already exists." } },
      { status: 409 }
    );
  }

  const teamId = `team_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  await db.insert(team).values({
    id: teamId,
    slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    name,
    active: true,
    createdAt: new Date(),
  });

  // Optionally assign initial admin
  if (initialAdminId) {
    await db.insert(teamMembership).values({
      id: `mbr_${initialAdminId}_${teamId}`,
      userId: initialAdminId,
      teamId,
      role: "team_admin",
      active: true,
      joinedAt: new Date(),
    });
  }

  return NextResponse.json({ success: true, teamId });
}
