"use client";

import { useState, useEffect, useRef } from "react";
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

type ExtractionResult = {
  suggested_probability: number;
  suggested_confidence: number;
  reasoning: string
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
};
type SummarizeResult = {
  summary: string;
  key_insight: string;
  decision_framing: string;
};

// Transform the two parallel arrays into the object format recharts expects
function buildChartData(result: SimulationResult) {
  return result.histogram_x.map((x, i) => ({
    probability: Math.round(x * 100),        // convert to percentage for readability
    density: parseFloat(result.histogram_y[i].toFixed(3)),
  }));
}

// Finds the density value at a given probability percentage by linear
// interpolation between the two nearest histogram bins.
// Returns 0 if the point falls outside the distribution's range.
function interpolateDensity(xPct: number, histX: number[], histY: number[]): number {
  const xProb = xPct / 100;
  const margin = (histX[histX.length - 1] - histX[0]) / histX.length * 2;

  if (xProb < histX[0] - margin || xProb > histX[histX.length - 1] + margin) return 0;

  for (let i = 0; i < histX.length - 1; i++) {
    if (xProb >= histX[i] && xProb <= histX[i + 1]) {
      // Linear interpolation between the two surrounding bins
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

export default function Home() {
  const [description, setDescription] = useState("");
  const [baseProbability, setBaseProbability] = useState(0.5);
  const [confidence, setConfidence] = useState(0.5);
  const [reasoning, setReasoning] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");
  const [extractionMode, setExtractionMode] = useState("");
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const [autoSimulating, setAutoSimulating] = useState(false);
  const [pinnedResult, setPinnedResult] = useState<SimulationResult | null>(null);
  const [pinnedDescription, setPinnedDescription] = useState("");
  const [pinnedLabel, setPinnedLabel] = useState("Scenario A");
  const [decisionSummary, setDecisionSummary] = useState<SummarizeResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);

useEffect(() => {
  // Don't auto-simulate on first render or before any manual simulation
  if (!result) return;

  // Clear any pending timer from a previous slider movement
  if (debounceTimer.current) clearTimeout(debounceTimer.current);

  // Schedule a new simulation 800ms after the slider stops moving
  debounceTimer.current = setTimeout(async () => {
    setAutoSimulating(true);
    try {
      const res = await fetch("http://localhost:8000/simulate", {
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
      // Update history entry for this scenario in-place
      setHistory(prev => prev.map((entry, i) =>
        i === 0 ? { ...entry, result: data } : entry
      ));
      // Fire summarization in the background — don't block the UI for it
      fetch("http://localhost:8000/summarize", {
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
      })
        .then(r => r.json())
        .then(setDecisionSummary)
        .catch(err => console.error("Summary failed:", err));
    } catch (err) {
      console.error("Auto-simulation failed:", err);
    } finally {
      setAutoSimulating(false);
    }
  }, 800);

  // Cleanup on unmount
  return () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };
}, [baseProbability, confidence]);

  async function analyzeScenario() {
    if (!description.trim()) return;
    setExtracting(true);
    setReasoning("");
    setResult(null);
    setError("");
    setExtractionMode("");

    try {
      const res = await fetch("http://127.0.0.1:8000/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      
      const data: ExtractionResult = await res.json();
      setBaseProbability(data.suggested_probability);
      setConfidence(data.suggested_confidence);
      setReasoning(data.reasoning);
      setExtractionMode(data.extraction_mode);
    } catch (err) {
      setError("Failed to analyze scenario. Is your backend running?");
      console.error(err);
    } finally {
      setExtracting(false);
    }
  }

  async function runSimulation() {
    setSimulating(true);
    setError("");

    try {
      const res = await fetch("http://127.0.0.1:8000/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          base_probability: baseProbability,
          confidence,
          trials: 10000,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data: SimulationResult = await res.json();
      setResult(data);
      // Fire summarization in the background — don't block the UI for it
      fetch("http://localhost:8000/summarize", {
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
      })
        .then(r => r.json())
        .then(setDecisionSummary)
        .catch(err => console.error("Summary failed:", err));
    } catch (err) {
      setError("Simulation failed. Check your backend connection.");
      console.error(err);
    } finally {
      setSimulating(false);
    }
  }

  const chartData = result ? buildChartData(result) : [];

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
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
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-white">
                  {(result.mean * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">Mean</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-white">
                  ±{(result.std_dev * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">Std Dev</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
                <p className="text-sm font-bold text-white mt-1">
                  {(result.confidence_interval_low * 100).toFixed(1)}%
                  {" – "}
                  {(result.confidence_interval_high * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">95% CI</p>
              </div>
            </div>

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
<div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
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
      data={pinnedResult ? buildComparisonData(pinnedResult, result) : chartData}
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

      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />

      <XAxis
        dataKey={pinnedResult ? "x" : "probability"}
        tickFormatter={(v) => `${v}%`}
        tick={{ fill: "#6b7280", fontSize: 11 }}
        tickLine={false}
      />
      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} />

      <Tooltip
        contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px" }}
        labelStyle={{ color: "#9ca3af", fontSize: 12 }}
        labelFormatter={(label) => `${label}% probability`}
        formatter={(value: number, name: string) => [
          value.toFixed(3),
          name === "densityA" ? "Scenario A density" : name === "densityB" ? "Scenario B density" : "density"
        ]}
      />

      {/* Risk band zones */}
      <ReferenceArea x1={0} x2={25} fill="#ef4444" fillOpacity={0.06} />
      <ReferenceArea x1={25} x2={50} fill="#f97316" fillOpacity={0.06} />
      <ReferenceArea x1={50} x2={75} fill="#eab308" fillOpacity={0.06} />
      <ReferenceArea x1={75} x2={100} fill="#22c55e" fillOpacity={0.06} />

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
    </main>
  );
}