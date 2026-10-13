/* Hot-dip galvanizing reference data: coating minimums, zinc corrosion rates and the notes the galvanizing panel shows.
 *
 * Sources (figures only; the standards' wording is not reproduced):
 *   ISO 1461:2009     Tables 3 and 4 (minimum local and mean coating thickness and mass), 6.2.2 and Annex D (nominal
 *                     coating density 7.2 g/cm3, so g/m2 = um x 7.2), Annex B (venting and draining), 6.3 (renovation).
 *   ISO 9223:2012     first-year corrosion rate of zinc for each corrosivity category, um/a. The same bands are in
 *                     ISO 12944-2 Table 1 and are read from data/iso12944.js (zincUm).
 *   ISO 14713-1:2017  life to first maintenance of a zinc coating = thickness / corrosion rate, using the top and the
 *                     bottom of the category's rate band, with lives over 100 years shown as "> 100 years". The
 *                     standard itself was not available; the method is the one ISO 1461 Annex E points to.
 *   ArcelorMittal, "Corrosion protection of rolled steel sections using hot-dip galvanization": the same rate bands,
 *                     "at least 40 years for 85 um in C3", and the duplex life factor of 1.2 to 1.5.
 *
 * South African equivalents: SANS 121 = ISO 1461, SANS 14713-1 / -2 = ISO 14713-1 / -2, SANS 12944 = ISO 12944.
 */
(function (root) {
  root.PaintDB = root.PaintDB || {};
  root.PaintDB.galvanizing = {
    density: 7.2,          // g/cm3, ISO 1461 6.2.2: coating mass g/m2 = thickness um x 7.2
    lifeCap: 100,          // years; longer lives are shown as "> 100 years" (ISO 14713-1)

    // ISO 1461 Table 3 (not centrifuged) and Table 4 (centrifuged): minimum local and mean coating thickness (um) and
    // the equivalent coating mass (g/m2) as the tables print it.
    // tMin/tMax: steel (or thread diameter) range in mm, lower bound exclusive unless lowIncl.
    bands: [
      { id: "s6", table: 3, label: "Steel > 6 mm", local: 70, mean: 85, massLocal: 505, massMean: 610, tMin: 6, tMax: Infinity },
      { id: "s3", table: 3, label: "Steel > 3 mm to ≤ 6 mm", local: 55, mean: 70, massLocal: 395, massMean: 505, tMin: 3, tMax: 6 },
      { id: "s15", table: 3, label: "Steel ≥ 1.5 mm to ≤ 3 mm", local: 45, mean: 55, massLocal: 325, massMean: 395, tMin: 1.5, tMax: 3, lowIncl: true },
      { id: "s0", table: 3, label: "Steel < 1.5 mm", local: 35, mean: 45, massLocal: 250, massMean: 325, tMin: 0, tMax: 1.5 },
      { id: "c6", table: 3, label: "Castings ≥ 6 mm", local: 70, mean: 80, massLocal: 505, massMean: 575 },
      { id: "c0", table: 3, label: "Castings < 6 mm", local: 60, mean: 70, massLocal: 430, massMean: 505 },
      { id: "th6", table: 4, label: "Centrifuged: threads > 6 mm diameter", local: 40, mean: 50, massLocal: 285, massMean: 360 },
      { id: "th0", table: 4, label: "Centrifuged: threads ≤ 6 mm diameter", local: 20, mean: 25, massLocal: 145, massMean: 180 },
      { id: "cf3", table: 4, label: "Centrifuged: other articles ≥ 3 mm", local: 45, mean: 55, massLocal: 325, massMean: 395 },
      { id: "cf0", table: 4, label: "Centrifuged: other articles < 3 mm", local: 35, mean: 45, massLocal: 250, massMean: 325 }
    ],

    duplexFactor: [1.2, 1.5],   // duplex life = 1.2 to 1.5 x (zinc life + paint life) (ArcelorMittal guide, chapter 9)

    notes: {
      method: "Life to first maintenance ≈ coating thickness ÷ zinc corrosion rate (ISO 14713-1). The rate band is the first-year zinc loss for the category (ISO 9223); the shorter life uses the top of the band, the longer life the bottom. Lives over 100 years are shown as > 100 years.",
      firstYear: "ISO 9223 first-year rates are conservative: ISO 9224 gives lower long-term rates for zinc, and the micro-climate (sheltered pockets, splash, deposits) matters more than the macro-climate. Confirm the category on site; HDGASA publishes guidance on Southern African environments.",
      immersion: "Immersion and buried service (Im1 to Im4) do not map onto the atmospheric zinc rates, so no life is given. Seek specialist advice (the galvanizer or HDGASA) and consider a duplex system: galvanizing plus a paint system for immersion.",
      actual: "ISO 1461 sets minimums only. Reactive steels (silicon + phosphorus in the Sandelin range, or above 0.28 %) and thick sections can take coatings two or three times the minimum, so real zinc pickup and weight can be well above the figure for the thickness entered. Ask the galvanizer for their pickup on your steel.",
      measurement: "Thickness is measured magnetically (ISO 2178 / ISO 2808) on reference areas at least 10 mm from edges and away from cut surfaces; in a dispute the gravimetric test (ISO 1460) decides. Where an article has several steel thicknesses, each thickness range is judged on its own minimum.",
      design: [
        "Vent and drain every hollow section and enclosed space: unvented cavities can explode in the zinc bath (ISO 1461 Annex B; ISO 14713-2 gives hole sizes).",
        "Seal-weld or avoid overlapping surfaces; pickling acid trapped in the gap seeps out later (weld seepage).",
        "Check the size against the galvanizer's bath; long or deep members may need double dipping.",
        "Uncoated or damaged areas up to 0.5 % of the surface (10 cm² each) may be repaired with zinc spray, zinc-rich paint or zinc alloy stick to at least 100 µm (ISO 1461 6.3)."
      ],
      duplex: "Duplex: paint over galvanizing lasts about 1.2 to 1.5 times the sum of the two lives on their own. Sweep-blast or otherwise prepare the zinc as the paint data sheet requires, and tell the galvanizer the work will be painted (no quenching, no passivation; ISO 1461 6.1 note).",
      references: [
        "SANS 121 is ISO 1461: hot-dip galvanized coatings on fabricated articles (local specifications usually quote SANS 121).",
        "SANS 14713-1 / ISO 14713-1: corrosion resistance and life of zinc coatings; SANS 14713-2 / ISO 14713-2: design for hot-dip galvanizing.",
        "ISO 9223 classifies corrosivity (C1 to CX) and gives the zinc rates; ISO 9224 gives long-term rates.",
        "SANS 12944 is ISO 12944: paint systems, including paint over galvanizing (duplex).",
        "HDGASA (Hot Dip Galvanizers Association Southern Africa) publishes local guidance on environments and galvanizing design."
      ]
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
