"use client";

/**
 * Content Coverage Intelligence — Dashboard
 *
 * Answers: which recipe/taste content exists on IG/TikTok but is missing
 * on Facebook, YouTube Shorts, and Pinterest?
 *
 * Content is grouped by MEDIA FORMAT:
 *   1. Short Format Videos (TikTok videos, IG Reels, YT Shorts)
 *   2. Long Format Videos  (YouTube regular videos)
 *   3. Photo Posts          (IG carousel/photo, TikTok slideshow)
 *
 * This is a SEPARATE product surface from the creator benchmark.
 */

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import type { AccountScanState } from "@/lib/dimes/types";

// ---------------------------------------------------------------------------
// Types (client-side shapes matching API responses)
// ---------------------------------------------------------------------------

type MediaFormatBucket = "short_video" | "long_video" | "photo_post" | "unclassified";

type AccountInfo = {
  platform: string;
  handle: string;
  verificationStatus: string;
  providerPath: string;
  lastScannedAt: string | null;
};

type BrandInfo = {
  id: string;
  slug: string;
  name: string;
  accountCount: number;
  accounts: AccountInfo[];
};

type ClusterInfo = {
  id: string;
  recipeName: string | null;
  contentType: string;
  mediaFormat: MediaFormatBucket;
  firstSeenAt: string;
  primaryCaption: string | null;
  platforms: string[];
  postCount: number;
};

type PlatformPresence = {
  platform: string;
  status: "present" | "missing" | "unknown" | "not_applicable";
  postId: string | null;
  permalink: string | null;
  statusReason?: string;
};

type GapInfo = {
  clusterId: string;
  recipeName: string | null;
  contentType: string;
  mediaFormat: MediaFormatBucket;
  firstSeenAt: string;
  sourceLink: string | null;
  primaryCaption: string | null;
  sourcePlatforms: PlatformPresence[];
  destinationPlatforms: PlatformPresence[];
  missingSourcePlatforms: string[];
  missingDestinations: string[];
};

type GapSummary = {
  totalClusters: number;
  eligibleClusters: number;
  clustersWithGaps: number;
  gapsByDestination: Record<string, number>;
  gapsByBrand: Record<string, number>;
  coverageRate: number;
};

type BrandReport = {
  brand: BrandInfo;
  stats: {
    totalPosts: number;
    recipePosts: number;
    tastePosts: number;
    specialDayPosts: number;
    otherPosts: number;
  };
  clusters: ClusterInfo[];
  gaps: GapInfo[];
  summary: GapSummary;
};

type ScanRunInfo = {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  newPostsIngested: number;
  postsFound: number;
  clustersCreated: number;
  errors: { platform: string; handle: string; error: string }[];
};

type ReportData = {
  generatedAt: string;
  dateRange: { since: string; until: string };
  brands: BrandReport[];
  totalGaps: number;
  totalPostsInDb: number;
  recentScans: ScanRunInfo[];
};

type ScanFeedback = {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  detail: string;
};

type ScanRouteResponse = {
  scanRun?: Partial<ScanRunInfo>;
  totalPostsInDb?: number;
  scanMode?: "full" | "fast";
  accountScanStates?: AccountScanState[];
  error?: string;
};

// ---------------------------------------------------------------------------
// Media format section definitions
// ---------------------------------------------------------------------------

const FORMAT_SECTIONS: {
  bucket: MediaFormatBucket;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    bucket: "short_video",
    label: "Short Format Videos",
    description: "TikTok videos · Instagram Reels · YouTube Shorts",
    icon: "▶",
  },
  {
    bucket: "long_video",
    label: "Long Format Videos",
    description: "YouTube regular videos",
    icon: "◼",
  },
  {
    bucket: "photo_post",
    label: "Photo Posts",
    description: "Instagram carousel/photo · TikTok slideshow/carousel",
    icon: "◻",
  },
];

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube Shorts",
  pinterest: "Pinterest",
  x: "X",
};

const STATUS_ICONS: Record<string, string> = {
  present: "✓",
  missing: "✗",
  unknown: "?",
  not_applicable: "—",
};

function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function gapMatchesSearch(gap: GapInfo, query: string): boolean {
  if (!query) return true;

  const haystack = [
    gap.recipeName,
    gap.primaryCaption,
    gap.contentType,
    gap.sourcePlatforms
      .map((platform) => PLATFORM_LABELS[platform.platform] || platform.platform)
      .join(" "),
    gap.destinationPlatforms
      .map((platform) => PLATFORM_LABELS[platform.platform] || platform.platform)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function buildScanFeedback(result: ScanRouteResponse): ScanFeedback {
  const scanModeLabel = result?.scanMode === "fast" ? "Fast scan" : "Full scan";
  const scanRun = result?.scanRun || {};
  const newPostsIngested = scanRun.newPostsIngested ?? 0;
  const postsFound = scanRun.postsFound ?? 0;
  const duplicatesSkipped = Math.max(0, postsFound - newPostsIngested);
  const clustersCreated = scanRun.clustersCreated ?? 0;
  const providerErrors = Array.isArray(scanRun.errors) ? scanRun.errors.length : 0;
  const totalPostsInDb = result?.totalPostsInDb ?? 0;

  if (scanRun.status === "error") {
    return {
      tone: "error",
      title: `${scanModeLabel} failed`,
      detail: "The scan could not be completed. Check the provider errors and try again.",
    };
  }

  if (scanRun.status === "partial" || providerErrors > 0) {
    return {
      tone: "warning",
      title: `${scanModeLabel} completed with provider issues`,
      detail:
        `${newPostsIngested} new posts added. ` +
        `${duplicatesSkipped} duplicates skipped. ` +
        `${clustersCreated} clusters available. ` +
        `${providerErrors} provider ${providerErrors === 1 ? "issue was" : "issues were"} reported.`,
    };
  }

  if (newPostsIngested === 0 && postsFound > 0) {
    return {
      tone: "info",
      title: `${scanModeLabel} completed with no new posts`,
      detail:
        `${duplicatesSkipped} duplicates were skipped. ` +
        `${totalPostsInDb} total posts remain in the database.`,
    };
  }

  if (newPostsIngested === 0) {
    return {
      tone: "info",
      title: `${scanModeLabel} completed`,
      detail: "No new content was fetched during this scan window.",
    };
  }

  return {
    tone: "success",
    title: `${scanModeLabel} completed`,
    detail:
      `${newPostsIngested} new posts added. ` +
      `${duplicatesSkipped} duplicates skipped. ` +
      `${clustersCreated} clusters available in the latest snapshot.`,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module-level cache — instant render on revisit
// ---------------------------------------------------------------------------
let _coverageCache: ReportData | null = null;

export default function CoveragePage() {
  const [report, setReport] = useState<ReportData | null>(_coverageCache);
  const [loading, setLoading] = useState(_coverageCache === null);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [scanning, setScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [contentSearch, setContentSearch] = useState("");
  const deferredContentSearch = useDeferredValue(contentSearch);
  const normalizedContentSearch = normalizeSearchQuery(deferredContentSearch);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    try {
      if (!_coverageCache) setLoading(true);
      const url =
        selectedBrand !== "all"
          ? `/api/dimes/report?brand=${selectedBrand}`
          : "/api/dimes/report";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _coverageCache = data;
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedBrand]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Live scan — calls real platform providers (full or fast)
  const [scanMode, setScanMode] = useState<"full" | "fast" | null>(null);
  const [lastScanDate, setLastScanDate] = useState<string | null>(null);

  // Fetch last scan state on mount for fast scan preview
  useEffect(() => {
    fetch("/api/dimes/scan")
      .then((r) => r.json())
      .then((data: ScanRouteResponse) => {
        const states = data.accountScanStates || [];
        if (states.length > 0) {
          // Use the earliest lastSuccessfulScanAt across all accounts
          const dates = states
            .map((s) => s.lastSuccessfulScanAt)
            .filter(Boolean)
            .sort();
          if (dates.length > 0) setLastScanDate(dates[0]);
        }
      })
      .catch(() => {});
  }, []);

  const runScan = useCallback(async (mode: "full" | "fast") => {
    setScanning(true);
    setScanMode(mode);
    setScanFeedback(null);
    try {
      const res = await fetch("/api/dimes/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setScanFeedback(buildScanFeedback(data));
      // Refresh the last scan date after completing
      if (data.scanMode === "full" || data.scanMode === "fast") {
        setLastScanDate(data.scanRun?.completedAt || new Date().toISOString());
      }
      await fetchReport();
    } catch (err) {
      setScanFeedback({
        tone: "error",
        title: `${mode === "fast" ? "Fast scan" : "Full scan"} failed`,
        detail: err instanceof Error ? err.message : "Unknown scan error",
      });
    } finally {
      setScanning(false);
      setScanMode(null);
    }
  }, [fetchReport]);

  const visibleBrands = report
    ? report.brands.filter((brandReport) => {
        if (!normalizedContentSearch) return true;
        return brandReport.gaps.some((gap) =>
          gapMatchesSearch(gap, normalizedContentSearch)
        );
      })
    : [];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 32,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.05em",
                color: "var(--text-primary)",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono)",
                margin: 0,
              }}
            >
              Coverage
            </h1>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "4px 0 0 0",
                fontFamily: "var(--font-mono)",
              }}
            >
              Which recipe/taste content on Instagram + TikTok is missing from
              Facebook, YouTube Shorts, and Pinterest?
            </p>
          </div>
        </div>
      </div>

      {/* Controls Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Brand filter */}
        <select
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-default)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 12,
            padding: "6px 10px",
            fontFamily: "inherit",
          }}
        >
          <option value="all">All Brands</option>
          <option value="dimes-tr">Dimes TR</option>
          <option value="dimes-club">Dimes Club</option>
          <option value="obsesso">Obsesso</option>
        </select>

        {/* Full scan button */}
        <button
          onClick={() => runScan("full")}
          disabled={scanning}
          style={{
            background: scanning && scanMode === "full"
              ? "var(--bg-elevated)"
              : scanning
              ? "var(--bg-elevated)"
              : "var(--accent-blue)",
            color: scanning ? "var(--text-muted)" : "#fff",
            border: "none",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            padding: "6px 14px",
            cursor: scanning ? "wait" : "pointer",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: scanning && scanMode !== "full" ? 0.5 : 1,
          }}
        >
          {scanning && scanMode === "full" ? "Scanning..." : "Run All Data Scan"}
        </button>

        {/* Fast scan button */}
        <button
          onClick={() => runScan("fast")}
          disabled={scanning}
          title={
            lastScanDate
              ? `Incremental scan since ${new Date(lastScanDate).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}`
              : "No prior scan — will run full scan on first use"
          }
          style={{
            background: scanning && scanMode === "fast"
              ? "var(--bg-elevated)"
              : "transparent",
            color: scanning && scanMode === "fast"
              ? "var(--text-muted)"
              : "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            padding: "6px 14px",
            cursor: scanning ? "wait" : "pointer",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: scanning && scanMode !== "fast" ? 0.5 : 1,
          }}
        >
          {scanning && scanMode === "fast" ? "Fast Scanning..." : "Fast Scan"}
          {lastScanDate && !scanning && (
            <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 4, textTransform: "none", fontWeight: 400 }}>
              since {new Date(lastScanDate).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}
            </span>
          )}
        </button>

        {/* Refresh */}
        <button
          onClick={fetchReport}
          style={{
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            color: "var(--text-secondary)",
            fontSize: 11,
            padding: "6px 10px",
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          Refresh
        </button>
      </div>

      {scanFeedback && (
        <div style={{ marginBottom: 20 }}>
          <ScanFeedbackBanner feedback={scanFeedback} />
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          Loading coverage report...
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 20,
            background: "var(--bg-card)",
            border: "1px solid var(--accent-pink)",
            borderRadius: 6,
            color: "var(--accent-pink)",
            fontSize: 12,
            marginBottom: 24,
          }}
        >
          Error: {error}
        </div>
      )}

      {/* Report Data */}
      {report && !loading && (
        <>
          {/* Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <SummaryCard
              label="Total Gaps"
              value={report.totalGaps}
              color="var(--accent-pink)"
            />
            {report.brands.map((b) => (
              <SummaryCard
                key={b.brand.id}
                label={b.brand.name}
                value={`${b.stats.totalPosts} posts · ${b.gaps.length} gaps`}
                sub={`${b.stats.recipePosts} recipe · ${b.stats.tastePosts} taste`}
              />
            ))}
          </div>

          {/* Content filter — editorial micro-toolbar */}
          {report.totalGaps > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}
              >
                Filter
              </span>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  width: 260,
                  maxWidth: "100%",
                }}
              >
                <label
                  htmlFor="coverage-content-search"
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0, 0, 0, 0)",
                    whiteSpace: "nowrap",
                    border: 0,
                  }}
                >
                  Search content
                </label>
                <input
                  id="coverage-content-search"
                  aria-label="Search content"
                  type="search"
                  value={contentSearch}
                  onChange={(e) => setContentSearch(e.target.value)}
                  placeholder="recipe, caption, or content…"
                  style={{
                    width: "100%",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                    fontSize: 12,
                    padding: "6px 28px 6px 10px",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                {contentSearch && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setContentSearch("")}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: 13,
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              {normalizedContentSearch && (
                <span
                  style={{
                    fontSize: 10,
                    color: visibleBrands.length > 0 ? "var(--text-muted)" : "var(--accent-pink)",
                    fontFamily: "var(--font-mono, monospace)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {visibleBrands.reduce((n, b) => n + b.gaps.filter(g => gapMatchesSearch(g, normalizedContentSearch)).length, 0)} matches
                </span>
              )}
            </div>
          )}

          {/* Brand Reports */}
          {visibleBrands.map((brandReport, i) => (
            <BrandReportSection
              key={brandReport.brand.id}
              report={brandReport}
              defaultExpanded={i === 0}
              searchQuery={normalizedContentSearch}
            />
          ))}

          {normalizedContentSearch && visibleBrands.length === 0 && report.totalGaps > 0 && (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 12,
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                background: "var(--bg-card)",
              }}
            >
              No content matched “{contentSearch.trim()}”. Adjust the search term and try again.
            </div>
          )}

          {/* Empty state */}
          {report.brands.every((b) => b.stats.totalPosts === 0) && (
            <div
              style={{
                padding: 60,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
                border: "1px dashed var(--border-subtle)",
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                No content data yet
              </div>
              <div>
                Click <strong>Run All Data Scan</strong> to ingest live content from
                all brand accounts. The latest saved snapshot stays visible until
                you run another scan.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 6,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: color || "var(--text-primary)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function ScanFeedbackBanner({ feedback }: { feedback: ScanFeedback }) {
  const tones: Record<
    ScanFeedback["tone"],
    { border: string; badgeBg: string; badgeFg: string; title: string }
  > = {
    success: {
      border: "rgba(52, 199, 89, 0.28)",
      badgeBg: "rgba(52, 199, 89, 0.14)",
      badgeFg: "var(--accent-green)",
      title: "var(--text-primary)",
    },
    warning: {
      border: "rgba(255, 159, 10, 0.28)",
      badgeBg: "rgba(255, 159, 10, 0.14)",
      badgeFg: "var(--accent-amber)",
      title: "var(--text-primary)",
    },
    error: {
      border: "rgba(255, 69, 58, 0.28)",
      badgeBg: "rgba(255, 69, 58, 0.14)",
      badgeFg: "var(--accent-pink)",
      title: "var(--text-primary)",
    },
    info: {
      border: "rgba(120, 120, 128, 0.24)",
      badgeBg: "rgba(120, 120, 128, 0.14)",
      badgeFg: "var(--text-secondary)",
      title: "var(--text-primary)",
    },
  };

  const tone = tones[feedback.tone];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: "var(--bg-card)",
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: tone.badgeFg,
          background: tone.badgeBg,
          borderRadius: 999,
          padding: "4px 8px",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {feedback.tone}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: tone.title,
            marginBottom: 4,
          }}
        >
          {feedback.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          {feedback.detail}
        </div>
      </div>
    </div>
  );
}

function BrandReportSection({
  report,
  defaultExpanded = true,
  searchQuery = "",
}: {
  report: BrandReport;
  defaultExpanded?: boolean;
  searchQuery?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showGaps, setShowGaps] = useState(true);
  const [showAccounts, setShowAccounts] = useState(false);
  const visibleGaps = searchQuery
    ? report.gaps.filter((gap) => gapMatchesSearch(gap, searchQuery))
    : report.gaps;

  // Group gaps by media format bucket
  const gapsByFormat: Record<MediaFormatBucket, GapInfo[]> = {
    short_video: [],
    long_video: [],
    photo_post: [],
    unclassified: [],
  };

  for (const gap of visibleGaps) {
    const bucket = gap.mediaFormat || "unclassified";
    gapsByFormat[bucket].push(gap);
  }

  // Build selectable tabs: the 3 main format buckets + unclassified if non-empty
  const tabs = [
    ...FORMAT_SECTIONS.map((s) => ({
      bucket: s.bucket,
      label: s.label,
      shortLabel: s.bucket === "short_video" ? "Short" : s.bucket === "long_video" ? "Long" : "Photo",
      description: s.description,
      icon: s.icon,
      count: gapsByFormat[s.bucket].length,
      muted: false,
    })),
    ...(gapsByFormat.unclassified.length > 0
      ? [{
          bucket: "unclassified" as MediaFormatBucket,
          label: "Other",
          shortLabel: "Other",
          description: "Format could not be determined from available metadata",
          icon: "·",
          count: gapsByFormat.unclassified.length,
          muted: true,
        }]
      : []),
  ];

  // Default to first non-empty tab in stable order, fallback to first tab
  const defaultTab =
    tabs.find((t) => t.count > 0)?.bucket || tabs[0]?.bucket || "short_video";

  const [activeFormatTab, setActiveFormatTab] =
    useState<MediaFormatBucket>(defaultTab);
  const resolvedActiveFormatTab =
    tabs.length === 0
      ? activeFormatTab
      : (gapsByFormat[activeFormatTab]?.length ?? 0) > 0
        ? activeFormatTab
        : (tabs.find((tab) => tab.count > 0)?.bucket || tabs[0].bucket);

  // Find active tab metadata
  const activeTabMeta =
    tabs.find((t) => t.bucket === resolvedActiveFormatTab) || tabs[0];
  const activeGaps = gapsByFormat[resolvedActiveFormatTab] || [];

  return (
    <div
      data-testid="brand-section"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      {/* Brand Header — clickable disclosure control */}
      <div
        data-testid="brand-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid",
          borderBottomColor: isExpanded ? "var(--border-subtle)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
          transition: "border-bottom-color 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Chevron */}
          <span
            data-testid="brand-chevron"
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              transition: "transform 0.15s",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              display: "inline-block",
              width: 12,
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            ▶
          </span>
          <div>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {report.brand.name}
            </h2>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              {report.brand.accountCount} accounts ·{" "}
              {report.stats.totalPosts} posts ·{" "}
              <span style={{ color: "var(--accent-green)" }}>
                {report.stats.recipePosts + report.stats.tastePosts} recipe/taste
              </span>{" "}
              ·{" "}
              <span style={{ color: "var(--text-muted)" }}>
                {report.stats.specialDayPosts} special-day (excluded)
              </span>
              {!isExpanded && report.gaps.length > 0 && (
                <>
                  {" "}·{" "}
                  <span style={{ color: "var(--accent-pink)" }}>
                    {report.gaps.length} gaps
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Controls — only visible when expanded */}
        {isExpanded && (
          <div
            style={{ display: "flex", gap: 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <MiniButton
              active={showAccounts}
              onClick={() => setShowAccounts(!showAccounts)}
            >
              Accounts
            </MiniButton>
            <MiniButton
              active={showGaps}
              onClick={() => setShowGaps(!showGaps)}
            >
              {searchQuery
                ? `Gaps (${visibleGaps.length}/${report.gaps.length})`
                : `Gaps (${report.gaps.length})`}
            </MiniButton>
          </div>
        )}
      </div>

      {/* Collapsible inner content */}
      {isExpanded && (
        <>
          {/* Accounts panel */}
          {showAccounts && (
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                {report.brand.accounts.map((acc, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "8px 12px",
                      background: "var(--bg-primary)",
                      borderRadius: 4,
                      border: "1px solid var(--border-subtle)",
                      fontSize: 11,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          textTransform: "capitalize",
                        }}
                      >
                        {PLATFORM_LABELS[acc.platform] || acc.platform}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background:
                            acc.verificationStatus === "verified"
                              ? "rgba(52, 199, 89, 0.15)"
                              : "rgba(255, 149, 0, 0.15)",
                          color:
                            acc.verificationStatus === "verified"
                              ? "var(--accent-green)"
                              : "var(--accent-amber)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                        }}
                      >
                        {acc.verificationStatus}
                      </span>
                    </div>
                    <div style={{ color: "var(--text-secondary)" }}>
                      @{acc.handle}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 10 }}>
                      via {acc.providerPath}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Format-Tabbed Gap Section */}
          {showGaps && visibleGaps.length > 0 && (
            <div>
              {/* Format selector — segmented control matching site design language */}
              <div
                data-testid="format-tab-bar"
                style={{
                  display: "flex",
                  gap: 6,
                  padding: "10px 20px",
                  borderBottom: "1px solid var(--border-subtle)",
                  overflowX: "auto",
                  flexWrap: "nowrap",
                }}
              >
                {tabs.map((tab) => {
                  const isActive = tab.bucket === resolvedActiveFormatTab;
                  return (
                    <button
                      key={tab.bucket}
                      data-testid={`format-tab-${tab.bucket}`}
                      onClick={() => setActiveFormatTab(tab.bucket)}
                      style={{
                        background: isActive ? "var(--bg-elevated)" : "transparent",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 4,
                        color: isActive
                          ? "var(--text-primary)"
                          : tab.muted
                            ? "var(--text-muted)"
                            : "var(--text-secondary)",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "4px 10px",
                        cursor: "pointer",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "background 0.1s, color 0.1s",
                      }}
                    >
                      {tab.label}
                      {/* Count badge */}
                      <span
                        data-testid={`format-tab-count-${tab.bucket}`}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: isActive
                            ? tab.count > 0 ? "var(--text-primary)" : "var(--text-muted)"
                            : tab.count > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                          opacity: tab.count === 0 ? 0.5 : 1,
                        }}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active tab content — only ONE section rendered at a time */}
              {activeTabMeta && (
                <FormatSection
                  key={resolvedActiveFormatTab}
                  label={activeTabMeta.label}
                  description={activeTabMeta.description}
                  icon={activeTabMeta.icon}
                  gaps={activeGaps}
                />
              )}
            </div>
          )}

          {/* No gaps */}
          {showGaps && visibleGaps.length === 0 && report.stats.totalPosts > 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: searchQuery ? "var(--text-muted)" : "var(--accent-green)",
                fontSize: 12,
              }}
            >
              {searchQuery
                ? "No visible content matched this search"
                : "✓ Full coverage — no content gaps detected"}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format Section — grouped table per media format bucket
// ---------------------------------------------------------------------------

function FormatSection({
  label,
  description,
  icon,
  gaps,
}: {
  label: string;
  description: string;
  icon: string;
  gaps: GapInfo[];
}) {
  const isEmpty = gaps.length === 0;

  return (
    <div
      data-testid="format-section-content"
      style={{
      }}
    >
      {/* Sub-description */}
      <div
        style={{
          padding: "8px 20px",
          fontSize: 10,
          color: "var(--text-muted)",
          borderBottom: isEmpty ? "none" : "1px solid var(--border-subtle)",
        }}
      >
        {description}
      </div>

      {/* Empty state for selected tab */}
      {isEmpty && (
        <div
          data-testid="format-section-empty"
          style={{
            padding: "32px 20px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          <div style={{ marginBottom: 4, fontSize: 18, opacity: 0.4 }}>{icon}</div>
          No gaps in {label.toLowerCase()}
        </div>
      )}

      {/* Table */}
      {!isEmpty && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <th style={thStyle}>Content</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>IG</th>
                <th style={thStyle}>TT</th>
                <th style={thStyle}>FB</th>
                <th style={thStyle}>YT</th>
                <th style={thStyle}>PT</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr
                  key={gap.clusterId}
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <td style={tdStyle}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: 2,
                      }}
                    >
                      {gap.recipeName || "Untitled"}
                    </div>
                    {gap.primaryCaption && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          maxWidth: 300,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {gap.primaryCaption}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <TypeBadge type={gap.contentType} />
                  </td>
                  <td style={tdStyle}>
                    {new Date(gap.firstSeenAt).toLocaleDateString("tr-TR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  {/* Source platforms */}
                  <PlatformCell
                    presence={gap.sourcePlatforms.find(
                      (p) => p.platform === "instagram"
                    )}
                  />
                  <PlatformCell
                    presence={gap.sourcePlatforms.find(
                      (p) => p.platform === "tiktok"
                    )}
                  />
                  {/* Destination platforms */}
                  <PlatformCell
                    presence={gap.destinationPlatforms.find(
                      (p) => p.platform === "facebook"
                    )}
                  />
                  <PlatformCell
                    presence={gap.destinationPlatforms.find(
                      (p) => p.platform === "youtube"
                    )}
                  />
                  <PlatformCell
                    presence={gap.destinationPlatforms.find(
                      (p) => p.platform === "pinterest"
                    )}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



// ---------------------------------------------------------------------------
// Micro-components
// ---------------------------------------------------------------------------

function MiniButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--bg-elevated)" : "transparent",
        border: "1px solid var(--border-subtle)",
        borderRadius: 4,
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        fontSize: 10,
        fontWeight: 600,
        padding: "4px 10px",
        cursor: "pointer",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}

function PlatformCell({
  presence,
}: {
  presence?: PlatformPresence;
}) {
  if (!presence) {
    return (
      <td style={tdStyle}>
        <span style={{ color: "var(--text-muted)" }}>—</span>
      </td>
    );
  }

  const colors: Record<string, string> = {
    present: "var(--accent-green)",
    missing: "var(--accent-pink)",
    unknown: "var(--accent-amber)",
    not_applicable: "var(--text-muted)",
  };

  const isClickable = presence.status === "present" && !!presence.permalink;

  const icon = (
    <span
      style={{
        color: colors[presence.status] || "var(--text-muted)",
        fontWeight: presence.status === "missing" ? 700 : 400,
        fontSize: 13,
      }}
      title={presence.statusReason || `${presence.platform}: ${presence.status}`}
    >
      {STATUS_ICONS[presence.status] || "?"}
    </span>
  );

  if (isClickable) {
    return (
      <td style={tdStyle}>
        <a
          href={presence.permalink!}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
          title={`Open on ${PLATFORM_LABELS[presence.platform] || presence.platform}`}
        >
          {icon}
          <span
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              opacity: 0.6,
            }}
          >
            ↗
          </span>
        </a>
      </td>
    );
  }

  return (
    <td style={tdStyle}>
      {icon}
    </td>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    recipe: { bg: "rgba(52, 199, 89, 0.12)", fg: "var(--accent-green)" },
    taste: { bg: "rgba(0, 122, 255, 0.12)", fg: "var(--accent-blue)" },
    special_day: { bg: "rgba(255, 149, 0, 0.12)", fg: "var(--accent-amber)" },
  };
  const c = colors[type] || { bg: "var(--bg-elevated)", fg: "var(--text-muted)" };

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 3,
        background: c.bg,
        color: c.fg,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
  color: "var(--text-secondary)",
};
