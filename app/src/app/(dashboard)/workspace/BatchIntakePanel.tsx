"use client";

import { useState } from "react";
import type { BatchImportRow, BatchValidationError } from "@/lib/domain/batch-types";
import { extractUniqueHandles } from "@/lib/domain/batch-parser";
import { SystemGuideModal } from "./SystemGuideModal";

export function BatchIntakePanel({
  rawInput,
  onInputChange,
  parseErrors,
  onParse,
  onStart,
}: {
  rawInput: string;
  onInputChange: (v: string) => void;
  parseErrors: BatchValidationError[];
  onParse: () => { rows: BatchImportRow[]; errors: BatchValidationError[] };
  onStart: () => void;
}) {
  const [preview, setPreview] = useState<{ rows: BatchImportRow[]; errors: BatchValidationError[] } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const handlePreview = () => {
    const result = onParse();
    setPreview(result);
  };

  const handleStart = () => {
    onStart();
  };

  return (
    <div className="animate-fade-in">
      {/* ── Page Header ─────────────────────────────────── */}
      <div
        className="flex items-center justify-between mb-4 animate-slide-up"
        style={{ minHeight: "32px" }}
      >
        <div>
          <h1
            className="text-[13px] font-semibold tracking-wider"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              margin: 0,
              textTransform: "uppercase",
            }}
          >
            Analyze
          </h1>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", margin: "4px 0 0 0" }}
          >
            Paste creator handles — one per row, Instagram and TikTok on the same line
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className="cap-chip">INSTAGRAM</span>
          <span className="cap-chip">TIKTOK</span>
          <span className="cap-chip">CSV · TSV · SHEETS</span>
          <button
            onClick={() => setGuideOpen(true)}
            className="guide-trigger"
            aria-label="Open system guide"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M6.5 6.5a1.5 1.5 0 1 1 1.5 1.5v1.5" strokeLinecap="round" />
              <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none" />
            </svg>
            GUIDE
          </button>
        </div>
      </div>

      {/* ── System Guide Modal ──────────────────────────────────── */}
      <SystemGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* ── Intake Shell ──────────────────────────────────────────── */}
      <div className="intake-shell p-5 animate-slide-up-delay flex flex-col" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="flex flex-col flex-1">

          {/* ── Input Panel (full width) ──────────────────────────── */}
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1">
              <label
                className="block text-[10px] font-semibold tracking-widest shrink-0"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              >
                PASTE CREATOR ROWS
              </label>
              <div className="format-hint">
                <span>Format:</span> <code>instagram, tiktok</code> <span className="hidden sm:inline">· one row per creator · blank cell = skip</span>
              </div>
            </div>
            <textarea
              id="batch-input"
              value={rawInput}
              onChange={(e) => {
                onInputChange(e.target.value);
                setPreview(null);
              }}
              placeholder={`instagram handle, tiktok handle\nuberkuloz, uberkuloz\nberkcan, bege\ndogaozdas, dogaozdas\nreymen, reynmen`}
              className="intake-textarea w-full p-4 text-sm resize-none placeholder:opacity-20 flex-1"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            />

            {/* ── Inline Preview Strip ────────────────────────────── */}
            {preview && (
              <div className="preview-strip p-3 mt-3 animate-fade-in">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                        {preview.rows.length}
                      </span>
                      <span className="text-[10px] font-medium tracking-wide" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        creator rows
                      </span>
                    </div>
                    <div className="flex gap-2.5 text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--accent-blue)" }} />
                        IG: {extractUniqueHandles(preview.rows).instagram.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--accent-pink)" }} />
                        TK: {extractUniqueHandles(preview.rows).tiktok.length}
                      </span>
                    </div>
                    {preview.errors.length > 0 && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold" style={{ color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}>
                          {preview.errors.length}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--accent-pink)" }}>errors</span>
                      </div>
                    )}
                  </div>
                  {preview.rows.length > 0 && preview.errors.length === 0 && (
                    <span className="text-[10px] font-medium" style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)" }}>
                      ✓ READY
                    </span>
                  )}
                </div>
                {preview.errors.length > 0 && (
                  <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    {preview.errors.slice(0, 3).map((e, i) => (
                      <p key={i} className="text-[10px]" style={{ color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}>
                        Row {e.sourceRowIndex}: {e.message}
                      </p>
                    ))}
                    {preview.errors.length > 3 && (
                      <p className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        +{preview.errors.length - 3} more
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Action Bar ──────────────────────────────────────────── */}
        <div className="action-bar flex items-center justify-between">
          <button
            onClick={handlePreview}
            disabled={!rawInput.trim()}
            className="px-5 py-2 rounded-md text-xs font-medium tracking-wide transition-all"
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--border-default)",
              color: !rawInput.trim() ? "var(--text-muted)" : "var(--text-secondary)",
              opacity: !rawInput.trim() ? 0.3 : 1,
              fontFamily: "var(--font-mono)",
            }}
          >
            PREVIEW
          </button>
          <button
            id="btn-start-batch"
            onClick={handleStart}
            disabled={!rawInput.trim()}
            className="px-7 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all flex items-center gap-2"
            style={{
              backgroundColor: !rawInput.trim() ? "var(--bg-elevated)" : "var(--accent-green)",
              color: !rawInput.trim() ? "var(--text-muted)" : "var(--text-inverse)",
              opacity: !rawInput.trim() ? 0.3 : 1,
              fontFamily: "var(--font-mono)",
              boxShadow: rawInput.trim() ? "0 0 20px -4px rgba(0, 255, 106, 0.25)" : "none",
            }}
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,0 12,6 2,12" /></svg>
            START ANALYSIS
          </button>
        </div>
      </div>
    </div>
  );
}
