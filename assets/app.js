/* Governing ESG — interactive analytics app
   Vanilla JS + Chart.js. Loads outputs/app_data.json (built by src/01_clean.py). */

const TABS = [
  { id: "about",     label: "About" },
  { id: "overview",  label: "Overview" },
  { id: "lookup",    label: "Company Lookup" },
  { id: "whatif",    label: "What-if" },
  { id: "explorer",  label: "Firm Explorer" },
  { id: "scorecard", label: "Scorecard" },
  { id: "model",     label: "Model" },
  { id: "method",    label: "Method" },
];

const state = {
  data: null,
  charts: {},
  explorer: { year: "all", minWomen: 0, sort: { key: "esg_disclosure", dir: -1 } },
  scorecard: { sort: { key: "gov_score", dir: -1 } },
  lookup: { query: "", submitted: "", selected: null, compareA: "", compareB: "", sort: { key: "diversity_score", dir: -1 } },
  whatif: null,
};

/* research coefficients surfaced in the UI (from the H2 model) */
const RESEARCH = { pctWomenCoef: 0.1851, pctWomenP: 0.007, bonusCoef: 6.3347, tenureCoef: -0.4822, r2: 0.199 };

/* ---------------- tiny helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const fmt = (n, d = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const fmt0 = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/* inline SVG icons (Lucide-style, no emoji) */
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  lookup: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  whatif: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  explorer: '<line x1="3" y1="3" x2="3" y2="21"/><line x1="3" y1="21" x2="21" y2="21"/><circle cx="9" cy="14" r="1.6"/><circle cx="14" cy="9" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  scorecard: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  model: '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/>',
};

function icon(name) {
  const span = document.createElement("span");
  span.className = "ficon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || "") + "</svg>";
  return span;
}

function labelCharts() {
  document.querySelectorAll("canvas").forEach((c) => {
    c.setAttribute("role", "img");
    if (!c.getAttribute("aria-label")) {
      const card = c.closest(".card");
      const h = card && card.querySelector("h2, h3");
      c.setAttribute("aria-label", h ? "Chart: " + h.textContent.trim() : "Chart");
    }
  });
}

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

function destroyCharts() {
  Object.values(state.charts).forEach((c) => c && c.destroy && c.destroy());
  state.charts = {};
}

function chart(id, config) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart(ctx, config);
}

function histBins(values, bins = 14) {
  const vs = values.filter((v) => v !== null && v !== undefined);
  if (!vs.length) return { labels: [], counts: [] };
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const w = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  vs.forEach((v) => { counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++; });
  const labels = counts.map((_, i) => (lo + i * w).toFixed(0));
  return { labels, counts };
}

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { boxWidth: 12, font: { size: 12 } } } },
  scales: {
    x: { grid: { color: "#eef1f0" }, ticks: { color: "#5d6b64", font: { size: 11 } } },
    y: { grid: { color: "#eef1f0" }, ticks: { color: "#5d6b64", font: { size: 11 } } },
  },
};

/* ---------------- boot ---------------- */
async function init() {
  try {
    const res = await fetch("outputs/app_data.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
  } catch (e) {
    $("#view").innerHTML = `<div class="card"><h2>Could not load data</h2>
      <p>Run <code>python3 src/01_clean.py</code> from the project root, then serve the folder
      (<code>python3 -m http.server 8000</code>) and open <code>http://localhost:8000</code>.</p>
      <p class="note">${e}</p></div>`;
    return;
  }
  buildNav();
  window.addEventListener("hashchange", route);
  route();
}

function buildNav() {
  TABS.forEach((t) =>
    $("#nav").append(el("button", { type: "button", "data-tab": t.id, onclick: () => { location.hash = t.id; } }, t.label)));
}

function route() {
  const tab = location.hash.slice(1) || "about";
  const valid = TABS.some((t) => t.id === tab) ? tab : "about";
  document.querySelectorAll("#nav button").forEach((b) => {
    const on = b.dataset.tab === valid;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  destroyCharts();
  const view = $("#view");
  view.innerHTML = "";
  RENDER[valid](view);
  labelCharts();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =======================================================================
   ABOUT
   ======================================================================= */
function renderAbout(root) {
  const m = state.data.meta;
  const go = (id) => () => { location.hash = id; };

  root.append(el("section", { class: "about-hero" },
    el("p", { class: "eyebrow" }, "ESG · Corporate Governance · Data Analytics"),
    el("h1", {}, "Governing ESG"),
    el("p", { class: "about-sub" }, "Does board governance drive ESG disclosure? This app tests whether who sits on a company's board — and how its leaders are paid — predicts how much ESG information the company discloses."),
    el("p", { class: "lead" }, "It is built on an MSc Finance & Management dissertation (Cranfield University, 2022) and turns that academic research into a working tool you can explore, apply to real companies, and simulate."),
    el("div", { class: "cta-row" },
      el("button", { class: "btn primary", onclick: go("lookup") }, "Look up a company"),
      el("button", { class: "btn", onclick: go("whatif") }, "Try the what-if calculator"),
      el("button", { class: "btn", onclick: go("method") }, "Read the method"))));

  // ---- what it is ----
  root.append(el("div", { class: "card section" },
    el("h2", {}, "What this app is"),
    el("p", {}, "Environmental, Social and Governance (ESG) disclosure — how transparently a firm reports on sustainability — is increasingly used by investors to judge risk. This app asks a specific question: can that disclosure be explained by a firm's ", el("strong", {}, "corporate governance"), "? It analyses ", el("strong", {}, `${fmt0(m.firm_observations)} firm-year observations`), " across ", el("strong", {}, `${m.firms} firms`), " over ", el("strong", {}, `${m.years[0]}–${m.years[m.years.length - 1]}`), ", runs a statistical model, and lets anyone interrogate the result — by searching a company, comparing two, or designing a hypothetical board."),
    el("p", { class: "note" }, "Academic research usually ends as a PDF. This project's contribution is to make the findings interactive, reproducible and usable — the part a data or ESG analyst actually does.")));

  // ---- how it works ----
  const steps = [
    ["1", "Gather the data", `${fmt0(m.firm_observations)} firm-year records with governance variables and an ESG disclosure score, plus 205 named UK-listed companies and World Bank country governance data.`],
    ["2", "Clean and join", "A dependency-light Python pipeline turns the raw Excel sources into one tidy dataset — reproducible with a single command, no heavy libraries."],
    ["3", "Model the relationship", "An ordinary least-squares regression estimates how each governance lever relates to ESG disclosure. It replicates the original thesis exactly (R² = 0.199)."],
    ["4", "Turn it into a tool", "Apply the model: score real companies, compare them side by side, and simulate boards — with an explicit uncertainty band, not just a single number."],
  ];
  const stepsGrid = el("div", { class: "steps" });
  steps.forEach(([n, t, d]) => stepsGrid.append(el("div", { class: "step" },
    el("div", { class: "n" }, n), el("h3", {}, t), el("p", {}, d))));
  root.append(el("div", { class: "section" }, el("h2", {}, "How it works"), stepsGrid));

  // ---- what you can do ----
  const features = [
    ["overview", "Overview", "The research question, headline findings and year-on-year trends."],
    ["lookup", "Company Lookup", "Search a UK company for its board profile and governance score — and compare two companies side by side."],
    ["whatif", "What-if calculator", "Design a board and see the ESG disclosure score the model predicts, live, with a 95% range."],
    ["explorer", "Firm Explorer", "Filter the underlying 1,236 firm-year panel and read the relationship yourself."],
    ["scorecard", "Scorecard", "206 firms ranked on a transparent governance score."],
    ["model", "Model", "The regression itself: coefficients, standard errors and significance."],
  ];
  const featGrid = el("div", { class: "feat-grid" });
  features.forEach(([id, t, d]) => featGrid.append(el("div", { class: "feat" },
    icon(id), el("h3", {}, t), el("p", {}, d),
    el("button", { class: "btn go", type: "button", onclick: go(id) }, "Open →"))));
  root.append(el("div", { class: "section" }, el("h2", {}, "What you can do"), featGrid));

  // ---- the research ----
  root.append(el("div", { class: "card section" },
    el("h2", {}, "The research behind it"),
    el("p", {}, "This app extends the dissertation ", el("em", {}, "The Effect of ESG Performance on Corporate Governance"), " (Vaasavi Singh, MSc Finance & Management, Cranfield School of Management, 2022; supervisor Dr Matthias Nnadi). The thesis tested three hypotheses:"),
    el("div", { class: "finding" }, el("span", { class: "pill pos" }, "supported"), el("div", {}, el("div", { class: "t" }, "More women on the board → higher ESG performance"), el("div", { class: "d" }, "Gender diversity on the board and in the executive suite is positively associated with disclosure."))),
    el("div", { class: "finding" }, el("span", { class: "pill ns" }, "no effect"), el("div", {}, el("div", { class: "t" }, "Executive pay → no significant effect"), el("div", { class: "d" }, "The level of executive pay showed no significant link to ESG — a result that contradicted earlier studies."))),
    el("div", { class: "finding" }, el("span", { class: "pill info" }, "partial"), el("div", {}, el("div", { class: "t" }, "ESG determinants → GDP growth"), el("div", { class: "d" }, "Only regulatory quality among the country-level determinants was significant."))),
    el("p", { class: "note" }, "The app recomputes the firm-level findings from the raw data and builds on them, rather than simply reporting them.")));

  // ---- key findings ----
  const fgrid = el("div", { class: "grid cols-4" });
  fgrid.append(
    metricTile("+6.3", "points from an ESG-linked bonus", "largest single lever"),
    metricTile("+0.19", "points per +1pp women on board", "p = 0.007"),
    metricTile("−0.48", "points per extra year of tenure", "entrenchment effect"),
    metricTile("≈ 0", "effect of executive pay level", "not significant"));
  root.append(el("div", { class: "section" }, el("h2", {}, "Headline findings"), fgrid));

  // ---- why it matters ----
  root.append(el("div", { class: "section" },
    el("h2", {}, "Why it is useful"),
    el("div", { class: "grid cols-3" },
      el("div", { class: "card" }, el("h3", {}, "For investors"), el("p", { class: "note" }, "Governance signals — board diversity and ESG-linked pay — can be read as early indicators of disclosure quality and sustainability commitment.")),
      el("div", { class: "card" }, el("h3", {}, "For companies"), el("p", { class: "note" }, "It shows which governance levers actually move ESG disclosure, and which (like raising executive pay) do not.")),
      el("div", { class: "card" }, el("h3", {}, "For analysts & researchers"), el("p", { class: "note" }, "A worked, reproducible example of the full pipeline: data engineering, regression, scoring methodology, visualisation and communication.")))));

  root.append(el("div", { class: "card section honesty" },
    el("h3", {}, "Honest about limits"),
    el("p", { class: "note" }, "The relationship is associational, not causal; the disclosure panel is anonymised; data ends in 2021; and governance explains only about a fifth of disclosure variation — so predictions come with wide ranges. See the Method tab for the full picture."),
    el("button", { class: "btn", onclick: go("method") }, "Read the Method →")));
}

/* =======================================================================
   OVERVIEW
   ======================================================================= */
function renderOverview(root) {
  const d = state.data, s = d.summary, m = d.meta;
  root.append(
    el("p", { class: "eyebrow" }, "ESG · Corporate Governance · Data Analytics"),
    el("h1", {}, "Does board governance drive ESG disclosure?"),
    el("p", { class: "lead" },
      "An interactive analysis of ", el("strong", {}, `${m.firms} firms`),
      " over ", el("strong", {}, `${m.years[0]}–${m.years[m.years.length - 1]}`),
      ". We test whether board composition, gender diversity and incentive design explain the level of ESG disclosure a firm provides — and show which governance levers actually move the dial.")
  );

  // hero lookup
  const heroForm = el("form", { class: "searchbar", onsubmit: (e) => {
    e.preventDefault();
    const q = heroForm.querySelector("input").value;
    state.lookup.query = q; state.lookup.submitted = q;
    state.lookup.selected = findMatches(q)[0] || null;
    location.hash = "lookup";
  } });
  heroForm.append(
    el("input", { type: "text", list: "allCompanies", placeholder: "Enter a company name, e.g. Royal Mail", value: state.lookup.query }),
    el("button", { class: "btn primary", type: "submit" }, "Search"),
    companyDatalist());
  root.append(el("div", { class: "section card hero" },
    el("h2", {}, "Look up a company"),
    el("p", { class: "note", style: "margin:-4px 0 12px" }, "Type a UK-listed company name to see its board profile and what this research implies for its ESG disclosure."),
    heroForm));

  const kpis = el("div", { class: "grid cols-4 section" });
  const addK = (v, l, cls = "", sub = "") =>
    kpis.append(el("div", { class: "kpi" }, el("div", { class: "v " + cls }, v), el("div", { class: "l" }, l), sub ? el("div", { class: "sub" }, sub) : null));
  addK(fmt0(m.firm_observations), "Firm-year observations", "", `${m.firms} firms × ${m.years.length} years`);
  addK(fmt(s.esg_disclosure_mean, 1), "Mean ESG disclosure score", "good", `range ${s.esg_disclosure_min}–${s.esg_disclosure_max}`);
  addK(fmt(s.pct_women_mean, 1) + "%", "Mean women on board", "", "board gender diversity");
  addK("0.199", "Model R²", "", "governance explains ~20% of disclosure");
  root.append(kpis);

  const findings = el("div", { class: "card" }, el("h2", {}, "What the model found"));
  [
    ["pos", "More women on the board → higher disclosure", "Each +1pp of female board representation is associated with a higher ESG disclosure score (coef 0.185, p = 0.007)."],
    ["pos", "More women executives → higher disclosure", "Female representation in the executive suite is positively and strongly associated with disclosure (coef 0.348, p < 0.001)."],
    ["pos", "ESG-linked bonus → much higher disclosure", "The single largest lever: firms tying bonuses to ESG show ~6.3 points higher disclosure, all else equal (p < 0.001)."],
    ["neg", "Longer board tenure → lower disclosure", "Boards with a longer average tenure disclose less (coef −0.482, p < 0.001) — entrenchment, not experience."],
    ["neg", "Older boards → slightly lower disclosure", "Higher average board age is weakly associated with less disclosure (coef −0.076, p = 0.047)."],
    ["ns", "Executive pay level → no effect", "Consistent with the thesis: the size of executive pay shows no significant link to disclosure on its own."],
  ].forEach(([kind, t, desc]) =>
    findings.append(el("div", { class: "finding" },
      el("span", { class: "pill " + kind }, kind === "pos" ? "positive" : kind === "neg" ? "negative" : "no effect"),
      el("div", {}, el("div", { class: "t" }, t), el("div", { class: "d" }, desc)))));
  root.append(el("div", { class: "section" }, findings));

  const byYear = m.years.map((y) => {
    const rows = d.firm_panel.filter((r) => r.year === y);
    return { y, disc: mean(rows.map((r) => r.esg_disclosure).filter((v) => v !== null)),
             women: mean(rows.map((r) => r.pct_women).filter((v) => v !== null)) };
  });
  root.append(el("div", { class: "grid cols-2 section" },
    el("div", { class: "card" }, el("h3", {}, "Mean ESG disclosure score by year"),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "ovDisc" }))),
    el("div", { class: "card" }, el("h3", {}, "Mean women on board (%) by year"),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "ovWomen" })))));

  chart("ovDisc", { type: "bar",
    data: { labels: byYear.map((r) => r.y), datasets: [{ data: byYear.map((r) => r.disc), backgroundColor: "#0f6b4f", borderRadius: 6, label: "Mean disclosure" }] },
    options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } } } });
  chart("ovWomen", { type: "line",
    data: { labels: byYear.map((r) => r.y), datasets: [{ data: byYear.map((r) => r.women), borderColor: "#14b07a", backgroundColor: "rgba(20,176,122,.15)", fill: true, tension: .35, pointRadius: 4, label: "% women on board", borderWidth: 2 }] },
    options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } } } });
}

/* =======================================================================
   COMPANY LOOKUP  (named board & pay layer + search)
   ======================================================================= */
function findMatches(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  const all = state.data.uk_companies;
  let m = all.filter((c) => c.name.toLowerCase() === q);
  if (!m.length) m = all.filter((c) => c.name.toLowerCase().startsWith(q));
  if (!m.length) m = all.filter((c) => c.name.toLowerCase().includes(q));
  return m;
}

function companyDatalist() {
  const dl = el("datalist", { id: "allCompanies" });
  state.data.uk_companies.forEach((c) => dl.append(el("option", { value: c.name })));
  return dl;
}

function band(score) {
  if (score === null || score === undefined) return { label: "No data", cls: "ns" };
  if (score >= 66) return { label: "Above peers", cls: "pos" };
  if (score >= 34) return { label: "Mid-pack", cls: "info" };
  return { label: "Below peers", cls: "neg" };
}

function metricTile(v, l, sub) {
  return el("div", { class: "kpi" }, el("div", { class: "v" }, v), el("div", { class: "l" }, l), sub ? el("div", { class: "sub" }, sub) : null);
}

function renderLookup(root) {
  const d = state.data;
  root.append(
    el("h1", {}, "Company Lookup"),
    el("p", { class: "lead" }, "Search a UK-listed company to see its board profile — and the number that matters: how its governance compares with peers and what the research implies for ESG disclosure."));

  const form = el("form", { class: "searchbar", onsubmit: (e) => {
    e.preventDefault();
    state.lookup.query = form.querySelector("input").value;
    state.lookup.submitted = state.lookup.query;
    state.lookup.selected = findMatches(state.lookup.query)[0] || null;
    route();
  } });
  form.append(
    el("input", { type: "text", list: "allCompanies", placeholder: "Enter a company name, e.g. Marks and Spencer", value: state.lookup.query }),
    el("button", { class: "btn primary", type: "submit" }, "Search"),
    companyDatalist());
  root.append(el("div", { class: "section" }, form));

  const sel = state.lookup.selected;
  if (state.lookup.submitted && !sel) {
    root.append(el("div", { class: "card" },
      el("h3", {}, `No match for "${state.lookup.submitted}"`),
      el("p", { class: "note" }, "Try one of the companies in the list below, or check the spelling.")));
  }
  if (sel) root.append(resultCard(sel));
  root.append(compareSection());

  const q = state.lookup.query.trim().toLowerCase();
  const rows = q ? d.uk_companies.filter((c) => c.name.toLowerCase().includes(q)) : d.uk_companies;
  const cols = [
    ["name", "Company", "text"], ["records", "Director records", "num"],
    ["pct_female", "% female", "num"], ["diversity_score", "Diversity score", "score"],
    ["avg_age", "Avg age", "num"], ["rem_latest", "Directors' rem. (£m)", "num"],
  ];
  const display = rows.map((c) => ({ ...c, rem_latest: c.rem_latest === null ? null : Math.round(c.rem_latest / 100) / 10 }));
  root.append(el("div", { class: "section" }, el("h2", {}, `Companies (${display.length})`),
    buildTable(display, cols, state.lookup.sort, (k, dir) => { state.lookup.sort = { key: k, dir }; route(); },
      (row) => (row.name.toLowerCase() === q ? "sel" : null),
      (row) => { state.lookup.query = row.name; state.lookup.submitted = row.name; state.lookup.selected = row; route(); }),
    el("p", { class: "note" }, "Click any row to load it into the lookup. Board metrics come from a director roster export that may span several years — treat them as a profile, not a single-year snapshot.")));
}

function resultCard(c) {
  const s = state.data.summary;
  const b = band(c.diversity_score);
  const peer = s.peer_median_pct_female;
  const card = el("div", { class: "card result" });

  card.append(el("div", { class: "result-head" },
    el("div", {}, el("h2", {}, c.name), el("span", { class: "tag" }, "UK-listed · board profile")),
    el("span", { class: "pill " + b.cls }, b.label)));

  const gauge = el("div", { class: "gauge" }, el("i", { style: `width:${c.diversity_score === null ? 0 : c.diversity_score}%` }));
  card.append(el("div", { class: "headline" },
    el("div", { class: "bignum" }, c.diversity_score === null ? "—" : c.diversity_score, el("small", {}, "/100")),
    el("div", { class: "headline-text" },
      el("div", { class: "k" }, "Board gender diversity score"),
      el("div", { class: "d" }, "Percentile of female board representation within 205 UK-listed peers."),
      gauge)));

  const metrics = el("div", { class: "grid cols-4 section" });
  metrics.append(
    metricTile(fmt(c.pct_female, 1) + "%", "Female directors", `${c.n_female} of ${c.records} records`),
    metricTile(fmt0(c.records), "Director records", "board roster size"),
    metricTile(fmt(c.avg_age, 0), "Avg director age", c.age_range !== null ? `range ${fmt0(c.min_age)}–${fmt0(c.max_age)}` : ""),
    metricTile(c.rem_latest === null ? "—" : "£" + fmt(c.rem_latest / 100, 2) + "m", "Directors' remuneration", c.rem_latest_year ? `latest (${c.rem_latest_year})` : ""));
  card.append(metrics);

  const interp = el("div", { class: "interp section" }, el("h3", {}, "What the research implies"));
  if (c.pct_female !== null) {
    interp.append(el("p", {},
      "Across 1,236 firm-years, each additional percentage point of female board representation was associated with ",
      el("strong", {}, "+0.185 points"), " of ESG disclosure (p = 0.007). With ",
      el("strong", {}, fmt(c.pct_female, 1) + "%"), " female directors, this board sits at the ",
      el("strong", {}, c.diversity_score + "th percentile"), " of UK peers (median ", fmt(peer, 1), "%) — an implied ",
      el("strong", { class: "posink" }, "+" + fmt(c.uplift, 0) + " disclosure points"),
      " versus a board with no female directors."));
  } else {
    interp.append(el("p", { class: "note" }, "Board gender data unavailable for this company."));
  }
  card.append(interp);

  card.append(el("div", { class: "section" }, el("h3", {}, "Directors' remuneration (£m)"),
    el("div", { class: "chart-wrap" }, el("canvas", { id: "lookupRem" }))));
  const yrs = Object.keys(c.remuneration || {}).sort();
  if (yrs.length) {
    chart("lookupRem", { type: "line",
      data: { labels: yrs, datasets: [{ data: yrs.map((y) => c.remuneration[y] / 1000),
        borderColor: "#0f6b4f", backgroundColor: "rgba(15,107,79,.12)", fill: true, tension: .3, pointRadius: 3, label: "£m" }] },
      options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } },
        scales: { ...CHART_DEFAULTS.scales, y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: "£m", color: "#5d6b64" } } } } });
  } else {
    card.append(el("p", { class: "note" }, "No remuneration series available for this company."));
  }

  card.append(el("p", { class: "note" }, "Estimate, not a rating: the named layer holds board composition and pay; it does not carry a published ESG score, and board metrics are roster-based. Treat the number as a governance signal."));
  return card;
}

/* ---------------- compare two companies ---------------- */
function compareSection() {
  const all = state.data.uk_companies;
  const mk = (key) => {
    const s = el("select", { onchange: (e) => { state.lookup[key] = e.target.value; route(); } });
    s.append(el("option", { value: "" }, "Select a company…"));
    all.forEach((c) => s.append(el("option", { value: c.name }, c.name)));
    s.value = state.lookup[key] || "";
    return s;
  };
  const a = all.find((c) => c.name === state.lookup.compareA);
  const b = all.find((c) => c.name === state.lookup.compareB);
  const card = el("div", { class: "card section" },
    el("h2", {}, "Compare two companies"),
    el("p", { class: "note", style: "margin:-6px 0 12px" }, "Pick two companies to compare their board profile and research-implied disclosure reading side by side."),
    el("div", { class: "controls" },
      el("div", { class: "field" }, el("label", {}, "Company A"), mk("compareA")),
      el("div", { class: "field" }, el("label", {}, "Company B"), mk("compareB"))));
  card.append(a && b ? compareCard(a, b) : el("p", { class: "note" }, "Choose both companies to see the comparison."));
  return card;
}

function compareCard(a, b) {
  const rem = (c) => (c.rem_latest === null ? null : c.rem_latest / 100);
  const rows = [
    ["Board gender diversity score", a.diversity_score, b.diversity_score, 1, 0],
    ["% female directors", a.pct_female, b.pct_female, 1, 1],
    ["Female directors", a.n_female, b.n_female, 1, 0],
    ["Director records", a.records, b.records, 0, 0],
    ["Avg director age", a.avg_age, b.avg_age, 0, 1],
    ["Directors' remuneration (£m)", rem(a), rem(b), 0, 2],
  ];
  const t = el("table", { class: "cmp-table" });
  t.append(el("thead", {}, el("tr", {}, el("th", {}, "Metric"), el("th", {}, a.name), el("th", {}, b.name))));
  const tb = el("tbody");
  rows.forEach(([label, av, bv, better, dec]) => {
    const cell = (v, other) => {
      const best = better && v !== null && other !== null && v > other;
      return el("td", { class: best ? "best" : "" }, v === null ? "—" : fmt(v, dec));
    };
    tb.append(el("tr", {}, el("td", {}, label), cell(av, bv), cell(bv, av)));
  });
  t.append(tb);

  const card = el("div", { class: "cmp" }, t);
  if (a.diversity_score !== null && b.diversity_score !== null) {
    card.append(el("div", { class: "section" }, el("h3", {}, "Diversity score comparison"),
      el("div", { class: "chart-wrap short" }, el("canvas", { id: "cmpBar" }))));
    const hi = a.diversity_score >= b.diversity_score ? a : b;
    const lo = hi === a ? b : a;
    const gap = Math.abs((hi.pct_female || 0) - (lo.pct_female || 0)) * RESEARCH.pctWomenCoef;
    card.append(el("p", { class: "note" },
      `${hi.name} scores higher (${hi.diversity_score}/100 vs ${lo.diversity_score}/100). Applying the research coefficient to their gender-diversity gap implies about `,
      el("strong", { class: "posink" }, fmt(gap, 1) + " points"),
      ` more ESG disclosure for ${hi.name}.`));
    chart("cmpBar", { type: "bar",
      data: { labels: [a.name, b.name], datasets: [{ data: [a.diversity_score, b.diversity_score], backgroundColor: ["#14b07a", "#0f6b4f"], borderRadius: 6, label: "Diversity score" }] },
      options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } },
        scales: { ...CHART_DEFAULTS.scales, y: { ...CHART_DEFAULTS.scales.y, min: 0, max: 100, title: { display: true, text: "Score", color: "#5d6b64" } } } } });
  }
  return card;
}

/* =======================================================================
   WHAT-IF CALCULATOR
   ======================================================================= */
function renderWhatif(root) {
  const model = state.data.model, s = state.data.summary;
  const C = Object.fromEntries(model.params.map((p) => [p.term, p.coef]));
  if (!state.whatif) {
    state.whatif = {
      board_size: Math.round(s.board_size_mean || 12),
      age_range: Math.round(s.age_range_mean || 22),
      women_dir: Math.round(s.women_dir_mean || 3),
      women_exec: Math.round(s.women_exec_mean || 3),
      pct_women: Math.round(s.pct_women_mean || 26),
      tenure: Math.round(s.tenure_mean || 8),
      esg_bonus: 0, esg_comp: 0,
    };
  }
  const w = state.whatif;

  root.append(
    el("h1", {}, "What-if calculator"),
    el("p", { class: "lead" }, "Design a hypothetical board and see the ESG disclosure score the research model predicts. Every change updates the estimate instantly."));

  const numEl = el("div", { class: "calc-num" }, "—");
  const deltaEl = el("div", { class: "calc-delta" });
  const bandEl = el("span", { class: "band" });
  const markerEl = el("span", { class: "marker" });
  const intervalEl = el("div", { class: "calc-int" });
  const resultCardEl = el("div", { class: "card calc-result" },
    el("div", { class: "eyebrow" }, "Predicted ESG disclosure"),
    numEl, deltaEl,
    el("div", { class: "gauge big track" }, bandEl, markerEl),
    el("div", { class: "calc-scale" }, el("span", {}, fmt0(s.esg_disclosure_min)), el("span", {}, "panel range"), el("span", {}, fmt0(s.esg_disclosure_max))),
    intervalEl,
    el("p", { class: "note" }, "Predicted from the eight governance variables using the replicated H2 model. The shaded band is where a single firm would likely fall; the line is the average estimate. Panel mean is " + fmt(s.esg_disclosure_mean, 1) + "."));

  const slider = (key, label, min, max, step, unit = "") => {
    const out = el("span", { class: "ctl-val" }, w[key] + unit);
    const inp = el("input", { type: "range", min, max, step, value: w[key],
      oninput: (e) => { w[key] = +e.target.value; out.textContent = w[key] + unit; update(); } });
    return el("div", { class: "ctl" }, el("label", {}, label, out), inp);
  };
  const toggle = (key, label) => {
    const inp = el("input", { type: "checkbox", checked: w[key] ? "checked" : null,
      onchange: (e) => { w[key] = e.target.checked ? 1 : 0; update(); } });
    return el("label", { class: "ctl-toggle" }, inp, label);
  };
  const cc = el("div", { class: "calc-controls" },
    slider("pct_women", "% women on board", 0, 60, 1, "%"),
    slider("women_exec", "Women executives", 0, 15, 1),
    slider("women_dir", "Women directors", 0, 12, 1),
    slider("board_size", "Board size", 3, 25, 1),
    slider("age_range", "Board age range (yrs)", 5, 50, 1),
    slider("tenure", "Board avg tenure (yrs)", 0, 20, 1),
    el("div", { class: "ctl-toggles" }, toggle("esg_bonus", "ESG-linked bonus"), toggle("esg_comp", "ESG-linked compensation")));

  const presets = el("div", { class: "chips" });
  [
    ["Panel average", { board_size: 12, age_range: 22, women_dir: 3, women_exec: 3, pct_women: 26, tenure: 8, esg_bonus: 0, esg_comp: 0 }],
    ["High gender diversity", { board_size: 12, age_range: 18, women_dir: 6, women_exec: 6, pct_women: 45, tenure: 6, esg_bonus: 1, esg_comp: 0 }],
    ["ESG-linked pay", { board_size: 12, age_range: 22, women_dir: 3, women_exec: 3, pct_women: 26, tenure: 8, esg_bonus: 1, esg_comp: 1 }],
    ["Entrenched board", { board_size: 14, age_range: 32, women_dir: 1, women_exec: 1, pct_women: 8, tenure: 15, esg_bonus: 0, esg_comp: 0 }],
  ].forEach(([label, vals]) => presets.append(el("button", { class: "btn", onclick: () => { Object.assign(w, vals); route(); } }, label)));

  const controls = el("div", { class: "card" },
    el("h2", {}, "Board design"), cc,
    el("p", { class: "note", style: "margin:12px 0 8px" }, "Or start from a preset:"), presets);

  const breakdown = el("div", { class: "card section" },
    el("h2", {}, "What's driving the score"),
    el("div", { class: "chart-wrap tall" }, el("canvas", { id: "wfBreak" })),
    el("p", { class: "note" }, "Each bar is that variable's contribution (coefficient × value) to the predicted disclosure score."));

  root.append(el("div", { class: "grid calc-layout section" }, controls, resultCardEl));
  root.append(breakdown);

  const predict = () => C.const + C.board_size * w.board_size + C.age_range * w.age_range + C.women_dir * w.women_dir +
    C.women_exec * w.women_exec + C.pct_women * w.pct_women + C.esg_comp * w.esg_comp +
    C.esg_bonus * w.esg_bonus + C.tenure * w.tenure;

  const contribs = () => [
    ["ESG-linked bonus", C.esg_bonus * w.esg_bonus],
    ["% women on board", C.pct_women * w.pct_women],
    ["Women executives", C.women_exec * w.women_exec],
    ["Women directors", C.women_dir * w.women_dir],
    ["Board size", C.board_size * w.board_size],
    ["Age range", C.age_range * w.age_range],
    ["Board tenure", C.tenure * w.tenure],
    ["ESG-linked comp.", C.esg_comp * w.esg_comp],
  ];

  const T = 1.96;                                  // ~t(0.975, 1227)
  const XTXI = model.xtx_inv;                      // (X'X)^-1 from the fitted model
  const xvec = () => [1, w.board_size, w.age_range, w.women_dir, w.women_exec, w.pct_women, w.esg_comp, w.esg_bonus, w.tenure];
  const qform = (x) => {                           // x' (X'X)^-1 x
    let tot = 0;
    for (let i = 0; i < x.length; i++) { let r = 0; for (let j = 0; j < x.length; j++) r += XTXI[i][j] * x[j]; tot += x[i] * r; }
    return tot;
  };
  const pos = (v) => Math.max(0, Math.min(100, 100 * (v - s.esg_disclosure_min) / (s.esg_disclosure_max - s.esg_disclosure_min)));

  function update() {
    const p = predict();
    numEl.textContent = p.toFixed(1);
    const d = p - s.esg_disclosure_mean;
    deltaEl.innerHTML = "";
    deltaEl.append(el("span", { class: d >= 0 ? "posink" : "negink" }, (d >= 0 ? "+" : "") + d.toFixed(1) + " vs panel mean"));

    // uncertainty: prediction interval (single firm) and confidence interval (mean)
    const q = qform(xvec());
    const seMean = model.sigma * Math.sqrt(q);
    const sePred = model.sigma * Math.sqrt(1 + q);
    const piLo = p - T * sePred;
    const piHi = p + T * sePred;
    const ciLo = p - T * seMean, ciHi = p + T * seMean;
    markerEl.style.left = pos(p) + "%";
    bandEl.style.left = pos(piLo) + "%";
    bandEl.style.width = Math.max(1.5, pos(piHi) - pos(piLo)) + "%";
    intervalEl.innerHTML = "";
    intervalEl.append(
      el("div", { class: "int-row" }, el("span", { class: "int-k" }, "95% prediction — a single firm"),
        el("span", { class: "int-v" }, fmt(piLo, 1) + " – " + fmt(piHi, 1))),
      el("div", { class: "int-row" }, el("span", { class: "int-k" }, "95% confidence — the average firm"),
        el("span", { class: "int-v" }, fmt(ciLo, 1) + " – " + fmt(ciHi, 1))));

    const cs = contribs();
    const labels = cs.map((c) => c[0]);
    const data = cs.map((c) => c[1]);
    const colors = cs.map((c) => (c[1] >= 0 ? "#0f6b4f" : "#b4432f"));
    if (state.charts["wfBreak"]) {
      const ch = state.charts["wfBreak"];
      ch.data.labels = labels;
      ch.data.datasets[0].data = data;
      ch.data.datasets[0].backgroundColor = colors;
      ch.update("none");
    } else {
      chart("wfBreak", { type: "bar",
        data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, label: "Contribution" }] },
        options: { ...CHART_DEFAULTS, indexAxis: "y", plugins: { legend: { display: false } },
          scales: { ...CHART_DEFAULTS.scales, x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Points contributed to predicted score", color: "#5d6b64" } } } } });
    }
  }
  update();
}

/* =======================================================================
   FIRM EXPLORER
   ======================================================================= */
function renderExplorer(root) {
  const d = state.data, m = d.meta;
  root.append(
    el("h1", {}, "Firm Explorer"),
    el("p", { class: "lead" }, "Inspect the underlying firm-year panel. Filter by year and board gender diversity, then read the relationship between governance and ESG disclosure."));

  const years = ["all", ...m.years];
  const sel = el("select", { onchange: (e) => { state.explorer.year = e.target.value; route(); } });
  years.forEach((y) => sel.append(el("option", { value: y, selected: String(state.explorer.year) === String(y) ? "selected" : null }, y === "all" ? "All years" : y)));
  root.append(el("div", { class: "controls" },
    el("div", { class: "field" }, el("label", {}, "Year"), sel),
    el("div", { class: "field" }, el("label", {}, `Min % women on board: ${state.explorer.minWomen}`),
      el("input", { type: "range", min: 0, max: 60, step: 5, value: state.explorer.minWomen,
        oninput: (e) => { state.explorer.minWomen = +e.target.value; route(); } })),
    el("div", { class: "field" }, el("label", {}, " "), el("button", { class: "btn", onclick: () => { state.explorer.year = "all"; state.explorer.minWomen = 0; route(); } }, "Reset"))));

  const rows = d.firm_panel.filter((r) =>
    (state.explorer.year === "all" || r.year === +state.explorer.year) &&
    (r.pct_women === null || r.pct_women >= state.explorer.minWomen));
  root.append(el("div", { class: "note", style: "margin-bottom:12px" }, `Showing ${rows.length} firm-year observations.`));

  root.append(el("div", { class: "grid cols-2 section" },
    el("div", { class: "card" }, el("h3", {}, "% women on board vs ESG disclosure"),
      el("div", { class: "chart-wrap tall" }, el("canvas", { id: "exScatter" }))),
    el("div", { class: "card" }, el("h3", {}, "Distribution of ESG disclosure"),
      el("div", { class: "chart-wrap tall" }, el("canvas", { id: "exHist" })))));

  const yrs = [...new Set(rows.map((r) => r.year))].sort();
  chart("exScatter", { type: "scatter",
    data: { datasets: yrs.map((y) => ({
      label: String(y),
      data: rows.filter((r) => r.year === y).map((r) => ({ x: r.pct_women, y: r.esg_disclosure })),
      backgroundColor: (YEAR_COLORS[y] || "#0f6b4f") + "cc", pointRadius: 3.2, pointHoverRadius: 5 })) },
    options: { ...CHART_DEFAULTS,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "% women on board", color: "#5d6b64" } },
        y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: "ESG disclosure score", color: "#5d6b64" } } } } });

  const h = histBins(rows.map((r) => r.esg_disclosure), 16);
  chart("exHist", { type: "bar",
    data: { labels: h.labels, datasets: [{ data: h.counts, backgroundColor: "#14b07a", borderRadius: 4, label: "Firm-years" }] },
    options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } },
      scales: { ...CHART_DEFAULTS.scales, x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "ESG disclosure score", color: "#5d6b64" } } } } });

  const cols = [
    ["company_id", "Firm", "text"], ["year", "Year", "num"], ["board_size", "Board size", "num"],
    ["pct_women", "% women", "num"], ["women_exec", "Women execs", "num"],
    ["tenure", "Avg tenure", "num"], ["esg_bonus", "ESG bonus", "num"], ["esg_disclosure", "ESG disclosure", "num"],
  ];
  root.append(el("div", { class: "section" }, el("h2", {}, "Firm-year data"),
    buildTable(rows, cols, state.explorer.sort, (k, dir) => { state.explorer.sort = { key: k, dir }; route(); }),
    el("p", { class: "note" }, "Click a column header to sort. Firm identifiers are anonymised (C001–C206) as in the source study.")));
}

/* =======================================================================
   SCORECARD
   ======================================================================= */
function renderScorecard(root) {
  const d = state.data;
  root.append(
    el("h1", {}, "Governance Scorecard"),
    el("p", { class: "lead" }, "Each firm is scored 0–100 on the governance levers shown to drive ESG disclosure — a transparent, coefficient-weighted composite of female board & executive representation, ESG-linked bonus, board tenure and age."));

  const comps = d.company_avgs.filter((c) => c.gov_score !== null);
  const sorted = [...comps].sort((a, b) => b.gov_score - a.gov_score);
  const top = sorted.slice(0, 10), bot = sorted.slice(-10).reverse();

  root.append(el("div", { class: "grid cols-2 section" },
    el("div", { class: "card" }, el("h3", {}, "Distribution of governance scores"),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "scHist" }))),
    el("div", { class: "card" }, el("h3", {}, "Top 10 vs bottom 10"),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "scBar" })))));

  const h = histBins(comps.map((c) => c.gov_score), 12);
  chart("scHist", { type: "bar",
    data: { labels: h.labels, datasets: [{ data: h.counts, backgroundColor: "#0f6b4f", borderRadius: 4, label: "Firms" }] },
    options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } },
      scales: { ...CHART_DEFAULTS.scales, x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Governance score (0–100)", color: "#5d6b64" } } } } });

  chart("scBar", { type: "bar",
    data: { labels: [...top.map((c) => c.company_id), ...bot.map((c) => c.company_id)],
      datasets: [{ data: [...top, ...bot].map((c) => c.gov_score),
        backgroundColor: [...top.map(() => "#14b07a"), ...bot.map(() => "#b4432f")], borderRadius: 4, label: "Governance score" }] },
    options: { ...CHART_DEFAULTS, indexAxis: "y", plugins: { legend: { display: false } } } });

  const cols = [
    ["company_id", "Firm", "text"], ["board_size", "Board size", "num"], ["pct_women", "% women", "num"],
    ["women_exec", "Women execs", "num"], ["tenure", "Avg tenure", "num"],
    ["esg_disclosure", "ESG disclosure", "num"], ["gov_score", "Governance score", "score"],
  ];
  root.append(el("div", { class: "section" }, el("h2", {}, "All firms"),
    buildTable(sorted, cols, state.scorecard.sort, (k, dir) => { state.scorecard.sort = { key: k, dir }; route(); },
      (row, i) => (i < 10 ? "top" : i >= sorted.length - 10 ? "bot" : null)),
    el("p", { class: "note" }, "Firms are anonymised in the source panel, so the ranking is illustrative of the methodology rather than a named league table.")));
}

/* =======================================================================
   MODEL
   ======================================================================= */
function renderModel(root) {
  const m = state.data.model;
  root.append(
    el("h1", {}, "Regression Model"),
    el("p", { class: "lead" }, "An OLS regression of ESG disclosure score on board-governance variables, replicated from the thesis. Coefficients, standard errors and significance are recomputed from the raw firm-year data."));

  root.append(el("div", { class: "grid cols-3 section" },
    el("div", { class: "kpi" }, el("div", { class: "v" }, fmt0(m.n)), el("div", { class: "l" }, "Observations")),
    el("div", { class: "kpi" }, el("div", { class: "v" }, fmt(m.r2, 3)), el("div", { class: "l" }, "R-squared")),
    el("div", { class: "kpi" }, el("div", { class: "v" }, fmt(Math.sqrt(m.r2), 2)), el("div", { class: "l" }, "Multiple R"))));

  root.append(el("div", { class: "section" },
    el("div", { class: "card" }, el("h3", {}, "Coefficient estimates"),
      el("div", { class: "chart-wrap tall" }, el("canvas", { id: "mdCoef" })))));

  const params = m.params.filter((p) => p.term !== "const");
  chart("mdCoef", { type: "bar",
    data: { labels: params.map((p) => p.term), datasets: [{ data: params.map((p) => p.coef),
      backgroundColor: params.map((p) => p.sig ? "#0f6b4f" : "#b9c6c1"), borderRadius: 4, label: "Coefficient" }] },
    options: { ...CHART_DEFAULTS, indexAxis: "y", plugins: { legend: { display: false } },
      scales: { ...CHART_DEFAULTS.scales, x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: "Estimated effect on ESG disclosure score", color: "#5d6b64" } } } } });

  const rows = m.params.map((p) => ({ term: p.term, coef: p.coef, se: p.se, t: p.t, p: p.p, sig: p.sig || "—" }));
  const cols = [["term", "Term", "text"], ["coef", "Coef.", "num"], ["se", "Std. err.", "num"], ["t", "t", "num"], ["p", "p-value", "num"], ["sig", "Sig.", "text"]];
  root.append(el("div", { class: "section" }, el("h2", {}, "Coefficient table"),
    buildTable(rows, cols, { key: "coef", dir: -1 }, () => {}),
    el("p", { class: "note" }, "Significance: *** p<0.01, ** p<0.05, * p<0.1. Dark bars are statistically significant; grey bars are not."),
    el("p", { class: "note" }, "Replicates the thesis H2 model (ESG disclosure score regressed on governance variables); coefficients match the original STATA output to three decimal places.")));
}

/* =======================================================================
   METHOD
   ======================================================================= */
function renderMethod(root) {
  root.append(
    el("h1", {}, "Data & Method"),
    el("p", { class: "lead" }, "How this project was built, what the data is, and what it cannot tell you."));

  const block = (title, body) => el("div", { class: "card section" }, el("h2", {}, title), body);
  root.append(block("Research question",
    el("p", {}, "Does corporate governance — board composition, gender diversity and incentive design — explain the level of ESG disclosure a firm provides? This extends an MSc Finance & Management thesis (Cranfield, 2022) that studied S&P 500 firms.")));
  root.append(block("Data sources",
    el("ul", { class: "clean" },
      el("li", {}, "Firm panel: 206 firms × 6 years (2016–2021), 1,236 firm-year observations, with governance variables and an ESG disclosure score."),
      el("li", {}, "Named UK layer: 205 UK-listed companies — director roster (gender, age) and directors' remuneration 2003–2021."),
      el("li", {}, "Country panel: World Bank GDP growth and six governance estimates (252 observations)."))));
  root.append(block("Method",
    el("ul", { class: "clean" },
      el("li", {}, "Data cleaned and assembled with a dependency-light Python pipeline (standard library + openpyxl), so the project reproduces with no heavy installs."),
      el("li", {}, "ESG disclosure modelled with ordinary least squares (normal equations) on eight governance variables."),
      el("li", {}, "The lookup's diversity score is the percentile rank of female board representation within the peer set; the implied disclosure uplift applies the model coefficient."),
      el("li", {}, "Front end: vanilla JavaScript + Chart.js, served as a static site."))));
  root.append(block("Limitations — read before quoting numbers",
    el("ul", { class: "clean" },
      el("li", {}, "Associational, not causal: the regression shows correlation, not that changing a board causes disclosure to change."),
      el("li", {}, "Anonymised firm panel: the disclosure-score data carries no company names, and it did not reconcile to the named UK export, so the two layers are kept separate."),
      el("li", {}, "Cumulative roster: UK board metrics count directors listed in the export (potentially spanning years), not a clean single-year snapshot."),
      el("li", {}, "Historic window: data ends in 2021; disclosure norms have moved quickly since."),
      el("li", {}, "The thesis narrative cites US firms while the raw board/remuneration export is UK — flagged for reconciliation rather than hidden."))));
  root.append(block("Reproduce",
    el("p", {}, el("code", {}, "python3 src/01_clean.py"), " rebuilds ", el("code", {}, "outputs/app_data.json"), " from the Excel sources."),
    el("p", {}, el("code", {}, "python3 -m http.server 8000"), " then open ", el("code", {}, "http://localhost:8000"), ".")));
}

/* =======================================================================
   generic sortable table
   ======================================================================= */
function buildTable(rows, cols, sort, onSort, rowClass = null, onRowClick = null) {
  const wrap = el("div", { class: "table-wrap" });
  const table = el("table");
  const tr = el("tr");
  cols.forEach(([key, label, type]) => {
    const sorted = sort && sort.key === key;
    tr.append(el("th", { scope: "col", class: type === "num" || type === "score" ? "num" : "",
      onclick: () => onSort(key, sorted ? -sort.dir : -1) },
      label + (sorted ? (sort.dir === -1 ? " ▼" : " ▲") : "")));
  });
  if (onRowClick) tr.append(el("th", { scope: "col", class: "num no-sort" }, ""));
  table.append(el("thead", {}, tr));

  const data = [...rows].sort((a, b) => {
    if (!sort) return 0;
    const av = a[sort.key], bv = b[sort.key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "string") return sort.dir * av.localeCompare(bv);
    return sort.dir * (av - bv);
  });

  const tbody = el("tbody");
  data.forEach((row, i) => {
    const tr = el("tr", { class: rowClass ? rowClass(row, i) : null,
      onclick: onRowClick ? () => onRowClick(row) : null,
      style: onRowClick ? "cursor:pointer" : null });
    cols.forEach(([key, , type]) => {
      const v = row[key];
      if (type === "score") {
        tr.append(el("td", { class: "num" },
          el("div", { class: "score-cell" },
            el("span", {}, v === null || v === undefined ? "—" : fmt(v, 0)),
            el("span", { class: "bar " + (v !== null && v < 40 ? "bad" : "") }, el("i", { style: `width:${v === null || v === undefined ? 0 : Math.max(2, v)}%` })))));
      } else if (type === "num") {
        tr.append(el("td", { class: "num" }, v === null || v === undefined ? "—" : (Number.isInteger(v) ? fmt0(v) : fmt(v, 2))));
      } else {
        tr.append(el("td", {}, v === null || v === undefined ? "—" : String(v)));
      }
    });
    if (onRowClick) {
      tr.append(el("td", { class: "num" },
        el("button", { class: "btn mini", type: "button", "aria-label": "Open " + (row.name || row.company_id || "row"),
          onclick: (e) => { e.stopPropagation(); onRowClick(row); } }, "Open")));
    }
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  return wrap;
}

/* render map (function declarations above are hoisted) */
const RENDER = {
  about: renderAbout,
  overview: renderOverview,
  lookup: renderLookup,
  whatif: renderWhatif,
  explorer: renderExplorer,
  scorecard: renderScorecard,
  model: renderModel,
  method: renderMethod,
};

const YEAR_COLORS = {
  2016: "#9ec9b8", 2017: "#6fb79e", 2018: "#3f9f81",
  2019: "#1f8568", 2020: "#0f6b4f", 2021: "#0b4b38",
};

init();
