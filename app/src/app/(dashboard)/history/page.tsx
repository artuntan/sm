"use client";

/**
 * Analysis History — Operational Knowledge Surface
 *
 * Phase 3: Search + status tabs + notes + archive + bulk ops + tags + export.
 * Dense, professional listing with the dark control-plane aesthetic.
 */

import { useState, useEffect, useCallback, useRef } from "react";

import { SkeletonCard } from "@/app/components/ui/Skeleton";
import { StatusBadge } from "@/app/components/ui/StatusBadge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HistoryRun = {
  id: string;
  status: string;
  totalRows: number;
  completeRows: number;
  partialRows: number;
  errorRows: number;
  inputSummary: string;
  note: string | null;
  archived: boolean;
  tags: string;
  startedAt: string;
  completedAt: string | null;
  userName: string;
  userEmail: string;
};

type StatusTab = "all" | "complete" | "partial" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function duration(start: string, end: string | null) {
  if (!end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function relativeDate(ts: string) {
  const now = Date.now();
  const diff = now - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function parseHandles(input: string): { instagram?: string; tiktok?: string; label?: string }[] {
  try { return JSON.parse(input); } catch { return []; }
}

function parseTags(input: string): string[] {
  try { return JSON.parse(input); } catch { return []; }
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string[] | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  // Fetch runs
  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusTab !== "all") params.set("status", statusTab);
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (showArchived) params.set("archived", "1");
      if (activeTag) params.set("tag", activeTag);
      const res = await fetch(`/api/history?${params.toString()}`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {
      setRuns([]);
    }
    setLoading(false);
  }, [statusTab, debouncedQuery, showArchived, activeTag]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Status counts (for unfiltered view)
  const [statusCounts, setStatusCounts] = useState({ all: 0, complete: 0, partial: 0, error: 0 });
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (showArchived) params.set("archived", "1");
    if (activeTag) params.set("tag", activeTag);
    fetch(`/api/history?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        const allRuns: HistoryRun[] = data.runs || [];
        setStatusCounts({
          all: allRuns.length,
          complete: allRuns.filter(r => r.status === "complete").length,
          partial: allRuns.filter(r => r.status === "partial").length,
          error: allRuns.filter(r => r.status === "error").length,
        });
      })
      .catch(() => {});
  }, [debouncedQuery, showArchived, activeTag]);

  // Collect all unique tags across runs for the filter chips
  const allTags = [...new Set(runs.flatMap(r => parseTags(r.tags)))].sort();

  // Note update
  const handleNoteUpdate = useCallback(async (runId: string, note: string) => {
    try {
      const res = await fetch("/api/history/note", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, note }),
      });
      if (res.ok) {
        setRuns(prev => prev.map(r => r.id === runId ? { ...r, note: note.trim() || null } : r));
      }
    } catch {}
  }, []);

  // Tags update
  const handleTagsUpdate = useCallback(async (runId: string, tags: string[]) => {
    try {
      const res = await fetch("/api/history/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, tags }),
      });
      if (res.ok) {
        const data = await res.json();
        setRuns(prev => prev.map(r => r.id === runId ? { ...r, tags: JSON.stringify(data.tags) } : r));
      }
    } catch {}
  }, []);

  // Archive/unarchive
  const handleArchive = useCallback(async (runIds: string[], archived: boolean) => {
    try {
      const res = await fetch("/api/history/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runIds, archived }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setBulkMode(false);
        fetchRuns();
      }
    } catch {}
  }, [fetchRuns]);

  // Delete
  const handleDelete = useCallback(async (runIds: string[]) => {
    try {
      const res = await fetch("/api/history/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runIds }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setBulkMode(false);
        setDeleteConfirm(null);
        fetchRuns();
      }
    } catch {}
  }, [fetchRuns]);

  // CSV Export
  const handleExport = useCallback(async () => {
    const ids = bulkMode && selectedIds.size > 0
      ? Array.from(selectedIds)
      : runs.map(r => r.id);
    if (ids.length === 0) return;
    const url = `/api/history/export?runIds=${ids.join(",")}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `analysis-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [runs, bulkMode, selectedIds]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === runs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(runs.map(r => r.id)));
    }
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
  };

  const selectedRuns = runs.filter(r => selectedIds.has(r.id));
  const hasArchivedSelected = selectedRuns.some(r => r.archived);
  const hasActiveSelected = selectedRuns.some(r => !r.archived);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-[11px] font-semibold tracking-wider" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
          ANALYSIS HISTORY
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[9px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {loading ? "..." : `${runs.length} run${runs.length !== 1 ? "s" : ""}`}
            {statusTab !== "all" && ` · ${statusTab}`}
            {debouncedQuery && ` · "${debouncedQuery}"`}
            {activeTag && ` · #${activeTag}`}
          </span>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-2">
        {/* Search */}
        <div
          className="flex-1 flex items-center rounded-md border px-2.5 py-1.5"
          style={{ backgroundColor: "var(--bg-input, var(--bg-secondary))", borderColor: "var(--border-default)" }}
        >
          <svg className="w-3 h-3 mr-2 shrink-0" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creators, labels..."
            className="flex-1 bg-transparent text-[10px] outline-none placeholder:opacity-30"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[10px] ml-1 px-1 rounded hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 items-center">
          {(["all", "complete", "partial", "error"] as StatusTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className="text-[10px] px-2 py-1.5 rounded-md font-medium tracking-wider transition-all"
              style={{
                backgroundColor: statusTab === tab ? "var(--bg-elevated)" : "transparent",
                color: statusTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {tab.toUpperCase()}
              <span className="ml-1" style={{ opacity: 0.5 }}>
                {tab === "all" ? statusCounts.all :
                 tab === "complete" ? statusCounts.complete :
                 tab === "partial" ? statusCounts.partial :
                 statusCounts.error}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tag Filter Chips */}
      {allTags.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className="text-[8px] px-1.5 py-0.5 rounded-full transition-all"
              style={{
                backgroundColor: activeTag === tag ? "rgba(59,130,246,0.15)" : "var(--bg-elevated)",
                color: activeTag === tag ? "#3b82f6" : "var(--text-muted)",
                border: activeTag === tag ? "1px solid rgba(59,130,246,0.4)" : "1px solid var(--border-subtle)",
                fontFamily: "var(--font-mono)",
              }}
            >
              #{tag}
            </button>
          ))}
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="text-[8px] px-1.5 py-0.5 rounded-full transition-all hover:opacity-80"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              ✕ clear
            </button>
          )}
        </div>
      )}

      {/* Secondary Controls: Archive toggle + Bulk mode + Export */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Show archived toggle */}
          <button
            data-no-press
            onClick={() => setShowArchived(!showArchived)}
            className="text-[10px] px-2.5 py-1 rounded transition-colors"
            style={{
              backgroundColor: showArchived ? "rgba(217,119,6,0.1)" : "transparent",
              color: showArchived ? "#d97706" : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              border: showArchived ? "1px solid rgba(217,119,6,0.3)" : "1px solid transparent",
            }}
          >
            {showArchived ? "⦿ SHOWING ARCHIVED" : "○ SHOW ARCHIVED"}
          </button>

          {/* Bulk select toggle */}
          {runs.length > 0 && !bulkMode && (
            <button
              data-no-press
              onClick={() => setBulkMode(true)}
              className="text-[10px] px-2.5 py-1 rounded transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              SELECT
            </button>
          )}

          {/* Export */}
          {runs.length > 0 && (
            <button
              data-no-press
              onClick={handleExport}
              className="text-[10px] px-2.5 py-1 rounded transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              ↓ EXPORT CSV
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {bulkMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-[9px] px-2 py-1 rounded transition-all hover:opacity-80"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
            >
              {selectedIds.size === runs.length ? "DESELECT ALL" : "SELECT ALL"}
            </button>
            {selectedIds.size > 0 && (
              <>
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                  {selectedIds.size} selected
                </span>
                {hasActiveSelected && (
                  <button
                    onClick={() => handleArchive(Array.from(selectedIds), true)}
                    className="text-[9px] px-2 py-1 rounded transition-all hover:opacity-80"
                    style={{ color: "#d97706", fontFamily: "var(--font-mono)", backgroundColor: "rgba(217,119,6,0.08)" }}
                  >
                    ARCHIVE
                  </button>
                )}
                {hasArchivedSelected && (
                  <button
                    onClick={() => handleArchive(Array.from(selectedIds), false)}
                    className="text-[9px] px-2 py-1 rounded transition-all hover:opacity-80"
                    style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)", backgroundColor: "var(--accent-green-glow)" }}
                  >
                    UNARCHIVE
                  </button>
                )}
                <button
                  onClick={handleExport}
                  className="text-[9px] px-2 py-1 rounded transition-all hover:opacity-80"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", backgroundColor: "var(--bg-elevated)" }}
                >
                  ↓ EXPORT
                </button>
                <button
                  onClick={() => setDeleteConfirm(Array.from(selectedIds))}
                  className="text-[9px] px-2 py-1 rounded transition-all hover:opacity-80"
                  style={{ color: "var(--accent-pink)", fontFamily: "var(--font-mono)", backgroundColor: "rgba(236,72,153,0.08)" }}
                >
                  DELETE
                </button>
              </>
            )}
            <button
              onClick={exitBulkMode}
              className="text-[9px] px-1 py-1 rounded transition-all hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Run List */}
      {loading ? (
        <div className="space-y-1.5">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} lines={1} />)}
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-md border p-6 text-center" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}>
          <div className="w-6 h-6 rounded mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: "var(--bg-elevated)" }}>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>∅</span>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {debouncedQuery || statusTab !== "all" || activeTag
              ? "No runs match your filters"
              : showArchived
                ? "No runs yet"
                : "No active runs"}
          </p>
          {(debouncedQuery || statusTab !== "all" || activeTag) && (
            <button
              onClick={() => { setSearchQuery(""); setStatusTab("all"); setActiveTag(null); }}
              className="text-[10px] mt-2 transition-all hover:opacity-80"
              style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
            >
              Clear filters
            </button>
          )}
          {!debouncedQuery && statusTab === "all" && !showArchived && !activeTag && (
            <p className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>Run your first batch to see history here</p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {runs.map(run => (
            <RunCard
              key={run.id}
              run={run}
              bulkMode={bulkMode}
              selected={selectedIds.has(run.id)}
              onToggleSelect={() => toggleSelect(run.id)}
              onNoteUpdate={handleNoteUpdate}
              onTagsUpdate={handleTagsUpdate}
              onTagClick={(tag) => setActiveTag(activeTag === tag ? null : tag)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          count={deleteConfirm.length}
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Run Card
// ---------------------------------------------------------------------------

function RunCard({
  run,
  bulkMode,
  selected,
  onToggleSelect,
  onNoteUpdate,
  onTagsUpdate,
  onTagClick,
}: {
  run: HistoryRun;
  bulkMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onNoteUpdate: (id: string, note: string) => void;
  onTagsUpdate: (id: string, tags: string[]) => void;
  onTagClick: (tag: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(run.note || "");
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const noteInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const inputHandles = parseHandles(run.inputSummary);
  const tags = parseTags(run.tags);

  const handleNoteSave = () => {
    setEditingNote(false);
    if (noteValue.trim() !== (run.note || "")) {
      onNoteUpdate(run.id, noteValue.trim());
    }
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleNoteSave();
    if (e.key === "Escape") { setNoteValue(run.note || ""); setEditingNote(false); }
  };

  const handleAddTag = () => {
    const newTag = tagInput.trim().toLowerCase();
    if (newTag && !tags.includes(newTag)) {
      onTagsUpdate(run.id, [...tags, newTag]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    onTagsUpdate(run.id, tags.filter(t => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); handleAddTag(); }
    if (e.key === "Escape") { setTagInput(""); setEditingTags(false); }
    if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      handleRemoveTag(tags[tags.length - 1]);
    }
  };

  useEffect(() => {
    if (editingNote && noteInputRef.current) noteInputRef.current.focus();
  }, [editingNote]);

  useEffect(() => {
    if (editingTags && tagInputRef.current) tagInputRef.current.focus();
  }, [editingTags]);

  return (
    <div
      className="rounded-md border transition-all group"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: selected ? "var(--accent-green)" : "var(--border-subtle)",
        opacity: run.archived ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = "var(--border-strong)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
    >
      {/* Top-level horizontal flex: checkbox column (full height) + content column */}
      <div className="flex items-stretch">
        {/* Checkbox column — spans full card height */}
        {bulkMode && (
          <button
            data-no-press
            onClick={onToggleSelect}
            className="flex items-center justify-center w-10 shrink-0 rounded-l-md transition-colors"
            style={{ backgroundColor: selected ? "rgba(52,211,153,0.06)" : "transparent" }}
          >
            <div
              className="w-3.5 h-3.5 rounded-sm border-[1.5px] flex items-center justify-center transition-colors"
              style={{
                borderColor: selected ? "var(--accent-green)" : "var(--border-default)",
                backgroundColor: selected ? "var(--accent-green)" : "transparent",
              }}
            >
              {selected && (
                <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="var(--bg-primary)" strokeWidth={2.5}>
                  <path d="M3 6l2 2 4-4" />
                </svg>
              )}
            </div>
          </button>
        )}

        {/* Content column — main info + tags/notes */}
        <div className="flex-1 min-w-0">
          {/* Main Row */}
          <a
            href={`/history/${run.id}`}
            className="block px-3 py-2"
            onClick={(e) => { if (bulkMode) { e.preventDefault(); onToggleSelect(); } }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <StatusBadge status={run.status} label={run.status.toUpperCase()} size="xs" />
                <span className="text-[10px] font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {run.totalRows} creator{run.totalRows !== 1 ? "s" : ""}
                </span>
                <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>·</span>
                <span className="text-[9px]" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                  {run.completeRows} ok
                </span>
                {run.errorRows > 0 && (
                  <span className="text-[9px]" style={{ color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}>
                    {run.errorRows} err
                  </span>
                )}
                {run.archived && (
                  <span className="text-[8px] px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(217,119,6,0.1)", color: "#d97706", fontFamily: "var(--font-mono)" }}>
                    ARCHIVED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {run.completedAt && (
                  <span className="text-[8px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {duration(run.startedAt, run.completedAt)}
                  </span>
                )}
                <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>
                  {relativeDate(run.startedAt)}
                </span>
                <span className="text-[8px] hidden sm:inline" style={{ color: "var(--text-muted)" }}>
                  {run.userName}
                </span>
                {!bulkMode && (
                  <span className="text-[9px] opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--text-muted)" }}>→</span>
                )}
              </div>
            </div>

            {/* Creator handles */}
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {inputHandles.slice(0, 10).map((h, i) => (
                <span
                  key={i}
                  className="text-[8px] px-1 py-0.5 rounded"
                  style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", border: "1px solid var(--border-subtle)" }}
                >
                  {h.label || h.instagram || h.tiktok || "—"}
                </span>
              ))}
              {inputHandles.length > 10 && (
                <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>+{inputHandles.length - 10}</span>
              )}
            </div>
          </a>

          {/* Tags + Note Row */}
          <div
            className="px-3 pb-2 flex items-center gap-1.5 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tags */}
            {tags.map(tag => (
              <span
                key={tag}
                className="text-[8px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 cursor-pointer"
                style={{
                  backgroundColor: "rgba(59,130,246,0.08)",
                  color: "#3b82f6",
                  fontFamily: "var(--font-mono)",
                  border: "1px solid rgba(59,130,246,0.2)",
                }}
              >
                <span onClick={() => onTagClick(tag)}>#{tag}</span>
                {editingTags && (
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-0.5 hover:opacity-60"
                    style={{ color: "#3b82f6" }}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}

            {/* Tag editor */}
            {editingTags ? (
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, ""))}
                onBlur={() => { handleAddTag(); setEditingTags(false); }}
                onKeyDown={handleTagKeyDown}
                placeholder="add tag..."
                className="text-[8px] bg-transparent outline-none px-1 py-0.5 rounded border w-16"
                style={{ color: "#3b82f6", fontFamily: "var(--font-mono)", borderColor: "rgba(59,130,246,0.3)" }}
              />
            ) : (
              <button
                onClick={() => setEditingTags(true)}
                className="text-[8px] px-1 py-0.5 rounded transition-all cursor-pointer"
                style={{
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  opacity: tags.length > 0 ? 0.5 : 0,
                  background: "none",
                  border: "none",
                }}
                data-tag-trigger
              >
                ＋ tag
              </button>
            )}

            <span className="mx-0.5" />

            {/* Note */}
            {editingNote ? (
              <input
                ref={noteInputRef}
                type="text"
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                onBlur={handleNoteSave}
                onKeyDown={handleNoteKeyDown}
                placeholder="Add a note..."
                className="flex-1 text-[9px] bg-transparent outline-none px-1 py-0.5 rounded border"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", borderColor: "var(--border-default)" }}
              />
            ) : (
              <button
                onClick={() => setEditingNote(true)}
                className="text-[9px] px-1 py-0.5 rounded transition-all hover:opacity-80 cursor-pointer text-left"
                style={{
                  color: run.note ? "var(--text-secondary)" : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  opacity: run.note ? 1 : 0,
                  background: "none",
                  border: "none",
                  padding: 0,
                }}
                data-note-trigger
              >
                {run.note || "＋ note"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .group:hover [data-note-trigger],
        .group:hover [data-tag-trigger] {
          opacity: 0.5 !important;
        }
        .group:hover [data-note-trigger]:hover,
        .group:hover [data-tag-trigger]:hover {
          opacity: 0.8 !important;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Modal
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
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
            DELETE {count > 1 ? `${count} RUNS` : "RUN"}
          </h3>
        </div>
        <p className="text-[11px] mb-4" style={{ color: "var(--text-secondary)" }}>
          This will permanently delete {count > 1 ? `${count} analysis runs` : "this analysis run"} and all associated data.
          This action cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-[10px] px-3 py-1.5 rounded-md transition-all hover:opacity-80"
            style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", fontFamily: "var(--font-mono)" }}
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="text-[10px] px-3 py-1.5 rounded-md transition-all hover:opacity-80"
            style={{ color: "#fff", backgroundColor: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}
          >
            DELETE {count > 1 ? `${count} RUNS` : "RUN"}
          </button>
        </div>
      </div>
    </div>
  );
}
