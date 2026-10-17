# Governing ESG — Findings Brief

**Question:** Does board governance predict how much ESG information a firm discloses?

**Data:** 206 firms, 1,236 firm-years, 2016–2021 (firm panel); 205 UK-listed companies with
director and remuneration detail; World Bank country governance indicators.

**Method:** OLS regression of ESG disclosure score on eight governance variables;
0–100 governance scorecard as a coefficient-weighted composite.

---

## 1. The board, not the paycheque, drives disclosure

The strongest predictors of ESG disclosure are **who sits on the board** and **whether their
pay is tied to ESG** — not how much executives are paid.

| Driver | Estimated effect on disclosure | Significant? |
|---|---|---|
| ESG-linked bonus | **+6.33 points** | Yes (p < 0.001) |
| Women in executive roles | **+0.35 points** | Yes (p < 0.001) |
| % women on board | **+0.19 points** | Yes (p = 0.007) |
| Board average tenure | **−0.48 points** | Yes (p < 0.001) |
| Board age range | −0.08 points | Yes (p = 0.047) |
| Board size | +0.14 points | No |
| ESG-linked compensation (as a flag) | +5.38 points | No |
| Executive pay level | ≈ 0 | No |

**Model fit:** R² = 0.199 (n = 1,236).

## 2. What this means

- **Gender diversity is a genuine disclosure lever.** More women on the board — and especially
  in the executive suite — is associated with materially higher disclosure. This matches the
  thesis's clearest supported finding.
- **Incentive design beats pay level.** Tying a bonus to ESG is the single largest lever in
  the model, while the size of executive pay shows *no* effect — a useful counter-narrative
  to "pay more to get more ESG".
- **Entrenched boards disclose less.** Longer average tenure and older boards are associated
  with *lower* disclosure, suggesting refresh matters more than experience.
- **The effect is modest overall.** Governance explains roughly one-fifth of disclosure
  variation; firm size, sector and regulation plausibly account for much of the rest.

## 3. Caveats

Associational, not causal. Firms are anonymised in the disclosure panel. The UK named layer
is a cumulative director roster, not an annual snapshot. Data ends in 2021.

---

*Produced from `outputs/app_data.json` by `src/01_clean.py`. Open the app
(`python3 -m http.server 8000`) to explore interactively.*
