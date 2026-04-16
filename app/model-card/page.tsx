import Link from "next/link";

const sections = [
  {
    title: "Model Details",
    items: [
      ["Model Name", "Probabilis v1.0"],
      ["Type", "Computational decision-support instrument for venture uncertainty"],
      ["Developed by", "Rakib, Department of Statistics, SUST"],
      ["Date", "April 2026"],
      ["Primary Use", "Expose early-stage venture uncertainty through editable assumptions and simulation diagnostics"],
      ["License", "MIT"],
    ],
  },
  {
    title: "Intended Use",
    items: [
      ["Primary Users", "Founders, accelerator managers, and researchers evaluating fragile venture assumptions"],
      ["Use Cases", "Startup idea stress testing, scenario comparison, and research communication about uncertainty"],
      ["Out-of-Scope", "Automatic startup validation, investment advice, or any claim that the model predicts success probability"],
    ],
  },
  {
    title: "Simulation Methodology",
    items: [
      ["Assumption inputs", "Structured variable ranges returned by the extraction contract and editable in the frontend"],
      ["Sampling", "Triangular draws per assumption with deterministic seed generation from normalized input plus schema version"],
      ["Trials", "10,000 maximum with adaptive stopping based on convergence diagnostics"],
      ["Convergence", "Gelman-Rubin R-hat threshold under 1.01 with effective sample size reporting"],
      ["Sensitivity", "Bootstrap confidence intervals on Spearman rank sensitivity outputs"],
      ["Decision framing", "Percentile scenario bands plus a decision-impact comparison between point estimates and uncertainty-aware runs"],
    ],
  },
  {
    title: "AI Extraction Layer",
    items: [
      ["Primary contract", "POST /extract returns variable proposals, confidence, epistemic status, and genealogy metadata"],
      ["Human role", "Users can override every extracted variable directly in the frontend assumptions editor"],
      ["Status semantics", "green = source-backed, amber = low-confidence estimate, red = unresolved ambiguity"],
      ["Known limitation", "Extraction quality depends on the backend evidence chain and can still encode poor source coverage"],
    ],
  },
  {
    title: "Evaluation",
    items: [
      ["Calibration", "Frontend scaffolding exists for a 20-case historical calibration study and failure taxonomy"],
      ["Primary artifact", "Interpretability and methodological clarity are prioritized over headline accuracy claims"],
      ["Diagnostics surfaced", "R-hat, ESS, ambiguity flags, sensitivity intervals, and temporal regime warnings"],
    ],
  },
  {
    title: "Limitations",
    items: [
      ["Not predictive truth", "Scenario bands describe model behavior under current assumptions; they are not ground-truth success probabilities"],
      ["Backend dependence", "The frontend is contract-first and inherits backend quality, calibration coverage, and evidence limitations"],
      ["Calibration scope", "A 20-case study is still narrow for strong external validity claims across sectors or eras"],
      ["Regime sensitivity", "Structural shifts after 2020 can break historical comparability even when the simulation converges numerically"],
    ],
  },
  {
    title: "Ethical Considerations",
    items: [
      ["Autonomy", "Users retain the final say on assumptions through direct edits and provenance review"],
      ["Transparency", "The interface exposes methodology notes, citations, ambiguity flags, and convergence diagnostics"],
      ["Misuse risk", "Outputs should support deliberation, not replace human decisions or due diligence"],
      ["Privacy", "Scenario text may be sent to the backend extraction pipeline depending on deployment configuration"],
    ],
  },
  {
    title: "References",
    items: [
      ["[1]", "Mitchell et al. (2019). Model Cards for Model Reporting. FAccT."],
      ["[2]", "Gelman et al. (2004). Bayesian Data Analysis. Chapter 11."],
      ["[3]", "Der Kiureghian & Ditlevsen (2009). Aleatory or epistemic? Does it matter? Structural Safety, 31(2)."],
      ["[4]", "Hammersley & Handscomb (1964). Monte Carlo Methods. Methuen."],
    ],
  },
] as const;

export default function ModelCard() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="probabilis-panel p-6 sm:p-8">
          <Link href="/" className="nav-chip mb-5 inline-flex">
            Back to Probabilis
          </Link>
          <p className="section-kicker">Model card</p>
          <h1 className="hero-title text-5xl sm:text-6xl">Probabilis v1.0</h1>
          <p className="mt-4 max-w-3xl text-base text-(--text-secondary) sm:text-lg">
            This card describes the current frontend-facing research instrument: intended use, visible diagnostics, and the limits users should understand before treating the output as meaningful.
          </p>
        </section>

        <section className="probabilis-panel p-5 sm:p-6">
          <div className="space-y-8">
            {sections.map((section) => (
              <div key={section.title}>
                <h2
                  className="mb-4 border-b pb-3 text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
                >
                  {section.title}
                </h2>
                <div className="space-y-3">
                  {section.items.map(([label, value]) => (
                    <div
                      key={`${section.title}-${label}`}
                      className="grid gap-2 rounded-3xl border p-4 md:grid-cols-[180px_1fr]"
                      style={{ borderColor: "var(--border-subtle)", background: "rgba(255,255,255,0.03)" }}
                    >
                      <div className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
                        {label}
                      </div>
                      <div className="text-sm leading-7" style={{ color: "var(--text-secondary)" }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Last updated: April 2026. This model card follows the accountability spirit of Mitchell et al. (2019), adapted to the current contract-first Probabilis build.
        </div>
      </div>
    </main>
  );
}
