"use client";

/**
 * StatusBadge — Flat, tight, skills.name-style status/role badge
 */

const STATUS_MAP: Record<string, { color: string; bg: string }> = {
  complete: { color: "var(--accent-green)", bg: "var(--accent-green-glow)" },
  approved: { color: "var(--accent-green)", bg: "var(--accent-green-glow)" },
  active: { color: "var(--accent-green)", bg: "var(--accent-green-glow)" },
  partial: { color: "var(--accent-amber)", bg: "rgba(245,158,11,0.10)" },
  pending: { color: "var(--text-muted)", bg: "var(--bg-elevated)" },
  running: { color: "var(--accent-blue)", bg: "rgba(59,130,246,0.10)" },
  error: { color: "var(--accent-pink)", bg: "var(--accent-pink-glow)" },
  rejected: { color: "var(--accent-pink)", bg: "var(--accent-pink-glow)" },
  suspended: { color: "var(--accent-pink)", bg: "var(--accent-pink-glow)" },
  inactive: { color: "var(--accent-pink)", bg: "var(--accent-pink-glow)" },
  system_admin: { color: "var(--accent-green)", bg: "var(--accent-green-glow)" },
  team_admin: { color: "var(--accent-blue)", bg: "rgba(59,130,246,0.10)" },
  member: { color: "var(--text-muted)", bg: "var(--bg-elevated)" },
  user: { color: "var(--text-muted)", bg: "var(--bg-elevated)" },
};

const ROLE_LABELS: Record<string, string> = {
  system_admin: "SYSTEM ADMIN",
  team_admin: "TEAM ADMIN",
  member: "MEMBER",
  user: "USER",
};

export function StatusBadge({
  status,
  label,
  size = "sm",
}: {
  status: string;
  label?: string;
  size?: "xs" | "sm";
}) {
  const s = STATUS_MAP[status] || { color: "var(--text-muted)", bg: "var(--bg-elevated)" };
  const displayLabel = label || ROLE_LABELS[status] || status.toUpperCase();
  const fontSize = size === "xs" ? "8px" : "9px";
  const padding = size === "xs" ? "1px 4px" : "1px 6px";

  return (
    <span
      className="font-semibold inline-block"
      style={{
        fontSize,
        padding,
        backgroundColor: s.bg,
        color: s.color,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.04em",
        borderRadius: "3px",
        border: `1px solid var(--border-subtle)`,
      }}
    >
      {displayLabel}
    </span>
  );
}
