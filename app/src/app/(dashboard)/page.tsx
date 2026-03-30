"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  PlatformAnalysis,
  Platform,
} from "@/lib/domain/types";
import type {
  BatchImportRow,
  BatchHandleJob,
  BatchRowResult,
  BatchRunSummary,
  BatchWorkspacePhase,
  BatchValidationError,
} from "@/lib/domain/batch-types";
import { parseBatchInput } from "@/lib/domain/batch-parser";
import {
  runBatchQueue,
  composeRowResult,
  computeBatchSummary,
  type BatchQueueHandle,
} from "@/lib/domain/batch-queue";
import { signOut } from "@/lib/auth/client";
import { AuthSpinner } from "@/app/components/ui/Skeleton";
import { PendingApprovalScreen } from "./workspace/PendingApprovalScreen";
import { TeamSelectScreen } from "./workspace/TeamSelectScreen";
import { BatchIntakePanel } from "./workspace/BatchIntakePanel";
import { BatchProgressStrip } from "./workspace/BatchProgressStrip";
import { BatchResultMatrix } from "./workspace/BatchResultMatrix";
import { SelectedRowDetail } from "./workspace/SelectedRowDetail";


// ---------------------------------------------------------------------------
// Fetch function for batch queue
// ---------------------------------------------------------------------------

async function fetchPlatformAnalysis(
  platform: Platform,
  username: string,
  signal?: AbortSignal,
  pairedWith?: string
): Promise<PlatformAnalysis> {
  const res = await fetch("/api/analyze-single", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, username, ...(pairedWith ? { pairedWith } : {}) }),
    signal,
  });

  // Parse body regardless of HTTP status — API sends PlatformAnalysis on 502 too
  const result: PlatformAnalysis = await res.json().catch(() => null);

  // HTTP-level failure without a parseable body
  if (!result) {
    throw new Error(`HTTP ${res.status}`);
  }

  // Defense-in-depth: check logical error status even if HTTP was 200
  if (result.status === "error") {
    throw new Error(result.error || "Platform analysis failed");
  }

  return result;
}

// ---------------------------------------------------------------------------
// MAIN PAGE — Auth-Gated Batch Workspace
// ---------------------------------------------------------------------------

type SortField = "index" | "label" | "igFollowers" | "tkFollowers" | "organicAvg" | "commercialAvg" | "ratio" | "status";
type SortDir = "asc" | "desc";

type StatusFilter = "all" | "complete" | "partial" | "error" | "running" | "queued";

// ---------------------------------------------------------------------------
// Module-level auth cache — instant render on revisit, no AuthSpinner flash
// ---------------------------------------------------------------------------
type AuthMeData = {
  name: string;
  approvalStatus: string;
  isSystemAdmin: boolean;
  team: { teamId: string; role: string; teamName: string } | null;
  hasPendingTeamRequest?: boolean;
};
let _authMeCache: AuthMeData | null = null;
let _authMePromise: Promise<AuthMeData | null> | null = null;

function getAuthMe(forceRefresh = false): Promise<AuthMeData | null> {
  if (!forceRefresh && _authMePromise) return _authMePromise;
  _authMePromise = fetch("/api/auth/me")
    .then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      _authMeCache = data;
      return data as AuthMeData;
    })
    .catch(() => _authMeCache)
    .finally(() => {
      setTimeout(() => { _authMePromise = null; }, 60_000);
    });
  return _authMePromise;
}

function resolveAuthFromData(data: AuthMeData | null): {
  state: "unauthenticated" | "pending" | "approved-no-team" | "team-pending" | "authorized";
  team: { teamId: string; role: string } | null;
  isSystemAdmin: boolean;
  userName: string;
  teamName: string;
} {
  if (!data) return { state: "unauthenticated", team: null, isSystemAdmin: false, userName: "", teamName: "" };
  const userName = data.name || "";
  if (data.approvalStatus !== "approved") return { state: "pending", team: null, isSystemAdmin: false, userName, teamName: "" };
  if (data.isSystemAdmin) return { state: "authorized", team: data.team, isSystemAdmin: true, userName, teamName: data.team?.teamName || "Global Admin" };
  if (!data.team) {
    return data.hasPendingTeamRequest
      ? { state: "team-pending", team: null, isSystemAdmin: false, userName, teamName: "" }
      : { state: "approved-no-team", team: null, isSystemAdmin: false, userName, teamName: "" };
  }
  return { state: "authorized", team: data.team, isSystemAdmin: false, userName, teamName: data.team.teamName || "" };
}

export default function Home() {
  const router = useRouter();

  // Initialize from cache — no AuthSpinner flash on revisit
  const cachedAuth = _authMeCache ? resolveAuthFromData(_authMeCache) : null;

  // Auth state
  const [authState, setAuthState] = useState<"loading" | "unauthenticated" | "pending" | "approved-no-team" | "team-pending" | "authorized">(cachedAuth?.state ?? "loading");
  const [teamContext, setTeamContext] = useState<{ teamId: string; role: string } | null>(cachedAuth?.team ?? null);
  const [isSystemAdmin, setIsSystemAdmin] = useState(cachedAuth?.isSystemAdmin ?? false);
  const [userName, setUserName] = useState(cachedAuth?.userName ?? "");
  const [teamName, setTeamName] = useState(cachedAuth?.teamName ?? "");

  // Direct auth/me call — single network request, no serial waterfall
  useEffect(() => {
    let cancelled = false;
    getAuthMe().then((data) => {
      if (cancelled) return;
      const resolved = resolveAuthFromData(data);
      setAuthState(resolved.state);
      setTeamContext(resolved.team);
      setIsSystemAdmin(resolved.isSystemAdmin);
      setUserName(resolved.userName);
      setTeamName(resolved.teamName);
    });
    return () => { cancelled = true; };
  }, []);

  // Workspace state
  const [phase, setPhase] = useState<BatchWorkspacePhase>("intake");
  const [rawInput, setRawInput] = useState("");
  const [rows, setRows] = useState<BatchImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<BatchValidationError[]>([]);
  const [handleJobs, setHandleJobs] = useState<Map<string, BatchHandleJob>>(new Map());
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [updateTick, setUpdateTick] = useState(0);
  const queueHandleRef = useRef<BatchQueueHandle | null>(null);
  const batchStartRef = useRef<string>(new Date().toISOString());

  // Matrix controls
  const [sortField, setSortField] = useState<SortField>("index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Campaign integration
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [campaignList, setCampaignList] = useState<{ id: string; name: string; status: string; brandId: string | null }[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [campaignMsg, setCampaignMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newCampaignName, setNewCampaignName] = useState("");
  const lastSavedRunIdRef = useRef<string | null>(null);

  // Parse input on demand
  const handleParse = useCallback(() => {
    const result = parseBatchInput(rawInput);
    setRows(result.rows);
    setParseErrors(result.errors);
    return result;
  }, [rawInput]);

  // Start batch analysis
  const handleStartAnalysis = useCallback(() => {
    const result = parseBatchInput(rawInput);
    setRows(result.rows);
    setParseErrors(result.errors);

    if (result.rows.length === 0) return;

    const jobs = new Map<string, BatchHandleJob>();
    setHandleJobs(jobs);
    setPhase("processing");
    setSelectedRowId(null);

    // Build pair-lookup maps: for each handle, find the paired username on the other platform
    const pairLookup = new Map<string, string>();
    for (const row of result.rows) {
      if (row.instagramUsername && row.tiktokUsername) {
        // IG handle → paired TT username
        pairLookup.set(`instagram:${row.instagramUsername}`, row.tiktokUsername);
        // TT handle → paired IG username
        pairLookup.set(`tiktok:${row.tiktokUsername}`, row.instagramUsername);
      }
    }

    // Wrap fetchPlatformAnalysis with pair context
    const fetchWithPairContext = (platform: Platform, username: string, signal?: AbortSignal) => {
      const pairedWith = pairLookup.get(`${platform}:${username}`);
      return fetchPlatformAnalysis(platform, username, signal, pairedWith);
    };

    const queueHandle = runBatchQueue(
      result.rows,
      jobs,
      fetchWithPairContext,
      {
        onUpdate: () => {
          setHandleJobs(jobs);
          setUpdateTick((t) => t + 1);
        },
        onComplete: () => {
          setPhase("results");
          setUpdateTick((t) => t + 1);

          // Persist to team history — awaited with explicit error surfacing
          (async () => {
            try {
              const rowResults = result.rows.map((r) => composeRowResult(r, jobs));
              const summary = computeBatchSummary(result.rows, jobs);
              const inputSummary = result.rows.map((r) => ({
                instagram: r.instagramUsername,
                tiktok: r.tiktokUsername,
                label: r.label,
              }));

              const saveRes = await fetch("/api/history/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: summary.errorRows === summary.totalRows ? "error" :
                          summary.completeRows === summary.totalRows ? "complete" :
                          summary.partialRows > 0 || summary.errorRows > 0 ? "partial" : "complete",
                  totalRows: summary.totalRows,
                  completeRows: summary.completeRows,
                  partialRows: summary.partialRows,
                  errorRows: summary.errorRows,
                  inputSummary,
                  resultSnapshot: rowResults.map((rr) => ({
                    _v: 2,
                    row: { id: rr.row.id, instagramUsername: rr.row.instagramUsername, tiktokUsername: rr.row.tiktokUsername, label: rr.row.label },
                    status: rr.status,
                    instagram: rr.instagram ?? null,
                    tiktok: rr.tiktok ?? null,
                    warnings: rr.warnings,
                  })),
                  startedAt: batchStartRef.current,
                  schemaVersion: 2,
                }),
              });

              if (!saveRes.ok) {
                const errBody = await saveRes.json().catch(() => ({}));
                console.error("[history] Save failed:", saveRes.status, errBody);
              } else {
                const savedData = await saveRes.json().catch(() => ({}));
                if (savedData.runId) {
                  lastSavedRunIdRef.current = savedData.runId;
                }
              }
            } catch (err) {
              console.error("[history] Save error:", err);
            }

            // Auto-link influencer identities for rows with both platforms
            try {
              for (const rr of rowResults) {
                const ig = rr.row.instagramUsername;
                const tt = rr.row.tiktokUsername;
                if (ig && tt) {
                  await fetch("/api/warehouse/link", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ instagramUsername: ig, tiktokUsername: tt }),
                  });
                }
              }
            } catch {}
          })();
        },
      }
    );

    queueHandleRef.current = queueHandle;
  }, [rawInput]);

  // Cancel
  const handleCancel = useCallback(() => {
    queueHandleRef.current?.cancel();
    setPhase("results");
  }, []);

  // Reset to intake
  const handleReset = useCallback(() => {
    queueHandleRef.current?.cancel();
    setPhase("intake");
    setRows([]);
    setParseErrors([]);
    setHandleJobs(new Map());
    setSelectedRowId(null);
    setRawInput("");
    setUpdateTick(0);
  }, []);

  // Retry errors
  const handleRetryErrors = useCallback(() => {
    setPhase("processing");
    queueHandleRef.current?.retryErrors();
  }, []);

  // Computed row results
  const rowResults: BatchRowResult[] = useMemo(() => {
    void updateTick; // dependency
    return rows.map((row) => composeRowResult(row, handleJobs));
  }, [rows, handleJobs, updateTick]);

  // Computed summary
  const summary: BatchRunSummary = useMemo(() => {
    void updateTick;
    return computeBatchSummary(rows, handleJobs);
  }, [rows, handleJobs, updateTick]);

  // Filtered + sorted results
  const filteredResults = useMemo(() => {
    let results = rowResults;

    // Status filter
    if (statusFilter !== "all") {
      results = results.filter((r) => r.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      results = results.filter((r) =>
        (r.row.instagramUsername && r.row.instagramUsername.includes(q)) ||
        (r.row.tiktokUsername && r.row.tiktokUsername.includes(q)) ||
        (r.row.label && r.row.label.toLowerCase().includes(q))
      );
    }

    // Sort
    results = [...results].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "index":
          return (a.row.sourceRowIndex - b.row.sourceRowIndex) * dir;
        case "label":
          return ((a.row.label || "").localeCompare(b.row.label || "")) * dir;
        case "igFollowers":
          return ((a.instagram?.profile?.followerCount ?? 0) - (b.instagram?.profile?.followerCount ?? 0)) * dir;
        case "tkFollowers":
          return ((a.tiktok?.profile?.followerCount ?? 0) - (b.tiktok?.profile?.followerCount ?? 0)) * dir;
        case "organicAvg":
          return (((a.instagram?.organic?.averageViews ?? a.tiktok?.organic?.averageViews ?? 0) -
                   (b.instagram?.organic?.averageViews ?? b.tiktok?.organic?.averageViews ?? 0))) * dir;
        case "commercialAvg":
          return (((a.instagram?.commercial?.averageViews ?? a.tiktok?.commercial?.averageViews ?? 0) -
                   (b.instagram?.commercial?.averageViews ?? b.tiktok?.commercial?.averageViews ?? 0))) * dir;
        case "ratio":
          return (((a.instagram?.comparison?.adToOrganicRatio ?? a.tiktok?.comparison?.adToOrganicRatio ?? 0) -
                   (b.instagram?.comparison?.adToOrganicRatio ?? b.tiktok?.comparison?.adToOrganicRatio ?? 0))) * dir;
        case "status": {
          const order: Record<string, number> = { complete: 0, partial: 1, running: 2, queued: 3, error: 4 };
          return ((order[a.status] ?? 5) - (order[b.status] ?? 5)) * dir;
        }
        default:
          return 0;
      }
    });

    return results;
  }, [rowResults, statusFilter, searchQuery, sortField, sortDir]);

  // Selected row
  const selectedResult = useMemo(() => {
    if (!selectedRowId) return null;
    return rowResults.find((r) => r.row.id === selectedRowId) ?? null;
  }, [rowResults, selectedRowId]);

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // Controlled sign-out: clear session client-side, navigate to login
  const handleSignOut = useCallback(async () => {
    await signOut();
    setAuthState("unauthenticated");
    router.replace("/login");
  }, [router]);

  // Controlled re-check: re-fetch /api/auth/me without full page reload
  const handleRecheck = useCallback(() => {
    getAuthMe(true).then((data) => {
      const resolved = resolveAuthFromData(data);
      setAuthState(resolved.state);
      setTeamContext(resolved.team);
      setIsSystemAdmin(resolved.isSystemAdmin);
      setUserName(resolved.userName);
      setTeamName(resolved.teamName);
    });
  }, []);

  // ── Redirect unauthenticated users via effect (not during render) ────────
  useEffect(() => {
    if (authState === "unauthenticated") {
      router.replace("/login");
    }
  }, [authState, router]);

  // ── Auth gate ─────────────────────────────────────────────────────────────

  if (authState === "loading" || authState === "unauthenticated") {
    return <AuthSpinner />;
  }

  if (authState === "pending") {
    return <PendingApprovalScreen onSignOut={handleSignOut} />;
  }

  if (authState === "approved-no-team") {
    return <TeamSelectScreen onSignOut={handleSignOut} onRefresh={handleRecheck} />;
  }

  if (authState === "team-pending") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-center max-w-md animate-fade-in">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--accent-green-glow)", border: "1px solid var(--border-accent)" }}>
            <span className="text-lg">📋</span>
          </div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Awaiting Team Approval</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Your team join request is pending. A team admin must approve it before you can access the workspace.
          </p>
          <button
            onClick={handleRecheck}
            className="px-4 py-2 rounded-md text-xs font-medium mr-2"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
          >
            CHECK STATUS
          </button>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-md text-xs font-medium"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            SIGN OUT
          </button>
        </div>
      </div>
    );
  }

  // ── Authorized: render workspace ──────────────────────────────────────────

  return (
    <>
      <div>
        {phase !== "intake" && (
          <div className="mb-4">
            <button
              onClick={handleReset}
              className="text-[10px] px-3 py-1.5 rounded-md transition-all hover:opacity-80"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ← NEW BATCH
            </button>
          </div>
        )}
        {/* Intake Phase */}
        {phase === "intake" && (
          <BatchIntakePanel
            rawInput={rawInput}
            onInputChange={setRawInput}
            parseErrors={parseErrors}
            onParse={handleParse}
            onStart={handleStartAnalysis}
          />
        )}

        {/* Processing / Results Phase */}
        {(phase === "processing" || phase === "results") && (
          <>
            {/* Progress Strip */}
            <BatchProgressStrip
              summary={summary}
              phase={phase}
              onCancel={handleCancel}
              onRetryErrors={handleRetryErrors}
            />

            {/* Matrix Controls */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4 mt-4">
              <div
                className="flex-1 flex items-center rounded-md border px-3 py-2"
                style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)" }}
              >
                <svg className="w-3.5 h-3.5 mr-2 shrink-0" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search handles or labels..."
                  className="flex-1 bg-transparent text-xs outline-none placeholder:opacity-30"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["all", "complete", "partial", "running", "error"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className="text-[10px] px-2.5 py-1.5 rounded-md font-medium tracking-wider transition-all"
                    style={{
                      backgroundColor: statusFilter === f ? "var(--bg-elevated)" : "transparent",
                      color: statusFilter === f ? "var(--text-primary)" : "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {f.toUpperCase()}
                    {f !== "all" && (
                      <span className="ml-1" style={{ opacity: 0.5 }}>
                        {f === "complete" ? summary.completeRows :
                         f === "partial" ? summary.partialRows :
                         f === "running" ? summary.runningRows + summary.queuedRows :
                         f === "error" ? summary.errorRows : ""}
                      </span>
                    )}
                  </button>
                ))}
                {/* Save to Campaign — visible when batch is complete */}
                {phase === "results" && summary.completeRows > 0 && (
                  <button
                    onClick={async () => {
                      setShowCampaignPicker(true);
                      setCampaignMsg(null);
                      setCampaignLoading(true);
                      try {
                        const res = await fetch("/api/campaigns");
                        if (res.ok) {
                          const data = await res.json();
                          setCampaignList(data.campaigns || []);
                        }
                      } catch {}
                      setCampaignLoading(false);
                    }}
                    className="text-[10px] px-3 py-1.5 rounded-md font-medium tracking-wider transition-all hover:opacity-80 ml-2"
                    style={{
                      backgroundColor: "rgba(56,189,248,0.1)",
                      color: "var(--accent-blue)",
                      fontFamily: "var(--font-mono)",
                      border: "1px solid rgba(56,189,248,0.2)",
                    }}
                  >
                    + SAVE TO CAMPAIGN
                  </button>
                )}
              </div>
            </div>

            {/* Results Matrix */}
            <BatchResultMatrix
              results={filteredResults}
              selectedRowId={selectedRowId}
              onSelectRow={setSelectedRowId}
              sortField={sortField}
              sortDir={sortDir}
              onToggleSort={toggleSort}
            />

            {/* Selected Row Detail */}
            {selectedResult && (
              <SelectedRowDetail
                result={selectedResult}
                onClose={() => setSelectedRowId(null)}
                onRetryHandle={(platform, username) => {
                  queueHandleRef.current?.retryHandle(platform, username);
                }}
              />
            )}

            {/* Campaign Picker Modal */}
            {showCampaignPicker && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                onClick={() => setShowCampaignPicker(false)}
              >
                <div
                  className="rounded-lg border p-5 w-full max-w-md"
                  style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      SAVE TO CAMPAIGN
                    </span>
                    <button
                      onClick={() => setShowCampaignPicker(false)}
                      className="text-xs opacity-50 hover:opacity-100 transition-opacity"
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>

                  {campaignMsg && (
                    <div
                      className="rounded-md border px-3 py-2 mb-3 text-xs"
                      style={{
                        backgroundColor: campaignMsg.type === "success" ? "var(--accent-green-glow)" : "rgba(239,68,68,0.08)",
                        borderColor: campaignMsg.type === "success" ? "var(--accent-green)" : "rgba(239,68,68,0.2)",
                        color: campaignMsg.type === "success" ? "var(--accent-green)" : "var(--accent-pink)",
                      }}
                    >
                      {campaignMsg.text}
                    </div>
                  )}

                  {/* Existing campaigns */}
                  {campaignLoading ? (
                    <div className="text-center py-6 text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      Loading campaigns…
                    </div>
                  ) : (
                    <>
                      {campaignList.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] tracking-wider mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                            ADD TO EXISTING CAMPAIGN
                          </p>
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {campaignList.filter(c => c.status !== "archived" && c.status !== "completed").map((camp) => (
                              <button
                                key={camp.id}
                                disabled={campaignSaving}
                                onClick={async () => {
                                  setCampaignSaving(true);
                                  setCampaignMsg(null);
                                  try {
                                    const creators = rowResults
                                      .filter((r) => r.status === "complete" || r.status === "partial")
                                      .map((r) => ({
                                        instagramHandle: r.row.instagramUsername || null,
                                        tiktokHandle: r.row.tiktokUsername || null,
                                        label: r.row.label || r.row.instagramUsername || r.row.tiktokUsername || null,
                                        role: "primary" as const,
                                        analysisRunId: lastSavedRunIdRef.current,
                                      }));
                                    const res = await fetch(`/api/campaigns/${camp.id}/creators`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ creators }),
                                    });
                                    if (res.ok) {
                                      const data = await res.json();
                                      setCampaignMsg({ type: "success", text: `${data.added} creator(s) added to "${camp.name}"` });
                                    } else {
                                      const err = await res.json().catch(() => ({}));
                                      setCampaignMsg({ type: "error", text: err.error || "Failed to add creators" });
                                    }
                                  } catch {
                                    setCampaignMsg({ type: "error", text: "Network error" });
                                  }
                                  setCampaignSaving(false);
                                }}
                                className="w-full text-left flex items-center justify-between px-3 py-2 rounded-md border transition-all hover:opacity-80"
                                style={{
                                  backgroundColor: "var(--bg-secondary)",
                                  borderColor: "var(--border-subtle)",
                                  cursor: campaignSaving ? "wait" : "pointer",
                                  opacity: campaignSaving ? 0.6 : 1,
                                }}
                              >
                                <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                                  {camp.name}
                                </span>
                                <span className="text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                  {camp.status.toUpperCase()}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Quick-create new campaign */}
                      <div className="pt-3" style={{ borderTop: campaignList.length > 0 ? "1px solid var(--border-subtle)" : "none" }}>
                        <p className="text-[10px] tracking-wider mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          OR CREATE NEW CAMPAIGN
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newCampaignName}
                            onChange={(e) => setNewCampaignName(e.target.value)}
                            placeholder="Campaign name…"
                            className="flex-1 rounded-md border px-2.5 py-2 text-xs bg-transparent"
                            style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                          />
                          <button
                            disabled={!newCampaignName.trim() || campaignSaving}
                            onClick={async () => {
                              if (!newCampaignName.trim()) return;
                              setCampaignSaving(true);
                              setCampaignMsg(null);
                              try {
                                // 1. Create campaign
                                const createRes = await fetch("/api/campaigns", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: newCampaignName.trim() }),
                                });
                                if (!createRes.ok) {
                                  const err = await createRes.json().catch(() => ({}));
                                  setCampaignMsg({ type: "error", text: err.error || "Failed to create campaign" });
                                  setCampaignSaving(false);
                                  return;
                                }
                                const newCamp = await createRes.json();

                                // 2. Add creators
                                const creators = rowResults
                                  .filter((r) => r.status === "complete" || r.status === "partial")
                                  .map((r) => ({
                                    instagramHandle: r.row.instagramUsername || null,
                                    tiktokHandle: r.row.tiktokUsername || null,
                                    label: r.row.label || r.row.instagramUsername || r.row.tiktokUsername || null,
                                    role: "primary" as const,
                                    analysisRunId: lastSavedRunIdRef.current,
                                  }));
                                const addRes = await fetch(`/api/campaigns/${newCamp.id}/creators`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ creators }),
                                });
                                if (addRes.ok) {
                                  const data = await addRes.json();
                                  setCampaignMsg({ type: "success", text: `Campaign "${newCamp.name}" created with ${data.added} creator(s)` });
                                  setNewCampaignName("");
                                  // Refresh list
                                  const listRes = await fetch("/api/campaigns");
                                  if (listRes.ok) {
                                    const listData = await listRes.json();
                                    setCampaignList(listData.campaigns || []);
                                  }
                                } else {
                                  setCampaignMsg({ type: "success", text: `Campaign "${newCamp.name}" created (creators may need to be added manually)` });
                                }
                              } catch {
                                setCampaignMsg({ type: "error", text: "Network error" });
                              }
                              setCampaignSaving(false);
                            }}
                            className="px-3 py-2 rounded-md text-[10px] font-medium tracking-wider"
                            style={{
                              backgroundColor: newCampaignName.trim() ? "var(--accent-green)" : "var(--bg-elevated)",
                              color: newCampaignName.trim() ? "var(--text-inverse)" : "var(--text-muted)",
                              fontFamily: "var(--font-mono)",
                              border: "none",
                              cursor: newCampaignName.trim() ? "pointer" : "default",
                              opacity: campaignSaving ? 0.6 : 1,
                            }}
                          >
                            {campaignSaving ? "…" : "CREATE + ADD"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </>
  );
}

// All workspace components (SystemGuideModal, BatchIntakePanel, BatchProgressStrip,
// BatchResultMatrix, SelectedRowDetail, BenchmarkDisplay, VisibilityIntelligencePanel,
// BudgetWorkbench) have been extracted to ./workspace/*.tsx
