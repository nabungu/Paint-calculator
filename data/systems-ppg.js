/* Paint systems from PPG's "PPG coating systems ISO 12944 - 2023 global system selector" (P641-GLOB, June 2023),
 * charts on brochure pages 7-12 (C2 to C5), for Sa 2½ grit-blasted carbon steel. Products and their solids are in
 * the "ppg" block of paints.js (PPG's product table on brochure p.13 and the products' data sheets).
 *
 * BASIS OF EACH RATING. PPG marks some systems with "*": "Also complies with ISO 12944-5:2018 min. Dry Film
 * Thickness and Minimum Number of Coats requirements". Those have basis "annexB": the Annex B minimums in
 * iso12944.js allow at least PPG's durability. Unstarred systems are rated by PPG from ISO 12944-6 performance
 * testing (basis "tested"); their note says what Annex B alone would allow. One exception: C4.06/2 is starred
 * in the chart but Annex B allows only Medium in C4 (220 um, needs 240 um for High), so it is recorded as "tested".
 *
 * Conventions: id = PPG's system number (the "*" dropped). dur = the durability chart the system sits in; where the
 * same build appears in several durability charts of one environment only the highest is kept, and its note
 * names the other number. PPG's "POL" (polysiloxane, PSX 700) is layer type PS; "ESI" (Dimetcote 9) and "ZnR" are
 * ZN. The selector has no C1, CX, immersion, galvanized or metal-spray charts.
 * Chart misprints: C4.05/3 and C5.03/1-2 list "1" coat for two-layer builds and C5.03/3 lists "1" for three
 * layers; the layers here count one coat each (totals agree with the charts' total DFT).
 */
(function (root) {
  root.PaintDB = root.PaintDB || {};

  const L = (type, dft, product, coats = 1) => ({ type, coats, dft, products: [product] });
  const SF = (dft) => L("EP", dft, "ppg-sigmafast-278");
  const AL = (dft) => L("EP", dft, "ppg-amerlock-2");
  const SC = (dft) => L("EP", dft, "ppg-sigmacover-410");
  const SH = (dft) => L("EP", dft, "ppg-sigmashield-880");
  const SZ = (dft) => L("ZN", dft, "ppg-sigmazinc-68-gp");
  const DC = (dft) => L("ZN", dft, "ppg-dimetcote-9");
  const PSX = (dft) => L("PS", dft, "ppg-psx-700");
  const H = (dft) => L("PUR", dft, "ppg-sigmadur-550h");
  const D = (dft) => L("PUR", dft, "ppg-sigmadur-550");
  const US = (dft) => L("PUR", dft, "ppg-sigmadur-550-us");

  const PAGE = { C2: 7, C3: 8, C4: 9, C5: 11 };
  const DUR = { L: "Low", M: "Medium", H: "High", VH: "Very high" };
  const page = (env, dur) => (env === "C4" && (dur === "H" || dur === "VH") ? 10 : env === "C5" && (dur === "H" || dur === "VH") ? 12 : PAGE[env]);
  const T = (env, dur) => `PPG 2023 selector p.${page(env, dur)}, ${env} ${DUR[dur]}`;
  const tested = (allows) => `PPG rates this from ISO 12944-6 performance testing; ISO 12944-5 Annex B allows: ${allows}`;

  // starred: complies with ISO 12944-5 Annex B
  const A = (id, env, dur, layers, note) => ({ id, supplier: "ppg", substrate: "carbon", env, dur, layers, table: T(env, dur), basis: "annexB", ...(note ? { note } : {}) });
  // unstarred: PPG's tested rating; `allows` = what Annex B gives the build
  const X = (id, env, dur, layers, allows, extra) => ({ id, supplier: "ppg", substrate: "carbon", env, dur, layers, table: T(env, dur), basis: "tested",
    note: tested(allows) + (extra ? `. ${extra}` : "") });

  (root.PaintDB.systems = root.PaintDB.systems || []).push(
    // ---- C2 (p.7). The High chart's C2.05/1*, /2*, /3* are the same builds as C2.06/1, /2, /3 below.
    X("C2.06/1", "C2", "VH", [SF(150)], "High (Very high needs 2 coats, 180 um)", "Also listed as C2.05/1* (High, Annex B compliant)"),
    X("C2.06/2", "C2", "VH", [PSX(125)], "High (Very high needs 2 coats, 180 um)", "Also listed as C2.05/2* (High, Annex B compliant); PSX 700 direct to blasted steel"),
    X("C2.06/3", "C2", "VH", [SF(100), H(50)], "High (Very high needs 180 um)", "Also listed as C2.05/3* (High, Annex B compliant)"),
    A("C2.06/4", "C2", "VH", [SF(60), PSX(125)]),

    // ---- C3 (p.8). The Medium chart's C3.05/1*, /2*, /3* equal C3.06/1, /2, /3; C3.06/4* equals C3.07/3.
    X("C3.06/1", "C3", "H", [SF(150)], "Medium (High needs 2 coats, 180 um)", "Also listed as C3.05/1* (Medium, Annex B compliant)"),
    X("C3.06/2", "C3", "H", [PSX(125)], "Medium (High needs 2 coats, 180 um)", "Also listed as C3.05/2* (Medium, Annex B compliant); PSX 700 direct to blasted steel"),
    X("C3.06/3", "C3", "H", [SF(100), H(50)], "Medium (High needs 180 um)", "Also listed as C3.05/3* (Medium, Annex B compliant)"),
    X("C3.07/1", "C3", "VH", [SF(100), SF(100)], "High (Very high needs 240 um)"),
    X("C3.07/2", "C3", "VH", [SF(170), H(50)], "High (Very high needs 240 um)"),
    X("C3.07/3", "C3", "VH", [SF(60), PSX(125)], "High (Very high needs 240 um)", "Also listed as C3.06/4* (High, Annex B compliant)"),
    A("C3.07/4", "C3", "VH", [AL(175), US(75)]),
    A("C3.07/5", "C3", "VH", [AL(175), PSX(75)]),
    X("C3.10/1", "C3", "VH", [SZ(50), PSX(100)], "Medium (zinc-rich primer: High needs 160 um, Very high 200 um)"),

    // ---- C4 (p.9-10). The Low chart's C4.04/1*, /2*, /3* equal C4.05/1, /2, /3; C4.05/4* equals C4.06/3.
    X("C4.05/1", "C4", "M", [SF(150)], "Low (Medium needs 2 coats, 180 um)", "Also listed as C4.04/1* (Low, Annex B compliant)"),
    X("C4.05/2", "C4", "M", [PSX(125)], "Low (Medium needs 2 coats, 180 um)", "Also listed as C4.04/2* (Low, Annex B compliant); PSX 700 direct to blasted steel"),
    X("C4.05/3", "C4", "M", [SF(100), H(50)], "Low (Medium needs 180 um)", "Also listed as C4.04/3* (Low, Annex B compliant). The chart prints 1 coat for this two-coat build"),
    X("C4.06/1", "C4", "H", [SF(100), SF(100)], "Medium (High needs 240 um)"),
    X("C4.06/2", "C4", "H", [SF(170), H(50)], "Medium (High needs 240 um)",
      "The chart marks it * (Annex B compliant), but 220 um is short of the 240 um Annex B sets for C4 High, so it is counted as tested"),
    X("C4.06/3", "C4", "H", [SF(60), PSX(125)], "Medium (High needs 240 um)", "Also listed as C4.05/4* (Medium, Annex B compliant)"),
    A("C4.06/4", "C4", "H", [AL(175), US(75)]),
    A("C4.06/5", "C4", "H", [AL(175), PSX(75)]),
    X("C4.10/1", "C4", "H", [SZ(50), PSX(100)], "Low (zinc-rich primer: Medium needs 160 um, High 200 um)"),
    X("C4.07/1", "C4", "VH", [SF(125), SF(125)], "High (Very high needs 300 um)"),
    X("C4.07/2", "C4", "VH", [SF(200), H(80)], "High (Very high needs 300 um)"),
    A("C4.07/3", "C4", "VH", [SF(120), SF(120), H(80)]),
    X("C4.07/4", "C4", "VH", [SH(300)], "Low (Medium and above need at least 2 coats)", "Single coat of Sigmashield 880"),
    A("C4.11/1", "C4", "VH", [SZ(50), SF(160), D(50)]),
    A("C4.11/2", "C4", "VH", [SZ(50), SC(160), D(50)], "Intermediate coat is the MIO grade of Sigmacover 410 (EP MIO)"),
    X("C4.11/3", "C4", "VH", [SZ(75), PSX(125)], "High (zinc-rich primer: Very high needs 3 coats, 260 um)"),

    // ---- C5 (p.11-12). C5.01/4* equals C5.02/5; C5.02/2* equals C5.03/1; C5.02/4* equals C5.03/2.
    X("C5.01/1", "C5", "L", [SF(150)], "nothing (Low needs 2 coats, 180 um)"),
    X("C5.01/2", "C5", "L", [PSX(125)], "nothing (Low needs 2 coats, 180 um)", "PSX 700 direct to blasted steel"),
    X("C5.01/3", "C5", "L", [SF(100), H(50)], "nothing (Low needs 180 um)"),
    X("C5.02/1", "C5", "M", [SF(100), SF(100)], "Low (Medium needs 240 um)"),
    X("C5.02/3", "C5", "M", [SF(170), H(50)], "Low (Medium needs 240 um)"),
    X("C5.02/5", "C5", "M", [SF(60), PSX(125)], "Low (Medium needs 240 um)", "Also listed as C5.01/4* (Low, Annex B compliant)"),
    A("C5.02/6", "C5", "M", [AL(175), US(75)]),
    A("C5.02/7", "C5", "M", [AL(175), PSX(75)]),
    X("C5.06/1", "C5", "M", [SZ(50), PSX(100)], "nothing (zinc-rich primer: Low needs 160 um)"),
    X("C5.03/1", "C5", "H", [SF(125), SF(125)], "Medium (High needs 300 um)",
      "Also listed as C5.02/2* (Medium, Annex B compliant). The chart prints 1 coat for this two-coat build"),
    X("C5.03/2", "C5", "H", [SF(200), H(80)], "Medium (High needs 300 um)",
      "Also listed as C5.02/4* (Medium, Annex B compliant). The chart prints 1 coat for this two-coat build"),
    A("C5.03/3", "C5", "H", [SF(120), SF(120), H(80)], "The chart prints 1 coat for this three-coat build"),
    X("C5.03/4", "C5", "H", [SH(300)], "nothing (Low needs 2 coats)", "Single coat of Sigmashield 880"),
    A("C5.07/1", "C5", "H", [SZ(50), SF(160), D(50)]),
    A("C5.07/2", "C5", "H", [SZ(50), SC(160), D(50)], "Intermediate coat is the MIO grade of Sigmacover 410 (EP MIO)"),
    X("C5.07/3", "C5", "H", [SZ(75), PSX(125)], "Medium (zinc-rich primer: High needs 3 coats, 260 um)"),
    A("C5.08/1", "C5", "VH", [SZ(50), SF(220), D(50)]),
    A("C5.08/2", "C5", "VH", [SZ(50), SC(220), D(50)]),
    A("C5.08/3", "C5", "VH", [DC(50), SF(220), D(50)], "Primer is Dimetcote 9, an ethyl silicate zinc (ESI)"),
    A("C5.08/4", "C5", "VH", [DC(50), SC(200), H(70)], "Primer is Dimetcote 9, an ethyl silicate zinc (ESI)")
  );
})(typeof globalThis !== "undefined" ? globalThis : window);
