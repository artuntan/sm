"use client";

/**
 * Drawer — Right-edge slide-over panel
 *
 * Slide-in overlay for contextual workflows without full-page navigation.
 * Supports Esc to close + backdrop click.
 */

import { useEffect, useCallback, type ReactNode } from "react";

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "420px",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 drawer-backdrop"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="absolute right-0 top-0 bottom-0 flex flex-col drawer-panel"
        style={{
          width,
          maxWidth: "90vw",
          backgroundColor: "var(--bg-card)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        {title && (
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span
              className="text-xs font-medium tracking-wider"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              {title}
            </span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded text-xs transition-all hover:opacity-80"
              style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-elevated)" }}
            >
              ✕
            </button>
          </div>
        )}
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
