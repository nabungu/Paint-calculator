// Run with:  npm test        (or: node --test test/*.test.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

for (const f of ["pipes", "sections", "paints", "iso12944", "systems"]) require(path.join("..", "data", f + ".js"));
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
  close(A("EA", "200x200x24"), 0.777, 0.003);
  close(A("EA", "50x50x5"), 0.191, 0.002);
  close(A("PFC", "430x100x64"), 1.225, 0.005);
});

test("section data: integrity", () => {
  let n = 0;
  for (const f of DB.sections.families) {
    const seen = new Set();
    for (const it of f.items) {
      n++;
      assert.equal(it.length, 4, `${f.id} ${it[0]} row shape`);
      assert.ok(!seen.has(it[0]), `duplicate ${f.id} ${it[0]}`);
      seen.add(it[0]);
      assert.ok(it[1] > 0 && it[2] > 0, `${f.id} ${it[0]} mass/area`);
      // surface area per tonne = area / mass x 1000 must be physically plausible for rolled / tubular steel
      const perTonne = (it[2] / it[1]) * 1000;
      // (the heaviest UCs, e.g. 356x406x1299, are about 2.2 m2/t; thin cold-formed tube is about 70-130)
      assert.ok(perTonne > 1.5 && perTonne < 250, `${f.id} ${it[0]} m2/t = ${perTonne.toFixed(1)}`);
    }
  }
  assert.ok(n > 1000);
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
    "UB,254x146x31,6.0,4",
    "IPE\tIPE 200\t5\t10",
    "HEB,HEB 300,7,2,80",
    "SHS,100x100x5,3,2",   // exists in SHS-HF and SHS-CF: larger area used, with a warning
    "SHS,50x50x3,3,2",     // only in SHS-CF: no warning
    "L,50x50x5,2,10",
    "UB,999x999x9,1,1",
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
  assert.ok(byKey((l) => l.family === "UB" && l.size === "254x146x31"));
  assert.ok(byKey((l) => l.family === "IPE" && l.size === "IPE 200" && l.qty === 10));
  const heb = byKey((l) => l.family === "HEB"); assert.equal(heb.paintPct, 80);
  assert.ok(byKey((l) => l.family === "EA" && l.size === "50x50x5"));
  const shs = byKey((l) => l.size === "100x100x5");
  assert.equal(shs.family, "SHS-HF");                      // 0.3871 m2/m beats cold-formed 0.3828
  assert.equal(byKey((l) => l.size === "50x50x3").family, "SHS-CF");
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0].message, /SHS 100x100x5.*SHS-CF and SHS-HF|SHS-HF and SHS-CF/);
  assert.ok(r.errors.some((e) => /No section "UB 999x999x9"/.test(e.message)));
  assert.ok(r.errors.some((e) => /positive numbers/.test(e.message)));
  // header and comment rows are skipped silently
  assert.ok(!r.errors.some((e) => /family|comment/.test(e.text)));
  // every parsed line must compute
  for (const l of r.lines) assert.ok(C.lineMetrics(l).ok, JSON.stringify(l));
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
