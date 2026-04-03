"use client";

import { useState } from "react";

type SimulationResult = {
  mean: number;
  variance: number;
  std_dev: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  trials: number;
};

export default function Home() {
  const [description, setDescription] = useState("");
  const [baseProbability, setBaseProbability] = useState(0.5);
  const [confidence, setConfidence] = useState(0.5);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSimulation() {
    setLoading(true);
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
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Probabilis — Decision Simulator</h1>

      <textarea
        className="w-full border p-2 mb-4"
        placeholder="Describe your scenario..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />

      <label>Base Probability: {baseProbability}</label>
      <input type="range" min={0} max={1} step={0.01}
        value={baseProbability}
        onChange={(e) => setBaseProbability(parseFloat(e.target.value))}
        className="w-full mb-4"
      />

      <label>Confidence in Estimate: {confidence}</label>
      <input type="range" min={0.1} max={1} step={0.01}
        value={confidence}
        onChange={(e) => setConfidence(parseFloat(e.target.value))}
        className="w-full mb-4"
      />

      <button
        onClick={runSimulation}
        className="bg-black text-white px-6 py-2"
        disabled={loading}
      >
        {loading ? "Simulating..." : "Run Simulation"}
      </button>

      {result && (
        <div className="mt-8 p-4 border">
          <p>Mean Probability: {(result.mean * 100).toFixed(1)}%</p>
          <p>Std Deviation: ±{(result.std_dev * 100).toFixed(1)}%</p>
          <p>95% Confidence Interval: {(result.confidence_interval_low * 100).toFixed(1)}% — {(result.confidence_interval_high * 100).toFixed(1)}%</p>
          <p>Trials: {result.trials.toLocaleString()}</p>
        </div>
      )}
    </main>
  );
}