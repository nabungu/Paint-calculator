/* Paint systems from Jotun's "ISO 12944 Coating Selector, Revision 2" (sample specifications Jotun states comply
 * with ISO 12944-5:2018 / ISO 12944-9:2018).
 *
 * Each system: id (Jotun's number; "A" = the "Alternative" row under it), substrate, env, the highest durability
 * Jotun ticks (its ticks always run from Low up to that class), and layers [type, coats, DFT per coat, products].
 * Jotun's brochure gives a choice of product in some layers ("Penguard HSP ZP or Penguard Express ZP",
 * "Hardtop AX or XP", "Pilot II or Pioner TC"); the products listed here are the ones whose solids could be
 * found (see paints.js). For TSM systems the sealer coat is not part of the NDFT and is not listed.
 *
 * The test suite checks every carbon-steel, galvanized, metal-spray and immersion system here against the
 * ISO 12944-5 Annex B minimums in iso12944.js: the durability the standard allows must equal Jotun's tick.
 * CX / Im4 systems are Jotun's ISO 12944-9 tested systems (report numbers as ids); only those whose products'
 * solids are known are included.
 */
(function (root) {
  root.PaintDB = root.PaintDB || {};

  const L = (type, coats, dft, products) => ({ type, coats, dft, products });
  const ZN = (dft) => L("ZN", 1, dft, ["jotun-barrier-80"]);
  const EP = (dft) => L("EP", 1, dft, ["jotun-penguard-hsp-zp"]);
  const PU = (dft) => L("PUR", 1, dft, ["jotun-hardtop-ax", "jotun-hardtop-xp"]);
  const AK = (dft, coats = 1) => L("AK", coats, dft, ["jotun-pilot-qd-primer"]);
  const TC = (dft) => L("AY", 1, dft, ["jotun-pilot-ii", "jotun-pioner-topcoat"]);
  const HB = (dft) => L("EP", 1, dft, ["jotun-penguard-hb"]);
  const PRO = (dft) => L("EP", 1, dft, ["jotun-penguard-pro"]);

  const S = (id, substrate, env, dur, layers, extra) => ({ id, supplier: "jotun", substrate, env, dur, layers, ...extra });
  const carbon = (id, env, dur, layers) => S(id, "carbon", env, dur, layers, { table: `Table C.${env.slice(1)}` });

  (root.PaintDB.systems = root.PaintDB.systems || []).push(
    // ---- Table C.2, carbon steel, C2
    carbon("C2.01", "C2", "L", [AK(40), TC(40)]),
    carbon("C2.02", "C2", "M", [AK(60), TC(40)]),
    carbon("C2.03", "C2", "H", [AK(120), TC(40)]),
    carbon("C2.04", "C2", "VH", [AK(80, 2), TC(40)]),
    carbon("C2.05", "C2", "H", [EP(70), PU(50)]),
    carbon("C2.05A", "C2", "H", [ZN(50), PU(70)]),
    carbon("C2.06", "C2", "VH", [ZN(80), PU(100)]),
    carbon("C2.06A", "C2", "VH", [EP(120), PU(60)]),
    carbon("C2.07", "C2", "H", [ZN(60)]),
    carbon("C2.08", "C2", "VH", [ZN(60), PU(100)]),
    // ---- Table C.3, C3
    carbon("C3.01", "C3", "L", [AK(60), TC(40)]),
    carbon("C3.02", "C3", "M", [AK(120), TC(40)]),
    carbon("C3.03", "C3", "H", [AK(80, 2), TC(40)]),
    carbon("C3.04", "C3", "VH", [AK(100, 2), TC(60)]),
    carbon("C3.05", "C3", "M", [EP(70), PU(50)]),
    carbon("C3.05A", "C3", "M", [ZN(50), PU(70)]),
    carbon("C3.06", "C3", "H", [ZN(80), PU(100)]),
    carbon("C3.06A", "C3", "H", [EP(120), PU(60)]),
    carbon("C3.07", "C3", "VH", [ZN(60), EP(120), PU(60)]),
    carbon("C3.07A", "C3", "VH", [EP(180), PU(60)]),
    carbon("C3.08", "C3", "M", [ZN(60)]),
    carbon("C3.09", "C3", "H", [ZN(60), PU(100)]),
    carbon("C3.10", "C3", "VH", [ZN(60), EP(80), PU(60)]),
    // ---- Table C.4, C4
    carbon("C4.01", "C4", "L", [AK(120), TC(40)]),
    carbon("C4.02", "C4", "M", [AK(80, 2), TC(40)]),
    carbon("C4.03", "C4", "H", [AK(100, 2), TC(60)]),
    carbon("C4.04", "C4", "L", [EP(70), PU(50)]),
    carbon("C4.04A", "C4", "L", [ZN(50), PU(70)]),
    carbon("C4.05", "C4", "M", [ZN(80), PU(100)]),
    carbon("C4.05A", "C4", "M", [EP(120), PU(60)]),
    carbon("C4.06", "C4", "H", [ZN(60), EP(120), PU(60)]),
    carbon("C4.06A", "C4", "H", [EP(180), PU(60)]),
    carbon("C4.07", "C4", "VH", [ZN(60), EP(180), PU(60)]),
    carbon("C4.07A", "C4", "VH", [EP(120), EP(120), PU(60)]),
    carbon("C4.08", "C4", "L", [ZN(60)]),
    carbon("C4.09", "C4", "M", [ZN(60), PU(100)]),
    carbon("C4.10", "C4", "H", [ZN(60), EP(80), PU(60)]),
    carbon("C4.11", "C4", "VH", [ZN(60), EP(140), PU(60)]),
    // ---- Table C.5, C5
    carbon("C5.01", "C5", "L", [ZN(80), PU(100)]),
    carbon("C5.01A", "C5", "L", [EP(120), PU(60)]),
    carbon("C5.02", "C5", "M", [ZN(60), EP(120), PU(60)]),
    carbon("C5.02A", "C5", "M", [EP(180), PU(60)]),
    carbon("C5.03", "C5", "H", [ZN(60), EP(180), PU(60)]),
    carbon("C5.03A", "C5", "H", [EP(120), EP(120), PU(60)]),
    carbon("C5.04", "C5", "VH", [ZN(80), EP(200), PU(80)]),
    carbon("C5.04A", "C5", "VH", [EP(150), EP(150), PU(60)]),
    carbon("C5.05", "C5", "L", [ZN(60), PU(100)]),
    carbon("C5.06", "C5", "M", [ZN(60), EP(80), PU(60)]),
    carbon("C5.07", "C5", "H", [ZN(60), EP(140), PU(60)]),
    carbon("C5.08", "C5", "VH", [ZN(60), EP(200), PU(60)]),
    // ---- Table C.6, immersion Im1 to Im3 (Jotun does not recommend zinc primers under water)
    ...["Im1", "Im2", "Im3"].flatMap((env) => [
      S("I.03", "carbon", env, "H", [PRO(190), PRO(190)], { table: "Table C.6" }),
      S("I.04", "carbon", env, "VH", [PRO(270), PRO(270)], { table: "Table C.6" }),
      S("I.05", "carbon", env, "H", [PRO(200), PRO(200)], { table: "Table C.6" }),
      S("I.06", "carbon", env, "VH", [PRO(300), PRO(300)], { table: "Table C.6" })
    ]),
    // ---- Table D.1, hot-dip galvanized steel (Jotun does not recommend alkyds on galvanizing)
    S("G2.01", "hdg", "C2", "H", [HB(80)], { table: "Table D.1" }),
    S("G2.03", "hdg", "C2", "VH", [HB(120)], { table: "Table D.1" }),
    S("G3.01", "hdg", "C3", "M", [HB(80)], { table: "Table D.1" }),
    S("G3.02", "hdg", "C3", "H", [HB(120)], { table: "Table D.1" }),
    S("G3.04", "hdg", "C3", "VH", [HB(80), PU(80)], { table: "Table D.1" }),
    S("G4.01", "hdg", "C4", "L", [HB(80)], { table: "Table D.1" }),
    S("G4.02", "hdg", "C4", "M", [HB(120)], { table: "Table D.1" }),
    S("G4.04", "hdg", "C4", "H", [HB(80), PU(80)], { table: "Table D.1" }),
    S("G4.06", "hdg", "C4", "VH", [HB(80), EP(60), PU(60)], { table: "Table D.1" }),
    S("G5.01", "hdg", "C5", "L", [HB(120)], { table: "Table D.1" }),
    S("G5.02", "hdg", "C5", "M", [HB(80), PU(80)], { table: "Table D.1" }),
    S("G5.04", "hdg", "C5", "H", [HB(80), EP(70), PU(50)], { table: "Table D.1" }),
    S("G5.05", "hdg", "C5", "VH", [HB(80), EP(110), PU(50)], { table: "Table D.1" }),
    // ---- Table E.1, thermal-sprayed metal (sealer not counted)
    S("TSM 4.01", "tsm", "C4", "H", [EP(100), PU(60)], { table: "Table E.1" }),
    S("TSM 4.02", "tsm", "C4", "VH", [EP(140), PU(60)], { table: "Table E.1" }),
    S("TSM 5.01", "tsm", "C5", "H", [EP(140), PU(60)], { table: "Table E.1" }),
    S("TSM 5.02", "tsm", "C5", "VH", [EP(160), PU(80)], { table: "Table E.1" }),
    // ---- ISO 12944-9 tested systems (Jotun report numbers); CX has a single durability class
    S("3400-15-022579 Mt09 Rev.B", "carbon", "CX", "H",
      [L("ZN", 1, 60, ["jotun-barrier"]), L("EP", 1, 160, ["jotun-penguard-universal"]), L("PUR", 1, 60, ["jotun-hardtop-ax"])], { table: "ISO 12944-9" }),
    S("LAB10-0821-REP", "carbon", "CX", "H",
      [L("ZN", 1, 75, ["jotun-barrier"]), L("EP", 1, 150, ["jotun-penguard-express"]), L("PUR", 1, 60, ["jotun-hardtop-xp"])], { table: "ISO 12944-9" }),
    S("SL13348", "carbon", "CX", "H",
      [L("EP", 1, 300, ["jotun-penguard-pro-gf"]), L("EP", 1, 300, ["jotun-penguard-pro-gf"])], { table: "ISO 12944-9", note: "Also tested for splash and tidal zones and Im4." }),
    S("SL13348", "carbon", "Im4", "H",
      [L("EP", 1, 300, ["jotun-penguard-pro-gf"]), L("EP", 1, 300, ["jotun-penguard-pro-gf"])], { table: "ISO 12944-9", note: "Also tested for CX offshore and splash and tidal zones." }),
    S("3400-15-022579 Mt13 Rev. A", "carbon", "Im4", "H",
      [L("EP", 1, 175, ["jotun-penguard-pro-gf"]), L("EP", 1, 175, ["jotun-penguard-pro-gf"])], { table: "ISO 12944-9" })
  );
})(typeof globalThis !== "undefined" ? globalThis : window);
