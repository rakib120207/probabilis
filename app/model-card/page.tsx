import Link from "next/link";

export default function ModelCard() {
  const sections = [
    {
      title: "Model Details",
      rows: [
        ["Name", "Probabilis v1.0"],
        ["Type", "Uncertainty-aware decision simulation system"],
        ["Author", "Rakibul Islam, Department of Statistics, SUST"],
        ["Date", "April 2026"],
        ["Primary use", "Monte Carlo uncertainty quantification for decision scenarios"],
        ["License", "MIT"],
      ],
    },
    {
      title: "Intended Use",
      rows: [
        ["Primary users", "Researchers, analysts, decision-makers reasoning under uncertainty"],
        ["Use cases", "Career decisions, research planning, business scenarios, academic applications"],
        ["Out-of-scope", "Financial trading, medical diagnosis, legal risk, automated high-stakes decisions without human review"],
      ],
    },
    {
      title: "Simulation Methodology",
      rows: [
        ["Distribution", "Beta(α, β) — conjugate prior for bounded probability estimation"],
        ["Parameters", "α = p₀ × (c × 20),  β = (1 − p₀) × (c × 20)"],
        ["Sampling", "Antithetic variates Monte Carlo — Hammersley & Handscomb (1964)"],
        ["Trials", "10,000 default (configurable 100 – 100,000)"],
        ["Convergence", "Gelman-Rubin split-R̂ — Gelman & Rubin (1992), flagged if R̂ > 1.05"],
        ["Uncertainty decomp.", "Aleatory / epistemic separation — Der Kiureghian & Ditlevsen (2009)"],
        ["Decision theory", "EVIU quantifies value of distributional representation over point estimate"],
        ["Sensitivity", "Spearman rank correlation, one-at-a-time ±20pp / ±30pp variation"],
        ["Stress testing", "±15pp grid, fragility frontier detection, risk category tracking"],
      ],
    },
    {
      title: "AI Extraction Layer",
      rows: [
        ["Primary model", "Meta Llama 3.3 70B via Groq API"],
        ["Fallback", "Rule-based linguistic taxonomy with domain base rate anchoring"],
        ["Base rate anchoring", "14 domains (PhD ≈ 18%, scholarship ≈ 22%, startup ≈ 15%, FAANG ≈ 18%, BCS ≈ 12%)"],
        ["Task", "Maps natural language scenario to (p₀, c) for simulation parameterisation"],
        ["Known limitation", "LLM extraction is probabilistic — same scenario may yield slightly different estimates across runs"],
      ],
    },
    {
      title: "Evaluation",
      rows: [
        ["Calibration", "20 scenarios across 6 domains vs. expert-elicited ground truth"],
        ["Linguistic MAE", "< 12pp for domain-detected scenarios; > 22pp without base rate anchoring"],
        ["Convergence", "R̂ < 1.01 achieved in 100% of tested scenarios at default trial count"],
        ["Var. reduction", "Antithetic variates achieve 18–41% reduction across tested Beta parameterisations"],
      ],
    },
    {
      title: "Limitations",
      rows: [
        ["Subjectivity", "Probability estimates are user-defined. The system models uncertainty around the user's estimate, not ground truth."],
        ["Domain coverage", "Base rate anchoring covers 14 domains. Out-of-scope scenarios fall back to linguistic extraction with higher error."],
        ["LLM dependency", "AI extraction requires Groq API. Degrades gracefully to linguistic fallback."],
        ["Calibration scope", "20-scenario study — insufficient for strong statistical claims across all domains."],
        ["Stationarity", "Assumes stationary probability. Dynamic scenarios are not modelled."],
      ],
    },
    {
      title: "Ethical Considerations",
      rows: [
        ["Autonomy", "All estimates are user-controlled. Extraction mode is always displayed."],
        ["Transparency", "Assumption audit surfaces AI reasoning as editable weighted factors. R̂ flags convergence issues."],
        ["Misuse risk", "Outputs must inform, not replace, human judgment. Results are not objective probability measurements."],
        ["Data privacy", "Scenario text is sent to Groq API for AI extraction. No server-side storage. Sensitive scenarios should use linguistic mode."],
      ],
    },
    {
      title: "References",
      rows: [
        ["[1]", "Mitchell et al. (2019). Model Cards for Model Reporting. FAccT."],
        ["[2]", "Gelman & Rubin (1992). Inference from Iterative Simulation Using Multiple Sequences. Statistical Science."],
        ["[3]", "Der Kiureghian & Ditlevsen (2009). Aleatory or epistemic? Does it matter? Structural Safety, 31(2)."],
        ["[4]", "Hammersley & Handscomb (1964). Monte Carlo Methods. Methuen."],
      ],
    },
  ];

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
              letterSpacing: "0.02em",
            }}
          >
            Model Card
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
            Probabilis v1.0 — following Mitchell et al. (2019)
          </p>
        </header>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {sections.map((section) => (
            <section key={section.title}>
              {/* Section heading */}
              <div
                style={{
                  borderBottom: "1px solid #1e1e1e",
                  paddingBottom: 8,
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-serif), Georgia, serif",
                    fontSize: 10,
                    fontStyle: "italic",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#555",
                  }}
                >
                  {section.title}
                </span>
              </div>

              {/* Rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {section.rows.map(([label, value], i) => (
                  <div
                    key={label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr",
                      gap: 16,
                      padding: "9px 0",
                      borderBottom: i < section.rows.length - 1 ? "1px solid #111" : "none",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: 10,
                        color: "#555",
                        letterSpacing: "0.04em",
                        paddingTop: 2,
                        flexShrink: 0,
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-serif), Georgia, serif",
                        fontSize: 13,
                        color: "#909090",
                        lineHeight: 1.65,
                      }}
                    >
                      {value}
                    </span>
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
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 10,
              color: "#2e2e2e",
              letterSpacing: "0.06em",
            }}
          >
            Last updated: April 2026. Written following Mitchell et al. (2019).
          </p>
        </footer>
      </div>
    </main>
  );
}
