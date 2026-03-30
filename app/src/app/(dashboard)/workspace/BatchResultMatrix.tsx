"use client";

import type { BatchRowResult } from "@/lib/domain/batch-types";
import { formatNumber } from "@/lib/format";

type SortField = "index" | "label" | "igFollowers" | "tkFollowers" | "organicAvg" | "commercialAvg" | "ratio" | "status";
type SortDir = "asc" | "desc";

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  queued: { color: "var(--text-muted)", bg: "rgba(128,128,128,0.08)", label: "QUEUED" },
  running: { color: "var(--accent-blue)", bg: "rgba(59,130,246,0.08)", label: "RUNNING" },
  complete: { color: "var(--accent-green)", bg: "var(--accent-green-glow)", label: "OK" },
  partial: { color: "var(--accent-amber)", bg: "rgba(255,184,0,0.08)", label: "PARTIAL" },
  error: { color: "var(--accent-pink)", bg: "rgba(255,45,120,0.08)", label: "ERROR" },
};

export function BatchResultMatrix({
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
