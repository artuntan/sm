/**
 * Teams API
 *
 * GET  — list available teams
 * POST — submit a join request
 *
 * Requires approved user.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { team, teamJoinRequest } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export async function GET() {
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  const teams = await db
    .select({
      id: team.id,
      slug: team.slug,
      name: team.name,
    })
    .from(team)
    .where(eq(team.active, true));

  return NextResponse.json({ teams });
}

export async function POST(request: NextRequest) {
  const user = await requireApproved();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { teamId } = body as { teamId: string };

  if (!teamId) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "teamId required." } },
      { status: 400 }
    );
  }

  // Check for existing pending request
  const existing = await db
    .select()
    .from(teamJoinRequest)
    .where(
      and(
        eq(teamJoinRequest.userId, user.id),
        eq(teamJoinRequest.teamId, teamId),
        eq(teamJoinRequest.status, "pending")
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: { code: "DUPLICATE", message: "Join request already pending." } },
      { status: 409 }
    );
  }

  const requestId = crypto.randomUUID();
  await db.insert(teamJoinRequest).values({
    id: requestId,
    userId: user.id,
    teamId,
    status: "pending",
    createdAt: new Date(),
  });

  return NextResponse.json({ success: true, requestId });
}
