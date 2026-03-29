/**
 * Batch Workspace Domain Model
 *
 * Types, parsing, deduplication, and validation for the bulk creator
 * search workspace. Handles CSV/TSV/newline input parsing, handle
 * normalization, and row status derivation from per-handle results.
 *
 * Designed to power a session-local queue today and a durable job
 * system in the future — the shapes are backend-agnostic.
 */

import { normalizeUsername } from "./normalize";
import type { PlatformAnalysis } from "./types";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type BatchImportRow = {
  id: string;
  instagramUsername: string | null;
  tiktokUsername: string | null;
  label: string | null;
  notes: string | null;
  sourceRowIndex: number;
};

export type BatchHandleStatus = "queued" | "running" | "success" | "error";

export type BatchRowStatus =
  | "queued"
  | "running"
  | "partial"
  | "complete"
  | "error";

export type BatchHandleJob = {
  platform: "instagram" | "tiktok";
  username: string;
  status: BatchHandleStatus;
  attempts: number;
  error?: string;
  result?: PlatformAnalysis;
};

export type BatchRowResult = {
  rowId: string;
  instagramUsername: string | null;
  tiktokUsername: string | null;
  label: string | null;
  notes: string | null;
  status: BatchRowStatus;
  instagram: PlatformAnalysis | null;
  tiktok: PlatformAnalysis | null;
  warnings: string[];
};

export type BatchRunSummary = {
  totalRows: number;
  queuedRows: number;
  runningRows: number;
  completeRows: number;
  partialRows: number;
  errorRows: number;
  totalUniqueInstagramHandles: number;
  totalUniqueTikTokHandles: number;
};

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/**
 * Parse batch input text into BatchImportRows.
 *
 * Supports:
 * - CSV with header row (instagram,tiktok,label,notes)
 * - TSV with or without header
 * - Newline-separated usernames (single column, assumed Instagram)
 * - Mixed comma and tab delimiters
 *
 * Normalizes handles (removes @, lowercases, trims).
 * Deduplicates rows with identical handle pairs.
 * Returns { rows, errors } where errors are validation messages per line.
 */
export function parseBatchInput(text: string): {
  rows: BatchImportRow[];
  errors: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ["No input provided."] };
  }

  const errors: string[] = [];
  const rawRows: Array<{
    ig: string | null;
    tk: string | null;
    label: string | null;
    notes: string | null;
    lineIdx: number;
  }> = [];

  // Detect if first line is a header
  const firstLine = lines[0].toLowerCase();
  const isHeader =
    firstLine.includes("instagram") ||
    firstLine.includes("tiktok") ||
    firstLine === "ig,tk" ||
    firstLine === "ig\ttk";

  // Detect delimiter
  const delimiter = detectDelimiter(lines[isHeader ? 1 : 0] ?? lines[0]);

  // Parse header to determine column mapping
  let colMap = { ig: 0, tk: 1, label: 2, notes: 3 };
  if (isHeader) {
    colMap = parseHeaderRow(lines[0], delimiter);
  }

  const dataLines = isHeader ? lines.slice(1) : lines;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cols = splitLine(line, delimiter);

    const ig = cleanHandle(cols[colMap.ig] ?? "");
    const tk = cleanHandle(cols[colMap.tk] ?? "");
    const label = (cols[colMap.label] ?? "").trim() || null;
    const notes = (cols[colMap.notes] ?? "").trim() || null;

    if (!ig && !tk) {
      errors.push(`Line ${i + 1 + (isHeader ? 1 : 0)}: No valid handle found.`);
      continue;
    }

    // Validate handle formats
    if (ig && !/^[a-z0-9._]{1,30}$/.test(ig)) {
      errors.push(`Line ${i + 1 + (isHeader ? 1 : 0)}: Invalid Instagram handle "${ig}".`);
      continue;
    }
    if (tk && !/^[a-z0-9._]{1,24}$/.test(tk)) {
      errors.push(`Line ${i + 1 + (isHeader ? 1 : 0)}: Invalid TikTok handle "${tk}".`);
      continue;
    }

    rawRows.push({ ig: ig || null, tk: tk || null, label, notes, lineIdx: i });
  }

  // Deduplicate by handle pair
  const seen = new Set<string>();
  const rows: BatchImportRow[] = [];
  let idCounter = 0;

  for (const raw of rawRows) {
    const key = `${raw.ig ?? ""}|${raw.tk ?? ""}`;
    if (seen.has(key)) {
      continue; // skip duplicate
    }
    seen.add(key);

    rows.push({
      id: `row_${++idCounter}`,
      instagramUsername: raw.ig,
      tiktokUsername: raw.tk,
      label: raw.label,
      notes: raw.notes,
      sourceRowIndex: raw.lineIdx,
    });
  }

  return { rows, errors };
}

function detectDelimiter(line: string): string {
  const tabCount = (line.match(/\t/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((s) => s.trim());
}

function cleanHandle(raw: string): string {
  const trimmed = raw.trim().replace(/^@/, "");
  if (!trimmed) return "";
  return normalizeUsername(trimmed);
}

function parseHeaderRow(
  line: string,
  delimiter: string
): { ig: number; tk: number; label: number; notes: number } {
  const cols = splitLine(line, delimiter).map((c) => c.toLowerCase());
  return {
    ig: Math.max(0, findColumnIndex(cols, ["instagram", "ig", "insta"])),
    tk: findColumnIndex(cols, ["tiktok", "tk", "tt"]),
    label: findColumnIndex(cols, ["label", "name", "creator"]),
    notes: findColumnIndex(cols, ["notes", "note", "comment"]),
  };
}

function findColumnIndex(cols: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = cols.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Handle extraction (for deduped queue building)
// ---------------------------------------------------------------------------

/**
 * Extract unique handles from a set of import rows, grouped by platform.
 */
export function extractUniqueHandles(rows: BatchImportRow[]): {
  instagram: string[];
  tiktok: string[];
} {
  const igSet = new Set<string>();
  const tkSet = new Set<string>();

  for (const row of rows) {
    if (row.instagramUsername) igSet.add(row.instagramUsername);
    if (row.tiktokUsername) tkSet.add(row.tiktokUsername);
  }

  return {
    instagram: Array.from(igSet),
    tiktok: Array.from(tkSet),
  };
}

// ---------------------------------------------------------------------------
// Row status derivation
// ---------------------------------------------------------------------------

/**
 * Derive a row's status from the statuses of its constituent handles.
 */
export function deriveRowStatus(
  row: BatchImportRow,
  handleMap: Map<string, BatchHandleJob>
): BatchRowStatus {
  const igKey = row.instagramUsername ? `instagram:${row.instagramUsername}` : null;
  const tkKey = row.tiktokUsername ? `tiktok:${row.tiktokUsername}` : null;

  const igJob = igKey ? handleMap.get(igKey) : null;
  const tkJob = tkKey ? handleMap.get(tkKey) : null;

  // If the row has no handles (shouldn't happen after validation)
  if (!igJob && !tkJob) return "error";

  const statuses: BatchHandleStatus[] = [];
  if (igJob) statuses.push(igJob.status);
  if (tkJob) statuses.push(tkJob.status);

  // All success → complete
  if (statuses.every((s) => s === "success")) return "complete";
  // Any running → running
  if (statuses.some((s) => s === "running")) return "running";
  // Mix of success + error → partial
  if (statuses.some((s) => s === "success") && statuses.some((s) => s === "error")) return "partial";
  // All error → error
  if (statuses.every((s) => s === "error")) return "error";
  // All queued → queued
  if (statuses.every((s) => s === "queued")) return "queued";
  // Mix of queued + success → running (still processing)
  return "running";
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

/**
 * Compute aggregate batch statistics.
 */
export function computeBatchSummary(
  rows: BatchImportRow[],
  handleMap: Map<string, BatchHandleJob>
): BatchRunSummary {
  const handles = extractUniqueHandles(rows);
  let queued = 0, running = 0, complete = 0, partial = 0, error = 0;

  for (const row of rows) {
    const status = deriveRowStatus(row, handleMap);
    switch (status) {
      case "queued": queued++; break;
      case "running": running++; break;
      case "complete": complete++; break;
      case "partial": partial++; break;
      case "error": error++; break;
    }
  }

  return {
    totalRows: rows.length,
    queuedRows: queued,
    runningRows: running,
    completeRows: complete,
    partialRows: partial,
    errorRows: error,
    totalUniqueInstagramHandles: handles.instagram.length,
    totalUniqueTikTokHandles: handles.tiktok.length,
  };
}
