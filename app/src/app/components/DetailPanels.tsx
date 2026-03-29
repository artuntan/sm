"use client";

/**
 * DetailPanels — Extracted Rich Components for Deep Analysis
 *
 * Reused in:
 * - Batch workspace selected-row detail view
 * - (Legacy) single-creator page layout
 *
 * Components: ProfileCard, BenchmarkPanel, BucketCard, ComparisonRow,
 * ContentList, VisibilityIntelligencePanel, BudgetWorkbench
 */

import { useState, useCallback } from "react";
import type {
  BenchmarkBucket,
  ClassifiedReel,
  ClassifiedItem,
  ComparisonMetrics,
  PlatformAnalysis,
  ProviderSource,
  StoryVisibility,
  CarouselVisibility,
  DeliverableType,
  QuoteSourceMode,
  DeliverableQuote,
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

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatNumber(n: number | null | undefined): string {
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

export function sourceLabel(source: ProviderSource): string {
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
// Profile Card
// ---------------------------------------------------------------------------

export function ProfileCard({
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
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: isError ? "var(--status-muted)" : accentColor }}
          />
          <span
            className="text-xs font-medium tracking-wider"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
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
          <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
            @{analysis?.username || "—"}
          </p>
          <p className="text-xs" style={{ color: "var(--accent-pink)" }}>
            {analysis?.error || "Platform unavailable"}
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              @{analysis.username}
              {profile?.verified && (
                <span className="ml-1.5 text-xs" style={{ color: "var(--accent-blue)" }}>✓</span>
              )}
            </p>
            {profile?.displayName && (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {profile.displayName}
              </p>
            )}
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
      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {label}
      </p>
      <p
        className="text-base font-semibold"
        style={{
          color: accent ? "var(--accent-green)" : "var(--text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benchmark Panel
// ---------------------------------------------------------------------------

export function BenchmarkPanel({
  platform,
  label,
  contentLabel,
  analysis,
}: {
  platform: "instagram" | "tiktok";
  label: string;
  contentLabel: string;
  analysis: PlatformAnalysis;
}) {
  return (
    <div
      className="rounded-md border animate-slide-up-delay"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-default)",
      }}
    >
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span
          className="text-xs font-medium tracking-wider"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {label.toUpperCase()} BENCHMARK
        </span>
        {analysis.limitations.length > 0 && (
          <span
            className="text-xs max-w-xs truncate"
            style={{ color: "var(--text-muted)" }}
            title={analysis.limitations.join(" ")}
          >
            {analysis.limitations[0]}
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <BucketCard
            label={`Organic ${contentLabel}`}
            bucket={analysis.organic}
            accentVar="--accent-green"
          />
          <BucketCard
            label={`Commercial ${contentLabel}`}
            bucket={analysis.commercial}
            accentVar="--accent-amber"
          />
        </div>

        {analysis.comparison && <ComparisonRow comparison={analysis.comparison} />}

        <ContentList
          label={`Organic ${contentLabel}`}
          bucket={analysis.organic}
          accentVar="--accent-green"
        />
        {analysis.commercial.sampleSize > 0 && (
          <ContentList
            label={`Commercial ${contentLabel}`}
            bucket={analysis.commercial}
            accentVar="--accent-amber"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bucket Card
// ---------------------------------------------------------------------------

function BucketCard({
  label,
  bucket,
  accentVar,
}: {
  label: string;
  bucket: BenchmarkBucket;
  accentVar: string;
}) {
  const isComplete = bucket.status === "complete";
  const statusColor = isComplete ? `var(${accentVar})` : "var(--status-warn)";

  return (
    <div
      className="rounded-md border p-4"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <p
        className="text-xs mb-3 font-medium tracking-wider"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label.toUpperCase()}
      </p>
      <p
        className="text-2xl font-bold mb-1"
        style={{
          color: isComplete ? `var(${accentVar})` : "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {bucket.averageViews !== null ? formatNumber(bucket.averageViews) : "—"}
      </p>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
        <span className="text-xs" style={{ color: statusColor }}>
          {isComplete
            ? `${bucket.sampleSize}/${bucket.maxSampleSize}`
            : `${bucket.sampleSize}/${bucket.maxSampleSize} · Insufficient`}
        </span>
      </div>
      {bucket.warnings.length > 0 && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--status-warn)" }}>
          {bucket.warnings[0]}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison Row
// ---------------------------------------------------------------------------

function ComparisonRow({ comparison }: { comparison: ComparisonMetrics }) {
  const ratio = Math.round(comparison.adToOrganicRatio * 100);
  const deltaAbs = Math.abs(comparison.delta);

  return (
    <div
      className="rounded-md border p-3 mb-6 flex items-center justify-between"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <span
        className="text-xs font-medium"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        AD/ORGANIC RATIO
      </span>
      <div className="flex items-center gap-4">
        <span
          className="text-sm font-bold"
          style={{
            color: ratio >= 100 ? "var(--accent-green)" : "var(--accent-amber)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {ratio}%
        </span>
        <span
          className="text-xs"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          Δ {comparison.delta > 0 ? "+" : "-"}{formatNumber(deltaAbs)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content List
// ---------------------------------------------------------------------------

function ContentList({
  label,
  bucket,
  accentVar,
}: {
  label: string;
  bucket: BenchmarkBucket;
  accentVar: string;
}) {
  if (bucket.sampleSize === 0) return null;

  const items = bucket.reels as (ClassifiedReel | ClassifiedItem)[];

  return (
    <div className="mb-4 last:mb-0">
      <p
        className="text-xs font-medium mb-2 tracking-wider"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label.toUpperCase()} · {items.length} ITEMS
      </p>
      <div
        className="rounded-md border overflow-hidden"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {items.map((item, i) => {
          const isCommercial = "isCommercial" in item && item.isCommercial;
          return (
            <div
              key={item.id + "-" + i}
              className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <span
                className="text-sm font-medium w-16 text-right shrink-0"
                style={{
                  color: item.views !== null ? `var(${accentVar})` : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatNumber(item.views)}
              </span>
              <span
                className="text-xs flex-1 truncate"
                style={{ color: "var(--text-secondary)" }}
              >
                {truncate(item.caption, 60)}
              </span>
              {isCommercial && "classificationCategory" in item && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    backgroundColor: "var(--accent-pink-glow)",
                    color: "var(--accent-pink)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {categoryLabel(item.classificationCategory)}
                </span>
              )}
              <span
                className="text-xs shrink-0"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                {formatDate(item.timestamp)}
              </span>
              <a
                href={item.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 opacity-30 hover:opacity-70 transition-opacity"
                style={{ color: "var(--text-primary)" }}
              >
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
// Visibility Intelligence Panel
// ---------------------------------------------------------------------------

export function VisibilityIntelligencePanel({
  story,
  carousel,
}: {
  story: StoryVisibility | null;
  carousel: CarouselVisibility | null;
}) {
  if (!story && !carousel) return null;

  const modeColors: Record<string, { color: string; bg: string }> = {
    exact_connected: { color: "var(--accent-green)", bg: "var(--accent-green-glow)" },
    observed_vendor: { color: "var(--accent-blue)", bg: "rgba(56,189,248,0.08)" },
    estimated: { color: "#d97706", bg: "rgba(217,119,6,0.08)" },
    unavailable: { color: "var(--status-muted)", bg: "rgba(128,128,128,0.08)" },
  };

  return (
    <div
      className="rounded-md border"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-default)",
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <svg className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)", opacity: 0.4 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span className="text-[10px] font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          VISIBILITY INTELLIGENCE
        </span>
      </div>

      {story && story.sourceMode !== "unavailable" && (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[9px] font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              STORY
            </span>
            <span
              className="text-[9px] font-medium tracking-wider px-1 py-px rounded"
              style={{
                backgroundColor: (modeColors[story.sourceMode] ?? modeColors.unavailable).bg,
                color: (modeColors[story.sourceMode] ?? modeColors.unavailable).color,
                fontFamily: "var(--font-mono)",
              }}
            >
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

          {story.sourceMode === "exact_connected" && story.views && story.views.value !== null && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[9px] tracking-wide mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>VIEWS</p>
                <p className="text-sm font-semibold" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                  {formatNumber(story.views.value)}
                </p>
              </div>
              {story.reach?.value != null && (
                <div>
                  <p className="text-[9px] tracking-wide mb-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>REACH</p>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {formatNumber(story.reach.value)}
                  </p>
                </div>
              )}
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
            <span className="text-[9px] font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              CAROUSEL
            </span>
            <span className="text-[9px]" style={{ color: "var(--text-muted)", opacity: 0.5, fontFamily: "var(--font-mono)" }}>
              · {carousel.carouselCount}
            </span>
            <span
              className="text-[9px] font-medium tracking-wider px-1 py-px rounded"
              style={{
                backgroundColor: (modeColors[carousel.sourceMode] ?? modeColors.unavailable).bg,
                color: (modeColors[carousel.sourceMode] ?? modeColors.unavailable).color,
                fontFamily: "var(--font-mono)",
              }}
            >
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
              return (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{
                    backgroundColor: i <= dots ? "#d97706" : "var(--border-subtle)",
                  }}
                />
              );
            })}
          </div>
          <span className="text-[9px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
            Model-estimated · not official Meta data
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget + CPM Workbench
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

export function BudgetWorkbench({
  ig, tk, hasIg, hasTk,
}: {
  ig: PlatformAnalysis | undefined;
  tk: PlatformAnalysis | undefined;
  hasIg: boolean;
  hasTk: boolean;
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
      deliverableType: dt,
      quantity: qty,
      sourceMode: amt > 0 ? "exact" as QuoteSourceMode : "missing" as QuoteSourceMode,
      unitPrice: amt > 0 ? moneyWithFx(amt, currency) : null,
      totalPrice: null,
      pricingComponents: [],
      notes: [],
    };

    const cpm = computeDeliverableCpm(quote, forecast);
    const totalImpressions = forecast.base !== null ? forecast.base * qty : null;
    const lineCost = amt > 0 ? amt * qty : null;
    return { dt, forecast, quote, cpm, qty, totalImpressions, lineCost };
  });

  return (
    <div
      className="rounded-md border"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-default)",
      }}
    >
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <svg className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)", opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span className="text-xs font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          BUDGET + CPM WORKBENCH
        </span>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
          style={{
            backgroundColor: showInfo ? "var(--accent-blue)" : "var(--bg-secondary)",
            color: showInfo ? "#fff" : "var(--text-muted)",
            cursor: "pointer",
            border: "none",
          }}
          title="How CPM is calculated"
        >
          ?
        </button>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="text-xs rounded px-2 py-1 border-0 outline-none"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
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
          <p className="mb-2" style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>
            Line CPM = (Unit Price × Qty) ÷ (Per-Unit Forecast × Qty) × 1,000
          </p>
          <p className="mb-1"><strong>Quantity</strong> — Qty multiplies both cost and impressions.</p>
          <p className="mb-1"><strong>Forecast Ranges</strong> — Impressions show low / base / high estimates.</p>
          <p className="mb-0"><strong>Provenance</strong> — <em>EXACT</em> = creator-provided. <em>IMPUTED</em> = derived. <em>EST</em> = model-estimated.</p>
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
                  <td className="px-3 py-2.5">
                    <span style={{ color: "var(--text-primary)" }}>{DELIVERABLE_LABELS[dt]}</span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={qty}
                      onChange={(e) => updateQty(dt, e.target.value)}
                      className="w-10 text-center rounded px-1 py-0.5 border-0 outline-none text-xs"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={budgets[dt]?.amount ?? ""}
                      onChange={(e) => updateBudget(dt, e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-full text-right rounded px-2 py-0.5 border-0 outline-none text-xs"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {lineCost !== null ? (
                      <span style={{ color: "var(--text-primary)" }}>{formatNumber(lineCost)}</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {forecast.base !== null ? (
                      <div>
                        <span style={{ color: "var(--text-primary)" }}>
                          {formatNumber(totalImpressions)}
                        </span>
                        <span
                          className="ml-1 text-[9px] px-1 py-px rounded"
                          style={{ color: fSrc.color, backgroundColor: `${fSrc.color}15` }}
                          title={`Per unit: ${formatNumber(forecast.low)} – ${formatNumber(forecast.base)} – ${formatNumber(forecast.high)} × ${qty}`}
                        >
                          {fSrc.label}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>
                    )}
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
                    ) : (
                      <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {cpm.benchmarkStatus !== "unknown" ? (
                      <span
                        className="text-[9px] font-medium tracking-wider px-1.5 py-px rounded"
                        style={{ backgroundColor: bm.bg, color: bm.color }}
                        title={cpm.benchmarkContext ?? undefined}
                      >
                        {cpm.benchmarkStatus.toUpperCase()}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>—</span>
                    )}
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
