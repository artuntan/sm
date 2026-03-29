/**
 * POST   /api/campaigns/[id]/creators — Add creators to campaign
 * DELETE /api/campaigns/[id]/creators — Remove creator from campaign
 *
 * This is the bridge between Workspace creator evaluation
 * and campaign planning. Creators can be added from batch results
 * or manually entered.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { campaign, campaignCreator } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// POST — Add creator(s) to campaign
// ---------------------------------------------------------------------------

const AddCreatorsSchema = z.object({
  creators: z
    .array(
      z.object({
        instagramHandle: z.string().nullable().optional(),
        tiktokHandle: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
        role: z
          .enum(["primary", "secondary", "shortlisted"])
          .optional()
          .default("primary"),
        analysisRunId: z.string().nullable().optional(),
        budgetAmount: z.number().nullable().optional(),
        budgetCurrency: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .min(1, "At least one creator is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = AddCreatorsSchema.safeParse(body);
  if (!parseResult.success) {
    const message = parseResult.error.issues.map((i) => i.message).join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    // Verify campaign exists and belongs to team
    const whereClause = team
      ? and(eq(campaign.id, id), eq(campaign.teamId, team.teamId))
      : eq(campaign.id, id);

    const existing = await db
      .select()
      .from(campaign)
      .where(whereClause)
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const addedCreators = [];

    for (const creator of parseResult.data.creators) {
      // Require at least one handle
      if (!creator.instagramHandle && !creator.tiktokHandle) {
        continue;
      }

      const creatorId = `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await db.insert(campaignCreator).values({
        id: creatorId,
        campaignId: id,
        instagramHandle: creator.instagramHandle ?? null,
        tiktokHandle: creator.tiktokHandle ?? null,
        label:
          creator.label ??
          creator.instagramHandle ??
          creator.tiktokHandle ??
          null,
        role: creator.role ?? "primary",
        analysisRunId: creator.analysisRunId ?? null,
        budgetAmount: creator.budgetAmount ?? null,
        budgetCurrency: creator.budgetCurrency ?? null,
        notes: creator.notes ?? null,
        addedAt: now,
      });

      addedCreators.push(creatorId);
    }

    // Return updated creator list
    const allCreators = await db
      .select()
      .from(campaignCreator)
      .where(eq(campaignCreator.campaignId, id));

    return NextResponse.json(
      { added: addedCreators.length, creators: allCreators },
      { status: 201 }
    );
  } catch (err) {
    console.error(`[POST /api/campaigns/${id}/creators] Error:`, err);
    return NextResponse.json(
      { error: "Failed to add creators" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Remove creator from campaign
// ---------------------------------------------------------------------------

const RemoveCreatorSchema = z.object({
  creatorId: z.string().min(1, "Creator ID is required"),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = RemoveCreatorSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Creator ID is required" },
      { status: 400 }
    );
  }

  try {
    // Verify campaign exists and belongs to team
    const whereClause = team
      ? and(eq(campaign.id, id), eq(campaign.teamId, team.teamId))
      : eq(campaign.id, id);

    const existing = await db
      .select()
      .from(campaign)
      .where(whereClause)
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Delete the creator link
    await db
      .delete(campaignCreator)
      .where(
        and(
          eq(campaignCreator.id, parseResult.data.creatorId),
          eq(campaignCreator.campaignId, id)
        )
      );

    // Return updated creator list
    const allCreators = await db
      .select()
      .from(campaignCreator)
      .where(eq(campaignCreator.campaignId, id));

    return NextResponse.json({ creators: allCreators });
  } catch (err) {
    console.error(`[DELETE /api/campaigns/${id}/creators] Error:`, err);
    return NextResponse.json(
      { error: "Failed to remove creator" },
      { status: 500 }
    );
  }
}
