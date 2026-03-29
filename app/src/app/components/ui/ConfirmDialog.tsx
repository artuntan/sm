"use client";

/**
 * ConfirmDialog — Sharp-edged confirm/cancel dialog
 */

import { useEffect, useCallback, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "CONFIRM",
  cancelLabel = "CANCEL",
  variant = "default",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const confirmColor = variant === "destructive" ? "var(--accent-pink)" : "var(--accent-green)";
  const confirmTextColor = variant === "destructive" ? "#fff" : "var(--text-inverse)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        className="relative rounded-md border p-4 w-full max-w-sm mx-4 animate-slide-up"
        style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border-default)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
      >
        <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{title}</h3>
        {description && (
          <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>{description}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-2.5 py-1.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-2.5 py-1.5 rounded text-[10px] font-medium transition-all"
            style={{ backgroundColor: confirmColor, color: confirmTextColor, fontFamily: "var(--font-mono)", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
