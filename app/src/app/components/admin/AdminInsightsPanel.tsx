"use client";

/**
 * AdminInsightsPanel — Unified Intelligence Surface
 *
 * Merges ProductivityPanel + TimeSavedPanel into one coherent analytics area.
 * Sections: Automation Impact (hero + comparison bars) → Team Rankings.
 */

type TeamProductivity = {
  teamId: string;
  teamName: string;
  runCount: number;
  totalCreators: number;
  manualMinutes: number;
  autoMinutes: number;
  timeSavedMinutes: number;
  productivityRatio: number;
};

type AnalyticsData = {
  global: {
    totalRuns: number;
    totalCreators: number;
    manualMinutes: number;
    autoMinutes: number;
    timeSavedMinutes: number;
    productivityRatio: number;
  };
  teamProductivity: TeamProductivity[];
  formula: { description: string; calibration: string };
};

function formatMinutes(m: number): string {
  if (m < 1) return "<1m";
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function formatHours(m: number): string {
  if (m < 60) return `${Math.round(m)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

export function AdminInsightsPanel({ data }: { data: AnalyticsData }) {
  const { global } = data;
  const teams = data.teamProductivity;
  const hasData = global.totalRuns > 0;
  const maxBar = Math.max(global.manualMinutes, global.autoMinutes, 1);
  const manualPct = (global.manualMinutes / maxBar) * 100;
  const autoPct = (global.autoMinutes / maxBar) * 100;
  const maxRatio = Math.max(...teams.map((t) => t.productivityRatio), 1);

  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold tracking-wider"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
          >
            PLATFORM INTELLIGENCE
          </span>
        </div>
        <span
          className="text-[8px] tabular-nums"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {global.totalRuns} run{global.totalRuns !== 1 ? "s" : ""} · {global.totalCreators} creator{global.totalCreators !== 1 ? "s" : ""}
        </span>
      </div>

      {!hasData ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            No analysis data yet
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* ── Automation Impact ── */}
          <div>
            <p
              className="text-[8px] font-semibold tracking-wider mb-3"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              AUTOMATION IMPACT
            </p>

            {/* Hero metrics row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div
                className="rounded border px-3 py-2.5 text-center"
                style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
              >
                <p
                  className="text-lg font-bold tabular-nums"
                  style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
                >
                  {formatHours(global.timeSavedMinutes)}
                </p>
                <p className="text-[7px] tracking-wider mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  TIME SAVED
                </p>
              </div>
              <div
                className="rounded border px-3 py-2.5 text-center"
                style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
              >
                <p
                  className="text-lg font-bold tabular-nums"
                  style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
                >
                  {global.productivityRatio}×
                </p>
                <p className="text-[7px] tracking-wider mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  LEVERAGE
                </p>
              </div>
              <div
                className="rounded border px-3 py-2.5 text-center"
                style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
              >
                <p
                  className="text-lg font-bold tabular-nums"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
                >
                  {formatHours(global.autoMinutes)}
                </p>
                <p className="text-[7px] tracking-wider mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  ACTUAL TIME
                </p>
              </div>
            </div>

            {/* Comparison bars */}
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Manual estimate
                  </span>
                  <span
                    className="text-[9px] font-medium tabular-nums"
                    style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
                  >
                    {formatHours(global.manualMinutes)}
                  </span>
                </div>
                <div
                  className="relative h-[5px] rounded-sm overflow-hidden"
                  style={{ backgroundColor: "var(--bg-elevated)" }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500"
                    style={{ width: `${manualPct}%`, backgroundColor: "var(--text-muted)", opacity: 0.4 }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Automated (actual)
                  </span>
                  <span
                    className="text-[9px] font-medium tabular-nums"
                    style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
                  >
                    {formatHours(global.autoMinutes)}
                  </span>
                </div>
                <div
                  className="relative h-[5px] rounded-sm overflow-hidden"
                  style={{ backgroundColor: "var(--bg-elevated)" }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500"
                    style={{
                      width: `${autoPct}%`,
                      background: "linear-gradient(90deg, var(--accent-green-glow), var(--accent-green))",
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Team Rankings ── */}
          {teams.length > 0 && (
            <div
              className="pt-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between mb-2.5">
                <p
                  className="text-[8px] font-semibold tracking-wider"
                  style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  TEAM RANKINGS
                </p>
                <span
                  className="text-[7px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  leverage ratio
                </span>
              </div>
              <div className="space-y-2.5">
                {teams.map((t, i) => {
                  const barWidth = Math.max((t.productivityRatio / maxRatio) * 100, 4);
                  return (
                    <div key={t.teamId}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[9px] font-semibold tabular-nums w-4 text-center shrink-0"
                            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                          >
                            {i + 1}
                          </span>
                          <span className="text-[10px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                            {t.teamName}
                          </span>
                        </div>
                        <span
                          className="text-[10px] font-semibold tabular-nums shrink-0 ml-2"
                          style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}
                        >
                          {t.productivityRatio}×
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-4 shrink-0" />
                        <div className="flex-1">
                          <div
                            className="relative h-[4px] rounded-sm overflow-hidden"
                            style={{ backgroundColor: "var(--bg-elevated)" }}
                          >
                            <div
                              className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500"
                              style={{
                                width: `${barWidth}%`,
                                background: "linear-gradient(90deg, var(--accent-green-glow), var(--accent-green))",
                                opacity: 0.85,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="w-4 shrink-0" />
                        <span
                          className="text-[8px]"
                          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                        >
                          {t.runCount} run{t.runCount !== 1 ? "s" : ""} · {t.totalCreators} creator{t.totalCreators !== 1 ? "s" : ""} · saved {formatMinutes(t.timeSavedMinutes)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Formula footnote */}
          <div
            className="pt-2"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <p className="text-[7px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {data.formula.calibration}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
