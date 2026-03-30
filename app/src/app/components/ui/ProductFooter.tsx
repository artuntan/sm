"use client";

/**
 * ProductFooter — Global product chrome footer
 *
 * Slim instrument-bar footer that matches the type of design language:
 * matte-black surface, mono typography, restrained emerald accents.
 *
 * Two variants:
 *   - "dashboard" (default): full footer with nav shortcuts + status line
 *   - "auth": minimal brand-only footer for login/signup
 */

import Link from "next/link";

type FooterVariant = "dashboard" | "auth";

export function ProductFooter({
  variant = "dashboard",
  maxWidth = "1200px",
}: {
  variant?: FooterVariant;
  maxWidth?: string;
}) {
  const year = new Date().getFullYear();

  if (variant === "auth") {
    return (
      <footer
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "6px",
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            backgroundColor: "var(--typeof-brand)",
            opacity: 0.5,
          }}
        />
        <span
          style={{
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            opacity: 0.5,
          }}
        >
          type of © {year}
        </span>
      </footer>
    );
  }

  // Dashboard variant
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border-subtle)",
        marginTop: "auto",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .product-footer-link:hover {
          opacity: 0.9 !important;
          color: var(--accent-green) !important;
        }
      `}} />
      <div
        style={{
          maxWidth,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        {/* Left: Brand + Dot */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <div
            style={{
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              backgroundColor: "var(--typeof-brand)",
              opacity: 0.6,
            }}
          />
          <span
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              fontWeight: 500,
            }}
          >
            type of
          </span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              opacity: 0.35,
            }}
          >
            © {year}
          </span>
        </div>

        {/* Right: Navigation shortcuts */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
          }}
        >
          {[
            { label: "ANALYZE", href: "/" },
            { label: "CAMPAIGNS", href: "/campaigns" },
            { label: "CREATORS", href: "/warehouse" },
            { label: "COVERAGE", href: "/coverage" },
            { label: "HISTORY", href: "/history" },
          ].map((item, i) => (
            <span key={item.href} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && (
                <span
                  style={{
                    fontSize: "8px",
                    color: "var(--text-muted)",
                    opacity: 0.2,
                    margin: "0 4px",
                    userSelect: "none",
                  }}
                >
                  ·
                </span>
              )}
              <Link
                href={item.href}
                className="product-footer-link"
                style={{
                  fontSize: "9px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  textDecoration: "none",
                  letterSpacing: "0.06em",
                  opacity: 0.5,
                  transition: "opacity 0.15s ease, color 0.15s ease",
                }}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
