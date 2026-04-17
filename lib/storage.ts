// lib/storage.ts
// Scenario persistence via browser localStorage.
// All data stays on the user's machine — no server storage.
//
// Change: added aleatory_fraction and epistemic_fraction to StoredScenario.result
// so that the LaTeX export uses actual computed values instead of hardcoded 0.6/0.4.

const HISTORY_KEY = "probabilis_history_v1";

export type StoredScenario = {
  id: number;
  description: string;
  baseProbability: number;
  confidence: number;
  result: {
    mean: number;
    std_dev: number;
    confidence_interval_low: number;
    confidence_interval_high: number;
    trials: number;
    rhat: number;
    eviu: number;
    uncertainty_type: string;
    variance_reduction_pct: number;
    aleatory_fraction?: number;   // actual computed fraction from simulation
    epistemic_fraction?: number;  // actual computed fraction from simulation
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
    const updated = [entry, ...existing].slice(0, 20);
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
    version: "1.0",
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
