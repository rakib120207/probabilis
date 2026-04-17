import Link from "next/link";

const BASE_URL = "https://web-production-810f7.up.railway.app";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/simulate",
    auth: false,
    description:
      "Run a Beta Monte Carlo simulation. Returns the full result including R-hat convergence, variance reduction, EVIU, and aleatory/epistemic decomposition.",
    request: `{
  "description": "Launching a B2B SaaS with 50 paying beta users",
  "base_probability": 0.45,
  "confidence": 0.6,
  "trials": 10000
}`,
    response: `{
  "mean": 0.4521,
  "std_dev": 0.1082,
  "confidence_interval_low": 0.2487,
  "confidence_interval_high": 0.6612,
  "rhat": 1.0023,
  "converged": true,
  "variance_reduction_pct": 24.3,
  "eviu": 0.0041,
  "uncertainty_type": "epistemic-dominant",
  "aleatory_fraction": 0.38,
  "epistemic_fraction": 0.62,
  "trials": 10000,
  "histogram_x": [...],
  "histogram_y": [...]
}`,
  },
  {
    method: "POST",
    path: "/extract",
    auth: false,
    description:
      "Extract probability and confidence estimates from a natural language scenario description. Uses Groq Llama 3.3 70B with rule-based linguistic fallback.",
    request: `{
  "description": "I have 3 years of experience and a referral
  for a senior data scientist role at a mid-size tech company"
}`,
    response: `{
  "suggested_probability": 0.52,
  "suggested_confidence": 0.68,
  "reasoning": "Referral and 3yr experience present strong positive signals
  against a competitive domain base rate of ~35%...",
  "extraction_mode": "ai (llama-3.3-70b-versatile)"
}`,
  },
  {
    method: "POST",
    path: "/assumptions",
    auth: false,
    description:
      "Extract named weighted assumptions from a scenario for the human-in-loop assumption audit editor.",
    request: `{
  "description": "Applying for a PhD scholarship with CGPA 3.8
  and two Q1 publications"
}`,
    response: `{
  "assumptions": [
    {
      "id": "pub_001",
      "label": "Strong publication record",
      "direction": "positive",
      "weight": 0.75,
      "description": "Two Q1 publications significantly exceed typical applicant profiles."
    }
  ],
  "synthesis_note": "Strong academic credentials offset by competitive domain."
}`,
  },
  {
    method: "POST",
    path: "/interpret",
    auth: false,
    description:
      "Generate structured risk interpretation from simulation output. Returns a five-level risk classification with fragility warning, epistemic note, and action framing.",
    request: `{
  "description": "...",
  "mean": 0.34,
  "std_dev": 0.14,
  "confidence_interval_low": 0.11,
  "confidence_interval_high": 0.61,
  "rhat": 1.003,
  "eviu": 0.012,
  "uncertainty_type": "epistemic-dominant",
  "aleatory_fraction": 0.38,
  "epistemic_fraction": 0.62
}`,
    response: `{
  "risk_profile": {
    "level": "high",
    "label": "High Risk",
    "color": "#f97316",
    "score": 2
  },
  "headline": "Estimated probability of 34.0% places this in the high risk zone...",
  "fragility_warning": "The 50pp confidence interval indicates...",
  "epistemic_note": "62% of uncertainty is reducible...",
  "convergence_note": null,
  "action_framing": "Identify the top 2–3 assumptions driving uncertainty...",
  "confidence_class": "medium",
  "spread_class": "wide"
}`,
  },
  {
    method: "POST",
    path: "/sensitivity",
    auth: false,
    description:
      "One-at-a-time Spearman rank correlation sensitivity analysis. Varies each parameter across its plausible range and reports the absolute impact.",
    request: `{
  "base_probability": 0.45,
  "confidence": 0.6,
  "trials": 3000
}`,
    response: `{
  "probability_sensitivity": 0.9934,
  "confidence_sensitivity": 0.8821,
  "probability_impact": 0.3821,
  "confidence_impact": 0.0912,
  "dominant_factor": "probability_estimate",
  "interpretation": "Your probability estimate dominates..."
}`,
  },
  {
    method: "POST",
    path: "/stress",
    auth: false,
    description:
      "Assumption stress test. Shifts base probability across a ±15pp grid and reports at which point the risk category changes — the fragility frontier.",
    request: `{
  "base_probability": 0.48,
  "confidence": 0.5
}`,
    response: `{
  "stress_points": [
    { "shift_pp": -15, "probability": 0.33, "mean": 0.328,
      "ci_low": 0.09, "ci_high": 0.58, "risk_category": "high" },
    { "shift_pp": 0, "probability": 0.48, "mean": 0.477,
      "ci_low": 0.21, "ci_high": 0.74, "risk_category": "moderate" }
  ],
  "fragility_frontier_pp": 5,
  "robust_range_pp": 5,
  "is_fragile": true
}`,
  },
  {
    method: "POST",
    path: "/portfolio",
    auth: false,
    description:
      "Multi-scenario portfolio analysis. Accepts 2–4 scenarios and returns risk-adjusted ranking, stochastic dominance relationships, highest upside, and best floor.",
    request: `[
  {
    "label": "S1",
    "description": "PhD application",
    "base_probability": 0.35,
    "confidence": 0.65,
    "mean": 0.347,
    "std_dev": 0.118,
    "confidence_interval_low": 0.13,
    "confidence_interval_high": 0.58,
    "eviu": 0.005,
    "uncertainty_type": "epistemic-dominant"
  },
  { "label": "S2", "description": "Consulting", "...": "..." }
]`,
    response: `{
  "ranked_labels": ["S2", "S1"],
  "ranked_scores": [0.38, 0.29],
  "dominance_pairs": [
    { "scenario_a": "S2", "scenario_b": "S1",
      "dominates": false, "overlap": 0.42, "mean_gap": 0.09 }
  ],
  "portfolio_spread": 0.09,
  "recommendation_basis": "S2 ranks highest on risk-adjusted composite score.",
  "highest_upside": "S2",
  "lowest_downside": "S2"
}`,
  },
  {
    method: "POST",
    path: "/report",
    auth: false,
    description:
      "Generate a LaTeX technical report from simulation session data. Returns raw .tex source — compile in Overleaf or pdflatex.",
    request: `{
  "title": "Probabilis Decision Simulation Report",
  "author": "Rakibul Islam",
  "institution": "Department of Statistics, SUST",
  "scenarios": [ { "description": "...", "mean": 0.45, "..." } ]
}`,
    response: `{
  "latex_source": "\\\\documentclass[11pt, a4paper]{article}\\n..."
}`,
  },
  {
    method: "POST",
    path: "/api/v1/simulate",
    auth: true,
    description:
      "Public authenticated endpoint — identical to /simulate but requires X-API-Key header. Use this for programmatic integration from external systems.",
    request: `# Header required:
X-API-Key: demo-key-2026

# Body:
{
  "description": "Testing the public API",
  "base_probability": 0.5,
  "confidence": 0.6
}`,
    response: `# Same response schema as /simulate`,
  },
  {
    method: "POST",
    path: "/api/v1/extract",
    auth: true,
    description:
      "Public authenticated endpoint — identical to /extract but requires X-API-Key header.",
    request: `X-API-Key: demo-key-2026

{ "description": "Your scenario here" }`,
    response: `# Same response schema as /extract`,
  },
];

export default function ApiDocs() {
  return (
    <main style={{ background: "#000", minHeight: "100vh", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <header style={{ marginBottom: 48 }}>
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 10,
              color: "#555",
              letterSpacing: "0.1em",
              textDecoration: "none",
              display: "inline-block",
              marginBottom: 20,
            }}
          >
            ← PROBABILIS
          </Link>
          <h1
            style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: 28,
              fontWeight: 400,
              fontStyle: "italic",
              color: "#f5f5f5",
              margin: 0,
            }}
          >
            API Reference
          </h1>
          <p
            style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: 11,
              fontStyle: "italic",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#555",
              marginTop: 6,
            }}
          >
            Probabilis v1.0 — REST API
          </p>
        </header>

        {/* Auth note */}
        <section
          style={{
            marginBottom: 40,
            padding: "12px 14px",
            border: "1px solid #1e1e1e",
            background: "#0b0b0b",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 9,
              color: "#555",
              letterSpacing: "0.12em",
              marginBottom: 10,
            }}
          >
            AUTHENTICATION
          </p>
          <p style={{ fontFamily: "Georgia, serif", fontSize: 13, color: "#909090", lineHeight: 1.6, margin: "0 0 10px" }}>
            Most endpoints are open. Authenticated endpoints (marked{" "}
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#f5f5f5" }}>AUTH</span>
            ) require an{" "}
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#f5f5f5" }}>X-API-Key</span>
            {" "}header.
          </p>
          <div
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 11,
              color: "#d8d8d8",
              background: "#111",
              padding: "8px 12px",
            }}
          >
            X-API-Key: demo-key-2026
          </div>
          <p
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 10,
              color: "#555",
              marginTop: 10,
              letterSpacing: "0.04em",
            }}
          >
            Base URL:{" "}
            <span style={{ color: "#909090" }}>{BASE_URL}</span>
            {" "} · OpenAPI spec:{" "}
            <a
              href={`${BASE_URL}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#909090" }}
            >
              {BASE_URL}/docs
            </a>
          </p>
        </section>

        {/* Endpoints */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {ENDPOINTS.map((ep) => (
            <section key={ep.path} style={{ borderTop: "1px solid #1e1e1e", paddingTop: 24 }}>
              {/* Endpoint header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    background: "#1a1a1a",
                    color: "#d8d8d8",
                    padding: "3px 8px",
                    border: "1px solid #2a2a2a",
                  }}
                >
                  {ep.method}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#f5f5f5",
                    letterSpacing: "0.02em",
                  }}
                >
                  {ep.path}
                </span>
                {ep.auth && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      color: "#555",
                      border: "1px solid #2a2a2a",
                      padding: "2px 6px",
                    }}
                  >
                    AUTH
                  </span>
                )}
              </div>

              {/* Description */}
              <p
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: 13,
                  color: "#909090",
                  lineHeight: 1.65,
                  marginBottom: 16,
                }}
              >
                {ep.description}
              </p>

              {/* Request / Response */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "REQUEST", code: ep.request },
                  { label: "RESPONSE", code: ep.response },
                ].map((block) => (
                  <div key={block.label}>
                    <p
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: 9,
                        color: "#555",
                        letterSpacing: "0.1em",
                        marginBottom: 6,
                      }}
                    >
                      {block.label}
                    </p>
                    <pre
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: 10,
                        color: "#909090",
                        background: "#0b0b0b",
                        border: "1px solid #1e1e1e",
                        padding: "10px 12px",
                        margin: 0,
                        overflow: "auto",
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {block.code}
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer
          style={{
            borderTop: "1px solid #1e1e1e",
            marginTop: 48,
            paddingTop: 20,
            display: "flex",
            justifyContent: "center",
            gap: 32,
          }}
        >
          {[
            { href: "/model-card", label: "Model Card" },
            { href: "/", label: "Simulator" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 11,
                fontStyle: "italic",
                color: "#555",
                textDecoration: "none",
                letterSpacing: "0.06em",
              }}
            >
              {link.label}
            </Link>
          ))}
        </footer>
      </div>
    </main>
  );
}
