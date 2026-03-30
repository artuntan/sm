"use client";

/**
 * Campaigns Page — Campaign Planning & Tracking Surface
 *
 * The structural connection between creator evaluation (Workspace)
 * and content delivery (Coverage). Operators can:
 *
 * - Create campaigns linked to brands
 * - Add creators from Workspace results
 * - Track campaign lifecycle (draft → active → monitoring → completed)
 * - See campaign-level overview with creator count and status
 *
 * Design language: matches the product's dark, engineered, premium aesthetic.
 */

import { useState, useEffect, useCallback } from "react";
import type {
  Campaign,
  CampaignStatus,
  CampaignWithCreators,
  CampaignCreator,
  CampaignDeliverable,
} from "@/lib/domain/campaign-types";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_ORDER,
} from "@/lib/domain/campaign-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = "all" | CampaignStatus;

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<
  CampaignStatus,
  { color: string; bg: string; dot: string }
> = {
  draft: {
    color: "var(--text-muted)",
    bg: "rgba(128,128,128,0.08)",
    dot: "var(--text-muted)",
  },
  active: {
    color: "var(--accent-green)",
    bg: "var(--accent-green-glow)",
    dot: "var(--accent-green)",
  },
  monitoring: {
    color: "var(--accent-blue)",
    bg: "rgba(56,189,248,0.08)",
    dot: "var(--accent-blue)",
  },
  completed: {
    color: "#d97706",
    bg: "rgba(217,119,6,0.08)",
    dot: "#d97706",
  },
  archived: {
    color: "var(--text-muted)",
    bg: "rgba(128,128,128,0.05)",
    dot: "var(--border-subtle)",
  },
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module-level cache — instant render on revisit
// ---------------------------------------------------------------------------
let _campaignsCache: Campaign[] | null = null;

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(_campaignsCache ?? []);
  const [loading, setLoading] = useState(_campaignsCache === null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  // Create campaign modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBrandId, setCreateBrandId] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Campaign detail state
  const [selectedCampaign, setSelectedCampaign] =
    useState<CampaignWithCreators | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Load campaigns ────────────────────────────────────────────────────────

  const loadCampaigns = useCallback(async () => {
    try {
      if (!_campaignsCache) setLoading(true);
      setError(null);
      const url =
        viewMode === "all"
          ? "/api/campaigns"
          : `/api/campaigns?status=${viewMode}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load campaigns");
      }
      const data = await res.json();
      const list = data.campaigns || [];
      _campaignsCache = list;
      setCampaigns(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // ── Create campaign ───────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          brandId: createBrandId || null,
          notes: createNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create campaign");
      }
      setShowCreate(false);
      setCreateName("");
      setCreateBrandId("");
      setCreateNotes("");
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }, [createName, createBrandId, createNotes, loadCampaigns]);

  // ── Load campaign detail ──────────────────────────────────────────────────

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) throw new Error("Failed to load campaign");
      const data = await res.json();
      setSelectedCampaign(data);
    } catch {
      setSelectedCampaign(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Update campaign status ────────────────────────────────────────────────

  const updateStatus = useCallback(
    async (id: string, status: CampaignStatus) => {
      try {
        const res = await fetch(`/api/campaigns/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update status");
        }
        await loadCampaigns();
        if (selectedCampaign?.id === id) {
          await loadDetail(id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
      }
    },
    [loadCampaigns, loadDetail, selectedCampaign]
  );

  // ── Computed ──────────────────────────────────────────────────────────────

  const statusCounts = campaigns.reduce(
    (acc, c) => {
      acc[c.status as CampaignStatus] =
        (acc[c.status as CampaignStatus] || 0) + 1;
      return acc;
    },
    {} as Record<CampaignStatus, number>
  );

  // ── Brand labels ──────────────────────────────────────────────────────────

  const BRAND_OPTIONS: { id: string; label: string }[] = [
    { id: "brand_dimes_tr", label: "Dimes TR" },
    { id: "brand_dimes_club", label: "Dimes Club" },
    { id: "brand_obsesso", label: "Obsesso" },
  ];

  function brandLabel(brandId: string | null): string {
    if (!brandId) return "—";
    return (
      BRAND_OPTIONS.find((b) => b.id === brandId)?.label || brandId
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Page Header ── */}
      <div
        className="flex items-center justify-between mb-4"
        style={{ minHeight: "32px" }}
      >
        <div>
          <h1
            className="text-[13px] font-semibold tracking-wider"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Campaigns
          </h1>
          <p
            className="text-[11px]"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", margin: "4px 0 0 0" }}
          >
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded-md text-[10px] font-medium tracking-wider transition-all"
          style={{
            backgroundColor: "var(--accent-green)",
            color: "var(--text-inverse)",
            fontFamily: "var(--font-mono)",
            border: "none",
            cursor: "pointer",
          }}
        >
          + NEW CAMPAIGN
        </button>
      </div>

      {/* ── Status Filter Strip ── */}
      <div
        className="flex items-center gap-1 mb-4 pb-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <button
          onClick={() => setViewMode("all")}
          className="px-2 py-1 rounded text-[10px] font-medium tracking-wider transition-all"
          style={{
            backgroundColor:
              viewMode === "all"
                ? "var(--bg-elevated)"
                : "transparent",
            color:
              viewMode === "all"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            border:
              viewMode === "all"
                ? "1px solid var(--border-default)"
                : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          ALL ({campaigns.length})
        </button>
        {CAMPAIGN_STATUS_ORDER.filter((s) => s !== "archived").map(
          (status) => {
            const count = statusCounts[status] || 0;
            const style = STATUS_STYLES[status];
            const isActive = viewMode === status;
            return (
              <button
                key={status}
                onClick={() => setViewMode(status)}
                className="px-2 py-1 rounded text-[10px] font-medium tracking-wider transition-all"
                style={{
                  backgroundColor: isActive
                    ? style.bg
                    : "transparent",
                  color: isActive
                    ? style.color
                    : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  border: isActive
                    ? `1px solid ${style.color}33`
                    : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                {CAMPAIGN_STATUS_LABELS[status].toUpperCase()} (
                {count})
              </button>
            );
          }
        )}
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div
          className="rounded-md border px-4 py-3 mb-4 text-xs"
          style={{
            backgroundColor: "rgba(239,68,68,0.08)",
            borderColor: "rgba(239,68,68,0.2)",
            color: "var(--accent-pink)",
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 opacity-60 hover:opacity-100"
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div
          className="text-center py-12 text-xs"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          Loading campaigns…
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && campaigns.length === 0 && (
        <div
          className="rounded-md border p-8 text-center"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-default)",
          }}
        >
          <div
            className="w-10 h-10 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              style={{ color: "var(--text-muted)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <p
            className="text-xs font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            No campaigns yet
          </p>
          <p
            className="text-[10px] mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Create your first campaign to connect creator evaluations
            with content delivery tracking.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 rounded-md text-[10px] font-medium tracking-wider"
            style={{
              backgroundColor: "var(--accent-green)",
              color: "var(--text-inverse)",
              fontFamily: "var(--font-mono)",
              border: "none",
              cursor: "pointer",
            }}
          >
            + CREATE CAMPAIGN
          </button>
        </div>
      )}

      {/* ── Campaign List ── */}
      {!loading && campaigns.length > 0 && (
        <div className="space-y-2">
          {campaigns.map((camp) => {
            const style =
              STATUS_STYLES[camp.status as CampaignStatus] ||
              STATUS_STYLES.draft;
            const isSelected = selectedCampaign?.id === camp.id;

            return (
              <div
                key={camp.id}
                onClick={() => loadDetail(camp.id)}
                className="rounded-md border p-4 transition-all"
                style={{
                  backgroundColor: isSelected
                    ? "var(--bg-elevated)"
                    : "var(--bg-card)",
                  borderColor: isSelected
                    ? "var(--border-default)"
                    : "var(--border-subtle)",
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: style.dot }}
                    />
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {camp.name}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-medium tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: style.bg,
                      color: style.color,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {CAMPAIGN_STATUS_LABELS[
                      camp.status as CampaignStatus
                    ]?.toUpperCase() || camp.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {camp.brandId && (
                    <span
                      className="text-[10px]"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {brandLabel(camp.brandId)}
                    </span>
                  )}
                  {camp.startDate && (
                    <span
                      className="text-[10px]"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {new Date(camp.startDate).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" }
                      )}
                      {camp.endDate &&
                        ` → ${new Date(
                          camp.endDate
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}`}
                    </span>
                  )}
                  {camp.budgetAmount != null && (
                    <span
                      className="text-[10px]"
                      style={{
                        color: "var(--accent-green)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {camp.budgetCurrency === "TRY"
                        ? "₺"
                        : camp.budgetCurrency === "EUR"
                        ? "€"
                        : "$"}
                      {camp.budgetAmount.toLocaleString()}
                    </span>
                  )}
                  <span
                    className="text-[10px] ml-auto"
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      opacity: 0.5,
                    }}
                  >
                    {new Date(camp.createdAt).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" }
                    )}
                  </span>
                </div>

                {camp.notes && (
                  <p
                    className="text-[10px] mt-2 truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {camp.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Campaign Detail Panel ── */}
      {selectedCampaign && (
        <CampaignDetailPanel
          campaign={selectedCampaign}
          loading={detailLoading}
          onUpdateStatus={updateStatus}
          brandLabel={brandLabel}
          onClose={() => setSelectedCampaign(null)}
        />
      )}

      {/* ── Create Campaign Modal ── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="rounded-lg border p-5 w-full max-w-md"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-default)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span
                className="text-xs font-medium tracking-wider"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                NEW CAMPAIGN
              </span>
              <button
                onClick={() => setShowCreate(false)}
                className="text-xs opacity-50 hover:opacity-100 transition-opacity"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Campaign Name */}
              <div>
                <label
                  className="text-[10px] tracking-wider block mb-1"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  CAMPAIGN NAME
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Q2 Recipe Content Push"
                  className="w-full rounded-md border px-2.5 py-2 text-xs bg-transparent"
                  style={{
                    borderColor: "var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                  autoFocus
                />
              </div>

              {/* Brand */}
              <div>
                <label
                  className="text-[10px] tracking-wider block mb-1"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  BRAND
                </label>
                <select
                  value={createBrandId}
                  onChange={(e) => setCreateBrandId(e.target.value)}
                  className="w-full rounded-md border px-2.5 py-2 text-xs"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">No brand linked</option>
                  {BRAND_OPTIONS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label
                  className="text-[10px] tracking-wider block mb-1"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  NOTES
                </label>
                <textarea
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="Optional campaign notes..."
                  rows={2}
                  className="w-full rounded-md border px-2.5 py-2 text-xs bg-transparent resize-none"
                  style={{
                    borderColor: "var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 rounded-md text-[10px] font-medium tracking-wider"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  border: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleCreate}
                disabled={!createName.trim() || creating}
                className="px-3 py-1.5 rounded-md text-[10px] font-medium tracking-wider"
                style={{
                  backgroundColor: createName.trim()
                    ? "var(--accent-green)"
                    : "var(--bg-elevated)",
                  color: createName.trim()
                    ? "var(--text-inverse)"
                    : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  border: "none",
                  cursor: createName.trim() ? "pointer" : "default",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? "CREATING…" : "CREATE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign Detail Panel
// ---------------------------------------------------------------------------

function CampaignDetailPanel({
  campaign,
  loading,
  onUpdateStatus,
  brandLabel,
  onClose,
}: {
  campaign: CampaignWithCreators;
  loading: boolean;
  onUpdateStatus: (id: string, status: CampaignStatus) => void;
  brandLabel: (id: string | null) => string;
  onClose: () => void;
}) {
  const style =
    STATUS_STYLES[campaign.status as CampaignStatus] || STATUS_STYLES.draft;
  const creators = campaign.creators || [];
  const deliverables = campaign.deliverables || [];
  const matchKeywords: string[] = campaign.matchKeywords || [];

  // Compute next valid transitions
  const currentStatus = campaign.status as CampaignStatus;
  const nextStatuses: CampaignStatus[] = [];
  const transitions: Record<CampaignStatus, CampaignStatus[]> = {
    draft: ["active", "archived"],
    active: ["monitoring", "completed", "archived"],
    monitoring: ["completed", "archived"],
    completed: ["archived"],
    archived: ["draft"],
  };
  if (transitions[currentStatus]) {
    nextStatuses.push(...transitions[currentStatus]);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="w-full max-w-[520px] rounded-lg border overflow-y-auto"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-subtle)",
            maxHeight: "90vh",
            pointerEvents: "auto",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-10 px-5 py-3 flex items-center justify-between"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: style.dot }}
              />
              <span
                className="text-xs font-medium tracking-wider"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                CAMPAIGN DETAIL
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

      {loading ? (
        <div
          className="py-12 text-center text-xs"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          Loading…
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Campaign info */}
          <div>
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              {campaign.name}
            </h2>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-medium tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: style.bg,
                  color: style.color,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {CAMPAIGN_STATUS_LABELS[
                  currentStatus
                ]?.toUpperCase()}
              </span>
              {campaign.brandId && (
                <span
                  className="text-[10px]"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {brandLabel(campaign.brandId)}
                </span>
              )}
            </div>
          </div>

          {/* Status transitions */}
          {nextStatuses.length > 0 && (
            <div
              className="rounded-md border p-3"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <p
                className="text-[10px] tracking-wider mb-2"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                TRANSITION TO
              </p>
              <div className="flex flex-wrap gap-1.5">
                {nextStatuses.map((ns) => {
                  const nsStyle = STATUS_STYLES[ns];
                  return (
                    <button
                      key={ns}
                      onClick={() =>
                        onUpdateStatus(campaign.id, ns)
                      }
                      className="px-2 py-1 rounded text-[10px] font-medium tracking-wider transition-all hover:opacity-80"
                      style={{
                        backgroundColor: nsStyle.bg,
                        color: nsStyle.color,
                        fontFamily: "var(--font-mono)",
                        border: `1px solid ${nsStyle.color}33`,
                        cursor: "pointer",
                      }}
                    >
                      {CAMPAIGN_STATUS_LABELS[ns].toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div
            className="rounded-md border p-3 space-y-2"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {campaign.budgetAmount != null && (
              <div className="flex justify-between">
                <span
                  className="text-[10px] tracking-wider"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  BUDGET
                </span>
                <span
                  className="text-xs font-medium"
                  style={{
                    color: "var(--accent-green)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {campaign.budgetCurrency === "TRY"
                    ? "₺"
                    : campaign.budgetCurrency === "EUR"
                    ? "€"
                    : "$"}
                  {campaign.budgetAmount.toLocaleString()}
                </span>
              </div>
            )}
            {campaign.startDate && (
              <div className="flex justify-between">
                <span
                  className="text-[10px] tracking-wider"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  PERIOD
                </span>
                <span
                  className="text-xs"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {new Date(
                    campaign.startDate
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {campaign.endDate &&
                    ` → ${new Date(
                      campaign.endDate
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}`}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span
                className="text-[10px] tracking-wider"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                CREATED
              </span>
              <span
                className="text-xs"
                style={{
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {new Date(campaign.createdAt).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" }
                )}
              </span>
            </div>
          </div>

          {/* Notes */}
          {campaign.notes && (
            <div
              className="rounded-md border p-3"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <p
                className="text-[10px] tracking-wider mb-1.5"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                NOTES
              </p>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {campaign.notes}
              </p>
            </div>
          )}

          {/* Match Settings */}
          {campaign.brandId && (
            <MatchSettingsPanel
              campaignId={campaign.id}
              keywords={matchKeywords}
              onUpdate={() => {
                fetch(`/api/campaigns/${campaign.id}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(() => window.location.reload())
                  .catch(() => {});
              }}
            />
          )}

          {/* Deliverable Tracking */}
          {campaign.brandId && creators.length > 0 && (
            <DeliverableTracker
              campaignId={campaign.id}
              creators={creators}
              deliverables={deliverables}
              onScanComplete={() => {
                fetch(`/api/campaigns/${campaign.id}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(() => window.location.reload())
                  .catch(() => {});
              }}
            />
          )}

          {/* Creators Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[10px] font-medium tracking-wider"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                CREATORS · {creators.length}
              </span>
            </div>

            {creators.length === 0 ? (
              <div
                className="rounded-md border p-4 text-center"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <p
                  className="text-[10px] mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  No creators linked yet
                </p>
                <p
                  className="text-[9px]"
                  style={{
                    color: "var(--text-muted)",
                    opacity: 0.6,
                  }}
                >
                  Add creators from Workspace results or manually
                </p>
              </div>
            ) : (
              <div
                className="rounded-md border overflow-hidden"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {creators.map(
                  (creator: CampaignCreator, i: number) => (
                    <div
                      key={creator.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                      style={{
                        borderBottom:
                          i < creators.length - 1
                            ? "1px solid var(--border-subtle)"
                            : "none",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs font-medium truncate"
                          style={{
                            color: "var(--text-primary)",
                          }}
                        >
                          {creator.label ||
                            creator.instagramHandle ||
                            creator.tiktokHandle ||
                            "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {creator.instagramHandle && (
                            <span
                              className="text-[9px]"
                              style={{
                                color: "var(--text-muted)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              IG: @{creator.instagramHandle}
                            </span>
                          )}
                          {creator.tiktokHandle && (
                            <span
                              className="text-[9px]"
                              style={{
                                color: "var(--text-muted)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              TT: @{creator.tiktokHandle}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                          border:
                            "1px solid var(--border-subtle)",
                        }}
                      >
                        {creator.role.toUpperCase()}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Tags */}
          {campaign.tags &&
            campaign.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {campaign.tags.map((tag: string, i: number) => (
                  <span
                    key={i}
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
        </div>
      )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Match Settings — campaign-level custom keywords for deliverable detection
// ---------------------------------------------------------------------------

function MatchSettingsPanel({
  campaignId,
  keywords,
  onUpdate,
}: {
  campaignId: string;
  keywords: string[];
  onUpdate: () => void;
}) {
  const [newKeyword, setNewKeyword] = useState("");
  const [saving, setSaving] = useState(false);

  const saveKeywords = useCallback(
    async (updated: string[]) => {
      setSaving(true);
      try {
        await fetch(`/api/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchKeywords: updated }),
        });
        onUpdate();
      } catch {
        /* silent */
      }
      setSaving(false);
    },
    [campaignId, onUpdate]
  );

  const handleAdd = useCallback(() => {
    const kw = newKeyword.trim();
    if (!kw) return;
    // Normalize: strip leading # or @ for dedup, keep original for display
    const normalized = kw.toLowerCase();
    if (keywords.some((k) => k.toLowerCase() === normalized)) {
      setNewKeyword("");
      return;
    }
    saveKeywords([...keywords, kw]);
    setNewKeyword("");
  }, [newKeyword, keywords, saveKeywords]);

  const handleRemove = useCallback(
    (index: number) => {
      const updated = keywords.filter((_, i) => i !== index);
      saveKeywords(updated);
    },
    [keywords, saveKeywords]
  );

  return (
    <div
      className="rounded-md border p-3"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-medium tracking-wider"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          MATCH SETTINGS
        </span>
        {saving && (
          <span
            className="text-[9px]"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            saving…
          </span>
        )}
      </div>

      <p
        className="text-[9px] mb-2"
        style={{ color: "var(--text-muted)", opacity: 0.6 }}
      >
        Custom hashtags, keywords, or handles to detect for this campaign.
        Added alongside default brand keywords.
      </p>

      {/* Keyword chips */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {keywords.map((kw, i) => (
            <span
              key={`${kw}-${i}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {kw}
              <button
                onClick={() => handleRemove(i)}
                className="ml-0.5 hover:opacity-60"
                style={{
                  color: "var(--accent-pink)",
                  cursor: "pointer",
                  fontSize: "10px",
                  lineHeight: 1,
                  background: "none",
                  border: "none",
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add input */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="#campaignTag, @handle, keyword"
          className="flex-1 rounded-md border px-2 py-1 text-[10px] bg-transparent"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        />
        <button
          onClick={handleAdd}
          className="px-2 py-1 rounded-md text-[9px] font-medium tracking-wider"
          style={{
            backgroundColor: "var(--bg-elevated)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            border: "1px solid var(--border-subtle)",
            cursor: "pointer",
          }}
        >
          ADD
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deliverable Tracker — scan creators and show matched posts
// ---------------------------------------------------------------------------

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  tiktok: "#00f2ea",
};

function DeliverableTracker({
  campaignId,
  creators,
  deliverables,
  onScanComplete,
}: {
  campaignId: string;
  creators: CampaignCreator[];
  deliverables: CampaignDeliverable[];
  onScanComplete: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState<string | null>(null); // creatorId
  const [manualUrl, setManualUrl] = useState("");
  const [manualPlatform, setManualPlatform] = useState<"instagram" | "tiktok">("instagram");
  const [addingStatus, setAddingStatus] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanStatus("Scanning creator accounts…");
    setScanError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/scan-creators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        const msg = `${data.totalPostsChecked} posts checked → ${data.newDeliverables} new deliverables found`;
        setScanStatus(msg);
        if (data.newDeliverables > 0) {
          setTimeout(() => onScanComplete(), 1500);
        }
      } else {
        setScanError(data.error || "Scan failed");
        setScanStatus(null);
      }
    } catch {
      setScanError("Network error");
      setScanStatus(null);
    }
    setScanning(false);
  }, [campaignId, onScanComplete]);

  const handleAddManual = useCallback(async (creatorId: string) => {
    if (!manualUrl.trim()) return;
    setAddingStatus("Adding…");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId,
          platform: manualPlatform,
          permalink: manualUrl.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddingStatus(null);
        setAddingLink(null);
        setManualUrl("");
        onScanComplete();
      } else {
        setAddingStatus(data.error || "Error");
      }
    } catch {
      setAddingStatus("Error");
    }
  }, [campaignId, manualUrl, manualPlatform, onScanComplete]);

  // Group deliverables by creator
  const byCreator = new Map<string, CampaignDeliverable[]>();
  for (const d of deliverables) {
    const arr = byCreator.get(d.creatorId) || [];
    arr.push(d);
    byCreator.set(d.creatorId, arr);
  }

  const totalDeliverables = deliverables.length;
  const creatorsWithDeliverables = Array.from(byCreator.keys()).length;

  return (
    <div
      className="rounded-md border p-3"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Header + scan button */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span
            className="text-[10px] font-medium tracking-wider"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            DELIVERABLES
          </span>
          {totalDeliverables > 0 && (
            <span
              className="ml-2 text-[10px] font-bold"
              style={{
                color: "var(--accent-green)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {totalDeliverables} FOUND
            </span>
          )}
        </div>
        <button
          disabled={scanning}
          onClick={handleScan}
          className="px-3 py-1.5 rounded-md text-[10px] font-medium tracking-wider transition-all hover:opacity-80"
          style={{
            backgroundColor: scanning ? "var(--bg-elevated)" : "var(--accent-green-glow)",
            color: scanning ? "var(--text-muted)" : "var(--accent-green)",
            fontFamily: "var(--font-mono)",
            border: `1px solid ${scanning ? "var(--border-subtle)" : "var(--accent-green)33"}`,
            cursor: scanning ? "wait" : "pointer",
            opacity: scanning ? 0.6 : 1,
          }}
        >
          {scanning ? "SCANNING…" : "🔍 SCAN CREATORS"}
        </button>
      </div>

      {/* Scan status */}
      {scanStatus && (
        <div
          className="rounded-md border px-3 py-2 mb-2 text-[10px]"
          style={{
            backgroundColor: "var(--accent-green-glow)",
            borderColor: "var(--accent-green)33",
            color: "var(--accent-green)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {scanStatus}
        </div>
      )}
      {scanError && (
        <div
          className="rounded-md border px-3 py-2 mb-2 text-[10px]"
          style={{
            backgroundColor: "rgba(239,68,68,0.08)",
            borderColor: "rgba(239,68,68,0.2)",
            color: "var(--accent-pink)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {scanError}
        </div>
      )}

      {/* Deliverables per creator */}
      <div className="space-y-2">
        {creators.map((creator) => {
          const creatorDeliverables = byCreator.get(creator.id) || [];
          const name = creator.label || creator.instagramHandle || creator.tiktokHandle || "—";
          const hasDeliverables = creatorDeliverables.length > 0;

          return (
            <div
              key={creator.id}
              className="rounded-md border overflow-hidden"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {/* Creator header */}
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{
                  borderBottom: hasDeliverables ? "1px solid var(--border-subtle)" : "none",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {name}
                  </span>
                  {creator.instagramHandle && (
                    <span className="text-[9px]" style={{ color: "#E1306C" }}>IG</span>
                  )}
                  {creator.tiktokHandle && (
                    <span className="text-[9px]" style={{ color: "#00f2ea" }}>TT</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasDeliverables ? (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--accent-green-glow)",
                        color: "var(--accent-green)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      ✅ {creatorDeliverables.length}
                    </span>
                  ) : (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "rgba(239,68,68,0.08)",
                        color: "var(--accent-pink)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      ⏳ PENDING
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setAddingLink(addingLink === creator.id ? null : creator.id);
                      setManualUrl("");
                      setAddingStatus(null);
                    }}
                    className="text-[9px] px-1.5 py-0.5 rounded hover:opacity-80"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      border: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                    }}
                  >
                    + ADD LINK
                  </button>
                </div>
              </div>

              {/* Manual link form */}
              {addingLink === creator.id && (
                <div
                  className="px-3 py-2 space-y-1.5"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex gap-1.5">
                    <select
                      value={manualPlatform}
                      onChange={(e) => setManualPlatform(e.target.value as "instagram" | "tiktok")}
                      className="rounded-md border px-2 py-1 text-[10px] bg-transparent"
                      style={{
                        borderColor: "var(--border-default)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <option value="instagram">📸 IG</option>
                      <option value="tiktok">🎵 TT</option>
                    </select>
                    <input
                      type="url"
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://www.instagram.com/p/..."
                      className="flex-1 rounded-md border px-2 py-1 text-[10px] bg-transparent"
                      style={{
                        borderColor: "var(--border-default)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                    <button
                      onClick={() => handleAddManual(creator.id)}
                      className="px-2 py-1 rounded-md text-[9px] font-medium tracking-wider"
                      style={{
                        backgroundColor: "var(--accent-green-glow)",
                        color: "var(--accent-green)",
                        fontFamily: "var(--font-mono)",
                        border: "1px solid var(--accent-green)33",
                        cursor: "pointer",
                      }}
                    >
                      ADD
                    </button>
                  </div>
                  {addingStatus && (
                    <p
                      className="text-[9px]"
                      style={{
                        color: addingStatus.includes("Error") || addingStatus.includes("already")
                          ? "var(--accent-pink)"
                          : "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {addingStatus}
                    </p>
                  )}
                </div>
              )}

              {/* Deliverable posts */}
              {creatorDeliverables.map((d, i) => (
                <div
                  key={d.id}
                  className="flex items-start gap-2 px-3 py-2"
                  style={{
                    borderBottom:
                      i < creatorDeliverables.length - 1
                        ? "1px solid var(--border-subtle)"
                        : "none",
                  }}
                >
                  {/* Platform icon */}
                  <span
                    className="text-sm mt-0.5 shrink-0"
                    style={{ color: PLATFORM_COLORS[d.platform] || "var(--text-muted)" }}
                  >
                    {PLATFORM_ICONS[d.platform] || "📄"}
                  </span>

                  {/* Post info */}
                  <div className="flex-1 min-w-0">
                    {d.caption && (
                      <p
                        className="text-[10px] leading-snug mb-0.5 line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {d.caption.slice(0, 120)}{d.caption.length > 120 ? "…" : ""}
                      </p>
                    )}
                    <div className="flex gap-2 text-[9px]" style={{ fontFamily: "var(--font-mono)" }}>
                      {d.views !== null && d.views > 0 && (
                        <span style={{ color: "var(--text-muted)" }}>
                          {d.views >= 1000 ? `${(d.views / 1000).toFixed(1)}K` : d.views} views
                        </span>
                      )}
                      {d.likes !== null && d.likes > 0 && (
                        <span style={{ color: "var(--text-muted)" }}>
                          {d.likes >= 1000 ? `${(d.likes / 1000).toFixed(1)}K` : d.likes} likes
                        </span>
                      )}
                      <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>
                        {d.matchType === "auto" ? `↳ ${d.matchReason}` : "manually added"}
                      </span>
                    </div>
                  </div>

                  {/* Link button */}
                  <a
                    href={d.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 px-2 py-1 rounded-md text-[9px] font-medium tracking-wider hover:opacity-80 transition-all"
                    style={{
                      backgroundColor: PLATFORM_COLORS[d.platform] + "22",
                      color: PLATFORM_COLORS[d.platform] || "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      border: `1px solid ${PLATFORM_COLORS[d.platform] || "var(--border-subtle)"}33`,
                      textDecoration: "none",
                    }}
                  >
                    VIEW →
                  </a>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {totalDeliverables > 0 && (
        <div
          className="mt-2 pt-2 flex gap-4 text-[9px]"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>
            TOTAL: <b style={{ color: "var(--text-primary)" }}>{totalDeliverables}</b> POSTS
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            CREATOR: <b style={{ color: "var(--text-primary)" }}>{creatorsWithDeliverables}/{creators.length}</b>
          </span>
        </div>
      )}
    </div>
  );
}
