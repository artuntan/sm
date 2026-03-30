"use client";

import { useState, useCallback, useMemo, useRef, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  BenchmarkBucket,
  ClassifiedReel,
  ClassifiedItem,
  ComparisonMetrics,
  PlatformAnalysis,
  ProfileSummary,
  ProviderSource,
  StoryVisibility,
  CarouselVisibility,
  DeliverableType,
  ImpressionForecast,
  DeliverableCpmAnalysis,
  DeliverableQuote,
  QuoteSourceMode,
  Platform,
} from "@/lib/domain/types";
import {
  DELIVERABLE_LABELS,
  moneyWithFx,
  forecastImpressions,
  computeDeliverableCpm,
  CURRENCY_SYMBOLS,
  FX_RATES_TO_USD,
  FX_SNAPSHOT_DATE,
  FX_BENCHMARK_CURRENCY,
  type ForecastSignals,
} from "@/lib/domain/budget-cpm";
import type {
  BatchImportRow,
  BatchHandleJob,
  BatchRowResult,
  BatchRunSummary,
  BatchWorkspacePhase,
  BatchValidationError,
} from "@/lib/domain/batch-types";
import { parseBatchInput, extractUniqueHandles } from "@/lib/domain/batch-parser";
import {
  runBatchQueue,
  composeRowResult,
  computeBatchSummary,
  handleKey,
  type BatchQueueHandle,
} from "@/lib/domain/batch-queue";
import { signOut } from "@/lib/auth/client";
import { AuthSpinner } from "@/app/components/ui/Skeleton";
import { Modal } from "@/app/components/ui/Modal";


// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function truncate(text: string | null, max = 80): string {
  if (!text) return "No caption";
  return text.length <= max ? text : text.slice(0, max) + "…";
}

function sourceLabel(source: ProviderSource): string {
  const map: Record<string, string> = {
    meta: "Meta API",
    mock: "Mock",
    "instagram-apify": "Apify Fallback",
    "tiktok-research": "Research API",
    "tiktok-apify": "Apify Live",
    "tiktok-mock": "Mock",
  };
  return map[source] || source;
}

function categoryLabel(
  cat: ClassifiedReel["classificationCategory"] | ClassifiedItem["classificationCategory"]
): string {
  const map: Record<string, string> = {
    explicit_disclosure: "Disclosure",
    brand_campaign: "Campaign",
    brand_affiliation: "Brand Affil.",
    brand_mention: "Brand Mention",
    branded_hashtag: "Branded Tag",
    branded_promo_copy: "Promo Copy",
    paid_partnership_tag: "Paid Partner",
  };
  return (cat && map[cat]) || "Commercial";
}

// ---------------------------------------------------------------------------
// Fetch function for batch queue
// ---------------------------------------------------------------------------

async function fetchPlatformAnalysis(
  platform: Platform,
  username: string,
  signal?: AbortSignal
): Promise<PlatformAnalysis> {
  const res = await fetch("/api/analyze-single", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, username }),
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
// Auth gate screens
// ---------------------------------------------------------------------------

function PendingApprovalScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="text-center max-w-md animate-fade-in">
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--accent-green-glow)", border: "1px solid var(--border-accent)" }}>
          <span className="text-lg">⏳</span>
        </div>
        <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Awaiting Approval</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Your account has been created. A system administrator must approve your access before you can use the workspace.
        </p>
        <button
          onClick={onSignOut}
          className="px-4 py-2 rounded-md text-xs font-medium"
          style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
        >
          SIGN OUT
        </button>
      </div>
    </div>
  );
}

function TeamSelectScreen({ onSignOut, onRefresh }: { onSignOut: () => void; onRefresh: () => void }) {
  const [teams, setTeams] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requested, setRequested] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teams").then(r => r.json()).then(d => {
      setTeams(d.teams || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleJoinRequest = async (teamId: string) => {
    setRequesting(teamId);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    if (res.ok) {
      setRequested(teamId);
    }
    setRequesting(null);
  };

  if (requested) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-center max-w-md animate-fade-in">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--accent-green-glow)", border: "1px solid var(--border-accent)" }}>
            <span className="text-lg">📋</span>
          </div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Request Submitted</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Your team join request has been submitted. A team admin must approve it before you can access the workspace.
          </p>
          <button
            onClick={onRefresh}
            className="px-4 py-2 rounded-md text-xs font-medium"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
          >
            CHECK STATUS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Select Team</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Choose a team to join. A team admin must approve your request.
          </p>
        </div>
        {loading ? (
          <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading teams...</p>
        ) : (
          <div className="space-y-3">
            {teams.map(t => (
              <div
                key={t.id}
                className="rounded-md border p-4 flex items-center justify-between"
                style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{t.slug}</p>
                </div>
                <button
                  onClick={() => handleJoinRequest(t.id)}
                  disabled={requesting === t.id}
                  className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    backgroundColor: "var(--accent-green)",
                    color: "var(--text-inverse)",
                    fontFamily: "var(--font-mono)",
                    opacity: requesting === t.id ? 0.6 : 1,
                  }}
                >
                  {requesting === t.id ? "REQUESTING..." : "REQUEST ACCESS"}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="text-center mt-4">
          <button
            onClick={onSignOut}
            className="text-xs" style={{ color: "var(--text-muted)" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
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

    const queueHandle = runBatchQueue(
      result.rows,
      jobs,
      fetchPlatformAnalysis,
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
                  fetch("/api/warehouse/link", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ instagramUsername: ig, tiktokUsername: tt }),
                  }).catch(() => {}); // fire-and-forget
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

// ---------------------------------------------------------------------------
// System Guide Modal — Animated SVG walkthrough
// ---------------------------------------------------------------------------

const GUIDE_STEPS = [
  {
    id: "input",
    num: "01",
    title: "Input",
    subtitle: "Paste creator handles",
    desc: "Paste rows from a spreadsheet or type comma-separated handles. Each row maps one creator across Instagram and TikTok.",
    svg: "input" as const,
  },
  {
    id: "validate",
    num: "02",
    title: "Validate",
    subtitle: "Parse & deduplicate",
    desc: "The system parses your input, strips formatting artifacts, deduplicates handles, and flags rows with structural errors before any API call.",
    svg: "validate" as const,
  },
  {
    id: "fetch",
    num: "03",
    title: "Fetch",
    subtitle: "Platform data retrieval",
    desc: "Parallel requests pull profile metadata, recent posts, and engagement data from Instagram and TikTok APIs with automatic fallback providers.",
    svg: "fetch" as const,
  },
  {
    id: "benchmark",
    num: "04",
    title: "Benchmark",
    subtitle: "Score & classify",
    desc: "Each post is classified as organic or commercial. View-based benchmarks and ad-to-organic ratios are computed per creator for reliable comparison.",
    svg: "benchmark" as const,
  },
  {
    id: "review",
    num: "05",
    title: "Review",
    subtitle: "Results matrix",
    desc: "A sortable, filterable matrix shows every creator with per-platform metrics, status indicators, and drill-down detail panels for deep review.",
    svg: "review" as const,
  },
];

function GuideSvgInput() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Data rows flowing into input port */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect
            x={8} y={8 + i * 18} width={60} height={10} rx={2}
            fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={0.5}
            style={{ animation: `guide-fade-in-up 0.3s ease-out ${i * 0.12}s both` }}
          />
          <rect
            x={12} y={11 + i * 18} width={20} height={4} rx={1}
            fill="var(--accent-green)" opacity={0.5}
            style={{ animation: `guide-fade-in-up 0.3s ease-out ${i * 0.12 + 0.08}s both` }}
          />
          <rect
            x={36} y={11 + i * 18} width={28} height={4} rx={1}
            fill="var(--accent-blue)" opacity={0.3}
            style={{ animation: `guide-fade-in-up 0.3s ease-out ${i * 0.12 + 0.12}s both` }}
          />
        </g>
      ))}
      {/* Arrow / flow line */}
      <line x1={78} y1={40} x2={110} y2={40} stroke="var(--accent-green)" strokeWidth={1} strokeDasharray="4 3"
        pathLength={1}
        style={{ animation: "guide-draw 0.8s ease-out 0.5s both", strokeDashoffset: 1 }}
      />
      <polygon points="108,36 116,40 108,44" fill="var(--accent-green)" opacity={0.7}
        style={{ animation: "guide-fade-in-up 0.2s ease-out 1s both" }}
      />
      {/* Input port */}
      <rect x={120} y={20} width={68} height={40} rx={4}
        fill="var(--bg-card)" stroke="var(--border-default)" strokeWidth={1}
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.6s both" }}
      />
      <text x={154} y={38} textAnchor="middle" fill="var(--text-muted)" fontSize={8} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.8s both" }}
      >INTAKE</text>
      <text x={154} y={50} textAnchor="middle" fill="var(--accent-green)" fontSize={7} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.9s both" }}
      >READY</text>
    </svg>
  );
}

function GuideSvgValidate() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Grid rows being scanned */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect
            x={16} y={10 + i * 16} width={80} height={10} rx={2}
            fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth={0.5}
            style={{ animation: `guide-fade-in-up 0.2s ease-out ${i * 0.1}s both` }}
          />
          {/* Checkmark or X */}
          {i < 3 ? (
            <path
              d={`M${104},${13 + i * 16} l3,3 l5,-5`}
              stroke="var(--accent-green)" strokeWidth={1.5} fill="none" strokeLinecap="round"
              style={{ animation: `guide-fade-in-up 0.2s ease-out ${0.4 + i * 0.15}s both` }}
            />
          ) : (
            <g style={{ animation: `guide-fade-in-up 0.2s ease-out ${0.4 + i * 0.15}s both` }}>
              <line x1={104} y1={12 + i * 16} x2={110} y2={18 + i * 16} stroke="var(--accent-pink)" strokeWidth={1.5} strokeLinecap="round" />
              <line x1={110} y1={12 + i * 16} x2={104} y2={18 + i * 16} stroke="var(--accent-pink)" strokeWidth={1.5} strokeLinecap="round" />
            </g>
          )}
        </g>
      ))}
      {/* Scan line */}
      <line x1={14} x2={114} y1={0} y2={0} stroke="var(--accent-green)" strokeWidth={1} opacity={0.4}
        style={{ animation: "guide-scan 2s ease-in-out infinite" }}
      />
      {/* Summary output */}
      <rect x={130} y={18} width={56} height={44} rx={3}
        fill="var(--bg-card)" stroke="var(--border-default)" strokeWidth={1}
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.6s both" }}
      />
      <text x={158} y={36} textAnchor="middle" fill="var(--accent-green)" fontSize={14} fontFamily="var(--font-mono)" fontWeight="bold"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.8s both" }}
      >3</text>
      <text x={158} y={50} textAnchor="middle" fill="var(--text-muted)" fontSize={7} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.9s both" }}
      >VALID</text>
    </svg>
  );
}

function GuideSvgFetch() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Central node */}
      <rect x={80} y={25} width={40} height={30} rx={4}
        fill="var(--bg-card)" stroke="var(--accent-green)" strokeWidth={1} opacity={0.8}
      />
      <text x={100} y={43} textAnchor="middle" fill="var(--accent-green)" fontSize={7} fontFamily="var(--font-mono)">QUEUE</text>
      {/* IG endpoint */}
      <rect x={8} y={8} width={50} height={22} rx={3}
        fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={0.5}
      />
      <text x={33} y={22} textAnchor="middle" fill="var(--accent-blue)" fontSize={7} fontFamily="var(--font-mono)">IG API</text>
      {/* TK endpoint */}
      <rect x={8} y={50} width={50} height={22} rx={3}
        fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={0.5}
      />
      <text x={33} y={64} textAnchor="middle" fill="var(--accent-pink)" fontSize={7} fontFamily="var(--font-mono)">TK API</text>
      {/* Connection lines */}
      <line x1={58} y1={19} x2={80} y2={35} stroke="var(--border-strong)" strokeWidth={0.5} strokeDasharray="3 2" />
      <line x1={58} y1={61} x2={80} y2={45} stroke="var(--border-strong)" strokeWidth={0.5} strokeDasharray="3 2" />
      {/* Data particles flowing */}
      {[0, 1, 2].map((i) => (
        <circle key={`ig-${i}`} r={2} fill="var(--accent-blue)" opacity={0.7}
          style={{
            animation: `guide-flow 1.8s ease-in-out ${i * 0.5}s infinite`,
            transformOrigin: "58px 19px",
          }}
        >
          <animateMotion dur="1.8s" repeatCount="indefinite" begin={`${i * 0.5}s`}
            path="M58,19 L80,35"
          />
        </circle>
      ))}
      {[0, 1].map((i) => (
        <circle key={`tk-${i}`} r={2} fill="var(--accent-pink)" opacity={0.7}
          style={{
            animation: `guide-flow 2s ease-in-out ${i * 0.7}s infinite`,
            transformOrigin: "58px 61px",
          }}
        >
          <animateMotion dur="2s" repeatCount="indefinite" begin={`${i * 0.7}s`}
            path="M58,61 L80,45"
          />
        </circle>
      ))}
      {/* Output arrow */}
      <line x1={120} y1={40} x2={148} y2={40} stroke="var(--accent-green)" strokeWidth={1} strokeDasharray="4 3" />
      <polygon points="146,36 154,40 146,44" fill="var(--accent-green)" opacity={0.6} />
      {/* Results box */}
      <rect x={158} y={25} width={34} height={30} rx={3}
        fill="var(--bg-card)" stroke="var(--border-default)" strokeWidth={1}
      />
      <text x={175} y={43} textAnchor="middle" fill="var(--text-muted)" fontSize={7} fontFamily="var(--font-mono)">DATA</text>
    </svg>
  );
}

function GuideSvgBenchmark() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Signal waveform */}
      <path
        d="M 10,50 Q 25,20 40,40 T 70,35 T 100,45 T 130,30 T 160,42"
        stroke="var(--text-muted)" strokeWidth={1} fill="none" opacity={0.3}
      />
      {/* Organic segment highlight */}
      <path
        d="M 10,50 Q 25,20 40,40 T 70,35"
        stroke="var(--accent-green)" strokeWidth={1.5} fill="none"
        strokeDasharray="100" strokeDashoffset="100"
        style={{ animation: "guide-sweep 1.5s ease-out 0.3s forwards" }}
      />
      {/* Commercial segment highlight */}
      <path
        d="M 100,45 T 130,30 T 160,42"
        stroke="var(--accent-pink)" strokeWidth={1.5} fill="none"
        strokeDasharray="100" strokeDashoffset="100"
        style={{ animation: "guide-sweep 1.5s ease-out 0.8s forwards" }}
      />
      {/* Divider */}
      <line x1={85} y1={15} x2={85} y2={60} stroke="var(--border-strong)" strokeWidth={0.5} strokeDasharray="3 2"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.6s both" }}
      />
      {/* Labels */}
      <text x={38} y={70} textAnchor="middle" fill="var(--accent-green)" fontSize={7} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 1.2s both" }}
      >ORGANIC</text>
      <text x={135} y={70} textAnchor="middle" fill="var(--accent-pink)" fontSize={7} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 1.6s both" }}
      >COMMERCIAL</text>
      {/* Ratio badge */}
      <rect x={166} y={12} width={28} height={16} rx={3}
        fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={0.5}
        style={{ animation: "guide-fade-in-up 0.3s ease-out 1.8s both" }}
      />
      <text x={180} y={23} textAnchor="middle" fill="var(--accent-amber)" fontSize={8} fontFamily="var(--font-mono)" fontWeight="bold"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 2s both" }}
      >0.6x</text>
    </svg>
  );
}

function GuideSvgReview() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Matrix header */}
      <rect x={8} y={6} width={184} height={12} rx={2}
        fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth={0.5}
      />
      {["HANDLE", "IG", "TK", "ORG", "COM", "RATIO"].map((label, i) => (
        <text key={label} x={20 + i * 30} y={15} fill="var(--text-muted)" fontSize={5.5} fontFamily="var(--font-mono)" fontWeight="600">
          {label}
        </text>
      ))}
      {/* Matrix rows populating */}
      {[0, 1, 2, 3].map((row) => (
        <g key={row} style={{ animation: `guide-cell-fill 0.3s ease-out ${0.3 + row * 0.2}s both` }}>
          <rect
            x={8} y={22 + row * 14} width={184} height={11} rx={1}
            fill={row % 2 === 0 ? "var(--bg-card)" : "transparent"}
            stroke="var(--border-subtle)" strokeWidth={0.3}
          />
          {/* Handle cell */}
          <rect x={12} y={25 + row * 14} width={22} height={5} rx={1} fill="var(--text-muted)" opacity={0.3} />
          {/* Metric cells */}
          {[1, 2, 3, 4].map((col) => (
            <rect
              key={col} x={20 + col * 30} y={25 + row * 14} width={16} height={5} rx={1}
              fill={col <= 2 ? "var(--accent-blue)" : col === 3 ? "var(--accent-green)" : "var(--accent-pink)"}
              opacity={0.2 + Math.random() * 0.15}
            />
          ))}
          {/* Status dot */}
          <circle cx={178} cy={27.5 + row * 14} r={2.5}
            fill={row < 3 ? "var(--accent-green)" : "var(--accent-amber)"}
            opacity={0.7}
          />
        </g>
      ))}
    </svg>
  );
}

function GuideSvg({ step }: { step: typeof GUIDE_STEPS[number]["svg"] }) {
  switch (step) {
    case "input": return <GuideSvgInput />;
    case "validate": return <GuideSvgValidate />;
    case "fetch": return <GuideSvgFetch />;
    case "benchmark": return <GuideSvgBenchmark />;
    case "review": return <GuideSvgReview />;
  }
}

function SystemGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  // Reset step when opening
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Arrow key navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setStep((s) => Math.min(s + 1, GUIDE_STEPS.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setStep((s) => Math.max(s - 1, 0));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const current = GUIDE_STEPS[step];
  const isLast = step === GUIDE_STEPS.length - 1;

  return (
    <Modal open={open} onClose={onClose} title="SYSTEM GUIDE" width="520px">
      <div style={{ minHeight: 320 }}>
        {/* Step indicator bar */}
        <div className="flex items-center gap-2 mb-4">
          {GUIDE_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-[10px]"
              style={{
                fontFamily: "var(--font-mono)",
                backgroundColor: i === step ? "var(--accent-green-glow)" : "transparent",
                color: i === step ? "var(--accent-green)" : "var(--text-muted)",
                border: i === step ? "1px solid var(--border-accent)" : "1px solid transparent",
                fontWeight: i === step ? 600 : 400,
                letterSpacing: "0.04em",
              }}
            >
              {s.num}
            </button>
          ))}
        </div>

        {/* Step content */}
        <div key={current.id} className="guide-step-enter">
          {/* Title */}
          <div className="mb-1">
            <span
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {current.title}
            </span>
            <span
              className="ml-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {current.subtitle}
            </span>
          </div>

          {/* Description */}
          <p
            className="text-xs leading-relaxed mb-3"
            style={{ color: "var(--text-secondary)", maxWidth: 440 }}
          >
            {current.desc}
          </p>

          {/* Animated SVG */}
          <div
            className="guide-svg-wrap rounded-md"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-subtle)",
              padding: "20px 16px",
            }}
          >
            <GuideSvg step={current.svg} />
          </div>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between mt-5 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {/* Dot indicators */}
          <div className="flex items-center gap-2">
            {GUIDE_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`guide-dot${i === step ? " active" : ""}`}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-1.5 rounded-md text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: "transparent",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ← PREV
              </button>
            )}
            {isLast ? (
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  backgroundColor: "var(--accent-green)",
                  color: "var(--text-inverse)",
                  fontFamily: "var(--font-mono)",
                  boxShadow: "0 0 12px -2px rgba(16, 185, 129, 0.3)",
                }}
              >
                GOT IT
              </button>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="px-3 py-1.5 rounded-md text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: "var(--accent-green-glow)",
                  border: "1px solid var(--border-accent)",
                  color: "var(--accent-green)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                NEXT →
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Batch Intake Panel
// ---------------------------------------------------------------------------

function BatchIntakePanel({
  rawInput,
  onInputChange,
  parseErrors,
  onParse,
  onStart,
}: {
  rawInput: string;
  onInputChange: (v: string) => void;
  parseErrors: BatchValidationError[];
  onParse: () => { rows: BatchImportRow[]; errors: BatchValidationError[] };
  onStart: () => void;
}) {
  const [preview, setPreview] = useState<{ rows: BatchImportRow[]; errors: BatchValidationError[] } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const handlePreview = () => {
    const result = onParse();
    setPreview(result);
  };

  const handleStart = () => {
    onStart();
  };

  return (
    <div className="animate-fade-in">
      {/* ── Page Header ─────────────────────────────────── */}
      <div
        className="flex items-center justify-between mb-4 animate-slide-up"
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
            Analyze
          </h1>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", margin: "4px 0 0 0" }}
          >
            Paste creator handles — one per row, Instagram and TikTok on the same line
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className="cap-chip">INSTAGRAM</span>
          <span className="cap-chip">TIKTOK</span>
          <span className="cap-chip">CSV · TSV · SHEETS</span>
          <button
            onClick={() => setGuideOpen(true)}
            className="guide-trigger"
            aria-label="Open system guide"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M6.5 6.5a1.5 1.5 0 1 1 1.5 1.5v1.5" strokeLinecap="round" />
              <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none" />
            </svg>
            GUIDE
          </button>
        </div>
      </div>

      {/* ── System Guide Modal ──────────────────────────────────── */}
      <SystemGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* ── Intake Shell ──────────────────────────────────────────── */}
      <div className="intake-shell p-5 animate-slide-up-delay flex flex-col" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="flex flex-col flex-1">

          {/* ── Input Panel (full width) ──────────────────────────── */}
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1">
              <label
                className="block text-[10px] font-semibold tracking-widest shrink-0"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                PASTE CREATOR ROWS
              </label>
              <div className="format-hint">
                <span>Format:</span> <code>instagram, tiktok</code> <span className="hidden sm:inline">· one row per creator · blank cell = skip</span>
              </div>
            </div>
            <textarea
              id="batch-input"
              value={rawInput}
              onChange={(e) => {
                onInputChange(e.target.value);
                setPreview(null);
              }}
              placeholder={`instagram handle, tiktok handle\nuberkuloz, uberkuloz\nberkcan, bege\ndogaozdas, dogaozdas\nreymen, reynmen`}
              className="intake-textarea w-full p-4 text-sm resize-none placeholder:opacity-20 flex-1"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            />

            {/* ── Inline Preview Strip ────────────────────────────── */}
            {preview && (
              <div className="preview-strip p-3 mt-3 animate-fade-in">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                        {preview.rows.length}
                      </span>
                      <span className="text-[10px] font-medium tracking-wide" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        creator rows
                      </span>
                    </div>
                    <div className="flex gap-2.5 text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--accent-blue)" }} />
                        IG: {extractUniqueHandles(preview.rows).instagram.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--accent-pink)" }} />
                        TK: {extractUniqueHandles(preview.rows).tiktok.length}
                      </span>
                    </div>
                    {preview.errors.length > 0 && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold" style={{ color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}>
                          {preview.errors.length}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--accent-pink)" }}>errors</span>
                      </div>
                    )}
                  </div>
                  {preview.rows.length > 0 && preview.errors.length === 0 && (
                    <span className="text-[10px] font-medium" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                      ✓ READY
                    </span>
                  )}
                </div>
                {preview.errors.length > 0 && (
                  <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    {preview.errors.slice(0, 3).map((e, i) => (
                      <p key={i} className="text-[10px]" style={{ color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}>
                        Row {e.sourceRowIndex}: {e.message}
                      </p>
                    ))}
                    {preview.errors.length > 3 && (
                      <p className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        +{preview.errors.length - 3} more
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Action Bar ──────────────────────────────────────────── */}
        <div className="action-bar flex items-center justify-between">
          <button
            onClick={handlePreview}
            disabled={!rawInput.trim()}
            className="px-5 py-2 rounded-md text-xs font-medium tracking-wide transition-all"
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--border-default)",
              color: !rawInput.trim() ? "var(--text-muted)" : "var(--text-secondary)",
              opacity: !rawInput.trim() ? 0.3 : 1,
              fontFamily: "var(--font-mono)",
            }}
          >
            PREVIEW
          </button>
          <button
            id="btn-start-batch"
            onClick={handleStart}
            disabled={!rawInput.trim()}
            className="px-7 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all flex items-center gap-2"
            style={{
              backgroundColor: !rawInput.trim() ? "var(--bg-elevated)" : "var(--accent-green)",
              color: !rawInput.trim() ? "var(--text-muted)" : "var(--text-inverse)",
              opacity: !rawInput.trim() ? 0.3 : 1,
              fontFamily: "var(--font-mono)",
              boxShadow: rawInput.trim() ? "0 0 20px -4px rgba(0, 255, 106, 0.25)" : "none",
            }}
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,0 12,6 2,12" /></svg>
            START ANALYSIS
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch Progress Strip
// ---------------------------------------------------------------------------

function BatchProgressStrip({
  summary,
  phase,
  onCancel,
  onRetryErrors,
}: {
  summary: BatchRunSummary;
  phase: BatchWorkspacePhase;
  onCancel: () => void;
  onRetryErrors: () => void;
}) {
  const progress = summary.totalHandles > 0
    ? Math.round((summary.completedHandles / summary.totalHandles) * 100)
    : 0;

  // Determine truthful completion state
  const hasErrors = summary.errorRows > 0;
  const hasPartials = summary.partialRows > 0;
  const isFinished = phase === "results";

  let statusLabel: string;
  let statusColor: string;
  let barColor: string;

  if (!isFinished) {
    statusLabel = "PROCESSING";
    statusColor = "var(--text-muted)";
    barColor = "var(--accent-green)";
  } else if (hasErrors) {
    statusLabel = "FINISHED WITH ERRORS";
    statusColor = "var(--accent-pink)";
    barColor = "var(--accent-pink)";
  } else if (hasPartials) {
    statusLabel = "PARTIAL COMPLETE";
    statusColor = "var(--accent-amber)";
    barColor = "var(--accent-amber)";
  } else {
    statusLabel = "COMPLETE";
    statusColor = "var(--accent-green)";
    barColor = "var(--accent-green)";
  }

  return (
    <div
      className="rounded-md border p-4 animate-fade-in"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
    >
      <div className="flex items-center gap-4 flex-wrap">
        {/* Progress bar */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium tracking-wider" style={{ color: statusColor, fontFamily: "var(--font-mono)" }}>
              {statusLabel}
            </span>
            <span className="text-xs font-bold" style={{ color: statusColor, fontFamily: "var(--font-mono)" }}>
              {progress}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: barColor,
                boxShadow: phase === "processing" ? `0 0 8px var(--accent-green-glow)` : "none",
              }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-[10px]" style={{ fontFamily: "var(--font-mono)" }}>
          <StatPill label="TOTAL" value={summary.totalRows} color="var(--text-primary)" />
          <StatPill label="DONE" value={summary.completeRows} color="var(--accent-green)" />
          {summary.partialRows > 0 && <StatPill label="PARTIAL" value={summary.partialRows} color="var(--accent-amber)" />}
          {summary.errorRows > 0 && <StatPill label="ERROR" value={summary.errorRows} color="var(--accent-pink)" />}
          {(summary.runningRows + summary.queuedRows) > 0 && (
            <StatPill label="PENDING" value={summary.runningRows + summary.queuedRows} color="var(--text-muted)" />
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {phase === "processing" && (
            <button
              onClick={onCancel}
              className="text-[10px] px-3 py-1.5 rounded-md font-medium tracking-wider transition-all hover:opacity-80"
              style={{ backgroundColor: "rgba(255,45,120,0.1)", color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}
            >
              CANCEL
            </button>
          )}
          {phase === "results" && summary.errorRows > 0 && (
            <button
              onClick={onRetryErrors}
              className="text-[10px] px-3 py-1.5 rounded-md font-medium tracking-wider transition-all hover:opacity-80"
              style={{ backgroundColor: "var(--accent-green-glow)", color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
            >
              RETRY ERRORS ({summary.errorRows})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch Result Matrix
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  queued: { color: "var(--text-muted)", bg: "rgba(128,128,128,0.08)", label: "QUEUED" },
  running: { color: "var(--accent-blue)", bg: "rgba(59,130,246,0.08)", label: "RUNNING" },
  complete: { color: "var(--accent-green)", bg: "var(--accent-green-glow)", label: "OK" },
  partial: { color: "var(--accent-amber)", bg: "rgba(255,184,0,0.08)", label: "PARTIAL" },
  error: { color: "var(--accent-pink)", bg: "rgba(255,45,120,0.08)", label: "ERROR" },
};

function BatchResultMatrix({
  results,
  selectedRowId,
  onSelectRow,
  sortField,
  sortDir,
  onToggleSort,
}: {
  results: BatchRowResult[];
  selectedRowId: string | null;
  onSelectRow: (id: string | null) => void;
  sortField: SortField;
  sortDir: SortDir;
  onToggleSort: (field: SortField) => void;
}) {
  const SortHeader = ({ field, children, w }: { field: SortField; children: React.ReactNode; w?: string }) => (
    <th
      onClick={() => onToggleSort(field)}
      className="text-left px-3 py-2.5 font-medium tracking-wider select-none"
      style={{
        color: sortField === field ? "var(--text-primary)" : "var(--text-muted)",
        cursor: "pointer",
        width: w,
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
      }}
    >
      {children}
      {sortField === field && (
        <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );

  return (
    <div
      className="rounded-md border overflow-hidden animate-slide-up"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: "var(--font-mono)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <SortHeader field="index" w="40px">#</SortHeader>
              <SortHeader field="label">LABEL</SortHeader>
              <th className="text-left px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", fontSize: "10px" }}>INSTAGRAM</th>
              <th className="text-left px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", fontSize: "10px" }}>TIKTOK</th>
              <SortHeader field="status" w="70px">STATUS</SortHeader>
              <SortHeader field="igFollowers" w="80px">IG FLLW</SortHeader>
              <SortHeader field="tkFollowers" w="80px">TK FLLW</SortHeader>
              <SortHeader field="organicAvg" w="90px">ORG AVG</SortHeader>
              <SortHeader field="commercialAvg" w="90px">COM AVG</SortHeader>
              <SortHeader field="ratio" w="70px">RATIO</SortHeader>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const isSelected = r.row.id === selectedRowId;
              const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.queued;
              const orgAvg = r.instagram?.organic?.averageViews ?? r.tiktok?.organic?.averageViews ?? null;
              const comAvg = r.instagram?.commercial?.averageViews ?? r.tiktok?.commercial?.averageViews ?? null;
              const ratio = r.instagram?.comparison?.adToOrganicRatio ?? r.tiktok?.comparison?.adToOrganicRatio ?? null;

              return (
                <tr
                  key={r.row.id}
                  onClick={() => onSelectRow(isSelected ? null : r.row.id)}
                  className="transition-colors"
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    backgroundColor: isSelected ? "var(--bg-elevated)" : "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--bg-card-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent";
                  }}
                >
                  <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.row.sourceRowIndex}</td>
                  <td className="px-3 py-2.5 max-w-[120px] truncate" style={{ color: "var(--text-primary)" }}>
                    {r.row.label || "—"}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: r.row.instagramUsername ? "var(--text-primary)" : "var(--text-muted)", opacity: r.row.instagramUsername ? 1 : 0.3 }}>
                    {r.row.instagramUsername ? `@${r.row.instagramUsername}` : "—"}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: r.row.tiktokUsername ? "var(--text-primary)" : "var(--text-muted)", opacity: r.row.tiktokUsername ? 1 : 0.3 }}>
                    {r.row.tiktokUsername ? `@${r.row.tiktokUsername}` : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-[9px] font-medium tracking-wider px-1.5 py-px rounded"
                      style={{ backgroundColor: sc.bg, color: sc.color }}
                    >
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: "var(--text-primary)" }}>
                    {formatNumber(r.instagram?.profile?.followerCount)}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: "var(--text-primary)" }}>
                    {formatNumber(r.tiktok?.profile?.followerCount)}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: orgAvg ? "var(--accent-green)" : "var(--text-muted)" }}>
                    {formatNumber(orgAvg)}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: comAvg ? "var(--accent-amber)" : "var(--text-muted)" }}>
                    {formatNumber(comAvg)}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{
                    color: ratio !== null
                      ? (ratio >= 1 ? "var(--accent-green)" : "var(--accent-amber)")
                      : "var(--text-muted)",
                  }}>
                    {ratio !== null ? `${Math.round(ratio * 100)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                  No results matching filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selected Row Detail Panel
// ---------------------------------------------------------------------------

function SelectedRowDetail({
  result,
  onClose,
  onRetryHandle,
}: {
  result: BatchRowResult;
  onClose: () => void;
  onRetryHandle: (platform: Platform, username: string) => void;
}) {
  const ig = result.instagram;
  const tk = result.tiktok;
  const hasIg = !!result.row.instagramUsername;
  const hasTk = !!result.row.tiktokUsername;

  return (
    <div
      className="mt-4 rounded-md border animate-slide-up"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}
    >
      {/* Detail Header */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            DETAIL
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {result.row.label || `Row ${result.row.sourceRowIndex}`}
          </span>
          {result.warnings.length > 0 && (
            <span className="text-[10px] px-1.5 py-px rounded" style={{ backgroundColor: "rgba(255,184,0,0.08)", color: "var(--accent-amber)" }}>
              {result.warnings.length} warning{result.warnings.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded hover:opacity-70 transition-opacity"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
      </div>

      <div className="p-5">
        {/* Retry buttons for errored handles */}
        {result.warnings.length > 0 && (
          <div className="mb-4 space-y-1">
            {result.warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <p className="text-xs" style={{ color: "var(--accent-pink)" }}>{w}</p>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              {hasIg && ig?.status === "error" && (
                <button
                  onClick={() => onRetryHandle("instagram", result.row.instagramUsername!)}
                  className="text-[10px] px-2 py-1 rounded font-medium"
                  style={{ backgroundColor: "var(--accent-green-glow)", color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
                >
                  RETRY IG
                </button>
              )}
              {hasTk && tk?.status === "error" && (
                <button
                  onClick={() => onRetryHandle("tiktok", result.row.tiktokUsername!)}
                  className="text-[10px] px-2 py-1 rounded font-medium"
                  style={{ backgroundColor: "var(--accent-green-glow)", color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
                >
                  RETRY TK
                </button>
              )}
            </div>
          </div>
        )}

        {/* Profile Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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

        {/* Planning + Visibility Section */}
        {hasIg && ig && ig.status !== "error" && (ig.storyVisibility || (ig.carouselVisibility && ig.carouselVisibility.sourceMode !== "unavailable")) ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6" style={{ alignItems: "start" }}>
            <div className="lg:col-span-4">
              <VisibilityIntelligencePanel
                story={ig.storyVisibility ?? null}
                carousel={ig.carouselVisibility?.sourceMode !== "unavailable" ? ig.carouselVisibility ?? null : null}
              />
            </div>
            <div className="lg:col-span-8">
              <BudgetWorkbench ig={ig} tk={tk ?? undefined} hasIg={hasIg} hasTk={hasTk} />
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <BudgetWorkbench ig={ig ?? undefined} tk={tk ?? undefined} hasIg={hasIg} hasTk={hasTk} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile Card (preserved from v2)
// ---------------------------------------------------------------------------

function ProfileCard({
  platform,
  label,
  analysis,
}: {
  platform: "instagram" | "tiktok";
  label: string;
  analysis?: PlatformAnalysis;
}) {
  const isError = !analysis || analysis.status === "error";
  const profile = analysis?.profile;
  const accentColor = platform === "instagram" ? "var(--accent-pink)" : "var(--accent-blue)";

  return (
    <div
      className="rounded-md border p-5 animate-slide-up"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: isError ? "var(--border-subtle)" : "var(--border-default)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isError ? "var(--status-muted)" : accentColor }} />
          <span className="text-xs font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {label.toUpperCase()}
          </span>
        </div>
        {analysis && (
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: isError ? "rgba(255,45,120,0.1)" : "var(--accent-green-glow)",
              color: isError ? "var(--accent-pink)" : "var(--accent-green)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {isError ? "ERROR" : sourceLabel(analysis.source)}
          </span>
        )}
      </div>
      {isError ? (
        <div>
          <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>@{analysis?.username || "—"}</p>
          <p className="text-xs" style={{ color: "var(--accent-pink)" }}>{analysis?.error || "Platform unavailable"}</p>
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              @{analysis.username}
              {profile?.verified && <span className="ml-1.5 text-xs" style={{ color: "var(--accent-blue)" }}>✓</span>}
            </p>
            {profile?.displayName && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{profile.displayName}</p>}
          </div>
          <div className="flex gap-6">
            <StatCell label="Followers" value={formatNumber(profile?.followerCount)} accent />
            <StatCell label="Following" value={formatNumber(profile?.followingCount)} />
            <StatCell label="Content" value={analysis.totalContentCount.toString()} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{label}</p>
      <p className="text-base font-semibold" style={{ color: accent ? "var(--accent-green)" : "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benchmark Panel (preserved from v2)
// ---------------------------------------------------------------------------

function BenchmarkPanel({ platform, label, contentLabel, analysis }: {
  platform: "instagram" | "tiktok"; label: string; contentLabel: string; analysis: PlatformAnalysis;
}) {
  return (
    <div className="rounded-md border animate-slide-up-delay" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border-subtle)" }}>
        <span className="text-xs font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {label.toUpperCase()} BENCHMARK
        </span>
        {analysis.limitations.length > 0 && (
          <span className="text-xs max-w-xs truncate" style={{ color: "var(--text-muted)" }} title={analysis.limitations.join(" ")}>
            {analysis.limitations[0]}
          </span>
        )}
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <BucketCard label={`Organic ${contentLabel}`} bucket={analysis.organic} accentVar="--accent-green" />
          <BucketCard label={`Commercial ${contentLabel}`} bucket={analysis.commercial} accentVar="--accent-amber" />
        </div>
        {analysis.comparison && <ComparisonRow comparison={analysis.comparison} />}
        <ContentList label={`Organic ${contentLabel}`} bucket={analysis.organic} accentVar="--accent-green" />
        {analysis.commercial.sampleSize > 0 && (
          <ContentList label={`Commercial ${contentLabel}`} bucket={analysis.commercial} accentVar="--accent-amber" />
        )}
      </div>
    </div>
  );
}

function BucketCard({ label, bucket, accentVar }: { label: string; bucket: BenchmarkBucket; accentVar: string }) {
  const isComplete = bucket.status === "complete";
  const statusColor = isComplete ? `var(${accentVar})` : "var(--status-warn)";
  return (
    <div className="rounded-md border p-4" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
      <p className="text-xs mb-3 font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{label.toUpperCase()}</p>
      <p className="text-2xl font-bold mb-1" style={{ color: isComplete ? `var(${accentVar})` : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {bucket.averageViews !== null ? formatNumber(bucket.averageViews) : "—"}
      </p>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
        <span className="text-xs" style={{ color: statusColor }}>
          {isComplete ? `${bucket.sampleSize}/${bucket.maxSampleSize}` : `${bucket.sampleSize}/${bucket.maxSampleSize} · Insufficient`}
        </span>
      </div>
      {bucket.warnings.length > 0 && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--status-warn)" }}>{bucket.warnings[0]}</p>
      )}
    </div>
  );
}

function ComparisonRow({ comparison }: { comparison: ComparisonMetrics }) {
  const ratio = Math.round(comparison.adToOrganicRatio * 100);
  const deltaAbs = Math.abs(comparison.delta);
  return (
    <div className="rounded-md border p-3 mb-6 flex items-center justify-between" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>AD/ORGANIC RATIO</span>
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold" style={{ color: ratio >= 100 ? "var(--accent-green)" : "var(--accent-amber)", fontFamily: "var(--font-mono)" }}>{ratio}%</span>
        <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Δ {comparison.delta > 0 ? "+" : "-"}{formatNumber(deltaAbs)}</span>
      </div>
    </div>
  );
}

function ContentList({ label, bucket, accentVar }: { label: string; bucket: BenchmarkBucket; accentVar: string }) {
  if (bucket.sampleSize === 0) return null;
  const items = bucket.reels as (ClassifiedReel | ClassifiedItem)[];
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-xs font-medium mb-2 tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {label.toUpperCase()} · {items.length} ITEMS
      </p>
      <div className="rounded-md border overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        {items.map((item, i) => {
          const isCommercial = "isCommercial" in item && item.isCommercial;
          return (
            <div key={item.id + "-" + i} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
              <span className="text-sm font-medium w-16 text-right shrink-0" style={{ color: item.views !== null ? `var(${accentVar})` : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {formatNumber(item.views)}
              </span>
              <span className="text-xs flex-1 truncate" style={{ color: "var(--text-secondary)" }}>{truncate(item.caption, 60)}</span>
              {isCommercial && "classificationCategory" in item && (
                <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: "var(--accent-pink-glow)", color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}>
                  {categoryLabel(item.classificationCategory)}
                </span>
              )}
              <span className="text-xs shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{formatDate(item.timestamp)}</span>
              <a href={item.permalink} target="_blank" rel="noopener noreferrer" className="shrink-0 opacity-30 hover:opacity-70 transition-opacity" style={{ color: "var(--text-primary)" }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visibility Intelligence Panel (preserved from v2)
// ---------------------------------------------------------------------------

function VisibilityIntelligencePanel({ story, carousel }: { story: StoryVisibility | null; carousel: CarouselVisibility | null }) {
  if (!story && !carousel) return null;
  const modeColors: Record<string, { color: string; bg: string }> = {
    exact_connected: { color: "var(--accent-green)", bg: "var(--accent-green-glow)" },
    observed_vendor: { color: "var(--accent-blue)", bg: "rgba(56,189,248,0.08)" },
    estimated: { color: "#d97706", bg: "rgba(217,119,6,0.08)" },
    unavailable: { color: "var(--status-muted)", bg: "rgba(128,128,128,0.08)" },
  };
  return (
    <div className="rounded-md border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <svg className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)", opacity: 0.4 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span className="text-[10px] font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>VISIBILITY INTELLIGENCE</span>
      </div>
      {story && story.sourceMode !== "unavailable" && (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[9px] font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>STORY</span>
            <span className="text-[9px] font-medium tracking-wider px-1 py-px rounded" style={{
              backgroundColor: (modeColors[story.sourceMode] ?? modeColors.unavailable).bg,
              color: (modeColors[story.sourceMode] ?? modeColors.unavailable).color,
              fontFamily: "var(--font-mono)",
            }}>
              {story.sourceMode === "estimated" ? "EST" : story.sourceMode === "exact_connected" ? "EXACT" : "N/A"}
            </span>
          </div>
          {story.sourceMode === "estimated" && story.estimatedViewers && story.estimatedReach && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[9px] tracking-wide mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>VIEWERS</p>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {formatNumber(story.estimatedViewers.low)}
                  <span className="text-[10px] font-normal mx-0.5" style={{ color: "var(--text-muted)" }}>–</span>
                  {formatNumber(story.estimatedViewers.high)}
                </p>
              </div>
              <div>
                <p className="text-[9px] tracking-wide mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>REACH</p>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {formatNumber(story.estimatedReach.low)}
                  <span className="text-[10px] font-normal mx-0.5" style={{ color: "var(--text-muted)" }}>–</span>
                  {formatNumber(story.estimatedReach.high)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {story && story.sourceMode !== "unavailable" && carousel && (
        <div style={{ borderTop: "1px solid var(--border-subtle)" }} />
      )}
      {carousel && carousel.sourceMode !== "unavailable" && (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[9px] font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>CAROUSEL</span>
            <span className="text-[9px]" style={{ color: "var(--text-muted)", opacity: 0.5, fontFamily: "var(--font-mono)" }}>· {carousel.carouselCount}</span>
            <span className="text-[9px] font-medium tracking-wider px-1 py-px rounded" style={{
              backgroundColor: (modeColors[carousel.sourceMode] ?? modeColors.unavailable).bg,
              color: (modeColors[carousel.sourceMode] ?? modeColors.unavailable).color,
              fontFamily: "var(--font-mono)",
            }}>
              {carousel.sourceMode === "estimated" ? "EST" : carousel.sourceMode === "exact_connected" ? "EXACT" : "N/A"}
            </span>
          </div>
          {carousel.sourceMode === "estimated" && carousel.aggregateEstimatedViews && carousel.aggregateEstimatedReach && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[9px] tracking-wide mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>AVG VIEWS</p>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {formatNumber(carousel.aggregateEstimatedViews.low)}
                  <span className="text-[10px] font-normal mx-0.5" style={{ color: "var(--text-muted)" }}>–</span>
                  {formatNumber(carousel.aggregateEstimatedViews.high)}
                </p>
              </div>
              <div>
                <p className="text-[9px] tracking-wide mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>AVG REACH</p>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {formatNumber(carousel.aggregateEstimatedReach.low)}
                  <span className="text-[10px] font-normal mx-0.5" style={{ color: "var(--text-muted)" }}>–</span>
                  {formatNumber(carousel.aggregateEstimatedReach.high)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="px-3 py-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5">
            {[1, 2, 3].map((i) => {
              const conf = story?.confidence ?? carousel?.confidence ?? "low";
              const dots = conf === "high" ? 3 : conf === "medium" ? 2 : 1;
              return <div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: i <= dots ? "#d97706" : "var(--border-subtle)" }} />;
            })}
          </div>
          <span className="text-[9px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>Model-estimated · not official Meta data</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget + CPM Workbench (preserved from v2)
// ---------------------------------------------------------------------------

type BudgetEntry = { amount: string; currency: string };
type QtyEntry = Record<string, number>;

const BENCHMARK_COLORS: Record<string, { color: string; bg: string }> = {
  efficient: { color: "var(--accent-green)", bg: "var(--accent-green-glow)" },
  market: { color: "var(--accent-blue)", bg: "rgba(56,189,248,0.08)" },
  premium: { color: "#d97706", bg: "rgba(217,119,6,0.08)" },
  outlier: { color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
  unknown: { color: "var(--status-muted)", bg: "rgba(128,128,128,0.08)" },
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  exact: { label: "EXACT", color: "var(--accent-green)" },
  imputed: { label: "IMPUTED", color: "#d97706" },
  missing: { label: "—", color: "var(--status-muted)" },
  estimated_model: { label: "EST", color: "#d97706" },
  unavailable: { label: "N/A", color: "var(--status-muted)" },
  projected: { label: "PROJ", color: "var(--accent-blue)" },
  projected_imputed: { label: "PROJ·IMP", color: "#d97706" },
};

function BudgetWorkbench({ ig, tk, hasIg, hasTk }: {
  ig: PlatformAnalysis | undefined; tk: PlatformAnalysis | undefined; hasIg: boolean; hasTk: boolean;
}) {
  const deliverables: DeliverableType[] = [];
  if (hasIg && ig && ig.status !== "error") {
    deliverables.push("ig_reels");
    if (ig.storyVisibility) deliverables.push("ig_story");
    if (ig.carouselVisibility && ig.carouselVisibility.sourceMode !== "unavailable") deliverables.push("ig_carousel");
    deliverables.push("ig_reels_collab");
  }
  if (hasTk && tk && tk.status !== "error") {
    deliverables.push("tt_post");
  }

  const [budgets, setBudgets] = useState<Record<string, BudgetEntry>>({});
  const [quantities, setQuantities] = useState<QtyEntry>({});
  const [currency, setCurrency] = useState("TRY");
  const [showInfo, setShowInfo] = useState(false);

  const updateBudget = useCallback((dt: DeliverableType, amount: string) => {
    setBudgets((prev) => ({ ...prev, [dt]: { amount, currency } }));
  }, [currency]);

  const updateQty = useCallback((dt: DeliverableType, val: string) => {
    const n = parseInt(val, 10);
    setQuantities((prev) => ({ ...prev, [dt]: isNaN(n) || n < 1 ? 1 : n }));
  }, []);

  if (deliverables.length === 0) return null;

  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const signals: ForecastSignals = {
    igOrganic: ig?.organic ?? null,
    igCommercial: ig?.commercial ?? null,
    storyVisibility: ig?.storyVisibility ?? null,
    carouselVisibility: ig?.carouselVisibility ?? null,
    tkOrganic: tk?.organic ?? null,
    tkCommercial: tk?.commercial ?? null,
    igFollowerCount: ig?.profile?.followerCount ?? null,
    tkFollowerCount: tk?.profile?.followerCount ?? null,
  };

  const rows = deliverables.map((dt) => {
    const forecast = forecastImpressions(dt, signals);
    const entry = budgets[dt];
    const amt = entry ? parseFloat(entry.amount) : 0;
    const qty = quantities[dt] ?? 1;
    const quote: DeliverableQuote = {
      deliverableType: dt, quantity: qty,
      sourceMode: amt > 0 ? "exact" as QuoteSourceMode : "missing" as QuoteSourceMode,
      unitPrice: amt > 0 ? moneyWithFx(amt, currency) : null,
      totalPrice: null, pricingComponents: [], notes: [],
    };
    const cpm = computeDeliverableCpm(quote, forecast);
    const totalImpressions = forecast.base !== null ? forecast.base * qty : null;
    const lineCost = amt > 0 ? amt * qty : null;
    return { dt, forecast, quote, cpm, qty, totalImpressions, lineCost };
  });

  return (
    <div className="rounded-md border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <svg className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)", opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span className="text-xs font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>BUDGET + CPM WORKBENCH</span>
        <button onClick={() => setShowInfo(!showInfo)} className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{
          backgroundColor: showInfo ? "var(--accent-blue)" : "var(--bg-secondary)", color: showInfo ? "#fff" : "var(--text-muted)", cursor: "pointer", border: "none",
        }} title="How CPM is calculated">?</button>
        <div className="ml-auto flex items-center gap-2">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="text-xs rounded px-2 py-1 border-0 outline-none" style={{
            backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", fontFamily: "var(--font-mono)",
          }}>
            <option value="TRY">TRY ₺</option>
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
          </select>
        </div>
      </div>
      {showInfo && (
        <div className="px-5 py-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-secondary)" }}>
          <p className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>How CPM is Calculated</p>
          <p className="mb-1"><strong>CPM</strong> = Cost Per 1,000 Projected Impressions</p>
          <p className="mb-2" style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>Line CPM = (Unit Price × Qty) ÷ (Per-Unit Forecast × Qty) × 1,000</p>
          <p className="mb-0"><strong>Provenance</strong> — <em>EXACT</em> = creator-provided quote. <em>EST</em> = model-estimated impressions. <em>PROJ</em> = projected CPM.</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: "var(--font-mono)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th className="text-left px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)" }}>DELIVERABLE</th>
              <th className="text-center px-2 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "50px" }}>QTY</th>
              <th className="text-right px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "100px" }}>UNIT {sym}</th>
              <th className="text-right px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "90px" }}>LINE {sym}</th>
              <th className="text-right px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "140px" }}>IMPRESSIONS</th>
              <th className="text-right px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "120px" }}>CPM</th>
              <th className="text-center px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "70px" }}>BENCH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ dt, forecast, quote, cpm, qty, totalImpressions, lineCost }) => {
              const bm = BENCHMARK_COLORS[cpm.benchmarkStatus] ?? BENCHMARK_COLORS.unknown;
              const fSrc = SOURCE_BADGE[forecast.sourceMode] ?? SOURCE_BADGE.unavailable;
              return (
                <tr key={dt} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="px-3 py-2.5"><span style={{ color: "var(--text-primary)" }}>{DELIVERABLE_LABELS[dt]}</span></td>
                  <td className="px-2 py-2.5 text-center">
                    <input type="text" inputMode="numeric" value={qty} onChange={(e) => updateQty(dt, e.target.value)}
                      className="w-10 text-center rounded px-1 py-0.5 border-0 outline-none text-xs"
                      style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }} />
                  </td>
                  <td className="px-3 py-2.5">
                    <input type="text" inputMode="numeric" placeholder="0" value={budgets[dt]?.amount ?? ""}
                      onChange={(e) => updateBudget(dt, e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-full text-right rounded px-2 py-0.5 border-0 outline-none text-xs"
                      style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {lineCost !== null ? <span style={{ color: "var(--text-primary)" }}>{formatNumber(lineCost)}</span> : <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {forecast.base !== null ? (
                      <div>
                        <span style={{ color: "var(--text-primary)" }}>{formatNumber(totalImpressions)}</span>
                        <span className="ml-1 text-[9px] px-1 py-px rounded" style={{ color: fSrc.color, backgroundColor: `${fSrc.color}15` }}>{fSrc.label}</span>
                      </div>
                    ) : <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {cpm.mediaOnlyCpm.base !== null ? (
                      <span style={{ color: "var(--text-primary)" }}>
                        <span style={{ opacity: 0.5, fontSize: "9px" }}>{cpm.mediaOnlyCpm.low?.toFixed(1)}</span>
                        <span className="mx-0.5" style={{ opacity: 0.3 }}>–</span>
                        <span className="font-semibold">{cpm.mediaOnlyCpm.base.toFixed(1)}</span>
                        <span className="mx-0.5" style={{ opacity: 0.3 }}>–</span>
                        <span style={{ opacity: 0.5, fontSize: "9px" }}>{cpm.mediaOnlyCpm.high?.toFixed(1)}</span>
                      </span>
                    ) : <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {cpm.benchmarkStatus !== "unknown" ? (
                      <span className="text-[9px] font-medium tracking-wider px-1.5 py-px rounded" style={{ backgroundColor: bm.bg, color: bm.color }} title={cpm.benchmarkContext ?? undefined}>
                        {cpm.benchmarkStatus.toUpperCase()}
                      </span>
                    ) : <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2 flex items-center gap-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <span className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
          CPM = cost per 1,000 projected impressions · Benchmarks in {FX_BENCHMARK_CURRENCY}{currency !== FX_BENCHMARK_CURRENCY ? ` (FX: 1 ${FX_BENCHMARK_CURRENCY} = ${FX_RATES_TO_USD[currency]} ${currency}, ${FX_SNAPSHOT_DATE})` : ""}
        </span>
      </div>
    </div>
  );
}
