/* Paint Quantity Calculator: user interface. All maths lives in calc.js; data in data/*.js. */
(function () {
  "use strict";
  const DB = globalThis.PaintDB, C = globalThis.PaintCalc;
  const KEY = "paintcalc.v1";
  const ISO = DB.iso12944;
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
  const supplierShort = (id) => { const x = C.getSupplier(id); return x ? x.short || x.name : ""; };

  // ------------------------------------------------------------------ state
  function fresh() {
    return { lines: [], substrate: "carbon", env: "C4", dur: "H", supplier: "jotun", systemId: null, layers: [], loss: 30, allow: 0 };
  }
  function sanitize(s) {
    const f = fresh();
    const out = { ...f, ...s };
    const valid = (l) => l && (l.kind === "custom" || (l.kind === "pipe" && C.findPipe(l.size)) || (l.kind === "section" && C.findSection(l.family, l.size)));
    out.lines = (Array.isArray(s.lines) ? s.lines : []).filter(valid).map((l) => ({ ...l, id: l.id || newId() }));
    if (!s.env && s.cat) out.env = s.cat === "CUSTOM" ? "C4" : s.cat;   // saved by the first version, which had no env
    delete out.cat;
    if (!ISO.substrates.some((x) => x.id === out.substrate)) out.substrate = f.substrate;
    if (!C.getSupplier(out.supplier)) out.supplier = f.supplier;
    if (!C.durabilitiesFor(out.substrate, out.env).length) { out.env = f.env; out.substrate = f.substrate; }
    if (!C.durabilitiesFor(out.substrate, out.env).includes(out.dur)) out.dur = f.dur;
    if (!out.systemId || !C.getLibrarySystem(out.systemId, out.substrate, out.env)) out.systemId = null;
    if (!Array.isArray(out.layers)) out.layers = [];
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

  // ------------------------------------------------------------------ environment, system choice and ISO 12944 check
  const subSel = $("#substrate"), envSel = $("#env"), durSel = $("#dur"), supSel = $("#supplier"), layerBody = $("#layers tbody");
  const durLabel = (d) => `${ISO.durability[d].label} (${ISO.durability[d].years})`;
  const sysName = (id) => (/A$/.test(id) ? `${id.slice(0, -1)} alternative` : id);
  const prodName = (id) => { const p = C.getProduct(state.supplier, id); return p ? p.name : "no product"; };
  const band = (r) => (r[0] === 0 ? `≤ ${r[1]}` : `${r[0]}–${r[1]}`.replace(/\./g, Number(1.5).toLocaleString().charAt(1)));
  const currentSystem = () => (state.systemId ? C.getLibrarySystem(state.systemId, state.substrate, state.env) : null);

  function fillStaticSelects() {
    fill(subSel, ISO.substrates.map((x) => h("option", { value: x.id }, x.name)));
    fill(supSel, DB.paints.suppliers.map((x) => h("option", { value: x.id }, x.name)));
  }
  function fillEnvAndDur() {
    const envs = ISO.environments.filter((e) => C.durabilitiesFor(state.substrate, e.id).length);
    if (!envs.some((e) => e.id === state.env)) state.env = envs.some((e) => e.id === "C4") ? "C4" : envs[0].id;
    const opt = (e) => h("option", { value: e.id }, `${e.id} – ${e.name}`);
    fill(envSel,
      h("optgroup", { label: "Atmosphere" }, envs.filter((e) => /^C/.test(e.id)).map(opt)),
      envs.some((e) => /^Im/.test(e.id)) ? h("optgroup", { label: "Water and soil" }, envs.filter((e) => /^Im/.test(e.id)).map(opt)) : null);
    envSel.value = state.env;
    const ds = C.durabilitiesFor(state.substrate, state.env);
    if (!ds.includes(state.dur)) state.dur = ds.includes("H") ? "H" : ds[ds.length - 1];
    const single = C.getEnv(state.env).kind === "part9";
    fill(durSel, ds.map((d) => h("option", { value: d }, single ? `${durLabel(d)}: the only class in ISO 12944-9` : durLabel(d))));
    durSel.value = state.dur;
  }
  function renderEnv() {
    const e = C.getEnv(state.env), d = ISO.durability[state.dur];
    fill($("#env-info"),
      e.steelGm2
        ? h("div", {}, h("b", {}, `${e.id} ${e.name.toLowerCase()} corrosivity`), ` · first-year loss: carbon steel ${band(e.steelGm2)} g/m² (${band(e.steelUm)} µm), zinc ${band(e.zincGm2)} g/m²`)
        : h("div", {}, h("b", {}, `${e.id}: ${e.name.toLowerCase()}`)),
      e.outside ? h("div", {}, h("b", {}, "Outside: "), e.outside) : null,
      e.inside ? h("div", {}, h("b", {}, "Inside: "), e.inside) : null,
      e.examples ? h("div", {}, h("b", {}, "Examples: "), e.examples) : null,
      h("div", {}, h("b", {}, "Durability: "), `${d.label}, ${d.years} to the first major maintenance (a planning range, not a guarantee)`),
      e.id === "C1" ? h("div", { class: "small", style: "margin-top:4px" }, ISO.notes.c1) : null);
  }

  // ---- qualifying systems
  let lastArea = 0;
  function renderRecs() {
    const recs = C.recommend({ substrate: state.substrate, env: state.env, dur: state.dur, supplier: state.supplier, area: lastArea, lossPct: state.loss });
    const sub = ISO.substrates.find((x) => x.id === state.substrate);
    $("#recs-title").textContent = `Systems that meet ${state.env} ${ISO.durability[state.dur].label.toLowerCase()} on ${sub.name.split(" (")[0].toLowerCase()}: ${recs.length}`;
    $("#recs-litres-h").textContent = lastArea > 0 ? "Paint for this job (L)" : "Paint per 100 m² (L)";
    fill($("#recs-note"),
      "From Jotun's ISO 12944 Coating Selector (rev. 2), sorted by least paint. ",
      state.supplier === "jotun" ? "" : `With ${supplierShort(state.supplier)} selected, Jotun's builds are shown with ${supplierShort(state.supplier)} products of the same type: they are not ${supplierShort(state.supplier)}-certified systems. `,
      C.getEnv(state.env).kind === "part9" ? "CX and Im4 systems are Jotun's ISO 12944-9 tested systems." : "");
    const body = $("#recs tbody");
    if (!recs.length) {
      fill(body, h("tr", {}, h("td", { colspan: 6, class: "empty" }, "No system in the library for this combination. Build your own layers below; the ISO check still works.")));
      return recs;
    }
    const best = recs.find((r) => !r.missing && !r.warnings.length);
    fill(body, recs.map((r) => {
      const id = r.system.id;
      return h("tr", { class: id === state.systemId ? "sel" : "" },
        h("td", { dataset: { label: "System" } }, h("div", {}, h("b", {}, sysName(id)),
          r === best ? h("span", { class: "badge good" }, "least paint") : null,
          r.missing ? h("span", { class: "badge warn" }, "no product for a layer") : r.warnings.length ? h("span", { class: "badge warn", title: r.warnings.join("\n") }, "check DFT ranges") : null,
          h("div", { class: "small" }, r.system.table + (r.system.note ? ` · ${r.system.note}` : "")))),
        h("td", { dataset: { label: "Build" } }, r.layers.map((l) => `${prodName(l.productId)} ${l.coats > 1 ? l.coats + " × " : ""}${l.dft}`).join(" + ")),
        h("td", { class: "num", dataset: { label: "NDFT / coats" } }, `${r.totalDft} µm / ${r.coats}`),
        h("td", { dataset: { label: "Rated up to" } }, ISO.durability[r.system.dur].label),
        h("td", { class: "num", dataset: { label: lastArea > 0 ? "Paint (L)" : "L per 100 m²" } }, nf(r.litres, 0)),
        h("td", { class: "act" }, h("button", { class: id === state.systemId ? "btn primary" : "btn", type: "button", onclick: () => selectSystem(id) }, id === state.systemId ? "Selected" : "Use")));
    }));
    return recs;
  }
  function selectSystem(id) {
    const sys = C.getLibrarySystem(id, state.substrate, state.env);
    if (!sys) return;
    state.systemId = id;
    state.layers = C.systemLayers(sys, state.supplier);
    renderLayers(); afterLayerChange();
  }
  /** After a change of substrate, environment, durability or supplier: keep the chosen system if it still qualifies. */
  function autoSelect() {
    const recs = C.recommend({ substrate: state.substrate, env: state.env, dur: state.dur, supplier: state.supplier, area: lastArea, lossPct: state.loss });
    const keep = recs.find((r) => r.system.id === state.systemId);
    if (keep) selectSystem(keep.system.id);
    else if (recs.length) selectSystem(recs[0].system.id);
    else { state.systemId = null; renderLayers(); afterLayerChange(); }
  }
  function isEdited() {
    const sys = currentSystem();
    if (!sys) return true;
    const ref = C.systemLayers(sys, state.supplier);
    return ref.length !== state.layers.length || ref.some((l, i) => {
      const m = state.layers[i];
      return l.type !== m.type || l.coats !== +m.coats || l.dft !== +m.dft || l.productId !== m.productId || +l.vs !== +m.vs;
    });
  }

  // ---- layer editor
  function productOptions(layer) {
    const sup = C.getSupplier(state.supplier);
    const groups = Object.keys(TYPE_NAME).map((t) => ({ t, ps: sup.products.filter((p) => p.type === t) })).filter((g) => g.ps.length);
    groups.sort((a, b) => (b.t === layer.type) - (a.t === layer.type));   // the layer's own type first
    const opts = groups.map((g) => h("optgroup", { label: TYPE_NAME[g.t] }, g.ps.map((p) => h("option", { value: p.id }, `${p.name} (${p.vs}% solids)`))));
    if (!layer.productId || !C.getProduct(state.supplier, layer.productId)) opts.unshift(h("option", { value: layer.productId || "" }, `No ${(TYPE_NAME[layer.type] || "product").toLowerCase()} from this supplier`));
    return opts;
  }
  function layerRow(layer, index) {
    const refs = {};
    refs.info = h("div", { class: "small" });
    refs.total = h("td", { class: "num", dataset: { label: "Total DFT (µm)" } });
    const label = ROLE[layer.role] || "Layer";
    const upd = () => {
      layer.coats = numVal(refs.coats); layer.dft = numVal(refs.dft); layer.vs = numVal(refs.vs);
      refreshLayerRow(layer, refs);
      afterLayerChange();
    };
    refs.coats = h("input", { type: "number", class: "w-n", min: 0, max: 12, step: 1, inputmode: "numeric", "aria-label": `${label} number of coats`, value: layer.coats, oninput: upd });
    refs.dft = h("input", { type: "number", class: "w-d", min: 0, step: 5, inputmode: "decimal", "aria-label": `${label} dry film thickness per coat in micrometres`, value: layer.dft, oninput: upd });
    refs.vs = h("input", { type: "number", class: "w-d", min: 1, max: 100, step: 1, inputmode: "decimal", "aria-label": `${label} volume solids percent`, value: layer.vs, oninput: upd });
    refs.prod = h("select", { "aria-label": `${label} product`, onchange: (e) => {
      const p = C.getProduct(state.supplier, e.target.value);
      layer.productId = e.target.value;
      if (p) { layer.type = p.type; layer.vs = p.vs; refs.vs.value = p.vs; }
      refreshLayerRow(layer, refs);
      afterLayerChange();
    }, value: layer.productId || "" }, productOptions(layer));
    const tr = h("tr", {},
      h("td", { class: "strong", dataset: { label: "Layer" } }, h("div", {}, label, h("div", { class: "small" }, TYPE_NAME[layer.type] || ""))),
      h("td", { dataset: { label: "Product" } }, h("div", {}, refs.prod, refs.info)),
      h("td", { class: "r", dataset: { label: "Coats" } }, refs.coats),
      h("td", { class: "r", dataset: { label: "DFT / coat (µm)" } }, refs.dft),
      h("td", { class: "r", dataset: { label: "Solids (%)" } }, refs.vs),
      refs.total,
      h("td", { class: "act" }, state.layers.length > 1
        ? h("button", { class: "btn icon ghost", type: "button", title: "Remove this layer", "aria-label": "Remove this layer", onclick: () => { state.layers.splice(index, 1); relabelRoles(); renderLayers(); afterLayerChange(); } }, "×")
        : null));
    refreshLayerRow(layer, refs);
    return tr;
  }
  function relabelRoles() {
    const n = state.layers.length;
    state.layers.forEach((l, i) => { l.role = i === 0 ? "primer" : i === n - 1 ? "finish" : "mid"; });
  }
  function refreshLayerRow(layer, refs) {
    const p = C.getProduct(state.supplier, layer.productId);
    refs.prod.title = p ? p.source : "";
    fill(refs.info, p ? `${p.chem} · recommended ${p.dftMin}–${p.dftMax} µm` : "");
    const out = p && layer.coats > 0 && (layer.dft < p.dftMin || layer.dft > p.dftMax);
    refs.info.style.color = out ? "var(--warn-ink)" : "";
    refs.total.textContent = nf((Math.round(+layer.coats) || 0) * (+layer.dft || 0), 0);
  }
  function renderLayers() {
    fill(layerBody, state.layers.length ? state.layers.map(layerRow)
      : h("tr", {}, h("td", { colspan: 7, class: "empty" }, "No layers. Pick a system above or add a layer.")));
  }

  // ---- ISO 12944-5 check
  const reqText = (r) => (r === ISO.NONE ? "no minimum" : r ? `≥ ${r.mnoc} coat${r.mnoc > 1 ? "s" : ""}, ${r.ndft} µm` : "not in table");
  function renderCompliance() {
    const a = C.assess(state.layers, state.substrate, state.env);
    const el = $("#compliance");
    if (a.table === "ISO 12944-9") {
      fill(el, h("div", { class: "head" }, a.tested
        ? [h("b", {}, "✓ Tested system. "), `This build matches Jotun's ISO 12944-9 system ${a.tested}.`]
        : [h("b", {}, "Not a tested system. "), "This build does not match any ISO 12944-9 system in the library."]),
      h("div", { class: "next" }, ISO.notes.part9));
      return a;
    }
    if (!a.applicable) { fill(el, h("div", { class: "head" }, h("b", {}, "ISO 12944-5 check: "), a.reason || "not applicable")); return a; }
    const want = ISO.durabilities.indexOf(state.dur), got = a.achieved ? ISO.durabilities.indexOf(a.achieved) : -1;
    fill(el,
      h("div", { class: "head" }, h("b", {}, got >= want ? "✓ Meets " : "✗ Does not meet "),
        h("b", {}, `${state.env} ${ISO.durability[state.dur].label.toLowerCase()}. `),
        `ISO 12944-5 ${a.table}, ${a.column} column: this build is ${a.coats} coat${a.coats === 1 ? "" : "s"} and ${a.totalDft} µm, `,
        a.achieved ? `which allows up to ${ISO.durability[a.achieved].label.toLowerCase()} durability.` : "which is below every minimum in the table."),
      h("div", { class: "grid" }, a.rows.map((r) => h("div", { class: `cell ${r.ok ? "ok" : "no"}` },
        h("b", {}, `${r.ok ? "✓" : "✗"} ${ISO.durability[r.dur].label}`),
        reqText(r.req), r.alt ? ` (or ${reqText(r.alt)})` : ""))),
      a.next ? h("div", { class: "next" }, `For ${ISO.durability[a.next.dur].label.toLowerCase()}: ${[a.next.needDft ? `${a.next.needDft} µm more` : "", a.next.needCoats ? `${a.next.needCoats} more coat${a.next.needCoats > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ")}.`) : null);
    return a;
  }
  function renderNotes() {
    const primer = state.layers.find((l) => +l.coats > 0);
    const prep = state.substrate === "hdg" ? ISO.surfacePrep.hdg : state.substrate === "tsm" ? ISO.surfacePrep.tsm
      : primer && primer.type === "ZN" ? ISO.surfacePrep.carbonZn : ISO.surfacePrep.carbonOther;
    fill($("#notes-body"),
      h("ul", {},
        h("li", {}, h("b", {}, "Surface preparation: "), prep),
        state.substrate === "carbon" ? h("li", {}, ISO.surfacePrep.rustD) : null,
        primer && primer.type === "ZN" ? h("li", {}, ISO.notes.znPrimer) : null,
        h("li", {}, ISO.notes.airless),
        h("li", {}, ISO.notes.maxDft),
        h("li", {}, ISO.notes.special)),
      h("b", { class: "small" }, "Design (ISO 12944-3)"),
      h("ul", {}, ISO.notes.design.map((d) => h("li", {}, d))));
  }
  function afterLayerChange() {
    const coats = state.layers.reduce((s, l) => s + (Math.round(+l.coats) || 0), 0);
    const dft = state.layers.reduce((s, l) => s + (Math.round(+l.coats) || 0) * (+l.dft || 0), 0);
    $("#sys-coats").textContent = nf(coats, 0);
    $("#sys-dft").textContent = nf(dft, 0);
    const sys = currentSystem();
    $("#sel-name").textContent = sys ? `· ${sysName(sys.id)}${isEdited() ? " (edited)" : ""}` : "· your own build";
    renderCompliance();
    renderNotes();
    const w = C.checkLayers(state.layers, state.supplier, { substrate: state.substrate, env: state.env, dur: state.dur })
      .filter((m) => !/^Falls short|not reachable/.test(m));   // shown in the ISO panel instead
    const warn = $("#warnings");
    warn.hidden = !w.length;
    fill(warn, w.length ? [h("b", {}, "Check:"), h("ul", {}, w.map((m) => h("li", {}, m)))] : []);
    recalc();
  }

  function onSubstrate() {
    state.substrate = subSel.value;
    fillEnvAndDur(); renderEnv(); autoSelect();
  }
  function onEnv() {
    state.env = envSel.value;
    fillEnvAndDur(); renderEnv(); autoSelect();
  }
  function onDurability() {
    state.dur = durSel.value;
    renderEnv(); autoSelect();
  }
  function onSupplier() {
    state.supplier = supSel.value;
    autoSelect();
  }

  // ---- category helper (ISO 12944-2 Table 1)
  const helper = $("#helper-dialog");
  let helperPick = null;
  function updateHelper() {
    const v = (id) => ($(id).value === "" ? undefined : $(id).value);
    const r = C.categoryFromLoss({ steelGm2: v("#h-steel-g"), steelUm: v("#h-steel-um"), zincGm2: v("#h-zinc-g"), zincUm: v("#h-zinc-um") });
    const names = { steelGm2: "steel g/m²", steelUm: "steel µm", zincGm2: "zinc g/m²", zincUm: "zinc µm" };
    helperPick = r && r.env !== "beyond CX" ? r.env : null;
    fill($("#h-result"), !r ? "Enter a measured loss."
      : [h("b", {}, r.env === "beyond CX" ? "Beyond CX: above the highest band in ISO 12944-2. Get specialist advice." : `${r.env} – ${C.getEnv(r.env).name}`),
        h("div", { class: "small" }, Object.entries(r.byMeasure).map(([k, e]) => `${names[k]} → ${e}`).join(" · "))]);
    $("#helper-use").disabled = !helperPick || !C.durabilitiesFor(state.substrate, helperPick).length;
  }
  function fillBands() {
    const cats = ISO.environments.filter((e) => e.steelGm2);
    fill($("#h-bands"),
      h("thead", {}, h("tr", {}, ["Category", "Steel g/m²", "Steel µm", "Zinc g/m²", "Zinc µm"].map((t) => h("th", {}, t)))),
      h("tbody", {}, cats.map((e) => h("tr", {}, h("td", {}, `${e.id} ${e.name.toLowerCase()}`), [e.steelGm2, e.steelUm, e.zincGm2, e.zincUm].map((b) => h("td", { class: "num" }, band(b)))))));
  }

  // ------------------------------------------------------------------ results
  function summaryLine(label, value) { return h("span", {}, label + " ", h("b", {}, value)); }

  function recalc() {
    const t = C.totals(state.lines, state.allow);
    lastArea = t.totalArea;
    renderRecs();
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

  /** Plain-text specification of the current choice, for copying into a document. */
  function specLines(q) {
    const e = C.getEnv(state.env), sub = ISO.substrates.find((x) => x.id === state.substrate), sys = currentSystem();
    const a = C.assess(state.layers, state.substrate, state.env);
    const primer = state.layers.find((l) => +l.coats > 0);
    const prep = state.substrate === "hdg" ? ISO.surfacePrep.hdg : state.substrate === "tsm" ? ISO.surfacePrep.tsm
      : primer && primer.type === "ZN" ? ISO.surfacePrep.carbonZn : ISO.surfacePrep.carbonOther;
    const lines = [
      `Environment: ${e.id} ${e.name.toLowerCase()} (ISO 12944-2). Durability: ${ISO.durability[state.dur].label.toLowerCase()}, ${ISO.durability[state.dur].years} (ISO 12944-1).`,
      `Substrate: ${sub.name}.`,
      `Surface preparation: ${prep}`,
      `Paint system: ${sys ? `Jotun ${sysName(sys.id)}${state.supplier === "jotun" ? "" : `, with ${supplierShort(state.supplier)} products substituted`}${isEdited() ? " (edited)" : ""}` : "own build"}`
    ];
    q.rows.filter((r) => r.coats > 0).forEach((r) => lines.push(`  ${ROLE[r.role] || "Layer"}: ${prodName(r.productId)}, ${r.coats} \u00D7 ${r.dft} \u00B5m DFT`));
    lines.push(`Total NDFT ${q.totalDft} \u00B5m in ${q.totalCoats} coat${q.totalCoats === 1 ? "" : "s"}.`);
    if (a.table === "ISO 12944-9") lines.push(a.tested ? `Tested to ISO 12944-9 (Jotun report ${a.tested}).` : "Not a tested ISO 12944-9 system: confirm suitability with the paint maker.");
    else if (a.applicable) lines.push(a.achieved
      ? `Meets ISO 12944-5 ${a.table} (${a.column}) up to ${ISO.durability[a.achieved].label.toLowerCase()} durability${ISO.durabilities.indexOf(a.achieved) < ISO.durabilities.indexOf(state.dur) ? ` \u2014 BELOW the required ${ISO.durability[state.dur].label.toLowerCase()}` : ""}.`
      : `Does not meet the ISO 12944-5 ${a.table} minimums.`);
    lines.push(`Inspection: DFT to ISO 19840; no individual reading above ${3 * q.totalDft} \u00B5m (3 \u00D7 NDFT, ISO 12944-5 7.3) unless agreed.`);
    lines.push("Estimate only: confirm products against the supplier's current data sheets and the system with the supplier.");
    return lines;
  }

  let lastResult = null;
  function renderResults(t) {
    const q = C.paintQuantities(t.totalArea, state.layers, state.loss);
    const order = orderSummary(q);
    const toOrder = order.reduce((s, e) => s + Math.ceil(e.litres - 1e-9), 0);
    lastResult = { t, q, order, spec: specLines(q) };
    $("#spec").textContent = lastResult.spec.join("\n");
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
      ` — ${currentSystem() ? sysName(state.systemId) + (isEdited() ? " (edited)" : "") : "own build"}, ${state.env} ${ISO.durability[state.dur].label.toLowerCase()}, ${supplierName(state.supplier)}. `,
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
    add("Environment", state.env, "Durability", state.dur, "Substrate", state.substrate, "Supplier", supplierName(state.supplier), "System", state.systemId ? sysName(state.systemId) + (isEdited() ? " (edited)" : "") : "own build");
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
    add();
    add("Specification");
    lastResult.spec.forEach((line) => add(line));
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
  subSel.addEventListener("change", onSubstrate);
  envSel.addEventListener("change", onEnv);
  durSel.addEventListener("change", onDurability);
  supSel.addEventListener("change", onSupplier);
  $("#add-layer").addEventListener("click", () => {
    const p = C.pickProduct(state.supplier, "EP", 100);
    const layer = { role: "mid", type: "EP", coats: 1, dft: 100, productId: p ? p.id : "", vs: p ? p.vs : 60 };
    const n = state.layers.length;
    state.layers.splice(n > 1 ? n - 1 : n, 0, layer);   // before the finish coat
    relabelRoles(); renderLayers(); afterLayerChange();
  });
  $("#reset-layers").addEventListener("click", () => { if (currentSystem()) selectSystem(state.systemId); else autoSelect(); });
  $("#open-helper").addEventListener("click", () => { updateHelper(); helper.showModal(); $("#h-steel-g").focus(); });
  $("#helper-close").addEventListener("click", () => helper.close());
  ["#h-steel-g", "#h-steel-um", "#h-zinc-g", "#h-zinc-um"].forEach((id) => $(id).addEventListener("input", updateHelper));
  $("#helper-use").addEventListener("click", () => { if (!helperPick) return; envSel.value = helperPick; helper.close(); onEnv(); });
  $("#copy-spec").addEventListener("click", async () => {
    const text = $("#spec").textContent;
    try { await navigator.clipboard.writeText(text); $("#copy-spec").textContent = "Copied"; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("#spec")); getSelection().removeAllRanges(); getSelection().addRange(r); $("#copy-spec").textContent = "Selected: press Ctrl+C"; }
    setTimeout(() => { $("#copy-spec").textContent = "Copy specification"; }, 2000);
  });
  $("#loss").addEventListener("input", (e) => { state.loss = e.target.value === "" ? 0 : Math.min(90, Math.max(0, parseFloat(e.target.value))); recalc(); });
  $("#allow").addEventListener("input", (e) => { state.allow = e.target.value === "" ? 0 : Math.max(0, parseFloat(e.target.value)); recalc(); });
  $("#export-csv").addEventListener("click", exportCsv);
  $("#print").addEventListener("click", () => { $("#sources").open = true; window.print(); });

  // ------------------------------------------------------------------ start
  fillStaticSelects(); fillBands();
  subSel.value = state.substrate; supSel.value = state.supplier;
  fillEnvAndDur();
  $("#loss").value = state.loss; $("#allow").value = state.allow;
  renderEnv(); renderMembers();
  lastArea = C.totals(state.lines, state.allow).totalArea;
  if (state.layers.length) { renderLayers(); afterLayerChange(); } else autoSelect();
})();
