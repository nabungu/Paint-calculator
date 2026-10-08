/* Paint Quantity Calculator: user interface. All maths lives in calc.js; data in data/*.js. */
(function () {
  "use strict";
  const DB = globalThis.PaintDB, C = globalThis.PaintCalc;
  const KEY = "paintcalc.v1";
  const CUSTOM = "CUSTOM";
  const ROLE = { primer: "Primer", mid: "Mid coat", finish: "Finish coat" };
  const TYPE_NAME = DB.paints.layerTypes;

  // ------------------------------------------------------------------ helpers
  const $ = (s, root = document) => root.querySelector(s);
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") e.className = v;
      else if (k === "value") value = v;
      else if (k === "dataset") Object.assign(e.dataset, v);
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, "");
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    if (value !== undefined) e.value = value;
    return e;
  }
  /** Replace an element's children, flattening arrays and skipping null/false (replaceChildren would print them). */
  function fill(el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false).map((k) => (k.nodeType ? k : document.createTextNode(k))));
  }
  const nf = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
  const numVal = (input) => (input.value === "" ? "" : parseFloat(input.value));
  let uid = 0;
  const newId = () => "r" + Date.now().toString(36) + (uid++).toString(36);
  const supplierName = (id) => (C.getSupplier(id) || { name: "" }).name;

  // ------------------------------------------------------------------ state
  function fresh() {
    return { lines: [], cat: "C4", dur: "H", supplier: "jotun", layers: C.buildLayers("C4", "H", "jotun"), loss: 30, allow: 0 };
  }
  function sanitize(s) {
    const f = fresh();
    const out = { ...f, ...s };
    const valid = (l) => l && (l.kind === "custom" || (l.kind === "pipe" && C.findPipe(l.size)) || (l.kind === "section" && C.findSection(l.family, l.size)));
    out.lines = (Array.isArray(s.lines) ? s.lines : []).filter(valid).map((l) => ({ ...l, id: l.id || newId() }));
    if (!C.getSupplier(out.supplier)) out.supplier = f.supplier;
    if (out.cat !== CUSTOM && !C.getSystem(out.cat, out.dur)) { out.cat = f.cat; out.dur = f.dur; out.layers = []; }
    if (!Array.isArray(out.layers) || !out.layers.length) out.layers = C.buildLayers(out.cat === CUSTOM ? "C4" : out.cat, out.cat === CUSTOM ? "H" : out.dur, out.supplier);
    out.loss = Number.isFinite(+out.loss) ? +out.loss : 30;
    out.allow = Number.isFinite(+out.allow) ? +out.allow : 0;
    return out;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    return fresh();
  }
  let saveTimer = 0;
  function writeState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: the page still works */ }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeState, 250);
  }
  // a pending debounced save must not be lost when the tab is closed, reloaded or backgrounded
  function flushSave() { clearTimeout(saveTimer); writeState(); }
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
  let state = load();

  // ------------------------------------------------------------------ members table
  const tbody = $("#members tbody");
  const rowRefs = new Map();

  const pipeSizeSelect = (line) =>
    h("select", { "aria-label": "Pipe size (NPS)", onchange: (e) => {
      line.size = e.target.value;
      if (!(line.schedule in C.findPipe(line.size).walls)) line.schedule = "STD";
      rebuildRow(line); recalc();
    }, value: line.size },
      DB.pipes.pipes.map((p) => h("option", { value: p.nps }, `NPS ${p.nps} · DN${p.dn} · OD ${p.od} mm`)));

  const sectionSizeSelect = (line) => {
    const fam = C.findFamily(line.family);
    return h("select", { "aria-label": "Section size", onchange: (e) => { line.size = e.target.value; recalc(); }, value: line.size },
      fam.items.map((it) => h("option", { value: it[0], title: `${it[3]} mm · ${nf(it[2], 3)} m²/m painted area` }, `${it[0]} · ${nf(it[1], 1)} kg/m`)));
  };

  function typeSelect(line) {
    const groups = [];
    for (const f of DB.sections.families) {
      let g = groups.find((x) => x.name === f.group);
      if (!g) groups.push((g = { name: f.group, fams: [] }));
      g.fams.push(f);
    }
    const cur = line.kind === "section" ? line.family : line.kind;
    return h("select", { "aria-label": "Member type", onchange: (e) => changeType(line, e.target.value), value: cur },
      h("option", { value: "pipe" }, "Pipe (ASME B36.10M)"),
      h("option", { value: "custom" }, "Custom member"),
      groups.map((g) => h("optgroup", { label: g.name }, g.fams.map((f) => h("option", { value: f.id }, f.name)))));
  }

  function rowFor(line) {
    const refs = {};
    const numIn = (cls, label, key, min, step) =>
      h("input", { type: "number", class: cls, min, step, inputmode: "decimal", "aria-label": label, value: line[key] === undefined ? "" : line[key],
        oninput: (e) => { line[key] = numVal(e.target); recalc(); } });
    let size, spec;
    if (line.kind === "pipe") {
      size = pipeSizeSelect(line);
      const pipe = C.findPipe(line.size);
      const scheds = pipe ? DB.pipes.schedules.filter((s) => s in pipe.walls) : [];
      spec = h("div", { class: "cellpair" },
        h("select", { "aria-label": "Schedule", onchange: (e) => { line.schedule = e.target.value; recalc(); }, value: line.schedule },
          scheds.map((s) => h("option", { value: s }, `${/^\d/.test(s) ? "Sch " : ""}${s} · ${pipe.walls[s]} mm`))),
        h("select", { "aria-label": "Surfaces to paint", onchange: (e) => { line.surfaces = e.target.value; recalc(); }, value: line.surfaces || "ext" },
          h("option", { value: "ext" }, "External"), h("option", { value: "both" }, "Ext. + internal")));
    } else if (line.kind === "section") {
      size = sectionSizeSelect(line);
      spec = h("input", { type: "number", class: "w-pct", min: 1, max: 100, step: 1, inputmode: "decimal", "aria-label": "Percent of surface painted", title: "Percent of the section's surface that gets paint (100 = all faces)",
        value: line.paintPct === undefined ? 100 : line.paintPct, oninput: (e) => { line.paintPct = numVal(e.target); recalc(); } });
    } else {
      size = h("input", { type: "number", min: 0, step: 1, inputmode: "decimal", placeholder: "Perimeter, mm", "aria-label": "Perimeter in millimetres (all painted faces)", title: "Total length of painted outline, mm. Flat bar 100x10: 2 x (100 + 10) = 220",
        value: line.perimeter === undefined ? "" : line.perimeter, oninput: (e) => { line.perimeter = numVal(e.target); recalc(); } });
      spec = h("div", { class: "cellpair" },
        h("input", { type: "text", placeholder: "Description", "aria-label": "Description", value: line.label || "", oninput: (e) => { line.label = e.target.value; recalc(); } }),
        h("input", { type: "number", min: 0, step: 0.01, inputmode: "decimal", placeholder: "kg/m", "aria-label": "Mass in kg per metre (optional)", value: line.massPerM === undefined ? "" : line.massPerM,
          oninput: (e) => { line.massPerM = numVal(e.target); recalc(); } }));
    }
    refs.msg = h("div");
    refs.area = h("td", { class: "num", dataset: { label: "Area (m²)" } });
    refs.mass = h("td", { class: "num", dataset: { label: "Mass (kg)" } });
    const tr = h("tr", { dataset: { id: line.id } },
      h("td", { dataset: { label: "Type" } }, typeSelect(line)),
      h("td", { dataset: { label: "Size" } }, size, refs.msg),
      h("td", { dataset: { label: line.kind === "pipe" ? "Schedule" : line.kind === "section" ? "Painted %" : "Details" } }, spec),
      h("td", { dataset: { label: "Qty" } }, numIn("w-qty", "Quantity", "qty", 1, 1)),
      h("td", { dataset: { label: "Length (m)" } }, numIn("w-len", "Length of each piece in metres", "length", 0, 0.1)),
      refs.area, refs.mass,
      h("td", { class: "act" }, h("button", { class: "btn icon ghost", type: "button", title: "Remove this line", "aria-label": "Remove this line",
        onclick: () => { state.lines = state.lines.filter((l) => l !== line); rowRefs.delete(line.id); tr.remove(); toggleEmpty(); recalc(); } }, "×")));
    rowRefs.set(line.id, { tr, ...refs });
    return tr;
  }
  function rebuildRow(line) {
    const old = rowRefs.get(line.id);
    const fresh = rowFor(line);
    if (old) old.tr.replaceWith(fresh);
    return fresh;
  }
  function toggleEmpty() {
    $("#members-empty").hidden = state.lines.length > 0;
    $("#members").hidden = state.lines.length === 0;
  }
  function renderMembers() {
    rowRefs.clear();
    tbody.replaceChildren(...state.lines.map(rowFor));
    toggleEmpty();
  }
  function changeType(line, v) {
    if (v === "pipe") Object.assign(line, { kind: "pipe", size: "6", schedule: "STD", surfaces: "ext" });
    else if (v === "custom") Object.assign(line, { kind: "custom", label: "", perimeter: "", massPerM: "" });
    else Object.assign(line, { kind: "section", family: v, size: C.findFamily(v).items[0][0], paintPct: 100 });
    rebuildRow(line);
    recalc();
  }
  function addLine(line) {
    line.id = newId();
    state.lines.push(line);
    $("#members tbody").append(rowFor(line));
    toggleEmpty();
    recalc();
    const refs = rowRefs.get(line.id);
    const first = refs && refs.tr.querySelector("td:nth-child(2) :is(select,input)");
    if (first) first.focus();
  }
  function lastSectionFamily() {
    for (let i = state.lines.length - 1; i >= 0; i--) if (state.lines[i].kind === "section") return state.lines[i].family;
    return "UB";
  }

  // ------------------------------------------------------------------ system (category, supplier, layers)
  const catSel = $("#cat"), durSel = $("#dur"), supSel = $("#supplier"), layerBody = $("#layers tbody");

  function fillStaticSelects() {
    catSel.replaceChildren(
      ...DB.iso12944.categories.filter((c) => C.durabilitiesFor(c.id).length).map((c) => h("option", { value: c.id }, `${c.id} – ${c.name}`)),
      h("option", { value: CUSTOM }, "Custom system (enter your own layers)"));
    supSel.replaceChildren(...DB.paints.suppliers.map((s) => h("option", { value: s.id }, s.name)));
  }
  function fillDurability() {
    durSel.replaceChildren();
    if (state.cat === CUSTOM) { durSel.append(h("option", { value: "" }, "n/a")); durSel.disabled = true; return; }
    durSel.disabled = false;
    for (const d of C.durabilitiesFor(state.cat)) {
      const info = DB.iso12944.durability[d];
      durSel.append(h("option", { value: d }, `${info.label} (${info.years})`));
    }
    durSel.value = state.dur;
  }
  function renderEnv() {
    const env = $("#env");
    $("#surfprep").textContent = state.cat === CUSTOM ? "" : DB.iso12944.surfacePrep;
    if (state.cat === CUSTOM) {
      env.replaceChildren(h("div", {}, "Custom system: set the layers, coats, film thickness and volume solids yourself in the table below."));
      return;
    }
    const c = DB.iso12944.categories.find((x) => x.id === state.cat);
    const d = DB.iso12944.durability[state.dur];
    env.replaceChildren(
      h("div", {}, h("b", {}, `${c.id} ${c.name.toLowerCase()} corrosivity`), ` · carbon steel loses about ${c.steelLoss} in the first year`),
      h("div", {}, h("b", {}, "Inside: "), c.inside),
      h("div", {}, h("b", {}, "Outside: "), c.outside),
      h("div", {}, h("b", {}, "Durability: "), `${d.label}, ${d.years} to first major maintenance (a planning range, not a guarantee)`));
  }

  function productOptions(layer) {
    const sup = C.getSupplier(state.supplier);
    const types = Object.keys(TYPE_NAME);
    const groups = types.map((t) => ({ t, ps: sup.products.filter((p) => p.type === t) })).filter((g) => g.ps.length);
    // put the layer's own type first
    groups.sort((a, b) => (b.t === layer.type) - (a.t === layer.type));
    const opts = groups.map((g) => h("optgroup", { label: TYPE_NAME[g.t] }, g.ps.map((p) => h("option", { value: p.id }, `${p.name} (${p.vs}% solids)`))));
    if (layer.productId && !C.getProduct(state.supplier, layer.productId)) opts.unshift(h("option", { value: layer.productId }, "Other product"));
    return opts;
  }

  function layerRow(layer, index) {
    const refs = {};
    const prod = C.getProduct(state.supplier, layer.productId);
    refs.info = h("div", { class: "small" });
    refs.total = h("td", { class: "num", dataset: { label: "Total DFT (µm)" } });
    const upd = () => {
      layer.coats = numVal(refs.coats); layer.dft = numVal(refs.dft); layer.vs = numVal(refs.vs);
      refreshLayerRow(layer, refs);
      afterLayerChange();
    };
    refs.coats = h("input", { type: "number", class: "w-n", min: 0, max: 12, step: 1, inputmode: "numeric", "aria-label": `${ROLE[layer.role] || "Layer"} number of coats`, value: layer.coats, oninput: upd });
    refs.dft = h("input", { type: "number", class: "w-d", min: 0, step: 5, inputmode: "decimal", "aria-label": `${ROLE[layer.role] || "Layer"} dry film thickness per coat in micrometres`, value: layer.dft, oninput: upd });
    refs.vs = h("input", { type: "number", class: "w-d", min: 1, max: 100, step: 1, inputmode: "decimal", "aria-label": `${ROLE[layer.role] || "Layer"} volume solids percent`, value: layer.vs, oninput: upd });
    refs.prod = h("select", { "aria-label": `${ROLE[layer.role] || "Layer"} product`, onchange: (e) => {
      const p = C.getProduct(state.supplier, e.target.value);
      layer.productId = e.target.value;
      if (p) { layer.type = p.type; layer.vs = p.vs; refs.vs.value = p.vs; }
      refreshLayerRow(layer, refs);
      afterLayerChange();
    }, value: layer.productId }, productOptions(layer));
    const tr = h("tr", {},
      h("td", { class: "strong", dataset: { label: "Layer" } }, ROLE[layer.role] || "Layer"),
      h("td", { dataset: { label: "Product" } }, h("div", {}, refs.prod, refs.info)),
      h("td", { class: "r", dataset: { label: "Coats" } }, refs.coats),
      h("td", { class: "r", dataset: { label: "DFT / coat (µm)" } }, refs.dft),
      h("td", { class: "r", dataset: { label: "Solids (%)" } }, refs.vs),
      refs.total,
      h("td", { class: "act" }, state.layers.length > 1
        ? h("button", { class: "btn icon ghost", type: "button", title: "Remove this layer", "aria-label": "Remove this layer", onclick: () => { state.layers.splice(index, 1); renderLayers(); afterLayerChange(); } }, "×")
        : null));
    refreshLayerRow(layer, refs);
    return tr;
  }
  function refreshLayerRow(layer, refs) {
    const p = C.getProduct(state.supplier, layer.productId);
    refs.prod.title = p ? p.source : "";
    refs.info.replaceChildren(p ? `${p.chem} · recommended ${p.dftMin}–${p.dftMax} µm` : "");
    const out = p && layer.coats > 0 && (layer.dft < p.dftMin || layer.dft > p.dftMax);
    refs.info.style.color = out ? "var(--warn-ink)" : "";
    refs.total.textContent = nf((Math.round(+layer.coats) || 0) * (+layer.dft || 0), 0);
  }
  function renderLayers() {
    layerBody.replaceChildren(...state.layers.map(layerRow));
  }
  function afterLayerChange() {
    const coats = state.layers.reduce((s, l) => s + (Math.round(+l.coats) || 0), 0);
    const dft = state.layers.reduce((s, l) => s + (Math.round(+l.coats) || 0) * (+l.dft || 0), 0);
    $("#sys-coats").textContent = nf(coats, 0);
    $("#sys-dft").textContent = nf(dft, 0);
    const basis = $("#basis"), warn = $("#warnings");
    const sys = state.cat === CUSTOM ? null : C.getSystem(state.cat, state.dur);
    if (sys) {
      basis.hidden = false;
      basis.replaceChildren(h("b", {}, `Reference total film thickness for ${sys.cat} ${DB.iso12944.durability[sys.dur].label.toLowerCase()}: ${sys.refNdft} µm. `), DB.iso12944.basisNotes[sys.basis],
        " The layers below are a generic build that meets it; they are not a supplier's certified system.");
    } else basis.hidden = true;
    const w = C.checkLayers(state.layers, state.supplier, state.cat, state.dur);
    warn.hidden = !w.length;
    warn.replaceChildren(...(w.length ? [h("b", {}, "Check:"), h("ul", {}, w.map((m) => h("li", {}, m)))] : []));
    recalc();
  }

  function applyDatabaseSystem() {
    const cat = state.cat === CUSTOM ? "C4" : state.cat, dur = state.cat === CUSTOM ? "H" : state.dur;
    state.layers = C.buildLayers(cat, dur, state.supplier);
  }
  function onCategory() {
    state.cat = catSel.value;
    if (state.cat !== CUSTOM) {
      const avail = C.durabilitiesFor(state.cat);
      if (!avail.includes(state.dur)) state.dur = avail.includes("H") ? "H" : avail[avail.length - 1];
      applyDatabaseSystem();
    }
    fillDurability(); renderEnv(); renderLayers(); afterLayerChange();
  }
  function onDurability() {
    state.dur = durSel.value;
    applyDatabaseSystem();
    renderEnv(); renderLayers(); afterLayerChange();
  }
  function onSupplier() {
    state.supplier = supSel.value;
    for (const l of state.layers) {
      const p = C.pickProduct(state.supplier, l.type, +l.dft);
      if (p) { l.productId = p.id; l.vs = p.vs; }
    }
    renderLayers(); afterLayerChange();
  }

  // ------------------------------------------------------------------ results
  function summaryLine(label, value) { return h("span", {}, label + " ", h("b", {}, value)); }

  function recalc() {
    const t = C.totals(state.lines, state.allow);
    state.lines.forEach((line, i) => {
      const refs = rowRefs.get(line.id), m = t.lines[i];
      if (!refs) return;
      refs.tr.classList.toggle("err", !m.ok);
      refs.area.textContent = m.ok ? nf(m.area) : "–";
      refs.mass.textContent = m.ok && m.mass !== null ? nf(m.mass, 1) : "–";
      refs.msg.replaceChildren(...(m.ok ? m.warnings.map((w) => h("div", { class: "rowwarn" }, w)) : [h("div", { class: "rowmsg" }, m.error)]));
    });
    fill($("#members-summary"),
      summaryLine("Pipe:", `${nf(t.pipeLength, 1)} m · ${nf(t.pipeArea)} m²`),
      summaryLine("Steel:", `${nf(t.steelLength, 1)} m · ${nf(t.steelArea)} m²`),
      t.allowanceArea ? summaryLine(`Allowance ${nf(+state.allow, 0)}%:`, `${nf(t.allowanceArea)} m²`) : null,
      summaryLine("Total area:", `${nf(t.totalArea)} m²`),
      t.lines.length && t.massKnown ? summaryLine("Steel mass:", `${nf(t.mass / 1000, 2)} t`) : null);
    renderResults(t);
    save();
  }

  function orderSummary(q) {
    const map = new Map();
    q.rows.forEach((r) => {
      const p = C.getProduct(state.supplier, r.productId);
      const key = r.productId || "?";
      const e = map.get(key) || { name: p ? p.name : "Unspecified product", litres: 0, theoretical: 0, roles: [] };
      e.litres += r.litres; e.theoretical += r.theoretical; e.roles.push(ROLE[r.role] || "Layer");
      map.set(key, e);
    });
    return [...map.values()];
  }

  let lastResult = null;
  function renderResults(t) {
    const q = C.paintQuantities(t.totalArea, state.layers, state.loss);
    const order = orderSummary(q);
    const toOrder = order.reduce((s, e) => s + Math.ceil(e.litres - 1e-9), 0);
    lastResult = { t, q, order };
    $("#kpis").replaceChildren(
      h("div", { class: "kpi main" }, h("div", { class: "l" }, "Total surface area"), h("div", { class: "v" }, `${nf(t.totalArea)} m²`), h("div", { class: "s" }, t.allowanceArea ? `includes ${nf(+state.allow, 0)}% allowance` : "no allowance added")),
      h("div", { class: "kpi" }, h("div", { class: "l" }, "Pipe"), h("div", { class: "v" }, `${nf(t.pipeArea)} m²`), h("div", { class: "s" }, `${nf(t.pipeLength, 1)} m of pipe`)),
      h("div", { class: "kpi" }, h("div", { class: "l" }, "Structural steel"), h("div", { class: "v" }, `${nf(t.steelArea)} m²`), h("div", { class: "s" }, `${nf(t.steelLength, 1)} m of members`)),
      h("div", { class: "kpi" }, h("div", { class: "l" }, "System"), h("div", { class: "v" }, `${q.totalDft} µm`), h("div", { class: "s" }, `${q.totalCoats} coats in ${q.rows.filter((r) => r.coats > 0).length} layers`)),
      h("div", { class: "kpi main" }, h("div", { class: "l" }, "Paint to order"), h("div", { class: "v" }, `${nf(toOrder, 0)} L`), h("div", { class: "s" }, `${nf(q.theoretical, 1)} L theoretical, ${nf(+state.loss, 0)}% loss`)));

    const body = $("#paint-table tbody");
    body.replaceChildren(...q.rows.map((r) => {
      const p = C.getProduct(state.supplier, r.productId);
      return h("tr", {},
        h("td", { class: "strong", dataset: { label: "Layer" } }, ROLE[r.role] || "Layer"),
        h("td", { dataset: { label: "Product" } }, p ? p.name : "–"),
        h("td", { class: "num", dataset: { label: "Coats × DFT" } }, `${r.coats} × ${nf(r.dft, 0)} µm = ${nf(r.totalDft, 0)} µm`),
        h("td", { class: "num", dataset: { label: "Wet film (µm)" } }, nf(r.wft, 0)),
        h("td", { class: "num", dataset: { label: "Cover (m²/L)" } }, nf(r.practicalCover, 2)),
        h("td", { class: "num", dataset: { label: "Litres per coat" } }, nf(r.litresPerCoat, 1)),
        h("td", { class: "num", dataset: { label: "Theoretical (L)" } }, nf(r.theoretical, 1)),
        h("td", { class: "num strong", dataset: { label: "With loss (L)" } }, nf(r.litres, 1)));
    }));
    $("#paint-table tfoot").replaceChildren(h("tr", {},
      h("td", { colspan: 2, class: "strong", dataset: { label: "Total" } }, "All layers"),
      h("td", { class: "num", dataset: { label: "Coats × DFT" } }, `${q.totalCoats} coats = ${nf(q.totalDft, 0)} µm`), h("td"), h("td"), h("td"),
      h("td", { class: "num", dataset: { label: "Theoretical (L)" } }, nf(q.theoretical, 1)), h("td", { class: "num", dataset: { label: "With loss (L)" } }, nf(q.litres, 1))));

    fill($("#result-note"),
      h("b", {}, "Order by product (whole litres): "),
      order.map((e, i) => `${i ? " · " : ""}${e.name}: ${nf(Math.ceil(e.litres - 1e-9), 0)} L (${[...new Set(e.roles)].join(" + ")})`),
      ` — ${state.cat === CUSTOM ? "custom system" : `${state.cat} ${DB.iso12944.durability[state.dur].label.toLowerCase()}`}, ${supplierName(state.supplier)}. `,
      "Litres = area × DFT ÷ (10 × solids %), divided by (1 − loss). Pack sizes are not modelled.");
  }

  // ------------------------------------------------------------------ CSV
  const csvCell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function exportCsv() {
    if (!lastResult) return;
    const { t, q, order } = lastResult;
    const rows = [];
    const add = (...cells) => rows.push(cells.map(csvCell).join(","));
    add("Paint quantity calculation");
    add("Category", state.cat === CUSTOM ? "Custom" : state.cat, "Durability", state.cat === CUSTOM ? "" : state.dur, "Supplier", supplierName(state.supplier));
    add("Application loss %", state.loss, "Area allowance %", state.allow);
    add();
    add("Members"); add("Description", "Qty", "Length (m)", "Area per metre (m2/m)", "Area (m2)", "Mass (kg)");
    state.lines.forEach((l, i) => { const m = t.lines[i]; add(m.ok ? m.label : m.error, l.qty, l.length, m.ok ? m.areaPerM.toFixed(4) : "", m.ok ? m.area.toFixed(3) : "", m.ok && m.mass !== null ? m.mass.toFixed(1) : ""); });
    add("Total area (m2)", "", "", "", t.totalArea.toFixed(3));
    add();
    add("Paint system"); add("Layer", "Product", "Coats", "DFT per coat (um)", "Volume solids %", "Wet film per coat (um)", "Litres per coat (incl. loss)", "Litres theoretical", "Litres incl. loss");
    q.rows.forEach((r) => { const p = C.getProduct(state.supplier, r.productId); add(ROLE[r.role] || "Layer", p ? p.name : "", r.coats, r.dft, r.vs, r.wft.toFixed(0), r.litresPerCoat.toFixed(2), r.theoretical.toFixed(2), r.litres.toFixed(2)); });
    add("Total", "", q.totalCoats, q.totalDft, "", "", "", q.theoretical.toFixed(2), q.litres.toFixed(2));
    add();
    add("Order by product"); add("Product", "Litres (whole)", "Used in");
    order.forEach((e) => add(e.name, Math.ceil(e.litres - 1e-9), [...new Set(e.roles)].join(" + ")));
    add();
    add("Estimate only. Check product data against the supplier's current data sheet and the system against ISO 12944.");
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "paint-quantities.csv" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------------------------ paste dialog + example
  const dialog = $("#paste-dialog");
  function importText() {
    const r = C.parseList($("#paste-text").value);
    r.lines.forEach((l) => { l.id = newId(); state.lines.push(l); });
    renderMembers(); recalc();
    const msgs = $("#paste-msgs");
    fill(msgs,
      h("div", {}, `Added ${r.lines.length} line${r.lines.length === 1 ? "" : "s"}.`),
      r.errors.map((e) => h("div", { class: "e" }, `Line ${e.row} not added: ${e.message}`)),
      r.warnings.map((e) => h("div", { class: "w" }, `Line ${e.row}: ${e.message}`)));
    if (!r.errors.length && !r.warnings.length) { $("#paste-text").value = ""; dialog.close(); msgs.replaceChildren(); }
  }
  function loadExample() {
    const text = [
      "PIPE, 6, 12, 20, 40", "PIPE, 10, 6, 12, STD", "PIPE, 3, 6, 30, 80",
      "UB, 305x165x40, 6.0, 8", "UC, 203x203x46, 4.5, 12", "PFC, 200x90x30, 6.0, 10", "EA, 75x75x8, 3.0, 24", "SHS, 100x100x5, 3.0, 12"
    ].join("\n");
    const r = C.parseList(text);
    state.lines = r.lines.map((l) => ({ ...l, id: newId() }));
    renderMembers(); recalc();
  }

  // ------------------------------------------------------------------ wiring
  $("#add-pipe").addEventListener("click", () => addLine({ kind: "pipe", size: "6", schedule: "STD", surfaces: "ext", length: 6, qty: 1 }));
  $("#add-section").addEventListener("click", () => { const f = lastSectionFamily(); addLine({ kind: "section", family: f, size: C.findFamily(f).items[0][0], paintPct: 100, length: 6, qty: 1 }); });
  $("#add-custom").addEventListener("click", () => addLine({ kind: "custom", label: "", perimeter: "", massPerM: "", length: 6, qty: 1 }));
  $("#open-paste").addEventListener("click", () => { $("#paste-msgs").replaceChildren(); dialog.showModal(); $("#paste-text").focus(); });
  $("#paste-close").addEventListener("click", () => dialog.close());
  $("#paste-import").addEventListener("click", importText);
  $("#load-example").addEventListener("click", loadExample);
  $("#clear-all").addEventListener("click", () => { if (!state.lines.length || confirm("Remove every line from the list?")) { state.lines = []; renderMembers(); recalc(); } });
  catSel.addEventListener("change", onCategory);
  durSel.addEventListener("change", onDurability);
  supSel.addEventListener("change", onSupplier);
  $("#add-layer").addEventListener("click", () => {
    const p = C.pickProduct(state.supplier, "EP", 100);
    const layer = { role: "mid", type: "EP", coats: 1, dft: 100, productId: p ? p.id : "", vs: p ? p.vs : 60 };
    const last = state.layers[state.layers.length - 1];
    state.layers.splice(last && last.role === "finish" ? state.layers.length - 1 : state.layers.length, 0, layer);
    renderLayers(); afterLayerChange();
  });
  $("#reset-layers").addEventListener("click", () => { applyDatabaseSystem(); renderLayers(); afterLayerChange(); });
  $("#loss").addEventListener("input", (e) => { state.loss = e.target.value === "" ? 0 : Math.min(90, Math.max(0, parseFloat(e.target.value))); recalc(); });
  $("#allow").addEventListener("input", (e) => { state.allow = e.target.value === "" ? 0 : Math.max(0, parseFloat(e.target.value)); recalc(); });
  $("#export-csv").addEventListener("click", exportCsv);
  $("#print").addEventListener("click", () => { $("#sources").open = true; window.print(); });

  // ------------------------------------------------------------------ start
  fillStaticSelects();
  catSel.value = state.cat; supSel.value = state.supplier;
  fillDurability();
  $("#loss").value = state.loss; $("#allow").value = state.allow;
  renderEnv(); renderMembers(); renderLayers(); afterLayerChange();
})();
