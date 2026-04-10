// lib/betaPdf.ts
// Local computation of the Beta probability density function.
//
// This allows the distribution chart to update instantly on slider movement
// without any API call. The backend Monte Carlo simulation is still used
// for precise statistics (mean, variance, CI) — this is only for the
// visual curve shape, which is mathematically identical to the simulation's
// underlying distribution.

// Natural log of the Gamma function via Lanczos approximation.
// Accurate to 15 significant figures for x > 0.
function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Beta PDF: f(x; α, β) = x^(α-1) * (1-x)^(β-1) / B(α, β)
// where B(α, β) = Γ(α)Γ(β)/Γ(α+β)
function betaPdf(x: number, alpha: number, beta: number): number {
  if (x <= 0 || x >= 1) return 0;
  const lnB = lnGamma(alpha) + lnGamma(beta) - lnGamma(alpha + beta);
  return Math.exp((alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - lnB);
}

// Builds 100-point chart data from slider values alone — zero API calls.
// Returns the same format as buildChartData() so the chart component
// doesn't need to change.
export function buildLocalCurve(
  baseProbability: number,
  confidence: number
): { probability: number; density: number }[] {
  const strength = confidence * 20;
  const alpha = baseProbability * strength;
  const beta = (1 - baseProbability) * strength;

  // Guard against degenerate parameters that produce invalid distributions
  if (alpha < 0.1 || beta < 0.1) return [];

  const points = [];
  for (let i = 1; i <= 99; i++) {
    const x = i / 100;
    points.push({
      probability: i,
      density: parseFloat(betaPdf(x, alpha, beta).toFixed(4)),
    });
  }
  return points;
}