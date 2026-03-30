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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = "all" | "draft" | "active";

// ---------------------------------------------------------------------------
// Simplified user-facing status model
// Internal: draft | active | monitoring | completed | archived
// User sees: Draft or Active (monitoring/completed map to Active)
// ---------------------------------------------------------------------------

type UserStatus = "draft" | "active";

function toUserStatus(internal: string): UserStatus {
  if (internal === "draft") return "draft";
  return "active"; // active, monitoring, completed all show as "Active"
}

function isVisibleCampaign(status: string): boolean {
  return status !== "archived";
}

const USER_STATUS_STYLE: Record<UserStatus, { color: string; bg: string; dot: string }> = {
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
};

const USER_STATUS_LABEL: Record<UserStatus, string> = {
  draft: "DRAFT",
  active: "ACTIVE",
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
      const res = await fetch("/api/campaigns");
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
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Listen for campaign-refresh events from detail panel
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (id) {
        // Reload the detail for this campaign
        loadDetail(id);
        loadCampaigns();
      }
    };
    window.addEventListener("campaign-refresh", handler);
    return () => window.removeEventListener("campaign-refresh", handler);
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

  const visibleCampaigns = campaigns.filter(c => isVisibleCampaign(c.status));

  const filteredCampaigns = visibleCampaigns.filter(c => {
    if (viewMode === "all") return true;
    return toUserStatus(c.status) === viewMode;
  });

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
        {(["all", "draft", "active"] as const).map((mode) => {
          const isActive = viewMode === mode;
          const count = mode === "all"
            ? visibleCampaigns.length
            : visibleCampaigns.filter(c => toUserStatus(c.status) === mode).length;
          const modeStyle = mode === "all" ? null : USER_STATUS_STYLE[mode];
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="px-2 py-1 rounded text-[10px] font-medium tracking-wider transition-all"
              style={{
                backgroundColor: isActive
                  ? (modeStyle?.bg || "var(--bg-elevated)")
                  : "transparent",
                color: isActive
                  ? (modeStyle?.color || "var(--text-primary)")
                  : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                border: isActive
                  ? `1px solid ${modeStyle?.color || "var(--border-default)"}33`
                  : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              {mode === "all" ? "ALL" : USER_STATUS_LABEL[mode]} ({count})
            </button>
          );
        })}
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
      {!loading && filteredCampaigns.length > 0 && (
        <div className="space-y-2">
          {filteredCampaigns.map((camp) => {
            const us = toUserStatus(camp.status);
            const style = USER_STATUS_STYLE[us];
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
                    {USER_STATUS_LABEL[us]}
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
  const us = toUserStatus(campaign.status);
  const style = USER_STATUS_STYLE[us];
  const creators = campaign.creators || [];
  const deliverables = campaign.deliverables || [];
  const matchKeywords: string[] = campaign.matchKeywords || [];

  // Creator picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<"single" | "bulk">("single");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<Array<{
    instagramHandle: string | null;
    tiktokHandle: string | null;
    label: string;
    profilePicUrl: string | null;
  }>>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [addingCreator, setAddingCreator] = useState<string | null>(null);
  const [removingCreator, setRemovingCreator] = useState<string | null>(null);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);
  // Local optimistic creators list to avoid full refetch jitter
  const [localCreators, setLocalCreators] = useState(creators);
  useEffect(() => { setLocalCreators(creators); }, [creators]);

  type WarehouseIdentity = {
    displayName?: string | null;
    instagramUsername?: string | null;
    tiktokUsername?: string | null;
    platforms?: Array<{ profilePicUrl?: string | null }>;
  };

  // Fetch warehouse creators for picker
  const searchCreators = useCallback(async (q: string) => {
    setPickerLoading(true);
    try {
      const res = await fetch("/api/warehouse");
      if (!res.ok) return;
      const data = await res.json();
      const identities: WarehouseIdentity[] = data.identities || [];
      const query = q.toLowerCase().trim();
      const results = identities
        .filter((identity) => {
          const instagramHandle = identity.instagramUsername || "";
          const tiktokHandle = identity.tiktokUsername || "";
          const label = identity.displayName || identity.instagramUsername || identity.tiktokUsername || "";
          if (!query) return true;
          return (
            instagramHandle.toLowerCase().includes(query) ||
            tiktokHandle.toLowerCase().includes(query) ||
            label.toLowerCase().includes(query)
          );
        })
        .slice(0, 10)
        .map((identity) => {
          const pic = identity.platforms?.find(p => p.profilePicUrl)?.profilePicUrl || null;
          return {
            instagramHandle: identity.instagramUsername || null,
            tiktokHandle: identity.tiktokUsername || null,
            label: identity.displayName || identity.instagramUsername || identity.tiktokUsername || "—",
            profilePicUrl: pic,
          };
        });
      setPickerResults(results);
    } catch {
      setPickerResults([]);
    }
    setPickerLoading(false);
  }, []);

  // Load creators when picker opens
  useEffect(() => {
    if (showPicker) searchCreators(pickerQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPicker]);

  // Build a profilePicUrl lookup from picker results for added creators
  const picUrlMap = new Map<string, string>();
  for (const pr of pickerResults) {
    if (pr.profilePicUrl) {
      if (pr.instagramHandle) picUrlMap.set(pr.instagramHandle, pr.profilePicUrl);
      if (pr.tiktokHandle) picUrlMap.set(pr.tiktokHandle, pr.profilePicUrl);
    }
  }

  const handleAddCreator = async (creator: { instagramHandle: string | null; tiktokHandle: string | null; label: string; profilePicUrl?: string | null }) => {
    setAddingCreator(creator.label);
    // Optimistic local update — add immediately
    const tempId = `temp_${Date.now()}`;
    setLocalCreators(prev => [...prev, {
      id: tempId,
      campaignId: campaign.id,
      instagramHandle: creator.instagramHandle,
      tiktokHandle: creator.tiktokHandle,
      label: creator.label,
      addedAt: new Date().toISOString(),
    } as CampaignCreator]);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/creators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creators: [{
            instagramHandle: creator.instagramHandle,
            tiktokHandle: creator.tiktokHandle,
            label: creator.label,
          }],
        }),
      });
      if (res.ok) {
        // Silently refresh in background — no visible jitter
        window.dispatchEvent(new CustomEvent("campaign-refresh", { detail: campaign.id }));
      }
    } catch { /* silent */ }
    setAddingCreator(null);
  };

  const handleBulkAdd = async () => {
    const lines = bulkInput.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setBulkAdding(true);
    const creatorsToAdd: Array<{ instagramHandle: string | null; tiktokHandle: string | null; label: string }> = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]+/).map(p => p.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
      if (parts.length >= 2) {
        creatorsToAdd.push({ instagramHandle: parts[0], tiktokHandle: parts[1], label: parts[0] });
      } else if (parts.length === 1) {
        creatorsToAdd.push({ instagramHandle: parts[0], tiktokHandle: null, label: parts[0] });
      }
    }
    if (creatorsToAdd.length === 0) { setBulkAdding(false); return; }
    // Optimistic local update
    setLocalCreators(prev => [
      ...prev,
      ...creatorsToAdd.map((c, i) => ({
        id: `temp_bulk_${Date.now()}_${i}`,
        campaignId: campaign.id,
        instagramHandle: c.instagramHandle,
        tiktokHandle: c.tiktokHandle,
        label: c.label,
        addedAt: new Date().toISOString(),
      } as CampaignCreator)),
    ]);
    try {
      await fetch(`/api/campaigns/${campaign.id}/creators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creators: creatorsToAdd }),
      });
      window.dispatchEvent(new CustomEvent("campaign-refresh", { detail: campaign.id }));
      setBulkInput("");
      setShowPicker(false);
    } catch { /* silent */ }
    setBulkAdding(false);
  };

  const handleRemoveCreator = async (creatorId: string) => {
    setRemovingCreator(creatorId);
    // Optimistic local removal
    setLocalCreators(prev => prev.filter(c => c.id !== creatorId));
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/creators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId }),
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent("campaign-refresh", { detail: campaign.id }));
      }
    } catch { /* silent */ }
    setRemovingCreator(null);
  };

  // Determine single action for this campaign
  const actionLabel = us === "draft" ? "ACTIVATE" : "ARCHIVE";
  const actionTarget: CampaignStatus = us === "draft" ? "active" : "archived";
  const actionColor = us === "draft" ? "var(--accent-green)" : "var(--text-muted)";

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
          className="w-full max-w-[520px] rounded-lg border"
          style={{
            backgroundColor: "var(--bg-primary)",
            overflowY: "auto",
            scrollbarWidth: "none",
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
                className="text-xs font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {campaign.name}
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
          {/* Status + Brand + Action row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-medium tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: style.bg,
                  color: style.color,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {USER_STATUS_LABEL[us]}
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
            <button
              onClick={() => onUpdateStatus(campaign.id, actionTarget)}
              className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider transition-all hover:opacity-80"
              style={{
                backgroundColor: us === "draft" ? "var(--accent-green-glow)" : "rgba(128,128,128,0.08)",
                color: actionColor,
                fontFamily: "var(--font-mono)",
                border: `1px solid ${actionColor}33`,
                cursor: "pointer",
              }}
            >
              → {actionLabel}
            </button>
          </div>

          {/* Meta info — compact */}
          {(campaign.budgetAmount != null || campaign.startDate) && (
            <div
              className="flex items-center gap-4 text-[10px]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {campaign.budgetAmount != null && (
                <span style={{ color: "var(--accent-green)" }}>
                  {campaign.budgetCurrency === "TRY" ? "₺" : campaign.budgetCurrency === "EUR" ? "€" : "$"}
                  {campaign.budgetAmount.toLocaleString()}
                </span>
              )}
              {campaign.startDate && (
                <span style={{ color: "var(--text-muted)" }}>
                  {new Date(campaign.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {campaign.endDate && ` → ${new Date(campaign.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          {campaign.notes && (
            <p
              className="text-[11px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {campaign.notes}
            </p>
          )}

          {/* ── Creators Section ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[10px] font-medium tracking-wider"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                CREATORS · {localCreators.length}
              </span>
              <button
                onClick={() => { setShowPicker(!showPicker); setPickerQuery(""); setPickerMode("single"); }}
                className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 transition-all"
                style={{
                  backgroundColor: showPicker ? "rgba(128,128,128,0.08)" : "var(--accent-green-glow)",
                  color: showPicker ? "var(--text-muted)" : "var(--accent-green)",
                  fontFamily: "var(--font-mono)",
                  border: showPicker ? "1px solid var(--border-default)" : "1px solid var(--accent-green)33",
                  cursor: "pointer",
                }}
              >
                {showPicker ? "CLOSE" : "+ ADD"}
              </button>
            </div>

            {/* Creator Picker */}
            <div
              style={{
                maxHeight: showPicker ? "400px" : "0px",
                overflow: "hidden",
                transition: "max-height 0.2s ease",
              }}
            >
              <div
                className="rounded-md border mb-2 overflow-hidden"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-default)",
                }}
              >
                {/* Mode tabs */}
                <div className="flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  <button
                    onClick={() => setPickerMode("single")}
                    className="flex-1 py-1.5 text-[10px] font-medium tracking-wider transition-colors"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: pickerMode === "single" ? "var(--accent-green)" : "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      borderBottom: pickerMode === "single" ? "1px solid var(--accent-green)" : "1px solid transparent",
                    }}
                  >
                    SEARCH
                  </button>
                  <button
                    onClick={() => setPickerMode("bulk")}
                    className="flex-1 py-1.5 text-[10px] font-medium tracking-wider transition-colors"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: pickerMode === "bulk" ? "var(--accent-green)" : "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      borderBottom: pickerMode === "bulk" ? "1px solid var(--accent-green)" : "1px solid transparent",
                    }}
                  >
                    BULK ADD
                  </button>
                </div>

                {pickerMode === "single" ? (
                  <>
                    <div className="p-2">
                      <input
                        type="text"
                        value={pickerQuery}
                        onChange={(e) => {
                          setPickerQuery(e.target.value);
                          searchCreators(e.target.value);
                        }}
                        placeholder="Search creators..."
                        className="w-full rounded-md border px-2.5 py-1.5 text-xs bg-transparent"
                        style={{
                          borderColor: "var(--border-default)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                        autoFocus
                      />
                    </div>
                    <div style={{ maxHeight: "200px", overflowY: "auto", scrollbarWidth: "none" }}>
                      {pickerLoading ? (
                        <div className="px-3 py-3 text-center text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          Loading…
                        </div>
                      ) : pickerResults.length === 0 ? (
                        <div className="px-3 py-3 text-center text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          No creators found
                        </div>
                      ) : (
                        pickerResults.map((cr, i) => {
                          const alreadyAdded = localCreators.some(
                            (ec) =>
                              (ec.instagramHandle && ec.instagramHandle === cr.instagramHandle) ||
                              (ec.tiktokHandle && ec.tiktokHandle === cr.tiktokHandle)
                          );
                          return (
                            <div
                              key={`${cr.instagramHandle}-${cr.tiktokHandle}-${i}`}
                              className="flex items-center gap-2.5 px-3 py-2 transition-colors"
                              style={{
                                borderTop: "1px solid var(--border-subtle)",
                                cursor: alreadyAdded ? "default" : "pointer",
                                opacity: alreadyAdded ? 0.4 : 1,
                              }}
                              onClick={() => !alreadyAdded && handleAddCreator(cr)}
                              onMouseEnter={(e) => { if (!alreadyAdded) (e.currentTarget.style.backgroundColor = "var(--bg-elevated)"); }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                            >
                              {/* Avatar */}
                              {cr.profilePicUrl ? (
                                <img
                                  src={cr.profilePicUrl}
                                  alt=""
                                  className="shrink-0 rounded-full"
                                  style={{ width: 28, height: 28, objectFit: "cover" }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div
                                  className="shrink-0 rounded-full flex items-center justify-center text-[10px] font-medium"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    backgroundColor: "var(--bg-elevated)",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  {(cr.label || "?")[0].toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                  {cr.label}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {cr.instagramHandle && (
                                    <span className="text-[9px]" style={{ color: "#E1306C", fontFamily: "var(--font-mono)" }}>
                                      @{cr.instagramHandle}
                                    </span>
                                  )}
                                  {cr.tiktokHandle && (
                                    <span className="text-[9px]" style={{ color: "#00f2ea", fontFamily: "var(--font-mono)" }}>
                                      @{cr.tiktokHandle}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {alreadyAdded ? (
                                <span className="text-[9px] shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                  ADDED
                                </span>
                              ) : addingCreator === cr.label ? (
                                <span className="text-[9px] shrink-0" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                                  ADDING…
                                </span>
                              ) : (
                                <span className="text-[9px] shrink-0" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                                  + ADD
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  /* Bulk Add Mode */
                  <div className="p-2.5 space-y-2">
                    <textarea
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder={"instagram_handle, tiktok_handle\ninstagram_handle2, tiktok_handle2\n\nOne creator per line.\nSame format as Analyze."}
                      className="w-full rounded-md border px-2.5 py-2 text-xs bg-transparent"
                      style={{
                        borderColor: "var(--border-default)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                        minHeight: "100px",
                        resize: "vertical",
                        outline: "none",
                      }}
                      autoFocus
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[9px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {bulkInput.split("\n").filter(l => l.trim()).length} creator{bulkInput.split("\n").filter(l => l.trim()).length !== 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={handleBulkAdd}
                        disabled={bulkAdding || !bulkInput.trim()}
                        className="text-[10px] px-2.5 py-1 rounded font-medium tracking-wider transition-all hover:opacity-80"
                        style={{
                          backgroundColor: "var(--accent-green-glow)",
                          color: "var(--accent-green)",
                          fontFamily: "var(--font-mono)",
                          border: "1px solid var(--accent-green)33",
                          cursor: bulkAdding || !bulkInput.trim() ? "default" : "pointer",
                          opacity: bulkAdding || !bulkInput.trim() ? 0.4 : 1,
                        }}
                      >
                        {bulkAdding ? "ADDING…" : "ADD ALL"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {localCreators.length === 0 ? (
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
                  No creators added yet
                </p>
                <p
                  className="text-[9px]"
                  style={{
                    color: "var(--text-muted)",
                    opacity: 0.6,
                  }}
                >
                  Use the + ADD button above to add creators from your library
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
                {localCreators.map(
                  (creator: CampaignCreator, i: number) => {
                    const picUrl = picUrlMap.get(creator.instagramHandle || "") || picUrlMap.get(creator.tiktokHandle || "") || null;
                    return (
                      <div
                        key={creator.id}
                        className="flex items-center gap-2.5 px-3 py-2.5 group"
                        style={{
                          borderBottom:
                            i < localCreators.length - 1
                              ? "1px solid var(--border-subtle)"
                              : "none",
                        }}
                      >
                        {/* Avatar */}
                        {picUrl ? (
                          <img
                            src={picUrl}
                            alt=""
                            className="shrink-0 rounded-full"
                            style={{ width: 28, height: 28, objectFit: "cover" }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div
                            className="shrink-0 rounded-full flex items-center justify-center text-[10px] font-medium"
                            style={{
                              width: 28,
                              height: 28,
                              backgroundColor: "var(--bg-elevated)",
                              color: "var(--text-muted)",
                            }}
                          >
                            {((creator.label || creator.instagramHandle || creator.tiktokHandle || "?")[0] || "?").toUpperCase()}
                          </div>
                        )}
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
                                  color: "#E1306C",
                                  fontFamily: "var(--font-mono)",
                                }}
                              >
                                @{creator.instagramHandle}
                              </span>
                            )}
                            {creator.tiktokHandle && (
                              <span
                                className="text-[9px]"
                                style={{
                                  color: "#00f2ea",
                                  fontFamily: "var(--font-mono)",
                                }}
                              >
                                @{creator.tiktokHandle}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveCreator(creator.id); }}
                          className="text-[10px] opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent-pink)",
                            cursor: "pointer",
                            padding: "2px 4px",
                          }}
                          title="Remove creator"
                        >
                          {removingCreator === creator.id ? "…" : "✕"}
                        </button>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>

          {/* Match Settings — only for brand-linked campaigns */}
          {campaign.brandId && (
            <MatchSettingsPanel
              campaignId={campaign.id}
              keywords={matchKeywords}
              onUpdate={() => {
                window.dispatchEvent(new CustomEvent("campaign-refresh", { detail: campaign.id }));
              }}
            />
          )}

          {/* Content Tracking — only show when there are creators and a brand */}
          {campaign.brandId && creators.length > 0 && (
            <DeliverableTracker
              campaignId={campaign.id}
              creators={creators}
              deliverables={deliverables}
              onScanComplete={() => {
                window.dispatchEvent(new CustomEvent("campaign-refresh", { detail: campaign.id }));
              }}
            />
          )}

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
                </div>
              </div>
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
