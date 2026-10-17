# Governing ESG

**Does board governance drive ESG disclosure?**

An interactive, reproducible analytics project built on an MSc Finance & Management
dissertation dataset (Cranfield University, 2022). It studies whether board composition,
gender diversity and incentive design explain the level of ESG disclosure a firm provides —
and packages the result as a small web application.

---

## Live app

The project is a static site (no build step).

```bash
# 1. (re)build the dataset from the Excel sources
python3 src/01_clean.py

# 2. serve the folder
python3 -m http.server 8000

# 3. open
# http://localhost:8000
```

Requires only `openpyxl` (`pip install openpyxl`). Everything else uses the Python
standard library, and the front end is plain HTML/CSS/JS with a locally-vendored Chart.js.

---

## What you can do in the app

- **About** — the landing page: what the app is, how it works (a 4-step pipeline), what you can do, the research behind it, headline findings and why it matters.
- **Overview** — the research question, headline findings and trend charts, plus a company search bar.
- **Company Lookup** — *type a company name and press Search* to get that company's board profile and a headline **Board Gender Diversity Score (0–100)**, its percentile among UK peers, and the disclosure reading implied by the research. Also includes a **compare-two-companies** panel (side-by-side scores with the implied disclosure gap).
- **What-if** — an interactive calculator: dial in a hypothetical board (gender diversity, board size, tenure, ESG-linked pay) and see the **predicted ESG disclosure score** update live, with a breakdown of each driver's contribution, presets, and a **95% prediction band** (plus the much tighter confidence interval for the average firm) so the uncertainty is explicit.
- **Firm Explorer** — filter the 1,236 firm-year panel and read the governance ↔ disclosure relationship.
- **Scorecard** — 206 firms ranked on a coefficient-weighted governance score.
- **Model** — the regression, replicated from the source data.
- **Method** — sources, method and limitations.

---

## The research question

Corporate governance is increasingly treated as a driver of ESG outcomes. This project
tests one direction of that relationship: **do governance characteristics predict how much
ESG information a firm discloses?** It extends a thesis that examined S&P 500 firms and
focused on three governance channels — executive pay, board gender diversity, and the
country-level governance environment.

## Data

| Layer | Content | Size |
|---|---|---|
| **Firm panel** | Governance variables + ESG disclosure score, 2016–2021, firms anonymised | 206 firms × 6 yrs = **1,236 firm-years** |
| **Pay panel** | Pooled ESG score vs executive compensation | **624** observations |
| **UK named layer** | Director roster (gender, age) + directors' remuneration 2003–2021 | **205** companies |
| **Country panel** | GDP growth + World Bank governance estimates | **252** observations |

Sources: Refinitiv/Bloomberg-style firm panel, a BoardEx/Fame UK export, and World Bank
indicators, as assembled in the original dissertation.

## Method

- **OLS regression** of ESG disclosure score on eight governance variables, estimated by
  normal equations in pure Python — no statsmodels/numpy required, so the pipeline
  reproduces anywhere.
- **Governance scorecard:** a 0–100 coefficient-weighted composite of the disclosure-driving
  variables, min–max scaled across firm-years.
- **Uncertainty:** the what-if calculator reports a 95% prediction interval computed as
  ŷ ± t·σ·√(1 + xᵀ(XᵀX)⁻¹x), using the exported residual standard error and inverse
  cross-product matrix — the honest range for a single firm — alongside the far tighter
  confidence interval for the average.
- **Front end:** vanilla JavaScript single-page app with Chart.js.

### Headline results (replicated exactly from the thesis)

| Driver | Effect on ESG disclosure | Significance |
|---|---|---|
| ESG-linked bonus | **+6.33** | p < 0.001 |
| Women executives | **+0.35** | p < 0.001 |
| % women on board | **+0.19** | p = 0.007 |
| Board average tenure | **−0.48** | p < 0.001 |
| Board age range | −0.08 | p = 0.047 |
| Board size | +0.14 | n.s. |
| ESG-linked compensation | +5.38 | n.s. |
| Executive pay (level) | ~0 (neutral) | n.s. |

Model R² = **0.199** (n = 1,236). Coefficients match the original STATA output to three
decimal places.

**Takeaway:** board *gender diversity* and *ESG-linked incentives* predict disclosure;
the *level* of executive pay does not.

## Limitations (read before quoting numbers)

- **Associational, not causal.** The model shows correlation, not that changing a board
  causes disclosure to change.
- **Anonymised firm panel.** The disclosure-score panel carries no company names, and it did
  not reconcile to the named UK export, so the two layers are presented separately.
- **Cumulative roster.** UK board metrics count directors listed in the export, which may
  span several years — a profile, not a single-year snapshot.
- **Historic window.** Data ends in 2021; disclosure norms have moved quickly since.
- **Framing note.** The thesis narrative cites US firms, while the raw board/remuneration
  export is UK-listed — flagged for reconciliation rather than hidden.

## Project structure

```
esg-governance-project/
├── index.html                 # the app
├── assets/
│   ├── style.css
│   ├── app.js                 # views, charts, tables
│   └── chart.umd.min.js       # vendored Chart.js (offline-safe)
├── src/
│   └── 01_clean.py            # Excel → tidy JSON pipeline + OLS
├── outputs/
│   ├── app_data.json          # generated dataset for the app
│   └── findings_brief.md      # one-page analyst write-up
├── data/                      # source Excel files (input)
└── README.md
```

## Tech / skills demonstrated

`Python` (data wrangling, OLS from scratch) · `ESG metrics & scoring methodology` ·
`regression analysis` · `data visualisation (Chart.js)` · `front-end (HTML/CSS/JS)` ·
`reproducible analytics` · `analyst writing`

## Publishing (what goes public)

This project is built to be published as a static site with **code and derived results
only** — the raw licensed data and the thesis are never included.

- `.gitignore` excludes `data/`, any `.xlsx` / `.pdf` / `.rtf`, and build artefacts.
- `python3 package_public.py` assembles a publish-ready `dist/` bundle
  (app + code + `outputs/app_data.json`).
- The app reads only `outputs/app_data.json`, a **derived** dataset — no raw vendor files
  are shipped.

### Deploy to GitHub Pages

1. Create a **public** repository on github.com (e.g. `governing-esg`).
2. Upload the contents of `dist/` (drag-and-drop in the browser), or push with git —
   `data/` is git-ignored automatically either way.
3. Repo **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**.
4. Your site appears at `https://<username>.github.io/<repo>/`.

> **Public by design:** a GitHub Pages site is visible to anyone with the URL. The repo may
> be private on paid plans, but the published site is not.

## Attribution

Original dataset and research framing: Vaasavi Singh, *The Effect of ESG Performance on
Corporate Governance* (MSc Finance and Management, Cranfield School of Management, 2022).
This project re-packages and extends that work as an interactive application.
