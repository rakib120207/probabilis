"use client";
import Link from "next/link";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import { buildLocalCurve } from "@/lib/betaPdf";
import { saveToHistory, StoredScenario } from "@/lib/storage";
// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════
type ExtractionResult = {
  suggested_probability: number;
  suggested_confidence: number;
  suggested_risk: number;
  risk_factors: Array<{
    name: string;
    probability: number;
    confidence: number;
    type: string;
    description: string;
  }>;
  uncertainty_type: string;
  domain: string;
  reasoning: string;
  extraction_mode: string;
  suggested_threshold?: number;
  suggested_correlation?: number;
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
  adjusted_probability?: number;
  risk?: number;
};
type SensitivityResult = {
  probability_sensitivity: number;
  confidence_sensitivity: number;
  probability_impact: number;
  confidence_impact: number;
  interpretation: string;
  attribution?: Array<{
    factor: string;
    spearman_rho: number;
    variance_explained_pct: number;
    impact_pp: number;
    direction: string;
    fragile: boolean;
  }>;
  decision_robustness?: string;
  recommended_focus?: string;
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
type RiskFactor = {
  name: string;
  probability: number;
  confidence: number;
};
type CopulaResult = {
  mean: number;
  std_dev: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  tail_risk_5pct: number;
  tail_risk_95pct: number;
  joint_failure_probability: number;
  correlation_effect: number;
  tail_dependence?: number;
  histogram_x: number[];
  histogram_y: number[];
  trials: number;
  risk_factor_names: string[];
  copula_type: string;
  interpretation?: string;
};
type ChartPoint = {
  x?: number;
  probability?: number;
  density?: number;
  densityA?: number;
  densityB?: number;
};

// ── AUDIT TYPES (v3) ─────────────────────────────────────────────────────────
type CheckResult = {
  check_name: string;
  passed: boolean;
  severity: "info" | "warning" | "error";
  message: string;
  suggested_fix?: string | null;
};

type AuditResult = {
  overall_verdict: "valid" | "review" | "suspect";
  confidence_in_result: "high" | "medium" | "low";
  checks: CheckResult[];
  error_count: number;
  warning_count: number;
  auditor_note: string;
  ai_review: string | null;
  audit_mode: string;
};

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const RISK_COLORS: Record<string, string> = {
  critical: "#f87171",
  high: "#fb923c",
  moderate: "#fbbf24",
  favorable: "#34d399",
  strong: "#10b981",
};
const DOMAIN_LABELS: Record<string, string> = {
  academic: "Academic", career: "Career", business: "Business",
  finance: "Finance", health: "Health", exam: "Exam", other: "General",
};
// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
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
function getRiskLabel(mean: number) {
  const pct = mean * 100;
  if (pct < 20) return { level: "critical", label: "Critical", color: "#f87171" };
  if (pct < 35) return { level: "high", label: "High Risk", color: "#fb923c" };
  if (pct < 55) return { level: "moderate", label: "Moderate", color: "#fbbf24" };
  if (pct < 72) return { level: "favorable", label: "Favorable", color: "#34d399" };
  return { level: "strong", label: "Strong", color: "#10b981" };
}
// ── Deduplication helper for PDF/JSON export ──────────────────────────────
function deduplicateForExport(scenarios: StoredScenario[]): StoredScenario[] {
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  const seen = new Map<string, StoredScenario>();
  for (const entry of scenarios) {
    const key = normalise(entry.description);
    if (!seen.has(key)) {
      seen.set(key, entry);
    }
  }
  return Array.from(seen.values()).reverse();
}
// ══════════════════════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`section-label ${className}`} style={{ marginBottom: 10 }}>
      {children}
    </p>
  );
}
function Divider({ label }: { label?: string }) {
  if (label) {
    return (
      <div className="sep-label">
        <span>{label}</span>
      </div>
    );
  }
  return <div className="rule" style={{ margin: "24px 0" }} />;
}
function Badge({ children, variant = "ghost" }: { children: React.ReactNode; variant?: "blue" | "green" | "amber" | "red" | "ghost" }) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
function ExtractionBadge({ mode }: { mode: string }) {
  const isAI = mode.startsWith("ai");
  return (
    <Badge variant={isAI ? "blue" : "amber"}>
      {isAI ? "⚡ Llama 3.3 70B" : "◈ Heuristic Fallback"}
    </Badge>
  );
}
function RiskPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="risk-pill"
      style={{
        color,
        borderColor: `${color}40`,
        background: `${color}0f`,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
function ConvergenceDot({ rhat }: { rhat: number }) {
  const ok = rhat < 1.05;
  const color = ok ? "#10b981" : "#f87171";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: color,
        boxShadow: `0 0 6px ${color}`,
        animation: ok ? "none" : "pulse-blue 1.5s ease infinite",
      }} />
      <span style={{ fontFamily: "var(--font-data)", fontSize: 11, color: ok ? "#10b981" : "#f87171" }}>
        R̂ = {rhat.toFixed(4)}
      </span>
    </span>
  );
}
function MetricCard({
  label, value, note, accent = false, color,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div className="metric-chip">
      <span
        className="metric-chip__value number-animate"
        style={color ? { color } : accent ? { color: "var(--blue-bright)" } : {}}
      >
        {value}
      </span>
      <span className="metric-chip__label">{label}</span>
      {note && <span className="metric-chip__note">{note}</span>}
    </div>
  );
}
function SliderField({
  label, subLabel, value, min, max, step, onChange, format,
  note, accentColor,
}: {
  label: string;
  subLabel?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  note?: string;
  accentColor?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {label}
          {subLabel && (
            <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-ghost)", marginLeft: 8 }}>
              {subLabel}
            </span>
          )}
        </span>
        <span
          style={{
            fontFamily: "var(--font-data)",
            fontSize: 16,
            fontWeight: 700,
            color: accentColor ?? "var(--text-white)",
            transition: "color 200ms",
          }}
        >
          {format(value)}
        </span>
      </div>
      <div style={{ position: "relative" }}>
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ "--val": `${pct}%` } as React.CSSProperties}
        />
      </div>
      {note && (
        <p style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-ghost)", marginTop: 7, lineHeight: 1.5 }}>
          {note}
        </p>
      )}
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// COPULA PANEL
// ══════════════════════════════════════════════════════════════════════════════
function CopulaPanel({
  apiUrl, baseProbability, initialFactors, initialCorrelation,
}: {
  apiUrl: string;
  baseProbability: number;
  initialFactors?: ExtractionResult["risk_factors"];
  initialCorrelation?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [factors, setFactors] = useState<RiskFactor[]>(() => {
    if (initialFactors && initialFactors.length > 0) {
      return initialFactors.slice(0, 3).map(f => ({
        name: f.name,
        probability: f.probability,
        confidence: f.confidence ?? 0.60,
      }));
    }
    return [
      { name: "Primary risk factor", probability: 0.25, confidence: 0.60 },
      { name: "Secondary risk factor", probability: 0.20, confidence: 0.70 },
    ];
  });
  const [correlation, setCorrelation] = useState(initialCorrelation ?? 0.4);
  const [copulaType, setCopulaType] = useState<"gaussian" | "student_t">("gaussian");
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
          copula_type: copulaType,
          student_t_df: 4.0,
          trials: 10000,
        }),
      });
      if (res.ok) setResult(await res.json());
    } catch {}
    setRunning(false);
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <button className="collapsible-trigger" onClick={() => setOpen(!open)}>
        <span>Correlated Risk Analysis — {copulaType === "student_t" ? "Student-t" : "Gaussian"} Copula</span>
        <span style={{ fontSize: 12, opacity: 0.5 }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          className="animate-fade-in"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-low)",
            borderTop: "none",
            padding: "18px",
          }}
        >
          <p style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.7 }}>
            Models correlated risks via copula simulation. Risk events cluster — market crashes make all risks more likely simultaneously.
          </p>
          {/* Copula type selector */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["gaussian", "student_t"] as const).map(ct => (
              <button
                key={ct}
                onClick={() => setCopulaType(ct)}
                style={{
                  fontFamily: "var(--font-data)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "5px 12px",
                  background: copulaType === ct ? "var(--surface-3)" : "transparent",
                  border: `1px solid ${copulaType === ct ? "var(--border-high)" : "var(--border-low)"}`,
                  color: copulaType === ct ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all 150ms",
                }}
              >
                {ct === "gaussian" ? "Gaussian" : "Student-t (heavy tail)"}
              </button>
            ))}
          </div>
          {initialCorrelation != null && (
            <p style={{
              fontFamily: "var(--font-data)", fontSize: 9,
              color: "var(--amber)", letterSpacing: "0.08em", marginBottom: 10,
            }}>
              ⚡ ρ = {initialCorrelation.toFixed(2)} pre-filled from AI extraction
            </p>
          )}
          {/* Risk factors */}
          {factors.map((f, i) => (
            <div key={i} style={{ marginBottom: 10, padding: "12px 14px", background: "var(--surface-2)", borderLeft: "2px solid var(--border-mid)" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input
                  value={f.name}
                  onChange={(e) => {
                    const updated = [...factors];
                    updated[i] = { ...f, name: e.target.value };
                    setFactors(updated);
                  }}
                  style={{
                    flex: 1,
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-low)",
                    color: "var(--text-primary)",
                    padding: "6px 10px",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => setFactors(factors.filter((_, fi) => fi !== i))}
                  style={{ fontFamily: "var(--font-data)", fontSize: 11, background: "none", border: "none", color: "var(--text-ghost)", cursor: "pointer", padding: "0 4px" }}
                >
                  ✕
                </button>
              </div>
              <SliderField
                label=""
                subLabel={`p = ${(f.probability * 100).toFixed(0)}%`}
                value={f.probability}
                min={0.01} max={0.95} step={0.01}
                onChange={(v) => {
                  const updated = [...factors];
                  updated[i] = { ...f, probability: v };
                  setFactors(updated);
                }}
                format={(v) => `${(v * 100).toFixed(0)}%`}
              />
            </div>
          ))}
          {factors.length < 4 && (
            <button
              onClick={() => setFactors([...factors, { name: `Risk factor ${factors.length + 1}`, probability: 0.20, confidence: 0.65 }])}
              style={{
                fontFamily: "var(--font-data)", fontSize: 9, letterSpacing: "0.1em",
                textTransform: "uppercase", background: "none",
                border: "1px dashed var(--border-low)", color: "var(--text-muted)",
                padding: "6px 14px", cursor: "pointer", marginBottom: 14, width: "100%",
              }}
            >
              + Add risk factor
            </button>
          )}
          <SliderField
            label="Inter-risk correlation"
            subLabel="ρ"
            value={correlation}
            min={-0.8} max={0.95} step={0.05}
            onChange={setCorrelation}
            format={(v) => v.toFixed(2)}
            note="Positive correlation means risks co-occur more than expected under independence."
          />
          <button
            onClick={runCopula}
            disabled={running || factors.length < 2}
            className="btn-outline"
            style={{ width: "100%", marginTop: 14 }}
          >
            {running ? "Running copula simulation…" : `Run ${copulaType === "student_t" ? "Student-t" : "Gaussian"} Copula`}
          </button>
          {result && (
            <div style={{ marginTop: 16 }} className="animate-slide-up">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border-subtle)", marginBottom: 10 }}>
                {[
                  { label: "Correlated mean", value: `${(result.mean * 100).toFixed(1)}%` },
                  { label: "5th pct (worst)", value: `${(result.tail_risk_5pct * 100).toFixed(1)}%` },
                  { label: "Joint failure P", value: `${(result.joint_failure_probability * 100).toFixed(1)}%` },
                  { label: "Correlation effect", value: `${result.correlation_effect > 0 ? "" : "+"}${(Math.abs(result.correlation_effect) * 100).toFixed(1)}pp` },
                ].map((s) => (
                  <div key={s.label} style={{ background: "var(--surface-2)", padding: "10px 12px", textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-data)", fontSize: 15, fontWeight: 700, color: "var(--text-white)", margin: 0 }}>{s.value}</p>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 10, fontStyle: "italic", color: "var(--text-muted)", marginTop: 3 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              {result.interpretation && (
                <p style={{ fontFamily: "var(--font-display)", fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)", lineHeight: 1.65 }}>
                  {result.interpretation}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// DECISION PANEL
// ══════════════════════════════════════════════════════════════════════════════
function DecisionPanel({
  result, threshold, setThreshold, onRerun,
}: {
  result: DecisionResult;
  threshold: number;
  setThreshold: (v: number) => void;
  onRerun: () => void;
}) {
  const ACTION_CONFIG = {
    proceed: { label: "Proceed", color: "var(--action-proceed)", bg: "rgba(16,185,129,0.06)" },
    abandon: { label: "Abandon", color: "var(--action-abandon)", bg: "rgba(248,113,113,0.06)" },
    gather_more_info: { label: "Gather Info First", color: "var(--action-gather)", bg: "rgba(251,191,36,0.06)" },
  } as Record<string, { label: string; color: string; bg: string }>;
  const cfg = ACTION_CONFIG[result.recommended_action] ?? ACTION_CONFIG["gather_more_info"];
  return (
    <div className="animate-slide-up" style={{ marginBottom: 28 }}>
      <SectionLabel>Decision Analysis — Expected Utility & Regret</SectionLabel>
      <div
        style={{
          border: `1px solid ${cfg.color}33`,
          background: "var(--surface-1)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle background glow */}
        <div style={{
          position: "absolute", top: 0, right: 0,
          width: 200, height: 200,
          background: `radial-gradient(ellipse at 100% 0%, ${cfg.color}0a 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
        {/* Header */}
        <div
          className="decision-header"
          style={{
            borderBottomColor: `${cfg.color}22`,
            background: cfg.bg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="decision-action-label" style={{ color: cfg.color }}>
              {cfg.label}
            </span>
            <Badge variant={
              result.decision_confidence === "high" ? "green"
              : result.decision_confidence === "medium" ? "blue"
              : "amber"
            }>
              {result.decision_confidence} confidence
            </Badge>
          </div>
          <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)" }}>
            τ = {(result.threshold_used * 100).toFixed(0)}%
          </span>
        </div>
        <div style={{ padding: "18px" }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 18 }}>
            {result.action_interpretation}
          </p>
          {/* Metrics */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "var(--border-subtle)",
            marginBottom: 20,
          }}>
            {[
              { label: "EU(proceed)", value: result.expected_utility_proceed.toFixed(3), note: "vs 0 baseline" },
              { label: "P(above τ)", value: `${(result.probability_above_threshold * 100).toFixed(1)}%`, note: `at ${(result.threshold_used * 100).toFixed(0)}%` },
              { label: "Regret", value: result.expected_regret.toFixed(3), note: "expected loss" },
              { label: "VPI", value: result.vpi.toFixed(3), note: "info value" },
            ].map((m) => (
              <MetricCard key={m.label} label={m.label} value={m.value} note={m.note} />
            ))}
          </div>
          {/* Regret */}
          <div style={{ borderLeft: `2px solid var(--border-mid)`, paddingLeft: 14, marginBottom: 14 }}>
            <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 5, textTransform: "uppercase" }}>
              Regret Analysis
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>
              {result.regret_interpretation}
            </p>
          </div>
          {/* VPI */}
          <div style={{
            borderLeft: `2px solid ${result.vpi > 0.08 ? "var(--amber)" : "var(--border-mid)"}`,
            paddingLeft: 14,
            marginBottom: 20,
          }}>
            <p style={{
              fontFamily: "var(--font-data)", fontSize: 9, letterSpacing: "0.14em",
              color: result.vpi > 0.08 ? "var(--amber)" : "var(--text-muted)",
              marginBottom: 5, textTransform: "uppercase",
            }}>
              Value of Perfect Information
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>
              {result.vpi_interpretation}
            </p>
          </div>
          {/* Break-even */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              Break-even probability
            </span>
            <span style={{ fontFamily: "var(--font-data)", fontSize: 14, fontWeight: 700, color: "var(--text-white)" }}>
              {(result.break_even_probability * 100).toFixed(1)}%
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              — EU(proceed) = EU(abandon) at this threshold
            </span>
          </div>
          {/* Threshold slider */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
            <SliderField
              label="Decision threshold τ"
              value={threshold}
              min={0.10} max={0.90} step={0.05}
              onChange={setThreshold}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              note="Proceed if simulated probability exceeds this threshold."
            />
            <button className="btn-outline" style={{ width: "100%", marginTop: 12, marginBottom: 16 }} onClick={onRerun}>
              ↺ Recompute at τ = {(threshold * 100).toFixed(0)}%
            </button>
            {/* Threshold sensitivity grid */}
            <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
              Threshold Sensitivity
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${result.threshold_sensitivity.length}, 1fr)`,
              gap: 1,
              background: "var(--border-subtle)",
            }}>
              {result.threshold_sensitivity.map((pt) => {
                const isActive = Math.abs(pt.threshold - result.threshold_used) < 0.01;
                const ptColor = pt.action === "proceed" ? "var(--action-proceed)" : "var(--action-abandon)";
                return (
                  <div
                    key={pt.threshold}
                    style={{
                      background: isActive ? "var(--surface-3)" : "var(--surface-2)",
                      padding: "8px 4px",
                      textAlign: "center",
                      borderBottom: isActive ? `2px solid ${ptColor}` : "2px solid transparent",
                    }}
                  >
                    <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-muted)", margin: 0 }}>
                      {(pt.threshold * 100).toFixed(0)}%
                    </p>
                    <p style={{ fontFamily: "var(--font-data)", fontSize: 9, fontWeight: 700, color: ptColor, margin: "2px 0 0" }}>
                      {pt.action === "proceed" ? "GO" : "NO"}
                    </p>
                    <p style={{ fontFamily: "var(--font-data)", fontSize: 8, color: "var(--text-ghost)", margin: "1px 0 0" }}>
                      {(pt.probability_above * 100).toFixed(0)}%
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          {result.threshold_used < 0.05 && (
  <div style={{
    marginTop: 12,
    padding: "10px 14px",
    background: "rgba(245,158,11,0.06)",
    border: "1px solid rgba(245,158,11,0.3)",
    borderLeft: "3px solid var(--amber)",
  }}>
    <p style={{
      fontFamily: "var(--font-data)",
      fontSize: 9,
      color: "var(--amber)",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      marginBottom: 4,
    }}>
      Trivial threshold warning
    </p>
    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
      Decision threshold τ = {(result.threshold_used * 100).toFixed(0)}%.
      With τ near zero and no action cost, "Proceed" is always optimal —
      the analysis is economically trivial. Set τ to your actual minimum
      success requirement (e.g. 40%, 60%) using the slider above.
    </p>
  </div>
)}
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// AUDIT PANEL (v3)
// ══════════════════════════════════════════════════════════════════════════════
function AuditPanel({ result }: { result: AuditResult }) {
  const [expanded, setExpanded] = useState(false);

  const VERDICT_CONFIG = {
    valid:   { label: "Result Valid",   color: "var(--risk-strong)",    bg: "rgba(16,185,129,0.06)",  icon: "✓" },
    review:  { label: "Review Advised", color: "var(--amber)",          bg: "rgba(245,158,11,0.06)",  icon: "⚠" },
    suspect: { label: "Result Suspect", color: "var(--risk-critical)",  bg: "rgba(248,113,113,0.06)", icon: "✗" },
  } as const;

  const cfg = VERDICT_CONFIG[result.overall_verdict];

  const failedChecks = result.checks.filter(c => !c.passed);
  const passedChecks = result.checks.filter(c => c.passed);

  return (
    <div className="animate-slide-up" style={{ marginBottom: 28 }}>
      <SectionLabel>Result Audit — Integrity Check</SectionLabel>
      <div style={{
        border: `1px solid ${cfg.color}33`,
        background: "var(--surface-1)",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${cfg.color}22`,
          background: cfg.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              fontFamily: "var(--font-data)",
              fontSize: 16,
              fontWeight: 700,
              color: cfg.color,
            }}>
              {cfg.icon}
            </span>
            <span style={{
              fontFamily: "var(--font-data)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase" as const,
              color: cfg.color,
            }}>
              {cfg.label}
            </span>
            <Badge variant={
              result.confidence_in_result === "high" ? "green"
              : result.confidence_in_result === "medium" ? "amber"
              : "red"
            }>
              {result.confidence_in_result} confidence
            </Badge>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {result.error_count > 0 && (
              <Badge variant="red">{result.error_count} error{result.error_count > 1 ? "s" : ""}</Badge>
            )}
            {result.warning_count > 0 && (
              <Badge variant="amber">{result.warning_count} warning{result.warning_count > 1 ? "s" : ""}</Badge>
            )}
            <Badge variant="ghost">
              {result.audit_mode === "full" ? "AI + deterministic" : "deterministic only"}
            </Badge>
          </div>
        </div>

        <div style={{ padding: "16px" }}>
          {/* Auditor note */}
          <p style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            marginBottom: result.ai_review ? 16 : 0,
          }}>
            {result.auditor_note}
          </p>

          {/* AI review */}
          {result.ai_review && (
            <div style={{
              borderLeft: "2px solid var(--blue-glow)",
              paddingLeft: 14,
              marginBottom: 16,
            }}>
              <p style={{
                fontFamily: "var(--font-data)",
                fontSize: 9,
                color: "var(--blue-bright)",
                letterSpacing: "0.14em",
                textTransform: "uppercase" as const,
                marginBottom: 5,
              }}>
                AI Semantic Review — Llama 3.3 70B
              </p>
              <p style={{
                fontFamily: "var(--font-display)",
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--text-secondary)",
                lineHeight: 1.7,
              }}>
                {result.ai_review}
              </p>
            </div>
          )}

          {/* Failed checks (always visible) */}
          {failedChecks.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {failedChecks.map((check) => (
                <div key={check.check_name} style={{
                  padding: "10px 12px",
                  marginBottom: 6,
                  background: check.severity === "error"
                    ? "rgba(248,113,113,0.06)"
                    : "rgba(245,158,11,0.06)",
                  borderLeft: `2px solid ${
                    check.severity === "error"
                      ? "var(--risk-critical)"
                      : "var(--amber)"
                  }`,
                }}>
                  <p style={{
                    fontFamily: "var(--font-data)",
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase" as const,
                    color: check.severity === "error"
                      ? "var(--risk-critical)"
                      : "var(--amber)",
                    marginBottom: 4,
                  }}>
                    {check.severity.toUpperCase()} — {check.check_name.replace(/_/g, " ")}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: check.suggested_fix ? 6 : 0 }}>
                    {check.message}
                  </p>
                  {check.suggested_fix && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      → {check.suggested_fix}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Passed checks (collapsible) */}
          {passedChecks.length > 0 && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  fontFamily: "var(--font-data)",
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase" as const,
                  background: "none",
                  border: "none",
                  color: "var(--text-ghost)",
                  cursor: "pointer",
                  padding: "4px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ color: "var(--risk-strong)" }}>✓</span>
                {passedChecks.length} checks passed
                <span style={{ opacity: 0.5, fontSize: 10 }}>{expanded ? "▴" : "▾"}</span>
              </button>
              {expanded && (
                <div className="animate-fade-in" style={{ marginTop: 8 }}>
                  {passedChecks.map((check) => (
                    <div key={check.check_name} style={{
                      display: "flex",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}>
                      <span style={{ color: "var(--risk-strong)", fontFamily: "var(--font-data)", fontSize: 11, flexShrink: 0 }}>✓</span>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
                        {check.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// WELCOME / EMPTY STATE
// ══════════════════════════════════════════════════════════════════════════════
function WelcomeState() {
  const scenarios = [
    "I'm applying to PhD programs in machine learning at ETH Zurich with a 3.8 CGPA and two Q1 publications",
    "Launching a B2B SaaS with 47 paying beta customers in the legal-tech niche",
    "Preparing for the Bangladesh Civil Service exam with 8 months of intensive study",
    "Submitting a research grant proposal with a strong publication track record in computational biology",
  ];
  return (
    <div className="animate-fade-in" style={{ padding: "40px 0" }}>
      <div style={{
        textAlign: "center",
        marginBottom: 40,
        padding: "0 20px",
      }}>
        <p style={{
          fontFamily: "var(--font-display)",
          fontSize: 15,
          fontStyle: "italic",
          color: "var(--text-muted)",
          lineHeight: 1.7,
          maxWidth: 460,
          margin: "0 auto",
        }}>
          Describe your decision scenario in natural language. The system extracts uncertainty parameters via AI, then runs 10,000 Monte Carlo trials to model your outcome distribution.
        </p>
      </div>
      <div>
        <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-ghost)", letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center", marginBottom: 14 }}>
          Example scenarios
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {scenarios.map((s, i) => (
            <div
              key={i}
              style={{
                padding: "11px 16px",
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                cursor: "default",
                transition: "border-color 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-low)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
            >
              <p style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                &ldquo;{s}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
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
  const [risk, setRisk] = useState(0.0);
  const [reasoning, setReasoning] = useState("");
  const [extractionMode, setExtractionMode] = useState("");
  const [extractionDomain, setExtractionDomain] = useState("");
  const [reasoningFresh, setReasoningFresh] = useState(false);
  const [extractedRiskFactors, setExtractedRiskFactors] = useState<ExtractionResult["risk_factors"]>([]);
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
  const [simulatingStep, setSimulatingStep] = useState("");
  const [error, setError] = useState("");
  const [decisionResult, setDecisionResult] = useState<DecisionResult | null>(null);
  const [decisionThreshold, setDecisionThreshold] = useState(0.5);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [extractedCorrelation, setExtractedCorrelation] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
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
    return () => { abortRef.current?.abort(); };
  }, [API_URL]);
  useEffect(() => {
    if (!description && !result) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ description, baseProbability, confidence, reasoning, extractionMode }));
    } catch {}
  }, [description, baseProbability, confidence, reasoning, extractionMode, result]);
  // ── Analyze ───────────────────────────────────────────────────────────────
  async function analyzeScenario() {
    if (!description.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setExtracting(true);
    setReasoning("");
    setReasoningFresh(false);
    setResult(null);
    setSensitivity(null);
    setDecisionSummary(null);
    setInterpretation(null);
    setStressResult(null);
    setAssumptions(null);
    setDecisionResult(null);
    setAuditResult(null);
    setError("");
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
      setRisk(data.suggested_risk ?? 0);
      setReasoning(data.reasoning);
      setReasoningFresh(true);
      setExtractionMode(data.extraction_mode);
      setExtractionDomain(data.domain ?? "");
      setExtractedRiskFactors(data.risk_factors ?? []);
      if (data.suggested_threshold != null) {
        setDecisionThreshold(data.suggested_threshold);
      }
      if (data.suggested_correlation != null) {
        setExtractedCorrelation(data.suggested_correlation);
      }
      // Assumptions
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
          ad.assumptions.forEach((a) => { w[a.id] = a.weight; });
          setEditedWeights(w);
        }
      } catch {}
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError("Analysis failed. Is your backend running at " + API_URL + "?");
    } finally {
      setExtracting(false);
    }
  }
  // ── Simulate (fixed) ──────────────────────────────────────────────────────
  async function runSimulation() {
    abortRef.current?.abort();
    setSimulating(true);
    setSimulatingStep("Initialising Monte Carlo engine…");
    setDecisionResult(null);
    setAuditResult(null);
    setError("");
    try {
      const res = await fetch(`${API_URL}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          base_probability: baseProbability,
          confidence,
          risk,
          trials: 10000,
          beta_scale: 50,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json(); // SimulationResult
      setResult(data);
      // ── Save a quick base entry immediately so history shows up ──────────
      const entryId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
      const baseEntry = {
        id: entryId,
        description: description.slice(0, 120) + (description.length > 120 ? "…" : ""),
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
          risk: data.risk ?? undefined,
          adjusted_probability: data.adjusted_probability ?? undefined,
        },
        extractionMode,
        timestamp: new Date().toLocaleTimeString(),
        isoDate: new Date().toISOString(),
      };
      saveToHistory(baseEntry);
      setHistory(prev => [baseEntry, ...prev.filter(e => e.id !== entryId)].slice(0, 20));
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
      // ── Enrichment — collect results for later persistence ───────────────
      let sensitivityData = null;
      let stressData = null;
      let interpretationData = null;
      let decisionData = null;
      setSimulatingStep("Computing sensitivity attribution…");
      try {
        const sr = await fetch(`${API_URL}/sensitivity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_probability: baseProbability, confidence, trials: 3000 }),
        });
        if (sr.ok) {
          sensitivityData = await sr.json();
          setSensitivity(sensitivityData);
        }
      } catch {}
      setSimulatingStep("Running stress test…");
      try {
        const str = await fetch(`${API_URL}/stress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_probability: baseProbability, confidence }),
        });
        if (str.ok) {
          stressData = await str.json();
          setStressResult(stressData);
        }
      } catch {}
      setSimulatingStep("Generating risk interpretation…");
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
        if (ir.ok) {
          interpretationData = await ir.json();
          setInterpretation(interpretationData);
        }
      } catch {}
      setSimulatingStep("Generating decision summary…");
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
      setSimulatingStep("Computing decision analysis…");
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
        if (dr.ok) {
          decisionData = await dr.json();
          setDecisionResult(decisionData);
        }
      } catch {}
      // ── AUDIT (v3) ────────────────────────────────────────────────────────
      setSimulatingStep("Auditing result integrity…");
      try {
        const av = await fetch(`${API_URL}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            domain: extractionDomain || "other",
            extraction_mode: extractionMode,
            base_probability: baseProbability,
            confidence,
            suggested_risk: risk,
            mean: data.mean,
            std_dev: data.std_dev,
            confidence_interval_low: data.confidence_interval_low,
            confidence_interval_high: data.confidence_interval_high,
            adjusted_probability: data.adjusted_probability ?? baseProbability * (1 - risk),
            uncertainty_type: data.uncertainty_type ?? "aleatory-dominant",
            aleatory_fraction: data.aleatory_fraction ?? 0.6,
            epistemic_fraction: data.epistemic_fraction ?? 0.4,
            eviu: data.eviu ?? 0,
            rhat: data.rhat ?? 1.0,
          }),
        });
        if (av.ok) setAuditResult(await av.json());
      } catch {}
      // ── BUG 4 FIX: Re-save entry with all enrichment data ────────────────
      const enrichedEntry = {
        ...baseEntry,
        result: {
          ...baseEntry.result,
          // Decision
          decision_action: decisionData?.recommended_action,
          decision_eu_proceed: decisionData?.expected_utility_proceed,
          decision_eu_abandon: decisionData?.expected_utility_abandon,
          decision_regret: decisionData?.expected_regret,
          decision_vpi: decisionData?.vpi,
          decision_break_even: decisionData?.break_even_probability,
          // Sensitivity
          sensitivity_dominant: sensitivityData?.dominant_factor,
          sensitivity_prob_impact: sensitivityData?.probability_impact,
          sensitivity_conf_impact: sensitivityData?.confidence_impact,
          sensitivity_prob_rho: sensitivityData?.probability_sensitivity,
          sensitivity_conf_rho: sensitivityData?.confidence_sensitivity,
          sensitivity_prob_variance_pct: sensitivityData?.attribution?.[0]?.variance_explained_pct,
          sensitivity_conf_variance_pct: sensitivityData?.attribution?.[1]?.variance_explained_pct,
          sensitivity_robustness: sensitivityData?.decision_robustness,
          // Stress
          stress_fragile: stressData?.is_fragile,
          stress_frontier_pp: stressData?.fragility_frontier_pp ?? undefined,
          stress_robust_range_pp: stressData?.robust_range_pp,
          // Risk interpretation
          risk_level: interpretationData?.risk_profile?.level,
          risk_label: interpretationData?.risk_profile?.label,
          risk_headline: interpretationData?.headline,
          risk_action: interpretationData?.action_framing,
          // Copula
          copula_correlation_input: extractedCorrelation ?? undefined,
        },
      };
      saveToHistory(enrichedEntry);
      setHistory(prev =>
        [enrichedEntry, ...prev.filter(e => e.id !== entryId)].slice(0, 20)
      );
    } catch {
      setError("Simulation failed. Verify your backend is running.");
    } finally {
      setSimulating(false);
      setSimulatingStep("");
    }
  }
  // ── Export ────────────────────────────────────────────────────────────────
  function exportJSON(hist: StoredScenario[]) {
    const blob = new Blob([JSON.stringify({
      tool: "Probabilis", version: "3.0",
      exported_at: new Date().toISOString(),
      methodology: {
        distribution: "Beta",
        sampling: "Antithetic variates Monte Carlo (Hammersley & Handscomb, 1964)",
        convergence: "Gelman-Rubin R-hat (Gelman & Rubin, 1992)",
        uncertainty_decomposition: "Der Kiureghian & Ditlevsen (2009)",
      },
      scenarios: hist.map(e => ({ ...e.result, description: e.description, extraction_mode: e.extractionMode })),
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `probabilis-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  }
  async function exportLatex(hist: StoredScenario[]) {
    if (!hist.length) return;
    try {
      const res = await fetch(`${API_URL}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Probabilis Decision Simulation Report",
          author: "Rakibul Islam",
          institution: "Department of Statistics, SUST",
          scenarios: deduplicateForExport(hist).slice(0, 10).map(e => ({
            // ── Core ──────────────────────────────────────────────────────────
            description: e.description,
            base_probability: e.baseProbability,
            confidence: e.confidence,
            mean: e.result.mean,
            std_dev: e.result.std_dev,
            confidence_interval_low: e.result.confidence_interval_low,
            confidence_interval_high:e.result.confidence_interval_high,
            rhat: e.result.rhat ?? 1.0,
            eviu: e.result.eviu ?? 0,
            variance_reduction_pct: e.result.variance_reduction_pct ?? 0,
            uncertainty_type: e.result.uncertainty_type ?? "aleatory-dominant",
            aleatory_fraction: e.result.aleatory_fraction ?? 0.6,
            epistemic_fraction: e.result.epistemic_fraction ?? 0.4,
            extraction_mode: e.extractionMode,
            timestamp: e.timestamp,
            // ── Optional enrichment ───────────────────────────────────────────
            risk: e.result.risk ?? null,
            adjusted_probability: e.result.adjusted_probability ?? null,
            distribution_type: e.result.distribution_type ?? null,
            domain: e.result.domain ?? null,
            // Decision
            decision_action: e.result.decision_action ?? null,
            decision_eu_proceed: e.result.decision_eu_proceed ?? null,
            decision_eu_abandon: e.result.decision_eu_abandon ?? null,
            decision_regret: e.result.decision_regret ?? null,
            decision_vpi: e.result.decision_vpi ?? null,
            decision_break_even: e.result.decision_break_even ?? null,
            // Sensitivity
            sensitivity_dominant: e.result.sensitivity_dominant ?? null,
            sensitivity_prob_impact: e.result.sensitivity_prob_impact ?? null,
            sensitivity_conf_impact: e.result.sensitivity_conf_impact ?? null,
            sensitivity_prob_rho: e.result.sensitivity_prob_rho ?? null,
            sensitivity_conf_rho: e.result.sensitivity_conf_rho ?? null,
            sensitivity_prob_variance_pct: e.result.sensitivity_prob_variance_pct ?? null,
            sensitivity_conf_variance_pct: e.result.sensitivity_conf_variance_pct ?? null,
            sensitivity_robustness: e.result.sensitivity_robustness ?? null,
            // Stress
            stress_fragile: e.result.stress_fragile ?? null,
            stress_frontier_pp: e.result.stress_frontier_pp ?? null,
            stress_robust_range_pp: e.result.stress_robust_range_pp ?? null,
            // Risk interpretation
            risk_level: e.result.risk_level ?? null,
            risk_label: e.result.risk_label ?? null,
            risk_headline: e.result.risk_headline ?? null,
            risk_action: e.result.risk_action ?? null,
            // Copula
            copula_mean: e.result.copula_mean ?? null,
            copula_std: e.result.copula_std ?? null,
            copula_tail_5: e.result.copula_tail_5 ?? null,
            copula_joint_failure: e.result.copula_joint_failure ?? null,
            copula_correlation_effect: e.result.copula_correlation_effect ?? null,
            copula_tail_dependence: e.result.copula_tail_dependence ?? null,
            copula_type: e.result.copula_type ?? null,
            copula_df: e.result.copula_df ?? null,
            copula_risk_factor_names: e.result.copula_risk_factor_names ?? null,
            copula_correlation_input: e.result.copula_correlation_input ?? null,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(
          new Blob([data.latex_source], { type: "text/plain" })
        );
        a.download = `probabilis-report-${new Date().toISOString().split("T")[0]}.tex`;
        a.click();
      }
    } catch {}
  }
  // ── Chart data ────────────────────────────────────────────────────────────
  const liveChartData = buildLocalCurve(baseProbability, confidence);
  const riskInfo = result ? getRiskLabel(result.mean) : null;
  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: "var(--max-w)", margin: "0 auto", padding: `0 var(--gutter) 80px` }}>
        {/* ═══ HEADER ═══ */}
        <header style={{ padding: "36px 0 32px", borderBottom: "1px solid var(--border-subtle)", marginBottom: 40 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 42,
                  fontWeight: 300,
                  fontStyle: "italic",
                  color: "var(--text-white)",
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                Probabilis
              </h1>
              <p style={{ fontFamily: "var(--font-data)", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-ghost)" }}>
                Decision Simulation Under Uncertainty · v3.0
              </p>
            </div>
            <nav style={{ display: "flex", gap: 28, alignItems: "center", paddingBottom: 4 }}>
              <Link href="/model-card" className="nav-link">Model Card</Link>
              <Link href="/api-docs" className="nav-link">API</Link>
              <Link href="/calibration" className="nav-link">Calibration</Link>
            </nav>
          </div>
        </header>
        {/* ═══ SCENARIO INPUT ═══ */}
        <section style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <SectionLabel>Scenario Description</SectionLabel>
            {description.trim() && (
              <span style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-ghost)" }}>
                {description.length} chars
              </span>
            )}
          </div>
          <textarea
            rows={4}
            placeholder="Describe your decision scenario in natural language — include relevant evidence, context, domain specifics, and what outcome you are trying to assess…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyzeScenario();
            }}
          />
          <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-ghost)", marginTop: 6 }}>
            Ctrl+Enter to analyze · More detail = higher accuracy
          </p>
        </section>
        {/* ═══ ANALYZE BUTTON ═══ */}
        <div style={{ display: "flex", gap: 12, marginBottom: 36, alignItems: "center" }}>
          <button
            className="btn-analyze"
            onClick={analyzeScenario}
            disabled={extracting || !description.trim()}
          >
            {extracting ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ animation: "pulse-blue 1s ease infinite" }}>◈</span>
                Extracting uncertainty parameters…
              </span>
            ) : (
              "▷ Analyze with AI"
            )}
          </button>
          {extractionDomain && !extracting && (
            <Badge variant="ghost">
              {DOMAIN_LABELS[extractionDomain] ?? extractionDomain}
            </Badge>
          )}
        </div>
        {/* ═══ ERROR ═══ */}
        {error && (
          <div
            className="animate-fade-in"
            style={{
              marginBottom: 24,
              padding: "12px 16px",
              background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.25)",
              borderLeft: "3px solid var(--risk-critical)",
            }}
          >
            <p style={{ fontFamily: "var(--font-data)", fontSize: 11, color: "var(--risk-critical)", margin: 0 }}>
              ⚠ {error}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Check that your FastAPI backend is running, then retry.
            </p>
          </div>
        )}
        {/* ═══ EXTRACTION OUTPUT ═══ */}
        {reasoning && reasoningFresh && (
          <div className="reasoning-block animate-slide-up" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <SectionLabel>AI Extraction</SectionLabel>
              <ExtractionBadge mode={extractionMode} />
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontStyle: "italic", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
              {reasoning}
            </p>
            {extractedRiskFactors.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {extractedRiskFactors.slice(0, 4).map((rf, i) => (
                  <span key={i} className="badge badge-ghost" style={{ fontSize: 9 }}>
                    {rf.name} · {(rf.probability * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ═══ ASSUMPTIONS AUDIT ═══ */}
        {assumptions && (
          <div style={{ marginBottom: 24 }}>
            <button
              className="collapsible-trigger"
              onClick={() => setShowAssumptions(!showAssumptions)}
            >
              <span>Assumption Audit — {assumptions.assumptions.length} weighted factors</span>
              <span style={{ fontSize: 11, opacity: 0.5 }}>{showAssumptions ? "▴" : "▾"}</span>
            </button>
            {showAssumptions && (
              <div className="card animate-fade-in" style={{ borderTop: "none" }}>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.65 }}>
                  {assumptions.synthesis_note}
                </p>
                {assumptions.assumptions.map((a) => (
                  <div key={a.id} className="assumption-row">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          fontFamily: "var(--font-data)",
                          fontSize: 13,
                          fontWeight: 700,
                          color: a.direction === "positive" ? "var(--risk-strong)" : "var(--risk-critical)",
                        }}>
                          {a.direction === "positive" ? "+" : "−"}
                        </span>
                        <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{a.label}</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: 11, color: "var(--text-muted)" }}>
                        {((editedWeights[a.id] ?? a.weight) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, paddingLeft: 22, lineHeight: 1.5 }}>
                      {a.description}
                    </p>
                    <div style={{ paddingLeft: 22 }}>
                      <input
                        type="range" min={0} max={1} step={0.05}
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
                    assumptions.assumptions.forEach((a) => { w[a.id] = a.weight; });
                    setEditedWeights(w);
                    setBaseProbability(recomputeFromAssumptions(assumptions.assumptions, w));
                  }}
                >
                  ↺ Reset to AI estimate
                </button>
              </div>
            )}
          </div>
        )}
        {/* ═══ PARAMETER CONTROLS ═══ */}
        <section style={{ marginBottom: 32 }}>
          <SectionLabel>Simulation Parameters</SectionLabel>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SliderField
              label="Base Probability"
              subLabel="p₀"
              value={baseProbability}
              min={0.01} max={0.99} step={0.01}
              onChange={setBaseProbability}
              format={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <SliderField
              label="Confidence Level"
              subLabel="c"
              value={confidence}
              min={0.10} max={1} step={0.01}
              onChange={setConfidence}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              note={`α = ${(baseProbability * confidence * 20).toFixed(2)}, β = ${((1 - baseProbability) * confidence * 20).toFixed(2)} — Beta distribution parameters`}
            />
            <div>
              <SliderField
                label="Identified Risk"
                subLabel="p_adj = base × (1 − risk)"
                value={risk}
                min={0} max={0.95} step={0.01}
                onChange={setRisk}
                format={(v) => `${(v * 100).toFixed(0)}%`}
                accentColor={risk > 0.3 ? "var(--risk-high)" : risk > 0.1 ? "var(--risk-moderate)" : "var(--text-white)"}
                note={risk > 0
                  ? `p_adj = ${(baseProbability * (1 - risk) * 100).toFixed(1)}% — auto-extracted from scenario context`
                  : "No external risk detected in description (set manually if needed)"}
              />
            </div>
          </div>
        </section>
        {/* ═══ LIVE PREVIEW ═══ */}
        {!result && (
          <section style={{ marginBottom: 32 }}>
            <SectionLabel>Live Distribution Preview</SectionLabel>
            <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", padding: "16px 8px 8px 8px" }}>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={liveChartData as ChartPoint[]} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gLive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(99,143,203,0.04)" />
                  <XAxis dataKey="probability" tickFormatter={(v) => `${v}%`}
                    tick={{ fill: "var(--text-ghost)", fontSize: 9, fontFamily: "var(--font-data)" }}
                    tickLine={false} axisLine={{ stroke: "var(--border-subtle)" }} />
                  <YAxis tick={{ fill: "var(--text-ghost)", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Area type="monotone" dataKey="density"
                    stroke="var(--blue-glow)" strokeWidth={1.5}
                    fill="url(#gLive)" dot={false} animationDuration={200} />
                </AreaChart>
              </ResponsiveContainer>
              <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-ghost)", textAlign: "center", marginTop: 4, letterSpacing: "0.08em" }}>
                Instant Beta PDF preview — local computation, no API call
              </p>
            </div>
          </section>
        )}
        {/* ═══ RUN BUTTON ═══ */}
        <div style={{ marginBottom: 48 }}>
          <button
            className="btn-primary"
            onClick={runSimulation}
            disabled={simulating}
            style={{ position: "relative", overflow: "hidden", height: 48 }}
          >
            {simulating ? (
              <>
                <div className="scan-overlay"><div className="scan-line" /></div>
                <span style={{ animation: "pulse-blue 1.5s ease infinite" }}>
                  ◈
                </span>
                <span>{simulatingStep || "Running Monte Carlo simulation…"}</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span>Run Simulation — 10,000 Monte Carlo Trials</span>
              </>
            )}
          </button>
          {simulating && (
            <div className="progress-bar" style={{ marginTop: 2 }}>
              <div className="progress-bar__indeterminate" />
            </div>
          )}
        </div>
        {/* ════════════════════════════════════════════════════════════════════
             RESULTS
             ════════════════════════════════════════════════ */}
        {result && (
          <div ref={resultsRef} className="results-section">
            <Divider label="Simulation Results" />
            {/* ── PRIMARY STATS ── */}
            <section style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <SectionLabel>Primary Statistics — {result.trials.toLocaleString()} trials</SectionLabel>
                {riskInfo && <RiskPill label={riskInfo.label} color={riskInfo.color} />}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--border-subtle)" }}>
                <MetricCard
                  label="E[P] mean"
                  value={`${(result.mean * 100).toFixed(2)}%`}
                  color={riskInfo?.color}
                />
                <MetricCard
                  label="σ std dev"
                  value={`±${(result.std_dev * 100).toFixed(2)}%`}
                />
                <MetricCard
                  label="95% CI"
                  value={`${(result.confidence_interval_low * 100).toFixed(1)}–${(result.confidence_interval_high * 100).toFixed(1)}%`}
                  note={`spread: ${((result.confidence_interval_high - result.confidence_interval_low) * 100).toFixed(1)}pp`}
                />
              </div>
              {/* Risk adjustment */}
              {(result.risk ?? 0) > 0.01 && result.adjusted_probability && (
                <div className="animate-fade-in" style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-low)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Risk Adjusted
                  </span>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 13, color: "var(--text-muted)" }}>
                    {(baseProbability * 100).toFixed(0)}%
                  </span>
                  <span style={{ color: "var(--text-ghost)" }}>×</span>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 13, color: "var(--risk-critical)" }}>
                    (1 − {((result.risk ?? 0) * 100).toFixed(0)}%)
                  </span>
                  <span style={{ color: "var(--text-ghost)" }}>=</span>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 15, fontWeight: 700, color: "var(--text-white)" }}>
                    {(result.adjusted_probability * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              {/* Distribution type tag */}
              {result.distribution_type && (
                <div style={{ marginTop: 10 }}>
                  <Badge variant="ghost">
                    {result.distribution_type.toUpperCase()} distribution
                  </Badge>
                </div>
              )}

              {/* ── AUDIT PANEL ── */}
              {auditResult && <AuditPanel result={auditResult} />}
            </section>
            {/* ── RISK INTERPRETATION ── */}
            {interpretation && (
              <section style={{ marginBottom: 28 }} className="animate-slide-up delay-100">
                <SectionLabel>Risk Classification</SectionLabel>
                <div style={{
                  border: `1px solid ${interpretation.risk_profile.color}33`,
                  background: "var(--surface-1)",
                }}>
                  {/* Classification header */}
                  <div style={{
                    padding: "12px 16px",
                    borderBottom: `1px solid ${interpretation.risk_profile.color}22`,
                    background: `${interpretation.risk_profile.color}08`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {/* Score bars */}
                      <div style={{ display: "flex", gap: 3 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} style={{
                            width: 20, height: 3,
                            background: i <= interpretation.risk_profile.score
                              ? interpretation.risk_profile.color
                              : "var(--surface-4)",
                          }} />
                        ))}
                      </div>
                      <span style={{
                        fontFamily: "var(--font-data)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: interpretation.risk_profile.color,
                      }}>
                        {interpretation.risk_profile.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <Badge variant="ghost">{interpretation.confidence_class}</Badge>
                      <Badge variant="ghost">{interpretation.spread_class}</Badge>
                    </div>
                  </div>
                  <div style={{ padding: "16px" }}>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
                      {interpretation.headline}
                    </p>
                    {/* Warnings */}
                    {(interpretation.fragility_warning || interpretation.epistemic_note || interpretation.convergence_note) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                        {interpretation.fragility_warning && (
                          <div style={{ borderLeft: "2px solid var(--risk-high)", paddingLeft: 12 }}>
                            <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--risk-high)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                              Fragility Warning
                            </p>
                            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                              {interpretation.fragility_warning}
                            </p>
                          </div>
                        )}
                        {interpretation.epistemic_note && (
                          <div style={{ borderLeft: "2px solid var(--amber)", paddingLeft: 12 }}>
                            <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--amber)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                              Epistemic Opportunity
                            </p>
                            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                              {interpretation.epistemic_note}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                      <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>
                        Recommended Action
                      </p>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {interpretation.action_framing}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}
            {/* ── DIAGNOSTICS ── */}
            <section style={{ marginBottom: 28 }} className="animate-slide-up delay-200">
              <SectionLabel>Diagnostic Statistics</SectionLabel>
              <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-low)" }}>
                {[
                  {
                    key: "Gelman-Rubin R̂",
                    val: result.rhat ? <ConvergenceDot rhat={result.rhat} /> : "—",
                    note: result.converged != null ? (result.converged ? "converged" : "⚠ review") : "—",
                    tip: "Split-chain R-hat. Values below 1.01 indicate full convergence across 4 parallel chains.",
                  },
                  {
                    key: "Variance reduction",
                    val: result.variance_reduction_pct != null ? `${result.variance_reduction_pct.toFixed(1)}%` : "—",
                    note: "antithetic variates",
                    tip: "Estimator variance reduction vs naive Monte Carlo (Hammersley & Handscomb, 1964).",
                  },
                  {
                    key: "EVIU",
                    val: result.eviu?.toFixed(5) ?? "—",
                    note: result.eviu != null ? (result.eviu > 0.02 ? "distribution adds value" : "point estimate sufficient") : "—",
                    tip: "Expected Value of Including Uncertainty — decision quality gain from using the distribution over the point estimate.",
                  },
                  {
                    key: "Uncertainty type",
                    val: result.uncertainty_type === "epistemic-dominant" ? "EPISTEMIC" : "ALEATORY",
                    note: result.epistemic_fraction != null ? `${(result.epistemic_fraction * 100).toFixed(0)}% reducible` : "—",
                    tip: "Epistemic uncertainty is reducible via information gathering. Aleatory is irreducible inherent randomness.",
                  },
                ].map((row) => (
                  <div key={row.key} className="tooltip-wrap diag-row" style={{ padding: "10px 16px" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--text-secondary)" }}>
                      {row.key}
                    </span>
                    {typeof row.val === "string" ? (
                      <span style={{ fontFamily: "var(--font-data)", fontSize: 14, fontWeight: 700, color: "var(--text-white)", textAlign: "center" }}>
                        {row.val}
                      </span>
                    ) : (
                      <div style={{ textAlign: "center" }}>{row.val}</div>
                    )}
                    <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)", textAlign: "right", letterSpacing: "0.06em" }}>
                      {row.note}
                    </span>
                    <div className="tooltip-content" style={{ width: 260, whiteSpace: "normal", textAlign: "left" }}>
                      {row.tip}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            {/* ── UNCERTAINTY DECOMPOSITION ── */}
            {result.aleatory_fraction != null && result.epistemic_fraction != null && (
              <section style={{ marginBottom: 28 }} className="animate-slide-up delay-300">
                <SectionLabel>Uncertainty Decomposition — Der Kiureghian & Ditlevsen (2009)</SectionLabel>
                <div className="card">
                  {/* Stacked bar */}
                  <div style={{ display: "flex", height: 3, marginBottom: 12, overflow: "hidden", gap: 1 }}>
                    <div style={{ flex: result.aleatory_fraction, background: "var(--text-muted)", transition: "flex 600ms var(--ease-out)" }} />
                    <div style={{ flex: result.epistemic_fraction, background: "var(--blue-bright)", opacity: 0.8, transition: "flex 600ms var(--ease-out)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                      ALEATORY {(result.aleatory_fraction * 100).toFixed(0)}% — irreducible
                    </span>
                    <span style={{
                      fontFamily: "var(--font-data)", fontSize: 10, letterSpacing: "0.06em",
                      color: result.uncertainty_type === "epistemic-dominant" ? "var(--blue-bright)" : "var(--text-muted)",
                    }}>
                      EPISTEMIC {(result.epistemic_fraction * 100).toFixed(0)}% — reducible
                    </span>
                  </div>
                  <Badge variant={result.uncertainty_type === "epistemic-dominant" ? "blue" : "ghost"}>
                    {result.uncertainty_type === "epistemic-dominant" ? "Epistemic-dominant" : "Aleatory-dominant"}
                  </Badge>
                  <p style={{
                    fontFamily: "var(--font-display)", fontSize: 12, fontStyle: "italic", lineHeight: 1.65,
                    color: result.uncertainty_type === "epistemic-dominant" ? "var(--text-secondary)" : "var(--text-muted)",
                    marginTop: 12,
                  }}>
                    {result.uncertainty_type === "epistemic-dominant"
                      ? "↳ Dominant uncertainty is knowledge-based and reducible. Expert consultation, pilot testing, or data collection would meaningfully tighten this estimate."
                      : "↳ Dominant uncertainty is inherent randomness. Additional information is unlikely to substantially narrow this distribution's spread."}
                  </p>
                </div>
              </section>
            )}
            {/* ── SENSITIVITY ── */}
            {sensitivity && (
              <section style={{ marginBottom: 28 }} className="animate-slide-up delay-300">
                <SectionLabel>Sensitivity Analysis — Spearman Rank Correlation</SectionLabel>
                <div className="card">
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {[
                      {
                        label: "Base probability (p₀)",
                        rho: sensitivity.probability_sensitivity,
                        impact: `${(sensitivity.probability_impact * 100).toFixed(1)}pp range on E[P]`,
                        pct: sensitivity.attribution?.[0]?.variance_explained_pct,
                      },
                      {
                        label: "Confidence level (c)",
                        rho: sensitivity.confidence_sensitivity,
                        impact: `${(sensitivity.confidence_impact * 100).toFixed(1)}pp range on σ`,
                        pct: sensitivity.attribution?.[1]?.variance_explained_pct,
                      },
                    ].map((item) => (
                      <div key={item.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--text-secondary)" }}>
                            {item.label}
                          </span>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {item.pct !== undefined && (
                              <span style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-ghost)" }}>
                                {item.pct.toFixed(0)}% variance
                              </span>
                            )}
                            <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)" }}>
                              {item.impact}
                            </span>
                          </div>
                        </div>
                        <div style={{ background: "var(--surface-3)", height: 2, position: "relative" }}>
                          <div style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${item.rho * 100}%`,
                            background: "var(--blue-glow)",
                            transition: "width 700ms var(--ease-out)",
                          }} />
                        </div>
                        <p style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-ghost)", marginTop: 5, textAlign: "right" }}>
                          ρ = {item.rho.toFixed(4)}
                        </p>
                      </div>
                    ))}
                  </div>
                  {sensitivity.recommended_focus && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
                      <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>
                        Focus Recommendation
                      </p>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>
                        {sensitivity.recommended_focus}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}
            {/* ── DECISION ANALYSIS ── */}
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
                        base_probability: result.adjusted_probability ?? baseProbability,
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
            {/* ── STRESS TEST ── */}
            {stressResult && (
              <section style={{ marginBottom: 28 }} className="animate-slide-up delay-400">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <SectionLabel>Assumption Stress Test — ±15pp shift</SectionLabel>
                  {stressResult.is_fragile && stressResult.fragility_frontier_pp && (
                    <Badge variant="red">Fragile ±{stressResult.fragility_frontier_pp}pp</Badge>
                  )}
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${stressResult.stress_points.length}, 1fr)`,
                  gap: 1,
                  background: "var(--border-subtle)",
                }}>
                  {stressResult.stress_points.map((pt) => {
                    const c = RISK_COLORS[pt.risk_category] ?? "#666";
                    const isBase = pt.shift_pp === 0;
                    return (
                      <div
                        key={pt.shift_pp}
                        className="stress-cell"
                        style={{
                          background: isBase ? `${c}12` : "var(--surface-1)",
                          borderBottom: isBase ? `2px solid ${c}` : "2px solid transparent",
                        }}
                      >
                        <p style={{ fontFamily: "var(--font-data)", fontSize: 9, fontWeight: 700, color: c, margin: 0 }}>
                          {pt.shift_pp > 0 ? "+" : ""}{pt.shift_pp}pp
                        </p>
                        <p style={{ fontFamily: "var(--font-data)", fontSize: 12, color: isBase ? "var(--text-white)" : "var(--text-secondary)", margin: "3px 0 0" }}>
                          {(pt.mean * 100).toFixed(0)}%
                        </p>
                        <p style={{ fontFamily: "var(--font-data)", fontSize: 8, color: "var(--text-ghost)", margin: "2px 0 0", letterSpacing: "0.06em" }}>
                          {pt.risk_category}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 12, fontStyle: "italic", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.6 }}>
                  {stressResult.is_fragile
                    ? `Risk category shifts at ±${stressResult.fragility_frontier_pp}pp. Validate the core probability assumption before acting.`
                    : `Category stable across ±${stressResult.robust_range_pp}pp. Estimate is robust to moderate assumption errors.`}
                </p>
              </section>
            )}
            {/* ── PIN / COMPARE ── */}
            <section style={{ marginBottom: 28 }}>
              {!pinnedResult ? (
                <button
                  className="btn-outline"
                  style={{ width: "100%" }}
                  onClick={() => { setPinnedResult(result); setPinnedDescription(description.slice(0, 60) + "…"); }}
                >
                  ⊕ Pin as Scenario A — change inputs to compare distributions
                </button>
              ) : (
                <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>Scenario A Pinned</p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{pinnedDescription}</p>
                  </div>
                  <button className="btn-ghost" onClick={() => { setPinnedResult(null); setPinnedDescription(""); }}>✕ Clear</button>
                </div>
              )}
            </section>
            {/* ── DISTRIBUTION CHART ── */}
            <section style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
                <SectionLabel>{pinnedResult ? "Scenario Comparison" : "Probability Distribution"}</SectionLabel>
                {pinnedResult && (
                  <div style={{ display: "flex", gap: 16, marginBottom: 0 }}>
                    {[
                      { label: "A", mean: pinnedResult.mean, color: "var(--text-muted)" },
                      { label: "B", mean: result.mean, color: "var(--blue-bright)" },
                    ].map(s => (
                      <span key={s.label} style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)" }}>
                        <span style={{ color: s.color }}>■</span> {s.label}: {(s.mean * 100).toFixed(1)}%
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ background: "var(--surface-1)", border: "1px solid var(--border-low)", padding: "16px 8px 8px 8px" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={(pinnedResult ? buildComparisonData(pinnedResult, result) : liveChartData) as ChartPoint[]}
                    margin={{ top: 4, right: 8, left: -24, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6b7280" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#6b7280" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(99,143,203,0.04)" />
                    <XAxis
                      dataKey={pinnedResult ? "x" : "probability"}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fill: "var(--text-ghost)", fontSize: 9, fontFamily: "var(--font-data)" }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--border-subtle)" }}
                    />
                    <YAxis tick={{ fill: "var(--text-ghost)", fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface-3)",
                        border: "1px solid var(--border-mid)",
                        fontFamily: "var(--font-data)",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        borderRadius: 0,
                      }}
                      labelFormatter={(v) => `p = ${v}%`}
                      formatter={(v) => [typeof v === "number" ? v.toFixed(3) : "0.000", "density"]}
                    />
                    {/* Risk zone shading */}
                    <ReferenceArea x1={0} x2={25} fill={RISK_COLORS.critical} fillOpacity={0.05} />
                    <ReferenceArea x1={25} x2={50} fill={RISK_COLORS.high} fillOpacity={0.05} />
                    <ReferenceArea x1={50} x2={75} fill={RISK_COLORS.moderate} fillOpacity={0.05} />
                    <ReferenceArea x1={75} x2={100} fill={RISK_COLORS.favorable} fillOpacity={0.05} />
                    {/* Mean reference line */}
                    <ReferenceLine
                      x={pinnedResult ? Math.round(pinnedResult.mean * 100) : Math.round(result.mean * 100)}
                      stroke="var(--text-muted)"
                      strokeDasharray="4 4"
                      label={{ value: pinnedResult ? "A" : "μ", fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-data)" }}
                    />
                    {pinnedResult && (
                      <ReferenceLine
                        x={Math.round(result.mean * 100)}
                        stroke="var(--blue-glow)"
                        strokeDasharray="4 4"
                        label={{ value: "B", fill: "var(--blue-glow)", fontSize: 10, fontFamily: "var(--font-data)" }}
                      />
                    )}
                    <Area type="monotone" dataKey={pinnedResult ? "densityA" : "density"}
                      stroke="#6b7280" strokeWidth={1.5} fill="url(#gA)" dot={false} animationDuration={300} />
                    {pinnedResult && (
                      <Area type="monotone" dataKey="densityB"
                        stroke="var(--blue-glow)" strokeWidth={1.5} fill="url(#gB)" dot={false} animationDuration={300} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
                {/* Zone legend */}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
                  {[
                    { label: "Critical 0–25%", color: RISK_COLORS.critical },
                    { label: "High 25–50%", color: RISK_COLORS.high },
                    { label: "Moderate 50–75%", color: RISK_COLORS.moderate },
                    { label: "Strong 75–100%", color: RISK_COLORS.favorable },
                  ].map(z => (
                    <span key={z.label} style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-ghost)", letterSpacing: "0.04em" }}>
                      <span style={{ color: z.color }}>■</span> {z.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>
            {/* ── PORTFOLIO ADD ── */}
            <section style={{ marginBottom: 20 }}>
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
                  setPortfolio(p => [...p.slice(0, 3), entry]);
                  setPortfolioResult(null);
                }}
              >
                ⊕ Add to Portfolio Analysis {portfolio.length > 0 ? `(${portfolio.length}/4)` : ""}
              </button>
            </section>
            {/* ── COPULA PANEL ── */}
            <CopulaPanel apiUrl={API_URL} baseProbability={baseProbability} initialFactors={extractedRiskFactors} initialCorrelation={extractedCorrelation} />
            {/* ── DECISION SUMMARY ── */}
            {decisionSummary && (
              <section style={{ marginBottom: 28 }} className="animate-slide-up delay-500">
                <SectionLabel>Decision Summary</SectionLabel>
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontStyle: "italic", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                    {decisionSummary.summary}
                  </p>
                  <div style={{ borderLeft: "2px solid var(--amber)", paddingLeft: 14 }}>
                    <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--amber)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>
                      Key Uncertainty Insight
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>
                      {decisionSummary.key_insight}
                    </p>
                  </div>
                  <div style={{ borderLeft: "2px solid var(--border-mid)", paddingLeft: 14 }}>
                    <p style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>
                      Decision Framing
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>
                      {decisionSummary.decision_framing}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
        {/* ═══ EMPTY STATE ═══ */}
        {!result && !simulating && !extracting && !error && (
          <WelcomeState />
        )}
        <Divider />
        {/* ═══ HISTORY ═══ */}
        {history.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <SectionLabel>Scenario History ({history.length})</SectionLabel>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {(() => {
                  const dupeCount = history.length - deduplicateForExport(history).length;
                  return dupeCount > 0 ? (
                    <span style={{
                      fontFamily: "var(--font-data)", fontSize: 9,
                      color: "var(--amber)", letterSpacing: "0.08em",
                    }}>
                      {dupeCount} duplicate{dupeCount > 1 ? "s" : ""} — PDF will deduplicate
                    </span>
                  ) : null;
                })()}
                <button className="btn-ghost" onClick={() => exportJSON(history)}>↓ JSON</button>
                <button className="btn-ghost" onClick={() => exportLatex(history)}>↓ LaTeX</button>
                <button className="btn-ghost" onClick={() => { localStorage.removeItem(HISTORY_KEY); setHistory([]); }}>✕ Clear</button>
              </div>
            </div>
            <div style={{ border: "1px solid var(--border-subtle)" }}>
              {/* Header */}
              <div className="history-row" style={{ cursor: "default", borderBottom: "1px solid var(--border-low)", background: "var(--surface-1)" }}>
                {["Time", "Scenario", "E[P]", "σ"].map(h => (
                  <span key={h} style={{ fontFamily: "var(--font-data)", fontSize: 9, color: "var(--text-ghost)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    {h}
                  </span>
                ))}
              </div>
              {history.map((entry, i) => (
                <div
                  key={entry.id}
                  className="history-row"
                  onClick={() => {
                    setDescription(entry.description.replace(/…$/, ""));
                    setBaseProbability(entry.baseProbability);
                    setConfidence(entry.confidence);
                  }}
                >
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-ghost)" }}>
                    {entry.timestamp}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.description}
                  </span>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 13, fontWeight: 700, color: "var(--text-white)" }}>
                    {((entry.result?.mean ?? 0) * 100).toFixed(1)}%
                  </span>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 11, color: "var(--text-muted)" }}>
                    ±{((entry.result?.std_dev ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        {/* ═══ PORTFOLIO ═══ */}
        {portfolio.length >= 2 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <SectionLabel>Portfolio Analysis — {portfolio.length} scenarios</SectionLabel>
              <div style={{ display: "flex", gap: 14 }}>
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
                  ▷ Analyse
                </button>
                <button className="btn-ghost" onClick={() => { setPortfolio([]); setPortfolioResult(null); }}>✕ Clear</button>
              </div>
            </div>
            <div style={{ border: "1px solid var(--border-subtle)" }}>
              {portfolio.map((s, i) => (
                <div key={i} className="portfolio-row">
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)" }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.description}
                  </span>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: 13, fontWeight: 700, color: "var(--text-white)", textAlign: "right" }}>
                    {(s.mean * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
              {portfolioResult && (
                <div style={{ padding: "16px", borderTop: "1px solid var(--border-mid)", background: "var(--surface-1)" }}>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 13, fontStyle: "italic", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
                    {portfolioResult.recommendation_basis}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {portfolioResult.ranked_labels.map((label) => {
                      const s = portfolio.find(x => x.label === label);
                      return (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontFamily: "var(--font-data)", fontSize: 16, fontWeight: 700, color: portfolioResult.ranked_labels.indexOf(label) === 0 ? "var(--text-white)" : "var(--text-muted)", width: 20 }}>
                            {portfolioResult.ranked_labels.indexOf(label) + 1}
                          </span>
                          <span style={{ fontFamily: "var(--font-data)", fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
                            {label} — {s?.description}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {label === portfolioResult.highest_upside && <Badge variant="green">Upside</Badge>}
                            {label === portfolioResult.lowest_downside && label !== portfolioResult.highest_upside && <Badge variant="ghost">Floor</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {portfolioResult.dominance_pairs.some(p => p.dominates) && (
                    <p style={{ fontFamily: "var(--font-data)", fontSize: 10, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 }}>
                      Stochastic dominance: {portfolioResult.dominance_pairs.filter(p => p.dominates).map(p => `${p.scenario_a} ≻ ${p.scenario_b}`).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
        {/* ═══ FOOTER ═══ */}
        <footer className="site-footer">
          <Link href="/model-card" className="nav-link">Model Card</Link>
          <span style={{ width: 1, height: 12, background: "var(--border-subtle)" }} />
          <Link href="/api-docs" className="nav-link">API Reference</Link>
          <span style={{ width: 1, height: 12, background: "var(--border-subtle)" }} />
          <Link href="/calibration" className="nav-link">Calibration Tracker</Link>
        </footer>
      </div>
    </main>
  );
}