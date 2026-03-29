/**
 * Batch Input Parser
 *
 * Parses raw text input from operator paste (CSV, TSV, newline-separated)
 * into structured BatchImportRow records with validation.
 *
 * Supported formats:
 * - CSV with header row: instagram,tiktok,label,notes
 * - TSV (tab-separated, direct Excel/Sheets paste)
 * - Newline-separated handles (auto-detected as Instagram-only)
 *
 * Handle normalization:
 * - Strips leading @ symbols
 * - Lowercases
 * - Trims whitespace
 * - Rejects obviously invalid formats
 */

import type {
  BatchImportRow,
  BatchValidationError,
  BatchParseResult,
} from "./batch-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;

const KNOWN_HEADERS = new Set([
  "instagram",
  "ig",
  "tiktok",
  "tk",
  "tt",
  "label",
  "name",
  "notes",
  "note",
]);

// ---------------------------------------------------------------------------
// Handle normalization
// ---------------------------------------------------------------------------

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

// ---------------------------------------------------------------------------
// Delimiter detection
// ---------------------------------------------------------------------------

function detectDelimiter(firstLine: string): string {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

type ColumnMapping = {
  instagram: number;
  tiktok: number;
  label: number;
  notes: number;
};

function detectHeader(
  cells: string[]
): { isHeader: boolean; mapping: ColumnMapping } {
  const lower = cells.map((c) => c.trim().toLowerCase());
  const headerMatches = lower.filter((c) => KNOWN_HEADERS.has(c)).length;

  // If ≥2 cells match known header names, treat as header row
  if (headerMatches >= 2 || (cells.length === 1 && KNOWN_HEADERS.has(lower[0]))) {
    const mapping: ColumnMapping = {
      instagram: -1,
      tiktok: -1,
      label: -1,
      notes: -1,
    };

    for (let i = 0; i < lower.length; i++) {
      const val = lower[i];
      if (val === "instagram" || val === "ig") mapping.instagram = i;
      else if (val === "tiktok" || val === "tk" || val === "tt") mapping.tiktok = i;
      else if (val === "label" || val === "name") mapping.label = i;
      else if (val === "notes" || val === "note") mapping.notes = i;
    }

    return { isHeader: true, mapping };
  }

  return { isHeader: false, mapping: { instagram: -1, tiktok: -1, label: -1, notes: -1 } };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

let rowIdCounter = 0;

function generateRowId(): string {
  return `row-${Date.now()}-${++rowIdCounter}`;
}

/**
 * Parse raw text input into structured batch rows.
 *
 * @param rawText - The raw text from the operator's paste/input
 * @returns Parsed rows and any validation errors
 */
export function parseBatchInput(rawText: string): BatchParseResult {
  const rows: BatchImportRow[] = [];
  const errors: BatchValidationError[] = [];

  const trimmed = rawText.trim();
  if (!trimmed) {
    return { rows, errors };
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows, errors };
  }

  // Detect format
  const delimiter = detectDelimiter(lines[0]);
  const firstCells = lines[0].split(delimiter).map((c) => c.trim());

  // Check if first line is a header
  const { isHeader, mapping } = detectHeader(firstCells);

  // Handle structured format (CSV/TSV with known columns)
  if (isHeader && (mapping.instagram >= 0 || mapping.tiktok >= 0)) {
    return parseStructured(lines.slice(1), delimiter, mapping);
  }

  // Check if it's multi-column without a header (auto-detect columns)
  if (firstCells.length >= 2) {
    // Assume: col 0 = instagram, col 1 = tiktok, col 2 = label, col 3 = notes
    const autoMapping: ColumnMapping = {
      instagram: 0,
      tiktok: 1,
      label: firstCells.length >= 3 ? 2 : -1,
      notes: firstCells.length >= 4 ? 3 : -1,
    };

    // But only if the cells look like handles (not random text)
    const cell0 = normalizeHandle(firstCells[0]);
    const cell1 = normalizeHandle(firstCells[1]);
    if (
      (cell0 === "" || isValidHandle(cell0)) &&
      (cell1 === "" || isValidHandle(cell1))
    ) {
      return parseStructured(lines, delimiter, autoMapping);
    }
  }

  // Fallback: newline-separated single handles (Instagram-only)
  return parseNewlineSeparated(lines);
}

// ---------------------------------------------------------------------------
// Structured parser (CSV/TSV with column mapping)
// ---------------------------------------------------------------------------

function parseStructured(
  lines: string[],
  delimiter: string,
  mapping: ColumnMapping
): BatchParseResult {
  const rows: BatchImportRow[] = [];
  const errors: BatchValidationError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map((c) => c.trim());
    const sourceRowIndex = i + 1; // 1-indexed for user display

    const rawIg = mapping.instagram >= 0 ? cells[mapping.instagram] || "" : "";
    const rawTk = mapping.tiktok >= 0 ? cells[mapping.tiktok] || "" : "";
    const label = mapping.label >= 0 ? cells[mapping.label] || null : null;
    const notes = mapping.notes >= 0 ? cells[mapping.notes] || null : null;

    const ig = normalizeHandle(rawIg);
    const tk = normalizeHandle(rawTk);

    // Validate: at least one handle must be present
    if (!ig && !tk) {
      errors.push({
        sourceRowIndex,
        field: "row",
        message: "Row has no Instagram or TikTok handle.",
      });
      continue;
    }

    // Validate handle formats
    if (ig && !isValidHandle(ig)) {
      errors.push({
        sourceRowIndex,
        field: "instagram",
        message: `Invalid Instagram handle: "${rawIg}"`,
      });
      continue;
    }

    if (tk && !isValidHandle(tk)) {
      errors.push({
        sourceRowIndex,
        field: "tiktok",
        message: `Invalid TikTok handle: "${rawTk}"`,
      });
      continue;
    }

    rows.push({
      id: generateRowId(),
      instagramUsername: ig || null,
      tiktokUsername: tk || null,
      label,
      notes,
      sourceRowIndex,
    });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Newline-separated parser (single handles, Instagram-only)
// ---------------------------------------------------------------------------

function parseNewlineSeparated(lines: string[]): BatchParseResult {
  const rows: BatchImportRow[] = [];
  const errors: BatchValidationError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    const sourceRowIndex = i + 1;

    if (!raw) continue;

    const handle = normalizeHandle(raw);
    if (!handle) {
      errors.push({
        sourceRowIndex,
        field: "handle",
        message: `Empty handle after normalization: "${raw}"`,
      });
      continue;
    }

    if (!isValidHandle(handle)) {
      errors.push({
        sourceRowIndex,
        field: "handle",
        message: `Invalid handle format: "${raw}"`,
      });
      continue;
    }

    rows.push({
      id: generateRowId(),
      instagramUsername: handle,
      tiktokUsername: null,
      label: null,
      notes: null,
      sourceRowIndex,
    });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Deduplication utility
// ---------------------------------------------------------------------------

/**
 * Extract unique handles from batch rows, grouped by platform.
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
