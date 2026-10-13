// Run with:  npm test        (or: node --test test/*.test.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

for (const f of ["pipes", "sections-saisc", "sections", "sections-aisc", "paints", "iso12944", "galvanizing", "systems"]) require(path.join("..", "data", f + ".js"));
const C = require("../calc.js");
const DB = globalThis.PaintDB;

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} expected ${b} +/- ${tol}, got ${a}`);

// ---------------------------------------------------------------- pipes (ASME B36.10M)
test("pipe table: sizes, ODs and walls match B36.10M", () => {
  const p = DB.pipes.pipes;
  assert.equal(p.length, 36);
  const nps = (n) => C.findPipe(n);
  assert.equal(nps("1/2").od, 21.3);
  assert.equal(nps("2").od, 60.3);
  assert.equal(nps("6").od, 168.3);
  assert.equal(nps("10").od, 273.1);
  assert.equal(nps("12").od, 323.9);
  assert.equal(nps("24").od, 610);
  assert.equal(nps("48").od, 1219);
  assert.equal(nps("6").walls.STD, 7.11);
  assert.equal(nps("6").walls["40"], 7.11);
  assert.equal(nps("6").walls.XXS, 21.95);
  assert.equal(nps("12").walls.STD, 9.53);
  assert.equal(nps("12").walls["40"], 10.31);
  assert.equal(nps("12").walls.XS, 12.7);
  assert.equal(nps("24").walls["40"], 17.48);
});

test("pipe table: ordered, unique, DN = 25 x NPS from NPS 4 up", () => {
  const p = DB.pipes.pipes;
  const val = (l) => l.split(" ").reduce((a, t) => a + (t.includes("/") ? +t.split("/")[0] / +t.split("/")[1] : +t), 0);
  p.forEach((x, i) => {
    if (i) assert.ok(x.od > p[i - 1].od, `OD must increase at NPS ${x.nps}`);
    if (val(x.nps) >= 4) assert.equal(x.dn, val(x.nps) * 25, `DN of NPS ${x.nps}`);
    assert.ok(Object.keys(x.walls).length > 0);
    for (const [s, t] of Object.entries(x.walls)) assert.ok(t > 0 && t < x.od / 2, `NPS ${x.nps} Sch ${s} wall`);
  });
  assert.equal(new Set(p.map((x) => x.nps)).size, p.length);
});

test("pipe area and mass", () => {
  const p6 = C.findPipe("6");
  close(C.pipeExternalPerM(p6), Math.PI * 0.1683, 1e-9);
  close(C.pipeExternalPerM(p6), 0.5287, 1e-4);
  close(C.pipeInternalPerM(p6, "STD"), Math.PI * (168.3 - 14.22) / 1000, 1e-9);
  close(C.pipeMassPerM(p6, "STD"), 28.26, 0.02, "6in Sch 40 kg/m");
  close(C.pipeMassPerM(C.findPipe("2"), "40"), 5.44, 0.01, "2in Sch 40 kg/m");
  assert.equal(C.pipeInternalPerM(p6, "100"), null);
  const m = C.lineMetrics({ kind: "pipe", size: "6", schedule: "STD", surfaces: "ext", length: 12, qty: 3 });
  assert.ok(m.ok);
  close(m.area, Math.PI * 0.1683 * 36, 1e-9);
  const both = C.lineMetrics({ kind: "pipe", size: "6", schedule: "STD", surfaces: "both", length: 1, qty: 1 });
  close(both.area, Math.PI * (0.1683 + 0.15408), 1e-6);
  const missing = C.lineMetrics({ kind: "pipe", size: "6", schedule: "100", surfaces: "both", length: 1, qty: 1 });
  assert.equal(missing.warnings.length > 0, true);
});

// ---------------------------------------------------------------- sections
test("section data: published reference values", () => {
  const A = (f, d) => C.findSection(f, d)[C.SECTION.area];
  const Mx = (f, d) => C.findSection(f, d)[C.SECTION.mass];
  // ArcelorMittal / Eurocode tables: IPE 200 0.768, IPE 300 1.16, HEA 200 1.14, HEB 200 1.15, HEB 300 1.73
  close(A("IPE", "IPE 200"), 0.768, 0.001);
  close(A("IPE", "IPE 300"), 1.16, 0.002);
  close(A("HEA", "HEA 200"), 1.14, 0.005);
  close(A("HEB", "HEB 200"), 1.15, 0.005);
  close(A("HEB", "HEB 300"), 1.73, 0.005);
  close(Mx("IPE", "IPE 200"), 22.4, 0.05);
  // UB 254x146x31 (h 251.4 b 146.1 tw 6.0 r 7.6)
  close(A("UB", "254x146x31"), (2 * 251.4 + 4 * 146.1 - 2 * 6 + (2 * Math.PI - 8) * 7.6) / 1000, 1e-4);
  close(Mx("UB", "254x146x31"), 31.1, 0.05);
  // heavy UBs whose "published" area in the source dataset was wrong (3.69 / 3.46): geometry gives 3.24 / 3.17
  close(A("UB", "1016x305x584"), 3.244, 0.005);
  close(A("UB", "914x305x576"), 3.169, 0.005);
  // Blue Book style values for hollow sections and angles
  close(A("SHS-HF", "40x40x3.2"), 0.152, 0.001);
  close(A("CHS-HF", "42.4x3.2"), 0.133, 0.001);
  // angles have two toe radii (inner toe corners only): 4L - (2 - pi/2)(r1 + 2 r2); 100x100x10 is listed as 0.390
  close(A("EA", "100x100x10"), 0.3897, 0.00005);
  close(A("EA", "200x200x24"), 0.7845, 0.00005);
  close(A("EA", "50x50x5"), 0.1940, 0.00005);
  // UPN with its 8 % flange taper and toe radii
  close(A("UPN", "UPN 100"), 0.3720, 0.00005);
  close(A("UPN", "UPN 320"), 0.9834, 0.00005);              // 5 % slope above UPN 300 (8 % would give 0.9800)
  close(A("UPN", "UPN 400"), 1.1820, 0.00005);
  close(A("PFC", "430x100x64"), 1.225, 0.005);
});

test("section data: SAISC and AISC values verified row by row", () => {
  const A = (f, d) => C.findSection(f, d)[C.SECTION.area];
  const Mx = (f, d) => C.findSection(f, d)[C.SECTION.mass];
  // SAISC (recomputed outlines where the source's surface figure left faces out)
  close(A("SA-EA", "100x100x10"), 0.3897, 0.00005);
  close(A("SA-EA", "50x50x5"), 0.1940, 0.00005);
  close(A("SA-EA", "200x200x24"), 0.7845, 0.00005);
  close(A("SA-EA", "50x50x3"), 0.1948, 0.00005);            // t < r2: the toe is one r2 arc (plain formula: 0.1940)
  close(A("SA-UPN", "UPN 100"), 0.3720, 0.00005);
  // 12.5 mm and thicker SAISC tube is hot-finished: ro = 1.5t (cold-formed 2.5t would give 0.5463, EN 10219 3t 0.5356)
  assert.deepEqual(C.findSection("SA-SHS", "150x150x12.5").slice(1), [52.65, 0.5678, "150×150×12.5", "Hot-finished"]);
  close(A("SA-ITF", "127x76x13"), 0.5234, 0.00005);
  close(A("SA-SHS", "100x100x4"), 0.3863, 0.00005);
  close(A("SA-PFC", "100x50"), 0.3828, 0.00005);
  close(Mx("SA-PFC", "100x50"), 10.1, 0.005);
  // AISC: W from the published paintable perimeter, WT = half the parent W + the web thickness
  close(A("US-W", "W24x68"), 2.0726, 0.00005);
  close(A("US-WT", "WT12x34"), 1.0469, 0.00005);
  close(Mx("US-W", "W24x68"), 68 * 1.488164, 0.01);
});

test("section catalogues: SAISC first, then EN, then AISC; every family well formed", () => {
  assert.deepEqual(C.catalogues().map((c) => c.id), ["SAISC", "EN", "AISC"]);
  const ids = new Set();
  const GROUPS = ["I-sections", "Channels", "Angles", "Tees", "Hollow sections", "Cold-formed"];
  for (const f of DB.sections.families) {
    assert.ok(!ids.has(f.id), `duplicate family id ${f.id}`);
    ids.add(f.id);
    assert.ok(C.findCatalogue(f.catalogue), `${f.id} catalogue`);
    assert.equal(typeof f.prefix, "string", `${f.id} prefix`);
    assert.ok(GROUPS.includes(f.group), `${f.id} group ${f.group}`);
    assert.ok(f.name && f.std && f.items.length, f.id);
    if (f.catalogue === "SAISC") assert.match(f.id, /^SA-/);
    if (f.catalogue === "AISC") assert.match(f.id, /^US-/);
  }
  const groups = C.sectionGroups();
  assert.equal(groups[0].catalogue.id, "SAISC");
  assert.equal(groups[0].families[0].id, "SA-UB");
  assert.deepEqual([...new Set(groups.map((g) => g.catalogue.id))], ["SAISC", "EN", "AISC"]);
  assert.equal(groups.reduce((n, g) => n + g.families.length, 0), DB.sections.families.length);
  // the families the verification kept
  for (const id of ["SA-UB", "SA-UC", "SA-HP", "SA-IPE", "SA-IPEAA", "SA-ITF", "SA-PFC", "SA-UPN", "SA-CBS", "SA-EA", "SA-UA",
    "SA-STI", "SA-STH", "SA-SHS", "SA-RHS", "SA-CHS", "SA-CC", "SA-CZ", "SA-CL",
    "US-W", "US-M", "US-S", "US-HP", "US-C", "US-MC", "US-L", "US-WT", "US-MT", "US-ST", "US-HSSR", "US-HSSC"]) assert.ok(C.findFamily(id), id);
  const count = (id) => C.findFamily(id).items.length;
  assert.deepEqual(DB.sections.families.filter((f) => f.catalogue === "SAISC").map((f) => [f.id, f.items.length]), [
    ["SA-UB", 41], ["SA-UC", 20], ["SA-HP", 13], ["SA-IPE", 6], ["SA-IPEAA", 6], ["SA-ITF", 7], ["SA-PFC", 11],
    ["SA-UPN", 11], ["SA-CBS", 5], ["SA-EA", 51], ["SA-UA", 24], ["SA-STI", 35], ["SA-STH", 16], ["SA-SHS", 125],
    ["SA-RHS", 120], ["SA-CHS", 157], ["SA-CC", 90], ["SA-CZ", 35], ["SA-CL", 20]]);
  assert.deepEqual(["US-W", "US-WT", "US-M", "US-S", "US-HP", "US-C", "US-MC", "US-MT", "US-ST", "US-L", "US-HSSR", "US-HSSC"].map(count),
    [267, 267, 12, 28, 11, 31, 34, 12, 28, 125, 333, 141]);
});

test("section names and labels", () => {
  const lab = (family, size) => C.lineMetrics({ kind: "section", family, size, length: 1, qty: 1 }).label;
  assert.equal(lab("SA-UB", "254x146x31"), "UB 254x146x31 (SAISC)");
  assert.equal(lab("UB", "254x146x31"), "UB 254x146x31 (EN)");
  assert.equal(lab("IPE", "IPE 200"), "IPE 200 (EN)");          // the prefix is not repeated
  assert.equal(lab("SA-IPE", "IPE 200"), "IPE 200 (SAISC)");
  assert.equal(lab("SA-EA", "100x100x10"), "L 100x100x10 (SAISC)");
  assert.equal(lab("US-W", "W24x68"), "W24x68 (AISC)");
  assert.equal(lab("US-HSSR", "HSS6x6x5/16"), "HSS6x6x5/16 (AISC)");
  // EN hot-finished and cold-formed tube share sizes, so their labels say which
  assert.equal(lab("SHS-HF", "100x100x8"), "SHS 100x100x8 (EN, hot-finished)");
  assert.equal(lab("SHS-CF", "100x100x8"), "SHS 100x100x8 (EN, cold-formed)");
  assert.equal(lab("SA-STI", "203x133x25"), "Tee cut from UB 203x133x25 (SAISC)");
  const m = C.lineMetrics({ kind: "section", family: "US-W", size: "W24x68", length: 1, qty: 1 });
  assert.equal(m.catalogue, "AISC");
  assert.equal(m.note, null);
  // flagged sizes carry their note through to the line
  const flagged = DB.sections.families.flatMap((f) => f.items.filter((i) => i[C.SECTION.note]).map((i) => [f.id, i]));
  // AISC: 24 superseded W36/WT18, 40 discontinued HSS and the C3x3.5 mass caveat
  assert.equal(flagged.filter(([fid]) => /^US-/.test(fid)).length, 65);
  assert.equal(flagged.filter(([fid]) => /^US-(W|WT)$/.test(fid)).filter(([, i]) => /superseded by W(T18|36)x/.test(i[4])).length, 24);
  assert.equal(flagged.filter(([fid]) => /^US-HSS/.test(fid)).filter(([, i]) => /not in current AISC/.test(i[4])).length, 40);
  const [fid, item] = flagged[0];
  assert.equal(C.lineMetrics({ kind: "section", family: fid, size: item[0], length: 1, qty: 1 }).note, item[C.SECTION.note]);
});

test("section data: integrity", () => {
  let n = 0;
  for (const f of DB.sections.families) {
    const seen = new Set();
    for (const it of f.items) {
      n++;
      assert.ok(it.length === 4 || (it.length === 5 && typeof it[4] === "string" && it[4].length > 3), `${f.id} ${it[0]} row shape`);
      assert.equal(typeof it[0], "string");
      // decimal point; no trailing zeros except in AISC names, which keep theirs (HSS6.625x0.280)
      assert.ok(!/,/.test(it[0]) && (f.catalogue === "AISC" || !/\.\d*0(x|$)/.test(it[0])), `${f.id} ${it[0]}: number format`);
      assert.ok(!seen.has(it[0]), `duplicate ${f.id} ${it[0]}`);
      seen.add(it[0]);
      assert.ok(it[1] > 0 && it[2] > 0, `${f.id} ${it[0]} mass/area`);
      // surface area per tonne = area / mass x 1000 must be physically plausible for rolled / tubular steel
      const perTonne = (it[2] / it[1]) * 1000;
      // (the heaviest UCs, e.g. 356x406x1299, are about 2.2 m2/t; thin cold-formed tube is about 70-130)
      assert.ok(perTonne > 1.5 && perTonne < 250, `${f.id} ${it[0]} m2/t = ${perTonne.toFixed(1)}`);
    }
  }
  assert.ok(n > 3000, `${n} rows`);
});

test("section lines honour the painted-% option", () => {
  const full = C.lineMetrics({ kind: "section", family: "UB", size: "254x146x31", length: 6, qty: 4, paintPct: 100 });
  const part = C.lineMetrics({ kind: "section", family: "UB", size: "254x146x31", length: 6, qty: 4, paintPct: 75 });
  close(part.area, full.area * 0.75, 1e-9);
  close(full.mass, 31.1 * 24, 1e-6);
});

test("totals add pipe + steel and apply the allowance", () => {
  const t = C.totals([
    { kind: "pipe", size: "6", schedule: "STD", surfaces: "ext", length: 10, qty: 1 },
    { kind: "section", family: "IPE", size: "IPE 200", length: 10, qty: 1 }
  ], 10);
  close(t.pipeArea, Math.PI * 0.1683 * 10, 1e-9);
  close(t.steelArea, 7.682, 1e-3);
  close(t.totalArea, (t.pipeArea + t.steelArea) * 1.1, 1e-9);
  assert.equal(t.errors, 0);
  assert.equal(C.totals([{ kind: "section", family: "UB", size: "nope", length: 1, qty: 1 }], 0).errors, 1);
});

// ---------------------------------------------------------------- paint maths
test("paint litres = area x DFT / (10 x VS), then loss", () => {
  const q = C.paintQuantities(100, [{ role: "primer", type: "EP", productId: "x", coats: 2, dft: 100, vs: 80 }], 30);
  const r = q.rows[0];
  close(r.litresPerCoat, 12.5 / 0.7, 1e-9);
  close(r.theoretical, 25, 1e-9);
  close(r.litres, 25 / 0.7, 1e-9);
  close(r.theoreticalCover, 8, 1e-9);
  close(r.wft, 125, 1e-9);
  close(q.totalDft, 200, 1e-9);
  assert.equal(C.paintQuantities(100, [], 30).litres, 0);
  assert.equal(C.paintQuantities(100, [{ coats: 0, dft: 100, vs: 80 }], 0).litres, 0);
});

test("spreading rates reproduce the data-sheet figures", () => {
  const cover = (id, sup, dft) => (C.getProduct(sup, id).vs * 10) / dft;
  close(cover("jotun-jotamastic-90", "jotun", 100), 8.0, 0.05);          // 8 - 2.7 m2/L
  close(cover("jotun-jotamastic-90", "jotun", 300), 2.7, 0.05);
  close(cover("jotun-hardtop-xp", "jotun", 50), 12.6, 0.05);              // 12.6 - 6.3
  close(cover("jotun-barrier-77", "jotun", 25), 21.2, 0.05);              // 21.2 - 7.1
  close(cover("jotun-penguard-express", "jotun", 75), 9.9, 0.05);         // 9.9 - 3
  close(cover("jotun-hardtop-as", "jotun", 40), 12.5, 0.05);              // 12.5 - 8.3
  close(cover("ppg-sigmadur-550", "ppg", 50), 11.0, 0.05);
  close(cover("ppg-sigmadur-550h", "ppg", 50), 14.0, 0.05);
  close(cover("ppg-sigmacover-350", "ppg", 125), 5.8, 0.05);
  close(cover("ppg-sigmafast-278", "ppg", 75), 10.7, 0.05);
  close(cover("ppg-sigmazinc-68-gp", "ppg", 50), 13.6, 0.05);
  close(cover("carboline-carbothane-134-hg", "carboline", 50), 13.8, 0.2); // 13.8 m2/L at 50 um
  close(cover("carboline-carbozinc-11", "carboline", 50), 12.2, 0.4);      // 12.2 m2/L at 50 um (VS 62.3 in the sheet)
  close(cover("carboline-carboguard-893", "carboline", 75), 10.1, 0.3);    // 10.1 m2/L at 75 um
  close(cover("jotun-pilot-qd-primer", "jotun", 40), 14, 0.05);             // 14 - 4.5 m2/L
  close(cover("jotun-pilot-qd-primer", "jotun", 125), 4.5, 0.05);
  close(cover("jotun-penguard-hb", "jotun", 80), 6.8, 0.06);                // 6.8 - 3.6 m2/L
  close(cover("jotun-penguard-hb", "jotun", 150), 3.6, 0.05);
  close(cover("jotun-penguard-universal", "jotun", 75), 9.6, 0.05);         // 9.6 - 2.4 m2/L
  close(cover("jotun-penguard-universal", "jotun", 300), 2.4, 0.05);
  close(cover("jotun-hardtop-ax", "jotun", 100), 6.3, 0.05);                // 13 - 6.3 m2/L
  close(cover("jotun-penguard-pro", "jotun", 100), 7.5, 0.01);              // derived from 7.5 - 1.5 m2/L
  close(cover("jotun-penguard-pro", "jotun", 500), 1.5, 0.01);
});

// ---------------------------------------------------------------- database consistency
// ---------------------------------------------------------------- ISO 12944-5 Annex B and the Jotun selector
test("Annex B minimums: spot values from ISO 12944-5:2018", () => {
  const m = DB.iso12944.minimums, R = (mnoc, ndft) => ({ mnoc, ndft });
  assert.deepEqual(m.carbon.C4.H, { zn: R(2, 200), misc: R(2, 240), akay: R(2, 260) });   // Table B.2
  assert.deepEqual(m.carbon.C5.VH, { zn: R(3, 320), misc: R(3, 360), akay: null });
  assert.deepEqual(m.carbon.C3.M, { zn: R(1, 60), misc: R(1, 120), akay: R(1, 160) });
  assert.equal(m.carbon.C2.L.zn, DB.iso12944.NONE);
  assert.equal(m.carbon.C4.VH.akay, null);
  assert.deepEqual(m.hdg.C5.VH, { ep: R(2, 240), ay: null });                               // Table B.3
  assert.deepEqual(m.hdg.C3.M, { ep: R(1, 80), ay: R(1, 80) });
  assert.deepEqual(m.tsm.C4.VH, { all: R(2, 200) });                                        // Table B.4
  assert.deepEqual(m.immersion.VH, { zn: R(2, 500), misc: R(2, 540), single: R(1, 600) });  // Table B.5
  // within every column the minimum never falls as durability rises
  for (const sub of ["carbon", "hdg", "tsm"]) for (const [env, t] of Object.entries(m[sub])) {
    const cols = Object.keys(t.H);
    for (const c of cols) {
      let last = 0;
      for (const d of DB.iso12944.durabilities) {
        const r = t[d][c];
        if (r && r !== DB.iso12944.NONE) { assert.ok(r.ndft >= last, `${sub} ${env} ${c} ${d}`); last = r.ndft; }
      }
    }
  }
});

test("every Jotun system reaches exactly the durability Jotun ticks (ISO tables and brochure agree)", () => {
  assert.ok(DB.systems.length >= 80);
  for (const sys of DB.systems) {
    const layers = C.systemLayers(sys, "jotun");
    for (const l of layers) {
      const p = C.getProduct("jotun", l.productId);
      assert.ok(p, `${sys.id}: product ${l.productId} missing`);
      assert.equal(p.type, l.type, `${sys.id}: ${p.name} type`);
      assert.ok(l.dft >= p.dftMin && l.dft <= p.dftMax, `${sys.id}: ${p.name} at ${l.dft} um outside ${p.dftMin}-${p.dftMax}`);
    }
    const a = C.assess(layers, sys.substrate, sys.env);
    assert.equal(a.achieved, sys.dur, `${sys.id} (${sys.substrate} ${sys.env}): ISO allows ${a.achieved}, Jotun ticks up to ${sys.dur}`);
    assert.deepEqual(C.productWarnings(layers, "jotun"), [], sys.id);
  }
});

test("assess: columns, shortfalls and edge cases", () => {
  const L = (type, coats, dft) => ({ type, coats, dft });
  // zinc primer system, C4: 240 um in 3 coats -> high; very high needs 260
  let a = C.assess([L("ZN", 1, 60), L("EP", 1, 120), L("PUR", 1, 60)], "carbon", "C4");
  assert.equal(a.column, "Zn (R) primer");
  assert.equal(a.achieved, "H");
  assert.deepEqual(a.next, { dur: "VH", req: { mnoc: 3, ndft: 260 }, needCoats: 0, needDft: 20 });
  // same thickness with an epoxy primer is judged on the stricter "other primer" column
  a = C.assess([L("EP", 1, 120), L("EP", 1, 60), L("PUR", 1, 60)], "carbon", "C4");
  assert.equal(a.achieved, "H");
  a = C.assess([L("EP", 1, 100), L("PUR", 1, 60)], "carbon", "C4");                 // 160 um < 180 for medium
  assert.equal(a.achieved, "L");
  // alkyd cannot reach C4 very high, or anything in C5
  assert.equal(C.assess([L("AK", 3, 120), L("AY", 1, 60)], "carbon", "C4").achieved, "H");
  assert.equal(C.assess([L("AK", 3, 120), L("AY", 1, 60)], "carbon", "C5").achieved, null);
  // C2 low has no minimum; C1 uses the C2 table
  assert.equal(C.assess([L("AK", 1, 40)], "carbon", "C2").achieved, "L");
  assert.equal(C.assess([L("ZN", 1, 60)], "carbon", "C1").achieved, "H");
  // galvanized: alkyd not allowed; metal spray only high / very high
  assert.equal(C.assess([L("AK", 1, 80)], "hdg", "C3").applicable, false);
  assert.equal(C.assess([L("EP", 1, 100), L("PUR", 1, 60)], "tsm", "C4").achieved, "H");
  assert.equal(C.assess([L("EP", 1, 100)], "tsm", "C4").achieved, null);
  // immersion: a one-product build may use the single-coat column
  assert.equal(C.assess([L("EP", 1, 400)], "carbon", "Im2").achieved, "H");
  assert.equal(C.assess([L("EP", 2, 190)], "carbon", "Im2").achieved, "H");
  assert.equal(C.assess([L("EP", 2, 180)], "carbon", "Im2").achieved, null);
  // CX: only tested systems count
  const cx = DB.systems.find((x) => x.env === "CX" && x.id === "LAB10-0821-REP");
  assert.equal(C.assess(C.systemLayers(cx, "jotun"), "carbon", "CX").tested, "LAB10-0821-REP");
  assert.equal(C.assess([L("ZN", 1, 60), L("EP", 1, 200), L("PUR", 1, 60)], "carbon", "CX").tested, null);
  // ignored: zero-coat layers
  assert.equal(C.assess([L("ZN", 1, 60), L("EP", 0, 500), L("PUR", 1, 100)], "carbon", "C3").totalDft, 160);
});

test("durabilitiesFor: what each environment and substrate can ask for", () => {
  assert.deepEqual(C.durabilitiesFor("carbon", "C2"), ["L", "M", "H", "VH"]);
  assert.deepEqual(C.durabilitiesFor("carbon", "Im2"), ["H", "VH"]);
  assert.deepEqual(C.durabilitiesFor("tsm", "C4"), ["H", "VH"]);
  assert.deepEqual(C.durabilitiesFor("carbon", "CX"), ["H"]);
  assert.deepEqual(C.durabilitiesFor("hdg", "CX"), []);
  assert.deepEqual(C.durabilitiesFor("tsm", "C2"), []);
  assert.deepEqual(C.durabilitiesFor("hdg", "Im1"), []);
});

test("recommend: only systems that reach the durability, least paint first", () => {
  const r = C.recommend({ substrate: "carbon", env: "C4", dur: "H", supplier: "jotun", area: 1000, lossPct: 30 });
  assert.deepEqual(r.map((x) => x.system.id).sort(), ["C4.03", "C4.06", "C4.06A", "C4.07", "C4.07A", "C4.10", "C4.11"]);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].litres >= r[i - 1].litres - 1e-9, "sorted by litres");
  for (const x of r) assert.equal(x.missing, false);
  // litres are the real paint for the area
  const q = C.paintQuantities(1000, r[0].layers, 30);
  close(r[0].litres, q.litres, 1e-9);
  // other suppliers: no alkyds, so the AK systems drop to the bottom flagged as missing a product
  const c = C.recommend({ substrate: "carbon", env: "C4", dur: "H", supplier: "carboline", area: 0, lossPct: 30 });
  const ak = c.find((x) => x.system.id === "C4.03");
  assert.equal(ak.missing, true);
  assert.equal(c[c.length - 1].system.id, "C4.03");
  assert.ok(c[0].layers.every((l) => l.productId.startsWith("carboline-")));
  // galvanized C5 very high: Jotun's selector has exactly one system (G5.05)
  assert.deepEqual(C.recommend({ substrate: "hdg", env: "C5", dur: "VH", supplier: "jotun", area: 10, lossPct: 0 }).map((x) => x.system.id), ["G5.05"]);
});

test("checkLayers: product ranges, zinc primer range and shortfall wording", () => {
  const sys = C.getLibrarySystem("C4.06", "carbon", "C4");
  const layers = C.systemLayers(sys, "jotun");
  assert.deepEqual(C.checkLayers(layers, "jotun", { substrate: "carbon", env: "C4", dur: "H" }), []);
  const w = C.checkLayers(layers, "jotun", { substrate: "carbon", env: "C4", dur: "VH" });
  assert.ok(w.some((m) => /needs at least 3 coats and 260/.test(m)), w.join(" | "));
  layers[0].dft = 30;
  const w2 = C.checkLayers(layers, "jotun", { substrate: "carbon", env: "C4", dur: "H" });
  assert.ok(w2.some((m) => /40–80/.test(m)));
  assert.ok(w2.some((m) => /outside its recommended/.test(m)));
  const ak = C.checkLayers([{ type: "AK", coats: 3, dft: 120, productId: "jotun-pilot-qd-primer" }], "jotun", { substrate: "carbon", env: "C5", dur: "L" });
  assert.ok(ak.some((m) => /not reachable/.test(m)));
});

test("categoryFromLoss follows ISO 12944-2 Table 1 and takes the higher category", () => {
  assert.equal(C.categoryFromLoss({ steelGm2: 10 }).env, "C1");
  assert.equal(C.categoryFromLoss({ steelGm2: 10.1 }).env, "C2");
  assert.equal(C.categoryFromLoss({ steelGm2: 400 }).env, "C3");
  assert.equal(C.categoryFromLoss({ steelUm: 80.5 }).env, "C5");
  assert.equal(C.categoryFromLoss({ zincGm2: 20 }).env, "C4");
  assert.equal(C.categoryFromLoss({ steelGm2: 300, zincGm2: 20 }).env, "C4");
  assert.equal(C.categoryFromLoss({ steelGm2: 6000 }).env, "beyond CX");
  assert.equal(C.categoryFromLoss({}), null);
});

test("each product has valid numbers and a source note", () => {
  const ids = new Set();
  for (const s of DB.paints.suppliers) for (const p of s.products) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`); ids.add(p.id);
    assert.ok(p.vs > 20 && p.vs <= 100, p.id);
    assert.ok(p.dftMin > 0 && p.dftMax > p.dftMin, p.id);
    assert.ok(DB.paints.layerTypes[p.type], p.id);
    assert.ok(p.source && p.source.length > 20, `${p.id} needs a source note`);
  }
});

test("parseList: pipes, sections, decimal commas, aliases and errors", () => {
  const txt = [
    "family,size,length,qty",
    "PIPE,6,12,3",
    "pipe, DN150, 6, 2, 80",
    "PIPE;1-1/2;6,5;4",
    "UB,254x146x31,6.0,4",     // SAISC before EN
    "IPE\tIPE 200\t5\t10",
    "HEB,HEB 300,7,2,80",      // only in EN
    "SHS,100x100x5,3,2",       // SAISC; the EN hot-finished table has 1.1 % more area: warned
    "SHS-HF,100x100x5,3,2",    // a family id picks that table
    "L,50x50x5,2,10",
    "W,W24x68,6,1",            // AISC
    "HSS,HSS6x6x5/16,3,1",
    "L,4x4x1/2,2,2",
    "IPE AA,100,4,2",
    "ipe-aa,IPE AA 120,4,2",
    "T,152x152x23,3,1",
    "Tee cut from UC, Tee cut from UC 152x152x23, 3, 1",
    "EN UB,254x146x31,6,1",    // a catalogue in front picks that table
    "PFC,260x90,6,1",          // flagged size: its note becomes a warning
    "HSS;HSS20X12X.625;6;1",   // AISC 2001 spelling, semicolons
    "SHS;100x100x6,3;3;2",     // decimal comma in the size
    "UB,999x999x9,1,1",
    "W,WT6x25,1,1",            // a size prefix that contradicts the family is not ignored
    "PIPE,6,x,3",
    "# comment"
  ].join("\n");
  const r = C.parseList(txt);
  const byKey = (k) => r.lines.find((l) => k(l));
  const p6 = r.lines.filter((l) => l.kind === "pipe" && l.size === "6");
  assert.equal(p6.length, 2);
  assert.equal(p6[0].schedule, "STD");
  assert.equal(p6[1].schedule, "80");
  const p15 = byKey((l) => l.size === "1 1/2");
  assert.ok(p15); assert.equal(p15.length, 6.5); assert.equal(p15.qty, 4);
  assert.ok(byKey((l) => l.family === "SA-UB" && l.size === "254x146x31"));
  assert.ok(byKey((l) => l.family === "SA-IPE" && l.size === "IPE 200" && l.qty === 10));
  const heb = byKey((l) => l.family === "HEB"); assert.equal(heb.paintPct, 80);
  assert.ok(byKey((l) => l.family === "SA-EA" && l.size === "50x50x5"));
  assert.ok(byKey((l) => l.family === "SA-SHS" && l.size === "100x100x5"));
  assert.ok(byKey((l) => l.family === "SHS-HF" && l.size === "100x100x5"));
  assert.ok(byKey((l) => l.family === "US-W" && l.size === "W24x68"));
  assert.ok(byKey((l) => l.family === "US-HSSR" && l.size === "HSS6x6x5/16"));
  assert.ok(byKey((l) => l.family === "US-L" && l.size === "L4x4x1/2"));
  assert.ok(byKey((l) => l.family === "SA-IPEAA" && l.size === "IPE AA 100"));
  assert.ok(byKey((l) => l.family === "SA-IPEAA" && l.size === "IPE AA 120"));
  assert.equal(r.lines.filter((l) => l.family === "SA-STH" && l.size === "152x152x23").length, 2);
  assert.ok(byKey((l) => l.family === "UB" && l.size === "254x146x31"));
  assert.ok(byKey((l) => l.family === "US-HSSR" && l.size === "HSS20x12x5/8"));
  assert.ok(byKey((l) => l.size === "100x100x6.3"));
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings[0].message, /"SHS 100x100x5" the EN Square hollow sections, hot-finished \(SHS\) table gives 1\.1% more area; used SAISC/);
  assert.match(r.warnings[1].message, /"PFC 260x90": \* Older SAISC section/);
  assert.equal(r.errors.length, 3);
  assert.ok(r.errors.some((e) => /No section "UB 999x999x9"/.test(e.message)));
  assert.ok(r.errors.some((e) => /No section "W WT6x25"/.test(e.message)));
  assert.ok(r.errors.some((e) => /positive numbers/.test(e.message)));
  // header and comment rows are skipped silently
  assert.ok(!r.errors.some((e) => /family|comment/.test(e.text)));
  // every parsed line must compute
  for (const l of r.lines) assert.ok(C.lineMetrics(l).ok, JSON.stringify(l));
});

test("resolveSection: catalogue preference and notes", () => {
  // a size only EN has falls through to EN; one only AISC has to AISC
  assert.equal(C.resolveSection("UB", "1016x305x584").family, "UB");
  assert.equal(C.resolveSection("HP", "HP14x117").family, "US-HP");
  assert.equal(C.resolveSection("HP", "203x203x45").family, "SA-HP");
  // within one catalogue the larger area wins and the note says so (EN tube; SAISC has no 40x40x4)
  const t = C.resolveSection("SHS", "40x40x4");
  assert.equal(t.family, "SHS-HF");
  assert.match(t.note, /exists in EN .*hot-finished.* and EN .*cold-formed.*larger area/);
  // equal areas across catalogues: no note (SAISC and EN IPE 200 are the same section)
  assert.equal(C.resolveSection("IPE", "IPE 200").note, undefined);
  // the prefix, spacing and separators of a size do not matter
  for (const tok of ["254x146x31", "UB254x146x31", "UB 254 x 146 x 31", "254×146×31", "254*146*31"])
    assert.equal(C.resolveSection("UB", tok).size, "254x146x31", tok);
  assert.equal(C.resolveSection("W", "w24X68").size, "W24x68");
  // the same note uses the smaller area as its base: HF 0.6142 is 2.9 % more than CF 0.5971
  assert.match(C.resolveSection("SHS", "160x160x10").note, /larger area, 2\.9% more/);
  // equal areas (EN hot-finished and cold-formed CHS are both pi d): no note
  assert.equal(C.resolveSection("CHS", "48.3x4").note, undefined);
  // a contradicting size prefix finds nothing; a matching one, or the family's own long prefix, is fine
  for (const [f, sz] of [["W", "WT6x25"], ["IPE", "IPE AA 200"], ["IPE", "IPE A 200"], ["HEA", "HEM 300"], ["HSS", "L4x4x1/2"],
    ["L", "SHS 100x100x10"], ["MC", "M6x12"], ["UPN", "IPE 200"]]) assert.equal(C.resolveSection(f, sz), null, `${f} ${sz}`);
  assert.equal(C.resolveSection("IPE AA", "IPE AA 200").family, "SA-IPEAA");
  assert.equal(C.resolveSection("STI", "STI 203x133x25").family, "SA-STI");
  assert.equal(C.resolveSection("Lipped channel", "Lipped channel 75x50x20x2").family, "SA-CC");
  // AISC 2001 spellings: decimal walls for fractions, leading dots
  assert.equal(C.resolveSection("HSS", "HSS10X10X.3125").size, "HSS10x10x5/16");
  assert.equal(C.resolveSection("HSS", "HSS6.625X.280").size, "HSS6.625x0.280");
  assert.equal(C.resolveSection("L", "L4X4X.5").size, "L4x4x1/2");
  // ids with spaces, and catalogue-qualified words
  assert.equal(C.resolveSection("SHS HF", "100x100x5").family, "SHS-HF");
  assert.equal(C.resolveSection("EN-EA", "100x100x10").family, "EA");
  assert.equal(C.resolveSection("AISC L", "4x4x1/2").family, "US-L");
  // every section can be found again from its own label, by its table (EN ids such as UB are also family words, so
  // the catalogue goes in front) and by its prefix word
  for (const f of DB.sections.families) for (const it of f.items) {
    const name = C.sectionName(f, it);
    const byId = C.resolveSection(`${f.catalogue} ${f.id}`, name);
    assert.ok(byId && byId.family === f.id && byId.size === it[0], `${f.id} ${name}`);
    const byWord = C.resolveSection(`${f.catalogue} ${f.prefix}`, it[0]);
    assert.ok(byWord && C.findFamily(byWord.family).catalogue === f.catalogue, `${f.catalogue} ${f.prefix} ${it[0]}`);
  }
  assert.equal(C.resolveSection("PIPE", "6"), null);
  assert.equal(C.resolveSection("NOPE", "100x100x5"), null);
});

test("custom members: perimeter in mm, optional mass", () => {
  const m = C.lineMetrics({ kind: "custom", label: "FB 100x10", perimeter: 220, massPerM: 7.85, length: 6, qty: 10 });
  assert.ok(m.ok);
  assert.equal(m.label, "FB 100x10");
  close(m.area, 0.22 * 60, 1e-9);
  close(m.mass, 7.85 * 60, 1e-9);
  assert.equal(C.lineMetrics({ kind: "custom", perimeter: 0, length: 1, qty: 1 }).ok, false);
  const t = C.totals([{ kind: "custom", perimeter: 500, length: 2, qty: 3 }], 0);
  close(t.steelArea, 3, 1e-9);                 // custom members count with the steel
  assert.equal(t.massKnown, false);            // no mass given
});

test("resolvePipe accepts the usual spellings", () => {
  for (const [tok, want] of [["6", "6"], ["NPS 6", "6"], ['6"', "6"], ["DN150", "6"], ["1 1/2", "1 1/2"], ["1-1/2", "1 1/2"],
    ["1.5", "1 1/2"], ["0.5", "1/2"], ["1/2", "1/2"], ["DN15", "1/2"], ["DN1200", "48"], ["48", "48"]])
    assert.equal(C.resolvePipe(tok), want, tok);
  assert.equal(C.resolvePipe("7"), null);
  assert.equal(C.resolvePipe("DN7"), null);
});

test("end to end: small job", () => {
  const lines = [
    { kind: "pipe", size: "8", schedule: "40", surfaces: "ext", length: 6, qty: 20 },
    { kind: "section", family: "UB", size: "254x146x31", length: 6, qty: 10, paintPct: 100 },
    { kind: "section", family: "SHS-HF", size: "100x100x5", length: 3, qty: 8 }
  ];
  const t = C.totals(lines, 5);
  const layers = C.systemLayers(C.getLibrarySystem("C4.06", "carbon", "C4"), "jotun");
  const q = C.paintQuantities(t.totalArea, layers, 30);
  // independent recomputation
  const area = (Math.PI * 0.2191 * 120 + 1.0622 * 60 + 0.3871 * 24) * 1.05;
  close(t.totalArea, area, 1e-6);
  const expect = layers.reduce((s, l) => s + (area * l.coats * l.dft) / (10 * l.vs) / 0.7, 0);
  close(q.litres, expect, 1e-9);
  assert.equal(q.totalCoats, 3); // C4 High: zinc primer 1 + epoxy mid coat 1 + PUR finish 1
});

// ---------------------------------------------------------------- hot-dip galvanizing (ISO 1461, ISO 14713-1)
test("ISO 1461 Tables 3 and 4: minimum thickness and mass", () => {
  const b = (id) => C.galvBand(id);
  assert.deepEqual([b("s6").local, b("s6").mean, b("s6").massLocal, b("s6").massMean], [70, 85, 505, 610]);
  assert.deepEqual([b("s3").local, b("s3").mean], [55, 70]);
  assert.deepEqual([b("s15").local, b("s15").mean], [45, 55]);
  assert.deepEqual([b("s0").local, b("s0").mean], [35, 45]);
  assert.deepEqual([b("c6").mean, b("c0").mean, b("th6").mean, b("th0").mean, b("cf3").mean, b("cf0").mean], [80, 70, 50, 25, 55, 45]);
  // every printed mass is the thickness x 7.2, rounded by the table to a multiple of 5 (40 um prints 285, not 290)
  for (const x of DB.galvanizing.bands) for (const [um, g] of [[x.local, x.massLocal], [x.mean, x.massMean]])
    assert.ok(Math.abs(um * 7.2 - g) <= 3 && g % 5 === 0, `${x.id} ${um} um vs ${g} g/m2`);
  // band edges: > 6 mm, > 3 to <= 6, >= 1.5 to <= 3, < 1.5
  assert.deepEqual([12, 6.1, 6, 3.1, 3, 1.5, 1.4].map((t) => C.bandForThickness(t).id), ["s6", "s6", "s3", "s3", "s15", "s15", "s0"]);
  assert.equal(C.bandForThickness(0), null);
});

test("ISO 1461 compliance check", () => {
  assert.equal(C.galvCheck(85, "s6").status, "ok");
  assert.equal(C.galvCheck(84, "s6").status, "local");      // above 70 local, below 85 mean: fails on the mean
  assert.equal(C.galvCheck(84, "s6").ok, false);
  assert.equal(C.galvCheck(69, "s6").status, "fail");
  assert.equal(C.galvCheck(70, "s3").status, "ok");
  assert.equal(C.galvCheck(85, "nope"), null);
});

test("zinc life to first maintenance (ISO 14713-1 with ISO 9223 rates)", () => {
  const life = (um, env) => C.lifeText(C.zincLife(um, env));
  // 85 um: C3 at least 40 years (the ArcelorMittal guide's example), C4 20-40, C5 10-20, CX 3-10
  assert.equal(life(85, "C3"), "40 to > 100 years");
  assert.equal(life(85, "C4"), "20\u201340 years");
  assert.equal(life(85, "C5"), "10\u201320 years");
  assert.equal(life(85, "CX"), "3\u201310 years");
  assert.equal(life(85, "C2"), "> 100 years");               // 85 / 0.7 = 121: capped
  assert.equal(life(85, "C1"), "> 100 years");               // C1 has no lower rate
  assert.equal(life(200, "C4"), "47\u201395 years");
  const l = C.zincLife(85, "C4");
  assert.deepEqual([l.min, l.max, l.rate], [20, 40, [2.1, 4.2]]);
  // immersion and buried: no life, specialist advice
  for (const e of ["Im1", "Im2", "Im3", "Im4"]) assert.equal(C.zincLife(85, e).kind, "imm");
  // durability check on the shorter life: VH needs 25 years, H 15, M 7
  assert.equal(C.lifeMeets(C.zincLife(85, "C3"), "VH"), true);
  assert.equal(C.lifeMeets(C.zincLife(85, "C4"), "VH"), false);
  assert.equal(C.lifeMeets(C.zincLife(85, "C4"), "H"), true);
  assert.equal(C.lifeMeets(C.zincLife(85, "Im2"), "L"), false);
  // galvanizing alone offers every environment and durability
  assert.deepEqual(C.durabilitiesFor("galv", "Im2"), ["L", "M", "H", "VH"]);
  assert.deepEqual(C.durabilitiesFor("galv", "CX"), ["L", "M", "H", "VH"]);
});

test("zinc mass, volume and added weight", () => {
  const q = C.zincQuantities(100, 85, 5000);
  assert.equal(q.gm2, 612);                                  // 85 x 7.2
  close(q.kg, 61.2, 1e-9);                                    // 100 m2 x 612 g/m2
  close(q.litres, 8.5, 1e-9);                                 // 100 m2 x 85 um
  close(q.pctOfSteel, 1.224, 1e-9);
  assert.equal(C.zincQuantities(10, 85, null).pctOfSteel, null);
  // a tube is galvanized inside too: inside perimeter = outside - 2 pi t
  const shs = C.galvAreaPerM({ kind: "section", family: "SA-SHS", size: "100x100x4", length: 1, qty: 1 }, true);
  close(shs.inner, 0.3863 - (2 * Math.PI * 4) / 1000, 1e-12);
  assert.equal(C.galvAreaPerM({ kind: "section", family: "SA-SHS", size: "100x100x4", length: 1, qty: 1 }, false).inner, 0);
  assert.equal(C.galvAreaPerM({ kind: "section", family: "SA-UB", size: "254x146x31", length: 1, qty: 1 }, true).inner, 0);
  const pipe = C.galvAreaPerM({ kind: "pipe", size: "6", schedule: "40", surfaces: "ext", length: 1, qty: 1 }, true);
  close(pipe.inner, (Math.PI * (168.3 - 2 * 7.11)) / 1000, 1e-12);
  // area of a list with the allowance, and the weight of one piece
  const lines = [{ kind: "section", family: "SA-UB", size: "254x146x31", length: 6, qty: 2 }, { kind: "section", family: "SA-SHS", size: "100x100x4", length: 3, qty: 1 }];
  const a = C.galvArea(lines, 10, true);
  close(a.outer, C.findSection("SA-UB", "254x146x31")[2] * 12 + 0.3863 * 3, 1e-9);
  close(a.total, a.base * 1.1, 1e-9);
  const p = C.pieceWeights(lines[0], 85, true);
  close(p.zinc, (C.findSection("SA-UB", "254x146x31")[2] * 6 * 85 * 7.2) / 1000, 1e-9);
  close(p.total, p.steel + p.zinc, 1e-9);
});

test("steel element thickness for the ISO 1461 band", () => {
  const t = (line) => C.elementThickness(line);
  assert.deepEqual(t({ kind: "section", family: "SA-UB", size: "254x146x31" }), { min: 6, max: 8.6 });     // web, flange
  assert.deepEqual(t({ kind: "section", family: "SA-EA", size: "50x50x5" }), { min: 5, max: 5 });          // angle leg
  assert.deepEqual(t({ kind: "section", family: "SA-SHS", size: "100x100x4" }), { min: 4, max: 4 });       // wall
  assert.deepEqual(t({ kind: "section", family: "SA-CC", size: "100x50x20x2" }), { min: 2, max: 2 });      // lipped: last
  assert.deepEqual(t({ kind: "pipe", size: "6", schedule: "40" }), { min: 7.11, max: 7.11 });
  assert.equal(t({ kind: "custom", perimeter: 200 }), null);
  // every section in every catalogue yields a positive thickness
  for (const f of DB.sections.families) for (const it of f.items) {
    const x = t({ kind: "section", family: f.id, size: it[0] });
    assert.ok(x && x.min > 0 && x.max >= x.min && x.max <= 140, `${f.id} ${it[0]}`);   // UC 356x406x1086 flange 140
  }
});
