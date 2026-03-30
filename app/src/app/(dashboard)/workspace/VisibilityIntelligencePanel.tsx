"use client";

import type { StoryVisibility, CarouselVisibility } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";

export function VisibilityIntelligencePanel({ story, carousel }: { story: StoryVisibility | null; carousel: CarouselVisibility | null }) {
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
