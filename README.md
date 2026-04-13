# Probabilis

**Uncertainty-aware decision simulation for researchers and analysts.**

Probabilis translates natural language scenario descriptions into statistically
grounded probability distributions using Monte Carlo simulation.

## Live

🔗 [probabilis.vercel.app](https://probabilis.vercel.app)  
📋 [Model Card](https://probabilis.vercel.app/model-card)

## Features

- AI extraction via Groq Llama 3.3 70B with rule-based fallback
- Beta-distributed Monte Carlo with antithetic variates (Hammersley & Handscomb, 1964)
- Gelman-Rubin R-hat convergence diagnostic (Gelman & Rubin, 1992)
- Aleatory/epistemic uncertainty decomposition (Der Kiureghian & Ditlevsen, 2009)
- Expected Value of Including Uncertainty (EVIU)
- Spearman rank sensitivity analysis
- Human-in-loop assumption audit
- Scenario comparison (overlaid distributions)
- Persistent history + JSON export
- Model Card (Mitchell et al., 2019)

## Architecture
Next.js 16 (Vercel)   ←→   FastAPI (Railway)
Local Beta PDF               NumPy + SciPy
Instant chart preview        Monte Carlo engine

## Run Locally

```bash
# Backend
cd probabilis-api && pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd probabilis && npm install && npm run dev
```

## References

1. Mitchell et al. (2019). Model Cards for Model Reporting. FAccT.
2. Gelman & Rubin (1992). Inference from Iterative Simulation. Statistical Science.
3. Der Kiureghian & Ditlevsen (2009). Aleatory or epistemic? Structural Safety.
4. Hammersley & Handscomb (1964). Monte Carlo Methods. Methuen.

---
Built as a research portfolio instrument for PhD applications.
Author: Rakibul Islam — Statistics undergraduate, SUST.