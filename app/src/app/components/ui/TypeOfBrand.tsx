"use client";

/**
 * TypeOfBrand — Logo + product descriptor for "type of"
 *
 * Uses actual SVG logo files, theme-switched via CSS:
 *   Dark mode → /logo-dark.svg  (white logo)
 *   Light mode → /logo-light.svg (gray logo)
 *
 * Includes a small "marketing" product descriptor badge
 * so users understand this is type of's marketing tool.
 */

import { CSSProperties } from "react";

/* ------------------------------------------------------------------ */
/*  Logo mark — img-based, theme-aware                                */
/* ------------------------------------------------------------------ */

export function TypeOfMark({
  size = 22,
  style,
  className,
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}) {
  // SVG viewBox is 1327×776 → aspect ratio ≈ 1.71
  const w = Math.round(size * 1.71);
  const h = size;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        width: w,
        height: h,
        position: "relative",
        ...style,
      }}
    >
      {/* Dark mode logo (white) */}
      <img
        src="/logo-dark.svg"
        alt="type of"
        width={w}
        height={h}
        className="typeof-logo-dark"
        style={{
          display: "block",
          width: w,
          height: h,
          objectFit: "contain",
          position: "absolute",
          inset: 0,
        }}
        draggable={false}
      />
      {/* Light mode logo (gray) */}
      <img
        src="/logo-light.svg"
        alt="type of"
        width={w}
        height={h}
        className="typeof-logo-light"
        style={{
          display: "block",
          width: w,
          height: h,
          objectFit: "contain",
          position: "absolute",
          inset: 0,
        }}
        draggable={false}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Full brand lockup: Logo + product descriptor badge                */
/* ------------------------------------------------------------------ */

export function TypeOfBrandLockup({
  logoSize = 20,
  style,
  className,
}: {
  logoSize?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        ...style,
      }}
    >
      <TypeOfMark size={logoSize} />
      <span
        style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          opacity: 0.6,
          lineHeight: 1,
          borderLeft: "1px solid var(--border-subtle)",
          paddingLeft: 6,
          whiteSpace: "nowrap",
        }}
      >
        marketing
      </span>
    </span>
  );
}
