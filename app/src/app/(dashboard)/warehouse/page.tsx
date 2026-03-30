"use client";

/**
 * Influencer Warehouse — Creator Database
 *
 * Shows every influencer as merged identity rows (IG + TT combined).
 * Click a row to expand inline and see organic/commercial benchmark summaries.
 *
 * Responsive design: table ≥768px, card layout <768px.
 * Benchmark cards stack below 900px.
 */

import React, { useState, useEffect, useCallback, Fragment } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BenchmarkItem = {
  id: string;
  views: number | null;
  caption: string | null;
  permalink: string;
  timestamp: string;
  isCommercial: boolean;
  classificationCategory: string | null;
};

type BenchmarkSummary = {
  organicAvg: number | null;
  organicSampleSize: number;
  organicStatus: string;
  organicItems: BenchmarkItem[];
  commercialAvg: number | null;
  commercialSampleSize: number;
  commercialStatus: string;
  commercialItems: BenchmarkItem[];
  adToOrganicRatio: number | null;
  totalContentCount: number;
};

type PlatformScanData = {
  platform: string;
  username: string;
  lastScanAt: string;
  expiresAt: string;
  freshness: "fresh" | "stale" | "expired";
  providerSource: string;
  scanCount: number;
  profileName: string | null;
  profileFollowers: number | null;
  profileFollowing: number | null;
  profilePicUrl: string | null;
  isVerified: boolean;
  contentCount: number;
  benchmark: BenchmarkSummary | null;
};

type WarehouseIdentity = {
  id: string;
  displayName: string | null;
  instagramUsername: string | null;
  tiktokUsername: string | null;
  freshness: "fresh" | "stale" | "expired";
  lastScanAt: string;
  totalScans: number;
  platforms: PlatformScanData[];
};

type WarehouseResponse = {
  identities: WarehouseIdentity[];
  totalCount: number;
  freshCount: number;
  staleCount: number;
  expiredCount: number;
};

// ---------------------------------------------------------------------------
// Responsive Hook
// ---------------------------------------------------------------------------

type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("xl");

  useEffect(() => {
    function calc() {
      const w = window.innerWidth;
      if (w < 640) setBp("xs");
      else if (w < 768) setBp("sm");
      else if (w < 1024) setBp("md");
      else if (w < 1280) setBp("lg");
      else setBp("xl");
    }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return bp;
}

/** True when viewport is below the table breakpoint */
function isCompact(bp: Breakpoint): boolean {
  return bp === "xs" || bp === "sm";
}

/** True when benchmark cards should stack */
function shouldStack(bp: Breakpoint): boolean {
  return bp === "xs" || bp === "sm" || bp === "md";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoDate: string): string {
  if (!isoDate) return "—";
  const ms = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function timeUntil(isoDate: string): string {
  if (!isoDate) return "—";
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function freshnessColor(f: string): string {
  if (f === "fresh") return "var(--accent-green)";
  if (f === "stale") return "var(--accent-amber)";
  return "var(--accent-red)";
}

function platformIcon(p: string): string {
  return p === "instagram" ? "📸" : p === "tiktok" ? "🎵" : "📊";
}

function statusColor(s: string): string {
  if (s === "complete") return "var(--accent-green)";
  if (s === "partial") return "var(--accent-amber)";
  return "var(--text-muted)";
}

function truncate(s: string | null, max: number): string {
  if (!s) return "No caption";
  return s.length > max ? s.substring(0, max) + "…" : s;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return "—"; }
}

function categoryLabel(cat: string | null): string {
  if (!cat) return "AD";
  const map: Record<string, string> = {
    paid_partnership_tag: "PAID",
    brand_mention: "BRAND",
    ad_disclosure: "#AD",
    promotional_language: "PROMO",
  };
  return map[cat] ?? "AD";
}

// ---------------------------------------------------------------------------
// Content Item List — matches workspace display
// ---------------------------------------------------------------------------

function ContentItemList({
  label,
  items,
  accentColor,
  compact,
}: {
  label: string;
  items: BenchmarkItem[];
  accentColor: string;
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  const captionMax = compact ? 35 : 55;
  return (
    <div style={{ marginTop: "10px" }}>
      <div
        style={{
          fontSize: "9px",
          fontWeight: 600,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.05em",
          marginBottom: "6px",
        }}
      >
        {label.toUpperCase()} · {items.length} ITEMS
      </div>
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: "4px",
          overflow: "hidden",
          backgroundColor: "var(--bg-secondary)",
        }}
      >
        {items.map((item, i) => (
          <div
            key={item.id + "-" + i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: compact ? "6px" : "8px",
              padding: compact ? "5px 8px" : "6px 10px",
              borderBottom:
                i < items.length - 1
                  ? "1px solid var(--border-subtle)"
                  : "none",
            }}
          >
            <span
              style={{
                fontSize: compact ? "10px" : "11px",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color:
                  item.views !== null ? accentColor : "var(--text-muted)",
                minWidth: compact ? "42px" : "52px",
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {formatNumber(item.views)}
            </span>
            <span
              style={{
                fontSize: "10px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {truncate(item.caption, captionMax)}
            </span>
            {item.isCommercial && (
              <span
                style={{
                  fontSize: "9px",
                  padding: "1px 5px",
                  borderRadius: "3px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  backgroundColor: "rgba(236, 72, 153, 0.08)",
                  color: "rgb(236, 72, 153)",
                  flexShrink: 0,
                }}
              >
                {categoryLabel(item.classificationCategory)}
              </span>
            )}
            <span
              style={{
                fontSize: "9px",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
              }}
            >
              {formatDate(item.timestamp)}
            </span>
            {!compact && item.permalink && (
              <a
                href={item.permalink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  color: "var(--text-muted)",
                  fontSize: "10px",
                  flexShrink: 0,
                  opacity: 0.4,
                  textDecoration: "none",
                }}
              >
                ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Detail Row — Benchmark Cards (used inside table)
// ---------------------------------------------------------------------------

function InlineDetail({ identity, stacked }: { identity: WarehouseIdentity; stacked?: boolean }) {
  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, borderBottom: "1px solid var(--border-subtle)", overflow: "hidden" }}>
        <BenchmarkDetailPanel identity={identity} stacked={stacked} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Shared Benchmark Detail — used by both table inline and card expand
// ---------------------------------------------------------------------------

function BenchmarkDetailPanel({ identity, stacked }: { identity: WarehouseIdentity; stacked?: boolean }) {
  return (
    <div
      style={{
        padding: stacked ? "12px 0 16px" : "16px 12px 20px",
        backgroundColor: "var(--bg-secondary)",
        borderTop: stacked ? "none" : "1px solid var(--border-subtle)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            identity.platforms.length > 1 && !stacked ? "1fr 1fr" : "1fr",
          gap: "12px",
          minWidth: 0,
        }}
      >
        {identity.platforms.map((p) => (
          <PlatformBenchmarkCard key={p.platform} data={p} compact={stacked} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform Benchmark Card
// ---------------------------------------------------------------------------

function PlatformBenchmarkCard({ data, compact }: { data: PlatformScanData; compact?: boolean }) {
  const isIG = data.platform === "instagram";
  const contentLabel = isIG ? "REELS" : "VIDEOS";
  const b = data.benchmark;

  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "6px",
        padding: compact ? "12px" : "14px",
        backgroundColor: "var(--bg-primary)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: freshnessColor(data.freshness),
            }}
          />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              color: "var(--text-primary)",
              textTransform: "uppercase",
            }}
          >
            {data.platform}
          </span>
        </div>
        <span
          style={{
            fontSize: "9px",
            padding: "2px 8px",
            borderRadius: "3px",
            fontFamily: "var(--font-mono)",
            fontWeight: 500,
            color: "var(--accent-blue)",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
          }}
        >
          {data.providerSource === "meta"
            ? "Meta API"
            : data.providerSource.includes("apify")
              ? "Apify Live"
              : data.providerSource}
        </span>
      </div>

      {/* Profile row — responsive: stacks stats on compact */}
      <div
        style={{
          display: "flex",
          alignItems: compact ? "flex-start" : "center",
          flexDirection: compact ? "column" : "row",
          gap: compact ? "10px" : "10px",
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {data.profilePicUrl ? (
            <img
              src={data.profilePicUrl}
              alt=""
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid var(--border-subtle)",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                backgroundColor: "var(--bg-tertiary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                color: "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              {data.username[0]?.toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                color: "var(--text-primary)",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              @{data.username}
              {data.isVerified && (
                <span style={{ marginLeft: "4px", color: "var(--accent-blue)" }}>✓</span>
              )}
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {data.profileName}
            </div>
          </div>
        </div>
        {/* Stats — horizontal on desktop, 3-col grid on compact */}
        <div
          style={{
            display: "flex",
            gap: compact ? "12px" : "16px",
            ...(compact ? {} : { marginLeft: "auto" }),
          }}
        >
          {[
            { label: "Followers", value: formatNumber(data.profileFollowers), color: "var(--accent-green)" },
            { label: "Following", value: formatNumber(data.profileFollowing), color: "var(--text-primary)" },
            { label: "Content", value: String(data.contentCount), color: "var(--text-primary)" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: compact ? "left" : "right" }}>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {s.label}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: s.color,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Benchmark grid */}
      {b ? (
        <div>
          <div
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              marginBottom: "10px",
              paddingTop: "10px",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {isIG ? "INSTAGRAM" : "TIKTOK"} BENCHMARK
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {/* Organic */}
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "4px",
                padding: compact ? "8px 10px" : "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.04em",
                  marginBottom: "4px",
                }}
              >
                ORGANIC {contentLabel}
              </div>
              <div
                style={{
                  fontSize: compact ? "16px" : "18px",
                  fontWeight: 700,
                  color: "var(--accent-green)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {b.organicAvg !== null ? formatNumber(b.organicAvg) : "—"}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  marginTop: "4px",
                }}
              >
                <span
                  style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: statusColor(b.organicStatus),
                  }}
                />
                <span
                  style={{
                    fontSize: "9px",
                    color: statusColor(b.organicStatus),
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {b.organicSampleSize}/5
                  {b.organicStatus === "partial" && " · Insufficient"}
                </span>
              </div>
            </div>

            {/* Commercial */}
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "4px",
                padding: compact ? "8px 10px" : "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.04em",
                  marginBottom: "4px",
                }}
              >
                COMMERCIAL {contentLabel}
              </div>
              <div
                style={{
                  fontSize: compact ? "16px" : "18px",
                  fontWeight: 700,
                  color:
                    b.commercialAvg !== null
                      ? "var(--accent-amber)"
                      : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {b.commercialAvg !== null ? formatNumber(b.commercialAvg) : "—"}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  marginTop: "4px",
                }}
              >
                <span
                  style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: statusColor(b.commercialStatus),
                  }}
                />
                <span
                  style={{
                    fontSize: "9px",
                    color: statusColor(b.commercialStatus),
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {b.commercialSampleSize}/5
                  {b.commercialStatus === "partial" && " · Insufficient"}
                </span>
              </div>
            </div>
          </div>

          {/* Ad/Organic Ratio */}
          {b.adToOrganicRatio !== null && (
            <div
              style={{
                marginTop: "8px",
                padding: "6px 12px",
                border: "1px solid var(--border-subtle)",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                AD/ORGANIC RATIO
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color:
                    b.adToOrganicRatio >= 1
                      ? "var(--accent-green)"
                      : "var(--accent-red)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {Math.round(b.adToOrganicRatio * 100)}%
              </span>
            </div>
          )}

          {/* Content Item Lists */}
          {b.organicItems.length > 0 && (
            <ContentItemList
              label={`Organic ${contentLabel}`}
              items={b.organicItems}
              accentColor="var(--accent-green)"
              compact={compact}
            />
          )}
          {b.commercialItems.length > 0 && (
            <ContentItemList
              label={`Commercial ${contentLabel}`}
              items={b.commercialItems}
              accentColor="var(--accent-amber)"
              compact={compact}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            textAlign: "center",
            padding: "16px 0",
            fontStyle: "italic",
            borderTop: "1px solid var(--border-subtle)",
            marginTop: "10px",
          }}
        >
          {data.freshness === "expired"
            ? "Cache expired — rescan to view benchmarks"
            : "No benchmark data available"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Card — used <768px instead of table rows
// ---------------------------------------------------------------------------

function CreatorCard({
  identity,
  isExpanded,
  onToggle,
}: {
  identity: WarehouseIdentity;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const bestPic = identity.platforms.find((p) => p.profilePicUrl)?.profilePicUrl;
  const bestName = identity.platforms.find((p) => p.profileName)?.profileName ?? null;
  const bestFollowers = identity.platforms.reduce(
    (max, p) => ((p.profileFollowers ?? 0) > max ? (p.profileFollowers ?? 0) : max),
    0
  ) || null;

  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "6px",
        overflow: "hidden",
        backgroundColor: isExpanded ? "var(--bg-secondary)" : "var(--bg-primary)",
        transition: "background-color 0.12s ease",
      }}
    >
      {/* Card header — tappable */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "12px",
          cursor: "pointer",
        }}
      >
        {/* Chevron */}
        <span
          style={{
            display: "inline-block",
            color: "var(--text-muted)",
            fontSize: "8px",
            transition: "transform 0.2s ease",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            opacity: 0.5,
            flexShrink: 0,
          }}
        >
          ▶
        </span>

        {/* Avatar */}
        {bestPic ? (
          <img
            src={bestPic}
            alt=""
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid var(--border-subtle)",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "var(--bg-tertiary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
              flexShrink: 0,
            }}
          >
            {(identity.displayName || identity.instagramUsername || identity.tiktokUsername || "?")[0]?.toUpperCase()}
          </div>
        )}

        {/* Name + handles */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div
            style={{
              fontWeight: 600,
              color: "var(--text-primary)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {bestName || identity.displayName || identity.instagramUsername || identity.tiktokUsername}
            {bestFollowers && (
              <span style={{ marginLeft: "6px", fontSize: "10px", fontWeight: 500, color: "var(--text-muted)" }}>
                {formatNumber(bestFollowers)}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              marginTop: "1px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {identity.instagramUsername && <span>@{identity.instagramUsername}</span>}
            {identity.instagramUsername && identity.tiktokUsername && (
              <span style={{ margin: "0 4px", color: "var(--border-default)" }}>·</span>
            )}
            {identity.tiktokUsername && <span>@{identity.tiktokUsername}</span>}
          </div>
        </div>

        {/* Status + meta */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 6px",
              borderRadius: "3px",
              fontSize: "9px",
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              color: freshnessColor(identity.freshness),
              backgroundColor: `color-mix(in srgb, ${freshnessColor(identity.freshness)} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${freshnessColor(identity.freshness)} 20%, transparent)`,
            }}
          >
            <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: freshnessColor(identity.freshness) }} />
            {identity.freshness}
          </span>
          <span style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {timeAgo(identity.lastScanAt)}
          </span>
        </div>
      </div>

      {/* Platform badges */}
      <div style={{ display: "flex", gap: "4px", padding: "0 12px 10px 46px" }}>
        {identity.platforms.map((p) => (
          <span
            key={p.platform}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
              padding: "2px 6px",
              borderRadius: "3px",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {platformIcon(p.platform)} {p.platform === "instagram" ? "IG" : "TT"}
          </span>
        ))}
        <span style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginLeft: "auto", alignSelf: "center" }}>
          {identity.totalScans}× scans
        </span>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <BenchmarkDetailPanel identity={identity} stacked />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module-level cache — survives route transitions for instant re-render
// ---------------------------------------------------------------------------
let _warehouseCache: WarehouseResponse | null = null;

export default function WarehousePage() {
  const bp = useBreakpoint();
  const compact = isCompact(bp);
  const stackBenchmarks = shouldStack(bp);

  // Initialize from cache — no loading flash on revisit
  const [data, setData] = useState<WarehouseResponse | null>(_warehouseCache);
  const [loading, setLoading] = useState(_warehouseCache === null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "all" | "fresh" | "stale" | "expired"
  >("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    // Only show loading spinner on first fetch (no cache)
    if (!_warehouseCache) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/warehouse");
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      _warehouseCache = json;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = (data?.identities ?? []).filter((identity) => {
    if (filter !== "all" && identity.freshness !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matches =
        identity.instagramUsername?.includes(q) ||
        identity.tiktokUsername?.includes(q) ||
        identity.displayName?.toLowerCase().includes(q) ||
        identity.platforms.some((p) =>
          p.profileName?.toLowerCase().includes(q)
        );
      if (!matches) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: compact ? "14px" : "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: compact ? "flex-start" : "center",
            justifyContent: "space-between",
            flexDirection: compact ? "column" : "row",
            gap: compact ? "10px" : "0",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: compact ? "12px" : "13px",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              CREATORS
            </h1>
            <p
              style={{
                fontSize: compact ? "10px" : "11px",
                color: "var(--text-muted)",
                margin: "4px 0 0 0",
                fontFamily: "var(--font-mono)",
              }}
            >
              All scanned creators — click {compact ? "" : "a row "}to view benchmarks
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              padding: "5px 12px",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              letterSpacing: "0.05em",
              color: "var(--text-primary)",
              backgroundColor: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              transition: "all 0.15s ease",
              alignSelf: compact ? "flex-end" : "auto",
            }}
          >
            {loading ? "LOADING…" : "REFRESH"}
          </button>
        </div>

        {/* Stats */}
        {data && (
          <div
            style={{
              display: "flex",
              gap: compact ? "10px" : "16px",
              flexWrap: "wrap",
              marginTop: compact ? "10px" : "14px",
              padding: compact ? "8px 10px" : "10px 14px",
              backgroundColor: "var(--bg-secondary)",
              borderRadius: "6px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {[
              { label: "Total", value: data.totalCount, color: "var(--text-primary)" },
              { label: "Fresh", value: data.freshCount, color: "var(--accent-green)" },
              { label: "Stale", value: data.staleCount, color: "var(--accent-amber)" },
              { label: "Expired", value: data.expiredCount, color: "var(--accent-red)" },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span
                  style={{
                    fontSize: compact ? "14px" : "16px",
                    fontWeight: 700,
                    color: s.color,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {s.value}
                </span>
                <span
                  style={{
                    fontSize: compact ? "9px" : "10px",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginTop: "12px",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="Search username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "5px 10px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "4px",
              outline: "none",
              flex: compact ? "1 1 100%" : "0 0 auto",
              width: compact ? "100%" : "180px",
              minWidth: "120px",
              boxSizing: "border-box",
            }}
          />
          {(["all", "fresh", "stale", "expired"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: compact ? "5px 8px" : "4px 10px",
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: filter === f ? "var(--text-primary)" : "var(--text-muted)",
                backgroundColor: filter === f ? "var(--bg-tertiary)" : "transparent",
                border: `1px solid ${filter === f ? "var(--border-default)" : "var(--border-subtle)"}`,
                borderRadius: "4px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "6px",
            color: "var(--accent-red)",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
          }}
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: compact ? "40px 16px" : "60px 20px",
            color: "var(--text-muted)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div style={{ fontSize: "28px", marginBottom: "12px" }}>📦</div>
          <div style={{ fontWeight: 600, marginBottom: "4px", color: "var(--text-secondary)" }}>
            No creators in warehouse
          </div>
          <div>Scan influencers from the Workspace to populate this database.</div>
        </div>
      )}

      {/* ═══════════ COMPACT: Card Layout (<768px) ═══════════ */}
      {compact && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map((identity) => (
            <CreatorCard
              key={identity.id}
              identity={identity}
              isExpanded={expandedId === identity.id}
              onToggle={() => setExpandedId(expandedId === identity.id ? null : identity.id)}
            />
          ))}
        </div>
      )}

      {/* ═══════════ TABLE: Desktop Layout (≥768px) ═══════════ */}
      {!compact && filtered.length > 0 && (
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
            }}
          >
            {/* chevron | creator (auto) | platforms | status | last scan | expires | scans */}
            <colgroup><col style={{ width: "28px" }} /><col /><col style={{ width: "120px" }} /><col style={{ width: "90px" }} /><col style={{ width: "90px" }} /><col style={{ width: "70px" }} /><col style={{ width: "56px" }} /></colgroup>
            <thead>
              <tr
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <th style={{ padding: "8px 4px", borderBottom: "1px solid var(--border-subtle)" }} />
                {[
                  { label: "CREATOR", align: "left" as const },
                  { label: "PLATFORMS", align: "left" as const },
                  { label: "STATUS", align: "left" as const },
                  { label: "LAST SCAN", align: "left" as const },
                  { label: "EXPIRES", align: "left" as const },
                  { label: "SCANS", align: "right" as const },
                ].map((h) => (
                  <th
                    key={h.label}
                    style={{
                      padding: "8px 10px",
                      textAlign: h.align,
                      fontSize: "9px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: "var(--text-muted)",
                      borderBottom: "1px solid var(--border-subtle)",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((identity, i) => {
                const isExpanded = expandedId === identity.id;
                const bestPic = identity.platforms.find(
                  (p) => p.profilePicUrl
                )?.profilePicUrl;
                const bestName =
                  identity.platforms.find((p) => p.profileName)
                    ?.profileName ?? null;
                const bestFollowers =
                  identity.platforms.reduce(
                    (max, p) =>
                      (p.profileFollowers ?? 0) > max
                        ? (p.profileFollowers ?? 0)
                        : max,
                    0
                  ) || null;
                const bestExpiry = identity.platforms.reduce(
                  (best, p) =>
                    p.expiresAt &&
                    new Date(p.expiresAt).getTime() >
                      new Date(best || "").getTime()
                      ? p.expiresAt
                      : best,
                  ""
                );

                return (
                  <Fragment key={identity.id}>
                    <tr
                      onClick={() =>
                        setExpandedId(isExpanded ? null : identity.id)
                      }
                      style={{
                        borderBottom: isExpanded
                          ? "none"
                          : i < filtered.length - 1
                            ? "1px solid var(--border-subtle)"
                            : "none",
                        cursor: "pointer",
                        transition: "background-color 0.12s ease",
                        backgroundColor: isExpanded
                          ? "var(--bg-secondary)"
                          : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded)
                          e.currentTarget.style.backgroundColor =
                            "var(--bg-secondary)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded)
                          e.currentTarget.style.backgroundColor =
                            "transparent";
                      }}
                    >
                      {/* Chevron — far left */}
                      <td
                        style={{
                          padding: "10px 0 10px 10px",
                          verticalAlign: "middle",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            color: "var(--text-muted)",
                            fontSize: "8px",
                            transition: "transform 0.2s ease",
                            transform: isExpanded
                              ? "rotate(90deg)"
                              : "rotate(0deg)",
                            opacity: 0.5,
                          }}
                        >
                          ▶
                        </span>
                      </td>

                      {/* Creator */}
                      <td
                        style={{
                          padding: "10px 10px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            overflow: "hidden",
                          }}
                        >
                          {bestPic ? (
                            <img
                              src={bestPic}
                              alt=""
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid var(--border-subtle)",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                backgroundColor: "var(--bg-tertiary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "12px",
                                fontWeight: 600,
                                color: "var(--text-muted)",
                                border:
                                  "1px solid var(--border-subtle)",
                                flexShrink: 0,
                              }}
                            >
                              {(
                                identity.displayName ||
                                identity.instagramUsername ||
                                identity.tiktokUsername ||
                                "?"
                              )[0]?.toUpperCase()}
                            </div>
                          )}
                          <div style={{ overflow: "hidden", minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                fontSize: "12px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {bestName ||
                                identity.displayName ||
                                identity.instagramUsername ||
                                identity.tiktokUsername}
                              {bestFollowers && (
                                <span
                                  style={{
                                    marginLeft: "6px",
                                    fontSize: "10px",
                                    fontWeight: 500,
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  {formatNumber(bestFollowers)}
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "10px",
                                color: "var(--text-muted)",
                                marginTop: "1px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {identity.instagramUsername && (
                                <span>
                                  @{identity.instagramUsername}
                                </span>
                              )}
                              {identity.instagramUsername &&
                                identity.tiktokUsername && (
                                  <span
                                    style={{
                                      margin: "0 4px",
                                      color: "var(--border-default)",
                                    }}
                                  >
                                    ·
                                  </span>
                                )}
                              {identity.tiktokUsername && (
                                <span>
                                  @{identity.tiktokUsername}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Platforms */}
                      <td style={{ padding: "10px 10px" }}>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "nowrap" }}>
                          {identity.platforms.map((p) => (
                            <span
                              key={p.platform}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                padding: "2px 6px",
                                borderRadius: "3px",
                                fontSize: "10px",
                                backgroundColor: "var(--bg-tertiary)",
                                color: "var(--text-secondary)",
                                border:
                                  "1px solid var(--border-subtle)",
                              }}
                            >
                              {platformIcon(p.platform)}{" "}
                              {p.platform === "instagram"
                                ? "IG"
                                : "TT"}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "10px 10px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "2px 8px",
                            borderRadius: "3px",
                            fontSize: "10px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            color: freshnessColor(identity.freshness),
                            backgroundColor: `color-mix(in srgb, ${freshnessColor(identity.freshness)} 12%, transparent)`,
                            border: `1px solid color-mix(in srgb, ${freshnessColor(identity.freshness)} 20%, transparent)`,
                          }}
                        >
                          <span
                            style={{
                              width: "5px",
                              height: "5px",
                              borderRadius: "50%",
                              backgroundColor: freshnessColor(
                                identity.freshness
                              ),
                            }}
                          />
                          {identity.freshness}
                        </span>
                      </td>

                      {/* Last Scan */}
                      <td
                        style={{
                          padding: "10px 10px",
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                        title={new Date(
                          identity.lastScanAt
                        ).toLocaleString()}
                      >
                        {timeAgo(identity.lastScanAt)}
                      </td>

                      {/* Expires */}
                      <td
                        style={{
                          padding: "10px 10px",
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {identity.freshness === "expired" ? (
                          <span style={{ color: "var(--text-muted)" }}>
                            —
                          </span>
                        ) : (
                          timeUntil(bestExpiry)
                        )}
                      </td>

                      {/* Scans */}
                      <td
                        style={{
                          padding: "10px 10px",
                          color: "var(--text-secondary)",
                          textAlign: "right",
                        }}
                      >
                        {identity.totalScans}×
                      </td>
                    </tr>

                    {/* Inline expandable detail */}
                    {isExpanded && (
                      <InlineDetail
                        key={`detail-${identity.id}`}
                        identity={identity}
                        stacked={stackBenchmarks}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {filtered.length > 0 && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "4px",
          }}
        >
          <span>
            Showing {filtered.length} of {data?.totalCount ?? 0} creators
          </span>
          <span>Auto-refreshes every 30s</span>
        </div>
      )}
    </div>
  );
}
