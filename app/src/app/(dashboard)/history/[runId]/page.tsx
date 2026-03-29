"use client";

/**
 * History Detail Page — Full-Fidelity Replay
 *
 * Renders a complete past analysis run using the same DetailPanels components
 * as the live workspace. Supports:
 * - v2 snapshots: full PlatformAnalysis replay (profiles, benchmarks, visibility, CPM)
 * - v1 snapshots: graceful degraded rendering with summary metrics
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ProfileCard,
  BenchmarkPanel,
  VisibilityIntelligencePanel,
  BudgetWorkbench,
  formatNumber,
} from "@/app/components/DetailPanels";
import { SkeletonCard, SkeletonStats } from "@/app/components/ui/Skeleton";
import { StatusBadge } from "@/app/components/ui/StatusBadge";

import type { PlatformAnalysis } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SnapshotRow = {
  _v?: number;
  row: {
    id: string;
    instagramUsername?: string | null;
    tiktokUsername?: string | null;
    label?: string | null;
  };
  status: string;
  instagram: PlatformAnalysis | null;
  tiktok: PlatformAnalysis | null;
  warnings: string[];
};

type RunDetail = {
  id: string;
  teamId: string;
  status: string;
  totalRows: number;
  completeRows: number;
  partialRows: number;
  errorRows: number;
  inputSummary: { instagram?: string; tiktok?: string; label?: string }[];
  resultSnapshot: SnapshotRow[];
  note: string | null;
  archived: boolean;
  tags: string;
  startedAt: string;
  completedAt: string | null;
  userName: string;
  userEmail: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusColor = (s: string) => {
  switch (s) {
    case "complete": return "var(--accent-green)";
    case "partial": return "var(--accent-amber)";
    case "error": return "var(--accent-pink)";
    case "running": return "var(--accent-blue, #3b82f6)";
    default: return "var(--text-muted)";
  }
};

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const duration = (start: string, end: string | null) => {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

/** Detect v2 (full) vs v1 (skeletal) snapshot rows */
const isV2Row = (row: SnapshotRow): boolean => {
  if (row._v === 2) return true;
  // Heuristic: v2 has reels arrays in organic bucket
  const ig = row.instagram as Record<string, unknown> | null;
  const tk = row.tiktok as Record<string, unknown> | null;
  const igOrg = ig?.organic as Record<string, unknown> | undefined;
  const tkOrg = tk?.organic as Record<string, unknown> | undefined;
  return !!(igOrg?.reels || tkOrg?.reels);
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HistoryDetailPage() {
  const params = useParams();
  const runId = params.runId as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!runId) return;
    (async () => {
      try {
        const res = await fetch(`/api/history/${runId}`);
        if (!res.ok) {
          if (res.status === 404) setError("Run not found.");
          else if (res.status === 403) setError("Access denied.");
          else setError("Failed to load run details.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        // Parse snapshot if it's still a string
        if (typeof data.resultSnapshot === "string") {
          try { data.resultSnapshot = JSON.parse(data.resultSnapshot); } catch { data.resultSnapshot = []; }
        }
        if (typeof data.inputSummary === "string") {
          try { data.inputSummary = JSON.parse(data.inputSummary); } catch { data.inputSummary = []; }
        }
        setRun(data);
        // Auto-expand first row if only one
        if (data.resultSnapshot?.length === 1) setExpandedRow(0);
      } catch {
        setError("Network error.");
      }
      setLoading(false);
    })();
  }, [runId]);

  return (
    <>
      {/* Breadcrumb */}
      {run && (
        <div className="flex items-center gap-1.5 mb-4 text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>
          <a href="/history" className="transition-all hover:opacity-80" style={{ color: "var(--text-muted)" }}>HISTORY</a>
          <span style={{ color: "var(--text-muted)" }}>/</span>
          <span style={{ color: "var(--text-secondary)" }}>{run.id.slice(0, 8)}…</span>
        </div>
      )}
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard lines={2} />
            <SkeletonStats count={4} />
            <SkeletonCard lines={3} />
          </div>
        ) : error ? (
          <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--accent-pink)" }}>
            <p className="text-xs" style={{ color: "var(--accent-pink)" }}>{error}</p>
            <a href="/history" className="text-xs mt-3 inline-block" style={{ color: "var(--text-muted)" }}>← Back to history</a>
          </div>
        ) : run ? (
          <div className="space-y-6">
            {/* Run Metadata */}
            <RunMetadataCard
              run={run}
              onArchiveToggle={async () => {
                await fetch("/api/history/archive", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ runIds: [run.id], archived: !run.archived }),
                });
                setRun({ ...run, archived: !run.archived });
              }}
              onDeleteRequest={() => setDeleteConfirm(true)}
              onTagsUpdate={async (tags) => {
                const res = await fetch("/api/history/tags", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ runId: run.id, tags }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setRun({ ...run, tags: JSON.stringify(data.tags) });
                }
              }}
              onExport={async () => {
                const res = await fetch(`/api/history/export?runIds=${run.id}`);
                if (!res.ok) return;
                const blob = await res.blob();
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `analysis-${run.id.slice(0, 8)}.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            />

            {/* Input Summary */}
            {run.inputSummary && run.inputSummary.length > 0 && (
              <div className="rounded-md border p-5" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
                <h3 className="text-xs tracking-wider mb-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  INPUT CREATORS ({run.inputSummary.length})
                </h3>
                <div className="flex gap-1.5 flex-wrap">
                  {run.inputSummary.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                      className="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-all"
                      style={{
                        backgroundColor: expandedRow === i ? "var(--accent-green-glow)" : "var(--bg-elevated)",
                        color: expandedRow === i ? "var(--accent-green)" : "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        border: expandedRow === i ? "1px solid var(--accent-green)" : "1px solid transparent",
                      }}
                    >
                      {h.label || h.instagram || h.tiktok || `Row ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Per-Creator Detail — the replay surface */}
            {run.resultSnapshot && run.resultSnapshot.length > 0 && (
              <div className="space-y-4">
                {run.resultSnapshot.map((snap, i) => {
                  const isExpanded = expandedRow === i;
                  const v2 = isV2Row(snap);
                  const label = snap.row.label || snap.row.instagramUsername || snap.row.tiktokUsername || `Row ${i + 1}`;
                  const hasIg = !!snap.row.instagramUsername;
                  const hasTk = !!snap.row.tiktokUsername;
                  const ig = snap.instagram;
                  const tk = snap.tiktok;

                  return (
                    <div key={snap.row.id || i} className="rounded-md border overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: isExpanded ? "var(--border-default)" : "var(--border-subtle)" }}>
                      {/* Row Header — always visible */}
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : i)}
                        className="w-full flex items-center justify-between px-5 py-3 transition-all"
                        style={{ cursor: "pointer", backgroundColor: isExpanded ? "var(--bg-elevated)" : "transparent" }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded font-medium"
                            style={{ backgroundColor: `${statusColor(snap.status)}20`, color: statusColor(snap.status), fontFamily: "var(--font-mono)" }}
                          >
                            {snap.status.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                            {label}
                          </span>
                          {!v2 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(217,119,6,0.1)", color: "#d97706", fontFamily: "var(--font-mono)" }}>
                              LEGACY
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          {/* Quick metrics shown in collapsed state */}
                          {ig?.profile?.followerCount && (
                            <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              IG: {formatNumber(ig.profile.followerCount)}
                            </span>
                          )}
                          {tk?.profile?.followerCount && (
                            <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              TK: {formatNumber(tk.profile.followerCount)}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </button>

                      {/* Expanded Detail — full replay */}
                      {isExpanded && (
                        <div className="p-5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                          {v2 ? (
                            // V2: Full replay using DetailPanels components
                            <V2ReplayPanel ig={ig} tk={tk} hasIg={hasIg} hasTk={hasTk} warnings={snap.warnings} />
                          ) : (
                            // V1: Legacy degraded view
                            <V1LegacyPanel snap={snap} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {(!run.resultSnapshot || run.resultSnapshot.length === 0) && (
              <div className="rounded-md border p-6 text-center" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {run.status === "running" ? "Analysis is still running..." : "No result data stored for this run."}
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setDeleteConfirm(false)}
          >
            <div
              className="rounded-lg border p-6 max-w-sm w-full mx-4"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: "rgba(236,72,153,0.1)" }}>
                  <span className="text-sm" style={{ color: "var(--accent-pink)" }}>⚠</span>
                </div>
                <h3 className="text-xs font-semibold tracking-wider" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  DELETE RUN
                </h3>
              </div>
              <p className="text-[11px] mb-4" style={{ color: "var(--text-secondary)" }}>
                This will permanently delete this analysis run and all associated data. This action cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-[10px] px-3 py-1.5 rounded-md transition-all hover:opacity-80"
                  style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", fontFamily: "var(--font-mono)" }}
                >
                  CANCEL
                </button>
                <button
                  onClick={async () => {
                    await fetch("/api/history/delete", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ runIds: [runId] }),
                    });
                    router.push("/history");
                  }}
                  className="text-[10px] px-3 py-1.5 rounded-md transition-all hover:opacity-80"
                  style={{ color: "#fff", backgroundColor: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}
                >
                  DELETE RUN
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Run Metadata Card
// ---------------------------------------------------------------------------

function RunMetadataCard({ run, onArchiveToggle, onDeleteRequest, onTagsUpdate, onExport }: {
  run: RunDetail;
  onArchiveToggle: () => void;
  onDeleteRequest: () => void;
  onTagsUpdate: (tags: string[]) => void;
  onExport: () => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(run.note || "");
  const noteInputRef = useRef<HTMLInputElement>(null);
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tags: string[] = (() => { try { return JSON.parse(run.tags); } catch { return []; } })();

  const handleNoteSave = useCallback(async () => {
    setEditingNote(false);
    if (noteValue.trim() !== (run.note || "")) {
      try {
        await fetch("/api/history/note", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: run.id, note: noteValue.trim() }),
        });
        run.note = noteValue.trim() || null;
      } catch {}
    }
  }, [noteValue, run]);

  useEffect(() => {
    if (editingNote && noteInputRef.current) noteInputRef.current.focus();
  }, [editingNote]);

  return (
    <div className="rounded-md border p-6" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span
              className="text-[10px] px-2 py-0.5 rounded font-medium"
              style={{ backgroundColor: `${statusColor(run.status)}20`, color: statusColor(run.status), fontFamily: "var(--font-mono)" }}
            >
              {run.status.toUpperCase()}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {run.id.slice(0, 8)}…
            </span>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Ran by <strong style={{ color: "var(--text-primary)" }}>{run.userName}</strong> ({run.userEmail})
          </p>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            data-no-press
            onClick={onExport}
            className="text-[10px] px-2.5 py-1.5 rounded transition-colors"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", backgroundColor: "var(--bg-elevated)" }}
          >
            ↓ CSV
          </button>
          <button
            data-no-press
            onClick={onArchiveToggle}
            className="text-[10px] px-2.5 py-1.5 rounded transition-colors"
            style={{
              color: run.archived ? "var(--accent-green)" : "#d97706",
              fontFamily: "var(--font-mono)",
              backgroundColor: run.archived ? "rgba(52,211,153,0.06)" : "rgba(217,119,6,0.06)",
            }}
          >
            {run.archived ? "UNARCHIVE" : "ARCHIVE"}
          </button>
          <button
            data-no-press
            onClick={onDeleteRequest}
            className="text-[10px] px-2.5 py-1.5 rounded transition-colors"
            style={{ color: "var(--accent-pink)", fontFamily: "var(--font-mono)", backgroundColor: "rgba(236,72,153,0.06)" }}
          >
            DELETE
          </button>
        </div>
      </div>

      {/* Note */}
      <div className="mb-4">
        {editingNote ? (
          <input
            ref={noteInputRef}
            type="text"
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={handleNoteSave}
            onKeyDown={(e) => { if (e.key === "Enter") handleNoteSave(); if (e.key === "Escape") { setNoteValue(run.note || ""); setEditingNote(false); } }}
            placeholder="Add a note about this run..."
            className="w-full text-xs bg-transparent outline-none px-2 py-1.5 rounded border"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", borderColor: "var(--border-default)" }}
          />
        ) : (
          <button
            onClick={() => setEditingNote(true)}
            className="text-xs transition-all hover:opacity-80 cursor-pointer text-left"
            style={{ color: run.note ? "var(--text-secondary)" : "var(--text-muted)", fontFamily: "var(--font-mono)", background: "none", border: "none", padding: 0, opacity: run.note ? 1 : 0.5 }}
          >
            {run.note || "＋ Add note"}
          </button>
        )}
      </div>

      {/* Tags */}
      <div className="mb-4 flex items-center gap-1.5 flex-wrap">
        {tags.map(tag => (
          <span
            key={tag}
            className="text-[9px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"
            style={{
              backgroundColor: "rgba(59,130,246,0.08)",
              color: "#3b82f6",
              fontFamily: "var(--font-mono)",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            #{tag}
            {editingTags && (
              <button
                onClick={() => onTagsUpdate(tags.filter(t => t !== tag))}
                className="ml-0.5 hover:opacity-60 cursor-pointer"
                style={{ color: "#3b82f6" }}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {editingTags ? (
          <input
            ref={tagInputRef}
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, ""))}
            onBlur={() => {
              if (tagInput.trim()) {
                const newTag = tagInput.trim().toLowerCase();
                if (!tags.includes(newTag)) onTagsUpdate([...tags, newTag]);
              }
              setTagInput("");
              setEditingTags(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                const newTag = tagInput.trim().toLowerCase();
                if (newTag && !tags.includes(newTag)) onTagsUpdate([...tags, newTag]);
                setTagInput("");
              }
              if (e.key === "Escape") { setTagInput(""); setEditingTags(false); }
            }}
            placeholder="add tag..."
            className="text-[9px] bg-transparent outline-none px-1.5 py-0.5 rounded border w-20"
            style={{ color: "#3b82f6", fontFamily: "var(--font-mono)", borderColor: "rgba(59,130,246,0.3)" }}
          />
        ) : (
          <button
            onClick={() => setEditingTags(true)}
            className="text-[9px] transition-all hover:opacity-80 cursor-pointer"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", background: "none", border: "none", opacity: 0.5 }}
          >
            ＋ Add tag
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "TOTAL", value: run.totalRows },
          { label: "COMPLETE", value: run.completeRows, color: "var(--accent-green)" },
          { label: "PARTIAL", value: run.partialRows, color: "var(--accent-amber)" },
          { label: "ERRORS", value: run.errorRows, color: run.errorRows > 0 ? "var(--accent-pink)" : undefined },
        ].map((s) => (
          <div key={s.label} className="rounded-md border p-3" style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
            <p className="text-[10px] tracking-wider mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{s.label}</p>
            <p className="text-xl font-semibold" style={{ color: s.color || "var(--text-primary)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
        <div>
          <p className="text-[10px] tracking-wider mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>STARTED</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatDate(run.startedAt)}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wider mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>COMPLETED</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatDate(run.completedAt)}</p>
        </div>
        <div>
          <p className="text-[10px] tracking-wider mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>DURATION</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{duration(run.startedAt, run.completedAt)}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// V2 Replay Panel — full-fidelity using DetailPanels
// ---------------------------------------------------------------------------

function V2ReplayPanel({
  ig, tk, hasIg, hasTk, warnings,
}: {
  ig: PlatformAnalysis | null;
  tk: PlatformAnalysis | null;
  hasIg: boolean;
  hasTk: boolean;
  warnings: string[];
}) {
  return (
    <div className="space-y-4">
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs" style={{ color: "var(--accent-pink)" }}>{w}</p>
          ))}
        </div>
      )}

      {/* Profile Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasIg && (
          <ProfileCard platform="instagram" label="Instagram" analysis={ig ?? undefined} />
        )}
        {hasTk && (
          <ProfileCard platform="tiktok" label="TikTok" analysis={tk ?? undefined} />
        )}
      </div>

      {/* Benchmark Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasIg && ig && ig.status !== "error" && (
          <BenchmarkPanel platform="instagram" label="Instagram" contentLabel="Reels" analysis={ig} />
        )}
        {hasTk && tk && tk.status !== "error" && (
          <BenchmarkPanel platform="tiktok" label="TikTok" contentLabel="Videos" analysis={tk} />
        )}
      </div>

      {/* Visibility + CPM */}
      {hasIg && ig && ig.status !== "error" && (ig.storyVisibility || (ig.carouselVisibility && ig.carouselVisibility.sourceMode !== "unavailable")) ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" style={{ alignItems: "start" }}>
          <div className="lg:col-span-4">
            <VisibilityIntelligencePanel
              story={ig.storyVisibility ?? null}
              carousel={ig.carouselVisibility?.sourceMode !== "unavailable" ? ig.carouselVisibility ?? null : null}
            />
          </div>
          <div className="lg:col-span-8">
            <BudgetWorkbench ig={ig ?? undefined} tk={tk ?? undefined} hasIg={hasIg} hasTk={hasTk} />
          </div>
        </div>
      ) : (
        <BudgetWorkbench ig={ig ?? undefined} tk={tk ?? undefined} hasIg={hasIg} hasTk={hasTk} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// V1 Legacy Panel — graceful degraded rendering
// ---------------------------------------------------------------------------

function V1LegacyPanel({ snap }: { snap: SnapshotRow }) {
  const ig = snap.instagram as Record<string, unknown> | null;
  const tk = snap.tiktok as Record<string, unknown> | null;

  const extractMetrics = (platform: Record<string, unknown> | null) => {
    if (!platform) return null;
    const profile = platform.profile as Record<string, unknown> | null;
    const organic = platform.organic as Record<string, unknown> | null;
    const commercial = platform.commercial as Record<string, unknown> | null;
    const comparison = platform.comparison as Record<string, unknown> | null;
    return { profile, organic, commercial, comparison };
  };

  const igMetrics = extractMetrics(ig);
  const tkMetrics = extractMetrics(tk);

  return (
    <div className="space-y-4">
      {/* Legacy Banner */}
      <div className="rounded-md border p-3 flex items-center gap-2" style={{ backgroundColor: "rgba(217,119,6,0.05)", borderColor: "rgba(217,119,6,0.2)" }}>
        <span className="text-xs" style={{ color: "#d97706" }}>⚠</span>
        <span className="text-xs" style={{ color: "#d97706" }}>
          This run was saved before full replay support. Only summary metrics are available — content-level detail, visibility intelligence, and CPM data were not stored.
        </span>
      </div>

      {/* Legacy Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {igMetrics && (
          <LegacyPlatformCard label="Instagram" platformData={igMetrics} />
        )}
        {tkMetrics && (
          <LegacyPlatformCard label="TikTok" platformData={tkMetrics} />
        )}
      </div>

      {/* Warnings */}
      {snap.warnings?.length > 0 && (
        <div className="space-y-1">
          {snap.warnings.map((w, i) => (
            <p key={i} className="text-xs" style={{ color: "var(--accent-pink)" }}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyPlatformCard({
  label,
  platformData,
}: {
  label: string;
  platformData: {
    profile: Record<string, unknown> | null;
    organic: Record<string, unknown> | null;
    commercial: Record<string, unknown> | null;
    comparison: Record<string, unknown> | null;
  };
}) {
  const { profile, organic, commercial, comparison } = platformData;

  return (
    <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
      <p className="text-xs font-medium tracking-wider mb-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {label.toUpperCase()}
      </p>

      {/* Profile */}
      {profile && (
        <div className="mb-3 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            @{String(profile.username || "—")}
          </p>
          {profile.followerCount != null && (
            <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              {Number(profile.followerCount).toLocaleString()} followers
            </p>
          )}
        </div>
      )}

      {/* Benchmarks */}
      <div className="grid grid-cols-2 gap-3">
        {organic && (
          <div>
            <p className="text-[10px] tracking-wider mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>ORGANIC AVG</p>
            <p className="text-base font-semibold" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
              {organic.averageViews != null ? Number(organic.averageViews).toLocaleString() : "—"}
            </p>
            {organic.sampleSize != null && (
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{String(organic.sampleSize)} samples</p>
            )}
          </div>
        )}
        {commercial && (
          <div>
            <p className="text-[10px] tracking-wider mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>COMMERCIAL AVG</p>
            <p className="text-base font-semibold" style={{ color: "var(--accent-amber)", fontFamily: "var(--font-mono)" }}>
              {commercial.averageViews != null ? Number(commercial.averageViews).toLocaleString() : "—"}
            </p>
            {commercial.sampleSize != null && (
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{String(commercial.sampleSize)} samples</p>
            )}
          </div>
        )}
      </div>

      {/* Comparison */}
      {comparison && comparison.adToOrganicRatio != null && (
        <div className="mt-3 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>AD/ORGANIC RATIO</span>
            <span className="text-xs font-semibold" style={{
              color: Number(comparison.adToOrganicRatio) >= 1 ? "var(--accent-green)" : "var(--accent-amber)",
              fontFamily: "var(--font-mono)",
            }}>
              {Math.round(Number(comparison.adToOrganicRatio) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
