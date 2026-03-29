"use client";

/**
 * PageShell — Shared page wrapper (sharp design language)
 */

import type { ReactNode } from "react";

export function PageShell({
  title,
  backHref = "/",
  backLabel = "WORKSPACE",
  secondaryAction,
  maxWidth = "1200px",
  children,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  secondaryAction?: ReactNode;
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      <header className="border-b sticky top-0 z-10" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-primary)" }}>
        <div className="mx-auto px-4 py-2.5 flex items-center justify-between" style={{ maxWidth }}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent-green)" }} />
            <span
              className="text-[10px] font-semibold tracking-wider"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
            >
              {title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {secondaryAction}
            <a
              href={backHref}
              className="text-[9px] px-2 py-1 rounded font-medium"
              style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", border: "1px solid var(--border-subtle)" }}
            >
              ← {backLabel}
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto px-4 py-4" style={{ maxWidth }}>
        {children}
      </main>
    </div>
  );
}
