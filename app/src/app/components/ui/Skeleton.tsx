"use client";

/**
 * Skeleton — Shimmer loading primitives (sharp-edged, dense)
 */

export function SkeletonLine({
  width = "100%",
  height = "12px",
  className = "",
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`skeleton-shimmer rounded ${className}`}
      style={{ width, height, borderRadius: "3px" }}
    />
  );
}

export function SkeletonCard({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border p-3 space-y-2.5 ${className}`}
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}
    >
      <SkeletonLine width="40%" height="9px" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? "60%" : "100%"} height="12px" />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-md border overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}>
      <div className="flex gap-4 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {[80, 120, 100, 60].map((w, i) => (
          <SkeletonLine key={i} width={`${w}px`} height="9px" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-3 py-2.5"
          style={{ borderBottom: i < rows - 1 ? "1px solid var(--border-subtle)" : undefined, opacity: 1 - i * 0.15 }}
        >
          {[80, 120, 100, 60].map((w, j) => (
            <SkeletonLine key={j} width={`${w}px`} height="11px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${count} gap-2`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border p-2.5"
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-subtle)" }}
        >
          <SkeletonLine width="50%" height="8px" className="mb-1.5" />
          <SkeletonLine width="35%" height="18px" />
        </div>
      ))}
    </div>
  );
}

/** Branded auth spinner */
export function AuthSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="flex flex-col items-center gap-2.5 animate-fade-in">
        <div
          className="w-3 h-3 rounded-full animate-pulse"
          style={{ backgroundColor: "var(--accent-green)" }}
        />
        <span
          className="text-[9px] tracking-widest"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          AUTHENTICATING
        </span>
      </div>
    </div>
  );
}
