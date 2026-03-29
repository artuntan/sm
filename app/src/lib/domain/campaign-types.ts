/**
 * Campaign Entity — Domain Types
 *
 * The campaign is the structural connection between creator evaluation
 * (Workspace) and content delivery (Coverage). It answers:
 *
 *   "For this campaign, which creators did we evaluate,
 *    which brand is the content for, and did it reach all platforms?"
 *
 * Lifecycle:
 *   draft → active → monitoring → completed → archived
 *
 *   draft:      campaign created, creators being evaluated
 *   active:     creators confirmed, content expected
 *   monitoring: content detected, tracking distribution
 *   completed:  campaign period ended, results available
 *   archived:   soft-archived, excluded from active views
 */

// ---------------------------------------------------------------------------
// Campaign status
// ---------------------------------------------------------------------------

export type CampaignStatus =
  | "draft"
  | "active"
  | "monitoring"
  | "completed"
  | "archived";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  monitoring: "Monitoring",
  completed: "Completed",
  archived: "Archived",
};

export const CAMPAIGN_STATUS_ORDER: CampaignStatus[] = [
  "draft",
  "active",
  "monitoring",
  "completed",
  "archived",
];

/** Valid status transitions */
export const CAMPAIGN_STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["active", "archived"],
  active: ["monitoring", "completed", "archived"],
  monitoring: ["completed", "archived"],
  completed: ["archived"],
  archived: ["draft"], // re-open
};

export function canTransitionTo(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Campaign entity
// ---------------------------------------------------------------------------

export type Campaign = {
  id: string;
  teamId: string;
  name: string;
  status: CampaignStatus;
  /** Coverage brand ID (e.g. "brand_dimes_tr") — links to dimes accounts */
  brandId: string | null;
  /** Start of campaign period (ISO) */
  startDate: string | null;
  /** End of campaign period (ISO) */
  endDate: string | null;
  /** Free-text notes */
  notes: string | null;
  /** Total campaign budget amount */
  budgetAmount: number | null;
  /** Budget currency (TRY, USD, EUR) */
  budgetCurrency: string | null;
  /** JSON array of string tags */
  tags: string[];
  /** Custom match keywords/hashtags for deliverable detection */
  matchKeywords: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

// ---------------------------------------------------------------------------
// Campaign → Creator link
// ---------------------------------------------------------------------------

export type CampaignCreatorRole = "primary" | "secondary" | "shortlisted";

export type CampaignCreator = {
  id: string;
  campaignId: string;
  /** Instagram handle (optional) */
  instagramHandle: string | null;
  /** TikTok handle (optional) */
  tiktokHandle: string | null;
  /** Display label for the creator row */
  label: string | null;
  /** Role within the campaign */
  role: CampaignCreatorRole;
  /** Link to the analysis_run that evaluated this creator */
  analysisRunId: string | null;
  /** Creator-level budget amount (optional) */
  budgetAmount: number | null;
  /** Creator-level budget currency */
  budgetCurrency: string | null;
  /** Free-text notes about this creator in this campaign */
  notes: string | null;
  addedAt: string;
};

// ---------------------------------------------------------------------------
// Campaign → Deliverable (detected or manual post)
// ---------------------------------------------------------------------------

export type CampaignDeliverable = {
  id: string;
  campaignId: string;
  creatorId: string;
  platform: "instagram" | "tiktok";
  postId: string;
  permalink: string;
  caption: string | null;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  publishedAt: string | null;
  contentKind: string | null;
  matchType: "auto" | "manual";
  matchReason: string | null;
  detectedAt: string;
};

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export type CreateCampaignInput = {
  name: string;
  brandId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  tags?: string[];
};

export type UpdateCampaignInput = {
  name?: string;
  status?: CampaignStatus;
  brandId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  tags?: string[];
  matchKeywords?: string[];
};

export type AddCreatorInput = {
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
  label?: string | null;
  role?: CampaignCreatorRole;
  analysisRunId?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  notes?: string | null;
};

export type CampaignWithCreators = Campaign & {
  creators: CampaignCreator[];
  deliverables?: CampaignDeliverable[];
};

// ---------------------------------------------------------------------------
// Coverage integration types
// ---------------------------------------------------------------------------

/**
 * Campaign coverage summary — computed by joining campaign creators
 * against coverage posts for the campaign's brand.
 */
export type CampaignCoverageSummary = {
  campaignId: string;
  brandId: string;
  /** Total content clusters linked to campaign creators */
  totalClusters: number;
  /** Clusters fully covered (all destinations present) */
  coveredClusters: number;
  /** Clusters with gaps (missing on ≥1 destination) */
  gapClusters: number;
  /** Coverage rate (covered / total) */
  coverageRate: number;
  /** Platform-level breakdown */
  platformBreakdown: {
    platform: string;
    present: number;
    missing: number;
    unknown: number;
  }[];
};
