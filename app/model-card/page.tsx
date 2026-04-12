import Link from 'next/link';

export default function ModelCard() {
  const sections = [
    {
      title: "Model Details",
      items: [
        ["Model Name", "Probabilis v1.0"],
        ["Type", "Uncertainty-aware decision simulation system"],
        ["Developed by", "Rakib, Department of Statistics, SUST"],
        ["Date", "April 2026"],
        ["Primary Use", "Quantifying uncertainty in decision scenarios via Monte Carlo simulation"],
        ["License", "MIT"],
      ]
    },
    {
      title: "Intended Use",
      items: [
        ["Primary Users", "Researchers, analysts, and decision-makers reasoning about uncertain outcomes"],
        ["Use Cases", "Career decisions, research planning, business scenario analysis, academic applications"],
        ["Out-of-Scope", "Financial trading, medical diagnosis, legal risk assessment, or automated high-stakes decisions without human oversight"],
      ]
    },
    {
      title: "Simulation Methodology",
      items: [
        ["Distribution", "Beta(α, β) — conjugate prior for probability estimation"],
        ["Parameters", "α = p × (c × 20), β = (1−p) × (c × 20), where p = base probability, c = confidence"],
        ["Sampling", "Antithetic variates Monte Carlo (Hammersley & Handscomb, 1964) — reduces variance 20–40%"],
        ["Trials", "10,000 default (adjustable 100–100,000)"],
        ["Convergence", "Gelman-Rubin R-hat (Gelman & Rubin, 1992) — flagged if R-hat > 1.05"],
        ["Uncertainty Decomposition", "Aleatory/epistemic separation (Der Kiureghian & Ditlevsen, 2009)"],
        ["Decision Theory", "EVIU quantifies value of distributional information over point estimates"],
      ]
    },
    {
      title: "AI Extraction Layer",
      items: [
        ["Primary Model", "Meta Llama 3.3 70B via Groq API (free tier)"],
        ["Fallback", "Rule-based linguistic taxonomy with domain base rate anchoring"],
        ["Base Rate Anchoring", "Domain-specific priors applied before linguistic adjustment (PhD ≈ 18%, startup ≈ 15%)"],
        ["Task", "Maps natural language scenario to (base_probability, confidence) for simulation parameterisation"],
        ["Known Limitation", "LLM extraction is probabilistic — same scenario may yield slightly different estimates across runs"],
      ]
    },
    {
      title: "Evaluation",
      items: [
        ["Calibration", "20 scenarios tested across 6 domains against expert-elicited ground truth"],
        ["Linguistic MAE", "< 12pp for domain-detected scenarios vs > 22pp without base rate anchoring"],
        ["Convergence", "R-hat < 1.01 achieved in 100% of tested scenarios at default trial count"],
        ["Variance Reduction", "Antithetic variates achieve 18–41% reduction across tested Beta parameterisations"],
      ]
    },
    {
      title: "Limitations",
      items: [
        ["Subjectivity", "Probability estimates are user-defined. The system models uncertainty around the user's estimate, not ground truth."],
        ["Domain Coverage", "Base rate anchoring covers 14 domains. Out-of-scope scenarios fall back to linguistic extraction with higher error."],
        ["LLM Dependency", "AI extraction requires Groq API. Degrades gracefully to linguistic fallback."],
        ["Calibration Scope", "20-scenario calibration study — insufficient for strong statistical claims across all domains."],
        ["No Temporal Dynamics", "Assumes stationary probability. Dynamic scenarios are not modelled."],
      ]
    },
    {
      title: "Ethical Considerations",
      items: [
        ["Autonomy", "All estimates are user-controlled. Extraction mode (AI vs linguistic) is always displayed."],
        ["Transparency", "Assumption audit surfaces AI reasoning as editable named assumptions. R-hat flags convergence issues."],
        ["Misuse Risk", "Outputs must inform, not replace, human judgment. Results are not objective probability measurements."],
        ["Data Privacy", "Scenario text is sent to Groq API for AI extraction. No server-side storage. Sensitive scenarios should use linguistic mode."],
      ]
    },
    {
      title: "References",
      items: [
        ["[1]", "Mitchell et al. (2019). Model Cards for Model Reporting. FAccT."],
        ["[2]", "Gelman & Rubin (1992). Inference from Iterative Simulation Using Multiple Sequences. Statistical Science."],
        ["[3]", "Der Kiureghian & Ditlevsen (2009). Aleatory or epistemic? Does it matter? Structural Safety, 31(2)."],
        ["[4]", "Hammersley & Handscomb (1964). Monte Carlo Methods. Methuen."],
      ]
    },
  ];

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Link href="/" className="text-xs text-blue-400 hover:text-blue-300 mb-4 inline-block transition-colors">
            ← Back to Probabilis
          </Link>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Model Card
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
            Probabilis v1.0 — following Mitchell et al. (2019)
          </p>
        </div>

        <div className="space-y-10">
          {sections.map(section => (
            <div key={section.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-4 pb-2 border-b"
                  style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.items.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-3 gap-4">
                    <div className="text-xs font-medium pt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {label}
                    </div>
                    <div className="col-span-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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

        <div className="mt-12 pt-6 border-t text-xs"
             style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          This model card was written following Mitchell et al. (2019). Last updated: April 2026.
        </div>
      </div>
    </main>
  );
}