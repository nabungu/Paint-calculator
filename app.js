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
    return { lines: [], substrate: "carbon", env: "C4", dur: "H", supplier: "jotun", systemId: null, layers: [], loss: 30, allow: 0,
      galvBand: "auto", galvUm: "", galvInside: true };
  }
  function sanitize(s) {
    const f = fresh();
    const out = { ...f, ...s };
    const valid = (l) => l && (l.kind === "custom" || (l.kind === "pipe" && C.findPipe(l.size)) || (l.kind === "section" && C.findSection(l.family, l.size)) || (l.kind === "fitting" && C.fittingRow(l.fitting, l.size)));
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
    if (out.galvBand !== "auto" && !C.galvBand(out.galvBand)) out.galvBand = "auto";
    out.galvUm = +out.galvUm > 0 ? +out.galvUm : "";
    out.galvInside = out.galvInside !== false;
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
    const S = C.SECTION;
    return h("select", { "aria-label": "Section size", onchange: (e) => { line.size = e.target.value; recalc(); }, value: line.size },
      fam.items.map((it) => h("option", { value: it[S.name], title: `${it[S.dims]} mm · ${nf(it[S.area], 4)} m²/m painted area${it[S.note] ? ` · ${it[S.note]}` : ""}` },
        `${it[S.name]} · ${nf(it[S.mass], 1)} kg/m${it[S.note] ? " *" : ""}`)));
  };

  const FIT = DB.fittings;
  const fitSizeLabel = (size) => size.split(" x ").map((n) => `NPS ${n}`).join(" × ") + ` · OD ${size.split(" x ").map((n) => nf(FIT.od[n], 1)).join(" × ")} mm`;
  const fittingSizeSelect = (line) =>
    h("select", { "aria-label": "Fitting size (NPS)", onchange: (e) => {
      line.size = e.target.value;
      const pipe = C.findPipe(line.size.split(" x ")[0]);
      if (!pipe || !(line.schedule in pipe.walls)) line.schedule = "STD";
      rebuildRow(line); recalc();
    }, value: line.size },
      C.fittingSizes(line.fitting).map((sz) => h("option", { value: sz }, fitSizeLabel(sz))));
  /** A size for a fitting type close to `want` (same NPS, or the same run size for reducing fittings). */
  function nearestFittingSize(typeId, want) {
    const sizes = C.fittingSizes(typeId), w = String(want || "6");
    return sizes.find((x) => x === w) || sizes.find((x) => x.split(" x ")[0] === w.split(" x ")[0]) || sizes.find((x) => x.startsWith("6")) || sizes[0];
  }

  function typeSelect(line) {
    const cur = line.kind === "section" ? line.family : line.kind === "fitting" ? "fit:" + line.fitting : line.kind;
    return h("select", { "aria-label": "Member type", onchange: (e) => changeType(line, e.target.value), value: cur },
      h("option", { value: "pipe" }, "Pipe (ASME B36.10M)"),
      FIT ? h("optgroup", { label: "Pipe fittings: ASME B16.9 buttwelding" },
        C.FITTING_TYPES.filter((ft) => C.fittingSizes(ft.id).length).map((ft) => h("option", { value: "fit:" + ft.id, title: ft.full }, ft.name))) : null,
      h("option", { value: "custom" }, "Custom member"),
      C.sectionGroups().map((g) => h("optgroup", { label: `${g.catalogue.name}: ${g.group}` },
        g.families.map((f) => h("option", { value: f.id, title: f.std }, `${g.catalogue.short} · ${f.name}`)))));
  }

  function rowFor(line) {
    const refs = {};
    const numIn = (cls, label, key, min, step) =>
      h("input", { type: "number", class: cls, min, step, inputmode: "decimal", "aria-label": label, value: line[key] === undefined ? "" : line[key],
        oninput: (e) => { line[key] = numVal(e.target); recalc(); } });
    let size, spec;
    const schedSurf = (pipe) => {
      const scheds = pipe ? DB.pipes.schedules.filter((s) => s in pipe.walls) : [];
      return h("div", { class: "cellpair" },
        h("select", { "aria-label": "Schedule", onchange: (e) => { line.schedule = e.target.value; recalc(); }, value: line.schedule },
          scheds.map((s) => h("option", { value: s }, `${/^\d/.test(s) ? "Sch " : ""}${s} · ${pipe.walls[s]} mm`))),
        h("select", { "aria-label": "Surfaces to paint", onchange: (e) => { line.surfaces = e.target.value; recalc(); }, value: line.surfaces || "ext" },
          h("option", { value: "ext" }, "External"), h("option", { value: "both" }, "Ext. + internal")));
    };
    if (line.kind === "fitting") {
      size = fittingSizeSelect(line);
      spec = schedSurf(C.findPipe(String(line.size).split(" x ")[0]));
    } else if (line.kind === "pipe") {
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
    refs.msg = h("div", { class: "linemsgs" });
    refs.area = h("td", { class: "num", dataset: { label: "Area (m²)" } });
    refs.mass = h("td", { class: "num", dataset: { label: "Mass (kg)" } });
    const tr = h("tr", { dataset: { id: line.id } },
      h("td", { dataset: { label: "Type" } }, typeSelect(line)),
      h("td", { dataset: { label: "Size" } }, size, refs.msg),
      h("td", { dataset: { label: line.kind === "pipe" || line.kind === "fitting" ? "Schedule" : line.kind === "section" ? "Painted %" : "Details" } }, spec),
      h("td", { dataset: { label: "Qty" } }, numIn("w-qty", "Quantity", "qty", 1, 1)),
      line.kind === "fitting"
        ? h("td", { dataset: { label: "Length (m)" } }, h("span", { class: "perpiece", title: "Fittings are counted by the piece; the area comes from the ASME B16.9 dimensions" }, "per piece"))
        : h("td", { dataset: { label: "Length (m)" } }, numIn("w-len", "Length of each piece in metres", "length", 0, 0.1)),
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
    if (v.startsWith("fit:")) {
      const id = v.slice(4), was = line.kind === "fitting" || line.kind === "pipe" ? line.size : "6";
      const size = nearestFittingSize(id, was), pipe = C.findPipe(size.split(" x ")[0]);
      Object.assign(line, { kind: "fitting", fitting: id, size, schedule: pipe && line.schedule in pipe.walls ? line.schedule : "STD", surfaces: line.surfaces || "ext" });
      if (!(+line.qty > 0)) line.qty = 1;
    } else if (v === "pipe") Object.assign(line, { kind: "pipe", size: "6", schedule: "STD", surfaces: "ext", length: line.length || 6 });
    else if (v === "custom") Object.assign(line, { kind: "custom", label: "", perimeter: "", massPerM: "", length: line.length || 6 });
    else Object.assign(line, { kind: "section", family: v, size: C.findFamily(v).items[0][0], paintPct: 100, length: line.length || 6 });
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
    return C.findFamily("SA-UB") ? "SA-UB" : DB.sections.families[0].id;
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
        ? h("div", {}, h("b", {}, `${e.id} ${e.name.toLowerCase()} corrosivity`), ` · first-year loss: carbon steel ${band(e.steelGm2)} g/m² (${band(e.steelUm)} µm), zinc ${band(e.zincGm2)} g/m² (${band(e.zincUm)} µm)`)
        : h("div", {}, h("b", {}, `${e.id}: ${e.name.toLowerCase()}`)),
      e.outside ? h("div", {}, h("b", {}, "Outside: "), e.outside) : null,
      e.inside ? h("div", {}, h("b", {}, "Inside: "), e.inside) : null,
      e.examples ? h("div", {}, h("b", {}, "Examples: "), e.examples) : null,
      h("div", {}, h("b", {}, "Durability: "), `${d.label}, ${d.years} to the first major maintenance (a planning range, not a guarantee)`),
      e.id === "C1" ? h("div", { class: "small", style: "margin-top:4px" }, ISO.notes.c1) : null);
  }

  // ---- hot-dip galvanizing (ISO 1461, ISO 14713-1)
  const GALV = DB.galvanizing;
  const isGalvOnly = () => state.substrate === "galv";
  const hasZinc = () => state.substrate === "galv" || state.substrate === "hdg";
  /** Thinnest and thickest steel element in the list, mm (null when no line has a known thickness). */
  function steelRange() {
    let min = Infinity, max = 0;
    for (const l of state.lines) { const t = C.elementThickness(l); if (t) { min = Math.min(min, t.min); max = Math.max(max, t.max); } }
    return max > 0 ? { min, max } : null;
  }
  /** The ISO 1461 band checked: the user's, or (auto) the band of the thickest steel, whose minimum is the highest. */
  function galvBandId() {
    if (state.galvBand !== "auto") return state.galvBand;
    const r = steelRange(), b = r && C.bandForThickness(r.max);
    return b ? b.id : "s6";
  }
  const galvUm = () => (+state.galvUm > 0 ? +state.galvUm : C.galvBand(galvBandId()).mean);
  const DUR_YEARS = { L: 0, M: 7, H: 15, VH: 25 };
  function fillGalvBands() {
    const opt = (b) => h("option", { value: b.id }, `${b.label}: ${b.mean} µm mean, ${b.local} local`);
    fill($("#g-band"), h("option", { value: "auto" }, "From the member list"),
      h("optgroup", { label: "ISO 1461 Table 3 (not centrifuged)" }, GALV.bands.filter((b) => b.table === 3).map(opt)),
      h("optgroup", { label: "ISO 1461 Table 4 (centrifuged)" }, GALV.bands.filter((b) => b.table === 4).map(opt)));
  }
  /** Everything about the zinc coating for the current list: band, thickness, ISO 1461 check, life, area and mass. */
  function galvResult(t) {
    const bandId = galvBandId(), um = galvUm();
    const area = C.galvArea(state.lines, state.allow, state.galvInside);
    return { bandId, band: C.galvBand(bandId), um, check: C.galvCheck(um, bandId), life: C.zincLife(um, state.env),
      area, zinc: C.zincQuantities(area.total, um, t.massKnown && t.mass > 0 ? t.mass : null),
      pieces: state.lines.map((l) => C.pieceWeights(l, um, state.galvInside)) };
  }
  function renderGalv(z) {
    const r = steelRange(), autoBand = r && C.bandForThickness(r.max);
    $("#g-band option[value=auto]").textContent = r
      ? `From the member list: thickest steel ${nf(r.max, 1)} mm (${autoBand.label.toLowerCase()})`
      : "From the member list (no thickness known yet: > 6 mm)";
    $("#g-band").value = state.galvBand;
    const gum = $("#g-um");
    gum.placeholder = `${z.band.mean} (ISO 1461 minimum)`;
    if (document.activeElement !== gum) gum.value = state.galvUm;
    $("#g-inside").checked = state.galvInside;
    // which ISO 1461 thickness ranges the list contains (each range is judged on its own minimum)
    const bands = new Map();
    state.lines.forEach((l) => { const tt = C.elementThickness(l); if (tt) [tt.min, tt.max].forEach((x) => { const b = C.bandForThickness(x); if (b) bands.set(b.id, b); }); });
    const custom = state.lines.some((l) => l.kind === "custom");
    fill($("#g-steel-info"),
      r ? `Steel in the list is ${nf(r.min, 1)} to ${nf(r.max, 1)} mm thick (thinnest web or wall to thickest flange). ISO 1461 judges each thickness range on its own minimum: `
        + GALV.bands.filter((b) => bands.has(b.id)).map((b) => `${b.label.replace("Steel ", "")} ${b.mean} µm mean (${b.local} local)`).join("; ") + ". "
        : "Add members to see their steel thickness. ",
      custom ? "Custom members have no thickness on record: check them yourself. " : "",
      `Leave the thickness blank to use the minimum (${z.band.mean} µm); galvanizers usually exceed it.`);
    const c = z.check, life = z.life, dur = ISO.durability[state.dur];
    const need = life && life.kind === "atm" && DUR_YEARS[state.dur] ? Math.ceil(DUR_YEARS[state.dur] * life.rate[1]) : 0;
    fill($("#g-check"),
      h("div", { class: "head" }, h("b", {}, c.ok ? "✓ Meets ISO 1461. " : "✗ Below the ISO 1461 minimum. "),
        `${nf(z.um, 0)} µm mean (${nf(z.zinc.gm2, 0)} g/m²) against ${c.mean} µm mean and ${c.local} µm local (${c.massMean} / ${c.massLocal} g/m²) for ${c.band.label.toLowerCase()}, Table ${c.band.table}.`,
        c.status === "local" ? " It reaches the local minimum but not the mean: the article fails." : ""),
      life && life.kind === "atm"
        ? h("div", { class: "next" }, h("b", {}, `Life to first maintenance in ${state.env}: ${C.lifeText(life)}. `),
          `${nf(z.um, 0)} µm ÷ zinc loss of ${life.rate[0]}–${life.rate[1]} µm a year (ISO 9223), ISO 14713-1 method. `,
          state.dur === "L" ? "" : C.lifeMeets(life, state.dur)
            ? `✓ Reaches ${dur.label.toLowerCase()} durability (${dur.years}) even at the shorter life.`
            : `✗ The shorter life (${life.min} years) is under ${dur.label.toLowerCase()} durability (${dur.years}): it needs about ${need} µm, or a duplex system.`)
        : h("div", { class: "next" }, h("b", {}, `${state.env}: no life figure. `), GALV.notes.immersion),
      state.substrate === "hdg" ? h("div", { class: "next" }, GALV.notes.duplex) : null);
    fill($("#g-notes-body"),
      h("ul", {}, [GALV.notes.method, GALV.notes.firstYear, GALV.notes.actual, GALV.notes.measurement].map((n) => h("li", {}, n))),
      h("b", { class: "small" }, "Design for galvanizing (ISO 14713-2 / SANS 14713-2)"),
      h("ul", {}, GALV.notes.design.map((d) => h("li", {}, d))),
      h("b", { class: "small" }, "Standards and South African equivalents"),
      h("ul", {}, GALV.notes.references.map((d) => h("li", {}, d))));
  }
  function applyMode() {
    const g = isGalvOnly(), z = hasZinc();
    $("#paint-part").hidden = g; $("#f-supplier").hidden = g; $("#f-loss").hidden = g; $("#loss-note").hidden = g;
    $("#galv-part").hidden = !z; $("#galv-results").hidden = !z;
    $("#paint-results").hidden = g; $("#paint-results-h").hidden = !z || g;
  }
  /** After a change of protection, environment or durability: paint modes pick a system, galvanizing just recomputes. */
  function refreshSystem() {
    applyMode();
    if (isGalvOnly()) recalc(); else autoSelect();
  }

  // ---- qualifying systems
  // where each supplier's systems come from (data/systems*.js)
  const SYSTEM_SOURCE = {
    jotun: "Jotun's ISO 12944 Coating Selector (rev. 2)",
    hempel: "Hempel's guide \u201CHow to select the right paint system\u201D (ISO 12944, Oct 2023)",
    ppg: "PPG's ISO 12944 global system selector (2023)"
  };
  const supplierOf = (sys) => supplierShort(sys.supplier) || sys.supplier;
  let lastArea = 0;
  function renderRecs() {
    const recs = C.recommend({ substrate: state.substrate, env: state.env, dur: state.dur, supplier: state.supplier, area: lastArea, lossPct: state.loss });
    const sub = ISO.substrates.find((x) => x.id === state.substrate);
    $("#recs-title").textContent = `Systems that meet ${state.env} ${ISO.durability[state.dur].label.toLowerCase()} on ${sub.name.split(" (")[0].toLowerCase()}: ${recs.length}`;
    $("#recs-litres-h").textContent = lastArea > 0 ? "Paint for this job (L)" : "Paint per 100 m² (L)";
    const sub0 = recs.length && recs[0].substituted, src = recs.length ? recs[0].system.supplier : state.supplier;
    fill($("#recs-note"),
      `From ${SYSTEM_SOURCE[src] || supplierShort(src) + "'s systems"}, sorted by least paint. `,
      sub0 ? `${supplierShort(state.supplier)} has no systems of its own here in the library, so Jotun's builds are shown with ${supplierShort(state.supplier)} products of the same type: they are not ${supplierShort(state.supplier)}-certified systems. ` : "",
      recs.some((r) => r.tested) ? "Systems marked \u201Ctested\u201D are rated by the supplier from ISO 12944-6 / -9 performance tests and fall short of the ISO 12944-5 Annex B minimum coats or thickness. " : "",
      C.getEnv(state.env).kind === "part9" ? `CX and Im4 systems are ${supplierShort(src)}'s ISO 12944-9 tested systems.` : "");
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
          r.tested && C.getEnv(state.env).kind !== "part9" ? h("span", { class: "badge info", title: "Rated by the supplier from performance tests (ISO 12944-6); below the ISO 12944-5 Annex B minimums" }, "tested") : null,
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
        ? [h("b", {}, "✓ Tested system. "), `This build matches ${supplierShort(a.testedBy)}'s ISO 12944-9 system ${a.tested}.`]
        : [h("b", {}, "Not a tested system. "), "This build does not match any ISO 12944-9 system in the library."]),
      h("div", { class: "next" }, ISO.notes.part9));
      return a;
    }
    if (!a.applicable) { fill(el, h("div", { class: "head" }, h("b", {}, "ISO 12944-5 check: "), a.reason || "not applicable")); return a; }
    const want = ISO.durabilities.indexOf(state.dur), got = a.achieved ? ISO.durabilities.indexOf(a.achieved) : -1;
    const sys = currentSystem(), testedPick = sys && sys.basis === "tested" && !isEdited() && got < want;
    fill(el,
      testedPick ? h("div", { class: "head", style: "margin-bottom:6px" }, h("b", {}, `Rated ${ISO.durability[sys.dur].label.toLowerCase()} by ${supplierOf(sys)} from performance testing. `),
        `${sysName(sys.id)} is the supplier's tested system (ISO 12944-6); its rating does not come from the ISO 12944-5 minimum-thickness tables below.`) : null,
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
    fillEnvAndDur(); renderEnv(); refreshSystem();
  }
  function onEnv() {
    state.env = envSel.value;
    fillEnvAndDur(); renderEnv(); refreshSystem();
  }
  function onDurability() {
    state.dur = durSel.value;
    renderEnv(); refreshSystem();
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
    if (!isGalvOnly()) renderRecs();
    state.lines.forEach((line, i) => {
      const refs = rowRefs.get(line.id), m = t.lines[i];
      if (!refs) return;
      refs.tr.classList.toggle("err", !m.ok);
      refs.area.textContent = m.ok ? nf(m.area) : "–";
      refs.mass.textContent = m.ok && m.mass !== null ? nf(m.mass, 1) : "–";
      fill(refs.msg, m.ok ? [m.note ? h("div", { class: "rownote" }, `* ${m.note}`) : null, m.warnings.map((w) => h("div", { class: "rowwarn" }, w))]
        : h("div", { class: "rowmsg" }, m.error));
    });
    fill($("#members-summary"),
      summaryLine("Pipe:", `${nf(t.pipeLength, 1)} m · ${nf(t.pipeArea - t.fittingArea)} m²`),
      t.fittingCount ? summaryLine("Fittings:", `${nf(t.fittingCount, 0)} pcs · ${nf(t.fittingArea)} m²`) : null,
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

  /** Specification lines for the zinc coating. */
  function galvSpecLines(z) {
    const c = z.check, lines = [
      `Hot-dip galvanize to ISO 1461 (SANS 121)${isGalvOnly() ? ", no paint" : ", then paint as below (duplex)"}.`,
      `Zinc coating: mean ${nf(z.um, 0)} \u00B5m (${nf(z.zinc.gm2, 0)} g/m\u00B2). ISO 1461 Table ${c.band.table} minimum for ${c.band.label.toLowerCase()}: ${c.mean} \u00B5m mean, ${c.local} \u00B5m local${c.ok ? "." : ` \u2014 THE COATING ENTERED IS BELOW IT.`}`
    ];
    lines.push(z.life && z.life.kind === "atm"
      ? `Expected life to first maintenance in ${state.env}: ${C.lifeText(z.life)} (ISO 14713-1; zinc loss ${z.life.rate[0]}\u2013${z.life.rate[1]} \u00B5m a year, ISO 9223).`
      : `${state.env}: ${GALV.notes.immersion}`);
    if (state.substrate === "hdg") lines.push(GALV.notes.duplex);
    lines.push("Vent and drain hollow sections and enclosed spaces (ISO 1461 Annex B, ISO 14713-2 / SANS 14713-2); seal-weld overlaps.");
    lines.push("Inspection: magnetic thickness (ISO 2178) on reference areas per ISO 1461 6.2; repair uncoated areas per ISO 1461 6.3 (at least 100 \u00B5m).");
    lines.push(`Zinc: about ${nf(z.zinc.kg, 0)} kg on ${nf(z.area.total, 1)} m\u00B2${z.zinc.pctOfSteel !== null ? `, ${nf(z.zinc.pctOfSteel, 1)} % of the steel weight` : ""} at the thickness above.`);
    return lines;
  }

  /** Plain-text specification of the current choice, for copying into a document. */
  function specLines(q, z) {
    if (isGalvOnly()) {
      const e = C.getEnv(state.env);
      return [`Environment: ${e.id} ${e.name.toLowerCase()} (ISO 9223 / ISO 12944-2). Durability: ${ISO.durability[state.dur].label.toLowerCase()}, ${ISO.durability[state.dur].years}.`,
        ...galvSpecLines(z), "Estimate only: confirm the coating thickness and the corrosivity category with the galvanizer and on site."];
    }
    const e = C.getEnv(state.env), sub = ISO.substrates.find((x) => x.id === state.substrate), sys = currentSystem();
    const a = C.assess(state.layers, state.substrate, state.env);
    const primer = state.layers.find((l) => +l.coats > 0);
    const prep = state.substrate === "hdg" ? ISO.surfacePrep.hdg : state.substrate === "tsm" ? ISO.surfacePrep.tsm
      : primer && primer.type === "ZN" ? ISO.surfacePrep.carbonZn : ISO.surfacePrep.carbonOther;
    const lines = [
      `Environment: ${e.id} ${e.name.toLowerCase()} (ISO 12944-2). Durability: ${ISO.durability[state.dur].label.toLowerCase()}, ${ISO.durability[state.dur].years} (ISO 12944-1).`,
      `Substrate: ${sub.name}.`,
      ...(z ? galvSpecLines(z) : []),
      `Surface preparation: ${prep}`,
      `Paint system: ${sys ? `${supplierOf(sys)} ${sysName(sys.id)}${state.supplier === sys.supplier ? "" : `, with ${supplierShort(state.supplier)} products substituted`}${isEdited() ? " (edited)" : ""}` : "own build"}${sys && sys.basis === "tested" && !isEdited() ? ` (rated ${ISO.durability[sys.dur].label.toLowerCase()} by ${supplierOf(sys)} from ISO 12944-6 performance testing)` : ""}`
    ];
    q.rows.filter((r) => r.coats > 0).forEach((r) => lines.push(`  ${ROLE[r.role] || "Layer"}: ${prodName(r.productId)}, ${r.coats} \u00D7 ${r.dft} \u00B5m DFT`));
    lines.push(`Total NDFT ${q.totalDft} \u00B5m in ${q.totalCoats} coat${q.totalCoats === 1 ? "" : "s"}.`);
    if (a.table === "ISO 12944-9") lines.push(a.tested ? `Tested to ISO 12944-9 (${supplierShort(a.testedBy)} system ${a.tested}).` : "Not a tested ISO 12944-9 system: confirm suitability with the paint maker.");
    else if (a.applicable) lines.push(a.achieved
      ? `Meets ISO 12944-5 ${a.table} (${a.column}) up to ${ISO.durability[a.achieved].label.toLowerCase()} durability${ISO.durabilities.indexOf(a.achieved) < ISO.durabilities.indexOf(state.dur) ? ` \u2014 BELOW the required ${ISO.durability[state.dur].label.toLowerCase()}` : ""}.`
      : `Does not meet the ISO 12944-5 ${a.table} minimums.`);
    lines.push(`Inspection: DFT to ISO 19840; no individual reading above ${3 * q.totalDft} \u00B5m (3 \u00D7 NDFT, ISO 12944-5 7.3) unless agreed.`);
    lines.push("Estimate only: confirm products against the supplier's current data sheets and the system with the supplier.");
    return lines;
  }

  function renderGalvResults(z, t) {
    const c = z.check, l = z.life;
    const row = (item, value, basis, cls) => h("tr", { class: cls || "" }, h("td", { class: "strong", dataset: { label: "Item" } }, item),
      h("td", { class: "num", dataset: { label: "Value" } }, value), h("td", { dataset: { label: "Basis" } }, basis));
    fill($("#galv-table tbody"),
      row("Coating thickness (mean)", `${nf(z.um, 0)} µm`, `${c.ok ? "✓" : "✗"} ISO 1461 minimum for ${c.band.label.toLowerCase()}: ${c.mean} µm mean, ${c.local} µm local`, c.ok ? "" : "err"),
      row("Coating mass", `${nf(z.zinc.gm2, 0)} g/m²`, "thickness × 7.2 (zinc coating density 7.2 g/cm³, ISO 1461)"),
      row("Galvanized area", `${nf(z.area.total)} m²`, `outside ${nf(z.area.outer)} m²${z.area.inner ? ` + inside of tubes and pipes ${nf(z.area.inner)} m²` : ""}${+state.allow ? ` + ${nf(+state.allow, 0)}% allowance` : ""}`),
      row("Zinc on the job", `${nf(z.zinc.kg, 1)} kg`, "galvanized area × coating mass"),
      row("Zinc volume", `${nf(z.zinc.litres, 2)} L`, "galvanized area × thickness"),
      row("Added weight", z.zinc.pctOfSteel !== null ? `+ ${nf(z.zinc.pctOfSteel, 1)} %` : "–",
        t.massKnown && t.mass > 0 ? `steel ${nf(t.mass / 1000, 2)} t → galvanized ${nf((t.mass + z.zinc.kg) / 1000, 2)} t` : "steel mass unknown for a custom member"),
      row("Life to first maintenance", l && l.kind === "atm" ? C.lifeText(l) : "specialist advice",
        l && l.kind === "atm" ? `${state.env}: thickness ÷ zinc loss ${l.rate[0]}–${l.rate[1]} µm a year (ISO 9223, ISO 14713-1)` : "immersion or buried: consider duplex"));
    const pieces = state.lines.map((line, i) => ({ line, p: z.pieces[i] })).filter((x) => x.p);
    fill($("#weights-table tbody"), pieces.length ? pieces.map(({ p }) => h("tr", {},
      h("td", { dataset: { label: "Member" } }, p.label),
      h("td", { class: "num", dataset: { label: "Pieces" } }, nf(p.qty, 0)),
      h("td", { class: "num", dataset: { label: "Steel per piece (kg)" } }, nf(p.steel, 1)),
      h("td", { class: "num", dataset: { label: "Zinc per piece (kg)" } }, nf(p.zinc, 2)),
      h("td", { class: "num strong", dataset: { label: "Galvanized piece (kg)" } }, nf(p.total, 1)),
      h("td", { class: "num", dataset: { label: "All pieces (kg)" } }, nf(p.total * p.qty, 1))))
      : h("tr", {}, h("td", { colspan: 6, class: "empty" }, "No members with a known mass.")));
    const tot = pieces.reduce((a, { p }) => ({ steel: a.steel + p.steel * p.qty, zinc: a.zinc + p.zinc * p.qty }), { steel: 0, zinc: 0 });
    fill($("#weights-table tfoot"), pieces.length ? h("tr", {},
      h("td", { colspan: 2, class: "strong", dataset: { label: "Total" } }, "All members"),
      h("td", { class: "num", dataset: { label: "Steel (kg)" } }, nf(tot.steel, 1)),
      h("td", { class: "num", dataset: { label: "Zinc (kg)" } }, nf(tot.zinc, 1)), h("td"),
      h("td", { class: "num strong", dataset: { label: "Galvanized (kg)" } }, nf(tot.steel + tot.zinc, 1))) : null);
  }

  let lastResult = null;
  function renderResults(t) {
    const z = hasZinc() ? galvResult(t) : null;
    if (z) { renderGalv(z); renderGalvResults(z, t); }
    if (isGalvOnly()) {
      lastResult = { t, z, spec: specLines(null, z) };
      $("#spec").textContent = lastResult.spec.join("\n");
      const l = z.life;
      fill($("#kpis"),
        h("div", { class: "kpi main" }, h("div", { class: "l" }, "Total surface area"), h("div", { class: "v" }, `${nf(t.totalArea)} m²`), h("div", { class: "s" }, t.allowanceArea ? `includes ${nf(+state.allow, 0)}% allowance` : "outside surfaces")),
        h("div", { class: "kpi" }, h("div", { class: "l" }, "Zinc coating"), h("div", { class: "v" }, `${nf(z.um, 0)} µm`), h("div", { class: "s" }, `${nf(z.zinc.gm2, 0)} g/m² · ${z.check.ok ? "meets" : "below"} ISO 1461`)),
        h("div", { class: "kpi" }, h("div", { class: "l" }, "Zinc"), h("div", { class: "v" }, `${nf(z.zinc.kg, 0)} kg`), h("div", { class: "s" }, z.zinc.pctOfSteel !== null ? `adds ${nf(z.zinc.pctOfSteel, 1)}% to the steel` : `${nf(z.area.total)} m² galvanized`)),
        h("div", { class: "kpi main" }, h("div", { class: "l" }, "Life to first maintenance"), h("div", { class: "v" }, l && l.kind === "atm" ? C.lifeText(l) : "Ask"), h("div", { class: "s" }, l && l.kind === "atm" ? `${state.env}, ISO 14713-1` : "immersion: specialist advice")));
      return;
    }
    const q = C.paintQuantities(t.totalArea, state.layers, state.loss);
    const order = orderSummary(q);
    const toOrder = order.reduce((s, e) => s + Math.ceil(e.litres - 1e-9), 0);
    lastResult = { t, q, z, order, spec: specLines(q, z) };
    $("#spec").textContent = lastResult.spec.join("\n");
    fill($("#kpis"),
      h("div", { class: "kpi main" }, h("div", { class: "l" }, "Total surface area"), h("div", { class: "v" }, `${nf(t.totalArea)} m²`), h("div", { class: "s" }, t.allowanceArea ? `includes ${nf(+state.allow, 0)}% allowance` : "no allowance added")),
      h("div", { class: "kpi" }, h("div", { class: "l" }, "Pipe"), h("div", { class: "v" }, `${nf(t.pipeArea)} m²`), h("div", { class: "s" }, `${nf(t.pipeLength, 1)} m of pipe${t.fittingCount ? ` + ${nf(t.fittingCount, 0)} fittings` : ""}`)),
      h("div", { class: "kpi" }, h("div", { class: "l" }, "Structural steel"), h("div", { class: "v" }, `${nf(t.steelArea)} m²`), h("div", { class: "s" }, `${nf(t.steelLength, 1)} m of members`)),
      h("div", { class: "kpi" }, h("div", { class: "l" }, "System"), h("div", { class: "v" }, `${q.totalDft} µm`), h("div", { class: "s" }, `${q.totalCoats} coats in ${q.rows.filter((r) => r.coats > 0).length} layers`)),
      z ? h("div", { class: "kpi" }, h("div", { class: "l" }, "Zinc"), h("div", { class: "v" }, `${nf(z.zinc.kg, 0)} kg`), h("div", { class: "s" }, `${nf(z.um, 0)} µm galvanizing`)) : null,
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
    const { t, q, order, z } = lastResult;
    const rows = [];
    const add = (...cells) => rows.push(cells.map(csvCell).join(","));
    add(isGalvOnly() ? "Hot-dip galvanizing calculation" : "Paint quantity calculation");
    if (isGalvOnly()) { add("Environment", state.env, "Durability", state.dur, "Protection", "hot-dip galvanized (ISO 1461), no paint"); add("Area allowance %", state.allow); }
    else {
      add("Environment", state.env, "Durability", state.dur, "Substrate", state.substrate, "Supplier", supplierName(state.supplier), "System", state.systemId ? sysName(state.systemId) + (isEdited() ? " (edited)" : "") : "own build");
      add("Application loss %", state.loss, "Area allowance %", state.allow);
    }
    add();
    add("Members"); add("Description", "Qty", "Length (m)", "Area per metre or piece (m2)", "Area (m2)", "Mass (kg)", "Note");
    state.lines.forEach((l, i) => { const m = t.lines[i]; add(m.ok ? m.label : m.error, l.qty, m.perPiece ? "per piece" : l.length, m.ok ? m.areaPerM.toFixed(4) : "", m.ok ? m.area.toFixed(3) : "", m.ok && m.mass !== null ? m.mass.toFixed(1) : "", m.ok && m.note ? m.note : m.perPiece ? "ASME B16.9" : ""); });
    add("Total area (m2)", "", "", "", t.totalArea.toFixed(3));
    add();
    if (z) {
      add("Hot-dip galvanizing (ISO 1461)");
      add("Coating mean thickness (um)", z.um, "Coating mass (g/m2)", z.zinc.gm2.toFixed(0), "ISO 1461 minimum mean / local (um)", `${z.check.mean} / ${z.check.local}`, "Meets ISO 1461", z.check.ok ? "yes" : "NO");
      add("Galvanized area (m2)", z.area.total.toFixed(2), "Zinc (kg)", z.zinc.kg.toFixed(1), "Zinc volume (L)", z.zinc.litres.toFixed(2), "Added weight (% of steel)", z.zinc.pctOfSteel !== null ? z.zinc.pctOfSteel.toFixed(1) : "");
      add("Life to first maintenance", z.life && z.life.kind === "atm" ? C.lifeText(z.life) : "specialist advice (immersion)");
      add("Member", "Pieces", "Steel per piece (kg)", "Zinc per piece (kg)", "Galvanized piece (kg)", "All pieces (kg)");
      z.pieces.forEach((p) => { if (p) add(p.label, p.qty, p.steel.toFixed(1), p.zinc.toFixed(2), p.total.toFixed(1), (p.total * p.qty).toFixed(1)); });
      add();
    }
    if (q) {
    add("Paint system"); add("Layer", "Product", "Coats", "DFT per coat (um)", "Volume solids %", "Wet film per coat (um)", "Litres per coat (incl. loss)", "Litres theoretical", "Litres incl. loss");
    q.rows.forEach((r) => { const p = C.getProduct(state.supplier, r.productId); add(ROLE[r.role] || "Layer", p ? p.name : "", r.coats, r.dft, r.vs, r.wft.toFixed(0), r.litresPerCoat.toFixed(2), r.theoretical.toFixed(2), r.litres.toFixed(2)); });
    add("Total", "", q.totalCoats, q.totalDft, "", "", "", q.theoretical.toFixed(2), q.litres.toFixed(2));
    add();
    add("Order by product"); add("Product", "Litres (whole)", "Used in");
    order.forEach((e) => add(e.name, Math.ceil(e.litres - 1e-9), [...new Set(e.roles)].join(" + ")));
    add();
    }
    add();
    add("Specification");
    lastResult.spec.forEach((line) => add(line));
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = h("a", { href: URL.createObjectURL(blob), download: isGalvOnly() ? "galvanizing.csv" : "paint-quantities.csv" });
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
      "ELBOW, 6, 8, 40", "PIPE TEE, 6 x 3, 4, 40", "REDUCER, 10 x 6, 2", "CAP, 3, 2, 80",
      "UB, 305x165x40, 6.0, 8", "UC, 203x203x46, 4.5, 12", "PFC, 200x75, 6.0, 10", "L, 80x80x8, 3.0, 24", "SHS, 100x100x4, 3.0, 12"
    ].join("\n");
    const r = C.parseList(text);
    state.lines = r.lines.map((l) => ({ ...l, id: newId() }));
    renderMembers(); recalc();
  }

  // ------------------------------------------------------------------ wiring
  $("#add-pipe").addEventListener("click", () => addLine({ kind: "pipe", size: "6", schedule: "STD", surfaces: "ext", length: 6, qty: 1 }));
  $("#add-section").addEventListener("click", () => { const f = lastSectionFamily(); addLine({ kind: "section", family: f, size: C.findFamily(f).items[0][0], paintPct: 100, length: 6, qty: 1 }); });
  $("#add-fitting").addEventListener("click", () => {
    const last = [...state.lines].reverse().find((l) => l.kind === "fitting" || l.kind === "pipe");
    const id = last && last.kind === "fitting" ? last.fitting : "elbow90LR", size = nearestFittingSize(id, last ? last.size : "6");
    const pipe = C.findPipe(size.split(" x ")[0]), sch = last && pipe && last.schedule in pipe.walls ? last.schedule : "STD";
    addLine({ kind: "fitting", fitting: id, size, schedule: sch, surfaces: "ext", qty: 1 });
  });
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
  $("#g-band").addEventListener("change", (e) => { state.galvBand = e.target.value; recalc(); });
  $("#g-um").addEventListener("input", (e) => { state.galvUm = +e.target.value > 0 ? +e.target.value : ""; recalc(); });
  $("#g-inside").addEventListener("change", (e) => { state.galvInside = e.target.checked; recalc(); });
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
  fillStaticSelects(); fillBands(); fillGalvBands();
  subSel.value = state.substrate; supSel.value = state.supplier;
  fillEnvAndDur();
  $("#loss").value = state.loss; $("#allow").value = state.allow;
  renderEnv(); renderMembers();
  lastArea = C.totals(state.lines, state.allow).totalArea;
  applyMode();
  if (isGalvOnly()) { if (state.layers.length) renderLayers(); recalc(); }
  else if (state.layers.length) { renderLayers(); afterLayerChange(); } else autoSelect();
})();
