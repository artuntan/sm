"use client";

import { useState, useEffect, useCallback } from "react";
import { TypeOfMark } from "@/app/components/ui/TypeOfBrand";

/**
 * ToolsSection — "Type Of Tools" showcase
 *
 * Dark grid field, cross markers, sparkle stars,
 * liquid-glass rail, three-node system composition.
 *
 * Responsive architecture:
 *   Desktop (≥769px): Protected reference composition — 130px tiles, 64px gaps,
 *                      tight header-to-hero rhythm, optical vertical centering.
 *   Tablet  (≤768px): Reduced tiles (100px) and gaps (28px), tighter padding.
 *   Mobile  (≤480px): Compact tiles (82px), minimal gaps (14px), stacked header.
 *   Tiny    (≤360px): Further reduction (72px tiles, 10px gaps).
 *
 * Breakpoint rules are ADDITIVE — they never mutate the desktop baseline,
 * only override specific tokens below each threshold.
 */

/* ─── Responsive CSS ─────────────────────────────────────────────── */
const RESPONSIVE_CSS = `
  /* ═══ DESIGN TOKENS — Desktop baseline ═══ */
  :root {
    --ts-icon: 130px;
    --ts-icon-radius: 26px;
    --ts-gap: 64px;
    --ts-rail-h: 186px;
    --ts-rail-pad: 40px;
    --ts-rail-radius: 28px;
    --ts-header-mb: 0px;
    --ts-section-pt: 80px;
    --ts-section-pb: 64px;
    --ts-section-px: 32px;
    --ts-popup-width: 92vw;
    --ts-popup-max: 540px;
    --ts-popup-pad: 28px 32px 24px;
    --ts-popup-radius: 18px;
    --ts-icon-cs: 130px;
    --ts-icon-cs-radius: 28px;
  }

  /* ═══ TABLET — ≤768px ═══ */
  @media (max-width: 768px) {
    :root {
      --ts-icon: 100px;
      --ts-icon-radius: 22px;
      --ts-gap: 28px;
      --ts-rail-h: 156px;
      --ts-rail-pad: 24px;
      --ts-rail-radius: 22px;
      --ts-header-mb: 0px;
      --ts-section-pt: 56px;
      --ts-section-pb: 48px;
      --ts-section-px: 24px;
      --ts-popup-width: 94vw;
      --ts-popup-max: 480px;
      --ts-popup-pad: 24px 24px 20px;
      --ts-popup-radius: 16px;
      --ts-icon-cs: 100px;
      --ts-icon-cs-radius: 22px;
    }
  }

  /* ═══ MOBILE — ≤480px ═══ */
  @media (max-width: 480px) {
    :root {
      --ts-icon: 82px;
      --ts-icon-radius: 20px;
      --ts-gap: 14px;
      --ts-rail-h: 132px;
      --ts-rail-pad: 16px;
      --ts-rail-radius: 18px;
      --ts-header-mb: 0px;
      --ts-section-pt: 40px;
      --ts-section-pb: 36px;
      --ts-section-px: 16px;
      --ts-popup-width: 96vw;
      --ts-popup-max: 420px;
      --ts-popup-pad: 20px 18px 16px;
      --ts-popup-radius: 14px;
      --ts-icon-cs: 82px;
      --ts-icon-cs-radius: 18px;
    }
  }

  /* ═══ TINY — ≤360px ═══ */
  @media (max-width: 360px) {
    :root {
      --ts-icon: 72px;
      --ts-icon-radius: 18px;
      --ts-gap: 10px;
      --ts-rail-h: 118px;
      --ts-rail-pad: 12px;
      --ts-rail-radius: 16px;
      --ts-section-px: 12px;
      --ts-icon-cs: 72px;
      --ts-icon-cs-radius: 16px;
    }
  }

  /* ═══ KEYFRAMES ═══ */
  @keyframes tools-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @keyframes tools-rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes popupFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ═══ HEADER RESPONSIVE ═══ */
  .ts-header {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }
  @media (max-width: 768px) {
    .ts-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 20px !important;
    }
  }

  /* ═══ POPUP MOBILE GRID FIX ═══ */
  @media (max-width: 480px) {
    .ts-popup-compare-grid {
      grid-template-columns: 1fr !important;
    }
    .ts-popup-feature-grid {
      grid-template-columns: 1fr !important;
    }
  }

  /* ═══ LABEL RESPONSIVE ═══ */
  .ts-label {
    font-size: 10px;
    letter-spacing: 0.2em;
  }
  @media (max-width: 480px) {
    .ts-label {
      font-size: 8px;
      letter-spacing: 0.12em;
    }
  }
  @media (max-width: 360px) {
    .ts-label {
      font-size: 7px;
      letter-spacing: 0.08em;
    }
  }
`;

export default function ToolsSection() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "workflow" | "compare">("overview");

  /* ── Escape key handler ── */
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && aboutOpen) { setAboutOpen(false); setActiveTab("overview"); }
    },
    [aboutOpen],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#141414",
        minHeight: "100vh",
        overflowX: "hidden",
      }}
    >
      <style>{RESPONSIVE_CSS}</style>

      {/* ── Top checkerboard strip ── */}
      <div style={{ position: "relative", width: "100%", flexShrink: 0, zIndex: 30, height: 14 }}>
        <svg width="100%" height="14" style={{ display: "block" }}>
          <defs>
            <pattern id="checker-tools" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="2" height="2" fill="rgba(255,255,255,0.35)" />
              <rect x="2" y="2" width="2" height="2" fill="rgba(255,255,255,0.35)" />
            </pattern>
          </defs>
          <rect width="100%" height="14" fill="url(#checker-tools)" />
        </svg>
      </div>

      {/* ── Background layers ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "120px 120px",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 50% at 50% 55%, rgba(255,255,255,0.025) 0%, transparent 100%)",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.4) 100%)",
          zIndex: 0,
        }}
      />

      {/* ── Cross markers ── */}
      <CrossMark style={{ top: "30%", left: "28%" }} />
      <CrossMark style={{ top: "22%", left: "52%" }} />
      <CrossMark style={{ top: "72%", left: "18%" }} />
      <CrossMark style={{ top: "65%", right: "15%" }} />
      <CrossMark style={{ top: "25%", right: "10%" }} />
      <CrossMark style={{ top: "78%", left: "45%" }} />

      {/* ── Sparkle stars ── */}
      <Sparkle style={{ top: "38%", left: "12%" }} size={12} opacity={0.25} />
      <Sparkle style={{ top: "55%", right: "8%" }} size={8} opacity={0.2} />
      <Sparkle style={{ top: "30%", right: "25%" }} size={6} opacity={0.15} />
      <Sparkle style={{ top: "70%", left: "35%" }} size={5} opacity={0.18} />

      {/* ── Main content — two-band layout: header top, rail centered below ── */}
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          zIndex: 10,
          padding: "var(--ts-section-pt) var(--ts-section-px) var(--ts-section-pb)",
        }}
      >
        {/* Header area */}
        <div
          className="ts-header"
          style={{
            width: "100%",
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            gap: 32,
            marginBottom: "var(--ts-header-mb)",
          }}
        >
          {/* ── Title: Type Of logo + "tools" ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TypeOfMark size={24} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase" as const,
                color: "rgba(232,232,236,0.35)",
                fontFamily: "var(--font-mono)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 4,
                padding: "4px 8px 3px",
              }}
            >
              tools
            </span>
          </div>

          {/* ── Description ── */}
          <p
            style={{
              color: "#6a6a6a",
              fontSize: 14,
              maxWidth: 440,
              lineHeight: 1.7,
              fontFamily: "var(--font-sans)",
              margin: 0,
            }}
          >
            <span style={{ color: "#c0c0c0", fontWeight: 500 }}>Type Of</span> builds specialized
            tools for marketing teams —{" "}
            <span style={{ color: "#c0c0c0", fontWeight: 500 }}>intelligence</span>,{" "}
            <span style={{ color: "#c0c0c0", fontWeight: 500 }}>automation</span>, and{" "}
            <span style={{ color: "#c0c0c0", fontWeight: 500 }}>insights</span>
            <br />
            {"— infrastructure designed for modern marketing operations."}
          </p>
        </div>

        {/* ── Flow diagram — takes remaining space, centers rail vertically ── */}
        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          {/* ── Composition row wrapper ── */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Single liquid glass rail — token-driven sizing */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "fit-content",
                minWidth: 0,
                padding: "0 var(--ts-rail-pad)",
                height: "var(--ts-rail-h)",
                borderRadius: "var(--ts-rail-radius)",
                border: "1px solid rgba(255,255,255,0.06)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.008) 100%)",
                backdropFilter: "blur(2px)",
                WebkitBackdropFilter: "blur(2px)",
                zIndex: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                boxSizing: "border-box",
              }}
            >
              {/* Ghost sizer — mirrors flow row dimensions for rail width */}
              <div style={{ display: "flex", alignItems: "center", visibility: "hidden" }}>
                <div style={{ width: "var(--ts-icon-cs)", height: "var(--ts-icon-cs)" }} />
                <div style={{ width: "var(--ts-gap)" }} />
                <div style={{ width: "var(--ts-icon)", height: "var(--ts-icon)" }} />
                <div style={{ width: "var(--ts-gap)" }} />
                <div style={{ width: "var(--ts-icon-cs)", height: "var(--ts-icon-cs)" }} />
              </div>
            </div>

            {/* Flow row */}
            <div
              style={{
                position: "relative",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                gap: 0,
              }}
            >
              {/* ── COMING SOON (left) ── */}
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <ComingSoonIcon />
                <span
                  className="ts-label"
                  style={{
                    marginTop: 14,
                    color: "#484848",
                    textTransform: "uppercase" as const,
                    fontFamily: "var(--font-sans)",
                    fontWeight: 500,
                  }}
                >
                  Coming Soon
                </span>
              </div>

              <div style={{ width: "var(--ts-gap)" }} />

              {/* ── MARKETING (center) ── */}
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  filter: aboutOpen ? "brightness(1.05)" : "none",
                  transition: "filter 0.3s ease",
                }}
              >
                <a
                  href="#marketing"
                  style={{
                    display: "block",
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  <MarketingIcon />
                </a>
                {/* ── Marketing label with integrated About affordance ── */}
                <button
                  onClick={() => setAboutOpen(!aboutOpen)}
                  aria-expanded={aboutOpen}
                  aria-label="About Marketing tool"
                  className="ts-label"
                  style={{
                    marginTop: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: 0,
                    color: aboutOpen ? "rgba(255,180,140,0.7)" : "#484848",
                    textTransform: "uppercase" as const,
                    fontFamily: "var(--font-sans)",
                    fontWeight: 500,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    transition: "color 0.3s ease",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!aboutOpen) {
                      e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!aboutOpen) {
                      e.currentTarget.style.color = "#484848";
                    }
                  }}
                >
                  Marketing
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{
                      opacity: aboutOpen ? 0.9 : 0.5,
                      transition: "opacity 0.3s ease",
                      flexShrink: 0,
                    }}
                  >
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1" />
                    <text
                      x="8"
                      y="11.5"
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="600"
                      fill="currentColor"
                      fontFamily="var(--font-sans)"
                    >
                      i
                    </text>
                  </svg>
                </button>
              </div>

              <div style={{ width: "var(--ts-gap)" }} />

              {/* ── COMING SOON (right) ── */}
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <ComingSoonIcon />
                <span
                  className="ts-label"
                  style={{
                    marginTop: 14,
                    color: "#484848",
                    textTransform: "uppercase" as const,
                    fontFamily: "var(--font-sans)",
                    fontWeight: 500,
                  }}
                >
                  Coming Soon
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ABOUT POPUP — fixed overlay, outside section flow
          ═══════════════════════════════════════════════════════════ */}

      {/* Full-viewport subtle scrim */}
      <div
        onClick={() => { setAboutOpen(false); setActiveTab("overview"); }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "radial-gradient(ellipse 100% 100% at 50% 45%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 100%)",
          opacity: aboutOpen ? 1 : 0,
          pointerEvents: aboutOpen ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Popup container — fixed, centered in viewport */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) { setAboutOpen(false); setActiveTab("overview"); }
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0)",
          pointerEvents: aboutOpen ? "auto" : "none",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "var(--ts-popup-width)",
            maxWidth: "var(--ts-popup-max)",
            maxHeight: "calc(100dvh - 60px)",
            display: "flex",
            flexDirection: "column" as const,
            opacity: aboutOpen ? 1 : 0,
            transform: aboutOpen ? "translateY(0)" : "translateY(6px)",
            pointerEvents: aboutOpen ? "auto" : "none",
            transition: "opacity 0.3s ease, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* ── Card surface ── */}
          <div
            style={{
              position: "relative",
              borderRadius: "var(--ts-popup-radius)",
              border: "1px solid rgba(255,255,255,0.06)",
              background:
                "linear-gradient(180deg, rgba(30,31,34,0.97) 0%, rgba(22,23,26,0.99) 100%)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              padding: "var(--ts-popup-pad)",
              boxShadow: [
                "0 24px 64px -12px rgba(0,0,0,0.6)",
                "0 8px 20px rgba(0,0,0,0.3)",
                "0 0 0 0.5px rgba(255,255,255,0.03)",
                "inset 0 1px 0 rgba(255,255,255,0.04)",
              ].join(", "),
              zIndex: 2,
              display: "flex",
              flexDirection: "column" as const,
              overflow: "hidden",
            }}
          >
            {/* Close */}
            <button
              onClick={() => { setAboutOpen(false); setActiveTab("overview"); }}
              aria-label="Close about panel"
              style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)", background: "transparent", color: "rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 400, fontFamily: "var(--font-sans)", transition: "all 0.2s ease", outline: "none", padding: 0, lineHeight: 1 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.2)"; }}
            >✕</button>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "linear-gradient(135deg, #ff8060, #e84420)", boxShadow: "0 0 10px rgba(255,70,40,0.35)", flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "rgba(255,180,140,0.65)", fontFamily: "var(--font-mono)" }}>Marketing Intelligence</span>
            </div>

            {/* Tagline */}
            <p style={{ fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,0.48)", fontFamily: "var(--font-sans)", margin: "0 0 20px 0", maxWidth: 440 }}>
              Coordinated campaign intelligence — from scattered creator data to decision-ready benchmarks, classifications, and comparisons.
            </p>

            {/* ── Segmented control ── */}
            <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)", marginBottom: 20 }}>
              {([
                { id: "overview" as const, label: "Overview" },
                { id: "workflow" as const, label: "How It Works" },
                { id: "compare" as const, label: "Before / After" },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1, padding: "7px 0", fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", fontFamily: "var(--font-sans)",
                    color: activeTab === tab.id ? "rgba(255,200,175,0.9)" : "rgba(255,255,255,0.28)",
                    background: activeTab === tab.id ? "rgba(255,80,48,0.08)" : "transparent",
                    border: activeTab === tab.id ? "1px solid rgba(255,80,48,0.12)" : "1px solid transparent",
                    borderRadius: 8, cursor: "pointer", transition: "all 0.25s ease", outline: "none",
                  }}
                  onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
                  onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = "rgba(255,255,255,0.28)"; }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Tab content area ── */}
            <div style={{ minHeight: 180, flex: 1, overflowY: "auto" }}>

              {/* ━━━ OVERVIEW TAB ━━━ */}
              {activeTab === "overview" && (
                <div style={{ animation: "popupFadeIn 0.25s ease" }}>
                  {/* Capability chips */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
                    {["Creator Benchmarking", "Content Classification", "Audience Analysis", "Campaign Comparison", "Performance Scoring", "Multi-Platform Signals"].map((cap) => (
                      <span key={cap} style={{ padding: "4px 10px", fontSize: 9, fontWeight: 500, letterSpacing: "0.03em", fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6 }}>{cap}</span>
                    ))}
                  </div>

                  {/* Feature grid */}
                  <div className="ts-popup-feature-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px", marginBottom: 18 }}>
                    {[
                      { icon: "→", label: "Input", value: "Creator profiles, content signals, audience data across platforms" },
                      { icon: "←", label: "Output", value: "Decision-ready benchmarks, classifications, and ranked comparisons" },
                      { icon: "×", label: "Replaces", value: "Manual spreadsheet lookup, fragmented review, cross-referencing" },
                      { icon: "◎", label: "Built for", value: "Marketing ops teams running multi-creator campaign decisions" },
                    ].map((item) => (
                      <div key={item.label}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "rgba(255,130,90,0.4)", fontFamily: "var(--font-mono)" }}>{item.icon}</span>
                          <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-mono)" }}>{item.label}</span>
                        </div>
                        <span style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.42)", fontFamily: "var(--font-sans)" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Role framing */}
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 5 }}>Who uses this</span>
                    <span style={{ fontSize: 11, lineHeight: 1.55, color: "rgba(255,255,255,0.38)", fontFamily: "var(--font-sans)" }}>Campaign managers, marketing ops leads, and brand teams evaluating creators for sponsored content, ambassador programs, and multi-platform campaigns.</span>
                  </div>
                </div>
              )}

              {/* ━━━ WORKFLOW TAB ━━━ */}
              {activeTab === "workflow" && (
                <div style={{ animation: "popupFadeIn 0.25s ease" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {[
                      { step: "01", title: "Ingest", desc: "Pull creator profiles, content metadata, and audience signals from connected platforms.", color: "rgba(255,130,90,0.5)" },
                      { step: "02", title: "Analyze", desc: "Score performance, classify content types, and extract audience composition patterns.", color: "rgba(255,130,90,0.4)" },
                      { step: "03", title: "Compare", desc: "Benchmark creators against each other and against campaign-specific criteria.", color: "rgba(255,130,90,0.3)" },
                      { step: "04", title: "Act", desc: "Export ranked shortlists, generate comparison reports, and feed campaign decisions.", color: "rgba(255,130,90,0.25)" },
                    ].map((s, i) => (
                      <div key={s.step}>
                        <div style={{ display: "flex", gap: 14, padding: "12px 0" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 28 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)", color: s.color, letterSpacing: "0.05em" }}>{s.step}</span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-sans)", display: "block", marginBottom: 3 }}>{s.title}</span>
                            <span style={{ fontSize: 11, lineHeight: 1.5, color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-sans)" }}>{s.desc}</span>
                          </div>
                        </div>
                        {i < 3 && (
                          <div style={{ marginLeft: 13, width: 1, height: 10, background: "rgba(255,130,90,0.1)" }} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 8, background: "rgba(255,80,48,0.04)", border: "1px solid rgba(255,80,48,0.08)" }}>
                    <span style={{ fontSize: 10, color: "rgba(255,180,140,0.45)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>Ingest → Analyze → Compare → Act — in one operational surface.</span>
                  </div>
                </div>
              )}

              {/* ━━━ BEFORE / AFTER TAB ━━━ */}
              {activeTab === "compare" && (
                <div style={{ animation: "popupFadeIn 0.25s ease" }}>
                  <div className="ts-popup-compare-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ padding: "14px 14px", borderRadius: 12, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.18)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 12 }}>Without</span>
                      {["Manual spreadsheet tracking", "Fragmented platform checks", "Gut-feel creator selection", "No standardized scoring", "Hours per creator evaluation", "Inconsistent team decisions"].map((item) => (
                        <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 8 }}>
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", fontFamily: "var(--font-mono)", flexShrink: 0, marginTop: 1 }}>—</span>
                          <span style={{ fontSize: 10.5, lineHeight: 1.45, color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-sans)" }}>{item}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "14px 14px", borderRadius: 12, background: "rgba(255,80,48,0.03)", border: "1px solid rgba(255,80,48,0.08)" }}>
                      <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "rgba(255,150,120,0.4)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 12 }}>With Marketing</span>
                      {["Unified creator intelligence", "Cross-platform signal aggregation", "Data-driven creator ranking", "Standardized benchmarks", "Instant comparative analysis", "Coordinated team alignment"].map((item) => (
                        <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 8 }}>
                          <span style={{ fontSize: 9, color: "rgba(255,130,90,0.35)", fontFamily: "var(--font-mono)", flexShrink: 0, marginTop: 1 }}>✓</span>
                          <span style={{ fontSize: 10.5, lineHeight: 1.45, color: "rgba(255,255,255,0.42)", fontFamily: "var(--font-sans)" }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>Replace hours of manual creator research with structured, decision-ready intelligence your entire team can trust.</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Persistent CTA bar ── */}
            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.05) 20%, rgba(255,255,255,0.05) 80%, transparent)", margin: "20px 0 16px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.14)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>Benchmark · Classify · Compare · Act</span>
              <a
                href="#marketing"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 16px 7px 14px", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", fontFamily: "var(--font-sans)", color: "rgba(255,200,175,0.85)", background: "rgba(255,80,48,0.1)", border: "1px solid rgba(255,80,48,0.16)", borderRadius: 8, textDecoration: "none", cursor: "pointer", transition: "all 0.25s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,80,48,0.2)"; e.currentTarget.style.borderColor = "rgba(255,80,48,0.3)"; e.currentTarget.style.color = "rgba(255,230,215,0.95)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,80,48,0.1)"; e.currentTarget.style.borderColor = "rgba(255,80,48,0.16)"; e.currentTarget.style.color = "rgba(255,200,175,0.85)"; }}
              >
                Enter Marketing
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
            </div>

            {/* Top edge highlight */}
            <div style={{ position: "absolute", top: 0, left: "12%", right: "12%", height: 1, borderRadius: 1, background: "linear-gradient(90deg, transparent, rgba(255,140,100,0.1) 30%, rgba(255,140,100,0.15) 50%, rgba(255,140,100,0.1) 70%, transparent)" }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Cross marker (+) at grid intersections ─── */
function CrossMark({ style }: { style: React.CSSProperties }) {
  return (
    <div style={{ position: "absolute", ...style, zIndex: 5 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <line x1="6" y1="0" x2="6" y2="12" stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" />
        <line x1="0" y1="6" x2="12" y2="6" stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" />
      </svg>
    </div>
  );
}

/* ─── Four-point sparkle/star ─── */
function Sparkle({
  style,
  size = 10,
  opacity = 0.25,
}: {
  style: React.CSSProperties;
  size?: number;
  opacity?: number;
}) {
  return (
    <div style={{ position: "absolute", ...style, zIndex: 5 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"
          fill="white"
          fillOpacity={opacity}
        />
      </svg>
    </div>
  );
}

/* ─── MARKETING icon (center) — token-driven sizing ─── */
function MarketingIcon() {
  return (
    <div
      style={{
        position: "relative",
        width: "var(--ts-icon)",
        height: "var(--ts-icon)",
        borderRadius: "var(--ts-icon-radius)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #ff8060 0%, #ff5030 50%, #e84420 100%)",
        boxShadow:
          "0 12px 40px rgba(255,70,40,0.35), 0 4px 12px rgba(255,70,40,0.2), inset 0 1px 1px rgba(255,255,255,0.15)",
        transition: "box-shadow 0.35s ease, filter 0.35s ease",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 12px 48px rgba(255,70,40,0.5), 0 4px 14px rgba(255,70,40,0.3), inset 0 1px 2px rgba(255,255,255,0.2)";
        (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 12px 40px rgba(255,70,40,0.35), 0 4px 12px rgba(255,70,40,0.2), inset 0 1px 1px rgba(255,255,255,0.15)";
        (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)";
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marketing-icon.svg"
        alt="Marketing"
        style={{
          width: "62%",
          height: "62%",
          objectFit: "contain",
          opacity: 0.92,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "var(--ts-icon-radius)",
          background:
            "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.1) 0%, transparent 55%)",
        }}
      />
    </div>
  );
}

/* ─── COMING SOON icon — Apple Liquid Glass, token-driven ─── */
function ComingSoonIcon() {
  return (
    <div
      style={{
        position: "relative",
        width: "var(--ts-icon-cs)",
        height: "var(--ts-icon-cs)",
        borderRadius: "var(--ts-icon-cs-radius)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(175deg, rgba(200,205,210,0.95) 0%, rgba(170,175,180,0.88) 25%, rgba(150,155,162,0.82) 50%, rgba(135,140,148,0.85) 75%, rgba(125,130,138,0.9) 100%)",
        boxShadow: [
          "0 1px 0 0 rgba(255,255,255,0.25)",
          "0 16px 40px -8px rgba(0,0,0,0.55)",
          "0 4px 12px rgba(0,0,0,0.25)",
          "0 0 0 0.5px rgba(255,255,255,0.12)",
        ].join(", "),
      }}
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: "var(--ts-icon-cs-radius)", pointerEvents: "none", background: "linear-gradient(178deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.18) 15%, rgba(255,255,255,0.03) 40%, transparent 55%)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "var(--ts-icon-cs-radius)", pointerEvents: "none", background: "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 20%, transparent 40%, transparent 60%, rgba(255,255,255,0.02) 80%, rgba(255,255,255,0.06) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "var(--ts-icon-cs-radius)", pointerEvents: "none", background: "radial-gradient(ellipse 70% 50% at 50% 42%, rgba(255,255,255,0.12) 0%, transparent 70%)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "var(--ts-icon-cs-radius)", pointerEvents: "none", boxShadow: ["inset 0 1.5px 3px rgba(255,255,255,0.35)", "inset 0 -1px 4px rgba(0,0,0,0.12)", "inset 1px 0 3px rgba(255,255,255,0.06)", "inset -1px 0 3px rgba(255,255,255,0.06)"].join(", ") }} />
      <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, borderRadius: 1, pointerEvents: "none", background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 70%, transparent 100%)" }} />
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        style={{ position: "relative", zIndex: 2, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.08))", maxWidth: "60%", maxHeight: "60%" }}
      >
        <text x="24" y="36" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="38" fontWeight="800" fill="rgba(75,80,88,0.55)">?</text>
      </svg>
    </div>
  );
}
