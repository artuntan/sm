"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/app/components/ui/Modal";

// ---------------------------------------------------------------------------
// Guide Steps
// ---------------------------------------------------------------------------

const GUIDE_STEPS = [
  {
    id: "input",
    num: "01",
    title: "Input",
    subtitle: "Paste creator handles",
    desc: "Paste rows from a spreadsheet or type comma-separated handles. Each row maps one creator across Instagram and TikTok.",
    svg: "input" as const,
  },
  {
    id: "validate",
    num: "02",
    title: "Validate",
    subtitle: "Parse & deduplicate",
    desc: "The system parses your input, strips formatting artifacts, deduplicates handles, and flags rows with structural errors before any API call.",
    svg: "validate" as const,
  },
  {
    id: "fetch",
    num: "03",
    title: "Fetch",
    subtitle: "Platform data retrieval",
    desc: "Parallel requests pull profile metadata, recent posts, and engagement data from Instagram and TikTok APIs with automatic fallback providers.",
    svg: "fetch" as const,
  },
  {
    id: "benchmark",
    num: "04",
    title: "Benchmark",
    subtitle: "Score & classify",
    desc: "Each post is classified as organic or commercial. View-based benchmarks and ad-to-organic ratios are computed per creator for reliable comparison.",
    svg: "benchmark" as const,
  },
  {
    id: "review",
    num: "05",
    title: "Review",
    subtitle: "Results matrix",
    desc: "A sortable, filterable matrix shows every creator with per-platform metrics, status indicators, and drill-down detail panels for deep review.",
    svg: "review" as const,
  },
];

// ---------------------------------------------------------------------------
// Guide SVG Components
// ---------------------------------------------------------------------------

function GuideSvgInput() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Data rows flowing into input port */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect
            x={8} y={8 + i * 18} width={60} height={10} rx={2}
            fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={0.5}
            style={{ animation: `guide-fade-in-up 0.3s ease-out ${i * 0.12}s both` }}
          />
          <rect
            x={12} y={11 + i * 18} width={20} height={4} rx={1}
            fill="var(--accent-green)" opacity={0.5}
            style={{ animation: `guide-fade-in-up 0.3s ease-out ${i * 0.12 + 0.08}s both` }}
          />
          <rect
            x={36} y={11 + i * 18} width={28} height={4} rx={1}
            fill="var(--accent-blue)" opacity={0.3}
            style={{ animation: `guide-fade-in-up 0.3s ease-out ${i * 0.12 + 0.12}s both` }}
          />
        </g>
      ))}
      {/* Arrow / flow line */}
      <line x1={78} y1={40} x2={110} y2={40} stroke="var(--accent-green)" strokeWidth={1} strokeDasharray="4 3"
        pathLength={1}
        style={{ animation: "guide-draw 0.8s ease-out 0.5s both", strokeDashoffset: 1 }}
      />
      <polygon points="108,36 116,40 108,44" fill="var(--accent-green)" opacity={0.7}
        style={{ animation: "guide-fade-in-up 0.2s ease-out 1s both" }}
      />
      {/* Input port */}
      <rect x={120} y={20} width={68} height={40} rx={4}
        fill="var(--bg-card)" stroke="var(--border-default)" strokeWidth={1}
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.6s both" }}
      />
      <text x={154} y={38} textAnchor="middle" fill="var(--text-muted)" fontSize={8} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.8s both" }}
      >INTAKE</text>
      <text x={154} y={50} textAnchor="middle" fill="var(--accent-green)" fontSize={7} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.9s both" }}
      >READY</text>
    </svg>
  );
}

function GuideSvgValidate() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Grid rows being scanned */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect
            x={16} y={10 + i * 16} width={80} height={10} rx={2}
            fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth={0.5}
            style={{ animation: `guide-fade-in-up 0.2s ease-out ${i * 0.1}s both` }}
          />
          {/* Checkmark or X */}
          {i < 3 ? (
            <path
              d={`M${104},${13 + i * 16} l3,3 l5,-5`}
              stroke="var(--accent-green)" strokeWidth={1.5} fill="none" strokeLinecap="round"
              style={{ animation: `guide-fade-in-up 0.2s ease-out ${0.4 + i * 0.15}s both` }}
            />
          ) : (
            <g style={{ animation: `guide-fade-in-up 0.2s ease-out ${0.4 + i * 0.15}s both` }}>
              <line x1={104} y1={12 + i * 16} x2={110} y2={18 + i * 16} stroke="var(--accent-pink)" strokeWidth={1.5} strokeLinecap="round" />
              <line x1={110} y1={12 + i * 16} x2={104} y2={18 + i * 16} stroke="var(--accent-pink)" strokeWidth={1.5} strokeLinecap="round" />
            </g>
          )}
        </g>
      ))}
      {/* Scan line */}
      <line x1={14} x2={114} y1={0} y2={0} stroke="var(--accent-green)" strokeWidth={1} opacity={0.4}
        style={{ animation: "guide-scan 2s ease-in-out infinite" }}
      />
      {/* Summary output */}
      <rect x={130} y={18} width={56} height={44} rx={3}
        fill="var(--bg-card)" stroke="var(--border-default)" strokeWidth={1}
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.6s both" }}
      />
      <text x={158} y={36} textAnchor="middle" fill="var(--accent-green)" fontSize={14} fontFamily="var(--font-mono)" fontWeight="bold"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.8s both" }}
      >3</text>
      <text x={158} y={50} textAnchor="middle" fill="var(--text-muted)" fontSize={7} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.9s both" }}
      >VALID</text>
    </svg>
  );
}

function GuideSvgFetch() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Central node */}
      <rect x={80} y={25} width={40} height={30} rx={4}
        fill="var(--bg-card)" stroke="var(--accent-green)" strokeWidth={1} opacity={0.8}
      />
      <text x={100} y={43} textAnchor="middle" fill="var(--accent-green)" fontSize={7} fontFamily="var(--font-mono)">QUEUE</text>
      {/* IG endpoint */}
      <rect x={8} y={8} width={50} height={22} rx={3}
        fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={0.5}
      />
      <text x={33} y={22} textAnchor="middle" fill="var(--accent-blue)" fontSize={7} fontFamily="var(--font-mono)">IG API</text>
      {/* TK endpoint */}
      <rect x={8} y={50} width={50} height={22} rx={3}
        fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={0.5}
      />
      <text x={33} y={64} textAnchor="middle" fill="var(--accent-pink)" fontSize={7} fontFamily="var(--font-mono)">TK API</text>
      {/* Connection lines */}
      <line x1={58} y1={19} x2={80} y2={35} stroke="var(--border-strong)" strokeWidth={0.5} strokeDasharray="3 2" />
      <line x1={58} y1={61} x2={80} y2={45} stroke="var(--border-strong)" strokeWidth={0.5} strokeDasharray="3 2" />
      {/* Data particles flowing */}
      {[0, 1, 2].map((i) => (
        <circle key={`ig-${i}`} r={2} fill="var(--accent-blue)" opacity={0.7}
          style={{
            animation: `guide-flow 1.8s ease-in-out ${i * 0.5}s infinite`,
            transformOrigin: "58px 19px",
          }}
        >
          <animateMotion dur="1.8s" repeatCount="indefinite" begin={`${i * 0.5}s`}
            path="M58,19 L80,35"
          />
        </circle>
      ))}
      {[0, 1].map((i) => (
        <circle key={`tk-${i}`} r={2} fill="var(--accent-pink)" opacity={0.7}
          style={{
            animation: `guide-flow 2s ease-in-out ${i * 0.7}s infinite`,
            transformOrigin: "58px 61px",
          }}
        >
          <animateMotion dur="2s" repeatCount="indefinite" begin={`${i * 0.7}s`}
            path="M58,61 L80,45"
          />
        </circle>
      ))}
      {/* Output arrow */}
      <line x1={120} y1={40} x2={148} y2={40} stroke="var(--accent-green)" strokeWidth={1} strokeDasharray="4 3" />
      <polygon points="146,36 154,40 146,44" fill="var(--accent-green)" opacity={0.6} />
      {/* Results box */}
      <rect x={158} y={25} width={34} height={30} rx={3}
        fill="var(--bg-card)" stroke="var(--border-default)" strokeWidth={1}
      />
      <text x={175} y={43} textAnchor="middle" fill="var(--text-muted)" fontSize={7} fontFamily="var(--font-mono)">DATA</text>
    </svg>
  );
}

function GuideSvgBenchmark() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Signal waveform */}
      <path
        d="M 10,50 Q 25,20 40,40 T 70,35 T 100,45 T 130,30 T 160,42"
        stroke="var(--text-muted)" strokeWidth={1} fill="none" opacity={0.3}
      />
      {/* Organic segment highlight */}
      <path
        d="M 10,50 Q 25,20 40,40 T 70,35"
        stroke="var(--accent-green)" strokeWidth={1.5} fill="none"
        strokeDasharray="100" strokeDashoffset="100"
        style={{ animation: "guide-sweep 1.5s ease-out 0.3s forwards" }}
      />
      {/* Commercial segment highlight */}
      <path
        d="M 100,45 T 130,30 T 160,42"
        stroke="var(--accent-pink)" strokeWidth={1.5} fill="none"
        strokeDasharray="100" strokeDashoffset="100"
        style={{ animation: "guide-sweep 1.5s ease-out 0.8s forwards" }}
      />
      {/* Divider */}
      <line x1={85} y1={15} x2={85} y2={60} stroke="var(--border-strong)" strokeWidth={0.5} strokeDasharray="3 2"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 0.6s both" }}
      />
      {/* Labels */}
      <text x={38} y={70} textAnchor="middle" fill="var(--accent-green)" fontSize={7} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 1.2s both" }}
      >ORGANIC</text>
      <text x={135} y={70} textAnchor="middle" fill="var(--accent-pink)" fontSize={7} fontFamily="var(--font-mono)"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 1.6s both" }}
      >COMMERCIAL</text>
      {/* Ratio badge */}
      <rect x={166} y={12} width={28} height={16} rx={3}
        fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={0.5}
        style={{ animation: "guide-fade-in-up 0.3s ease-out 1.8s both" }}
      />
      <text x={180} y={23} textAnchor="middle" fill="var(--accent-amber)" fontSize={8} fontFamily="var(--font-mono)" fontWeight="bold"
        style={{ animation: "guide-fade-in-up 0.3s ease-out 2s both" }}
      >0.6x</text>
    </svg>
  );
}

function GuideSvgReview() {
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" fill="none">
      {/* Matrix header */}
      <rect x={8} y={6} width={184} height={12} rx={2}
        fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth={0.5}
      />
      {["HANDLE", "IG", "TK", "ORG", "COM", "RATIO"].map((label, i) => (
        <text key={label} x={20 + i * 30} y={15} fill="var(--text-muted)" fontSize={5.5} fontFamily="var(--font-mono)" fontWeight="600">
          {label}
        </text>
      ))}
      {/* Matrix rows populating */}
      {[0, 1, 2, 3].map((row) => (
        <g key={row} style={{ animation: `guide-cell-fill 0.3s ease-out ${0.3 + row * 0.2}s both` }}>
          <rect
            x={8} y={22 + row * 14} width={184} height={11} rx={1}
            fill={row % 2 === 0 ? "var(--bg-card)" : "transparent"}
            stroke="var(--border-subtle)" strokeWidth={0.3}
          />
          {/* Handle cell */}
          <rect x={12} y={25 + row * 14} width={22} height={5} rx={1} fill="var(--text-muted)" opacity={0.3} />
          {/* Metric cells */}
          {[1, 2, 3, 4].map((col) => (
            <rect
              key={col} x={20 + col * 30} y={25 + row * 14} width={16} height={5} rx={1}
              fill={col <= 2 ? "var(--accent-blue)" : col === 3 ? "var(--accent-green)" : "var(--accent-pink)"}
              opacity={0.2 + Math.random() * 0.15}
            />
          ))}
          {/* Status dot */}
          <circle cx={178} cy={27.5 + row * 14} r={2.5}
            fill={row < 3 ? "var(--accent-green)" : "var(--accent-amber)"}
            opacity={0.7}
          />
        </g>
      ))}
    </svg>
  );
}

function GuideSvg({ step }: { step: typeof GUIDE_STEPS[number]["svg"] }) {
  switch (step) {
    case "input": return <GuideSvgInput />;
    case "validate": return <GuideSvgValidate />;
    case "fetch": return <GuideSvgFetch />;
    case "benchmark": return <GuideSvgBenchmark />;
    case "review": return <GuideSvgReview />;
  }
}

// ---------------------------------------------------------------------------
// System Guide Modal
// ---------------------------------------------------------------------------

export function SystemGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  // Reset step when opening
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Arrow key navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setStep((s) => Math.min(s + 1, GUIDE_STEPS.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setStep((s) => Math.max(s - 1, 0));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const current = GUIDE_STEPS[step];
  const isLast = step === GUIDE_STEPS.length - 1;

  return (
    <Modal open={open} onClose={onClose} title="SYSTEM GUIDE" width="520px">
      <div style={{ minHeight: 320 }}>
        {/* Step indicator bar */}
        <div className="flex items-center gap-2 mb-4">
          {GUIDE_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-[10px]"
              style={{
                fontFamily: "var(--font-mono)",
                backgroundColor: i === step ? "var(--accent-green-glow)" : "transparent",
                color: i === step ? "var(--accent-green)" : "var(--text-muted)",
                border: i === step ? "1px solid var(--border-accent)" : "1px solid transparent",
                fontWeight: i === step ? 600 : 400,
                letterSpacing: "0.04em",
              }}
            >
              {s.num}
            </button>
          ))}
        </div>

        {/* Step content */}
        <div key={current.id} className="guide-step-enter">
          {/* Title */}
          <div className="mb-1">
            <span
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {current.title}
            </span>
            <span
              className="ml-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {current.subtitle}
            </span>
          </div>

          {/* Description */}
          <p
            className="text-xs leading-relaxed mb-3"
            style={{ color: "var(--text-secondary)", maxWidth: 440 }}
          >
            {current.desc}
          </p>

          {/* Animated SVG */}
          <div
            className="guide-svg-wrap rounded-md"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-subtle)",
              padding: "20px 16px",
            }}
          >
            <GuideSvg step={current.svg} />
          </div>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between mt-5 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {/* Dot indicators */}
          <div className="flex items-center gap-2">
            {GUIDE_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`guide-dot${i === step ? " active" : ""}`}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-1.5 rounded-md text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: "transparent",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ← PREV
              </button>
            )}
            {isLast ? (
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  backgroundColor: "var(--accent-green)",
                  color: "var(--text-inverse)",
                  fontFamily: "var(--font-mono)",
                  boxShadow: "0 0 12px -2px rgba(16, 185, 129, 0.3)",
                }}
              >
                GOT IT
              </button>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="px-3 py-1.5 rounded-md text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: "var(--accent-green-glow)",
                  border: "1px solid var(--border-accent)",
                  color: "var(--accent-green)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                NEXT →
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
