"use client";

/**
 * Modal — Centered overlay dialog (sharp-edged, skills.name language)
 */

import { useEffect, useCallback, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "460px",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 modal-backdrop"
        style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="relative modal-panel rounded-md border flex flex-col"
        style={{
          width,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 64px)",
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-default)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        {title && (
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span
              className="text-[10px] font-semibold tracking-wider"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
            >
              {title}
            </span>
            <button
              onClick={onClose}
              className="w-5 h-5 flex items-center justify-center rounded text-[10px] transition-all hover:opacity-80"
              style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-elevated)" }}
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
