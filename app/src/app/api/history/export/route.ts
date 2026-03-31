/**
 * History — Export API (CSV / XLSX)
 *
 * GET — export run data
 *
 * Query params:
 *   ?runIds=  — comma-separated run IDs to export (required)
 *   ?format=  — "csv" (default) or "xlsx"
 *
 * Each row = one creator per platform in one run.
 * Requires team membership or system admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { analysisRun } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

type SnapshotRow = {
  _v?: number;
  row: {
    id: string;
    instagramUsername?: string | null;
    tiktokUsername?: string | null;
    label?: string | null;
  };
  status: string;
  instagram: PlatformData | null;
  tiktok: PlatformData | null;
};

type PlatformData = {
  platform: string;
  username: string;
  profile: { followerCount: number | null } | null;
  organic: { averageViews: number | null; sampleSize: number } | null;
  commercial: { averageViews: number | null; sampleSize: number } | null;
  comparison: { adToOrganicRatio: number | null } | null;
  totalContentCount: number;
  status: string;
};

const HEADERS = [
  "run_id", "run_date", "run_status", "run_note", "run_tags",
  "creator", "platform", "followers",
  "organic_avg_views", "commercial_avg_views", "ad_to_organic_ratio",
  "total_content", "organic_sample", "commercial_sample", "creator_status",
];

function escapeCSV(val: string | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildExportRows(runs: Array<{
  id: string;
  status: string;
  note: string | null;
  tags: unknown;
  startedAt: Date | null;
  resultSnapshot: unknown;
}>): string[][] {
  const rows: string[][] = [];

  for (const run of runs) {
    const snapshot: SnapshotRow[] = (run.resultSnapshot as SnapshotRow[]) || [];
    const runDate = run.startedAt ? new Date(run.startedAt as unknown as number * 1000).toISOString().split("T")[0] : "";
    const tags: string[] = (run.tags as string[]) || [];

    for (const entry of snapshot) {
      const platforms: [string, PlatformData | null][] = [
        ["instagram", entry.instagram],
        ["tiktok", entry.tiktok],
      ];

      for (const [platformName, pd] of platforms) {
        if (!pd) continue;
        rows.push([
          run.id,
          runDate,
          run.status,
          run.note || "",
          tags.join("; "),
          pd.username || entry.row?.label || "",
          platformName,
          String(pd.profile?.followerCount ?? ""),
          String(pd.organic?.averageViews ?? ""),
          String(pd.commercial?.averageViews ?? ""),
          String(pd.comparison?.adToOrganicRatio ?? ""),
          String(pd.totalContentCount ?? ""),
          String(pd.organic?.sampleSize ?? ""),
          String(pd.commercial?.sampleSize ?? ""),
          pd.status,
        ]);
      }
    }
  }

  return rows;
}

export async function GET(request: NextRequest) {
  const result = await requireTeamMemberOrSystemAdmin();
  if (result instanceof NextResponse) return result;

  const { team } = result;
  const params = request.nextUrl.searchParams;
  const runIdsParam = params.get("runIds");
  const format = params.get("format") || "csv";

  if (!runIdsParam) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "runIds param required." } },
      { status: 400 }
    );
  }

  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "format must be csv or xlsx." } },
      { status: 400 }
    );
  }

  const runIds = runIdsParam.split(",").map(s => s.trim()).filter(Boolean);
  if (runIds.length === 0 || runIds.length > 50) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "1-50 runIds required." } },
      { status: 400 }
    );
  }

  const conditions = [inArray(analysisRun.id, runIds)];
  if (team) conditions.push(eq(analysisRun.teamId, team.teamId));

  const runs = await db
    .select({
      id: analysisRun.id,
      status: analysisRun.status,
      note: analysisRun.note,
      tags: analysisRun.tags,
      startedAt: analysisRun.startedAt,
      resultSnapshot: analysisRun.resultSnapshot,
    })
    .from(analysisRun)
    .where(and(...conditions));

  const dataRows = buildExportRows(runs);

  if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);

    // Auto-size columns
    ws["!cols"] = HEADERS.map((h, i) => ({
      wch: Math.max(h.length, ...dataRows.map(r => (r[i] || "").length)).valueOf(),
    }));

    XLSX.utils.book_append_sheet(wb, ws, "Export");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="analysis-export-${Date.now()}.xlsx"`,
      },
    });
  }

  // CSV
  const csvRows = [HEADERS.join(",")];
  for (const row of dataRows) {
    csvRows.push(row.map(escapeCSV).join(","));
  }

  return new NextResponse(csvRows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analysis-export-${Date.now()}.csv"`,
    },
  });
}
