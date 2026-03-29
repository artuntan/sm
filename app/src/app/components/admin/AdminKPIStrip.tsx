"use client";

/**
 * AdminKPIStrip — Executive Overview
 *
 * Elevated horizontal strip showing 6 real KPIs with clear hierarchy.
 * Primary metrics (pending approvals, time saved) are large and prominent.
 * Secondary metrics (teams, runs, avg creators, ratio) are supporting context.
 */

type AnalyticsGlobal = {
  totalRuns: number;
  totalCreators: number;
  avgCreatorsPerRun?: number;
  manualMinutes: number;
  autoMinutes: number;
  timeSavedMinutes: number;
  productivityRatio: number;
};

function formatHours(m: number): string {
  if (m < 1) return "<1m";
  if (m < 60) return `${Math.round(m)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

export function AdminKPIStrip({
  pendingCount,
  activeTeams,
  analytics,
}: {
  pendingCount: number;
  activeTeams: number;
  analytics: { global: AnalyticsGlobal } | null;
}) {
  const g = analytics?.global;
  const avgCreators = g ? (g.avgCreatorsPerRun ?? (g.totalRuns > 0 ? Math.round((g.totalCreators / g.totalRuns) * 10) / 10 : 0)) : 0;

  return (
    <div
      className="rounded-md border p-4 mb-4"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        borderWidth: "1px",
      }}
    >
      {/* Strip header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent-green)" }} />
        <span
          className="text-[9px] font-semibold tracking-widest"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          PLATFORM OVERVIEW
        </span>
      </div>

      {/* KPI Grid: 2 primary (large) + 4 secondary (compact) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Primary: Pending Approvals */}
        <div
          className="rounded border px-3 py-2.5"
          style={{
            backgroundColor: pendingCount > 0 ? "var(--accent-green-glow)" : "var(--bg-secondary)",
            borderColor: pendingCount > 0 ? "var(--border-accent)" : "var(--border-subtle)",
          }}
        >
          <p
            className="text-[8px] tracking-wider mb-1"
            style={{ color: pendingCount > 0 ? "var(--accent-green)" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            PENDING APPROVALS
          </p>
          <p
            className="text-xl font-bold tabular-nums"
            style={{ color: pendingCount > 0 ? "var(--accent-green)" : "var(--text-primary)", fontFamily: "var(--font-mono)" }}
          >
            {pendingCount}
          </p>
          {pendingCount > 0 && (
            <p className="text-[8px] mt-0.5" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
              ACTION REQUIRED
            </p>
          )}
        </div>

        {/* Primary: Time Saved */}
        <div
          className="rounded border px-3 py-2.5"
          style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <p
            className="text-[8px] tracking-wider mb-1"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            TIME SAVED
          </p>
          <p
            className="text-xl font-bold tabular-nums"
            style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
          >
            {g ? formatHours(g.timeSavedMinutes) : "—"}
          </p>
          <p className="text-[8px] mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            vs manual workflow
          </p>
        </div>

        {/* Secondary: Active Teams */}
        <KPICell label="ACTIVE TEAMS" value={String(activeTeams)} />

        {/* Secondary: Total Runs */}
        <KPICell label="TOTAL RUNS" value={g ? String(g.totalRuns) : "—"} />

        {/* Secondary: Avg Creators/Run */}
        <KPICell label="AVG CREATORS / RUN" value={g ? String(avgCreators) : "—"} />

        {/* Secondary: Productivity Ratio */}
        <KPICell
          label="LEVERAGE RATIO"
          value={g ? `${g.productivityRatio}×` : "—"}
          accent={g ? g.productivityRatio > 1 : false}
        />
      </div>
    </div>
  );
}

function KPICell({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded border px-3 py-2.5"
      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
    >
      <p
        className="text-[8px] tracking-wider mb-1"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
      <p
        className="text-base font-semibold tabular-nums"
        style={{ color: accent ? "var(--accent-green)" : "var(--text-primary)", fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
    </div>
  );
}
