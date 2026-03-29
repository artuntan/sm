/**
 * Batch Workspace Domain Types
 *
 * Canonical types for the bulk creator search workspace.
 * Designed to power a session-local queue now and a durable
 * job system later.
 */

import type { Platform, PlatformAnalysis } from "./types";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** A single parsed row from operator intake (CSV/TSV/paste) */
export type BatchImportRow = {
  id: string;
  instagramUsername: string | null;
  tiktokUsername: string | null;
  label: string | null;
  notes: string | null;
  sourceRowIndex: number;
};

/** Validation error for a specific row */
export type BatchValidationError = {
  sourceRowIndex: number;
  field: string;
  message: string;
};

/** Result of parsing raw text input into batch rows */
export type BatchParseResult = {
  rows: BatchImportRow[];
  errors: BatchValidationError[];
};

// ---------------------------------------------------------------------------
// Handle-level job tracking
// ---------------------------------------------------------------------------

export type BatchHandleStatus = "queued" | "running" | "success" | "error";

/** Per-handle fetch state — the unit of work in the batch queue */
export type BatchHandleJob = {
  platform: Platform;
  username: string;
  status: BatchHandleStatus;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  result: PlatformAnalysis | null;
};

// ---------------------------------------------------------------------------
// Row-level result composition
// ---------------------------------------------------------------------------

export type BatchRowStatus =
  | "queued"
  | "running"
  | "partial"
  | "complete"
  | "error";

/** Composed row state — derived from handle lookup maps */
export type BatchRowResult = {
  row: BatchImportRow;
  status: BatchRowStatus;
  instagram: PlatformAnalysis | null;
  tiktok: PlatformAnalysis | null;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Batch-level summary
// ---------------------------------------------------------------------------

export type BatchRunSummary = {
  totalRows: number;
  queuedRows: number;
  runningRows: number;
  completeRows: number;
  partialRows: number;
  errorRows: number;
  totalUniqueInstagramHandles: number;
  totalUniqueTikTokHandles: number;
  completedHandles: number;
  totalHandles: number;
};

// ---------------------------------------------------------------------------
// Batch workspace state
// ---------------------------------------------------------------------------

export type BatchWorkspacePhase = "intake" | "processing" | "results";

// ---------------------------------------------------------------------------
// Handle key utility
// ---------------------------------------------------------------------------

/** Compose a unique key for a handle job */
export function handleJobKey(platform: Platform, username: string): string {
  return `${platform}:${username}`;
}
