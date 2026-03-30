/**
 * POST /api/campaigns — Create a new campaign
 * GET  /api/campaigns — List campaigns for current team
 *
 * The campaign entity connects Workspace (creator evaluation)
 * to Coverage (content delivery tracking).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { campaign } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { canTransitionTo } from "@/lib/domain/campaign-types";
import type { CampaignStatus } from "@/lib/domain/campaign-types";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Team ID helper
// ---------------------------------------------------------------------------

async function getTeamId(userId: string): Promise<string | null> {
  const { teamMembership } = await import("@/lib/db/schema");
  const membership = await db
    .select({ teamId: teamMembership.teamId })
    .from(teamMembership)
    .where(
      and(
        eq(teamMembership.userId, userId),
        eq(teamMembership.active, true)
      )
    )
    .limit(1);
  return membership[0]?.teamId ?? null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CreateCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(200),
  brandId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  budgetAmount: z.number().nullable().optional(),
  budgetCurrency: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// POST — Create campaign
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;
  const { user, team } = result;

  const teamId = team?.teamId || (await getTeamId(user.id));
  if (!teamId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "No team membership found" } },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = CreateCampaignSchema.safeParse(body);
  if (!parseResult.success) {
    const message = parseResult.error.issues.map((i) => i.message).join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name, brandId, startDate, endDate, notes, budgetAmount, budgetCurrency, tags } =
    parseResult.data;

  const now = new Date().toISOString();
  const id = `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await db.insert(campaign).values({
      id,
      teamId,
      name,
      status: "draft",
      brandId: brandId ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      notes: notes ?? null,
      budgetAmount: budgetAmount ?? null,
      budgetCurrency: budgetCurrency ?? null,
      tags: tags ?? [],
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
    });

    const created = await db
      .select()
      .from(campaign)
      .where(eq(campaign.id, id))
      .limit(1);

    return NextResponse.json(
      {
        ...created[0],
        tags: created[0]?.tags ?? [],
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/campaigns] Error:", err);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET — List campaigns for team
// ---------------------------------------------------------------------------

const ListCampaignsSchema = z.object({
  status: z
    .enum(["draft", "active", "monitoring", "completed", "archived"])
    .optional(),
  brandId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;
  const { user, team } = result;

  const teamId = team?.teamId || (await getTeamId(user.id));
  if (!teamId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "No team membership found" } },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const params = ListCampaignsSchema.safeParse({
    status: url.searchParams.get("status") || undefined,
    brandId: url.searchParams.get("brandId") || undefined,
  });

  const filters = params.success ? params.data : {};

  try {
    const conditions = [eq(campaign.teamId, teamId)];

    if (filters.status) {
      conditions.push(eq(campaign.status, filters.status));
    }
    if (filters.brandId) {
      conditions.push(eq(campaign.brandId, filters.brandId));
    }

    const rows = await db
      .select()
      .from(campaign)
      .where(and(...conditions))
      .orderBy(desc(campaign.createdAt));

    const result = rows.map((row) => ({
      ...row,
      tags: row.tags ?? [],
    }));

    return NextResponse.json({ campaigns: result });
  } catch (err) {
    console.error("[GET /api/campaigns] Error:", err);
    return NextResponse.json(
      { error: "Failed to list campaigns" },
      { status: 500 }
    );
  }
}
