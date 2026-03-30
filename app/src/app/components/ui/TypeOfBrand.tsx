"use client";

/**
 * TypeOfBrand — Logo mark for "type of"
 *
 * High-fidelity SVG trace of the oval+t logo mark.
 * Uses stroked center-line paths for clean rendering.
 * Theme-aware via --typeof-brand CSS variable.
 *
 * Dark mode: lighter silver (#b0b8c4)
 * Light mode: darker slate (#505860)
 */

import { CSSProperties } from "react";

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
  const fill = color || "var(--typeof-brand, var(--text-secondary))";
  // Aspect ratio matches reference: ~1.42:1
  const w = Math.round(size * 1.42);
  const h = size;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 284 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-label="type of"
      role="img"
    >
      {/* Oval ring */}
      <ellipse
        cx="142"
        cy="100"
        rx="124"
        ry="86"
        stroke={fill}
        strokeWidth="24"
        fill="none"
      />
      {/* 't' character — stroked center-lines painted over the oval */}
      <g
        stroke={fill}
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* Vertical stem */}
        <line x1="142" y1="24" x2="142" y2="152" />
        {/* Crossbar */}
        <line x1="100" y1="72" x2="184" y2="72" />
        {/* Bottom hook curving right */}
        <path d="M 142 152 C 142 174, 162 182, 186 170" />
        {/* Top left serif */}
        <line x1="122" y1="36" x2="142" y2="36" />
      </g>
    </svg>
  );
}
