/**
 * System Admin — Team Join Requests API (cross-team)
 *
 * GET  — list join requests for a specific team (all statuses)
 * POST — approve or reject a join request
 *
 * Requires system_admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teamJoinRequest, teamMembership, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const { teamId } = await context.params;
  const status = request.nextUrl.searchParams.get("status") || "pending";

  let requests;
  if (status === "all") {
    requests = await db
      .select({
        id: teamJoinRequest.id,
        userId: teamJoinRequest.userId,
        teamId: teamJoinRequest.teamId,
        status: teamJoinRequest.status,
        createdAt: teamJoinRequest.createdAt,
        reviewedBy: teamJoinRequest.reviewedBy,
        reviewedAt: teamJoinRequest.reviewedAt,
        rejectionReason: teamJoinRequest.rejectionReason,
        userName: user.name,
        userEmail: user.email,
      })
      .from(teamJoinRequest)
      .innerJoin(user, eq(teamJoinRequest.userId, user.id))
      .where(eq(teamJoinRequest.teamId, teamId));
  } else {
    requests = await db
      .select({
        id: teamJoinRequest.id,
        userId: teamJoinRequest.userId,
        teamId: teamJoinRequest.teamId,
        status: teamJoinRequest.status,
        createdAt: teamJoinRequest.createdAt,
        reviewedBy: teamJoinRequest.reviewedBy,
        reviewedAt: teamJoinRequest.reviewedAt,
        rejectionReason: teamJoinRequest.rejectionReason,
        userName: user.name,
        userEmail: user.email,
      })
      .from(teamJoinRequest)
      .innerJoin(user, eq(teamJoinRequest.userId, user.id))
      .where(
        and(
          eq(teamJoinRequest.teamId, teamId),
          eq(teamJoinRequest.status, status as "pending" | "approved" | "rejected")
        )
      );
  }

  return NextResponse.json({ requests });
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const admin = await requireSystemAdmin();
  if (admin instanceof NextResponse) return admin;

  const { teamId } = await context.params;
  const body = await request.json();
  const { requestId, action, reason } = body as {
    requestId: string;
    action: "approve" | "reject";
    reason?: string;
  };

  if (!requestId || !action) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "requestId and action required." } },
      { status: 400 }
    );
  }

  // Find the request
  const rows = await db
    .select()
    .from(teamJoinRequest)
    .where(
      and(
        eq(teamJoinRequest.id, requestId),
        eq(teamJoinRequest.teamId, teamId)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Join request not found." } },
      { status: 404 }
    );
  }

  const joinReq = rows[0];

  if (action === "approve") {
    await db
      .update(teamJoinRequest)
      .set({
        status: "approved",
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      })
      .where(eq(teamJoinRequest.id, requestId));

    // Create membership
    await db.insert(teamMembership).values({
      id: crypto.randomUUID(),
      userId: joinReq.userId,
      teamId: joinReq.teamId,
      role: "member",
      active: true,
      joinedAt: new Date(),
    });
  } else {
    await db
      .update(teamJoinRequest)
      .set({
        status: "rejected",
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        rejectionReason: reason || null,
      })
      .where(eq(teamJoinRequest.id, requestId));
  }

  return NextResponse.json({
    success: true,
    requestId,
    status: action === "approve" ? "approved" : "rejected",
  });
}
