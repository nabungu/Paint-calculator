/* Hempel products used in the Hempel paint systems (systems-hempel.js): volume solids and recommended DFT per coat.
 *
 * Fields as in paints.js: vs = volume solids, % (ISO 3233); dftMin / dftMax = recommended DFT per coat, um
 * (Hempel's "specification range" low / high). Theoretical spreading rate (m2/L) = vs x 10 / DFT; where a source
 * quoted spreading rates they were checked against this.
 *
 * SOURCES AND LIMITS. hempel.com could not be opened while building this file (the network proxy refuses it), so the
 * figures come from web-search extracts of Hempel product data sheets (PDS) and distributor or retailer copies of
 * them (Promain, Rawlins Paints, Corrotech, Nilkamal and others). Each product's `source` says what was seen and
 * how sure it is. Hempel revises its data sheets often, solids differ by shade (MIO, aluminium and white shades
 * especially), and several products exist in regional variants (e.g. Hempathane HS 55610 / 5561B), so CHECK EVERY
 * PRODUCT AGAINST HEMPEL'S CURRENT DATA SHEET before ordering.
 *
 * Type codes (paints.js): ZN covers Hempel's activated zinc (AZ, Avantguard) and inorganic zinc silicate (IOZ,
 * Galvosil) primers; PA polyaspartic; PS polysiloxane. Order within a type is the order of preference used when
 * another supplier's system is filled with Hempel products (the first product whose DFT range fits is chosen).
 */
(function (root) {
  const P = root.PaintDB.paints;
  P.suppliers.push({
    id: "hempel",
    name: "Hempel",
    short: "Hempel",
    products: [
      // ---- zinc primers (ZN)
      { id: "hempel-avantguard-750", name: "Hempadur Avantguard 750", type: "ZN", chem: "Activated zinc epoxy primer",
        vs: 65, dftMin: 40, dftMax: 100,
        source: "Hempadur Avantguard 750 (1736G) PDS, 2022 and 2025/2026 issues via search extracts and a Rawlins Paints listing: VS 65 +/-2 %, DFT 40-100 um (60 recommended), 16 / 6.5 / 11 m2/L at 40 / 100 / 60 um (consistent with 65 %). A 2016 sheet gave 50-100 um. Not to be confused with Avantguard 750 Pro (1737G)." },
      { id: "hempel-avantguard-550", name: "Hempadur Avantguard 550", type: "ZN", chem: "Activated zinc epoxy primer",
        vs: 65, dftMin: 40, dftMax: 100,
        source: "Hempadur Avantguard 550 (1734G) PDS, Nov 2024 issue via search extracts; distributor copies agree: VS 65 +/-2 % (older sheets +/-1), DFT 40-100 um (60 recommended), 16 / 6.5 / 11 m2/L at 40 / 100 / 60 um." },
      { id: "hempel-avantguard-770", name: "Hempadur Avantguard 770", type: "ZN", chem: "Activated zinc epoxy primer",
        vs: 66, dftMin: 40, dftMax: 100,
        source: "Hempadur Avantguard 770 PDS, Aug 2024 issue via search extracts (Promain, Paccoat copies): VS 66 +/-2 %, DFT 40-100 um (60 recommended); the 2021 and 2023 issues gave 40-90 um; about 11 m2/L at 60 um. NOTE the brochure's CX row HEM CX-H-06 applies it at 120 um, above this range." },
      { id: "hempel-avantguard-860", name: "Hempadur Avantguard 860", type: "ZN", chem: "Activated zinc epoxy primer",
        vs: 66, dftMin: 40, dftMax: 60,
        source: "Hempadur Avantguard 860 (17990): VS 66 +/-2 % from a Corrotech distributor listing (several years old); Hempel's EU product brochure gives 11.3 m2/L at 60 um (which implies about 68 %). No PDS specification range was found: 40-60 um is the range of DFTs Hempel's ISO 12944 brochure uses for it, not a data-sheet range." },
      { id: "hempel-galvosil-15700", name: "Hempel's Galvosil 15700", type: "ZN", chem: "Inorganic zinc silicate (IOZ), solvent-borne",
        vs: 64, dftMin: 50, dftMax: 100,
        source: "Hempel's Galvosil 15700 PDS (2022 and 2026 issues via search extracts; Promain, Rawlins copies): VS 64 +/-2 % (older +/-1), DFT 50-100 um (50 recommended), 13 / 6.4 m2/L at 50 / 100 um; never locally above 125 um; 50-80 um under heavy-duty topcoats." },
      // ---- epoxies (EP)
      { id: "hempel-hempaprime-multi-500", name: "Hempaprime Multi 500", type: "EP", chem: "Fast-drying high-solids epoxy primer / intermediate",
        vs: 85, dftMin: 100, dftMax: 250,
        source: "Hempaprime Multi 500 (45950) PDS, 2021-2026 issues via search extracts; Corrotech agrees: VS 85 +/-2 % for standard shades, 8.5 / 3.4 m2/L at 100 / 250 um, 5.6-5.7 m2/L at 150 um, so DFT 100-250 um. MIO shades (18021, 18061) are 82 +/-2 % on the 2026 sheet (77 % on NBS Source). The brochure also uses it at 80 um (C3 Medium row 7, p.24), below this range; that row is not in systems-hempel.js (it needs Hemuthane WB Top)." },
      { id: "hempel-hempadur-speed-dry-zp-500", name: "Hempadur Speed-Dry ZP 500", type: "EP", chem: "Fast-drying epoxy, zinc phosphate",
        vs: 75, dftMin: 70, dftMax: 150,
        source: "Hempadur Speed-Dry ZP 500 (17500) PDS, Mar 2024 issue via search extracts; Corrotech agrees: VS 75 +/-2 %, DFT 70-150 um (125 recommended), 11 / 6 / 5 m2/L at 70 / 125 / 150 um. An older sheet gave 70-200 um." },
      { id: "hempel-hempadur-quattro-xo-17870", name: "Hempadur Quattro XO 17870", type: "EP", chem: "Pure epoxy, high solids (offshore)",
        vs: 80, dftMin: 100, dftMax: 250,
        source: "Hempadur Quattro XO 17870 PDS, Jun 2024 issue via search extracts: VS 80 +/-2 % (aluminium shade 72 +/-2 %), DFT 100-250 um (125 recommended), 6.4 m2/L at 125 um." },
      { id: "hempel-hemudur-18500", name: "Hemudur 18500", type: "EP", chem: "Water-borne epoxy primer / intermediate",
        vs: 50, dftMin: 50, dftMax: 120,
        source: "Hemudur 18500: VS 50 +/-2 % on a Rawlins Paints data listing and Corrotech; DFT 50-120 um (75 recommended), 4.2-10 m2/L, 6.7 m2/L at 75 um (consistent with 50 %). No Hempel-issued PDS was seen. The brochure also uses it at 160 um per coat (C4 High row 11, p.26), above this range; that row is not in systems-hempel.js (it needs Hemuthane WB Top)." },
      { id: "hempel-hempadur-15570", name: "Hempadur 15570", type: "EP", chem: "Epoxy primer (used on hot-dip galvanizing)",
        vs: 54, dftMin: 50, dftMax: 125,
        source: "Hempadur 15570 PDS, Sep 2021 issue via search extracts: VS 54 +/-2 % (one older copy: 55 % for the red shade), DFT 50-125 um (100 recommended), 5.4 m2/L at 100 um." },
      { id: "hempel-hempadur-15553", name: "Hempadur 15553", type: "EP", chem: "Epoxy adhesion primer for galvanized steel and non-ferrous metals",
        vs: 55, dftMin: 50, dftMax: 80,
        source: "Hempadur 15553 PDS via search extracts (Promain, Rawlins copies): VS 55 +/-2 % (older +/-1), DFT 50-80 um (50 recommended). A Knowde listing's 175-250 um is for another product." },
      // ---- polyurethane finishes (PUR)
      { id: "hempel-hempathane-hs-55610", name: "Hempathane HS 55610", type: "PUR", chem: "Aliphatic polyurethane, high solids, gloss",
        vs: 67, dftMin: 50, dftMax: 125,
        source: "Hempathane HS 55610 PDS, 2025 issue (Nilkamal copy) and hempel.com sheet via search extracts: VS 67 +/-2 %, 13 / 5.3 / 8.3 m2/L at the low / high / recommended 80 um, i.e. DFT about 50-125 um; older sheets 6.7 m2/L at 100 um. NOTE the brochure's CX row HEM CX-H-08 applies it at 40 um, below this range. Some copies show a second block of 58 % (a shade or variant) and 2009 sheets 65 %; NBS Source lists 59 %." },
      { id: "hempel-hempathane-fast-dry-55750", name: "Hempathane Fast Dry 55750", type: "PUR", chem: "Fast-drying polyurethane, semi-gloss",
        vs: 65, dftMin: 50, dftMax: 160,
        source: "Hempathane Fast Dry 55750 PDS via search extracts (Rawlins, Deneb, Nonkor copies): VS 65 +/-2 % (one version 63 %), DFT 50-160 um (100 recommended), 6.5 m2/L at 100 um, 4.1-13 m2/L across the range." },
      { id: "hempel-hempathane-hs-5561b", name: "Hempathane HS 5561B", type: "PUR", chem: "Aliphatic polyurethane, high solids (regional variant of HS 55610)",
        vs: 61, dftMin: 50, dftMax: 80,
        source: "Hempathane HS 5561B PDS (Hempel A/S, Mar 2022; distributor copy on IndiaMART): VS 61 +/-2 %, DFT 50-80 um (60 recommended). The same extract shows a second figure of 56 % for an unnamed shade or variant." },
      { id: "hempel-hempathane-topcoat-55210", name: "Hempathane Topcoat 55210", type: "PUR", chem: "Acrylic polyurethane, gloss",
        vs: 51, dftMin: 40, dftMax: 80,
        source: "Hempathane Topcoat 55210 PDS, May 2024 issue via search extracts: VS 51 +/-2 %, DFT 40-80 um (50 recommended), 13 / 6.4 / 10 m2/L. An Apr 2022 sheet also lists 48 % (a shade group)." },
      { id: "hempel-hempathane-55930", name: "Hempathane 55930", type: "PUR", chem: "Aliphatic polyurethane",
        vs: 56, dftMin: 30, dftMax: 60,
        source: "Hempathane 55930: VS 56 +/-2 % on Hempel's NBS Source specification data; a Nilkamal copy of the PDS and Corrotech give 58 +/-2 % (the lower figure is used); DFT 30-60 um (50 recommended, Nilkamal copy), about 12 m2/L at 50 um." },
      { id: "hempel-hemuthane-enamel", name: "Hemuthane Enamel 58510", type: "PUR", chem: "Water-borne two-component polyurethane enamel",
        vs: 49, dftMin: 30, dftMax: 60,
        source: "Hemuthane Enamel 58510: VS 49 +/-2 % from a Corrotech distributor listing; Hempel PDS (Portuguese issue, Oct 2025, via search extract) gives DFT 30-60 um (40 recommended) with WFT 61-122 um (81 recommended), a DFT/WFT ratio of 49 %, which confirms the solids. Never locally above 80 um. The brochure calls it \"Hemuthane Enamel\"." },
      // ---- acrylic finishes and one-coat acrylics (AY)
      { id: "hempel-pro-acrylic", name: "Hempel's Pro Acrylic", type: "AY", chem: "Acrylic finish, solvent-borne, non-isocyanate",
        vs: 58, dftMin: 50, dftMax: 120,
        source: "Hempel's Pro Acrylic (55883) PDS, Dec 2023 issue (Promain copy) via search extracts: VS 58 +/-2 % white, 52 +/-2 % aluminium grey (Rawlins lists 57 %), DFT 50-120 um (50 recommended). An older Promain listing gives 54 +/-1 % and 50-100 um. Darker or aluminium shades need up to about 10 % more paint than calculated here." },
      { id: "hempel-hemucryl-48120", name: "Hemucryl 48120", type: "AY", chem: "Water-borne acrylic, primer and finish",
        vs: 42, dftMin: 60, dftMax: 120,
        source: "Hemucryl 48120 PDS (Nilkamal Paints copy, via search extract): VS 42 +/-2 %, DFT 60-120 um (80 recommended), 7.1 / 3.5 / 5.3 m2/L at 60 / 120 / 80 um (consistent with 42 %). No hempel.com copy was seen." },
      { id: "hempel-hempatex-hi-build-46410", name: "Hempatex Hi-Build 46410", type: "AY", chem: "Physically drying acrylic, high build",
        vs: 42, dftMin: 50, dftMax: 125,
        source: "Hempatex Hi-Build 46410 PDS via search extracts (Hempel sheet, NBS Source, Corrotech): VS 42 +/-2 % (aluminium grey 40-41 %), DFT 50-125 um (100 recommended), 8.3 / 3.3 / 4.2 m2/L." },
      { id: "hempel-hempatex-enamel-56360", name: "Hempatex Enamel 56360", type: "AY", chem: "Physically drying acrylic enamel",
        vs: 32, dftMin: 25, dftMax: 55,
        source: "Hempatex Enamel 56360 PDS via search extracts (Promain, ShipServ, Paint Traders copies; Corrotech agrees): VS 32 +/-2 % (black 31, orange 33), DFT 25-55 um (35 recommended), 13 / 5.8 / 9.1 m2/L." },
      // ---- polysiloxane finish (PS)
      { id: "hempel-hempaxane-light", name: "Hempaxane Light 55030", type: "PS", chem: "Acrylic polysiloxane, gloss, non-isocyanate",
        vs: 83, dftMin: 50, dftMax: 100,
        source: "Hempaxane Light 55030 PDS via search extracts (Hempel sheet, NBS Source; Nilkamal, Rawlins copies): VS 83 +/-2 % (Promain and IndiaMART list 82 %), DFT 50-100 um (75 recommended), WFT 60-120 um. The brochure calls it \"Hempaxane Light\"." }
      // Not included, because no volume solids could be found (hempel.com unreachable; no copy surfaced in searches):
      //   Hempatop Direct 700 (55970, polyaspartic), Hempaprime Core 670 (epoxy), Hemucryl 48190 / 48191 (water-borne
      //   acrylic), Hemuthane WB Top 58530 / 58531 (water-borne PUR). The brochure systems that need them are left out
      //   of systems-hempel.js.
    ]
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
