// lib/storage.ts
// Scenario persistence via browser localStorage.
// All data stays on the user's machine — no server storage.
//
// v3.1: Extended result fields so exportLatex can pass ALL enrichment data
// (decision, sensitivity, stress, copula, risk interpretation) to the backend.
// Previous versions only stored base simulation output; the report always
// generated with null enrichment sections.

const HISTORY_KEY = "probabilis_history_v1";

export type StoredScenario = {
  id: number;
  description: string;
  baseProbability: number;
  confidence: number;
  result: {
    // ── Core simulation ──────────────────────────────────────────────────────
    mean: number;
    std_dev: number;
    confidence_interval_low: number;
    confidence_interval_high: number;
    trials: number;
    rhat: number;
    eviu: number;
    uncertainty_type: string;
    variance_reduction_pct: number;
    aleatory_fraction?: number;
    epistemic_fraction?: number;
    // ── Simulation enrichment ────────────────────────────────────────────────
    risk?: number;
    adjusted_probability?: number;
    distribution_type?: string;
    domain?: string;
    // ── Decision analysis ────────────────────────────────────────────────────
    decision_action?: string;
    decision_eu_proceed?: number;
    decision_eu_abandon?: number;
    decision_regret?: number;
    decision_vpi?: number;
    decision_break_even?: number;
    // ── Sensitivity analysis ─────────────────────────────────────────────────
    sensitivity_dominant?: string;
    sensitivity_prob_impact?: number;
    sensitivity_conf_impact?: number;
    sensitivity_prob_rho?: number;
    sensitivity_conf_rho?: number;
    sensitivity_prob_variance_pct?: number;
    sensitivity_conf_variance_pct?: number;
    sensitivity_robustness?: string;
    // ── Stress test ──────────────────────────────────────────────────────────
    stress_fragile?: boolean;
    stress_frontier_pp?: number;
    stress_robust_range_pp?: number;
    // ── Risk interpretation ──────────────────────────────────────────────────
    risk_level?: string;
    risk_label?: string;
    risk_headline?: string;
    risk_action?: string;
    // ── Copula ───────────────────────────────────────────────────────────────
    copula_mean?: number;
    copula_std?: number;
    copula_tail_5?: number;
    copula_joint_failure?: number;
    copula_correlation_effect?: number;
    copula_tail_dependence?: number;
    copula_type?: string;
    copula_df?: number;
    copula_risk_factor_names?: string[];
  };
  extractionMode: string;
  timestamp: string;
  isoDate: string;
};

export function loadHistory(): StoredScenario[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: StoredScenario): void {
  try {
    const existing = loadHistory();
    // Replace existing entry with same id (allows enrichment updates)
    const without = existing.filter(e => e.id !== entry.id);
    const updated = [entry, ...without].slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}

export function exportSession(scenarios: StoredScenario[]): void {
  const payload = {
    tool: "Probabilis",
    version: "3.1",
    exported_at: new Date().toISOString(),
    methodology: {
      distribution: "Beta",
      sampling: "Monte Carlo with antithetic variates (Hammersley & Handscomb, 1964)",
      convergence: "Gelman-Rubin R-hat (Gelman & Rubin, 1992)",
      uncertainty_decomposition: "Der Kiureghian & Ditlevsen (2009) — semantic + mathematical blend",
    },
    scenarios,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `probabilis-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}