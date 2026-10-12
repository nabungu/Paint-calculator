/* ISO 12944 reference data: environments, durability classes and the minimum requirements every paint
 * system is checked against.
 *
 * Sources (figures only; the standards' wording is not reproduced):
 *   ISO 12944-2:2017  Table 1 (corrosivity categories, first-year mass/thickness loss), Table 2 (water and soil)
 *   ISO 12944-5:2018  Annex B, Tables B.1 to B.5 (surface preparation; minimum number of coats, MNOC, and
 *                     minimum nominal dry film thickness, NDFT), clauses 5.1 and 7.3
 *   ISO 12944-3:2017  design notes; ISO 12944-4:2017 surface preparation notes
 *   ISO 12944-9 (offshore CX and Im4) was not available: CX/Im4 systems are only those Jotun reports as tested.
 *
 * Requirement cells: { mnoc, ndft } = minimum coats and minimum total NDFT (um);
 *   NONE = the standard sets no minimum (coating is optional at that level, e.g. C2 low);
 *   null = no figure in that column (the column is either reached only through a higher durability, or,
 *          where no higher durability passes, not achievable with that primer type, e.g. alkyd in C5).
 * Columns: carbon steel  zn = zinc-rich primer Zn (R); misc = other primer (EP, PUR, ESI); akay = alkyd/acrylic
 *          galvanized    ep = EP/PUR primer; ay = acrylic
 *          metal spray   all = subsequent coats over the sealer (sealer not counted)
 *          immersion     zn; misc; single = system without a separate primer
 */
(function (root) {
  root.PaintDB = root.PaintDB || {};
  const R = (mnoc, ndft) => ({ mnoc, ndft });
  const NONE = "none";

  root.PaintDB.iso12944 = {
    NONE,
    durabilities: ["L", "M", "H", "VH"],
    durability: {
      L: { label: "Low", years: "up to 7 years" },
      M: { label: "Medium", years: "7 to 15 years" },
      H: { label: "High", years: "15 to 25 years" },
      VH: { label: "Very high", years: "more than 25 years" }
    },

    substrates: [
      { id: "carbon", name: "Carbon steel (blast-cleaned)", table: "Table B.2" },
      { id: "hdg", name: "Hot-dip galvanized (ISO 1461)", table: "Table B.3" },
      { id: "tsm", name: "Thermal-sprayed metal (ISO 2063)", table: "Table B.4" }
    ],

    // ISO 12944-2 Table 1 (first-year loss of standard specimens; lower bound exclusive, upper inclusive)
    // and Table 2. Examples are short paraphrases.
    environments: [
      { id: "C1", kind: "atm", name: "Very low", steelGm2: [0, 10], steelUm: [0, 1.3], zincGm2: [0, 0.7], zincUm: [0, 0.1],
        outside: "–", inside: "Heated buildings with clean air: offices, shops, schools, hotels." },
      { id: "C2", kind: "atm", name: "Low", steelGm2: [10, 200], steelUm: [1.3, 25], zincGm2: [0.7, 5], zincUm: [0.1, 0.7],
        outside: "Low pollution, mostly rural areas.", inside: "Unheated buildings where condensation can occur: depots, sports halls." },
      { id: "C3", kind: "atm", name: "Medium", steelGm2: [200, 400], steelUm: [25, 50], zincGm2: [5, 15], zincUm: [0.7, 2.1],
        outside: "Urban and industrial air with moderate SO₂; coasts with low salinity.", inside: "Humid production rooms with some pollution: food plants, laundries, breweries, dairies." },
      { id: "C4", kind: "atm", name: "High", steelGm2: [400, 650], steelUm: [50, 80], zincGm2: [15, 30], zincUm: [2.1, 4.2],
        outside: "Industrial areas and coasts with moderate salinity.", inside: "Chemical plants, swimming pools, coastal ship and boat yards." },
      { id: "C5", kind: "atm", name: "Very high", steelGm2: [650, 1500], steelUm: [80, 200], zincGm2: [30, 60], zincUm: [4.2, 8.4],
        outside: "Humid industrial areas with aggressive air; coasts with high salinity.", inside: "Areas with almost permanent condensation and high pollution." },
      { id: "CX", kind: "part9", name: "Extreme", steelGm2: [1500, 5500], steelUm: [200, 700], zincGm2: [60, 180], zincUm: [8.4, 25],
        outside: "Offshore with high salinity; industrial areas with extreme humidity and aggressive air; subtropical and tropical atmospheres.", inside: "Industrial areas with extreme humidity and aggressive air." },
      { id: "Im1", kind: "imm", name: "Fresh water", examples: "River installations, hydro-electric power plants." },
      { id: "Im2", kind: "imm", name: "Sea or brackish water", examples: "Immersed structures without cathodic protection: sluice gates, locks, jetties." },
      { id: "Im3", kind: "imm", name: "Soil", examples: "Buried tanks, steel piles, steel pipes." },
      { id: "Im4", kind: "part9", name: "Sea or brackish water with cathodic protection", examples: "Immersed structures with cathodic protection, e.g. offshore structures." }
    ],

    // ISO 12944-5 Annex B, Tables B.2 to B.5
    minimums: {
      carbon: { // Table B.2, abrasive blast-cleaned steel
        C2: { L: { zn: NONE, misc: NONE, akay: NONE }, M: { zn: null, misc: null, akay: R(1, 100) },
              H: { zn: R(1, 60), misc: R(1, 120), akay: R(1, 160) }, VH: { zn: R(2, 160), misc: R(2, 180), akay: R(2, 200) } },
        C3: { L: { zn: null, misc: null, akay: R(1, 100) }, M: { zn: R(1, 60), misc: R(1, 120), akay: R(1, 160) },
              H: { zn: R(2, 160), misc: R(2, 180), akay: R(2, 200) }, VH: { zn: R(2, 200), misc: R(2, 240), akay: R(2, 260) } },
        C4: { L: { zn: R(1, 60), misc: R(1, 120), akay: R(1, 160) }, M: { zn: R(2, 160), misc: R(2, 180), akay: R(2, 200) },
              H: { zn: R(2, 200), misc: R(2, 240), akay: R(2, 260) }, VH: { zn: R(3, 260), misc: R(2, 300), akay: null } },
        C5: { L: { zn: R(2, 160), misc: R(2, 180), akay: null }, M: { zn: R(2, 200), misc: R(2, 240), akay: null },
              H: { zn: R(3, 260), misc: R(2, 300), akay: null }, VH: { zn: R(3, 320), misc: R(3, 360), akay: null } }
      },
      hdg: { // Table B.3, hot-dip galvanized steel
        C2: { L: { ep: NONE, ay: NONE }, M: { ep: NONE, ay: NONE }, H: { ep: R(1, 80), ay: R(1, 80) }, VH: { ep: R(1, 120), ay: R(2, 160) } },
        C3: { L: { ep: NONE, ay: NONE }, M: { ep: R(1, 80), ay: R(1, 80) }, H: { ep: R(1, 120), ay: R(2, 160) }, VH: { ep: R(2, 160), ay: R(2, 200) } },
        C4: { L: { ep: R(1, 80), ay: R(1, 80) }, M: { ep: R(1, 120), ay: R(2, 160) }, H: { ep: R(2, 160), ay: R(2, 200) }, VH: { ep: R(2, 200), ay: null } },
        C5: { L: { ep: R(1, 120), ay: R(2, 160) }, M: { ep: R(2, 160), ay: R(2, 200) }, H: { ep: R(2, 200), ay: null }, VH: { ep: R(2, 240), ay: null } }
      },
      tsm: { // Table B.4, thermal-sprayed metal: only high and very high are tabulated
        C3: { L: { all: null }, M: { all: null }, H: { all: R(1, 120) }, VH: { all: R(2, 160) } },
        C4: { L: { all: null }, M: { all: null }, H: { all: R(2, 160) }, VH: { all: R(2, 200) } },
        C5: { L: { all: null }, M: { all: null }, H: { all: R(2, 200) }, VH: { all: R(2, 240) } }
      },
      immersion: { // Table B.5, Im1 to Im3 on blast-cleaned steel; lower durabilities are agreed between the parties
        L: { zn: null, misc: null, single: null }, M: { zn: null, misc: null, single: null },
        H: { zn: R(2, 360), misc: R(2, 380), single: R(1, 400) },
        VH: { zn: R(2, 500), misc: R(2, 540), single: R(1, 600) }
      }
    },

    // ISO 12944-5 Table B.1 and ISO 12944-4
    surfacePrep: {
      carbonZn: "Abrasive blast-clean to Sa 2½ (ISO 8501-1) with a medium (G) profile (ISO 8503-1).",
      carbonOther: "Abrasive blast-clean to Sa 2½ (ISO 8501-1); profile as the primer's data sheet requires.",
      hdg: "Sweep blast-clean the galvanizing (ISO 12944-4) unless the data sheet says otherwise; the zinc layer must stay continuous.",
      tsm: "Prepare and metal-spray to ISO 2063; apply the sealer until it stops soaking in, leaving no measurable film. The sealer is not counted in the NDFT or the number of coats.",
      rustD: "Steel already pitted (rust grade D): increase the film thickness or the number of coats and ask the paint maker (ISO 12944-5, 5.1)."
    },

    notes: {
      c1: "ISO 12944-5 says C1 needs no corrosion protection in principle. If you paint for looks, use a C2 system of low durability. Steel stored or erected outdoors before reaching a C1 interior starts corroding: give it a primer suited to that exposure.",
      airless: "The minimum thicknesses assume airless spray. Brush, roller or conventional spray build less per coat, so more coats are usually needed (ISO 12944-5, 7.3).",
      maxDft: "No individual DFT reading should exceed three times the NDFT unless the parties agree otherwise; some products have a lower critical maximum in their data sheet (ISO 12944-5, 7.3). Measure DFT on blasted steel to ISO 19840.",
      znPrimer: "A Zn (R) primer has at least 80 % zinc dust by mass in the dry film; its NDFT is usually 40–80 µm (ISO 12944-5, 7.1.2 and Table A.1).",
      part9: "Offshore CX and Im4 systems are qualified by testing to ISO 12944-9, not by minimum-thickness tables. Only systems Jotun reports as tested are listed; a changed build cannot be checked here.",
      design: [
        "Round or chamfer edges; a radius of at least 2 mm holds paint far better than a sharp edge (ISO 12944-3, Figure D.5).",
        "Notches in stiffeners and webs: radius at least 50 mm (ISO 12944-3, 5.8).",
        "Seal box members and hollow sections with continuous welds, or protect their insides (ISO 12944-3, 5.7).",
        "Avoid gaps, crevices and pockets that trap water and dirt; leave access room for blasting and spraying (ISO 12944-3, 5.2 to 5.4)."
      ],
      special: "Chemical splash, abrasion, permanent condensation or temperatures of 60–150 °C (or 150–400 °C) are special stresses that the categories do not cover; ask the paint maker for a suitable system (ISO 12944-2, Annex B)."
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
