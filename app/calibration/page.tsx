"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type ForecastRecord = {
  id: string;
  description: string;
  forecasted_probability: number;
  actual_outcome: number | null;
  scenario_date: string;
};

type CalibrationBin = {
  bin_center: number;
  mean_forecast: number;
  actual_rate: number;
  count: number;
  calibration_error: number;
};

type BrierResult = {
  brier_score: number;
  brier_skill_score: number;
  total_records: number;
  resolved_records: number;
  is_overconfident: boolean;
  is_underconfident: boolean;
  calibration_bins: CalibrationBin[];
  platt_a: number | null;
  platt_b: number | null;
  calibration_quality: string;
  recommendation: string;
};

type PlattResult = {
  raw_probability: number;
  calibrated_probability: number;
  adjustment: number;
};

const STORAGE_KEY = "probabilis_calibration_v1";

// ── Helpers ────────────────────────────────────────────────────────────────

function loadRecords(): ForecastRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecords(records: ForecastRecord[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch {}
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: "var(--font-serif), Georgia, serif",
      fontSize: 10, fontStyle: "italic", letterSpacing: "0.12em",
      textTransform: "uppercase" as const, color: "#555", marginBottom: 10,
    }}>
      {children}
    </p>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CalibrationPage() {
  const API_URL = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_API_URL;
    if (!url) return "https://web-production-810f7.up.railway.app";
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }, []);

  const [records, setRecords] = useState<ForecastRecord[]>([]);
  const [brierResult, setBrierResult] = useState<BrierResult | null>(null);
  const [plattResult, setPlattResult] = useState<PlattResult | null>(null);
  const [testProb, setTestProb] = useState(0.75);
  const [computing, setComputing] = useState(false);
  const [addingDesc, setAddingDesc] = useState("");
  const [addingProb, setAddingProb] = useState(0.70);
  const [error, setError] = useState("");

  useEffect(() => {
    setRecords(loadRecords());
  }, []);

  async function computeBrier() {
    setComputing(true); setError("");
    try {
      const res = await fetch(`${API_URL}/brier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setBrierResult(await res.json());
    } catch { setError("Failed to compute. Check backend."); }
    finally { setComputing(false); }
  }

  async function applyPlatt() {
    if (!brierResult?.platt_a || !brierResult?.platt_b) return;
    try {
      const res = await fetch(`${API_URL}/platt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_probability: testProb,
          platt_a: brierResult.platt_a,
          platt_b: brierResult.platt_b,
        }),
      });
      if (res.ok) setPlattResult(await res.json());
    } catch {}
  }

  function addRecord() {
    if (!addingDesc.trim()) return;
    const rec: ForecastRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      description: addingDesc.trim().slice(0, 120),
      forecasted_probability: addingProb,
      actual_outcome: null,
      scenario_date: new Date().toISOString().split("T")[0],
    };
    const updated = [rec, ...records].slice(0, 50);
    setRecords(updated);
    saveRecords(updated);
    setAddingDesc("");
    setBrierResult(null);
  }

  function resolveRecord(id: string, outcome: 0 | 1) {
    const updated = records.map((r) =>
      r.id === id ? { ...r, actual_outcome: outcome } : r
    );
    setRecords(updated);
    saveRecords(updated);
    setBrierResult(null);
  }

  function deleteRecord(id: string) {
    const updated = records.filter((r) => r.id !== id);
    setRecords(updated);
    saveRecords(updated);
    setBrierResult(null);
  }

  const resolved = records.filter((r) => r.actual_outcome !== null);
  const pending  = records.filter((r) => r.actual_outcome === null);

  const qualityColor: Record<string, string> = {
    excellent: "#00e87a",
    good: "#00c060",
    fair: "#d4c000",
    poor: "#ff7a00",
    "insufficient data": "#555",
  };

  return (
    <main style={{ background: "#000", minHeight: "100vh", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <header style={{ marginBottom: 48 }}>
          <Link href="/" style={{
            fontFamily: "var(--font-mono), monospace", fontSize: 10,
            color: "#555", letterSpacing: "0.1em", textDecoration: "none",
            display: "inline-block", marginBottom: 20,
          }}>← PROBABILIS</Link>
          <h1 style={{
            fontFamily: "var(--font-serif), Georgia, serif", fontSize: 28,
            fontWeight: 400, fontStyle: "italic", color: "#f5f5f5", margin: 0,
          }}>Calibration Tracker</h1>
          <p style={{
            fontFamily: "var(--font-serif), Georgia, serif", fontSize: 11,
            fontStyle: "italic", letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#555", marginTop: 6,
          }}>Brier Score · Platt Scaling · Forecast Accountability</p>
        </header>

        {/* What is this */}
        <section style={{ marginBottom: 32 }}>
          <div style={{
            padding: "12px 14px", borderLeft: "2px solid #1e1e1e",
            background: "#0b0b0b",
          }}>
            <p style={{ fontFamily: "Georgia, serif", fontSize: 12, color: "#555", margin: 0, lineHeight: 1.7 }}>
              Track the accuracy of your probability forecasts over time. Log decisions before they resolve,
              mark outcomes when they occur, and let the Brier Score reveal whether your uncertainty
              estimates are well-calibrated or systematically biased.
              BS = (1/N) Σ(f_t − o_t)² · Perfect = 0 · Coin flip = 0.25
            </p>
          </div>
        </section>

        {/* Add new prediction */}
        <section style={{ marginBottom: 32 }}>
          <Label>Log a New Prediction</Label>
          <div style={{ padding: "14px", border: "1px solid #1e1e1e", background: "#0b0b0b" }}>
            <div style={{ marginBottom: 12 }}>
              <textarea
                rows={2}
                style={{
                  width: "100%", padding: "10px 12px", background: "#111",
                  border: "1px solid #1e1e1e", color: "#d8d8d8",
                  fontFamily: "Georgia, serif", fontSize: 13, resize: "none",
                }}
                placeholder="Describe the outcome you are predicting..."
                value={addingDesc}
                onChange={(e) => setAddingDesc(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#555", flexShrink: 0 }}>
                Probability
              </span>
              <input
                type="range" min={0.01} max={0.99} step={0.01}
                value={addingProb}
                onChange={(e) => setAddingProb(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#f5f5f5", width: 40, textAlign: "right" }}>
                {(addingProb * 100).toFixed(0)}%
              </span>
            </div>
            <button
              onClick={addRecord}
              disabled={!addingDesc.trim()}
              style={{
                fontFamily: "monospace", fontSize: 10, letterSpacing: "0.08em",
                background: "#f5f5f5", color: "#000", border: "none",
                padding: "8px 16px", cursor: "pointer", opacity: addingDesc.trim() ? 1 : 0.35,
              }}
            >
              LOG PREDICTION
            </button>
          </div>
        </section>

        {/* Pending outcomes */}
        {pending.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <Label>Awaiting Resolution ({pending.length})</Label>
            <div style={{ border: "1px solid #1e1e1e" }}>
              {pending.map((r, i) => (
                <div key={r.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 60px 80px 80px 30px",
                  alignItems: "center", gap: 8,
                  padding: "10px 12px",
                  borderBottom: i < pending.length - 1 ? "1px solid #111" : "none",
                }}>
                  <span style={{ fontFamily: "Georgia, serif", fontSize: 12, color: "#909090", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.description}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#f5f5f5", textAlign: "right" }}>
                    {(r.forecasted_probability * 100).toFixed(0)}%
                  </span>
                  <button
                    onClick={() => resolveRecord(r.id, 1)}
                    style={{
                      fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em",
                      background: "#003318", color: "#00e87a",
                      border: "1px solid #00c060", padding: "4px 8px", cursor: "pointer",
                    }}
                  >✓ SUCCESS</button>
                  <button
                    onClick={() => resolveRecord(r.id, 0)}
                    style={{
                      fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em",
                      background: "#1a0000", color: "#ff3b3b",
                      border: "1px solid #cc0000", padding: "4px 8px", cursor: "pointer",
                    }}
                  >✗ FAILED</button>
                  <button
                    onClick={() => deleteRecord(r.id)}
                    style={{ fontFamily: "monospace", fontSize: 10, background: "none", border: "none", color: "#333", cursor: "pointer" }}
                  >×</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Resolved outcomes */}
        {resolved.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <Label>Resolved ({resolved.length})</Label>
            <div style={{ border: "1px solid #1e1e1e" }}>
              {resolved.map((r, i) => (
                <div key={r.id} style={{
                  display: "grid", gridTemplateColumns: "1fr 60px 60px 30px",
                  alignItems: "center", gap: 8,
                  padding: "8px 12px",
                  borderBottom: i < resolved.length - 1 ? "1px solid #111" : "none",
                  background: "#0b0b0b",
                }}>
                  <span style={{ fontFamily: "Georgia, serif", fontSize: 12, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.description}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#909090", textAlign: "right" }}>
                    {(r.forecasted_probability * 100).toFixed(0)}%
                  </span>
                  <span style={{
                    fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em",
                    color: r.actual_outcome === 1 ? "#00e87a" : "#ff3b3b",
                    textAlign: "right",
                  }}>
                    {r.actual_outcome === 1 ? "SUCCESS" : "FAILED"}
                  </span>
                  <button
                    onClick={() => deleteRecord(r.id)}
                    style={{ fontFamily: "monospace", fontSize: 10, background: "none", border: "none", color: "#333", cursor: "pointer" }}
                  >×</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Compute button */}
        {resolved.length >= 3 && (
          <section style={{ marginBottom: 32 }}>
            <button
              onClick={computeBrier}
              disabled={computing}
              style={{
                fontFamily: "monospace", fontSize: 11, letterSpacing: "0.08em",
                background: "#f5f5f5", color: "#000", border: "none",
                padding: "10px 20px", width: "100%", cursor: "pointer",
                opacity: computing ? 0.35 : 1,
              }}
            >
              {computing ? "COMPUTING..." : "COMPUTE BRIER SCORE"}
            </button>
          </section>
        )}

        {error && (
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#ff3b3b", marginBottom: 16 }}>
            ERROR: {error}
          </p>
        )}

        {/* Brier results */}
        {brierResult && (
          <section style={{ marginBottom: 32 }}>
            <Label>Calibration Analysis</Label>

            {/* Score cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "#1e1e1e", marginBottom: 1 }}>
              {[
                { label: "Brier Score", value: brierResult.brier_score.toFixed(4), note: "0 = perfect · 0.25 = coin flip" },
                { label: "Skill Score", value: brierResult.brier_skill_score.toFixed(4), note: "1 = perfect · 0 = no skill" },
                { label: "Quality", value: brierResult.calibration_quality, note: `${brierResult.resolved_records} resolved` },
              ].map((card) => (
                <div key={card.label} style={{ background: "#0b0b0b", padding: "14px 12px", textAlign: "center" }}>
                  <p style={{
                    fontFamily: "monospace", fontSize: 18, fontWeight: 700,
                    color: card.label === "Quality"
                      ? qualityColor[brierResult.calibration_quality] ?? "#909090"
                      : "#f5f5f5",
                    margin: 0, lineHeight: 1.2,
                  }}>
                    {card.value}
                  </p>
                  <p style={{ fontFamily: "Georgia, serif", fontSize: 9, fontStyle: "italic", color: "#555", marginTop: 5 }}>
                    {card.label}
                  </p>
                  <p style={{ fontFamily: "monospace", fontSize: 9, color: "#333", marginTop: 2 }}>
                    {card.note}
                  </p>
                </div>
              ))}
            </div>

            {/* Status flags */}
            <div style={{ padding: "10px 12px", background: "#0b0b0b", border: "1px solid #1e1e1e", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {brierResult.is_overconfident && (
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#ff7a00", letterSpacing: "0.1em" }}>
                    ⚠ OVERCONFIDENT — predicting higher than reality
                  </span>
                )}
                {brierResult.is_underconfident && (
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#d4c000", letterSpacing: "0.1em" }}>
                    ⚠ UNDERCONFIDENT — predicting lower than reality
                  </span>
                )}
                {!brierResult.is_overconfident && !brierResult.is_underconfident && (
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#00e87a", letterSpacing: "0.1em" }}>
                    ✓ WELL-CALIBRATED — no systematic bias detected
                  </span>
                )}
              </div>
            </div>

            {/* Reliability diagram */}
            {brierResult.calibration_bins.length > 0 && (
              <div style={{ padding: "14px", border: "1px solid #1e1e1e", background: "#0b0b0b", marginBottom: 8 }}>
                <p style={{ fontFamily: "monospace", fontSize: 9, color: "#555", letterSpacing: "0.1em", marginBottom: 10 }}>
                  RELIABILITY DIAGRAM — actual rate vs forecast per bin
                </p>
                <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 80, background: "#111", padding: "4px" }}>
                  {brierResult.calibration_bins.map((bin) => {
                    const errorColor = bin.calibration_error > 0.15 ? "#ff7a00"
                      : bin.calibration_error > 0.08 ? "#d4c000" : "#00c060";
                    return (
                      <div key={bin.bin_center} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 60 }}>
                          {/* Expected (ideal) */}
                          <div style={{
                            width: "100%", height: `${bin.bin_center * 60}px`,
                            background: "#1e1e1e", marginBottom: 1,
                          }} />
                          {/* Actual rate */}
                          <div style={{
                            width: "100%", height: `${bin.actual_rate * 60}px`,
                            background: errorColor, opacity: 0.8,
                          }} />
                        </div>
                        <span style={{ fontFamily: "monospace", fontSize: 8, color: "#333" }}>
                          {(bin.bin_center * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontFamily: "monospace", fontSize: 9, color: "#333", marginTop: 6 }}>
                  Grey = ideal calibration. Color = actual rate. Height mismatch = calibration error.
                </p>
              </div>
            )}

            {/* Recommendation */}
            <div style={{ padding: "12px 14px", borderLeft: "2px solid #1e1e1e", background: "#0b0b0b" }}>
              <p style={{ fontFamily: "Georgia, serif", fontSize: 12, color: "#909090", margin: 0, lineHeight: 1.65 }}>
                {brierResult.recommendation}
              </p>
            </div>

            {/* Platt scaling */}
            {brierResult.platt_a !== null && (
              <div style={{ marginTop: 16, padding: "14px", border: "1px solid #1e1e1e", background: "#0b0b0b" }}>
                <p style={{ fontFamily: "monospace", fontSize: 9, color: "#555", letterSpacing: "0.1em", marginBottom: 12 }}>
                  PLATT SCALING — calibrate a new probability estimate
                </p>
                <p style={{ fontFamily: "monospace", fontSize: 9, color: "#333", marginBottom: 10 }}>
                  A = {brierResult.platt_a?.toFixed(4)} · B = {brierResult.platt_b?.toFixed(4)}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#555" }}>Raw</span>
                  <input
                    type="range" min={0.01} max={0.99} step={0.01}
                    value={testProb}
                    onChange={(e) => setTestProb(parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#f5f5f5" }}>
                    {(testProb * 100).toFixed(0)}%
                  </span>
                  <button
                    onClick={applyPlatt}
                    style={{
                      fontFamily: "monospace", fontSize: 9, letterSpacing: "0.08em",
                      background: "#f5f5f5", color: "#000", border: "none",
                      padding: "6px 12px", cursor: "pointer",
                    }}
                  >CALIBRATE</button>
                </div>
                {plattResult && (
                  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}>
                      {(plattResult.raw_probability * 100).toFixed(0)}% raw
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#333" }}>→</span>
                    <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#f5f5f5" }}>
                      {(plattResult.calibrated_probability * 100).toFixed(1)}% calibrated
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: plattResult.adjustment < 0 ? "#ff7a00" : "#00c060" }}>
                      {plattResult.adjustment > 0 ? "+" : ""}{(plattResult.adjustment * 100).toFixed(1)}pp
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {records.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <p style={{ fontFamily: "Georgia, serif", fontSize: 13, fontStyle: "italic", color: "#333", lineHeight: 1.7 }}>
              No predictions logged yet.<br />
              Add your first prediction above and track it to resolution.
            </p>
          </div>
        )}

        {/* Footer */}
        <footer style={{ borderTop: "1px solid #1e1e1e", marginTop: 48, paddingTop: 20, display: "flex", justifyContent: "center", gap: 32 }}>
          {[
            { href: "/", label: "Simulator" },
            { href: "/model-card", label: "Model Card" },
          ].map((l) => (
            <Link key={l.href} href={l.href} style={{
              fontFamily: "Georgia, serif", fontSize: 11, fontStyle: "italic",
              color: "#555", textDecoration: "none",
            }}>{l.label}</Link>
          ))}
        </footer>
      </div>
    </main>
  );
}