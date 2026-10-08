/* ISO 12944 corrosivity categories, durability classes and the coating layer plan for each combination.
 *
 * WHAT IS HERE
 *  - categories: ISO 12944-2 atmospheric corrosivity categories C1-CX with typical environments.
 *  - durability: ISO 12944-1 durability ranges (time to first major maintenance, not a guarantee).
 *  - systems: for each category + durability, a PRIMER / MID COAT / FINISH plan with the number of coats and
 *    dry film thickness (DFT) per coat, plus `refNdft`, the reference total nominal DFT (NDFT) it is judged against.
 *
 * WHAT YOU MUST KNOW BEFORE USING IT
 *  ISO 12944-5 is a paid standard and its tables could not be read directly. `refNdft` therefore carries a
 *  `basis` that says how far to trust it:
 *    "B2-summary"  minimum NDFT for epoxy/PUR/zinc-silicate systems on blast-cleaned steel, as reported in
 *                  secondary summaries of ISO 12944-5 Annex B Table B.2. Not checked against the standard text.
 *    "indicative"  no verified Annex B figure; set from supplier-published or tested C5 systems (about
 *                  260-360 um) and Hempel's ISO 12944 FAQ (C5 Very High = 320 um).
 *    "part9"       ISO 12944-9 offshore CX: >= 280 um, >= 3 coats, zinc-rich primer >= 40 um (single durability: High).
 *  The layer plans are generic, supplier-neutral builds chosen so that (a) total NDFT meets or exceeds `refNdft`
 *  and (b) each coat sits inside the recommended DFT range of the products in paints.js. They are not the
 *  certified systems of any supplier. For a tender or specification, use the supplier's ISO 12944-6 certified
 *  system and the DFTs in your copy of ISO 12944-5. Everything is editable in the app.
 *
 * NOT COVERED: C1 (ISO 12944 prescribes no system; heated, clean interiors), immersion Im1-Im4, low durability
 * for C2/C3 (alkyd/acrylic systems), galvanized or metal-sprayed substrates, stripe coats (add an allowance).
 */
(function (root) {
  root.PaintDB = root.PaintDB || {};

  const layer = (role, type, coats, dft) => ({ role, type, coats, dft });
  const P = (type, dft) => layer("primer", type, 1, dft);
  const M = (type, coats, dft) => layer("mid", type, coats, dft);
  const F = (dft) => layer("finish", "PUR", 1, dft);

  // short builds: epoxy primer + finish; epoxy primer + epoxy mid coat + finish; zinc + epoxy + finish
  const EP2 = [P("EP", 80), F(60)];
  const EP3 = [P("EP", 80), M("EP", 1, 80), F(60)];
  const ZN3 = [P("ZN", 60), M("EP", 1, 125), F(60)];
  const ZN4 = [P("ZN", 60), M("EP", 2, 100), F(60)];
  const ZN4H = [P("ZN", 60), M("EP", 2, 120), F(60)];

  root.PaintDB.iso12944 = {
    standard: "ISO 12944",
    surfacePrep: "Abrasive blast to Sa 2½ (ISO 8501-1), medium (G) profile Rz 50-85 µm (ISO 8503)",
    durability: {
      L: { label: "Low", years: "2–7 years" },
      M: { label: "Medium", years: "7–15 years" },
      H: { label: "High", years: "15–25 years" },
      VH: { label: "Very high", years: "over 25 years" }
    },
    categories: [
      { id: "C2", name: "Low", steelLoss: "1.3–25 µm/yr",
        inside: "Unheated buildings where condensation can occur (depots, sports halls).",
        outside: "Low pollution, mostly rural areas." },
      { id: "C3", name: "Medium", steelLoss: "25–50 µm/yr",
        inside: "Production rooms with high humidity and some air pollution (food plants, laundries, breweries, dairies).",
        outside: "Urban and industrial atmospheres with moderate SO₂ pollution; coastal areas with low salinity." },
      { id: "C4", name: "High", steelLoss: "50–80 µm/yr",
        inside: "Chemical plants, swimming pools, coastal ship and boat yards.",
        outside: "Industrial areas and coastal areas with moderate salinity." },
      { id: "C5", name: "Very high", steelLoss: "80–200 µm/yr",
        inside: "Buildings or areas with almost permanent condensation and high pollution.",
        outside: "Industrial areas with high humidity and an aggressive atmosphere; coastal and offshore areas with high salinity." },
      { id: "CX", name: "Extreme", steelLoss: "200–700 µm/yr",
        inside: "Areas with almost permanent condensation and extreme pollution.",
        outside: "Offshore areas with high salinity; industrial areas with extreme humidity and an aggressive atmosphere; subtropical and tropical atmospheres. ISO 12944-9 applies." }
    ],
    systems: [
      { cat: "C2", dur: "H",  refNdft: 120, basis: "B2-summary", layers: EP2 },
      { cat: "C2", dur: "VH", refNdft: 180, basis: "B2-summary", layers: EP3 },
      { cat: "C3", dur: "M",  refNdft: 120, basis: "B2-summary", layers: EP2 },
      { cat: "C3", dur: "H",  refNdft: 180, basis: "B2-summary", layers: EP3 },
      { cat: "C3", dur: "VH", refNdft: 240, basis: "B2-summary", layers: ZN3 },
      { cat: "C4", dur: "L",  refNdft: 120, basis: "B2-summary", layers: EP2 },
      { cat: "C4", dur: "M",  refNdft: 180, basis: "B2-summary", layers: EP3 },
      { cat: "C4", dur: "H",  refNdft: 240, basis: "B2-summary", layers: ZN3 },
      { cat: "C4", dur: "VH", refNdft: 300, basis: "B2-summary", layers: ZN4 },
      { cat: "C5", dur: "M",  refNdft: 240, basis: "indicative", layers: ZN3 },
      { cat: "C5", dur: "H",  refNdft: 320, basis: "indicative", layers: ZN4 },
      { cat: "C5", dur: "VH", refNdft: 360, basis: "indicative", layers: ZN4H },
      { cat: "CX", dur: "H",  refNdft: 280, basis: "part9",      layers: ZN4 }
    ],
    basisNotes: {
      "B2-summary": "Minimum NDFT for epoxy/PUR/zinc-silicate systems on blast-cleaned steel, as reported in secondary summaries of ISO 12944-5 Annex B (Table B.2). Not verified against the standard text.",
      "indicative": "No verified ISO 12944-5 figure was available. Set from supplier-published and tested C5 systems (about 260–360 µm) and Hempel's ISO 12944 FAQ (C5 Very High = 320 µm). Treat as a conservative estimate.",
      "part9": "ISO 12944-9 offshore CX: at least 280 µm and 3 coats, zinc-rich primer at least 40 µm. CX has a single durability class (High)."
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
