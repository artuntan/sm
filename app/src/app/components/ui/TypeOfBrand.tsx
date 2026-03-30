"use client";

/**
 * TypeOfBrand — Brand mark and wordmark for "type of"
 *
 * Inline SVG components that respond to the current theme via
 * CSS custom properties. No external font files needed.
 *
 * Variants:
 *   - Mark only (oval + t)
 *   - Full (mark + "type of" wordmark)
 *   - Wordmark only
 *
 * Theme behavior:
 *   - Dark mode: lighter silver fill (#b0b8c4)
 *   - Light mode: darker slate fill (#505860)
 */

import { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// Theme-aware color: uses CSS variables matching the design system
// ---------------------------------------------------------------------------

const MARK_COLOR = "var(--typeof-brand, var(--text-secondary))";

// ---------------------------------------------------------------------------
// TypeOfMark — The oval-t logomark
// ---------------------------------------------------------------------------

export function TypeOfMark({
  size = 22,
  color,
  style,
  className,
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const fill = color || MARK_COLOR;
  // Aspect ratio of the mark is roughly 1.45:1 (wider than tall)
  const w = size * 1.45;
  const h = size;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 290 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-label="type of"
    >
      {/* Outer oval ring */}
      <ellipse
        cx="145"
        cy="100"
        rx="130"
        ry="90"
        stroke={fill}
        strokeWidth="24"
        fill="none"
      />
      {/* Letter t — vertical stroke */}
      <rect
        x="131"
        y="42"
        width="22"
        height="120"
        rx="6"
        fill={fill}
      />
      {/* Letter t — horizontal crossbar */}
      <rect
        x="110"
        y="62"
        width="64"
        height="20"
        rx="6"
        fill={fill}
      />
      {/* Letter t — bottom serif/hook curving right */}
      <path
        d="M153 148 C153 166, 168 174, 182 168"
        stroke={fill}
        strokeWidth="20"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// TypeOfWordmark — "type of" in script/cursive as SVG path
// ---------------------------------------------------------------------------

export function TypeOfWordmark({
  height = 14,
  color,
  style,
  className,
}: {
  height?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const fill = color || MARK_COLOR;
  // The wordmark aspect ratio: ~4.5:1
  const w = height * 4.5;

  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 180 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-label="type of"
    >
      {/* "type of" rendered as connected script letterforms */}
      <g fill={fill}>
        {/* t */}
        <path d="M7 8 L7 28 Q7 34 13 32 L14 30 L14 28 Q10 30 10 26 L10 12 L16 12 L16 9 L10 9 L10 4 L7 6 L7 8 Z" />
        <rect x="4" y="11" width="14" height="3" rx="1.5" />
        
        {/* y */}
        <path d="M20 10 Q22 22 26 26 Q24 34 19 38 L22 38 Q28 34 29 26 L34 10 L31 10 L27 23 L23 10 Z" />
        
        {/* p */}
        <path d="M37 10 L37 38 L40 38 L40 26 Q42 28 46 28 Q52 28 54 22 Q56 16 52 12 Q48 8 44 10 Q41 11 40 14 L40 10 Z M40 16 Q42 12 46 12 Q50 12 51 16 Q52 20 50 24 Q48 27 44 26 Q40 24 40 20 Z" />
        
        {/* e */}
        <path d="M58 18 Q58 12 62 10 Q66 8 70 12 L71 16 L58 18 Q58 24 62 26 Q66 28 70 24 L71 22 Q68 27 64 26 Q60 25 58 18 Z M68 14 Q66 10 62 12 Q60 14 60 16 L68 14 Z" />
        
        {/* space + o */}
        <path d="M88 18 Q88 10 94 8 Q100 8 102 14 Q104 20 100 26 Q96 30 90 28 Q86 26 86 20 Q86 14 88 18 Z M90 18 Q88 14 92 10 Q96 8 98 14 Q100 20 98 24 Q94 28 90 24 Q88 22 90 18 Z" />
        
        {/* f */}
        <path d="M108 10 L108 28 L111 28 L111 14 Q111 8 116 6 L117 4 Q110 4 108 10 Z" />
        <rect x="105" y="12" width="12" height="3" rx="1.5" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// TypeOfBrand — Combined mark + wordmark for top bar
// ---------------------------------------------------------------------------

export function TypeOfBrand({
  markSize = 20,
  showWordmark = true,
  gap = 8,
  style,
  className,
}: {
  markSize?: number;
  showWordmark?: boolean;
  gap?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: `${gap}px`,
        textDecoration: "none",
        ...style,
      }}
    >
      <TypeOfMark size={markSize} />
      {showWordmark && (
        <TypeOfWordmark height={markSize * 0.65} />
      )}
    </span>
  );
}
