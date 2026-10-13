/* Paint products by supplier: volume solids and recommended dry film thickness (DFT) per coat.
 *
 * Quantities are driven by two numbers per product:
 *   vs      volume solids, % (mixed product, ISO 3233 / ASTM D2697)
 *   dftMin / dftMax   recommended DFT per coat, micrometres (um)
 * Theoretical coverage (m2/L) = vs x 10 / DFT(um); this is the relationship every data sheet below follows.
 *
 * `type` links a product to a layer of a paint system (see systems.js) and decides which ISO 12944-5
 * Annex B column the system is judged under (the primer's type picks the column):
 *   ZN  zinc-rich primer, Zn (R)   EP  epoxy   PUR  polyurethane finish
 *   AK  alkyd primer               AY  alkyd / acrylic finish
 * For each supplier the order of products within a type is the order of preference: the first product
 * whose [dftMin, dftMax] contains the specified DFT is chosen by default (the user can change it).
 * Jotun systems name their own products (systems.js); other suppliers' products are substituted by type.
 *
 * SOURCES AND LIMITS. Supplier sites could not be opened directly while building this database, so the
 * values were collected from search-engine extracts of the technical/product data sheets (TDS/PDS) and
 * distributor copies of them. Each product's `source` says what was seen. Data sheets are revised often,
 * and several products exist in variants with different solids (e.g. Carbothane 134 / HP / HS / HG), so
 * CHECK EVERY PRODUCT AGAINST THE SUPPLIER'S CURRENT DATA SHEET before ordering. Add or correct a
 * product by editing this file; nothing else needs to change.
 */
(function (root) {
  root.PaintDB = root.PaintDB || {};
  root.PaintDB.paints = {
    layerTypes: {
      ZN: "Zinc-rich primer",
      EP: "Epoxy",
      PUR: "Polyurethane finish",
      AK: "Alkyd primer",
      AY: "Alkyd / acrylic finish",
      PS: "Polysiloxane finish",
      PA: "Polyaspartic finish"
    },
    suppliers: [
      {
        id: "jotun",
        name: "Jotun",
        short: "Jotun",
        products: [
          // ---- products named in Jotun's "ISO 12944 Coating Selector, Revision 2" (the systems in systems.js)
          { id: "jotun-barrier-80", name: "Barrier 80", type: "ZN", chem: "Zinc-rich epoxy (polyamide cured)",
            vs: 61, dftMin: 50, dftMax: 100,
            source: "Barrier 80 TDS copies: VS 61 +/-2 % (Barrier 80 S, a different variant, is 67 %). The coating selector specifies it at 50-80 um; listings for the S version give 60-100 um. Confirm the per-coat range on the current TDS." },
          { id: "jotun-barrier", name: "Barrier", type: "ZN", chem: "Zinc-rich epoxy",
            vs: 53, dftMin: 60, dftMax: 75,
            source: "Barrier TDS copies (2015-2016): VS 53 +/-2 %, NORSOK M-501 system 1 prequalified. The 60-75 um range is the film build in Jotun's ISO 12944-9 tested systems, not a TDS range." },
          { id: "jotun-penguard-hsp-zp", name: "Penguard HSP ZP", type: "EP", chem: "High-build epoxy, zinc phosphate",
            vs: 73, dftMin: 60, dftMax: 200,
            source: "Penguard HSP ZP TDS (2021, 2024 copies): VS 73 +/-2 % (ISO 3233). The selector lists it as 'Penguard HSP ZP or Penguard Express ZP'; no solids figure was found for Express ZP. The 60-200 um range is how the selector uses it, not a TDS range." },
          { id: "jotun-penguard-hb", name: "Penguard HB", type: "EP", chem: "High-build epoxy (primer on galvanized steel)",
            vs: 54, dftMin: 80, dftMax: 150,
            source: "Penguard HB TDS (undated Jotun copy): VS 54 +/-2 %, DFT 80-150 um, 6.8-3.6 m2/L." },
          { id: "jotun-penguard-pro", name: "Penguard Pro", type: "EP", chem: "Epoxy for immersion",
            vs: 75, dftMin: 100, dftMax: 500,
            source: "Penguard Pro: VS 75 % DERIVED from a retailer's 7.5-1.5 m2/L at 100-500 um DFT (both ends give 75 %); no TDS solids line was seen." },
          { id: "jotun-penguard-pro-gf", name: "Penguard Pro GF", type: "EP", chem: "Glass-flake epoxy",
            vs: 75, dftMin: 175, dftMax: 300,
            source: "Penguard Pro GF TDS: VS 75 +/-2 % (ISO 3233). 175-300 um is the film build in Jotun's ISO 12944-9 tested systems." },
          { id: "jotun-penguard-universal", name: "Penguard Universal", type: "EP", chem: "High-build epoxy",
            vs: 72, dftMin: 75, dftMax: 300,
            source: "Penguard Universal EPD listing: VS 72 +/-2 %, DFT 75-300 um, 9.6-2.4 m2/L." },
          { id: "jotun-hardtop-ax", name: "Hardtop AX", type: "PUR", chem: "Aliphatic acrylic polyurethane",
            vs: 63, dftMin: 50, dftMax: 100,
            source: "Hardtop AX TDS (Feb 2025, via extracts) and EPD: VS 63 +/-2 %, DFT 50-100 um, 13-6.3 m2/L." },
          { id: "jotun-pilot-qd-primer", name: "Pilot QD Primer", type: "AK", chem: "Alkyd primer, zinc phosphate",
            vs: 56, dftMin: 40, dftMax: 125,
            source: "Pilot QD Primer TDS: VS 56 +/-2 %, DFT 40-125 um (typ. 75), 14-4.5 m2/L." },
          { id: "jotun-pilot-ii", name: "Pilot II", type: "AY", chem: "Alkyd topcoat",
            vs: 48, dftMin: 40, dftMax: 60,
            source: "Pilot II TDS (Mar 2018): VS 48 +/-2 %. The 40-60 um range is how the selector uses it, not a TDS range." },
          { id: "jotun-pioner-topcoat", name: "Pioner Topcoat", type: "AY", chem: "Acrylic topcoat",
            vs: 34, dftMin: 40, dftMax: 60,
            source: "Pioner Topcoat EPD listing: VS 34 +/-2 % (third-party LCA database, not the TDS). The 40-60 um range is how the selector uses it." },
          // ---- other Jotun products
          { id: "jotun-barrier-77", name: "Barrier 77", type: "ZN", chem: "Zinc-rich epoxy (polyamide cured)",
            vs: 53, dftMin: 25, dftMax: 75, dftTyp: 50,
            source: "Barrier 77 TDS, 2005/2011 issues (distributor copies): VS 53 +/-2 %, 25-75 um (typ. 50). One retailer lists it as discontinued: confirm availability." },
          { id: "jotun-jotamastic-90", name: "Jotamastic 90", type: "EP", chem: "Surface-tolerant epoxy mastic",
            vs: 80, dftMin: 100, dftMax: 300, dftTyp: 125,
            source: "Jotamastic 90 TDS (distributor copy): VS 80 +/-2 %, DFT 100-300 um, 8-2.7 m2/L; the TDS gives the same figures for the winter grade (WG). Tested by Norner to ISO 12944-6:2018 under Hardtop XP (C4 High, C5 Very High)." },
          { id: "jotun-penguard-express", name: "Penguard Express", type: "EP", chem: "Fast-drying high-solids epoxy",
            vs: 74, dftMin: 75, dftMax: 250, dftTyp: 125,
            source: "Penguard Express EPD/TDS listing: VS 74 +/-2 %, DFT 75-250 um, 9.9-3 m2/L." },
          { id: "jotun-hardtop-xp", name: "Hardtop XP", type: "PUR", chem: "Aliphatic acrylic polyurethane",
            vs: 63, dftMin: 50, dftMax: 100,
            source: "Hardtop XP TDS (distributor copies): VS 63 +/-2 %, DFT 50-100 um, 12.6-6.3 m2/L." },
          { id: "jotun-hardtop-flexi", name: "Hardtop Flexi", type: "PUR", chem: "Aliphatic polyurethane",
            vs: 64, dftMin: 50, dftMax: 150,
            source: "Hardtop Flexi TDS (2018/2024 issues, distributor copies): VS 64 +/-2 %, DFT about 50-150 um (table text was garbled; matched to columns by position)." },
          { id: "jotun-hardtop-as", name: "Hardtop AS", type: "PUR", chem: "Acrylic polyurethane",
            vs: 50, dftMin: 40, dftMax: 60, dftTyp: 50,
            source: "Hardtop AS TDS (undated distributor copy): VS 50 +/-2 %, DFT 40-60 um, 12.5-8.3 m2/L. No official jotun.com sheet was seen." }
        ]
      },
      {
        id: "carboline",
        name: "Carboline (Carboguard / Carbozinc / Carbothane)",
        short: "Carboline",
        products: [
          { id: "carboline-carbozinc-11", name: "Carbozinc 11", type: "ZN", chem: "Self-curing inorganic zinc silicate",
            vs: 62, dftMin: 50, dftMax: 75,
            source: "Carbozinc 11 PDS (Oct 2019 and Mar 2026 revisions): VS 62.3 +/-2 %, DFT 50-75 um (above 150 um not recommended)." },
          { id: "carboline-carbozinc-11-hs", name: "Carbozinc 11 HS", type: "ZN", chem: "Inorganic zinc silicate, high solids",
            vs: 75, dftMin: 51, dftMax: 76,
            source: "Carbozinc 11 HS PDS (Feb 2025): VS 75 +/-2 %, DFT 51-76 um." },
          { id: "carboline-carboguard-893", name: "Carboguard 893", type: "EP", chem: "Cycloaliphatic amine epoxy",
            vs: 77, dftMin: 76, dftMax: 152,
            source: "Carboguard 893 PDS (Feb 2022 / Jul 2026): VS 77 +/-2 % (a retailer listing agrees), DFT 76 um mild / 102-152 um harsher service, 250 um single-coat limit. Primer/intermediate only: needs a PUR finish outdoors." },
          { id: "carboline-carboguard-893-sg-mio", name: "Carboguard 893 SG MIO", type: "EP", chem: "Epoxy, micaceous iron oxide",
            vs: 64, dftMin: 76, dftMax: 127,
            source: "Carboguard 893 SG MIO PDS (Aug 2023): VS 64 +/-2 %, DFT 76-127 um per coat. (A retailer page for a different 'Carboguard 893 MIO' lists 80 %: do not mix them up.)" },
          { id: "carboline-carbothane-134-hg", name: "Carbothane 134 HG", type: "PUR", chem: "Aliphatic acrylic polyurethane, high gloss",
            vs: 70, dftMin: 51, dftMax: 76,
            source: "Carbothane 134 HG PDS (Apr 2022): VS 70 +/-2 %, DFT 51-76 um per coat." },
          { id: "carboline-carbothane-134-hs", name: "Carbothane 134 HS", type: "PUR", chem: "Aliphatic acrylic polyurethane, high solids",
            vs: 66, dftMin: 51, dftMax: 100,
            source: "Carbothane 134 HS PDS (Nov 2023): VS 66 +/-2 %; more than about 100 um per coat not recommended." }
        ]
      },
      {
        id: "ppg",
        name: "PPG (Sigma / Amercoat)",
        short: "PPG",
        products: [
          { id: "ppg-sigmazinc-68-gp", name: "Sigmazinc 68 GP", type: "ZN", chem: "Zinc-rich epoxy",
            vs: 68, dftMin: 50, dftMax: 150,
            source: "Sigmazinc 68 GP PDS (distributor copy): VS 68 +/-2 %, recommended DFT 50-150 um, 13.6 m2/L at 50 um. PPG states certification up to C5 VH and CX in a system." },
          { id: "ppg-sigmafast-278", name: "Sigmafast 278", type: "EP", chem: "Zinc phosphate epoxy primer / build coat",
            vs: 80, dftMin: 75, dftMax: 250,
            source: "Sigmafast 278 PDS (Feb 2022 distributor copy): VS 80 +/-2 %, DFT 75-250 um. Used in PPG's ISO 12944 selector rows (C4 100 um, C5 200 um). Non-cosmetic areas only." },
          { id: "ppg-sigmacover-410", name: "Sigmacover 410", type: "EP", chem: "Polyamide epoxy, high build",
            vs: 80, dftMin: 75, dftMax: 225,
            source: "Sigmacover 410 PDS (Mar 2025): VS 80 +/-2 %, DFT 75-225 um depending on system (older sheets: 75-200 um)." },
          { id: "ppg-sigmacover-350", name: "Sigmacover 350", type: "EP", chem: "Polyamide epoxy, high build",
            vs: 72, dftMin: 100, dftMax: 150,
            source: "Sigmacover 350 PDS (distributor copy): VS 72 +/-2 % at 20 C, DFT 100-150 um (airless), 5.8 m2/L at 125 um. Resellers list ISO 12944-6 approvals: C4 High at 80 um, C5-I High at 120 um." },
          { id: "ppg-sigmadur-550h", name: "Sigmadur 550 H", type: "PUR", chem: "Aliphatic acrylic polyurethane, high solids",
            vs: 70, dftMin: 50, dftMax: 80,
            source: "Sigmadur 550 H PDS (distributor listing: VS 70 +/-2 %, 14.0 m2/L at 50 um). The 50-80 um range is taken from the film builds in PPG's ISO 12944 selector rows (50 and 80 um); PPG's own recommended range was not seen." },
          { id: "ppg-sigmadur-550", name: "Sigmadur 550", type: "PUR", chem: "Aliphatic acrylic polyurethane",
            vs: 55, dftMin: 50, dftMax: 60,
            source: "Sigmadur 550 PDS (Aug 2022): VS 55 +/-2 %, recommended DFT 50-60 um, 11.0 m2/L at 50 um." }
        ]
      }
    ]
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
