"use client";

import type { PlatformAnalysis, Platform } from "@/lib/domain/types";
import type { BatchRowResult } from "@/lib/domain/batch-types";
import { formatNumber } from "@/lib/format";
import { sourceLabel } from "@/lib/format";
import { BenchmarkPanel } from "./BenchmarkDisplay";
import { VisibilityIntelligencePanel } from "./VisibilityIntelligencePanel";
import { BudgetWorkbench } from "./BudgetWorkbench";

// ---------------------------------------------------------------------------
// StatCell
// ---------------------------------------------------------------------------

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{label}</p>
      <p className="text-base font-semibold" style={{ color: accent ? "var(--accent-green)" : "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile Card
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

// ---------------------------------------------------------------------------
// Selected Row Detail Panel
// ---------------------------------------------------------------------------

export function SelectedRowDetail({
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
