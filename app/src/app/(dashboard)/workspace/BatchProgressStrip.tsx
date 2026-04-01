"use client";

import type { BatchRunSummary, BatchWorkspacePhase } from "@/lib/domain/batch-types";

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

export function BatchProgressStrip({
  summary,
  phase,
  onCancel,
  onRetryErrors,
}: {
  summary: BatchRunSummary;
  phase: BatchWorkspacePhase;
  onCancel?: () => void;
  onRetryErrors?: () => void;
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
          {phase === "processing" && onCancel && (
            <button
              onClick={onCancel}
              className="text-[10px] px-3 py-1.5 rounded-md font-medium tracking-wider transition-all hover:opacity-80"
              style={{ backgroundColor: "rgba(255,45,120,0.1)", color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}
            >
              CANCEL
            </button>
          )}
          {phase === "results" && summary.errorRows > 0 && onRetryErrors && (
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
