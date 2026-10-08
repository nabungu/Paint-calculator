// Run with:  npm test        (or: node --test test/*.test.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

for (const f of ["pipes", "sections", "paints", "iso12944"]) require(path.join("..", "data", f + ".js"));
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
});

// ---------------------------------------------------------------- database consistency
test("every system x supplier resolves to products that accept the specified DFT", () => {
  const suppliers = DB.paints.suppliers.map((s) => s.id);
  assert.ok(suppliers.length >= 3);
  for (const sys of DB.iso12944.systems) {
    const total = sys.layers.reduce((s, l) => s + l.coats * l.dft, 0);
    assert.ok(total >= sys.refNdft, `${sys.cat} ${sys.dur}: plan ${total} um < reference ${sys.refNdft} um`);
    assert.ok(DB.iso12944.basisNotes[sys.basis], `${sys.cat} ${sys.dur}: unknown basis`);
    assert.ok(sys.layers[0].role === "primer" && sys.layers[sys.layers.length - 1].role === "finish");
    if (sys.cat === "CX") {
      assert.ok(sys.layers.reduce((s, l) => s + l.coats, 0) >= 3, "CX needs >= 3 coats");
      assert.ok(sys.layers[0].type === "ZN" && sys.layers[0].dft >= 40, "CX zinc primer >= 40 um");
    }
    for (const sup of suppliers) {
      const layers = C.buildLayers(sys.cat, sys.dur, sup);
      assert.equal(layers.length, sys.layers.length);
      for (const l of layers) {
        const p = C.getProduct(sup, l.productId);
        assert.ok(p, `${sup} ${sys.cat} ${sys.dur} ${l.role}: no product`);
        assert.equal(p.type, l.type);
        assert.ok(l.dft >= p.dftMin && l.dft <= p.dftMax, `${sup} ${sys.cat} ${sys.dur} ${l.role}: ${l.dft} um outside ${p.name} ${p.dftMin}-${p.dftMax}`);
        assert.equal(l.vs, p.vs);
      }
      assert.deepEqual(C.checkLayers(layers, sup, sys.cat, sys.dur), [], `${sup} ${sys.cat} ${sys.dur}`);
    }
  }
});

test("buildLayers returns independent copies", () => {
  const a = C.buildLayers("C4", "H", "jotun");
  a[0].dft = 999;
  assert.equal(C.buildLayers("C4", "H", "jotun")[0].dft, 60);
  assert.equal(C.getSystem("C4", "H").layers[0].dft, 60);
});

test("every category offered has a system, each product has valid numbers", () => {
  for (const c of DB.iso12944.categories) {
    if (c.id !== "C1") assert.ok(C.durabilitiesFor(c.id).length > 0, c.id);
  }
  const ids = new Set();
  for (const s of DB.paints.suppliers) for (const p of s.products) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`); ids.add(p.id);
    assert.ok(p.vs > 20 && p.vs <= 100, p.id);
    assert.ok(p.dftMin > 0 && p.dftMax > p.dftMin, p.id);
    assert.ok(DB.paints.layerTypes[p.type], p.id);
    assert.ok(p.source && p.source.length > 20, `${p.id} needs a source note`);
  }
});

test("checkLayers flags thin film, out-of-range DFT and CX minimums", () => {
  const l = C.buildLayers("C4", "H", "jotun");
  l[1].dft = 50;
  const w = C.checkLayers(l, "jotun", "C4", "H");
  assert.ok(w.some((m) => /below the 240/.test(m)));
  assert.ok(w.some((m) => /outside its recommended/.test(m)));
  const cx = C.buildLayers("CX", "H", "ppg");
  cx[1].coats = 0;
  assert.ok(C.checkLayers(cx, "ppg", "CX", "H").some((m) => /at least 3 coats/.test(m)));
});

// ---------------------------------------------------------------- bulk import
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
  const layers = C.buildLayers("C4", "H", "jotun");
  const q = C.paintQuantities(t.totalArea, layers, 30);
  // independent recomputation
  const area = (Math.PI * 0.2191 * 120 + 1.0622 * 60 + 0.3871 * 24) * 1.05;
  close(t.totalArea, area, 1e-6);
  const expect = layers.reduce((s, l) => s + (area * l.coats * l.dft) / (10 * l.vs) / 0.7, 0);
  close(q.litres, expect, 1e-9);
  assert.equal(q.totalCoats, 3); // C4 High: zinc primer 1 + epoxy mid coat 1 + PUR finish 1
});
