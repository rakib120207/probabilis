# Probabilis Calibration Study
Version 1.0 | April 2026

## Design
20 scenarios across 6 domains. Expert estimate established from domain
literature before running the system. System run 3 times per scenario,
mean output recorded. Error = |Expert − System|.

## Results

| # | Domain | Scenario | Expert | System | Error |
|---|--------|----------|--------|--------|-------|
| 1 | PhD | CGPA 3.9, 3 Q1 papers, top-5 EU program | 75%-80% | 80% | N/A |
| 2 | PhD | CGPA 3.4, 0 papers, EU program | 5%-15% | 5% | N/A |
| 3 | PhD | CGPA 3.7, 2 Q1 papers, strong LoR, US program | 60% – 70% | 60% | N/A |
| 4 | Career | 5yr exp, strong portfolio, FAANG interview | 20% – 30%
 | 25% | N/A |
| 5 | Career | Fresh grad, no internship, senior role | 0%-5% | 5% | N/A |
| 6 | Career | 3yr exp, referral, mid-size tech | 40%-60% | 40% | N/A |
| 7 | Business | SaaS launch, 50 paying beta users, niche B2B | 35%-50% | 25% | 10% gap |
| 8 | Business | Consumer app, no traction, crowded market | 1%-5% | 5% | N/A |
| 9 | Business | Seed fundraise, prototype, ex-founder team | 25%-35% | 15% | 10% gap |
| 10 | Research | Q1 journal submission, strong methodology | 70%-85% | 84% | N/A |
| 11 | Research | Competitive conference, solid work | 20%-30% | 25% | N/A |
| 12 | Research | Grant proposal, good track record | 15%-25% | 25% | N/A |
| 13 | Finance | ETF investment 10yr horizon hitting 8%+ | 60%-70% | 55% | 5% gap |
| 14 | Finance | Single stock outperforming market | 20%-30% | 20% | N/A |
| 15 | Finance | Crypto returning 50%+ in 6 months | 15%-25% | 15% | N/A |
| 16 | Health | 5K race completion, trains 3×/week | 80%-95% | 80% | N/A |
| 17 | Health | Sustained 10kg weight loss over 6 months | 40%-50% | 65% | 15% gap |
| 18 | Exam | IELTS 7.0 with 3 months preparation | 55%-70% | 60% | N/A |
| 19 | Exam | ML engineering test, 6 months intensive study | 80%-95% | 70% | 10% gap |
| 20 | Exam | GRE Quant 165+ as Statistics graduate | 80%-95% | 80% | N/A |

## Summary
- MAE all scenarios: ___pp
- MAE AI extraction only: ___pp
- MAE linguistic fallback only: ___pp
- Best domain: Career & Research
- Worst domain: Health
- R-hat < 1.01 in all: Yes