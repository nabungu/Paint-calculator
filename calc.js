/* Painting quantity calculation engine. No DOM access: the same file runs in the browser and in Node tests.
 * Reads the databases from globalThis.PaintDB (load data/*.js first).
 *
 * Units: lengths in m, pipe/section dimensions in mm, film thickness in micrometres (um), areas m2, paint litres.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PaintCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  "use strict";

  const db = () => root.PaintDB;
  const num = (v, d = 0) => (Number.isFinite(+v) && v !== "" && v !== null ? +v : d);

  // ------------------------------------------------------------------ database lookups
  function findPipe(nps) {
    return db().pipes.pipes.find((p) => p.nps === String(nps)) || null;
  }
  function findFamily(id) {
    return db().sections.families.find((f) => f.id === id) || null;
  }
  function findSection(familyId, designation) {
    const f = findFamily(familyId);
    return f ? f.items.find((i) => i[0] === designation) || null : null;
  }
  // item = [designation, kg/m, m2/m, dimensions (mm), note (optional)]
  const SECTION = { name: 0, mass: 1, area: 2, dims: 3, note: 4 };

  /** Section catalogues (SAISC, EN, AISC ...), most preferred first. Each data/sections-*.js file adds one. */
  function catalogues() {
    return (db().sections.catalogues || []).slice().sort((a, b) => a.rank - b.rank);
  }
  function findCatalogue(id) {
    return catalogues().find((c) => c.id === id) || null;
  }
  const catRank = (fam) => { const c = findCatalogue(fam.catalogue); return c ? c.rank : Infinity; };
  /** Designation as people write it: "UB 254x146x31", "IPE 200", "W8x31", "L 100x100x10". */
  function sectionName(fam, item) {
    const p = fam.prefix === undefined ? fam.id : fam.prefix;
    const d = item[SECTION.name];
    return !p || d.startsWith(p + " ") || (d.startsWith(p) && /\d/.test(d.charAt(p.length))) ? d : `${p} ${d}`;
  }
  const GROUP_ORDER = ["I-sections", "Channels", "Angles", "Tees", "Hollow sections", "Cold-formed"];
  /** Families for a picker: [{ catalogue, group, families }] by catalogue rank, then group, then file order. */
  function sectionGroups() {
    const out = [];
    for (const cat of catalogues()) {
      const fams = db().sections.families.filter((f) => f.catalogue === cat.id);
      const groups = [...new Set(fams.map((f) => f.group))]
        .sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));
      for (const g of groups) out.push({ catalogue: cat, group: g, families: fams.filter((f) => f.group === g) });
    }
    return out;
  }

  // ------------------------------------------------------------------ geometry
  /** External painted area of a pipe per metre (m2/m) = pi x OD. */
  function pipeExternalPerM(pipe) {
    return (Math.PI * pipe.od) / 1000;
  }
  /** Internal area per metre (m2/m) for a given schedule, or null when the wall is unknown. */
  function pipeInternalPerM(pipe, schedule) {
    const t = pipe.walls[schedule];
    if (t === undefined) return null;
    return (Math.PI * (pipe.od - 2 * t)) / 1000;
  }
  /** Steel mass of a pipe per metre (kg/m), density 7850 kg/m3. */
  function pipeMassPerM(pipe, schedule) {
    const t = pipe.walls[schedule];
    if (t === undefined) return null;
    return (Math.PI * 7850 * (pipe.od - t) * t) / 1e6;
  }

  /**
   * Work out one list line.
   * line = { kind: 'pipe', size: '6', schedule: 'STD', surfaces: 'ext'|'both', length, qty }
   *      | { kind: 'section', family: 'SA-UB', size: '254x146x31', paintPct: 100, length, qty }
   *      | { kind: 'custom', label, perimeter (mm, all painted faces), massPerM (kg/m, optional), length, qty }
   * Returns { ok, error?, label, areaPerM, massPerM, totalLength, area, mass, warnings }; section lines also give
   * catalogue and note (the table's flag for a legacy, superseded or discontinued size, or null).
   */
  function lineMetrics(line) {
    const out = { ok: false, label: "", areaPerM: 0, massPerM: null, totalLength: 0, area: 0, mass: null, warnings: [] };
    const length = num(line.length), qty = num(line.qty);
    out.totalLength = length * qty;
    if (line.kind === "pipe") {
      const pipe = findPipe(line.size);
      if (!pipe) { out.error = `Unknown pipe size "${line.size}"`; return out; }
      out.label = `Pipe NPS ${pipe.nps} (DN${pipe.dn})` + (line.schedule ? ` Sch ${line.schedule}` : "");
      let perM = pipeExternalPerM(pipe);
      if (line.surfaces === "both") {
        const inner = pipeInternalPerM(pipe, line.schedule);
        if (inner === null) out.warnings.push(`NPS ${pipe.nps} has no Sch ${line.schedule} wall in B36.10M: internal area left out`);
        else perM += inner;
      }
      out.areaPerM = perM;
      out.massPerM = line.schedule ? pipeMassPerM(pipe, line.schedule) : null;
      if (line.schedule && out.massPerM === null) out.warnings.push(`NPS ${pipe.nps} has no Sch ${line.schedule} in B36.10M`);
    } else if (line.kind === "custom") {
      // anything not in the database (flat bar, plate, welded section ...): the user supplies the perimeter in mm
      const perimeter = num(line.perimeter);
      if (!(perimeter > 0)) { out.error = "Enter the perimeter (mm) of the custom member"; return out; }
      out.label = line.label ? String(line.label) : "Custom member";
      out.areaPerM = perimeter / 1000;
      out.massPerM = line.massPerM === undefined || line.massPerM === "" || line.massPerM === null ? null : num(line.massPerM);
    } else {
      const fam = findFamily(line.family);
      const sec = fam && findSection(line.family, line.size);
      if (!sec) { out.error = `Unknown section "${line.family} ${line.size}"`; return out; }
      const cat = findCatalogue(fam.catalogue);
      out.label = sectionName(fam, sec) + (cat ? ` (${cat.short}${fam.variant ? ", " + fam.variant : ""})` : "");
      out.catalogue = fam.catalogue || null;
      out.note = sec[SECTION.note] || null;
      const pct = line.paintPct === undefined || line.paintPct === "" ? 100 : num(line.paintPct, 100);
      out.areaPerM = (sec[SECTION.area] * pct) / 100;
      out.massPerM = sec[SECTION.mass];
    }
    out.area = out.areaPerM * out.totalLength;
    out.mass = out.massPerM === null ? null : out.massPerM * out.totalLength;
    out.ok = true;
    return out;
  }

  /** Totals over a list of lines, with an optional % allowance on area (fittings, cleats, flanges ...). */
  function totals(lines, allowancePct) {
    const res = { lines: [], pipeArea: 0, steelArea: 0, pipeLength: 0, steelLength: 0, mass: 0, massKnown: true, errors: 0 };
    for (const line of lines) {
      const m = lineMetrics(line);
      res.lines.push(m);
      if (!m.ok) { res.errors++; continue; }
      if (line.kind === "pipe") { res.pipeArea += m.area; res.pipeLength += m.totalLength; }
      else { res.steelArea += m.area; res.steelLength += m.totalLength; } // sections and custom members
      if (m.mass === null) res.massKnown = false; else res.mass += m.mass;
    }
    res.baseArea = res.pipeArea + res.steelArea;
    res.allowanceArea = (res.baseArea * num(allowancePct)) / 100;
    res.totalArea = res.baseArea + res.allowanceArea;
    return res;
  }

  // ------------------------------------------------------------------ coating systems
  function getSupplier(id) {
    return db().paints.suppliers.find((s) => s.id === id) || null;
  }
  function getProduct(supplierId, productId) {
    const s = getSupplier(supplierId);
    return s ? s.products.find((p) => p.id === productId) || null : null;
  }
  /** Default product of `type` for `dft`: first in supplier order whose recommended range contains it. */
  function pickProduct(supplierId, type, dft) {
    const s = getSupplier(supplierId);
    if (!s) return null;
    const ofType = s.products.filter((p) => p.type === type);
    return ofType.find((p) => dft >= p.dftMin && dft <= p.dftMax) || ofType[0] || null;
  }
  const iso = () => db().iso12944;
  const durs = () => iso().durabilities;
  const durIndex = (d) => durs().indexOf(d);
  function getEnv(id) {
    return iso().environments.find((e) => e.id === id) || null;
  }
  /** C1 is painted, if at all, with a C2 system (ISO 12944-5, 5.1). */
  const tableEnv = (envId) => (envId === "C1" ? "C2" : envId);
  const usedLayers = (layers) => layers.filter((l) => Math.round(num(l.coats)) > 0 && num(l.dft) > 0);
  const roleFor = (i, n) => (i === 0 ? "primer" : i === n - 1 ? "finish" : "mid");

  // ------------------------------------------------------------------ paint system library (systems.js)
  /** Library systems for a substrate and environment. */
  function systemsFor(substrate, envId) {
    const env = tableEnv(envId);
    return (db().systems || []).filter((s) => s.substrate === substrate && s.env === env);
  }
  function getLibrarySystem(id, substrate, envId) {
    return systemsFor(substrate, envId).find((s) => s.id === id) || null;
  }
  /**
   * Editable layers for a library system. With the system's own supplier the named product is used; with another
   * supplier, that supplier's product of the same type is substituted (productId "" when it has none).
   */
  function systemLayers(sys, supplierId) {
    return sys.layers.map((l, i) => {
      const prod = supplierId === sys.supplier ? getProduct(supplierId, l.products[0]) : pickProduct(supplierId, l.type, l.dft);
      return {
        role: roleFor(i, sys.layers.length), type: l.type, coats: l.coats, dft: l.dft,
        productId: prod ? prod.id : "", vs: prod ? prod.vs : "", substituted: supplierId !== sys.supplier
      };
    });
  }

  // ------------------------------------------------------------------ ISO 12944-5 Annex B compliance
  /** The Annex B table for a substrate and environment, keyed by durability, or null when none applies. */
  function requirementsFor(substrate, envId) {
    const e = getEnv(envId);
    if (!e || e.kind === "part9") return null;
    if (e.kind === "imm") return substrate === "carbon" ? iso().minimums.immersion : null;
    const t = iso().minimums[substrate];
    return t ? t[tableEnv(envId)] || null : null;
  }
  const TABLE = { carbon: "Table B.2", hdg: "Table B.3", tsm: "Table B.4" };
  /** Which column of the table the build is judged under; decided by the first coat (the primer). */
  function requirementColumn(layers, substrate, envId) {
    const primer = usedLayers(layers)[0];
    const t = primer ? primer.type : "";
    if (getEnv(envId) && getEnv(envId).kind === "imm")
      return t === "ZN" ? { table: "Table B.5", cols: ["zn"], label: "zinc-rich primer" }
        : { table: "Table B.5", cols: ["misc", "single"], label: "other primer, or one product throughout" };
    if (substrate === "carbon") {
      const col = t === "ZN" ? "zn" : t === "AK" || t === "AY" ? "akay" : "misc";
      return { table: TABLE.carbon, cols: [col], label: { zn: "Zn (R) primer", misc: "other primer (EP, PUR, ESI)", akay: "alkyd / acrylic" }[col] };
    }
    if (substrate === "hdg") {
      if (t === "AK") return { table: TABLE.hdg, cols: [], label: "alkyd", reason: "Table B.3 has no alkyd column: alkyds are not used on galvanizing" };
      const col = t === "AY" ? "ay" : "ep";
      return { table: TABLE.hdg, cols: [col], label: col === "ay" ? "acrylic" : "EP / PUR primer" };
    }
    return { table: TABLE.tsm, cols: ["all"], label: "coats over the sealer" };
  }
  /** A CX / Im4 build counts only if it is one of the tested systems in the library (same types, coats and DFTs). */
  function matchTestedSystem(layers, substrate, envId) {
    const used = usedLayers(layers);
    return systemsFor(substrate, envId).find((s) => s.layers.length === used.length &&
      s.layers.every((l, i) => l.type === used[i].type && l.coats === Math.round(num(used[i].coats)) && l.dft === num(used[i].dft))) || null;
  }

  /**
   * Judge a layer build against ISO 12944-5 Annex B (Tables B.2 to B.5).
   * Returns { applicable, table, column, totalDft, coats, rows: [{ dur, req, alt, met, ok }], achieved, next, reason }.
   * req is { mnoc, ndft }, "none" (no minimum) or null (no figure). achieved = highest durability allowed:
   * the highest one whose minimum is met; lower classes follow. next = the first higher class and its shortfall.
   */
  function assess(layers, substrate, envId) {
    const used = usedLayers(layers);
    const totalDft = used.reduce((s, l) => s + Math.round(num(l.coats)) * num(l.dft), 0);
    const coats = used.reduce((s, l) => s + Math.round(num(l.coats)), 0);
    const out = { applicable: false, totalDft, coats, rows: [], achieved: null, next: null };
    const e = getEnv(envId);
    if (!e) { out.reason = `Unknown environment ${envId}`; return out; }
    if (e.kind === "part9") {
      out.table = "ISO 12944-9";
      const hit = matchTestedSystem(layers, substrate, envId);
      out.tested = hit ? hit.id : null;
      out.achieved = hit ? "H" : null;
      out.reason = iso().notes.part9;
      return out;
    }
    const reqs = requirementsFor(substrate, envId);
    if (!reqs) { out.reason = `ISO 12944-5 gives no minimums for ${envId} on ${substrate === "hdg" ? "galvanized steel" : substrate === "tsm" ? "thermal-sprayed metal" : "this substrate"}`; return out; }
    const col = requirementColumn(layers, substrate, envId);
    out.table = col.table; out.column = col.label;
    if (col.reason) { out.reason = col.reason; return out; }
    if (!used.length) { out.reason = "No coats entered"; return out; }
    out.applicable = true;
    const NONE = iso().NONE;
    const meets = (r) => coats >= r.mnoc && totalDft >= r.ndft;
    for (const d of durs()) {
      const cells = col.cols.map((c) => reqs[d][c]);
      const firm = cells.filter((r) => r && r !== NONE);
      out.rows.push({ dur: d, req: firm[0] || (cells.includes(NONE) ? NONE : null), alt: firm[1] || null, met: firm.some(meets) });
    }
    let top = -1;
    out.rows.forEach((r, i) => { if (r.met) top = i; });
    if (top < 0) while (top + 1 < out.rows.length && out.rows[top + 1].req === NONE) top++;   // "no minimum" classes
    out.rows.forEach((r, i) => { r.ok = i <= top; });
    out.achieved = top >= 0 ? out.rows[top].dur : null;
    const nxt = out.rows.slice(top + 1).find((r) => r.req && r.req !== NONE);
    if (nxt) {
      const best = [nxt.req, nxt.alt].filter(Boolean).sort((a, b) => a.ndft - b.ndft)[0];
      out.next = { dur: nxt.dur, req: best, needCoats: Math.max(0, best.mnoc - coats), needDft: Math.max(0, best.ndft - totalDft) };
    }
    return out;
  }

  /** Durability classes a user can ask for in an environment (CX / Im4 have a single class). */
  function durabilitiesFor(substrate, envId) {
    const e = getEnv(envId);
    if (!e) return [];
    if (substrate === "galv") return durs();     // galvanizing only: every environment, life from the zinc rate
    if (e.kind === "part9") return substrate === "carbon" ? ["H"] : [];
    const reqs = requirementsFor(substrate, envId);
    if (!reqs) return [];
    // the classes the table actually sets (a minimum or "no minimum") in at least one column
    return durs().filter((d) => Object.values(reqs[d]).some((r) => r));
  }

  /** Product DFT-range and type warnings for a layer set. */
  function productWarnings(layers, supplierId) {
    const warnings = [];
    for (const l of layers) {
      if (Math.round(num(l.coats)) <= 0) continue;
      const p = getProduct(supplierId, l.productId);
      if (!p) { warnings.push(`${supplierName(supplierId)} has no ${(db().paints.layerTypes[l.type] || l.type).toLowerCase()} in the database for this layer`); continue; }
      const dft = num(l.dft);
      if (dft < p.dftMin || dft > p.dftMax) warnings.push(`${p.name}: ${dft} \u00B5m per coat is outside its recommended ${p.dftMin}\u2013${p.dftMax} \u00B5m`);
      if (p.type !== l.type) warnings.push(`${p.name} is a ${db().paints.layerTypes[p.type].toLowerCase()}, not a ${db().paints.layerTypes[l.type].toLowerCase()}`);
    }
    return warnings;
  }
  const supplierName = (id) => (getSupplier(id) || { name: id }).name;
  const reqText = (r) => `${r.mnoc} coat${r.mnoc > 1 ? "s" : ""} and ${r.ndft} \u00B5m`;

  /** Every warning for a build: product ranges, zinc primer thickness, and shortfall against the required durability. */
  function checkLayers(layers, supplierId, { substrate, env: envId, dur }) {
    const warnings = productWarnings(layers, supplierId);
    const primer = usedLayers(layers)[0];
    if (primer && primer.type === "ZN" && (num(primer.dft) < 40 || num(primer.dft) > 80))
      warnings.push(`Zinc-rich primer at ${num(primer.dft)} \u00B5m: ISO 12944-5 Table A.1 gives 40\u201380 \u00B5m as the usual range`);
    const a = assess(layers, substrate, envId);
    if (getEnv(envId) && getEnv(envId).kind === "part9") {
      if (!a.tested) warnings.push("This build is not one of the tested ISO 12944-9 systems, so its CX / Im4 suitability cannot be checked here");
    } else if (a.reason && !a.applicable) {
      warnings.push(a.reason);
    } else if (dur && (a.achieved === null || durIndex(a.achieved) < durIndex(dur))) {
      const row = a.rows.find((r) => r.dur === dur);
      const need = row && row.req && row.req !== iso().NONE ? [row.req, row.alt].filter(Boolean).sort((x, y) => x.ndft - y.ndft)[0] : null;
      warnings.push(need
        ? `Falls short of ${dur} durability (${a.table}, ${a.column}): needs at least ${reqText(need)}; this build has ${a.coats} coat${a.coats === 1 ? "" : "s"} and ${a.totalDft} \u00B5m`
        : `${a.table} has no ${dur} minimum for a ${a.column} build: ${dur} durability is not reachable with this primer type`);
    }
    return warnings;
  }

  /**
   * Library systems that reach `dur` in the environment, with the supplier's products, least paint first.
   * Each entry: { system, layers, litres (for area, or per 100 m2 when area is 0), totalDft, coats, missing, warnings }.
   */
  function recommend({ substrate, env: envId, dur, supplier, area, lossPct }) {
    const basis = area > 0 ? area : 100;
    const out = [];
    for (const sys of systemsFor(substrate, envId)) {
      if (dur && durIndex(sys.dur) < durIndex(dur)) continue;
      const layers = systemLayers(sys, supplier);
      const q = paintQuantities(basis, layers.map((l) => ({ ...l, vs: l.vs || 100 })), lossPct);
      out.push({
        system: sys, layers, litres: q.litres, totalDft: q.totalDft, coats: q.totalCoats,
        missing: layers.some((l) => !l.productId), warnings: productWarnings(layers, supplier)
      });
    }
    out.sort((a, b) => a.missing - b.missing || a.warnings.length - b.warnings.length || a.litres - b.litres || a.coats - b.coats);
    return out;
  }

  /**
   * Corrosivity category from first-year losses of standard specimens (ISO 12944-2 Table 1).
   * Give any of steelGm2, steelUm, zincGm2, zincUm; when they disagree the higher category is taken.
   * Returns { env, byMeasure: { measure: env } } or null; env "beyond CX" above the CX band.
   */
  function categoryFromLoss(m) {
    const cats = iso().environments.filter((e) => e.steelGm2);
    const byMeasure = {};
    for (const key of ["steelGm2", "steelUm", "zincGm2", "zincUm"]) {
      const v = num(m[key], NaN);
      if (!Number.isFinite(v) || v < 0) continue;
      const hit = cats.find((e) => (e.id === "C1" ? v <= e[key][1] : v > e[key][0] && v <= e[key][1]));
      byMeasure[key] = hit ? hit.id : "beyond CX";
    }
    const vals = Object.values(byMeasure);
    if (!vals.length) return null;
    const rank = (id) => (id === "beyond CX" ? 99 : cats.findIndex((e) => e.id === id));
    return { env: vals.sort((a, b) => rank(b) - rank(a))[0], byMeasure };
  }

  /**
   * Paint quantities.
   * layers: [{ role, type, productId, coats, dft, vs }]; lossPct: application loss as % of paint used.
   * Litres = area x DFT / (10 x VS%); practical litres = litres / (1 - loss).
   */
  function paintQuantities(area, layers, lossPct) {
    const loss = Math.min(Math.max(num(lossPct), 0), 90) / 100;
    const rows = layers.map((l) => {
      const coats = Math.max(0, Math.round(num(l.coats))), dft = Math.max(0, num(l.dft));
      const vs = Math.min(Math.max(num(l.vs, 100), 1), 100);
      const litresPerCoat = vs > 0 ? (area * dft) / (10 * vs) : 0;
      const theoretical = litresPerCoat * coats;
      return {
        role: l.role, type: l.type, productId: l.productId, coats, dft, vs,
        totalDft: coats * dft,
        wft: dft / (vs / 100),
        theoreticalCover: dft > 0 ? (vs * 10) / dft : 0,           // m2/L per coat, theoretical
        practicalCover: dft > 0 ? ((vs * 10) / dft) * (1 - loss) : 0, // m2/L per coat, after loss
        litresPerCoat: litresPerCoat / (1 - loss),
        theoretical,
        litres: theoretical / (1 - loss)
      };
    });
    return {
      rows,
      totalDft: rows.reduce((s, r) => s + r.totalDft, 0),
      totalCoats: rows.reduce((s, r) => s + r.coats, 0),
      theoretical: rows.reduce((s, r) => s + r.theoretical, 0),
      litres: rows.reduce((s, r) => s + r.litres, 0)
    };
  }

  // ------------------------------------------------------------------ hot-dip galvanizing (ISO 1461, ISO 14713-1)
  const galv = () => db().galvanizing;
  function galvBand(id) {
    return galv().bands.find((b) => b.id === id) || null;
  }
  /** ISO 1461 Table 3 band for uncentrifuged steel of thickness t mm (null when t is unknown). */
  function bandForThickness(t) {
    if (!(t > 0)) return null;
    return galv().bands.find((b) => b.table === 3 && b.tMax !== undefined &&
      (b.lowIncl ? t >= b.tMin : t > b.tMin) && t <= b.tMax) || null;
  }
  /**
   * Thinnest and thickest steel element of a line, mm: the web and flange of I-sections, channels and tees, the leg of
   * an angle, the wall of a tube, lipped section or pipe. Null for custom members (no thickness known).
   */
  function elementThickness(line) {
    if (line.kind === "pipe") {
      const p = findPipe(line.size), t = p && p.walls[line.schedule];
      return t ? { min: t, max: t } : null;
    }
    if (line.kind !== "section") return null;
    const fam = findFamily(line.family), it = fam && findSection(line.family, line.size);
    if (!it) return null;
    const n = String(it[SECTION.dims]).split("×").map(Number);
    if (n.some((x) => !(x > 0))) return null;
    const ts = ["I-sections", "Channels", "Tees"].includes(fam.group) && n.length >= 4 ? [n[2], n[3]] : [n[n.length - 1]];
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }
  /**
   * ISO 1461 check of a mean coating thickness for a band: ok when at least the mean minimum; "local" when below the
   * mean but at least the local minimum; "fail" below both.
   */
  function galvCheck(um, bandId) {
    const b = galvBand(bandId);
    if (!b) return null;
    const t = num(um);
    const status = t >= b.mean ? "ok" : t >= b.local ? "local" : "fail";
    return { band: b, um: t, status, ok: status === "ok", mean: b.mean, local: b.local, massMean: b.massMean, massLocal: b.massLocal };
  }
  /**
   * Life to first maintenance of a zinc coating (ISO 14713-1): thickness / first-year zinc rate (ISO 9223 band).
   * Returns { kind: "atm", rate: [lo, hi], min, max } in whole years (Infinity above the cap) or { kind: "imm" }.
   */
  function zincLife(um, envId) {
    const e = getEnv(envId);
    if (!e) return null;
    if (!e.zincUm) return { kind: "imm", env: e };
    const t = num(um), cap = galv().lifeCap, [lo, hi] = e.zincUm;
    const years = (rate) => { if (!(rate > 0)) return Infinity; const y = Math.floor(t / rate); return y > cap ? Infinity : y; };
    return { kind: "atm", env: e, rate: [lo, hi], min: years(hi), max: years(lo) };
  }
  const yearsText = (y) => (y === Infinity ? `> ${galv().lifeCap}` : String(y));
  /** "40 to > 100 years", "20–40 years", "> 100 years". */
  function lifeText(life) {
    if (!life || life.kind !== "atm") return "";
    if (life.min === life.max) return `${yearsText(life.min)} years`;
    return life.max === Infinity ? `${life.min} to > ${galv().lifeCap} years` : `${life.min}\u2013${life.max} years`;
  }
  // ISO 12944-1 durability classes as years: low up to 7, medium 7 to 15, high 15 to 25, very high over 25
  const DUR_YEARS = { L: 0, M: 7, H: 15, VH: 25 };
  /** True when the shorter life reaches the lower bound of the durability class asked for. */
  const lifeMeets = (life, dur) => !!life && life.kind === "atm" && life.min >= (DUR_YEARS[dur] || 0);
  /** Zinc on a job: coating mass g/m2 (= um x 7.2), total kg, volume litres, and that as a share of the steel. */
  function zincQuantities(area, um, steelKg) {
    const t = num(um), gm2 = t * galv().density;
    const kg = (num(area) * gm2) / 1000;
    return { um: t, gm2, kg, litres: (num(area) * t) / 1000, pctOfSteel: steelKg > 0 ? (kg / steelKg) * 100 : null };
  }
  /**
   * Area per metre a galvanizing bath coats, m2/m: the painted (outer) area, plus, when inside is true, the inside of
   * tubes and pipes, which the zinc reaches through the vent holes. With concentric corners the inside perimeter is
   * the outside perimeter less 2 pi t (exact for round tube, and for square and rectangular tube with ri = ro - t).
   */
  function galvAreaPerM(line, inside) {
    const m = lineMetrics(line);
    if (!m.ok) return null;
    let perM = m.areaPerM, inner = 0;
    if (inside) {
      if (line.kind === "pipe" && line.surfaces !== "both") inner = pipeInternalPerM(findPipe(line.size), line.schedule) || 0;
      if (line.kind === "section" && (findFamily(line.family) || {}).group === "Hollow sections") {
        const t = elementThickness(line);
        if (t) inner = Math.max(0, findSection(line.family, line.size)[SECTION.area] - (2 * Math.PI * t.max) / 1000);
      }
    }
    return { outer: perM, inner, total: perM + inner, label: m.label, massPerM: m.massPerM };
  }
  /** Galvanized area of a list: outer and inside areas, then the % allowance on the sum (fittings are dipped too). */
  function galvArea(lines, allowancePct, inside) {
    let outer = 0, inner = 0;
    for (const line of lines) {
      const g = galvAreaPerM(line, inside);
      if (!g) continue;
      const len = num(line.length) * num(line.qty);
      outer += g.outer * len; inner += g.inner * len;
    }
    const base = outer + inner;
    return { outer, inner, base, total: base * (1 + num(allowancePct) / 100) };
  }
  /** Weight of one piece of a line before and after galvanizing, kg (null when the steel mass is unknown). */
  function pieceWeights(line, um, inside) {
    const g = galvAreaPerM(line, inside);
    if (!g || g.massPerM === null) return null;
    const length = num(line.length), zinc = (g.total * length * num(um) * galv().density) / 1000;
    return { label: g.label, qty: num(line.qty), steel: g.massPerM * length, zinc, total: g.massPerM * length + zinc };
  }

  // ------------------------------------------------------------------ bulk import
  // Family words a list may use -> candidate families. The size decides between candidates; when it exists in more
  // than one catalogue the most preferred catalogue wins (SAISC, then EN, then AISC: see catalogues()).
  const FAMILY_ALIASES = {
    PIPE: "PIPE", PIPES: "PIPE", NPS: "PIPE", P: "PIPE",
    UB: ["SA-UB", "UB"], UC: ["SA-UC", "UC"], HP: ["SA-HP", "US-HP"], UBP: ["SA-HP"],
    IPE: ["SA-IPE", "IPE"], IPEA: ["IPEA"], IPEAA: ["SA-IPEAA"], IPEO: ["IPEO"],
    ITF: ["SA-ITF"], RSJ: ["SA-ITF"],
    PFC: ["SA-PFC", "PFC"], UPN: ["SA-UPN", "UPN"], TFC: ["SA-CBS"], CBS: ["SA-CBS"],
    L: ["SA-EA", "SA-UA", "EA", "UA", "US-L"], ANGLE: ["SA-EA", "SA-UA", "EA", "UA", "US-L"],
    EA: ["SA-EA", "EA"], UA: ["SA-UA", "UA"],
    T: ["SA-STI", "SA-STH"], TEE: ["SA-STI", "SA-STH"], STI: ["SA-STI"], STH: ["SA-STH"],
    TEECUTFROMUB: ["SA-STI"], TEECUTFROMUC: ["SA-STH"],
    SHS: ["SA-SHS", "SHS-CF", "SHS-HF"], RHS: ["SA-RHS", "RHS-CF", "RHS-HF"], CHS: ["SA-CHS", "CHS-CF", "CHS-HF"],
    CC: ["SA-CC"], LIPPEDCHANNEL: ["SA-CC"], CZ: ["SA-CZ"], LIPPEDZ: ["SA-CZ"], CL: ["SA-CL"], LIPPEDANGLE: ["SA-CL"],
    W: ["US-W"], M: ["US-M"], S: ["US-S"], C: ["US-C"], MC: ["US-MC"],
    WT: ["US-WT"], MT: ["US-MT"], ST: ["US-ST"], HSS: ["US-HSSR", "US-HSSC"]
  };
  const squash = (s) => String(s).trim().toUpperCase().replace(/[\s_-]+/g, "");
  /**
   * Candidate families for a family word ("UB", "IPE AA", "HSS", "Tee cut from UB") or a family id ("SA-UB", "SHS HF").
   * A catalogue name in front of a word ("EN UB", "AISC L") keeps that catalogue's families only.
   */
  function familyCandidates(token) {
    const key = squash(token);
    const a = FAMILY_ALIASES[key];
    if (a) return a;
    const byId = db().sections.families.find((f) => squash(f.id) === key);
    if (byId) return [byId.id];
    for (const c of catalogues()) {
      const cs = squash(c.short || c.id);
      if (key.length <= cs.length || !key.startsWith(cs)) continue;
      const rest = familyCandidates(key.slice(cs.length));
      const own = Array.isArray(rest) ? rest.filter((fid) => (findFamily(fid) || {}).catalogue === c.id) : [];
      if (own.length) return own;
    }
    return [String(token).trim().toUpperCase()];
  }
  /**
   * Split a size into its letter prefix and its numbers: "UB 254 x 146 x 31" -> ub [254, 146, 31];
   * "HSS6X6X.3125" -> hss [6, 6, 0.3125]; "L3-1/2x3x1/4" -> l [3.5, 3, 0.25]; "100x100x6,3" -> "" [100, 100, 6.3];
   * "Lipped channel 75x50x20x2" -> lippedchannel [75, 50, 20, 2].
   */
  function sizeKey(s) {
    const t = String(s).toLowerCase().replace(/\s*[×*]\s*/g, "x").replace(/(\d),(\d)/g, "$1.$2").replace(/\s+/g, "")
      .replace(/([a-z])-(?=[a-z])/g, "$1");
    const prefix = (t.match(/^[a-z]+(?=[\d.])/) || [""])[0];
    const parts = t.slice(prefix.length).split("x").map((p) => {
      let m;
      if (/^\d*\.?\d+$/.test(p)) return parseFloat(p);
      if ((m = p.match(/^(\d+)-(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
      if ((m = p.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
      return p;
    });
    return { prefix, parts };
  }
  // numbers equal within 0.0021 so that AISC decimal walls match their fractions (.312 = 5/16, .188 = 3/16)
  const sameParts = (a, b) => a.length === b.length &&
    a.every((x, i) => (typeof x === "number" && typeof b[i] === "number" ? Math.abs(x - b[i]) <= 0.0021 : x === b[i]));
  const keyCache = new Map();
  const familyKeys = (f) => {
    if (!keyCache.has(f)) keyCache.set(f, f.items.map((it) => ({ it, ...sizeKey(it[SECTION.name]) })));
    return keyCache.get(f);
  };
  /** True when a prefix written in the size ("ipe", "wt", "sti") names this family, or there is none. */
  function prefixFits(prefix, fam, itemPrefix) {
    if (!prefix || prefix === itemPrefix || prefix === squash(fam.prefix || "").toLowerCase()) return true;
    const c = familyCandidates(prefix);
    return Array.isArray(c) && c.includes(fam.id);
  }
  /** Size as compared by the import: "UB 254 x 146 x 31" -> "254x146x31", "HSS6X6X.3125" -> "6x6x0.3125". */
  const normSize = (s) => sizeKey(s).parts.join("x");
  const npsValue = (label) =>
    label.split(" ").reduce((a, tok) => a + (tok.includes("/") ? +tok.split("/")[0] / +tok.split("/")[1] : +tok), 0);
  /** Resolve a pipe size token ("6", "NPS 6", "DN150", "1-1/2", "1.5", "6\"") to a database NPS label. */
  function resolvePipe(token) {
    let t = String(token).trim().toUpperCase().replace(/"|″|\bINCH\b|\bIN\b/g, "").replace(/^NPS\s*/, "").trim();
    if (/^DN\s*\d+$/.test(t)) {
      const dn = parseInt(t.replace(/DN\s*/, ""), 10);
      const p = db().pipes.pipes.find((x) => x.dn === dn);
      return p ? p.nps : null;
    }
    t = t.replace(/-/g, " ").replace(/\s+/g, " ");
    let p = db().pipes.pipes.find((x) => x.nps === t);
    if (!p && /^\d*\.\d+$|^\d+$/.test(t)) p = db().pipes.pipes.find((x) => Math.abs(npsValue(x.nps) - parseFloat(t)) < 1e-9);
    return p ? p.nps : null;
  }
  /**
   * Find a section from a family word and a size. Returns { family, size, note? } or null.
   * The best hit is the one in the most preferred catalogue; within that catalogue, when the size is in two families
   * (hot-finished and cold-formed tube), the larger area, so paint is never under-estimated. A prefix written in the
   * size must name the family ("W, WT6x25" finds nothing rather than W6x25). The note says what was chosen when
   * another family has the size with a different area: any difference within the catalogue, over 1 % across
   * catalogues.
   */
  function resolveSection(familyToken, sizeToken) {
    const cand = familyCandidates(familyToken);
    if (cand === "PIPE") return null;
    const want = sizeKey(sizeToken);
    const hits = [];
    cand.forEach((fid, order) => {
      const f = findFamily(fid);
      if (!f) return;
      const k = familyKeys(f).find((x) => sameParts(x.parts, want.parts) && prefixFits(want.prefix, f, x.prefix));
      if (k) hits.push({ fam: f, item: k.it, rank: catRank(f), order, area: k.it[SECTION.area] });
    });
    if (!hits.length) return null;
    hits.sort((a, b) => a.rank - b.rank || b.area - a.area || a.order - b.order);
    const best = hits[0];
    const out = { family: best.fam.id, size: best.item[SECTION.name] };
    const where = (h) => `${h.fam.catalogue || ""} ${h.fam.name}`.trim();
    const pct = (a, base) => `${((Math.abs(a - base) / base) * 100).toFixed(1)}%`;
    // same catalogue (hot-finished and cold-formed tube): only when the areas really differ
    const same = hits.filter((h) => h !== best && h.rank === best.rank && (best.area - h.area) / h.area > 0.0005);
    const other = hits.filter((h) => h.rank !== best.rank && Math.abs(h.area - best.area) / best.area > 0.01);
    const notes = [];
    if (same.length) notes.push(`exists in ${[best, ...same].map(where).join(" and ")}; used ${where(best)} (larger area, ${pct(best.area, same[0].area)} more)`);
    if (other.length) notes.push(`${other.map((h) => `the ${where(h)} table gives ${pct(h.area, best.area)} ${h.area > best.area ? "more" : "less"} area`).join("; ")}; used ${best.fam.catalogue}`);
    if (notes.length) out.note = notes.join("; ");
    return out;
  }

  /**
   * Parse a pasted list. One member per line: family, size, length (m), qty [, schedule (pipes) | paint % (steel)].
   * Delimiter: tab, semicolon or comma (a decimal comma is accepted when tabs/semicolons are used).
   * family is PIPE, a family id (SA-UB, UB, SHS-CF, US-W ...) or a family word (UB, UC, IPE, PFC, L, SHS, W, HSS ...);
   * the size picks the family (SAISC first, then EN, then AISC) and a warning says when another family has it too.
   * Returns { lines, errors, warnings } where errors/warnings are [{ row, text, message }]; a line with an error is skipped.
   */
  function parseList(text) {
    const lines = [], errors = [], warnings = [];
    const rows = String(text).split(/\r?\n/);
    rows.forEach((raw, idx) => {
      const row = idx + 1;
      const t = raw.trim();
      if (!t || t.startsWith("#")) return;
      const delim = t.includes("\t") ? "\t" : t.includes(";") ? ";" : ",";
      const cells = t.split(delim).map((c) => c.trim());
      // with tab/semicolon delimiters a decimal comma ("6,5") is accepted
      const dec = (c) => parseFloat(delim === "," ? c : String(c).replace(",", "."));
      if (/^(type|family|member)$/i.test(cells[0])) return; // header
      if (cells.length < 4) { errors.push({ row, text: t, message: "Need: family, size, length (m), quantity" }); return; }
      const [fam, size, lenC, qtyC, extra] = cells;
      const length = dec(lenC), qty = dec(qtyC);
      if (!(length > 0) || !(qty > 0)) { errors.push({ row, text: t, message: "Length and quantity must be positive numbers" }); return; }
      if (familyCandidates(fam) === "PIPE") {
        const nps = resolvePipe(size);
        if (!nps) { errors.push({ row, text: t, message: `Unknown pipe size "${size}"` }); return; }
        const pipe = findPipe(nps);
        let schedule = extra ? extra.toUpperCase().replace(/^SCH\.?\s*/, "") : "STD";
        if (!(schedule in pipe.walls)) {
          errors.push({ row, text: t, message: `NPS ${nps} has no schedule "${schedule}" (available: ${Object.keys(pipe.walls).join(", ")})` });
          return;
        }
        lines.push({ kind: "pipe", size: nps, schedule, surfaces: "ext", length, qty });
      } else {
        const r = resolveSection(fam, size);
        if (!r) { errors.push({ row, text: t, message: `No section "${fam} ${size}" in the database` }); return; }
        if (r.note) warnings.push({ row, text: t, message: `"${fam} ${size}" ${r.note}` });
        const flag = findSection(r.family, r.size)[SECTION.note];
        if (flag) warnings.push({ row, text: t, message: `"${fam} ${size}": * ${flag}` });
        const paintPct = extra ? dec(extra) : 100;
        lines.push({ kind: "section", family: r.family, size: r.size, paintPct: paintPct > 0 && paintPct <= 100 ? paintPct : 100, length, qty });
      }
    });
    return { lines, errors, warnings };
  }

  return {
    findPipe, findFamily, findSection, SECTION, catalogues, findCatalogue, sectionName, sectionGroups,
    pipeExternalPerM, pipeInternalPerM, pipeMassPerM,
    lineMetrics, totals,
    getSupplier, getProduct, pickProduct, paintQuantities,
    getEnv, systemsFor, getLibrarySystem, systemLayers, requirementsFor, assess, durabilitiesFor,
    productWarnings, checkLayers, recommend, categoryFromLoss,
    galvBand, bandForThickness, elementThickness, galvCheck, zincLife, lifeText, lifeMeets, zincQuantities, galvAreaPerM, galvArea, pieceWeights,
    resolvePipe, resolveSection, normSize, parseList
  };
});
