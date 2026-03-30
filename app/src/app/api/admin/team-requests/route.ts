/**
 * Team Admin — Join Request Approval API
 *
 * GET  — list pending join requests for a team (?teamId=...)
 * POST — approve or reject a join request
 *
 * Requires team_admin role for the specified team.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teamJoinRequest, teamMembership, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "teamId required." } },
      { status: 400 }
    );
  }

  const admin = await requireTeamAdmin(teamId);
  if (admin instanceof NextResponse) return admin;

  const requests = await db
    .select({
      id: teamJoinRequest.id,
      userId: teamJoinRequest.userId,
      teamId: teamJoinRequest.teamId,
      status: teamJoinRequest.status,
      createdAt: teamJoinRequest.createdAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(teamJoinRequest)
    .innerJoin(user, eq(teamJoinRequest.userId, user.id))
    .where(
      and(
        eq(teamJoinRequest.teamId, teamId),
        eq(teamJoinRequest.status, "pending")
      )
    );

  return NextResponse.json({ requests });
}

const ReviewRequestSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid JSON" } },
      { status: 400 }
    );
  }

  const parsed = ReviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      { status: 422 }
    );
  }
  const { requestId, action, reason } = parsed.data;

  // Find the request
  const rows = await db
    .select()
    .from(teamJoinRequest)
    .where(eq(teamJoinRequest.id, requestId))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Join request not found." } },
      { status: 404 }
    );
  }

  const joinReq = rows[0];

  // Auth check: must be team admin for this team
  const admin = await requireTeamAdmin(joinReq.teamId);
  if (admin instanceof NextResponse) return admin;

  if (action === "approve") {
    await db.transaction(async (tx) => {
      // Update request
      await tx
        .update(teamJoinRequest)
        .set({
          status: "approved",
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        })
        .where(eq(teamJoinRequest.id, requestId));

      // Create membership
      await tx.insert(teamMembership).values({
        id: crypto.randomUUID(),
        userId: joinReq.userId,
        teamId: joinReq.teamId,
        role: "member",
        active: true,
        joinedAt: new Date(),
      });
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

  return NextResponse.json({ success: true, requestId, status: action === "approve" ? "approved" : "rejected" });
}
