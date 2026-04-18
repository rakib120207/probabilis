"use client";
import Link from "next/link";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import { buildLocalCurve } from "@/lib/betaPdf";
import { saveToHistory, StoredScenario } from "@/lib/storage";

// ── Types ──────────────────────────────────────────────────────────────────
type ExtractionResult = {
  suggested_probability: number;
  suggested_confidence: number;
  suggested_risk: number;            // NEW — auto-populates risk slider
  risk_factors: Array<{              // NEW — pre-populates copula panel
    name: string;
    probability: number;
    confidence: number;
    type: string;
    description: string;
  }>;
  uncertainty_type: string;          // NEW — "epistemic-dominant" | "aleatory-dominant"
  domain: string;                    // NEW — "academic" | "career" | etc.
  reasoning: string;
  extraction_mode: string;
};

type SimulationResult = {
  mean: number;
  variance: number;
  std_dev: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  trials: number;
  histogram_x: number[];
  histogram_y: number[];
  rhat?: number;
  converged?: boolean;
  variance_reduction_pct?: number;
  aleatory_fraction?: number;
  epistemic_fraction?: number;
  uncertainty_type?: string;
  eviu?: number;
  distribution_type?: string;
  risk_adjusted_mean?: number;
};
type SensitivityResult = {
  probability_sensitivity: number;
  confidence_sensitivity: number;
  probability_impact: number;
  confidence_impact: number;
  interpretation: string;
};
type SummarizeResult = {
  summary: string;
  key_insight: string;
  decision_framing: string;
};
type Assumption = {
  id: string;
  label: string;
  direction: "positive" | "negative";
  weight: number;
  description: string;
};
type AssumptionsResult = {
  assumptions: Assumption[];
  synthesis_note: string;
};
type RiskProfile = {
  level: string;
  label: string;
  color: string;
  score: number;
};
type InterpretationResult = {
  risk_profile: RiskProfile;
  headline: string;
  fragility_warning: string | null;
  epistemic_note: string | null;
  convergence_note: string | null;
  action_framing: string;
  confidence_class: string;
  spread_class: string;
};
type StressPoint = {
  shift_pp: number;
  mean: number;
  ci_low: number;
  ci_high: number;
  risk_category: string;
};
type StressResult = {
  stress_points: StressPoint[];
  fragility_frontier_pp: number | null;
  robust_range_pp: number;
  is_fragile: boolean;
};
type PortfolioScenario = {
  label: string;
  description: string;
  base_probability: number;
  confidence: number;
  mean: number;
  std_dev: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  eviu: number;
  uncertainty_type: string;
};
type PortfolioResult = {
  ranked_labels: string[];
  ranked_scores: number[];
  dominance_pairs: {
    scenario_a: string;
    scenario_b: string;
    dominates: boolean;
    overlap: number;
    mean_gap: number;
  }[];
  recommendation_basis: string;
  highest_upside: string;
  lowest_downside: string;
};
type ChartPoint = {
  x?: number;
  probability?: number;
  density?: number;
  densityA?: number;
  densityB?: number;
};

// ── New types for v2.0 ─────────────────────────────────────────────────────
export type RiskFactor = {
  name: string;
  probability: number;
  confidence: number;
};
export type CopulaResult = {
  mean: number;
  std_dev: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  tail_risk_5pct: number;
  tail_risk_95pct: number;
  joint_failure_probability: number;
  correlation_effect: number;
  histogram_x: number[];
  histogram_y: number[];
  trials: number;
  risk_factor_names: string[];
  copula_type: string;
};

// ── v3.0 Decision types ─────────────────────────────────────────────────────
type ThresholdPoint = {
  threshold: number;
  action: string;
  expected_utility: number;
  probability_above: number;
  eu_margin: number;
};

type DecisionResult = {
  recommended_action: string;
  decision_confidence: string;
  expected_utility_proceed: number;
  expected_utility_abandon: number;
  optimal_expected_utility: number;
  expected_regret: number;
  vpi: number;
  break_even_probability: number;
  probability_above_threshold: number;
  threshold_used: number;
  eu_margin: number;
  regret_interpretation: string;
  vpi_interpretation: string;
  action_interpretation: string;
  threshold_sensitivity: ThresholdPoint[];
};

// ── Utilities ──────────────────────────────────────────────────────────────
function interpolateDensity(xPct: number, histX: number[], histY: number[]): number {
  const xProb = xPct / 100;
  const margin = ((histX[histX.length - 1] - histX[0]) / histX.length) * 2;
  if (xProb < histX[0] - margin || xProb > histX[histX.length - 1] + margin) return 0;
  for (let i = 0; i < histX.length - 1; i++) {
    if (xProb >= histX[i] && xProb <= histX[i + 1]) {
      const t = (xProb - histX[i]) / (histX[i + 1] - histX[i]);
      return histY[i] * (1 - t) + histY[i + 1] * t;
    }
  }
  return 0;
}
function buildComparisonData(a: SimulationResult, b: SimulationResult | null) {
  return Array.from({ length: 101 }, (_, x) => ({
    x,
    densityA: interpolateDensity(x, a.histogram_x, a.histogram_y),
    densityB: b ? interpolateDensity(x, b.histogram_x, b.histogram_y) : undefined,
  }));
}
function recomputeFromAssumptions(list: Assumption[], w: Record<string, number>): number {
  let p = 0.5;
  list.forEach((a) => {
    const weight = w[a.id] ?? a.weight;
    p += a.direction === "positive" ? weight * 0.12 : -(weight * 0.12);
  });
  return Math.max(0.05, Math.min(0.95, Math.round(p * 100) / 100));
}
const RISK_COLORS: Record<string, string> = {
  critical: "#ff3b3b",
  high: "#ff7a00",
  moderate: "#d4c000",
  favorable: "#00c060",
  strong: "#00e87a",
};

// ── Sub-components ─────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="section-label" style={{ marginBottom: 10 }}>
      {children}
    </p>
  );
}
function HR() {
  return <div className="rule" style={{ margin: "20px 0" }} />;
}

// ── v2.0 Components ────────────────────────────────────────────────────────
function RiskSliderSection({
  risk,
  setRisk,
  baseProbability,
}: {
  risk: number;
  setRisk: (v: number) => void;
  baseProbability: number;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Identified Risk{" "}
          <span className="font-mono" style={{ fontSize: 10 }}>
            (p_adj = base × (1 − risk))
          </span>
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: risk > 0.3 ? "var(--risk-high)" : risk > 0.1 ? "var(--risk-moderate)" : "var(--text-white)",
          }}
        >
          {(risk * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={0.95}
        step={0.01}
        value={risk}
        onChange={(e) => setRisk(parseFloat(e.target.value))}
      />
      <p className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
        {risk > 0
          ? `p_adj = ${(baseProbability * (1 - risk) * 100).toFixed(1)}% (auto-extracted from scenario context)`
          : "No external risk detected in scenario description"}
      </p>
    </div>
  );
}

function DistributionBadge({ distributionType }: { distributionType?: string }) {
  if (!distributionType) return null;
  const labels: Record<string, string> = {
    beta: "β Beta",
    lognormal: "LogN Log-Normal",
    poisson: "λ Poisson",
    gamma: "Γ Gamma",
  };
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        border: "1px solid var(--border-hi)",
        background: "var(--surface-2)",
        marginBottom: 16,
      }}
    >
      <span className="font-mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
        DISTRIBUTION:
      </span>
      <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: "var(--text-white)", letterSpacing: "0.06em" }}>
        {labels[distributionType] ?? distributionType.toUpperCase()}
      </span>
    </div>
  );
}

function RiskAdjustmentDisplay({
  base,
  adjusted,
  risk,
}: {
  base: number;
  adjusted: number;
  risk: number;
}) {
  if (risk === 0) return null;
  return (
    <div
      style={{
        padding: "10px 14px",
        border: "1px solid var(--border)",
        background: "var(--surface-1)",
        marginBottom: 16,
      }}
    >
      <p className="font-mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 8 }}>
        RISK ADJUSTMENT
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span className="font-mono" style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {(base * 100).toFixed(0)}% base
        </span>
        <span style={{ color: "var(--text-muted)" }}>×</span>
        <span className="font-mono" style={{ fontSize: 13, color: "var(--risk-critical)" }}>
          (1 − {(risk * 100).toFixed(0)}% risk)
        </span>
        <span style={{ color: "var(--text-muted)" }}>=</span>
        <span className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: "var(--text-white)" }}>
          {(adjusted * 100).toFixed(1)}% adjusted
        </span>
      </div>
    </div>
  );
}

function CopulaPanel({
  apiUrl,
  baseProbability,
  initialFactors,
}: {
  apiUrl: string;
  baseProbability: number;
  initialFactors?: ExtractionResult["risk_factors"];
}) {
  const [open, setOpen] = useState(false);
  const [factors, setFactors] = useState<RiskFactor[]>(() => {
    if (initialFactors && initialFactors.length > 0) {
      return initialFactors.map(f => ({
        name: f.name,
        probability: f.probability,
        confidence: f.confidence ?? 0.60,
      }));
    }
    return [
      { name: "Risk Factor 1", probability: 0.25, confidence: 0.60 },
      { name: "Risk Factor 2", probability: 0.20, confidence: 0.70 },
    ];
  });
  const [correlation, setCorrelation] = useState(0.4);
  const [result, setResult] = useState<CopulaResult | null>(null);
  const [running, setRunning] = useState(false);

  async function runCopula() {
    setRunning(true);
    try {
      const n = factors.length;
      const corr = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1.0 : correlation))
      );
      const res = await fetch(`${apiUrl}/copula`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Correlated risk analysis",
          base_probability: baseProbability,
          risk_factors: factors,
          correlation_matrix: corr,
          trials: 10000,
        }),
      });
      if (res.ok) setResult(await res.json());
    } catch {}
    setRunning(false);
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: "0.08em",
          background: "transparent",
          border: "1px solid var(--border-mid)",
          color: "var(--text-muted)",
          padding: "8px 14px",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>⊕ CORRELATED RISK ANALYSIS — Gaussian Copula</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderTop: "none",
            padding: "14px",
            background: "var(--surface-1)",
          }}
        >
          <p
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 12,
              fontStyle: "italic",
              color: "var(--text-muted)",
              marginBottom: 14,
              lineHeight: 1.6,
            }}
          >
            Models correlated risks via Gaussian copula. Bad events cluster — market crashes make all risks more likely simultaneously. Without copulas, tail risk is underestimated.
          </p>
          {factors.map((f, i) => (
            <div key={i} style={{ marginBottom: 12, padding: "10px", background: "var(--surface-2)" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input
                  value={f.name}
                  onChange={(e) => {
                    const updated = [...factors];
                    updated[i] = { ...f, name: e.target.value };
                    setFactors(updated);
                  }}
                  style={{
                    flex: 1,
                    fontFamily: "monospace",
                    fontSize: 11,
                    background: "var(--surface-3)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    padding: "4px 8px",
                  }}
                />
                <button
                  onClick={() => setFactors(factors.filter((_, fi) => fi !== i))}
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                  p={(f.probability * 100).toFixed(0)}%{" "}
                </span>
                <input
                  type="range"
                  min={0.01}
                  max={0.95}
                  step={0.01}
                  value={f.probability}
                  onChange={(e) => {
                    const updated = [...factors];
                    updated[i] = { ...f, probability: parseFloat(e.target.value) };
                    setFactors(updated);
                  }}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          ))}
          {factors.length < 4 && (
            <button
              onClick={() =>
                setFactors([
                  ...factors,
                  { name: `Risk Factor ${factors.length + 1}`, probability: 0.2, confidence: 0.65 },
                ])
              }
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                background: "none",
                border: "1px solid var(--border-mid)",
                color: "var(--text-muted)",
                padding: "4px 12px",
                cursor: "pointer",
                marginBottom: 12,
              }}
            >
              + add risk factor
            </button>
          )}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--text-muted)" }}>
                Inter-risk correlation
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "var(--text-white)" }}>
                ρ = {correlation.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={-0.8}
              max={0.95}
              step={0.05}
              value={correlation}
              onChange={(e) => setCorrelation(parseFloat(e.target.value))}
            />
          </div>
          <button
            onClick={runCopula}
            disabled={running || factors.length < 2}
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              letterSpacing: "0.08em",
              background: "var(--text-white)",
              color: "#000",
              border: "none",
              padding: "8px 16px",
              width: "100%",
              cursor: "pointer",
              opacity: running || factors.length < 2 ? 0.35 : 1,
            }}
          >
            {running ? "RUNNING COPULA SIMULATION..." : "RUN CORRELATED SIMULATION"}
          </button>
          {result && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border)" }}>
                {[
                  { label: "Mean (correlated)", value: `${(result.mean * 100).toFixed(1)}%` },
                  { label: "5th percentile (worst)", value: `${(result.tail_risk_5pct * 100).toFixed(1)}%` },
                  { label: "Joint failure P", value: `${(result.joint_failure_probability * 100).toFixed(1)}%` },
                  { label: "Correlation effect", value: `${(result.correlation_effect * 100).toFixed(1)}pp` },
                ].map((s) => (
                  <div key={s.label} style={{ background: "var(--surface-2)", padding: "10px 12px", textAlign: "center" }}>
                    <p style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "var(--text-white)", margin: 0 }}>
                      {s.value}
                    </p>
                    <p
                      style={{
                        fontFamily: "Georgia, serif",
                        fontSize: 9,
                        fontStyle: "italic",
                        color: "var(--text-muted)",
                        marginTop: 4,
                      }}
                    >
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
              {result.correlation_effect > 0.01 && (
                <p style={{ fontFamily: "Georgia, serif", fontSize: 12, fontStyle: "italic", color: "var(--risk-high)", lineHeight: 1.6 }}>
                  ↳ Correlation inflates downside risk by {(result.correlation_effect * 100).toFixed(1)}pp vs independent assumption. Tail events cluster.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DecisionPanel({
  result,
  threshold,
  setThreshold,
  onRerun,
}: {
  result: DecisionResult;
  threshold: number;
  setThreshold: (v: number) => void;
  onRerun: () => void;
}) {
  const ACTION_COLORS: Record<string, string> = {
    proceed: "#00e87a",
    abandon: "#ff3b3b",
    gather_more_info: "#d4c000",
  };
  const ACTION_LABELS: Record<string, string> = {
    proceed: "PROCEED",
    abandon: "ABANDON",
    gather_more_info: "GATHER INFO FIRST",
  };

  const color = ACTION_COLORS[result.recommended_action] ?? "#909090";
  const label = ACTION_LABELS[result.recommended_action] ?? result.recommended_action.toUpperCase();

  return (
    <section style={{ marginBottom: 28 }}>
      <Label>Decision Analysis — Expected Utility &amp; Regret</Label>
      <div
        style={{
          border: `1px solid ${color}44`,
          background: "var(--surface-1)",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${color}22`,
            background: `${color}0d`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              className="font-mono"
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color,
              }}
            >
              {label}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                border: "1px solid var(--border-mid)",
                padding: "2px 8px",
              }}
            >
              {result.decision_confidence.toUpperCase()} CONFIDENCE
            </span>
          </div>
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            τ = {(result.threshold_used * 100).toFixed(0)}%
          </span>
        </div>

        <div style={{ padding: "14px" }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 14 }}>
            {result.action_interpretation}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, background: "var(--border)", marginBottom: 14 }}>
            {[
              { label: "EU(proceed)", value: result.expected_utility_proceed.toFixed(3), note: "vs 0 baseline" },
              { label: "P(above τ)", value: `${(result.probability_above_threshold * 100).toFixed(1)}%`, note: `at ${(result.threshold_used * 100).toFixed(0)}%` },
              { label: "Regret", value: result.expected_regret.toFixed(3), note: "expected loss" },
              { label: "VPI", value: result.vpi.toFixed(3), note: "info value" },
            ].map((m) => (
              <div key={m.label} style={{ background: "var(--surface-2)", padding: "10px 8px", textAlign: "center" }}>
                <p className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-white)", margin: 0 }}>
                  {m.value}
                </p>
                <p className="font-serif" style={{ fontSize: 9, fontStyle: "italic", color: "var(--text-muted)", marginTop: 4 }}>
                  {m.label}
                </p>
                <p className="font-mono" style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>
                  {m.note}
                </p>
              </div>
            ))}
          </div>

          <div style={{ borderLeft: "2px solid var(--border-hi)", paddingLeft: 12, marginBottom: 12 }}>
            <p className="font-mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 4 }}>
              REGRET ANALYSIS
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {result.regret_interpretation}
            </p>
          </div>

          <div
            style={{
              borderLeft: `2px solid ${result.vpi > 0.08 ? "#d4c000" : "var(--border-hi)"}`,
              paddingLeft: 12,
              marginBottom: 16,
            }}
          >
            <p
              className="font-mono"
              style={{
                fontSize: 9,
                color: result.vpi > 0.08 ? "#d4c000" : "var(--text-muted)",
                letterSpacing: "0.12em",
                marginBottom: 4,
              }}
            >
              VALUE OF PERFECT INFORMATION
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {result.vpi_interpretation}
            </p>
          </div>

          <p className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
            Break-even probability:{" "}
            <span style={{ color: "var(--text-white)", fontWeight: 700 }}>
              {(result.break_even_probability * 100).toFixed(1)}%
            </span>
            &nbsp;— EU(proceed) = EU(abandon) at this threshold
          </p>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                Decision threshold τ
              </span>
              <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-white)" }}>
                {(threshold * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min={0.10}
              max={0.90}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              style={{ marginBottom: 10 }}
            />
            <button
              className="btn-outline"
              style={{ width: "100%", marginBottom: 14 }}
              onClick={onRerun}
            >
              ↺ recompute at τ = {(threshold * 100).toFixed(0)}%
            </button>

            <p className="font-mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", marginBottom: 8 }}>
              THRESHOLD SENSITIVITY — decision at different proceed thresholds
            </p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${result.threshold_sensitivity.length}, 1fr)`, gap: 1, background: "var(--border)" }}>
              {result.threshold_sensitivity.map((pt) => {
                const isActive = Math.abs(pt.threshold - result.threshold_used) < 0.01;
                const ptColor = pt.action === "proceed" ? "#00c060" : "#ff3b3b";
                return (
                  <div
                    key={pt.threshold}
                    style={{
                      background: isActive ? `${ptColor}18` : "var(--surface-2)",
                      padding: "8px 4px",
                      textAlign: "center",
                      borderBottom: isActive ? `2px solid ${ptColor}` : "2px solid transparent",
                    }}
                  >
                    <p className="font-mono" style={{ fontSize: 9, color: "var(--text-muted)", margin: 0 }}>
                      {(pt.threshold * 100).toFixed(0)}%
                    </p>
                    <p className="font-mono" style={{ fontSize: 9, fontWeight: 700, color: ptColor, margin: "2px 0 0" }}>
                      {pt.action === "proceed" ? "GO" : "NO"}
                    </p>
                    <p className="font-mono" style={{ fontSize: 8, color: "var(--text-dim)", margin: "1px 0 0" }}>
                      {(pt.probability_above * 100).toFixed(0)}%
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Home() {
  const SESSION_KEY = "probabilis_session_v1";
  const HISTORY_KEY = "probabilis_history_v1";
  const API_URL = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_API_URL;
    if (!url) return "https://web-production-810f7.up.railway.app";
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }, []);

  // ── State ────────────────────────────────────────────────────────────────
  const [description, setDescription] = useState("");
  const [baseProbability, setBaseProbability] = useState(0.5);
  const [confidence, setConfidence] = useState(0.5);
  const [reasoning, setReasoning] = useState("");
  const [extractionMode, setExtractionMode] = useState("");
  const [reasoningFresh, setReasoningFresh] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityResult | null>(null);
  const [decisionSummary, setDecisionSummary] = useState<SummarizeResult | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [stressResult, setStressResult] = useState<StressResult | null>(null);
  const [assumptions, setAssumptions] = useState<AssumptionsResult | null>(null);
  const [editedWeights, setEditedWeights] = useState<Record<string, number>>({});
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioScenario[]>([]);
  const [portfolioResult, setPortfolioResult] = useState<PortfolioResult | null>(null);
  const [pinnedResult, setPinnedResult] = useState<SimulationResult | null>(null);
  const [pinnedDescription, setPinnedDescription] = useState("");
  const [history, setHistory] = useState<StoredScenario[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");
  const [analyzeStatus, setAnalyzeStatus] = useState("");
  const [risk, setRisk] = useState<number>(0.0);
  const abortRef = useRef<AbortController | null>(null);

  // v3.0 new state
  const [decisionResult, setDecisionResult] = useState<DecisionResult | null>(null);
  const [decisionThreshold, setDecisionThreshold] = useState(0.5);
  const [extractedRiskFactors, setExtractedRiskFactors] = useState<ExtractionResult["risk_factors"]>([]);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "{}");
      if (s.description) setDescription(s.description);
      if (s.baseProbability) setBaseProbability(s.baseProbability);
      if (s.confidence) setConfidence(s.confidence);
      if (s.extractionMode) setExtractionMode(s.extractionMode);
    } catch {}
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      setHistory(raw ? JSON.parse(raw) : []);
    } catch {}
    fetch(`${API_URL}/health`).catch(() => {});
    return () => {
      abortRef.current?.abort();
    };
  }, [API_URL]);

  // ── Session persistence ───────────────────────────────────────────────────
  useEffect(() => {
    if (!description && !result) return;
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          description,
          baseProbability,
          confidence,
          reasoning,
          extractionMode,
        })
      );
    } catch {}
  }, [description, baseProbability, confidence, reasoning, extractionMode, result, SESSION_KEY]);

  // ── Analyze ───────────────────────────────────────────────────────────────
  async function analyzeScenario() {
    if (!description.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setExtracting(true);
    setAnalyzeStatus("connecting to AI...");
    setReasoning("");
    setReasoningFresh(false);
    setResult(null);
    setSensitivity(null);
    setDecisionSummary(null);
    setInterpretation(null);
    setStressResult(null);
    setAssumptions(null);
    setError("");
    setDecisionResult(null);
    const timer = setTimeout(() => setAnalyzeStatus("analyzing uncertainty signals..."), 1500);
    try {
      const res = await fetch(`${API_URL}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: ExtractionResult = await res.json();
      setBaseProbability(data.suggested_probability);
      setConfidence(data.suggested_confidence);
      setReasoning(data.reasoning);
      setReasoningFresh(true);
      setExtractionMode(data.extraction_mode);
      // v3.0 additions
      setRisk(data.suggested_risk ?? 0);
      setExtractedRiskFactors(data.risk_factors ?? []);
      try {
        const ar = await fetch(`${API_URL}/assumptions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description }),
          signal: ctrl.signal,
        });
        if (ar.ok) {
          const ad: AssumptionsResult = await ar.json();
          setAssumptions(ad);
          const w: Record<string, number> = {};
          ad.assumptions.forEach((a) => {
            w[a.id] = a.weight;
          });
          setEditedWeights(w);
        }
      } catch {}
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Analysis failed. Is your backend running?");
    } finally {
      clearTimeout(timer);
      setAnalyzeStatus("");
      setExtracting(false);
    }
  }

  // ── Simulate ──────────────────────────────────────────────────────────────
  async function runSimulation() {
    abortRef.current?.abort();
    setSimulating(true);
    setError("");
    setDecisionResult(null);
    try {
      const res = await fetch(`${API_URL}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          base_probability: baseProbability,
          confidence,
          risk: risk,
          trials: 10000,
          beta_scale: 50,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: SimulationResult = await res.json();
      setResult(data);
      const entry: StoredScenario = {
        id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
        description: description.slice(0, 120) + (description.length > 120 ? "..." : ""),
        baseProbability,
        confidence,
        result: {
          mean: data.mean,
          std_dev: data.std_dev,
          confidence_interval_low: data.confidence_interval_low,
          confidence_interval_high: data.confidence_interval_high,
          trials: data.trials,
          rhat: data.rhat ?? 1,
          eviu: data.eviu ?? 0,
          uncertainty_type: data.uncertainty_type ?? "aleatory-dominant",
          variance_reduction_pct: data.variance_reduction_pct ?? 0,
          aleatory_fraction: data.aleatory_fraction,
          epistemic_fraction: data.epistemic_fraction,
          distribution_type: data.distribution_type,
        },
        extractionMode,
        timestamp: new Date().toLocaleTimeString(),
        isoDate: new Date().toISOString(),
      };
      const updated = [entry, ...history].slice(0, 20);
      saveToHistory(entry);
      setHistory(updated);
      // Enrichment — sequential
      try {
        const sr = await fetch(`${API_URL}/sensitivity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_probability: baseProbability, confidence, trials: 3000 }),
        });
        if (sr.ok) setSensitivity(await sr.json());
      } catch {}
      try {
        const str = await fetch(`${API_URL}/stress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_probability: baseProbability, confidence }),
        });
        if (str.ok) setStressResult(await str.json());
      } catch {}
      try {
        const ir = await fetch(`${API_URL}/interpret`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            mean: data.mean,
            std_dev: data.std_dev,
            confidence_interval_low: data.confidence_interval_low,
            confidence_interval_high: data.confidence_interval_high,
            rhat: data.rhat ?? 1,
            eviu: data.eviu ?? 0,
            uncertainty_type: data.uncertainty_type ?? "aleatory-dominant",
            aleatory_fraction: data.aleatory_fraction ?? 0.6,
            epistemic_fraction: data.epistemic_fraction ?? 0.4,
          }),
        });
        if (ir.ok) setInterpretation(await ir.json());
      } catch {}
      try {
        const sumr = await fetch(`${API_URL}/summarize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            mean: data.mean,
            std_dev: data.std_dev,
            confidence_interval_low: data.confidence_interval_low,
            confidence_interval_high: data.confidence_interval_high,
            trials: data.trials,
          }),
        });
        if (sumr.ok) setDecisionSummary(await sumr.json());
      } catch {}
      // v3.0: Decision analysis
      try {
        const dr = await fetch(`${API_URL}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base_probability: baseProbability,
            confidence,
            mean: data.mean,
            std_dev: data.std_dev,
            confidence_interval_low: data.confidence_interval_low,
            confidence_interval_high: data.confidence_interval_high,
            threshold: decisionThreshold,
            trials: 10000,
          }),
        });
        if (dr.ok) setDecisionResult(await dr.json());
      } catch {}
    } catch {
      setError("Simulation failed. Check your backend connection.");
    } finally {
      setSimulating(false);
    }
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  function exportJSON(hist: StoredScenario[]) {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            tool: "Probabilis",
            version: "3.0",
            exported_at: new Date().toISOString(),
            methodology: {
              distribution: "Beta",
              sampling: "Antithetic variates Monte Carlo (Hammersley & Handscomb, 1964)",
              convergence: "Gelman-Rubin R-hat (Gelman & Rubin, 1992)",
              uncertainty_decomposition: "Der Kiureghian & Ditlevsen (2009)",
            },
            scenarios: hist.map((e) => ({
              ...e.result,
              description: e.description,
              extraction_mode: e.extractionMode,
            })),
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `probabilis-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  }

  async function exportLatex_FIXED(hist: StoredScenario[]) {
    if (!hist.length) return;
    try {
      const res = await fetch(`${API_URL}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Probabilis Decision Simulation Report",
          author: "Rakibul Islam",
          scenarios: hist.slice(0, 10).map((e) => ({
            description: e.description,
            base_probability: e.baseProbability,
            confidence: e.confidence,
            mean: e.result.mean,
            std_dev: e.result.std_dev,
            confidence_interval_low: e.result.confidence_interval_low,
            confidence_interval_high: e.result.confidence_interval_high,
            rhat: e.result.rhat ?? 1.0,
            eviu: e.result.eviu ?? 0,
            variance_reduction_pct: e.result.variance_reduction_pct ?? 0,
            uncertainty_type: e.result.uncertainty_type ?? "aleatory-dominant",
            aleatory_fraction: e.result.aleatory_fraction ?? 0.6,
            epistemic_fraction: e.result.epistemic_fraction ?? 0.4,
            extraction_mode: e.extractionMode,
            timestamp: e.timestamp,
            // v3.0 extended fields
            risk: e.result.risk ?? null,
            adjusted_probability: e.result.adjusted_probability ?? null,
            distribution_type: e.result.distribution_type ?? null,
            domain: e.result.domain ?? null,
            decision_action: e.result.decision_action ?? null,
            decision_eu_proceed: e.result.decision_eu_proceed ?? null,
            decision_eu_abandon: e.result.decision_eu_abandon ?? null,
            decision_regret: e.result.decision_regret ?? null,
            decision_vpi: e.result.decision_vpi ?? null,
            decision_break_even: e.result.decision_break_even ?? null,
            sensitivity_dominant: e.result.sensitivity_dominant ?? null,
            sensitivity_prob_impact: e.result.sensitivity_prob_impact ?? null,
            sensitivity_conf_impact: e.result.sensitivity_conf_impact ?? null,
            sensitivity_prob_rho: e.result.sensitivity_prob_rho ?? null,
            sensitivity_conf_rho: e.result.sensitivity_conf_rho ?? null,
            sensitivity_prob_variance_pct: e.result.sensitivity_prob_variance_pct ?? null,
            sensitivity_conf_variance_pct: e.result.sensitivity_conf_variance_pct ?? null,
            sensitivity_robustness: e.result.sensitivity_robustness ?? null,
            stress_fragile: e.result.stress_fragile ?? null,
            stress_frontier_pp: e.result.stress_frontier_pp ?? null,
            stress_robust_range_pp: e.result.stress_robust_range_pp ?? null,
            risk_level: e.result.risk_level ?? null,
            risk_label: e.result.risk_label ?? null,
            risk_headline: e.result.risk_headline ?? null,
            risk_action: e.result.risk_action ?? null,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([data.latex_source], { type: "text/plain" }));
        a.download = `probabilis-report-${new Date().toISOString().split("T")[0]}.tex`;
        a.click();
      }
    } catch {}
  }

  // ── Chart data ────────────────────────────────────────────────────────────
  const liveChartData = buildLocalCurve(baseProbability, confidence);
  const exportLatex = exportLatex_FIXED;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main style={{ background: "var(--bg)", minHeight: "100vh", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        {/* Header */}
        <header style={{ marginBottom: 48 }}>
          <h1
            className="font-serif"
            style={{
              fontSize: 32,
              fontWeight: 400,
              fontStyle: "italic",
              letterSpacing: "0.02em",
              color: "var(--text-white)",
              margin: 0,
            }}
          >
            Probabilis
          </h1>
          <p
            className="font-serif"
            style={{
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            Decision Simulation Under Uncertainty
          </p>
        </header>

        {/* Scenario input */}
        <section style={{ marginBottom: 24 }}>
          <Label>Scenario Description</Label>
          <textarea
            rows={4}
            style={{ width: "100%", padding: "12px 14px" }}
            placeholder="Describe your decision scenario in natural language. The system will extract uncertainty parameters automatically."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </section>

        {/* Analyze button */}
        <div style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 16 }}>
          <button
            className="btn-outline"
            onClick={analyzeScenario}
            disabled={extracting || !description.trim()}
            style={{ minWidth: 160 }}
          >
            {extracting ? `▷ ${analyzeStatus || "analyzing..."}` : "▷ Analyze with AI"}
          </button>
          {analyzeStatus && !extracting && (
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {analyzeStatus}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            className="font-mono"
            style={{
              marginBottom: 24,
              padding: "10px 14px",
              border: "1px solid var(--risk-error)",
              color: "var(--risk-error)",
              fontSize: 12,
            }}
          >
            ERROR: {error}
          </div>
        )}

        {/* AI Interpretation */}
        {reasoning && reasoningFresh && (
          <section style={{ marginBottom: 32 }}>
            <Label>
              Extraction Output
              <span
                className="font-mono"
                style={{
                  marginLeft: 10,
                  fontSize: 9,
                  color: extractionMode.startsWith("ai") ? "var(--risk-favorable)" : "var(--risk-moderate)",
                  letterSpacing: "0.1em",
                }}
              >
                [{extractionMode.startsWith("ai") ? "LLAMA 3.3 70B" : "LINGUISTIC FALLBACK"}]
              </span>
              {extractedRiskFactors.length > 0 && (
                <span className="font-mono" style={{ marginLeft: 8, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                  [DOMAIN: {extractedRiskFactors[0]?.type ?? "general"}]
                </span>
              )}
            </Label>
            <div
              style={{
                padding: "12px 14px",
                borderLeft: "2px solid var(--border-hi)",
                background: "var(--surface-1)",
              }}
            >
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.65 }}>
                {reasoning}
              </p>
            </div>
          </section>
        )}

        {/* Assumption Audit */}
        {assumptions && (
          <section style={{ marginBottom: 32 }}>
            <button
              onClick={() => setShowAssumptions(!showAssumptions)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                marginBottom: showAssumptions ? 12 : 0,
              }}
            >
              <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {showAssumptions ? "▾" : "▸"}
              </span>
              <span className="section-label" style={{ marginBottom: 0 }}>
                Assumption Audit — {assumptions.assumptions.length} factors
              </span>
            </button>
            {showAssumptions && (
              <div className="card" style={{ marginTop: 4 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
                  {assumptions.synthesis_note}
                </p>
                {assumptions.assumptions.map((a, idx) => (
                  <div key={a.id} style={{ marginBottom: idx < assumptions.assumptions.length - 1 ? 20 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: a.direction === "positive" ? "var(--risk-favorable)" : "var(--risk-critical)",
                          }}
                        >
                          {a.direction === "positive" ? "+" : "−"}
                        </span>
                        <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{a.label}</span>
                      </div>
                      <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {((editedWeights[a.id] ?? a.weight) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginBottom: 6,
                        paddingLeft: 20,
                        lineHeight: 1.5,
                      }}
                    >
                      {a.description}
                    </p>
                    <div style={{ paddingLeft: 20 }}>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={editedWeights[a.id] ?? a.weight}
                        onChange={(e) => {
                          const w = { ...editedWeights, [a.id]: parseFloat(e.target.value) };
                          setEditedWeights(w);
                          setBaseProbability(recomputeFromAssumptions(assumptions.assumptions, w));
                        }}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                ))}
                <button
                  className="btn-ghost"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    const w: Record<string, number> = {};
                    assumptions.assumptions.forEach((a) => {
                      w[a.id] = a.weight;
                    });
                    setEditedWeights(w);
                    setBaseProbability(recomputeFromAssumptions(assumptions.assumptions, w));
                  }}
                >
                  ↺ reset to ai estimate
                </button>
              </div>
            )}
          </section>
        )}

        {/* Parameter Controls */}
        <section style={{ marginBottom: 32 }}>
          <Label>Simulation Parameters</Label>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Base probability */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Base Probability <span className="font-mono" style={{ fontSize: 10 }}>(p₀)</span>
                </span>
                <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-white)" }}>
                  {(baseProbability * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.01}
                max={0.99}
                step={0.01}
                value={baseProbability}
                onChange={(e) => setBaseProbability(parseFloat(e.target.value))}
              />
            </div>
            {/* Confidence */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Confidence Level <span className="font-mono" style={{ fontSize: 10 }}>(c)</span>
                </span>
                <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-white)" }}>
                  {(confidence * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
              />
              <p className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                α = {(baseProbability * confidence * 20).toFixed(2)},&nbsp; β ={" "}
                {((1 - baseProbability) * confidence * 20).toFixed(2)}&nbsp; (Beta distribution parameters)
              </p>
            </div>
            {/* Risk slider */}
            <RiskSliderSection risk={risk} setRisk={setRisk} baseProbability={baseProbability} />
          </div>
        </section>

        {/* Run simulation button */}
        <div style={{ marginBottom: 40 }}>
          <button className="btn-primary" onClick={runSimulation} disabled={simulating}>
            {simulating ? "RUNNING 10,000 MONTE CARLO TRIALS..." : "RUN SIMULATION"}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div>
            <HR />

            {/* Primary statistics */}
            <section style={{ marginBottom: 28 }}>
              <Label>Primary Statistics — {result.trials.toLocaleString()} trials</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--border)" }}>
                {[
                  { label: "E[P] mean", value: `${(result.mean * 100).toFixed(2)}%` },
                  { label: "σ std dev", value: `±${(result.std_dev * 100).toFixed(2)}%` },
                  {
                    label: "95% CI",
                    value: `[${(result.confidence_interval_low * 100).toFixed(1)}, ${(result.confidence_interval_high * 100).toFixed(1)}]`,
                    small: true,
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    style={{
                      background: "var(--surface-1)",
                      padding: "16px 14px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      className="font-mono"
                      style={{
                        fontSize: card.small ? 14 : 24,
                        fontWeight: 700,
                        color: "var(--text-white)",
                        margin: 0,
                        lineHeight: 1.2,
                      }}
                    >
                      {card.value}
                    </p>
                    <p
                      className="font-serif"
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 5,
                        fontStyle: "italic",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {card.label}
                    </p>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <DistributionBadge distributionType={result.distribution_type} />
              </div>
              <RiskAdjustmentDisplay
                base={baseProbability}
                adjusted={result.risk_adjusted_mean ?? result.mean}
                risk={risk}
              />
            </section>

            {/* Risk Interpretation */}
            {interpretation && (
              <section style={{ marginBottom: 28 }}>
                <Label>Risk Classification</Label>
                <div
                  style={{
                    border: `1px solid ${interpretation.risk_profile.color}44`,
                    background: "var(--surface-1)",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 14px",
                      borderBottom: `1px solid ${interpretation.risk_profile.color}22`,
                      background: `${interpretation.risk_profile.color}0d`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            style={{
                              width: 18,
                              height: 3,
                              background:
                                i <= interpretation.risk_profile.score ? interpretation.risk_profile.color : "var(--surface-3)",
                            }}
                          />
                        ))}
                      </div>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          color: interpretation.risk_profile.color,
                          textTransform: "uppercase",
                        }}
                      >
                        {interpretation.risk_profile.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      {[interpretation.confidence_class, interpretation.spread_class].map((tag) => (
                        <span
                          key={tag}
                          className="font-mono"
                          style={{
                            fontSize: 9,
                            color: "var(--text-muted)",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "14px" }}>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                      {interpretation.headline}
                    </p>
                    {(interpretation.fragility_warning || interpretation.epistemic_note || interpretation.convergence_note) && (
                      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                        {interpretation.fragility_warning && (
                          <div style={{ borderLeft: "2px solid var(--risk-high)", paddingLeft: 12 }}>
                            <p
                              className="font-mono"
                              style={{ fontSize: 9, color: "var(--risk-high)", letterSpacing: "0.12em", marginBottom: 4 }}
                            >
                              FRAGILITY WARNING
                            </p>
                            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                              {interpretation.fragility_warning}
                            </p>
                          </div>
                        )}
                        {interpretation.epistemic_note && (
                          <div style={{ borderLeft: "2px solid var(--risk-moderate)", paddingLeft: 12 }}>
                            <p
                              className="font-mono"
                              style={{ fontSize: 9, color: "var(--risk-moderate)", letterSpacing: "0.12em", marginBottom: 4 }}
                            >
                              EPISTEMIC OPPORTUNITY
                            </p>
                            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                              {interpretation.epistemic_note}
                            </p>
                          </div>
                        )}
                        {interpretation.convergence_note && (
                          <div style={{ borderLeft: "2px solid var(--risk-critical)", paddingLeft: 12 }}>
                            <p
                              className="font-mono"
                              style={{ fontSize: 9, color: "var(--risk-critical)", letterSpacing: "0.12em", marginBottom: 4 }}
                            >
                              CONVERGENCE FLAG
                            </p>
                            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                              {interpretation.convergence_note}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      <p
                        className="font-mono"
                        style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 6 }}
                      >
                        RECOMMENDED ACTION
                      </p>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                        {interpretation.action_framing}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Diagnostics table */}
            <section style={{ marginBottom: 28 }}>
              <Label>Diagnostic Statistics</Label>
              <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
                {[
                  {
                    key: "R̂ (Gelman-Rubin)",
                    val: result.rhat?.toFixed(4) ?? "—",
                    note: result.converged != null ? (result.converged ? "converged" : "⚠ review") : "—",
                    ok: result.converged ?? true,
                    tip: "Split-chain R-hat. Values below 1.01 indicate full convergence across 4 parallel chains.",
                  },
                  {
                    key: "Var. reduction",
                    val: result.variance_reduction_pct != null ? `${result.variance_reduction_pct.toFixed(1)}%` : "—",
                    note: "antithetic variates",
                    ok: true,
                    tip: "Estimator variance reduction vs. naive Monte Carlo. Antithetic variates method (Hammersley & Handscomb, 1964).",
                  },
                  {
                    key: "EVIU",
                    val: result.eviu?.toFixed(5) ?? "—",
                    note: result.eviu != null ? (result.eviu > 0.02 ? "distribution adds value" : "point estimate sufficient") : "—",
                    ok: true,
                    tip: "Expected Value of Including Uncertainty. Quantifies decision quality gain from using the full distribution over the point estimate.",
                  },
                  {
                    key: "Uncertainty type",
                    val: result.uncertainty_type === "epistemic-dominant" ? "EPISTEMIC" : result.uncertainty_type === "aleatory-dominant" ? "ALEATORY" : "—",
                    note: result.epistemic_fraction != null ? `${(result.epistemic_fraction * 100).toFixed(0)}% reducible` : "—",
                    ok: result.uncertainty_type !== "epistemic-dominant",
                    tip: "Epistemic uncertainty is reducible via information gathering. Aleatory uncertainty is irreducible inherent randomness.",
                  },
                ].map((row, i, arr) => (
                  <div
                    key={row.key}
                    className="tooltip-group"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 140px 1fr",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                      gap: 12,
                    }}
                  >
                    <span className="font-serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)" }}>
                      {row.key}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        textAlign: "center",
                        color: row.ok ? "var(--text-white)" : "var(--risk-critical)",
                      }}
                    >
                      {row.val}
                    </span>
                    <span
                      className="font-mono"
                      style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", letterSpacing: "0.06em" }}
                    >
                      {row.note}
                    </span>
                    <div className="tooltip-content" style={{ width: 260, whiteSpace: "normal", textAlign: "left" }}>
                      {row.tip}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Uncertainty decomposition */}
            {result.aleatory_fraction != null && result.epistemic_fraction != null && (
              <section style={{ marginBottom: 28 }}>
                <Label>Uncertainty Decomposition — Der Kiureghian &amp; Ditlevsen (2009)</Label>
                <div className="card">
                  <div
                    style={{
                      display: "flex",
                      height: 2,
                      background: "var(--border-hi)",
                      marginBottom: 10,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${result.aleatory_fraction * 100}%`,
                        background: "var(--text-muted)",
                        transition: "width 600ms",
                      }}
                    />
                    <div
                      style={{
                        flex: 1,
                        background: "var(--text-white)",
                        opacity: 0.6,
                        transition: "width 600ms",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      ALEATORY {(result.aleatory_fraction * 100).toFixed(0)}% — irreducible
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: 10,
                        color: result.uncertainty_type === "epistemic-dominant" ? "var(--text-white)" : "var(--text-muted)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      EPISTEMIC {(result.epistemic_fraction * 100).toFixed(0)}% — reducible
                    </span>
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 10px",
                      border: `1px solid ${result.uncertainty_type === "epistemic-dominant" ? "var(--text-secondary)" : "var(--border-hi)"}`,
                      background: "var(--surface-2)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: 9,
                        letterSpacing: "0.12em",
                        color: result.uncertainty_type === "epistemic-dominant" ? "var(--text-white)" : "var(--text-muted)",
                      }}
                    >
                      {result.uncertainty_type === "epistemic-dominant" ? "EPISTEMIC-DOMINANT" : "ALEATORY-DOMINANT"}
                    </span>
                  </div>
                  {result.uncertainty_type === "epistemic-dominant" && (
                    <p
                      style={{
                        fontFamily: "var(--font-serif), Georgia, serif",
                        fontSize: 12,
                        fontStyle: "italic",
                        color: "var(--text-secondary)",
                        marginTop: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      ↳ The dominant uncertainty source is knowledge-based and reducible. Targeted evidence gathering — expert consultation, pilot testing, data collection — would meaningfully tighten this estimate.
                    </p>
                  )}
                  {result.uncertainty_type !== "epistemic-dominant" && (
                    <p
                      style={{
                        fontFamily: "var(--font-serif), Georgia, serif",
                        fontSize: 12,
                        fontStyle: "italic",
                        color: "var(--text-muted)",
                        marginTop: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      ↳ The dominant uncertainty source is inherent randomness. Additional information is unlikely to substantially narrow this estimate&apos;s spread.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Sensitivity */}
            {sensitivity && (
              <section style={{ marginBottom: 28 }}>
                <Label>Sensitivity Analysis — Spearman Rank Correlation</Label>
                <div className="card">
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {[
                      {
                        label: "Probability estimate (p₀)",
                        ρ: sensitivity.probability_sensitivity,
                        impact: `${(sensitivity.probability_impact * 100).toFixed(1)}pp range on E[P]`,
                      },
                      {
                        label: "Confidence level (c)",
                        ρ: sensitivity.confidence_sensitivity,
                        impact: `${(sensitivity.confidence_impact * 100).toFixed(1)}pp range on σ`,
                      },
                    ].map((item) => (
                      <div key={item.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span className="font-serif" style={{ fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)" }}>
                            {item.label}
                          </span>
                          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {item.impact}
                          </span>
                        </div>
                        <div style={{ background: "var(--surface-3)", height: 2 }}>
                          <div
                            style={{
                              height: 2,
                              width: `${item.ρ * 100}%`,
                              background: "var(--text-secondary)",
                              transition: "width 700ms",
                            }}
                          />
                        </div>
                        <p className="font-mono" style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 5, textAlign: "right" }}>
                          ρ = {item.ρ.toFixed(4)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 12 }}>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
                      {sensitivity.interpretation}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Decision Panel (v3.0) */}
            {decisionResult && (
              <DecisionPanel
                result={decisionResult}
                threshold={decisionThreshold}
                setThreshold={setDecisionThreshold}
                onRerun={async () => {
                  if (!result) return;
                  try {
                    const dr = await fetch(`${API_URL}/decision`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        base_probability: baseProbability,
                        confidence,
                        mean: result.mean,
                        std_dev: result.std_dev,
                        confidence_interval_low: result.confidence_interval_low,
                        confidence_interval_high: result.confidence_interval_high,
                        threshold: decisionThreshold,
                        trials: 10000,
                      }),
                    });
                    if (dr.ok) setDecisionResult(await dr.json());
                  } catch {}
                }}
              />
            )}

            {/* Stress test */}
            {stressResult && (
              <section style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <Label>Assumption Stress Test — ±15pp shift</Label>
                  {stressResult.is_fragile && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        color: "var(--risk-critical)",
                        border: "1px solid var(--risk-critical)",
                        padding: "2px 8px",
                      }}
                    >
                      FRAGILE ±{stressResult.fragility_frontier_pp}pp
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${stressResult.stress_points.length}, 1fr)`,
                    gap: 1,
                    background: "var(--border)",
                  }}
                >
                  {stressResult.stress_points.map((pt) => {
                    const c = RISK_COLORS[pt.risk_category] ?? "#666";
                    const isBase = pt.shift_pp === 0;
                    return (
                      <div
                        key={pt.shift_pp}
                        className="tooltip-group"
                        style={{
                          background: isBase ? `${c}20` : "var(--surface-1)",
                          padding: "10px 4px",
                          textAlign: "center",
                          borderBottom: isBase ? `2px solid ${c}` : "2px solid transparent",
                        }}
                      >
                        <p className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: c, margin: 0 }}>
                          {pt.shift_pp > 0 ? "+" : ""}
                          {pt.shift_pp}
                        </p>
                        <p
                          className="font-mono"
                          style={{ fontSize: 11, color: isBase ? "var(--text-white)" : "var(--text-secondary)", margin: "2px 0 0" }}
                        >
                          {(pt.mean * 100).toFixed(0)}%
                        </p>
                        <div className="tooltip-content" style={{ width: 140, whiteSpace: "normal" }}>
                          <span style={{ color: c, fontWeight: 700, textTransform: "uppercase", fontSize: 9 }}>{pt.risk_category}</span>
                          <br />
                          CI: {(pt.ci_low * 100).toFixed(0)}%–{(pt.ci_high * 100).toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
                  {stressResult.is_fragile
                    ? `Risk category shifts at ±${stressResult.fragility_frontier_pp}pp. Validate the core probability assumption before acting.`
                    : `Category stable across ±${stressResult.robust_range_pp}pp. Estimate is robust to moderate assumption errors.`}
                </p>
              </section>
            )}

            {/* Pin / Compare */}
            <section style={{ marginBottom: 28 }}>
              {!pinnedResult ? (
                <button
                  className="btn-outline"
                  style={{ width: "100%" }}
                  onClick={() => {
                    setPinnedResult(result);
                    setPinnedDescription(description.slice(0, 60) + "...");
                  }}
                >
                  ⊕ pin as scenario A — change inputs to compare
                </button>
              ) : (
                <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p className="font-mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", marginBottom: 2 }}>
                      SCENARIO A PINNED
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{pinnedDescription}</p>
                  </div>
                  <button className="btn-ghost" onClick={() => { setPinnedResult(null); setPinnedDescription(""); }}>
                    ✕ clear
                  </button>
                </div>
              )}
            </section>

            {/* Distribution Chart */}
            <section style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                <Label>{pinnedResult ? "Scenario Comparison" : "Probability Distribution"}</Label>
                {pinnedResult && (
                  <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                    {[
                      { label: "A", mean: pinnedResult.mean, color: "#888" },
                      { label: "B", mean: result.mean, color: "var(--text-white)" },
                    ].map((s) => (
                      <span key={s.label} className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        <span style={{ color: s.color }}>■</span> {s.label}: {(s.mean * 100).toFixed(1)}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ border: "1px solid var(--border)", padding: "16px 8px 8px 8px", background: "var(--surface-1)" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={(pinnedResult ? buildComparisonData(pinnedResult, result) : liveChartData) as ChartPoint[]}
                    margin={{ top: 4, right: 8, left: -24, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#888" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#888" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f0f0f0" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#f0f0f0" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--surface-3)" strokeDasharray="none" />
                    <XAxis
                      dataKey={pinnedResult ? "x" : "probability"}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--border-hi)" }}
                    />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-mid)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                      }}
                      labelStyle={{ color: "var(--text-muted)", fontSize: 10 }}
                      labelFormatter={(v) => `p = ${v}%`}
                      formatter={(v) => [typeof v === "number" ? v.toFixed(3) : "0.000", "density"]}
                    />
                    <ReferenceArea x1={0} x2={25} fill={RISK_COLORS.critical} fillOpacity={0.06} />
                    <ReferenceArea x1={25} x2={50} fill={RISK_COLORS.high} fillOpacity={0.06} />
                    <ReferenceArea x1={50} x2={75} fill={RISK_COLORS.moderate} fillOpacity={0.06} />
                    <ReferenceArea x1={75} x2={100} fill={RISK_COLORS.favorable} fillOpacity={0.06} />
                    <ReferenceLine
                      x={pinnedResult ? Math.round(pinnedResult.mean * 100) : Math.round(result.mean * 100)}
                      stroke="var(--border-hi)"
                      strokeDasharray="3 3"
                      label={{
                        value: pinnedResult ? "A" : "μ",
                        fill: "var(--text-muted)",
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                    {pinnedResult && (
                      <ReferenceLine
                        x={Math.round(result.mean * 100)}
                        stroke="var(--text-secondary)"
                        strokeDasharray="3 3"
                        label={{ value: "B", fill: "var(--text-secondary)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey={pinnedResult ? "densityA" : "density"}
                      stroke="#888"
                      strokeWidth={1.5}
                      fill="url(#gA)"
                      dot={false}
                      animationDuration={300}
                    />
                    {pinnedResult && (
                      <Area
                        type="monotone"
                        dataKey="densityB"
                        stroke="var(--text-white)"
                        strokeWidth={1.5}
                        fill="url(#gB)"
                        dot={false}
                        animationDuration={300}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  {[
                    { label: "Critical 0–25%", color: RISK_COLORS.critical },
                    { label: "High 25–50%", color: RISK_COLORS.high },
                    { label: "Moderate 50–75%", color: RISK_COLORS.moderate },
                    { label: "Strong 75–100%", color: RISK_COLORS.favorable },
                  ].map((z) => (
                    <span key={z.label} className="font-mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                      <span style={{ color: z.color }}>■</span> {z.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Portfolio button */}
            <section style={{ marginBottom: 28 }}>
              <button
                className="btn-outline"
                style={{ width: "100%" }}
                disabled={portfolio.length >= 4}
                onClick={() => {
                  const entry: PortfolioScenario = {
                    label: `S${portfolio.length + 1}`,
                    description: description.slice(0, 60),
                    base_probability: baseProbability,
                    confidence,
                    mean: result.mean,
                    std_dev: result.std_dev,
                    confidence_interval_low: result.confidence_interval_low,
                    confidence_interval_high: result.confidence_interval_high,
                    eviu: result.eviu ?? 0,
                    uncertainty_type: result.uncertainty_type ?? "aleatory-dominant",
                  };
                  setPortfolio((p) => [...p.slice(0, 3), entry]);
                  setPortfolioResult(null);
                }}
              >
                ⊕ add to portfolio analysis {portfolio.length > 0 ? `(${portfolio.length}/4)` : ""}
              </button>
            </section>

            {/* Copula Panel */}
            <CopulaPanel apiUrl={API_URL} baseProbability={baseProbability} initialFactors={extractedRiskFactors} />

            {/* Decision Summary */}
            {decisionSummary && (
              <section style={{ marginBottom: 28 }}>
                <Label>Decision Summary</Label>
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
                    {decisionSummary.summary}
                  </p>
                  <div style={{ borderLeft: "2px solid var(--risk-moderate)", paddingLeft: 12 }}>
                    <p className="font-mono" style={{ fontSize: 9, color: "var(--risk-moderate)", letterSpacing: "0.12em", marginBottom: 5 }}>
                      KEY UNCERTAINTY INSIGHT
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                      {decisionSummary.key_insight}
                    </p>
                  </div>
                  <div style={{ borderLeft: "2px solid var(--border-hi)", paddingLeft: 12 }}>
                    <p className="font-mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 5 }}>
                      DECISION FRAMING
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                      {decisionSummary.decision_framing}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        <HR />

        {/* Scenario History */}
        {history.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
              <Label>Scenario History ({history.length})</Label>
              <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                <button className="btn-ghost" onClick={() => exportJSON(history)}>
                  ↓ json
                </button>
                <button className="btn-ghost" onClick={() => exportLatex(history)}>
                  ↓ latex
                </button>
                <button className="btn-ghost" onClick={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]); }}>
                  ✕ clear
                </button>
              </div>
            </div>
            <div style={{ border: "1px solid var(--border)" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 80px 80px",
                  padding: "6px 12px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface-2)",
                }}
              >
                {["time", "scenario", "E[P]", "σ"].map((h) => (
                  <span
                    key={h}
                    className="font-mono"
                    style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {history.map((entry, i) => (
                <div
                  key={entry.id}
                  onClick={() => {
                    setDescription(entry.description.replace(/\.\.\.$/, ""));
                    setBaseProbability(entry.baseProbability);
                    setConfidence(entry.confidence);
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr 80px 80px",
                    padding: "8px 12px",
                    borderBottom: i < history.length - 1 ? "1px solid var(--border)" : "none",
                    cursor: "pointer",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {entry.timestamp}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 12,
                    }}
                  >
                    {entry.description}
                  </span>
                  <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-white)" }}>
                    {((entry.result?.mean ?? 0) * 100).toFixed(1)}%
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    ±{((entry.result?.std_dev ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Portfolio Analysis */}
        {portfolio.length >= 2 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
              <Label>Portfolio Analysis — {portfolio.length} scenarios</Label>
              <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    try {
                      const res = await fetch(`${API_URL}/portfolio`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(portfolio),
                      });
                      if (res.ok) setPortfolioResult(await res.json());
                    } catch {}
                  }}
                >
                  ▷ analyse
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setPortfolio([]);
                    setPortfolioResult(null);
                  }}
                >
                  ✕ clear
                </button>
              </div>
            </div>
            <div style={{ border: "1px solid var(--border)" }}>
              {portfolio.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 80px",
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--border)",
                    alignItems: "center",
                  }}
                >
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 12,
                    }}
                  >
                    {s.description}
                  </span>
                  <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-white)", textAlign: "right" }}>
                    {(s.mean * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
              {portfolioResult && (
                <div style={{ padding: "14px 12px", borderTop: "1px solid var(--border-mid)", background: "var(--surface-2)" }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>{portfolioResult.recommendation_basis}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {portfolioResult.ranked_labels.map((label, i) => {
                      const s = portfolio.find((x) => x.label === label);
                      return (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            className="font-mono"
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: i === 0 ? "var(--text-white)" : "var(--text-muted)",
                              width: 20,
                            }}
                          >
                            {i + 1}
                          </span>
                          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
                            {label} — {s?.description}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {label === portfolioResult.highest_upside && (
                              <span className="font-mono" style={{ fontSize: 9, color: RISK_COLORS.favorable, letterSpacing: "0.1em" }}>
                                UPSIDE
                              </span>
                            )}
                            {label === portfolioResult.lowest_downside && label !== portfolioResult.highest_upside && (
                              <span className="font-mono" style={{ fontSize: 9, color: "var(--text-secondary)", letterSpacing: "0.1em" }}>
                                FLOOR
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {portfolioResult.dominance_pairs.some((p) => p.dominates) && (
                    <p className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 }}>
                      Stochastic dominance:{" "}
                      {portfolioResult.dominance_pairs
                        .filter((p) => p.dominates)
                        .map((p) => `${p.scenario_a} ≻ ${p.scenario_b}`)
                        .join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 20,
            display: "flex",
            justifyContent: "center",
            gap: 32,
          }}
        >
          {[
            { href: "/model-card", label: "Model Card" },
            { href: "/api-docs", label: "API Reference" },
            { href: "/calibration", label: "Calibration" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-serif"
              style={{
                fontSize: 11,
                fontStyle: "italic",
                color: "var(--text-muted)",
                letterSpacing: "0.06em",
                textDecoration: "none",
                transition: "color 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              {link.label}
            </Link>
          ))}
        </footer>
      </div>
    </main>
  );
}