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
  const SECTION = { name: 0, mass: 1, area: 2, dims: 3 };

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
   *      | { kind: 'section', family: 'UB', size: '254x146x31', paintPct: 100, length, qty }
   *      | { kind: 'custom', label, perimeter (mm, all painted faces), massPerM (kg/m, optional), length, qty }
   * Returns { ok, error?, label, areaPerM, massPerM, totalLength, area, mass, warnings }.
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
      // anything not in the database (flat bar, plate, tee, small tube ...): the user supplies the perimeter in mm
      const perimeter = num(line.perimeter);
      if (!(perimeter > 0)) { out.error = "Enter the perimeter (mm) of the custom member"; return out; }
      out.label = line.label ? String(line.label) : "Custom member";
      out.areaPerM = perimeter / 1000;
      out.massPerM = line.massPerM === undefined || line.massPerM === "" || line.massPerM === null ? null : num(line.massPerM);
    } else {
      const fam = findFamily(line.family);
      const sec = fam && findSection(line.family, line.size);
      if (!sec) { out.error = `Unknown section "${line.family} ${line.size}"`; return out; }
      out.label = `${fam.id} ${sec[SECTION.name]}`;
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

  // ------------------------------------------------------------------ bulk import
  const FAMILY_ALIASES = {
    PIPE: "PIPE", PIPES: "PIPE", NPS: "PIPE", P: "PIPE",
    SHS: ["SHS-CF", "SHS-HF"], RHS: ["RHS-CF", "RHS-HF"], CHS: ["CHS-CF", "CHS-HF"],
    L: ["EA", "UA"], ANGLE: ["EA", "UA"], IPEA: "IPEA", IPEO: "IPEO"
  };
  // A family prefix before the first digit ("IPE 200", "HEB300", "L50x50x5", "UB 254x146x31") is dropped from both
  // the database designation and the user's token so they compare on the numbers alone.
  const prefixRe = /^(ipe[ao]?|he[abm]|upn|ub|uc|pfc|shs|rhs|chs|l)(?=\d)/;
  const normSize = (s) => {
    const t = String(s).toLowerCase().replace(/\s*[×*]\s*/g, "x").replace(/\s+/g, "").replace(prefixRe, "");
    return t.split("x").map((p) => (/^\d+(\.\d+)?$/.test(p) ? String(parseFloat(p)) : p)).join("x");
  };
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
  function resolveSection(familyToken, sizeToken) {
    const key = String(familyToken).trim().toUpperCase();
    let cand = FAMILY_ALIASES[key] || key;
    if (cand === "PIPE") return null;
    cand = Array.isArray(cand) ? cand : [cand];
    const want = normSize(sizeToken);
    const hits = [];
    for (const fid of cand) {
      const f = findFamily(fid);
      if (!f) continue;
      const it = f.items.find((i) => normSize(i[0]) === want);
      if (it) hits.push({ family: fid, size: it[0] });
    }
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      // the size exists in more than one family (e.g. hot-finished and cold-formed tube): use the larger area
      // so paint is never under-estimated, and tell the caller
      const withArea = hits.map((h) => ({ ...h, area: findSection(h.family, h.size)[SECTION.area] }));
      withArea.sort((a, b) => b.area - a.area);
      const [best, other] = withArea;
      return { ...best, note: `exists in ${withArea.map((h) => h.family).join(" and ")}; used ${best.family} (larger area, ${(((best.area - other.area) / other.area) * 100).toFixed(1)}% more)` };
    }
    return null;
  }

  /**
   * Parse a pasted list. One member per line: family, size, length (m), qty [, schedule (pipes) | paint % (steel)].
   * Delimiter: tab, semicolon or comma (a decimal comma is accepted when tabs/semicolons are used).
   * family is PIPE or a section family id (UB, UC, IPE, HEA, PFC, EA, SHS-CF ...) or SHS/RHS/CHS/L; if a size exists in several families the larger area is used and a warning returned.
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
      if ((FAMILY_ALIASES[fam.toUpperCase()] || "") === "PIPE") {
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
        const paintPct = extra ? dec(extra) : 100;
        lines.push({ kind: "section", family: r.family, size: r.size, paintPct: paintPct > 0 && paintPct <= 100 ? paintPct : 100, length, qty });
      }
    });
    return { lines, errors, warnings };
  }

  return {
    findPipe, findFamily, findSection, SECTION,
    pipeExternalPerM, pipeInternalPerM, pipeMassPerM,
    lineMetrics, totals,
    getSupplier, getProduct, pickProduct, paintQuantities,
    getEnv, systemsFor, getLibrarySystem, systemLayers, requirementsFor, assess, durabilitiesFor,
    productWarnings, checkLayers, recommend, categoryFromLoss,
    resolvePipe, resolveSection, parseList
  };
});
