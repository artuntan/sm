"use client";

import { useState, useCallback } from "react";
import type {
  PlatformAnalysis,
  DeliverableType,
  DeliverableQuote,
  QuoteSourceMode,
} from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import {
  DELIVERABLE_LABELS,
  moneyWithFx,
  forecastImpressions,
  computeDeliverableCpm,
  CURRENCY_SYMBOLS,
  FX_RATES_TO_USD,
  FX_SNAPSHOT_DATE,
  FX_BENCHMARK_CURRENCY,
  type ForecastSignals,
} from "@/lib/domain/budget-cpm";

// ---------------------------------------------------------------------------
// Local types + constants
// ---------------------------------------------------------------------------

type BudgetEntry = { amount: string; currency: string };
type QtyEntry = Record<string, number>;

const BENCHMARK_COLORS: Record<string, { color: string; bg: string }> = {
  efficient: { color: "var(--accent-green)", bg: "var(--accent-green-glow)" },
  market: { color: "var(--accent-blue)", bg: "rgba(56,189,248,0.08)" },
  premium: { color: "#d97706", bg: "rgba(217,119,6,0.08)" },
  outlier: { color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
  unknown: { color: "var(--status-muted)", bg: "rgba(128,128,128,0.08)" },
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  exact: { label: "EXACT", color: "var(--accent-green)" },
  imputed: { label: "IMPUTED", color: "#d97706" },
  missing: { label: "—", color: "var(--status-muted)" },
  estimated_model: { label: "EST", color: "#d97706" },
  unavailable: { label: "N/A", color: "var(--status-muted)" },
  projected: { label: "PROJ", color: "var(--accent-blue)" },
  projected_imputed: { label: "PROJ·IMP", color: "#d97706" },
};

// ---------------------------------------------------------------------------
// BudgetWorkbench
// ---------------------------------------------------------------------------

export function BudgetWorkbench({ ig, tk, hasIg, hasTk }: {
  ig: PlatformAnalysis | undefined; tk: PlatformAnalysis | undefined; hasIg: boolean; hasTk: boolean;
}) {
  const deliverables: DeliverableType[] = [];
  if (hasIg && ig && ig.status !== "error") {
    deliverables.push("ig_reels");
    if (ig.storyVisibility) deliverables.push("ig_story");
    if (ig.carouselVisibility && ig.carouselVisibility.sourceMode !== "unavailable") deliverables.push("ig_carousel");
    deliverables.push("ig_reels_collab");
  }
  if (hasTk && tk && tk.status !== "error") {
    deliverables.push("tt_post");
  }

  const [budgets, setBudgets] = useState<Record<string, BudgetEntry>>({});
  const [quantities, setQuantities] = useState<QtyEntry>({});
  const [currency, setCurrency] = useState("TRY");
  const [showInfo, setShowInfo] = useState(false);

  const updateBudget = useCallback((dt: DeliverableType, amount: string) => {
    setBudgets((prev) => ({ ...prev, [dt]: { amount, currency } }));
  }, [currency]);

  const updateQty = useCallback((dt: DeliverableType, val: string) => {
    const n = parseInt(val, 10);
    setQuantities((prev) => ({ ...prev, [dt]: isNaN(n) || n < 1 ? 1 : n }));
  }, []);

  if (deliverables.length === 0) return null;

  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const signals: ForecastSignals = {
    igOrganic: ig?.organic ?? null,
    igCommercial: ig?.commercial ?? null,
    storyVisibility: ig?.storyVisibility ?? null,
    carouselVisibility: ig?.carouselVisibility ?? null,
    tkOrganic: tk?.organic ?? null,
    tkCommercial: tk?.commercial ?? null,
    igFollowerCount: ig?.profile?.followerCount ?? null,
    tkFollowerCount: tk?.profile?.followerCount ?? null,
  };

  const rows = deliverables.map((dt) => {
    const forecast = forecastImpressions(dt, signals);
    const entry = budgets[dt];
    const amt = entry ? parseFloat(entry.amount) : 0;
    const qty = quantities[dt] ?? 1;
    const quote: DeliverableQuote = {
      deliverableType: dt, quantity: qty,
      sourceMode: amt > 0 ? "exact" as QuoteSourceMode : "missing" as QuoteSourceMode,
      unitPrice: amt > 0 ? moneyWithFx(amt, currency) : null,
      totalPrice: null, pricingComponents: [], notes: [],
    };
    const cpm = computeDeliverableCpm(quote, forecast);
    const totalImpressions = forecast.base !== null ? forecast.base * qty : null;
    const lineCost = amt > 0 ? amt * qty : null;
    return { dt, forecast, quote, cpm, qty, totalImpressions, lineCost };
  });

  return (
    <div className="rounded-md border" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-default)" }}>
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <svg className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)", opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span className="text-xs font-medium tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>BUDGET + CPM WORKBENCH</span>
        <button onClick={() => setShowInfo(!showInfo)} className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{
          backgroundColor: showInfo ? "var(--accent-blue)" : "var(--bg-secondary)", color: showInfo ? "#fff" : "var(--text-muted)", cursor: "pointer", border: "none",
        }} title="How CPM is calculated">?</button>
        <div className="ml-auto flex items-center gap-2">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="text-xs rounded px-2 py-1 border-0 outline-none" style={{
            backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", fontFamily: "var(--font-mono)",
          }}>
            <option value="TRY">TRY ₺</option>
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
          </select>
        </div>
      </div>
      {showInfo && (
        <div className="px-5 py-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-secondary)" }}>
          <p className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>How CPM is Calculated</p>
          <p className="mb-1"><strong>CPM</strong> = Cost Per 1,000 Projected Impressions</p>
          <p className="mb-2" style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>Line CPM = (Unit Price × Qty) ÷ (Per-Unit Forecast × Qty) × 1,000</p>
          <p className="mb-0"><strong>Provenance</strong> — <em>EXACT</em> = creator-provided quote. <em>EST</em> = model-estimated impressions. <em>PROJ</em> = projected CPM.</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: "var(--font-mono)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th className="text-left px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)" }}>DELIVERABLE</th>
              <th className="text-center px-2 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "50px" }}>QTY</th>
              <th className="text-right px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "100px" }}>UNIT {sym}</th>
              <th className="text-right px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "90px" }}>LINE {sym}</th>
              <th className="text-right px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "140px" }}>IMPRESSIONS</th>
              <th className="text-right px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "120px" }}>CPM</th>
              <th className="text-center px-3 py-2.5 font-medium tracking-wider" style={{ color: "var(--text-muted)", width: "70px" }}>BENCH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ dt, forecast, quote, cpm, qty, totalImpressions, lineCost }) => {
              const bm = BENCHMARK_COLORS[cpm.benchmarkStatus] ?? BENCHMARK_COLORS.unknown;
              const fSrc = SOURCE_BADGE[forecast.sourceMode] ?? SOURCE_BADGE.unavailable;
              return (
                <tr key={dt} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="px-3 py-2.5"><span style={{ color: "var(--text-primary)" }}>{DELIVERABLE_LABELS[dt]}</span></td>
                  <td className="px-2 py-2.5 text-center">
                    <input type="text" inputMode="numeric" value={qty} onChange={(e) => updateQty(dt, e.target.value)}
                      className="w-10 text-center rounded px-1 py-0.5 border-0 outline-none text-xs"
                      style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }} />
                  </td>
                  <td className="px-3 py-2.5">
                    <input type="text" inputMode="numeric" placeholder="0" value={budgets[dt]?.amount ?? ""}
                      onChange={(e) => updateBudget(dt, e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-full text-right rounded px-2 py-0.5 border-0 outline-none text-xs"
                      style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {lineCost !== null ? <span style={{ color: "var(--text-primary)" }}>{formatNumber(lineCost)}</span> : <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {forecast.base !== null ? (
                      <div>
                        <span style={{ color: "var(--text-primary)" }}>{formatNumber(totalImpressions)}</span>
                        <span className="ml-1 text-[9px] px-1 py-px rounded" style={{ color: fSrc.color, backgroundColor: `${fSrc.color}15` }}>{fSrc.label}</span>
                      </div>
                    ) : <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {cpm.mediaOnlyCpm.base !== null ? (
                      <span style={{ color: "var(--text-primary)" }}>
                        <span style={{ opacity: 0.5, fontSize: "9px" }}>{cpm.mediaOnlyCpm.low?.toFixed(1)}</span>
                        <span className="mx-0.5" style={{ opacity: 0.3 }}>–</span>
                        <span className="font-semibold">{cpm.mediaOnlyCpm.base.toFixed(1)}</span>
                        <span className="mx-0.5" style={{ opacity: 0.3 }}>–</span>
                        <span style={{ opacity: 0.5, fontSize: "9px" }}>{cpm.mediaOnlyCpm.high?.toFixed(1)}</span>
                      </span>
                    ) : <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {cpm.benchmarkStatus !== "unknown" ? (
                      <span className="text-[9px] font-medium tracking-wider px-1.5 py-px rounded" style={{ backgroundColor: bm.bg, color: bm.color }} title={cpm.benchmarkContext ?? undefined}>
                        {cpm.benchmarkStatus.toUpperCase()}
                      </span>
                    ) : <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2 flex items-center gap-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <span className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
          CPM = cost per 1,000 projected impressions · Benchmarks in {FX_BENCHMARK_CURRENCY}{currency !== FX_BENCHMARK_CURRENCY ? ` (FX: 1 ${FX_BENCHMARK_CURRENCY} = ${FX_RATES_TO_USD[currency]} ${currency}, ${FX_SNAPSHOT_DATE})` : ""}
        </span>
      </div>
    </div>
  );
}
