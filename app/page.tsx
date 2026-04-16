"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { buildLocalCurve } from "@/lib/betaPdf";
import { saveToHistory, StoredScenario } from "@/lib/storage";

// ── Types ──────────────────────────────────────────────────────────────────

type ExtractionResult = {
  suggested_probability: number;
  suggested_confidence: number;
  reasoning: string;
  extraction_mode: string;
};

type ChartPoint = {
  x?: number;
  probability?: number;
  density?: number;
  densityA?: number;
  densityB?: number;
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
  aleatory_variance?: number;
  epistemic_variance?: number;
  aleatory_fraction?: number;
  epistemic_fraction?: number;
  uncertainty_type?: string;
  eviu?: number;
};

type SensitivityResult = {
  probability_sensitivity: number;
  confidence_sensitivity: number;
  prob_output_low: number;
  prob_output_high: number;
  conf_output_low: number;
  conf_output_high: number;
  dominant_factor: string;
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
  probability: number;
  mean: number;
  ci_low: number;
  ci_high: number;
  risk_category: string;
};

type StressResult = {
  base_mean: number;
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
  portfolio_spread: number;
  recommendation_basis: string;
  highest_upside: string;
  lowest_downside: string;
};

// ── Utilities ──────────────────────────────────────────────────────────────

function interpolateDensity(
  xPct: number,
  histX: number[],
  histY: number[]
): number {
  const xProb = xPct / 100;
  const margin = ((histX[histX.length - 1] - histX[0]) / histX.length) * 2;
  if (
    xProb < histX[0] - margin ||
    xProb > histX[histX.length - 1] + margin
  )
    return 0;
  for (let i = 0; i < histX.length - 1; i++) {
    if (xProb >= histX[i] && xProb <= histX[i + 1]) {
      const t = (xProb - histX[i]) / (histX[i + 1] - histX[i]);
      return histY[i] * (1 - t) + histY[i + 1] * t;
    }
  }
  return 0;
}

function buildComparisonData(
  resultA: SimulationResult,
  resultB: SimulationResult | null
) {
  return Array.from({ length: 101 }, (_, xPct) => ({
    x: xPct,
    densityA: interpolateDensity(xPct, resultA.histogram_x, resultA.histogram_y),
    densityB: resultB
      ? interpolateDensity(xPct, resultB.histogram_x, resultB.histogram_y)
      : undefined,
  }));
}

function recomputeFromAssumptions(
  list: Assumption[],
  weights: Record<string, number>
): number {
  let prob = 0.5;
  list.forEach((a) => {
    const w = weights[a.id] ?? a.weight;
    prob += a.direction === "positive" ? w * 0.12 : -(w * 0.12);
  });
  return Math.max(0.05, Math.min(0.95, Math.round(prob * 100) / 100));
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Home() {
  const SESSION_KEY = "probabilis_session_v1";
  const HISTORY_KEY = "probabilis_history_v1";

  const API_URL = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_API_URL;
    if (!url) return "https://web-production-810f7.up.railway.app";
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }, []);

  // ── State ────────────────────────────────────────────────────────────────
  const [description, setDescription] = useState<string>("");
  const [baseProbability, setBaseProbability] = useState<number>(0.5);
  const [confidence, setConfidence] = useState<number>(0.5);
  const [reasoning, setReasoning] = useState<string>("");
  const [extractionMode, setExtractionMode] = useState<string>("");
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

  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Restore session + history on mount ───────────────────────────────────
  useEffect(() => {
    try {
      const rawSession = localStorage.getItem(SESSION_KEY);
      if (rawSession) {
        const s = JSON.parse(rawSession);
        setDescription(s.description ?? "");
        setBaseProbability(s.baseProbability ?? 0.5);
        setConfidence(s.confidence ?? 0.5);
        // Reasoning is intentionally NOT restored — reasoningFresh gate prevents
        // the AI interpretation box from appearing on return from model-card.
        setExtractionMode(s.extractionMode ?? "");
      }
    } catch {}

    try {
      const rawHistory = localStorage.getItem(HISTORY_KEY);
      setHistory(rawHistory ? JSON.parse(rawHistory) : []);
    } catch {
      setHistory([]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save session on relevant state changes ───────────────────────────────
  useEffect(() => {
    if (!description && !result) return;
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ description, baseProbability, confidence, reasoning, extractionMode })
      );
    } catch {}
  }, [description, baseProbability, confidence, reasoning, extractionMode, result, SESSION_KEY]);

  // ── Wake Railway on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/health`).catch(() => {});
  }, [API_URL]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Analyze ──────────────────────────────────────────────────────────────
  async function analyzeScenario() {
    if (!description.trim()) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setExtracting(true);
    setAnalyzeStatus("Connecting to AI...");
    setReasoning("");
    setReasoningFresh(false);
    setResult(null);
    setSensitivity(null);
    setDecisionSummary(null);
    setInterpretation(null);
    setStressResult(null);
    setAssumptions(null);
    setError("");

    const statusTimer = setTimeout(
      () => setAnalyzeStatus("Analyzing uncertainty signals..."),
      1500
    );

    try {
      const res = await fetch(`${API_URL}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: ExtractionResult = await res.json();

      setBaseProbability(data.suggested_probability);
      setConfidence(data.suggested_confidence);
      setReasoning(data.reasoning);
      setReasoningFresh(true);
      setExtractionMode(data.extraction_mode);

      // Assumptions — sequential after extraction settles
      try {
        const assumpRes = await fetch(`${API_URL}/assumptions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description }),
          signal: controller.signal,
        });
        if (assumpRes.ok) {
          const assumpData: AssumptionsResult = await assumpRes.json();
          setAssumptions(assumpData);
          const w: Record<string, number> = {};
          assumpData.assumptions.forEach((a) => {
            w[a.id] = a.weight;
          });
          setEditedWeights(w);
        }
      } catch {}
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Analysis failed. Check your backend is running.");
      }
    } finally {
      clearTimeout(statusTimer);
      setAnalyzeStatus("");
      setExtracting(false);
    }
  }

  // ── Simulate ─────────────────────────────────────────────────────────────
  async function runSimulation() {
    abortControllerRef.current?.abort();
    setSimulating(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          base_probability: baseProbability,
          confidence,
          trials: 10000,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: SimulationResult = await res.json();
      setResult(data);

      // Save to history — unique ID prevents duplicate key React warning
      const entry: StoredScenario = {
        id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
        description:
          description.slice(0, 120) + (description.length > 120 ? "..." : ""),
        baseProbability,
        confidence,
        result: {
          mean: data.mean,
          std_dev: data.std_dev,
          confidence_interval_low: data.confidence_interval_low,
          confidence_interval_high: data.confidence_interval_high,
          trials: data.trials,
          rhat: data.rhat ?? 1.0,
          eviu: data.eviu ?? 0,
          uncertainty_type: data.uncertainty_type ?? "aleatory-dominant",
          variance_reduction_pct: data.variance_reduction_pct ?? 0,
        },
        extractionMode,
        timestamp: new Date().toLocaleTimeString(),
        isoDate: new Date().toISOString(),
      };

      const updatedHistory = [entry, ...history].slice(0, 20);
      saveToHistory(entry);
      setHistory(updatedHistory);

      // Enrichment calls — sequential to prevent simultaneous setState storms
      try {
        const sensitivityRes = await fetch(`${API_URL}/sensitivity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base_probability: baseProbability,
            confidence,
            trials: 3000,
          }),
        });
        if (sensitivityRes.ok) setSensitivity(await sensitivityRes.json());
      } catch {}

      try {
        const stressRes = await fetch(`${API_URL}/stress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base_probability: baseProbability,
            confidence,
          }),
        });
        if (stressRes.ok) setStressResult(await stressRes.json());
      } catch {}

      try {
        const interpRes = await fetch(`${API_URL}/interpret`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            mean: data.mean,
            std_dev: data.std_dev,
            confidence_interval_low: data.confidence_interval_low,
            confidence_interval_high: data.confidence_interval_high,
            rhat: data.rhat ?? 1.0,
            eviu: data.eviu ?? 0,
            uncertainty_type: data.uncertainty_type ?? "aleatory-dominant",
            aleatory_fraction: data.aleatory_fraction ?? 0.6,
            epistemic_fraction: data.epistemic_fraction ?? 0.4,
          }),
        });
        if (interpRes.ok) setInterpretation(await interpRes.json());
      } catch {}

      try {
        const summRes = await fetch(`${API_URL}/summarize`, {
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
        if (summRes.ok) setDecisionSummary(await summRes.json());
      } catch {}
    } catch {
      setError("Simulation failed. Check your backend connection.");
    } finally {
      setSimulating(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const liveChartData = buildLocalCurve(baseProbability, confidence);

  function exportSessionJSON(hist: StoredScenario[]) {
    const payload = {
      tool: "Probabilis",
      version: "1.0",
      exported_at: new Date().toISOString(),
      methodology: {
        distribution: "Beta",
        sampling: "Monte Carlo with antithetic variates (Hammersley & Handscomb, 1964)",
        convergence: "Gelman-Rubin R-hat (Gelman & Rubin, 1992)",
        uncertainty_decomposition: "Der Kiureghian & Ditlevsen (2009)",
      },
      scenarios: hist.map((e) => ({
        description: e.description,
        base_probability: e.baseProbability,
        confidence: e.confidence,
        mean: e.result.mean,
        std_dev: e.result.std_dev,
        confidence_interval_low: e.result.confidence_interval_low,
        confidence_interval_high: e.result.confidence_interval_high,
        trials: e.result.trials,
        rhat: e.result.rhat,
        eviu: e.result.eviu,
        uncertainty_type: e.result.uncertainty_type,
        variance_reduction_pct: e.result.variance_reduction_pct,
        extraction_mode: e.extractionMode,
        timestamp: e.timestamp,
        iso_date: e.isoDate,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `probabilis-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportLatex(hist: StoredScenario[]) {
    if (hist.length === 0) return;
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
            aleatory_fraction: 0.6,
            epistemic_fraction: 0.4,
            extraction_mode: e.extractionMode,
            timestamp: e.timestamp,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([data.latex_source], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `probabilis-report-${new Date().toISOString().split("T")[0]}.tex`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {}
  }

  function clearAllHistory() {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen p-8" style={{ background: "var(--background)" }}>
      <div className="max-w-2xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-10">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Probabilis
          </h1>
          <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
            Describe a decision. We model its uncertainty.
          </p>
        </div>

        {/* ── Scenario Input ──────────────────────────────────────────────── */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Scenario
          </label>
          <textarea
            className="w-full border rounded-lg p-3 resize-none focus:outline-none"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
            placeholder="e.g. I'm launching a new SaaS product next month. The market is competitive but we have early waitlist signups and good feedback from beta users."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>

        <button
          onClick={analyzeScenario}
          disabled={extracting || !description.trim()}
          className="mb-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                     text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {extracting
            ? analyzeStatus || "Analyzing..."
            : "Analyze with AI"}
        </button>

        {analyzeStatus && !extracting && (
          <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
            {analyzeStatus}
          </p>
        )}

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-6 p-3 rounded-lg text-sm border"
               style={{ background: "#450a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* ── AI Interpretation — only shows after active Analyze click ─── */}
        {reasoning && reasoningFresh && (
          <div
            className="mb-6 p-4 rounded-lg border"
            style={{ background: "var(--surface-1)", borderColor: "var(--accent-blue-dim)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--accent-blue)" }}
              >
                AI Interpretation
              </p>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                  extractionMode.startsWith("ai")
                    ? "bg-green-900/50 text-green-400 border-green-800"
                    : "bg-yellow-900/50 text-yellow-400 border-yellow-800"
                }`}
              >
                {extractionMode.startsWith("ai") ? "⚡ Llama 3.3" : "📐 Linguistic"}
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {reasoning}
            </p>
          </div>
        )}

        {/* ── Assumption Audit ────────────────────────────────────────────── */}
        {assumptions && (
          <div className="mb-6">
            <button
              onClick={() => setShowAssumptions(!showAssumptions)}
              className="flex items-center gap-2 text-xs hover:opacity-80 transition-opacity mb-2"
              style={{ color: "var(--text-label)" }}
            >
              <span>{showAssumptions ? "▼" : "▶"}</span>
              <span className="uppercase tracking-wider">
                Assumption Audit — {assumptions.assumptions.length} factors identified
              </span>
            </button>

            {showAssumptions && (
              <div
                className="rounded-lg border p-4 space-y-4"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {assumptions.synthesis_note} Adjust weights to see how they affect the
                  probability estimate.
                </p>

                {assumptions.assumptions.map((a) => (
                  <div key={a.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold ${
                            a.direction === "positive" ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {a.direction === "positive" ? "+" : "−"}
                        </span>
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          {a.label}
                        </span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        {((editedWeights[a.id] ?? a.weight) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs pl-4" style={{ color: "var(--text-muted)" }}>
                      {a.description}
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={editedWeights[a.id] ?? a.weight}
                      onChange={(e) => {
                        const newW = {
                          ...editedWeights,
                          [a.id]: parseFloat(e.target.value),
                        };
                        setEditedWeights(newW);
                        setBaseProbability(
                          recomputeFromAssumptions(assumptions.assumptions, newW)
                        );
                      }}
                      className="w-full"
                      style={{
                        accentColor:
                          a.direction === "positive" ? "#34d399" : "#f87171",
                      }}
                    />
                  </div>
                ))}

                <button
                  onClick={() => {
                    const w: Record<string, number> = {};
                    assumptions.assumptions.forEach((a) => {
                      w[a.id] = a.weight;
                    });
                    setEditedWeights(w);
                    setBaseProbability(
                      recomputeFromAssumptions(assumptions.assumptions, w)
                    );
                  }}
                  className="text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  ↺ Reset to AI estimate
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Sliders ─────────────────────────────────────────────────────── */}
        <div className="space-y-5 mb-8">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                Base Probability
              </span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>
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
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                Confidence in Estimate
              </span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>
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
              className="w-full accent-blue-500"
            />
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Lower confidence = wider distribution = more uncertainty
            </p>
          </div>
        </div>

        {/* ── Run Simulation button ───────────────────────────────────────── */}
        <button
          onClick={runSimulation}
          disabled={simulating}
          className="w-full mb-8 bg-white text-gray-950 hover:bg-gray-100 disabled:opacity-40
                     disabled:cursor-not-allowed font-semibold py-2.5 rounded-lg transition-colors"
        >
          {simulating ? "Running 10,000 trials..." : "Run Simulation"}
        </button>

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-4">

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  value: `${(result.mean * 100).toFixed(1)}%`,
                  label: "Mean",
                },
                {
                  value: `±${(result.std_dev * 100).toFixed(1)}%`,
                  label: "Std Dev",
                },
                {
                  value: `${(result.confidence_interval_low * 100).toFixed(1)}% – ${(result.confidence_interval_high * 100).toFixed(1)}%`,
                  label: "95% CI",
                  small: true,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-lg p-4 text-center border"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                >
                  <p
                    className={`font-bold text-white ${card.small ? "text-sm mt-1" : "text-2xl"}`}
                  >
                    {card.value}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {card.label}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Risk Interpretation Card ─────────────────────────────────── */}
            {interpretation && (
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: interpretation.risk_profile.color + "44" }}
              >
                {/* Header */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ background: interpretation.risk_profile.color + "18" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full transition-all"
                          style={{
                            background:
                              i <= interpretation.risk_profile.score
                                ? interpretation.risk_profile.color
                                : "var(--surface-3)",
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: interpretation.risk_profile.color }}
                    >
                      {interpretation.risk_profile.label}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{ background: "var(--surface-2)" }}
                    >
                      {interpretation.confidence_class} confidence
                    </span>
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{ background: "var(--surface-2)" }}
                    >
                      {interpretation.spread_class} spread
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div
                  className="px-4 py-4 space-y-3"
                  style={{ background: "var(--surface-1)" }}
                >
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {interpretation.headline}
                  </p>

                  {interpretation.fragility_warning && (
                    <div className="pl-3 border-l-2" style={{ borderColor: "#f97316" }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: "#f97316" }}>
                        ⚠ FRAGILITY WARNING
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {interpretation.fragility_warning}
                      </p>
                    </div>
                  )}

                  {interpretation.epistemic_note && (
                    <div className="pl-3 border-l-2" style={{ borderColor: "#fbbf24" }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: "#fbbf24" }}>
                        ◈ EPISTEMIC OPPORTUNITY
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {interpretation.epistemic_note}
                      </p>
                    </div>
                  )}

                  {interpretation.convergence_note && (
                    <div className="pl-3 border-l-2 border-red-700">
                      <p className="text-xs font-semibold mb-1 text-red-400">
                        ◉ CONVERGENCE FLAG
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {interpretation.convergence_note}
                      </p>
                    </div>
                  )}

                  <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Recommended Action
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {interpretation.action_framing}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Statistical Diagnostics ──────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-2">
              {[
                {
                  label: "R-hat",
                  value: result.rhat?.toFixed(4) ?? "—",
                  sub: result.converged != null
                    ? result.converged ? "✓ Converged" : "⚠ Review"
                    : "—",
                  ok: result.converged ?? true,
                  tip: "Gelman-Rubin convergence. < 1.01 = fully converged.",
                },
                {
                  label: "Var Reduction",
                  value:
                    result.variance_reduction_pct != null
                      ? `${result.variance_reduction_pct.toFixed(1)}%`
                      : "—",
                  sub: "Antithetic",
                  ok: true,
                  tip: "Variance reduction from antithetic variates vs naive Monte Carlo.",
                },
                {
                  label: "EVIU",
                  value: result.eviu?.toFixed(4) ?? "—",
                  sub:
                    result.eviu != null
                      ? result.eviu > 0.02
                        ? "Distrib. matters"
                        : "Point est. fine"
                      : "—",
                  ok: result.eviu != null ? result.eviu > 0.02 : true,
                  tip: "Expected Value of Including Uncertainty. High = full distribution adds real decision value.",
                },
                {
                  label: "Uncertainty",
                  value:
                    result.uncertainty_type === "epistemic-dominant"
                      ? "Epistemic"
                      : result.uncertainty_type === "aleatory-dominant"
                      ? "Aleatory"
                      : "—",
                  sub:
                    result.epistemic_fraction != null
                      ? `${(result.epistemic_fraction * 100).toFixed(0)}% reducible`
                      : "—",
                  ok: result.uncertainty_type !== "epistemic-dominant",
                  tip: "Epistemic = reducible. Aleatory = irreducible inherent randomness.",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="relative group rounded-lg p-3 border text-center cursor-help"
                  style={{
                    background: "var(--surface-1)",
                    borderColor: stat.ok ? "var(--border)" : "#7c3a3a",
                  }}
                >
                  <p
                    className="text-xs uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {stat.label}
                  </p>
                  <p
                    className="text-sm font-bold font-mono"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {stat.value}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      stat.ok ? "" : "text-red-400"
                    }`}
                    style={stat.ok ? { color: "var(--text-muted)" } : {}}
                  >
                    {stat.sub}
                  </p>
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2
                                rounded text-xs opacity-0 group-hover:opacity-100
                                transition-opacity pointer-events-none z-10"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {stat.tip}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Uncertainty Decomposition Bar ──────────────────────────── */}
            {result.aleatory_fraction != null && result.epistemic_fraction != null && (
              <div
                className="p-4 rounded-lg border"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <p
                  className="text-xs uppercase tracking-wider mb-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  Uncertainty Decomposition — Der Kiureghian &amp; Ditlevsen (2009)
                </p>
                <div className="flex rounded-full overflow-hidden h-2.5 mb-2">
                  <div
                    className="transition-all duration-500"
                    style={{
                      width: `${result.aleatory_fraction * 100}%`,
                      background: "#4f8ef7",
                    }}
                  />
                  <div
                    className="transition-all duration-500"
                    style={{
                      width: `${result.epistemic_fraction * 100}%`,
                      background: "#fbbf24",
                    }}
                  />
                </div>
                <div
                  className="flex justify-between text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />
                    Aleatory {(result.aleatory_fraction * 100).toFixed(0)}% — irreducible
                  </span>
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5" />
                    Epistemic {(result.epistemic_fraction * 100).toFixed(0)}% — reducible
                  </span>
                </div>
                {result.uncertainty_type === "epistemic-dominant" && (
                  <p className="text-xs mt-2" style={{ color: "#d97706" }}>
                    ↳ Gathering more specific evidence would meaningfully tighten this estimate.
                  </p>
                )}
              </div>
            )}

            {/* ── Sensitivity Analysis ─────────────────────────────────────── */}
            {sensitivity && (
              <div
                className="p-4 rounded-lg border"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <p
                  className="text-xs uppercase tracking-wider mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Sensitivity Analysis — Spearman Rank Correlation
                </p>
                <div className="space-y-4">
                  {[
                    {
                      label: "Probability Estimate",
                      value: sensitivity.probability_sensitivity,
                      impact: `${(sensitivity.probability_impact * 100).toFixed(1)}pp range on mean`,
                      color: "#4f8ef7",
                    },
                    {
                      label: "Confidence Level",
                      value: sensitivity.confidence_sensitivity,
                      impact: `${(sensitivity.confidence_impact * 100).toFixed(1)}pp range on spread`,
                      color: "#34d399",
                    },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span style={{ color: "var(--text-label)" }}>{item.label}</span>
                        <span style={{ color: "var(--text-muted)" }}>{item.impact}</span>
                      </div>
                      <div
                        className="h-2 rounded-full"
                        style={{ background: "var(--surface-3)" }}
                      >
                        <div
                          className="h-2 rounded-full transition-all duration-700"
                          style={{
                            width: `${item.value * 100}%`,
                            background: item.color,
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <p
                        className="text-xs mt-1 text-right font-mono"
                        style={{ color: "var(--text-muted)" }}
                      >
                        ρ = {item.value.toFixed(3)}
                      </p>
                    </div>
                  ))}
                </div>
                <p
                  className="text-xs mt-4 leading-relaxed border-t pt-3"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  {sensitivity.interpretation}
                </p>
              </div>
            )}

            {/* ── Stress Test ──────────────────────────────────────────────── */}
            {stressResult && (
              <div
                className="p-4 rounded-lg border"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Assumption Stress Test — ±15pp Shift Analysis
                  </p>
                  {stressResult.is_fragile && (
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{
                        background: "#450a0a",
                        color: "#fca5a5",
                        border: "1px solid #7f1d1d",
                      }}
                    >
                      ⚠ Fragile at ±{stressResult.fragility_frontier_pp}pp
                    </span>
                  )}
                </div>

                <div className="flex gap-1 mb-3">
                  {stressResult.stress_points.map((pt) => {
                    const colorMap: Record<string, string> = {
                      critical: "#ef4444",
                      high: "#f97316",
                      moderate: "#eab308",
                      favorable: "#22c55e",
                      strong: "#10b981",
                    };
                    const isBase = pt.shift_pp === 0;
                    return (
                      <div
                        key={pt.shift_pp}
                        className="flex-1 rounded text-center py-2 relative group cursor-default"
                        style={{
                          background:
                            colorMap[pt.risk_category] + (isBase ? "dd" : "33"),
                          border: isBase
                            ? `1px solid ${colorMap[pt.risk_category]}`
                            : "1px solid transparent",
                        }}
                      >
                        <p
                          className="text-xs font-mono font-bold"
                          style={{ color: isBase ? "#fff" : colorMap[pt.risk_category] }}
                        >
                          {pt.shift_pp > 0 ? "+" : ""}
                          {pt.shift_pp}pp
                        </p>
                        <p
                          className="text-xs"
                          style={{ color: isBase ? "#fff" : "var(--text-muted)" }}
                        >
                          {(pt.mean * 100).toFixed(0)}%
                        </p>
                        {/* Tooltip */}
                        <div
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-32 p-1.5
                                      rounded text-xs opacity-0 group-hover:opacity-100
                                      transition-opacity pointer-events-none z-10"
                          style={{
                            background: "var(--surface-2)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <p
                            className="font-semibold capitalize"
                            style={{ color: colorMap[pt.risk_category] }}
                          >
                            {pt.risk_category}
                          </p>
                          <p style={{ color: "var(--text-muted)" }}>
                            CI: {(pt.ci_low * 100).toFixed(0)}%–
                            {(pt.ci_high * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {stressResult.is_fragile
                    ? `This estimate changes risk category with a shift of only ±${stressResult.fragility_frontier_pp}pp — treat conclusions with caution and validate the core probability assumption.`
                    : `Risk category remains stable across a ±${stressResult.robust_range_pp}pp range — estimate is robust to moderate assumption errors.`}
                </p>
              </div>
            )}

            {/* ── Pin / Compare controls ───────────────────────────────────── */}
            {!pinnedResult && (
              <button
                onClick={() => {
                  setPinnedResult(result);
                  setPinnedDescription(description.slice(0, 60) + "...");
                }}
                className="w-full py-2 border text-sm rounded-lg transition-colors"
                style={{
                  borderColor: "var(--accent-blue-dim)",
                  color: "var(--accent-blue)",
                }}
              >
                📌 Pin as Scenario A — then change inputs to compare
              </button>
            )}

            {pinnedResult && (
              <div
                className="p-3 rounded-lg border flex justify-between items-center"
                style={{ background: "var(--surface-1)", borderColor: "var(--accent-blue-dim)" }}
              >
                <div>
                  <span className="text-xs font-semibold" style={{ color: "var(--accent-blue)" }}>
                    Scenario A pinned
                  </span>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {pinnedDescription}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPinnedResult(null);
                    setPinnedDescription("");
                  }}
                  className="text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  ✕ Clear
                </button>
              </div>
            )}

            {/* ── Distribution Chart ────────────────────────────────────────── */}
            <div
              className="rounded-lg p-5"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-label)" }}
                >
                  {pinnedResult ? "Scenario Comparison" : "Probability Distribution"}
                  {" — "}
                  {result.trials.toLocaleString()} Monte Carlo Trials
                </p>
                {pinnedResult && (
                  <div className="flex gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-blue-400 inline-block" />
                      A: {(pinnedResult.mean * 100).toFixed(1)}%
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
                      B: {(result.mean * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={
                    (pinnedResult
                      ? buildComparisonData(pinnedResult, result)
                      : liveChartData) as ChartPoint[]
                  }
                  margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
                  <XAxis
                    dataKey={pinnedResult ? "x" : "probability"}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#9ca3af", fontSize: 12 }}
                    labelFormatter={(label) => `${label}% probability`}
                    formatter={(value) => [
                      typeof value === "number" ? value.toFixed(3) : "0.000",
                    ]}
                  />

                  {/* Risk bands */}
                  <ReferenceArea x1={0} x2={25} fill="#ef4444" fillOpacity={0.12} />
                  <ReferenceArea x1={25} x2={50} fill="#f97316" fillOpacity={0.12} />
                  <ReferenceArea x1={50} x2={75} fill="#eab308" fillOpacity={0.12} />
                  <ReferenceArea x1={75} x2={100} fill="#22c55e" fillOpacity={0.12} />

                  {/* Mean lines */}
                  <ReferenceLine
                    x={
                      pinnedResult
                        ? Math.round(pinnedResult.mean * 100)
                        : Math.round(result.mean * 100)
                    }
                    stroke="#60a5fa"
                    strokeDasharray="4 4"
                    label={{
                      value: pinnedResult ? "A" : "mean",
                      fill: "#60a5fa",
                      fontSize: 11,
                    }}
                  />
                  {pinnedResult && (
                    <ReferenceLine
                      x={Math.round(result.mean * 100)}
                      stroke="#34d399"
                      strokeDasharray="4 4"
                      label={{ value: "B", fill: "#34d399", fontSize: 11 }}
                    />
                  )}

                  <Area
                    type="monotone"
                    dataKey={pinnedResult ? "densityA" : "density"}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gradA)"
                    dot={false}
                    animationDuration={400}
                  />
                  {pinnedResult && (
                    <Area
                      type="monotone"
                      dataKey="densityB"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#gradB)"
                      dot={false}
                      animationDuration={400}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>

              {/* Risk zone legend */}
              <div className="flex justify-between mt-3 px-1">
                {[
                  { label: "Low", color: "bg-red-500", range: "0–25%" },
                  { label: "Uncertain", color: "bg-orange-500", range: "25–50%" },
                  { label: "Moderate", color: "bg-yellow-500", range: "50–75%" },
                  { label: "High", color: "bg-green-500", range: "75–100%" },
                ].map((zone) => (
                  <div key={zone.label} className="flex items-center gap-1.5">
                    <div
                      className={`w-2 h-2 rounded-full ${zone.color} opacity-70`}
                    />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {zone.label}{" "}
                      <span style={{ color: "var(--surface-3)" }}>{zone.range}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Add to Portfolio button ─────────────────────────────────── */}
            <button
              onClick={() => {
                if (!result) return;
                const entry: PortfolioScenario = {
                  label: `Scenario ${portfolio.length + 1}`,
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
                setPortfolio((prev) => [...prev.slice(0, 3), entry]);
                setPortfolioResult(null);
              }}
              disabled={portfolio.length >= 4}
              className="w-full py-2 border text-sm rounded-lg transition-colors disabled:opacity-40"
              style={{
                borderColor: "#14532d",
                color: "#34d399",
              }}
            >
              + Add to Portfolio Analysis{" "}
              {portfolio.length > 0 ? `(${portfolio.length}/4)` : ""}
            </button>

            {/* ── Decision Summary ─────────────────────────────────────────── */}
            {decisionSummary && (
              <div
                className="rounded-lg p-5 space-y-3 border"
                style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-label)" }}
                >
                  Decision Summary
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {decisionSummary.summary}
                </p>
                <div className="pl-3 border-l-2 border-yellow-600">
                  <p className="text-xs font-medium mb-0.5 text-yellow-500">
                    Key Uncertainty Insight
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {decisionSummary.key_insight}
                  </p>
                </div>
                <div className="pl-3 border-l-2 border-blue-700">
                  <p className="text-xs font-medium mb-0.5" style={{ color: "var(--accent-blue)" }}>
                    Decision Framing
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {decisionSummary.decision_framing}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Scenario History ──────────────────────────────────────────────── */}
        {history.length > 0 && (
          <div
            className="mt-6 rounded-lg border p-5"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-label)" }}
              >
                Scenario History ({history.length})
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => exportSessionJSON(history)}
                  className="text-xs transition-colors"
                  style={{ color: "var(--accent-blue)" }}
                >
                  ↓ Export JSON
                </button>
                <button
                  onClick={() => exportLatex(history)}
                  className="text-xs transition-colors"
                  style={{ color: "#34d399" }}
                >
                  ↓ Export LaTeX
                </button>
                <button
                  onClick={clearAllHistory}
                  className="text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => {
                    setDescription(entry.description.replace(/\.\.\.$/, ""));
                    setBaseProbability(entry.baseProbability);
                    setConfidence(entry.confidence);
                  }}
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer border transition-colors"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p
                      className="text-sm truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {entry.description}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {entry.timestamp}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className="text-sm font-bold font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {((entry.result?.mean ?? 0) * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      ±{((entry.result?.std_dev ?? 0) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Portfolio Analysis ────────────────────────────────────────────── */}
        {portfolio.length >= 2 && (
          <div
            className="mt-6 rounded-lg border p-5"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-label)" }}
              >
                Portfolio Analysis — {portfolio.length} Scenarios
              </p>
              <div className="flex gap-3">
                <button
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
                  className="text-xs transition-colors"
                  style={{ color: "var(--accent-blue)" }}
                >
                  Analyse Portfolio →
                </button>
                <button
                  onClick={() => {
                    setPortfolio([]);
                    setPortfolioResult(null);
                  }}
                  className="text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Scenario list */}
            <div className="space-y-2 mb-4">
              {portfolio.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span
                    className="text-xs truncate flex-1 mr-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {s.description}
                  </span>
                  <span
                    className="text-sm font-bold font-mono shrink-0"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {(s.mean * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Ranking */}
            {portfolioResult && (
              <div
                className="space-y-3 border-t pt-4"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {portfolioResult.recommendation_basis}
                </p>

                <div className="space-y-2">
                  {portfolioResult.ranked_labels.map((label, i) => {
                    const scenario = portfolio.find((s) => s.label === label);
                    const score = portfolioResult.ranked_scores[i];
                    const isUpside = label === portfolioResult.highest_upside;
                    const isFloor = label === portfolioResult.lowest_downside;
                    return (
                      <div
                        key={label}
                        className="flex items-center gap-3 p-2 rounded"
                        style={{ background: "var(--surface-2)" }}
                      >
                        <span
                          className="text-lg font-bold w-6 text-center"
                          style={{ color: i === 0 ? "#34d399" : "var(--text-muted)" }}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                              {label}
                            </span>
                            {isUpside && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: "#0d3d2e", color: "#34d399" }}
                              >
                                ↑ highest upside
                              </span>
                            )}
                            {isFloor && !isUpside && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: "#1e3a6e", color: "#4f8ef7" }}
                              >
                                ↓ best floor
                              </span>
                            )}
                          </div>
                          <p
                            className="text-xs truncate"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {scenario?.description}
                          </p>
                        </div>
                        <span
                          className="text-xs font-mono"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {(score * 100).toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {portfolioResult.dominance_pairs.filter((p) => p.dominates).length > 0 && (
                  <div
                    className="text-xs border-t pt-3"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    <span
                      className="font-semibold"
                      style={{ color: "var(--text-label)" }}
                    >
                      Stochastic dominance:{" "}
                    </span>
                    {portfolioResult.dominance_pairs
                      .filter((p) => p.dominates)
                      .map((p) => `${p.scenario_a} dominates ${p.scenario_b}`)
                      .join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div
        className="mt-12 pt-4 border-t flex justify-center gap-8"
        style={{ borderColor: "var(--border)" }}
      >
        <Link
          href="/model-card"
          className="text-xs transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--text-secondary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--text-muted)")
          }
        >
          Model Card (Mitchell et al., 2019) →
        </Link>
        <Link
          href="/api-docs"
          className="text-xs transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--text-secondary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--text-muted)")
          }
        >
          API Docs →
        </Link>
      </div>
    </main>
  );
}
