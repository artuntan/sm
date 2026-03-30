"use client";

import type {
  BenchmarkBucket,
  ClassifiedReel,
  ClassifiedItem,
  ComparisonMetrics,
  PlatformAnalysis,
} from "@/lib/domain/types";
import { formatNumber, formatDate, truncate } from "@/lib/format";

// ---------------------------------------------------------------------------
// categoryLabel — local helper
// ---------------------------------------------------------------------------

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
// BucketCard
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ComparisonRow
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ContentList
// ---------------------------------------------------------------------------

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
// BenchmarkPanel
// ---------------------------------------------------------------------------

export function BenchmarkPanel({ platform, label, contentLabel, analysis }: {
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
