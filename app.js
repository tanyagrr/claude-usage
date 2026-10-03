(() => {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const SLOTS = 4; // categorical slots validated for stacks; extra models fold into "Other"
  const tip = $("tip");
  const state = { metric: "all", range: "30" };
  let data, modelKeys, colorOf;

  // ---------- formatting ----------
  const compact = (n) => {
    const a = Math.abs(n);
    if (a >= 1e9) return trim(n / 1e9) + "B";
    if (a >= 1e6) return trim(n / 1e6) + "M";
    if (a >= 1e3) return trim(n / 1e3) + "K";
    return String(Math.round(n));
  };
  const trim = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.0+$|(\.\d*?)0+$/, "$1");
  const full = (n) => Math.round(n).toLocaleString("en-US");
  const pct = (x) => (x >= 0.1 ? Math.round(x * 100) : (x * 100).toFixed(1)) + "%";
  const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmtDay = (d, opts = { month: "short", day: "numeric" }) => d.toLocaleDateString("en-US", opts);
  const total = (t) => t.in + t.cw + t.cr + t.out;
  const metricOf = (t) => (state.metric === "out" ? t.out : total(t));

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- tooltip ----------
  function showTip(evt, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - 14;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  const tipRow = (label, value, color) =>
    `<div class="row"><span>${color ? `<i style="background:${color}"></i>` : ""}${label}</span><span>${value}</span></div>`;

  // ---------- model grouping ----------
  function groupModels() {
    const names = data.models.map((m) => m.name);
    const keys = names.length > SLOTS ? [...names.slice(0, SLOTS - 1), "Other"] : names;
    const color = {};
    keys.forEach((k, i) => (color[k] = `var(--series-${i + 1})`));
    const keyOf = (name) => (keys.includes(name) ? name : "Other");
    return { keys, color, keyOf };
  }

  // ---------- header, hero, tiles ----------
  function renderSummary() {
    const t = data.totals;
    const first = parseDay(data.range.first), last = parseDay(data.range.last);
    const updated = new Date(data.generatedAt);
    $("sub").textContent =
      `${fmtDay(first, { month: "short", day: "numeric", year: "numeric" })} – ${fmtDay(last, { month: "short", day: "numeric", year: "numeric" })} · ` +
      `updated ${updated.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    $("hero").textContent = compact(total(t));
    $("heroNote").textContent = `${full(total(t))} tokens, ${pct(t.cr / total(t))} of them cache reads`;

    const tiles = [
      ["Output tokens", compact(t.out), `${full(Math.round(t.out / t.msgs))} per response`],
      ["Responses", compact(t.msgs), `${pct(t.subagentMsgs / t.msgs)} from subagents`],
      ["Sessions", full(t.sessions), `${(t.msgs / t.sessions).toFixed(0)} responses each`],
      ["Active days", full(t.activeDays), `${compact(total(t) / t.activeDays)} tokens per day`],
    ];
    $("tiles").innerHTML = tiles
      .map(([l, v, n]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${n}</div></div>`)
      .join("");
  }

  // ---------- daily stacked columns ----------
  function niceTicks(max, count = 4) {
    if (max <= 0) return [0, 1];
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const ticks = [];
    for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }

  function dailySeries() {
    const byDate = new Map(data.days.map((d) => [d.date, d]));
    const end = parseDay(data.range.last);
    const start = state.range === "all"
      ? parseDay(data.range.first)
      : new Date(end.getFullYear(), end.getMonth(), end.getDate() - Number(state.range) + 1);
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const rec = byDate.get(dayKey(d));
      const vals = Object.fromEntries(modelKeys.keys.map((k) => [k, 0]));
      if (rec) for (const [name, t] of Object.entries(rec.byModel)) vals[modelKeys.keyOf(name)] += metricOf(t);
      out.push({ date: new Date(d), vals, sum: Object.values(vals).reduce((a, b) => a + b, 0), rec });
    }
    return out;
  }

  function renderDaily() {
    const box = $("daily");
    box.innerHTML = "";
    const series = dailySeries();
    const W = Math.max(320, box.clientWidth), H = 260;
    const m = { l: 44, r: 8, t: 12, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const ticks = niceTicks(Math.max(...series.map((s) => s.sum)));
    const ymax = ticks[ticks.length - 1];
    const y = (v) => m.t + ih - (v / ymax) * ih;
    const band = iw / series.length;
    const bw = Math.max(2, Math.min(24, band * 0.7));

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Tokens per day, stacked by model" }, box);
    for (const tv of ticks) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: tv === 0 ? "baseline" : "gridline" }, svg);
      const t = el("text", { x: m.l - 8, y: y(tv) + 4, "text-anchor": "end" }, svg);
      t.textContent = compact(tv);
    }

    // x labels: thin out to fit
    const every = Math.ceil(series.length / Math.max(2, Math.floor(iw / 64)));
    series.forEach((s, i) => {
      if ((series.length - 1 - i) % every) return;
      const t = el("text", { x: m.l + band * (i + 0.5), y: H - 8, "text-anchor": "middle" }, svg);
      t.textContent = fmtDay(s.date);
    });

    const GAP = 2, R = Math.min(4, bw / 2);
    series.forEach((s, i) => {
      const cx = m.l + band * (i + 0.5), x0 = cx - bw / 2;
      const hit = el("rect", { x: m.l + band * i, y: m.t, width: band, height: ih, class: "hit" }, svg);
      const segs = modelKeys.keys.filter((k) => s.vals[k] > 0);
      let base = 0;
      segs.forEach((k, j) => {
        const top = base + s.vals[k];
        let y0 = y(base), y1 = y(top);
        if (j > 0) y0 -= GAP; // surface gap between stacked segments
        const h = y0 - y1;
        if (h > 0.5) {
          const isTop = j === segs.length - 1, r = isTop ? Math.min(R, h) : 0;
          el("path", {
            d: `M${x0},${y0} V${y1 + r} Q${x0},${y1} ${x0 + r},${y1} H${x0 + bw - r} Q${x0 + bw},${y1} ${x0 + bw},${y1 + r} V${y0} Z`,
            fill: modelKeys.color[k], "pointer-events": "none",
          }, svg);
        }
        base = top;
      });
      svg.appendChild(hit); // keep hit target above marks
      hit.addEventListener("mousemove", (e) => {
        hit.classList.add("on");
        const rows = modelKeys.keys.filter((k) => s.vals[k] > 0).reverse()
          .map((k) => tipRow(k, compact(s.vals[k]), modelKeys.color[k])).join("");
        showTip(e, `<b>${fmtDay(s.date, { weekday: "short", month: "short", day: "numeric" })}</b>` +
          (s.sum ? rows + tipRow("Total", full(s.sum)) + tipRow("Sessions", s.rec.sessions) : tipRow("No usage", "")));
      });
      hit.addEventListener("mouseleave", () => { hit.classList.remove("on"); hideTip(); });
    });

    const active = series.filter((s) => s.sum).length;
    $("dailyHint").textContent =
      `${state.metric === "out" ? "Output tokens" : "Input, cache and output tokens"}, stacked by model · ${active} active day${active === 1 ? "" : "s"} in view`;
  }

  function renderLegend() {
    $("legend").innerHTML = modelKeys.keys.length < 2 ? "" : modelKeys.keys
      .map((k) => `<span><i style="background:${modelKeys.color[k]}"></i>${k}</span>`).join("");
  }

  // ---------- horizontal bars ----------
  function hbars(target, rows, fmt) {
    const max = Math.max(...rows.map((r) => r.value));
    target.innerHTML = `<div class="hbar">${rows.map((r, i) => `
      <div class="hbar-row" data-i="${i}">
        <div class="name">${r.key ? `<i class="key" style="background:${r.color}"></i>` : ""}${r.label}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(r.value / max) * 100}%;background:${r.color}"></div></div>
        <div class="val">${fmt(r)}</div>
      </div>`).join("")}</div>`;
    target.querySelectorAll(".hbar-row").forEach((row) => {
      const r = rows[row.dataset.i];
      row.addEventListener("mousemove", (e) => showTip(e, `<b>${r.label}</b>${r.tip}`));
      row.addEventListener("mouseleave", hideTip);
    });
  }

  function renderTypes() {
    const t = data.totals, sum = total(t);
    const rows = [
      ["Cache reads", t.cr, "Context re-read from the prompt cache"],
      ["Cache writes", t.cw, "New context written to the cache"],
      ["Output", t.out, "Tokens Claude generated"],
      ["Fresh input", t.in, "Uncached input tokens"],
    ].map(([label, value, desc]) => ({
      label, value, color: "var(--series-1)",
      tip: tipRow("Tokens", full(value)) + tipRow("Share", pct(value / sum)) + `<div class="row"><span>${desc}</span></div>`,
    }));
    hbars($("types"), rows, (r) => compact(r.value));
  }

  function renderModels() {
    const grouped = {};
    for (const mdl of data.models) {
      const k = modelKeys.keyOf(mdl.name);
      const g = (grouped[k] ||= { in: 0, cw: 0, cr: 0, out: 0, msgs: 0 });
      for (const f in g) g[f] += mdl[f];
    }
    const msgs = data.totals.msgs;
    const rows = modelKeys.keys.map((k) => ({
      label: k, key: true, value: grouped[k].msgs, color: modelKeys.color[k],
      tip: tipRow("Responses", full(grouped[k].msgs)) + tipRow("Output tokens", compact(grouped[k].out)) + tipRow("All tokens", compact(total(grouped[k]))),
    }));
    hbars($("models"), rows, (r) => pct(r.value / msgs));
  }

  // ---------- weekday x hour heatmap ----------
  function renderHeat() {
    const box = $("heat");
    box.innerHTML = "";
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const W = Math.max(320, box.clientWidth);
    const m = { l: 36, t: 4, b: 22 };
    const gap = 2, cw = (W - m.l) / 24, ch = Math.min(26, Math.max(14, cw));
    const H = m.t + ch * 7 + m.b;
    const max = Math.max(1, ...data.heat.flat());
    const step = (v) => (v === 0 ? 0 : 1 + Math.min(6, Math.floor((v / max) * 7)));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Responses by weekday and hour" }, box);

    days.forEach((d, r) => {
      const t = el("text", { x: 0, y: m.t + ch * r + ch / 2 + 4 }, svg);
      t.textContent = d;
      for (let h = 0; h < 24; h++) {
        const v = data.heat[r][h];
        const cell = el("rect", {
          x: m.l + cw * h + gap / 2, y: m.t + ch * r + gap / 2,
          width: cw - gap, height: ch - gap, rx: 3,
          fill: `var(--seq-${step(v)})`,
        }, svg);
        cell.addEventListener("mousemove", (e) =>
          showTip(e, `<b>${d}, ${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00</b>${tipRow("Responses", full(v))}`));
        cell.addEventListener("mouseleave", hideTip);
      }
    });
    for (const h of [0, 6, 12, 18, 23]) {
      const t = el("text", { x: m.l + cw * (h + 0.5), y: H - 6, "text-anchor": "middle" }, svg);
      t.textContent = `${String(h).padStart(2, "0")}:00`;
    }
    $("heatHint").textContent = `Responses by weekday and hour (${data.timezone.replace(/_/g, " ")} time)`;
  }

  // ---------- table ----------
  function renderTable() {
    const head = ["Date", "Sessions", "Responses", "Input + cache writes", "Cache reads", "Output", "Total"];
    const rows = [...data.days].reverse().map((d) => {
      const t = { in: 0, cw: 0, cr: 0, out: 0, msgs: 0 };
      for (const v of Object.values(d.byModel)) for (const f in t) t[f] += v[f];
      return [fmtDay(parseDay(d.date), { year: "numeric", month: "short", day: "numeric" }), d.sessions, full(t.msgs),
        full(t.in + t.cw), full(t.cr), full(t.out), full(total(t))];
    });
    $("table").innerHTML = `<thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
      `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>`;
  }

  // ---------- plan limits ----------
  function relTime(ms) {
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  }

  function renderLimits(limits) {
    if (!limits?.windows?.length) return;
    const now = Date.now();
    const captured = new Date(limits.capturedAt);
    const fmtWhen = (d) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    $("limitsCard").hidden = false;
    $("planBadge").textContent = limits.plan ? `${limits.plan} plan` : "";
    $("limitsHint").textContent = `Share of each usage limit used · snapshot taken ${now - captured < 60000 ? "just now" : relTime(now - captured) + " ago"} (${fmtWhen(captured)})`;
    $("limits").innerHTML = limits.windows.map((w) => {
      const reset = new Date(w.resetsAt);
      const stale = reset <= now;
      const p = Math.max(0, Math.min(100, w.percentUsed));
      const level = p >= 90 ? "crit" : p >= 70 ? "warn" : "";
      const flag = level === "crit" ? "⛔ At limit" : level === "warn" ? "⚠ Nearing limit" : "";
      const when = stale
        ? `Reset at ${fmtWhen(reset)}, after this snapshot`
        : `Resets in ${relTime(reset - now)} · ${fmtWhen(reset)}`;
      return `<div class="meter${stale ? " stale" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${w.label}">
        <div class="row1"><span class="name">${w.label}</span>${flag ? `<span class="flag">${flag}</span>` : ""}</div>
        <div class="pct">${p}% used</div>
        <div class="track"><div class="fill ${level}" style="width:${p}%"></div></div>
        <div class="when">${when}</div>
      </div>`;
    }).join("");
    const x = limits.extraUsage;
    if (x) {
      $("limits").insertAdjacentHTML("afterend", `<div class="extra">Extra usage: ${x.enabled
        ? `on · ${x.currency === "USD" ? "$" : ""}${x.spent} of ${x.currency === "USD" ? "$" : ""}${x.monthlyLimit} monthly cap spent (${x.percentUsed}%)`
        : "off"}</div>`);
    }
  }

  // ---------- controls ----------
  function bindSeg(id, keyName) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state[keyName] = b.dataset.v;
      $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderDaily();
    });
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("theme"); } catch {}
    if (saved) document.documentElement.dataset.theme = saved;
    $("theme").addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch {}
    });
  }

  async function main() {
    initTheme();
    fetch("data/limits.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then(renderLimits)
      .catch(() => {});
    try {
      data = await (await fetch("data/usage.json", { cache: "no-cache" })).json();
    } catch {
      $("sub").textContent = "Could not load data/usage.json.";
      return;
    }
    if (!data.range) { $("sub").textContent = "No usage recorded yet."; return; }
    modelKeys = groupModels();
    bindSeg("metricSeg", "metric");
    bindSeg("rangeSeg", "range");
    renderSummary();
    renderLegend();
    renderDaily();
    renderTypes();
    renderModels();
    renderHeat();
    renderTable();
    let raf;
    addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { renderDaily(); renderHeat(); });
    });
  }

  main();
})();
