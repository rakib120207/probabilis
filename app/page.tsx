"use client";

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

type ExtractionResult = {
  suggested_probability: number;
  suggested_confidence: number;
  reasoning: string
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
  rhat: number;
  converged: boolean;
  variance_reduction_pct: number;
  aleatory_variance: number;
  epistemic_variance: number;
  aleatory_fraction: number;
  epistemic_fraction: number;
  uncertainty_type: string;
  eviu: number;
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

// Finds the density value at a given probability percentage by linear
// interpolation between the two nearest histogram bins.
// Returns 0 if the point falls outside the distribution's range.
function interpolateDensity(xPct: number, histX: number[], histY: number[]): number {
  const xProb = xPct / 100;
  const margin = (histX[histX.length - 1] - histX[0]) / histX.length * 2;

  if (xProb < histX[0] - margin || xProb > histX[histX.length - 1] + margin) return 0;

  for (let i = 0; i < histX.length - 1; i++) {
    if (xProb >= histX[i] && xProb <= histX[i + 1]) {
      const t = (xProb - histX[i]) / (histX[i + 1] - histX[i]);
      return histY[i] * (1 - t) + histY[i + 1] * t;
    }
  }
  return 0;
}

// Builds a 101-point unified x-axis covering 0%–100% and maps both
// distribution densities onto it for side-by-side chart rendering.
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
  list.forEach(a => {
    const w = weights[a.id] ?? a.weight;
    prob += a.direction === "positive" ? w * 0.12 : -(w * 0.12);
  });
  return Math.max(0.05, Math.min(0.95, Math.round(prob * 100) / 100));
}

export default function Home() {
  const API_URL = useMemo(() => process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000", []);
  const [description, setDescription] = useState("");
  const [baseProbability, setBaseProbability] = useState(0.5);
  const [confidence, setConfidence] = useState(0.5);
  const [reasoning, setReasoning] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");
  const [extractionMode, setExtractionMode] = useState("");
  const [analyzeStatus, setAnalyzeStatus] = useState("");
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const [autoSimulating, setAutoSimulating] = useState(false);
  const [pinnedResult, setPinnedResult] = useState<SimulationResult | null>(null);
  const [pinnedDescription, setPinnedDescription] = useState("");
  const [pinnedLabel, setPinnedLabel] = useState("Scenario A");
  const [decisionSummary, setDecisionSummary] = useState<SummarizeResult | null>(null);
  const [history, setHistory] = useState<StoredScenario[]>([]);
  const [assumptions, setAssumptions] = useState<AssumptionsResult | null>(null);
  const [editedWeights, setEditedWeights] = useState<Record<string, number>>({});
  const [showAssumptions, setShowAssumptions] = useState(false);
  const isFirstRender = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

useEffect(() => {
  if (isFirstRender.current) {
    isFirstRender.current = false;
    return;
  }
  if (!result) return;
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
  if (debounceTimer.current) clearTimeout(debounceTimer.current);

  debounceTimer.current = setTimeout(async () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAutoSimulating(true);
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
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: SimulationResult = await res.json();

      if (controller.signal.aborted) return;

      setResult(data);
      setHistory(prev =>
        prev.map((entry, i) =>
          i === 0 ? { ...entry, result: { ...entry.result, mean: data.mean, std_dev: data.std_dev } } : entry
        )
      );

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
          signal: controller.signal,
        });
        if (summRes.ok && !controller.signal.aborted) {
          const summData = await summRes.json();
          setDecisionSummary(summData);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.warn("Summary failed:", e);
      }

    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error("Auto-simulation failed:", e);
      }
    } finally {
      if (!controller.signal.aborted) {
        setAutoSimulating(false);
      }
    }
  }, 1200);

  return () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };
}, [baseProbability, confidence]);

  async function analyzeScenario() {
  if (!description.trim()) return;

  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }

  setExtracting(true);
  setAnalyzeStatus("Connecting to AI...");
  setReasoning("");
  setResult(null);
  setSensitivity(null);
  setDecisionSummary(null);
  setAssumptions(null);
  setError("");

  const statusTimer = setTimeout(() => {
    setAnalyzeStatus("Analyzing uncertainty signals...");
  }, 1500);

  try {
    const res = await fetch(`${API_URL}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data: ExtractionResult = await res.json();

    setBaseProbability(data.suggested_probability);
    setConfidence(data.suggested_confidence);
    setReasoning(data.reasoning);
    setExtractionMode(data.extraction_mode);

    isFirstRender.current = false;

    try {
      const assumpRes = await fetch(`${API_URL}/assumptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (assumpRes.ok) {
        const assumpData: AssumptionsResult = await assumpRes.json();
        setAssumptions(assumpData);
        const w: Record<string, number> = {};
        assumpData.assumptions.forEach(a => { w[a.id] = a.weight; });
        setEditedWeights(w);
      }
    } catch {}

  } catch (err) {
    setError("Analysis failed. Check your backend is running.");
  } finally {
    clearTimeout(statusTimer);
    setAnalyzeStatus("");
    setExtracting(false);
  }
}

  async function runSimulation() {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
  if (debounceTimer.current) clearTimeout(debounceTimer.current);

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

    const entry: StoredScenario = {
      id: Date.now(),
      description: description.slice(0, 120) + (description.length > 120 ? "..." : ""),
      baseProbability,
      confidence,
      result: {
        mean: data.mean,
        std_dev: data.std_dev,
        confidence_interval_low: data.confidence_interval_low,
        confidence_interval_high: data.confidence_interval_high,
        trials: data.trials,
        rhat: data.rhat,
        eviu: data.eviu,
        uncertainty_type: data.uncertainty_type,
        variance_reduction_pct: data.variance_reduction_pct,
      },
      extractionMode,
      timestamp: new Date().toLocaleTimeString(),
      isoDate: new Date().toISOString(),
    };

    setHistory(prev => {
      const updated = [entry, ...prev].slice(0, 20);
      saveToHistory(entry);
      return updated;
    });

    try {
      const sensitivityRes = await fetch(`${API_URL}/sensitivity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_probability: baseProbability, confidence, trials: 3000 }),
      });
      if (sensitivityRes.ok) setSensitivity(await sensitivityRes.json());
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

  } catch (err) {
    setError("Simulation failed. Check your backend connection.");
    console.error(err);
  } finally {
    setSimulating(false);
  }
}

  const liveChartData = buildLocalCurve(baseProbability, confidence);

  function exportSession(history: StoredScenario[]): void {
    const payload = {
      exported_at: new Date().toISOString(),
      scenario_count: history.length,
      scenarios: history.map(entry => ({
        description: entry.description,
        base_probability: entry.baseProbability,
        confidence: entry.confidence,
        mean: entry.result.mean,
        std_dev: entry.result.std_dev,
        confidence_interval_low: entry.result.confidence_interval_low,
        confidence_interval_high: entry.result.confidence_interval_high,
        trials: entry.result.trials,
        rhat: entry.result.rhat,
        eviu: entry.result.eviu,
        uncertainty_type: entry.result.uncertainty_type,
        variance_reduction_pct: entry.result.variance_reduction_pct,
        extraction_mode: entry.extractionMode,
        timestamp: entry.timestamp,
        iso_date: entry.isoDate,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `probabilis-session-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function clearHistory() {
    localStorage.removeItem('probabilis-history');
  }

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Probabilis</h1>
          <p className="text-gray-400 mt-1">
            Describe a decision. We model its uncertainty.
          </p>
        </div>

        {/* Scenario Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Scenario
          </label>
          <textarea
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-100
                       placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            placeholder="e.g. I'm launching a new SaaS product next month. The market is competitive but we have early waitlist signups and good feedback from beta users."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>

        <button
          onClick={analyzeScenario}
          disabled={extracting || !description.trim()}
          className="mb-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                     text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {extracting ? "Analyzing..." : "Analyze with AI"}
        </button>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* AI Reasoning */}
        {reasoning && (
          <div className="mb-6 p-4 bg-blue-950/50 border border-blue-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                AI Interpretation
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  extractionMode.startsWith("ai")
                  ? "bg-green-900/50 text-green-400 border border-green-800": "bg-yellow-900/50 text-yellow-400 border border-yellow-800"
                  }`}>
                    {extractionMode.startsWith("ai") ? "⚡ Llama" : "📐 Linguistic"}
                    </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{reasoning}</p>
                    </div>
                  )}

                  {assumptions && (
  <div className="mb-6">
    <button
      onClick={() => setShowAssumptions(!showAssumptions)}
      className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-2"
    >
      <span>{showAssumptions ? "▼" : "▶"}</span>
      <span className="uppercase tracking-wider">
        Assumption Audit — {assumptions.assumptions.length} factors identified
      </span>
    </button>

    {showAssumptions && (
      <div className="rounded-lg border p-4 space-y-4"
           style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
        <p className="text-xs text-gray-500 leading-relaxed">
          {assumptions.synthesis_note} Adjust weights to see how they affect the probability estimate.
        </p>

        {assumptions.assumptions.map(a => (
          <div key={a.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${a.direction === "positive" ? "text-green-400" : "text-red-400"}`}>
                  {a.direction === "positive" ? "+" : "−"}
                </span>
                <span className="text-sm text-gray-300">{a.label}</span>
              </div>
              <span className="text-xs text-gray-500 font-mono">
                {((editedWeights[a.id] ?? a.weight) * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-xs text-gray-600 pl-4">{a.description}</p>
            <input
              type="range" min={0} max={1} step={0.05}
              value={editedWeights[a.id] ?? a.weight}
              onChange={(e) => {
                const newW = { ...editedWeights, [a.id]: parseFloat(e.target.value) };
                setEditedWeights(newW);
                setBaseProbability(recomputeFromAssumptions(assumptions.assumptions, newW));
              }}
              className="w-full"
              style={{ accentColor: a.direction === "positive" ? "#34d399" : "#f87171" }}
            />
          </div>
        ))}

        <button
          onClick={() => {
            const w: Record<string, number> = {};
            assumptions.assumptions.forEach(a => { w[a.id] = a.weight; });
            setEditedWeights(w);
            setBaseProbability(recomputeFromAssumptions(assumptions.assumptions, w));
          }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ↺ Reset to AI estimate
        </button>
      </div>
    )}
  </div>
)}

        {/* Sliders */}
        <div className="space-y-5 mb-8">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-300 font-medium">Base Probability</span>
              <span className="text-white font-bold">
                {(baseProbability * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range" min={0.01} max={0.99} step={0.01}
              value={baseProbability}
              onChange={(e) => setBaseProbability(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-300 font-medium">Confidence in Estimate</span>
              <span className="text-white font-bold">
                {(confidence * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range" min={0.1} max={1} step={0.01}
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Lower confidence = wider distribution = more uncertainty
            </p>
          </div>
        </div>

        <button
        onClick={runSimulation}
        disabled={simulating || autoSimulating}
        className="w-full mb-8 bg-white text-gray-950 hover:bg-gray-100 disabled:opacity-40disabled:cursor-not-allowed font-semibold py-2.5 rounded-lg transition-colors"
        >
          {simulating ? "Running 10,000 trials..." : autoSimulating ? "Updating..." : "Run Simulation"}
          </button>

        {/* Results */}
        {result && (
          <div className="space-y-4">

            {/* Key Numbers */}
            <div className="grid grid-cols-3 gap-3">
              <div
                className="bg-gray-900 border rounded-lg p-4 text-center"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-2xl font-bold text-white">
                  {(result.mean * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">Mean</p>
              </div>
              <div
                className="bg-gray-900 border rounded-lg p-4 text-center"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-2xl font-bold text-white">
                  ±{(result.std_dev * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">Std Dev</p>
              </div>
              <div
                className="bg-gray-900 border rounded-lg p-4 text-center"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-sm font-bold text-white mt-1">
                  {(result.confidence_interval_low * 100).toFixed(1)}%
                  {" – "}
                  {(result.confidence_interval_high * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">95% CI</p>
              </div>
            </div>

            {/* Statistical Diagnostics */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                {
                  label: "R-hat",
                  value: result.rhat.toFixed(4),
                  sub: result.converged ? "✓ Converged" : "⚠ Review inputs",
                  ok: result.converged,
                  tip: "Gelman-Rubin convergence. < 1.01 = fully converged."
                },
                {
                  label: "Var Reduction",
                  value: `${result.variance_reduction_pct.toFixed(1)}%`,
                  sub: "Antithetic",
                  ok: true,
                  tip: "Variance reduction from antithetic variates vs naive Monte Carlo."
                },
                {
                  label: "EVIU",
                  value: result.eviu.toFixed(4),
                  sub: result.eviu > 0.02 ? "Distrib. matters" : "Point est. fine",
                  ok: result.eviu > 0.02,
                  tip: "Expected Value of Including Uncertainty. High = full distribution adds real decision value."
                },
                {
                  label: "Uncertainty",
                  value: result.uncertainty_type === "epistemic-dominant" ? "Epistemic" : "Aleatory",
                  sub: `${(result.epistemic_fraction * 100).toFixed(0)}% reducible`,
                  ok: result.uncertainty_type === "aleatory-dominant",
                  tip: "Epistemic = reducible (gather more info). Aleatory = irreducible inherent randomness."
                },
              ].map(stat => (
                <div
                  key={stat.label}
                  className="relative group rounded-lg p-3 border text-center cursor-help"
                  style={{
                    background: 'var(--surface-1)',
                    borderColor: stat.ok ? 'var(--border)' : '#7c3a3a'
                  }}
                >
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{stat.label}</p>
                  <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {stat.value}
                  </p>
                  <p className={`text-xs mt-0.5 ${stat.ok ? 'text-gray-500' : 'text-red-400'}`}>
                    {stat.sub}
                  </p>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2
                                  rounded text-xs text-gray-300 opacity-0 group-hover:opacity-100
                                  transition-opacity pointer-events-none z-10"
                       style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    {stat.tip}
                  </div>
                </div>
              ))}
            </div>

            {/* Uncertainty Decomposition Bar */}
            <div className="mb-4 p-4 rounded-lg border"
                 style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                Uncertainty Decomposition — Der Kiureghian & Ditlevsen (2009)
              </p>
              <div className="flex rounded-full overflow-hidden h-2.5 mb-2">
                <div
                  className="transition-all duration-500"
                  style={{ width: `${result.aleatory_fraction * 100}%`, background: '#4f8ef7' }}
                />
                <div
                  className="transition-all duration-500"
                  style={{ width: `${result.epistemic_fraction * 100}%`, background: '#fbbf24' }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
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
                <p className="text-xs mt-2" style={{ color: '#d97706' }}>
                  ↳ Gathering more specific evidence would meaningfully tighten this estimate.
                </p>
              )}
            </div>

            {sensitivity && (
              <div className="mb-4 p-4 rounded-lg border"
                   style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-4">
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
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-gray-400">{item.label}</span>
                        <span className="text-gray-500">{item.impact}</span>
                      </div>
                      <div className="h-2 rounded-full" style={{ background: 'var(--surface-3)' }}>
                        <div
                          className="h-2 rounded-full transition-all duration-700"
                          style={{ width: `${item.value * 100}%`, background: item.color, opacity: 0.85 }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1 text-right font-mono">
                        ρ = {item.value.toFixed(3)}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-4 leading-relaxed border-t pt-3"
                   style={{ borderColor: 'var(--border)' }}>
                  {sensitivity.interpretation}
                </p>
              </div>
            )}

            {result && !pinnedResult && (
  <button
    onClick={() => {
      setPinnedResult(result);
      setPinnedDescription(description.slice(0, 60) + "...");
      setPinnedLabel("Scenario A");
    }}
    className="w-full py-2 border border-blue-700 text-blue-400 text-sm rounded-lg
               hover:bg-blue-950/50 transition-colors mb-4"
  >
    📌 Pin as Scenario A — then change inputs to compare
  </button>
)}

{pinnedResult && (
  <div className="mb-4 p-3 bg-gray-900 border border-blue-800 rounded-lg flex justify-between items-center">
    <div>
      <span className="text-xs text-blue-400 font-semibold">Scenario A pinned</span>
      <p className="text-xs text-gray-400 mt-0.5">{pinnedDescription}</p>
    </div>
    <button
      onClick={() => { setPinnedResult(null); setPinnedDescription(""); }}
      className="text-xs text-gray-500 hover:text-gray-300"
    >
      ✕ Clear
    </button>
  </div>
)}

            {/* Distribution Chart — single or comparison mode */}
<div
  className="rounded-lg p-5"
  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
>
  <div className="flex items-center justify-between mb-4">
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
      {pinnedResult ? "Scenario Comparison" : "Probability Distribution"}
      {" — "}{result.trials.toLocaleString()} Monte Carlo Trials
    </p>
    {pinnedResult && (
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-blue-400 inline-block" /> Scenario A: {(pinnedResult.mean * 100).toFixed(1)}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Scenario B: {(result.mean * 100).toFixed(1)}%
        </span>
      </div>
    )}
  </div>

  <ResponsiveContainer width="100%" height={220}>
    <AreaChart
      data={(pinnedResult ? buildComparisonData(pinnedResult, result) : liveChartData) as ChartPoint[]}
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
      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} />

      <Tooltip
        contentStyle={{
          backgroundColor: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
        }}
        labelStyle={{ color: "#9ca3af", fontSize: 12 }}
        labelFormatter={(label) => `${label}% probability`}
        formatter={(value) => {
  const formattedValue = typeof value === 'number' 
    ? value.toFixed(3) 
    : "0.000";
  return [formattedValue];
}}
      />

      {/* Risk band zones */}
      <ReferenceArea x1={0} x2={25} fill="#ef4444" fillOpacity={0.12} />
      <ReferenceArea x1={25} x2={50} fill="#f97316" fillOpacity={0.12} />
      <ReferenceArea x1={50} x2={75} fill="#eab308" fillOpacity={0.12} />
      <ReferenceArea x1={75} x2={100} fill="#22c55e" fillOpacity={0.12} />

      {/* Mean reference lines */}
      <ReferenceLine
        x={pinnedResult ? Math.round(pinnedResult.mean * 100) : Math.round(result.mean * 100)}
        stroke="#60a5fa" strokeDasharray="4 4"
        label={{ value: pinnedResult ? "A" : "mean", fill: "#60a5fa", fontSize: 11 }}
      />
      {pinnedResult && (
        <ReferenceLine
          x={Math.round(result.mean * 100)}
          stroke="#34d399" strokeDasharray="4 4"
          label={{ value: "B", fill: "#34d399", fontSize: 11 }}
        />
      )}

      {/* Scenario A curve — always blue */}
      <Area
        type="monotone"
        dataKey={pinnedResult ? "densityA" : "density"}
        stroke="#3b82f6" strokeWidth={2}
        fill="url(#gradA)"
        dot={false} animationDuration={400}
      />

      {/* Scenario B curve — only shown in comparison mode */}
      {pinnedResult && (
        <Area
          type="monotone"
          dataKey="densityB"
          stroke="#10b981" strokeWidth={2}
          fill="url(#gradB)"
          dot={false} animationDuration={400}
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
    ].map(zone => (
      <div key={zone.label} className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${zone.color} opacity-70`} />
        <span className="text-xs text-gray-500">
          {zone.label} <span className="text-gray-600">{zone.range}</span>
        </span>
      </div>
    ))}
  </div>
</div>
{history.length > 0 && (
  <div className="mt-6 rounded-lg border p-5"
       style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
    <div className="flex items-center justify-between mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Scenario History ({history.length})
      </p>
      <div className="flex gap-4">
        <button
          onClick={() => exportSession(history)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          ↓ Export JSON
        </button>
        <button
          onClick={() => { clearHistory(); setHistory([]); }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Clear all
        </button>
      </div>
    </div>
    <div className="space-y-2">
      {history.map(entry => (
        <div
          key={entry.id}
          onClick={() => {
            setDescription(entry.description.replace(/\.\.\.$/, ""));
            setBaseProbability(entry.baseProbability);
            setConfidence(entry.confidence);
          }}
          className="flex items-center justify-between p-3 rounded-lg cursor-pointer border transition-colors"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
        >
          <div className="flex-1 min-w-0 mr-4">
            <p className="text-sm text-gray-300 truncate">{entry.description}</p>
            <p className="text-xs text-gray-600 mt-0.5">{entry.timestamp}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
              {(entry.result.mean * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500">±{(entry.result.std_dev * 100).toFixed(1)}%</p>
          </div>
        </div>
      ))}
    </div>
  </div>
)}

{decisionSummary && (
  <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
      Decision Summary
    </p>
    <p className="text-sm text-gray-300 leading-relaxed">{decisionSummary.summary}</p>
    <div className="pl-3 border-l-2 border-yellow-600">
      <p className="text-xs text-yellow-500 font-medium mb-0.5">Key Uncertainty Insight</p>
      <p className="text-sm text-gray-400 leading-relaxed">{decisionSummary.key_insight}</p>
    </div>
    <div className="pl-3 border-l-2 border-blue-700">
      <p className="text-xs text-blue-400 font-medium mb-0.5">Decision Framing</p>
      <p className="text-sm text-gray-400 leading-relaxed">{decisionSummary.decision_framing}</p>
    </div>
  </div>
)}

          </div>
        )}
      </div>
      <div className="mt-12 pt-4 border-t text-center" style={{ borderColor: 'var(--border)' }}>
  <a href="/model-card"
     className="text-xs transition-colors"
     style={{ color: 'var(--text-muted)' }}
     onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
     onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
    Model Card (Mitchell et al., 2019) →
  </a>
</div>
    </main>
  );
}