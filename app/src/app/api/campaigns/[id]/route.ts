/**
 * GET   /api/campaigns/[id] — Get campaign detail with creators
 * PATCH /api/campaigns/[id] — Update campaign fields
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { campaign, campaignCreator, campaignDeliverable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { canTransitionTo } from "@/lib/domain/campaign-types";
import type { CampaignStatus } from "@/lib/domain/campaign-types";

// ---------------------------------------------------------------------------
// GET — Campaign detail with linked creators
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const { id } = await params;

  try {
    const whereClause = team
      ? and(eq(campaign.id, id), eq(campaign.teamId, team.teamId))
      : eq(campaign.id, id);

    const campaigns = await db
      .select()
      .from(campaign)
      .where(whereClause)
      .limit(1);

    if (campaigns.length === 0) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const camp = campaigns[0];

    // Fetch linked creators
    const creators = await db
      .select()
      .from(campaignCreator)
      .where(eq(campaignCreator.campaignId, id));

    // Fetch deliverables
    const deliverables = await db
      .select()
      .from(campaignDeliverable)
      .where(eq(campaignDeliverable.campaignId, id));

    return NextResponse.json({
      ...camp,
      tags: JSON.parse((camp.tags as string) ?? "[]"),
      matchKeywords: JSON.parse((camp.matchKeywords as string) ?? "[]"),
      creators,
      deliverables,
    });
  } catch (err) {
    console.error(`[GET /api/campaigns/${id}] Error:`, err);
    return NextResponse.json(
      { error: "Failed to get campaign" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — Update campaign fields
// ---------------------------------------------------------------------------

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z
    .enum(["draft", "active", "monitoring", "completed", "archived"])
    .optional(),
  brandId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  budgetAmount: z.number().nullable().optional(),
  budgetCurrency: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  matchKeywords: z.array(z.string()).optional(),
  meta: z.string().optional(),
});

export async function PATCH(
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

  const parseResult = UpdateCampaignSchema.safeParse(body);
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

    const currentCampaign = existing[0];
    const updates = parseResult.data;

    // Validate status transition
    if (
      updates.status &&
      updates.status !== currentCampaign.status
    ) {
      if (
        !canTransitionTo(
          currentCampaign.status as CampaignStatus,
          updates.status as CampaignStatus
        )
      ) {
        return NextResponse.json(
          {
            error: `Cannot transition from "${currentCampaign.status}" to "${updates.status}"`,
          },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateValues.name = updates.name;
    if (updates.status !== undefined) updateValues.status = updates.status;
    if (updates.brandId !== undefined) updateValues.brandId = updates.brandId;
    if (updates.startDate !== undefined) updateValues.startDate = updates.startDate;
    if (updates.endDate !== undefined) updateValues.endDate = updates.endDate;
    if (updates.notes !== undefined) updateValues.notes = updates.notes;
    if (updates.budgetAmount !== undefined) updateValues.budgetAmount = updates.budgetAmount;
    if (updates.budgetCurrency !== undefined) updateValues.budgetCurrency = updates.budgetCurrency;
    if (updates.tags !== undefined) updateValues.tags = JSON.stringify(updates.tags);
    if (updates.matchKeywords !== undefined) updateValues.matchKeywords = JSON.stringify(updates.matchKeywords);
    if (updates.meta !== undefined) updateValues.meta = updates.meta;

    await db.update(campaign).set(updateValues).where(eq(campaign.id, id));

    // Return updated campaign
    const updated = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, id))
      .limit(1);

    const creators = await db
      .select()
      .from(campaignCreator)
      .where(eq(campaignCreator.campaignId, id));

    const deliverables = await db
      .select()
      .from(campaignDeliverable)
      .where(eq(campaignDeliverable.campaignId, id));

    return NextResponse.json({
      ...updated[0],
      tags: JSON.parse((updated[0]?.tags as string) ?? "[]"),
      matchKeywords: JSON.parse((updated[0]?.matchKeywords as string) ?? "[]"),
      creators,
      deliverables,
    });
  } catch (err) {
    console.error(`[PATCH /api/campaigns/${id}] Error:`, err);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}
