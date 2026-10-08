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
  function getSystem(cat, dur) {
    return db().iso12944.systems.find((s) => s.cat === cat && s.dur === dur) || null;
  }
  /** Durability classes available for a category, in order of increasing durability. */
  function durabilitiesFor(cat) {
    return db().iso12944.systems.filter((s) => s.cat === cat).map((s) => s.dur);
  }

  /** Editable layer objects for a category/durability/supplier (cloned from the database plan). */
  function buildLayers(cat, dur, supplierId) {
    const sys = getSystem(cat, dur);
    if (!sys) return [];
    return sys.layers.map((l) => {
      const prod = pickProduct(supplierId, l.type, l.dft);
      return {
        role: l.role, type: l.type, coats: l.coats, dft: l.dft,
        productId: prod ? prod.id : "", vs: prod ? prod.vs : 60
      };
    });
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

  /** Warnings for a layer set: DFT outside the product's recommended range, total below reference NDFT. */
  function checkLayers(layers, supplierId, cat, dur) {
    const warnings = [];
    for (const l of layers) {
      const p = getProduct(supplierId, l.productId);
      const dft = num(l.dft);
      if (p && num(l.coats) > 0 && (dft < p.dftMin || dft > p.dftMax))
        warnings.push(`${p.name}: ${dft} µm per coat is outside its recommended ${p.dftMin}–${p.dftMax} µm`);
      if (p && p.type !== l.type) warnings.push(`${p.name} is a ${db().paints.layerTypes[p.type].toLowerCase()}, not a ${db().paints.layerTypes[l.type].toLowerCase()}`);
    }
    const sys = getSystem(cat, dur);
    const total = layers.reduce((s, l) => s + Math.max(0, Math.round(num(l.coats))) * num(l.dft), 0);
    if (sys && total < sys.refNdft) warnings.push(`Total ${total} µm is below the ${sys.refNdft} µm reference for ${cat} ${dur}`);
    if (cat === "CX") {
      const coats = layers.reduce((s, l) => s + Math.max(0, Math.round(num(l.coats))), 0);
      if (coats < 3) warnings.push("ISO 12944-9 CX needs at least 3 coats");
      const zn = layers.find((l) => l.type === "ZN" && num(l.coats) > 0);
      if (zn && num(zn.dft) < 40) warnings.push("ISO 12944-9: a zinc-rich primer needs at least 40 µm");
    }
    return warnings;
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
    getSupplier, getProduct, pickProduct, getSystem, durabilitiesFor, buildLayers, paintQuantities, checkLayers,
    resolvePipe, resolveSection, parseList
  };
});
