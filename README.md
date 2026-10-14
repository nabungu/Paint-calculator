# Paint Quantity Calculator

Enter a list of pipes and steel members, pick an ISO 12944 environment and durability, and get the total surface
area, the paint systems that qualify (from Jotun's *ISO 12944 Coating Selector*), and the litres of **primer, mid coat
and finish** with the number of coats and film thickness of each layer. Every build, including one you edit, is
checked live against the minimum requirements of ISO 12944-5. For **hot-dip galvanizing** it checks the coating
against ISO 1461 (SANS 121) and gives the zinc mass, the weight each piece gains and the life to first maintenance
(ISO 14713-1).

Open `index.html` in a browser. It is plain HTML, CSS and JavaScript with no build step and no network access, and
it keeps your list in the browser's `localStorage`.

## What it does

1. **Members.** Add pipe by NPS/schedule (ASME B36.10M), a steel section, or a custom member (flat bar, plate,
   welded section: type the perimeter). Sections come from three catalogues, listed in this order:
   * **SAISC**: UB, UC, H-bearing piles, IPE, IPE AA, ITF joists, PFC, UPN and BS taper channels, equal and unequal
     angles, tees cut from UB and UC, SHS, RHS, CHS, and cold-formed lipped channels, Z and angles;
   * **EN / BS**: UB, UC, IPE, IPE A/O, HEA/HEB/HEM, PFC, UPN, angles, hot-finished and cold-formed hollow sections;
   * **AISC** (US imperial): W, M, S, HP, C, MC, L, WT, MT, ST and HSS.

   You can also paste a list from a spreadsheet (`family, size, length, qty`) or load the example. A family word
   such as `UB`, `L`, `SHS` or `W` finds the size in the SAISC table first, then EN, then AISC, and the import says
   when another table has the same size with an area more than 1 % different. Put the catalogue in front of the word
   (`EN UB`, `AISC L`) or give a table's own id (`SA-UB`, `SHS-HF`, `HEB`, `US-W`) to use one table. A prefix written in
   the size must match the family: `W, WT6x25` is rejected rather than read as W6x25. AISC 2001 spellings such as
   `HSS6X6X.3125` and decimal commas (`100x100x6,3`) are understood. Sizes marked * (legacy, superseded, etc.) are
   listed in the import messages.
2. **Environment and system.**
   * Pick the protection (painted blast-cleaned steel; hot-dip galvanized only; duplex, i.e. galvanized and painted;
     paint over thermal-sprayed metal), the environment
     (C1–C5 and CX in air; Im1–Im3 in water or soil; Im4) and the durability you need. *Not sure?* works the category
     out from measured first-year corrosion of steel or zinc specimens (ISO 12944-2 Table 1).
   * Every Jotun system from the selector that reaches that durability is listed, least paint first, with the litres
     it needs for your job. *Use* loads it into the layer editor.
   * Edit anything: products, coats, DFT, solids, add or remove layers. The **ISO 12944-5 check** shows which
     durability the build allows (low / medium / high / very high, with each minimum) and what is missing for the
     next class. Warnings flag DFTs outside a product's range and zinc primers outside 40–80 µm.
   * Choosing Carboline or PPG keeps Jotun's builds and substitutes that supplier's product of the same type (flagged:
     those combinations are nobody's certified system). Alkyd systems drop out for them (no alkyd products).
   * Notes give the surface preparation for the substrate and primer (Table B.1, ISO 12944-4), inspection limits and
     ISO 12944-3 design points.
   * **Hot-dip galvanized only** shows no paint systems. Pick the steel thickness (or let the member list set it from
     its thickest steel) and the mean coating thickness (blank = the ISO 1461 minimum). The panel:
     * checks the coating against ISO 1461 Table 3 or 4 (steel > 6 mm: 85 µm mean, 70 µm local) and flags it if
       it is below;
     * gives the life to first maintenance as thickness ÷ zinc loss, using the top and the bottom of the
       category's ISO 9223 rate band, shown as "> 100 years" beyond 100 (85 µm in C4: 20–40 years). It compares
       the shorter life with the durability asked for and says how much zinc would reach it;
     * for Im1–Im4, gives no life figure: specialist advice, consider duplex.

     **Duplex** shows the same zinc panel above the ISO 12944 Table B.3 paint systems.
3. **Allowances.** Application loss (default 30 %) and extra area for flanges, cleats and fittings.
4. **Results.** Total, pipe and steel area, steel mass, and for each layer: coats × DFT, wet film, coverage,
   litres per coat, theoretical litres and litres with loss; whole litres to order per product; and a
   **specification summary** (environment, preparation, system, NDFT, ISO compliance, inspection) to copy into a
   document. CSV download and print. With galvanizing:
   * coating mass (g/m² = µm × 7.2);
   * zinc on the job (kg) and its volume, including the inside of tubes and pipes;
   * added weight as a % of the steel;
   * steel, zinc and galvanized weight per piece, for transport and lifting.

## The maths

| Quantity | Formula |
| --- | --- |
| Pipe external area | π × OD per metre of pipe (the schedule does not change it) |
| Pipe internal area (optional) | π × (OD − 2 × wall) per metre |
| Section area | surface area per metre (perimeter of all faces) × length × quantity × painted % |
| Paint litres | area × DFT ÷ (10 × volume solids %) per coat, × number of coats |
| Litres to buy | litres ÷ (1 − loss %) |
| Wet film | DFT ÷ volume solids |
| Pipe mass | π × 7850 × (OD − t) × t (kg/m, mm units) |
| Zinc coating mass | thickness (µm) × 7.2 g/m² (coating density 7.2 g/cm³, ISO 1461) |
| Zinc on the job | galvanized area × coating mass; volume = area × thickness |
| Galvanized area | outside area + inside of tubes and pipes (outside perimeter − 2πt), + allowance |
| Zinc life | thickness ÷ ISO 9223 zinc rate: top of band → shorter life, bottom → longer; > 100 years capped |

Check: 100 m² at 100 µm and 80 % solids is 12.5 L theoretical (8 m²/L, Jotamastic 90's published rate).

Section areas per metre are the full outline of the cross-section (every face that takes paint, including angle toe
ends, tee stems and lip edges), in mm ÷ 1000, from the nominal dimensions h, b, tw, tf, root radius r1 and toe
radius r2:

* I and H sections: `2h + 4b − 2tw + (2π − 8) r1`
* Parallel flange channels: `2h + 4b − 2tw − (4 − π) r1`
* Taper flange channels (UPN 8 % up to UPN 300 and 5 % above; BS taper channels 5°, the SA 178x54 at its fitted
  3.4 %):
  `2h + 2b + 2(b − tw) k − 2(r1 + r2)(2k − θ)` with `k = (1 − sin α) / cos α`, `θ = π/2 − α`, `tan α` = the slope
* Taper flange I-beams (ITF): `2h + 2b + 4L (1 − sin α) / cos α + 4(r1 + r2)(π/2 − α − cos α)`,
  `L = (b − tw)/2 − (r1 + r2)(1 − sin α)`
* Angles: `2 (L1 + L2) − (2 − π/2)(r1 + 2 r2)`: a root radius and one radius on each inner toe corner; the heel and
  outer toe corners are sharp. (Earlier versions counted four toe radii and were 1–2 % low.)
* Tees cut from I-sections: half the parent's outline plus the web thickness (the cut face)
* Hollow sections: `2 (h + b) − (8 − 2π) ro`, circular `π × d`. Outer corner radius `ro`:
  * EN 10210 hot-finished: `1.5t` at every wall;
  * EN 10219 cold-formed: `2t / 2.5t / 3t` for `t ≤ 6 / ≤ 10 / > 10 mm`;
  * SAISC tubes: `2t / 2.5t` up to 10 mm, and `1.5t` for the 12.5 and 16 mm walls, which are hot-finished.
* Cold-formed lipped sections: twice the centre-line length plus the two lip edges, inner bend radius `t`
* AISC: W, M, S and HP use AISC's published perimeter; WT, MT and ST half the parent's plus the web; C and MC the
  sloped-flange outline; angles `2 (d + b) − (2 − π/2) r1`; rectangular HSS `ro = 2 × design wall`; round HSS
  `π × OD`. Inches × 0.0254 = m, lb/ft × 1.488164 = kg/m.

## Where the data came from, and how far to trust it

The calculator is only as good as `data/`. Read this before relying on it for an order or a tender.

**Pipe (`data/pipes.js`).** ASME B36.10M outside diameters and wall thicknesses, taken from the tables in the
open-source [`fluids`](https://pypi.org/project/fluids/) package (MIT) and spot-checked (NPS 6: 168.3 mm, 7.11 mm
Sch 40, 21.95 mm XXS; mass 28.26 kg/m for 6" Sch 40). NPS 10 and 12 use the 2018 edition ODs (273.1 and 323.9 mm).

**Structural steel, SAISC (`data/sections-saisc.js`, 793 sections, listed first).** Generated from a SAISC
section database for Autodesk Robot (`sources/Saiscpro.xml`, supplied by the project owner) by
`tools/build_saisc.py`. The SAISC *Red Book* itself was not used. Every row of the file (964) was checked by
recomputing its outline from Robot's own drawing scripts, from closed-form formulas and from the file's section
areas and masses, and each family was then reviewed by a second, adversarial check:

* where the file's surface column is the true outline it is used as it stands: UB, UC, IPE, IPE AA, PFC, tees,
  CHS, lipped channels and lipped angles, plus most H-piles;
* where it is wrong, the outline above is used:
  * angles: the file leaves out both toe end faces, so it was up to 6.6 % low;
  * UPN and ITF: the file's column is shifted by one row, so UPN 100 showed 0.96 m²/m;
  * BS taper channels: every row was wrong;
  * SHS and RHS: the file uses sharp corners, and its masses mix three conventions, so mass is recomputed too;
  * lipped Z: the file draws sharp inner bends;
  * four heavy UBs whose surface figure has no fillet deduction (and a wrong root radius);
  * two H-piles with a flange-width typo;
* duplicate rows are dropped: IPF and HPF rows that repeat a UB or UC (the 13 sizes only they list are kept, as UB
  and UC), the principal-axis copies of the angle tables, and 48 CHS rows with a rounded OD;
* UPN masses are the DIN 1026 nominal values;
* rows marked * carry a note: the legacy ITF joists, the obsolete BS 381x102 channel, two older PFCs, and the
  hot-finished 12.5 and 16 mm hollow sections.

Checks: UPN 100–300 match the published DIN 1026 areas within 0.07 %, and the angle outlines match published
values (100×100×10 at 0.390 m²/m).

**Structural steel, EN / BS (`data/sections.js`, 1,115 sections).** The standard rolled and hollow-section ranges
(UB/UC to BS 4, IPE and HE to EN 10365, PFC, UPN to DIN 1026, EN 10056 angles, EN 10210 and EN 10219 hollow
sections), generated by `tools/build_data.py`. Dimensions and mass come from the open-source
[`steelsnakes`](https://github.com/waynemaranga/steelsnakes) dataset (GPL-2.0 package; the values are the
standard-defined dimensions, which are facts, but note the licence if you redistribute). Areas were **computed**
from the dimensions with the formulas above and compared with the published surface-area column:

* every UC, IPE, HE, PFC and hollow section is within 0.5 % of the published value, and UB 104 of 107 within 1 %;
* two heavy UBs (1016×305×584 and 914×305×576) have published values of 3.69 and 3.46 m²/m in the source that
  disagree with their own dimensions (3.24 and 3.17 m²/m); the computed values are used;
* the source's UPN column is 7.5–12.8 % below the outline and is not used. Some tables list UPN 120 as 0.434 and
  UPN 180 as 0.611; 0.434 is the outline with the taper ignored, and 0.429 / 0.603 are kept.

**Structural steel, AISC (`data/sections-aisc.js`, 1,289 sections).** The W, M, S, HP, C, MC, L, WT, MT, ST and HSS
shapes of the AISC 2001 shape list (`sources/aisc2001.stp`), with dimensions, weights and AISC's published
perimeters from the AISC Shapes Database v16 (as packaged in `steelsnakes`), generated by `tools/build_aisc.py`. The
list's double angles (enter a single angle with quantity 2) and pipes (already covered by B36.10M) are left out.
Rows only in the 2001 list are kept and marked *: 12 jumbo W36 sizes and their WT18 halves, which AISC has since
replaced with sizes about 0.6 in deeper, and 40 HSS sizes no longer tabulated.

Availability varies by mill and year. Check any section that matters against the mill's current tables. Members not
listed (flats, plate, welded sections) go in as *Custom member*.

**ISO 12944 (`data/iso12944.js`).** Taken from the standard itself (ISO 12944-2:2017, -3:2017, -4:2017 and
-5:2018); only figures are used and none of its wording is reproduced.

* Environments: the first-year mass and thickness-loss bands of ISO 12944-2 Table 1 (steel and zinc) and the
  water/soil categories of Table 2.
* Minimums: ISO 12944-5 Annex B, Table B.2 (blast-cleaned carbon steel, with separate columns for zinc-rich, other
  and alkyd/acrylic primers), B.3 (galvanized), B.4 (thermal-sprayed metal) and B.5 (immersion). A build is judged
  in the column its first coat belongs to; it reaches a durability when it has at least the minimum number of coats
  and the minimum total NDFT. "No minimum" cells (C2 low, galvanized C2 and C3 low) count as met.
* C1 uses the C2 table (ISO 12944-5, 5.1). CX and Im4 belong to ISO 12944-9, which qualifies systems by testing; it
  was not available, so for CX/Im4 only Jotun's tested systems are listed and an edited build cannot be checked.

**Systems (`data/systems.js`).** Jotun's *ISO 12944 Coating Selector, Revision 2*: Tables C.2–C.6 (carbon steel and
immersion), D.1 (galvanized), E.1 (thermal-sprayed metal) and the ISO 12944-9 table. The durability ticks were read
from the PDF and confirmed by detecting the tick marks in the rendered pages. **For all 84 systems, the durability that
ISO 12944-5 Annex B allows equals the durability Jotun ticks** (a test checks this), so the two sources confirm each
other. Offshore systems are included only where every product's solids are known (2 of 7 zinc-primer CX systems, 1
splash-zone system, and 2 Im4 systems).

**Hempel and PPG systems (`data/systems-hempel.js`, `data/paints-hempel.js`, `data/systems-ppg.js`).**
* Hempel: 107 systems from *How to select the right paint system* (ISO 12944, Oct 2023), including galvanized and
  CX systems. Polyaspartic systems and others needing a product whose solids could not be found are left out (each
  listed in the file header).
* PPG: 49 systems from the *ISO 12944 global system selector* (2023), with PPG's numbers. Solids come from the
  selector's own product table, checked against data sheets.
* Each system's `basis` is `annexB` when ISO 12944-5 Annex B allows the supplier's rating, and `tested` when the
  supplier rates it higher from ISO 12944-6 / -9 testing. The app marks a system "tested" only when Annex B falls
  short of the durability asked for. A test checks every system's basis against Annex B.
* With a supplier selected, the list shows that supplier's own systems. Carboline has none yet, so it gets Jotun's
  builds with Carboline products substituted.

**Paint products (`data/paints.js`).** Volume solids and recommended DFT per coat come from Jotun, Carboline and PPG data
sheets. **The supplier websites could not be opened while building this**: the figures were collected from
search-engine extracts of the sheets and from distributor copies. Each product has a `source` note saying what was seen
(hover the product name in the app). The spreading rates in the sheets all reproduce from the solids (the tests check
this), but data sheets are revised and many products exist in variants (Barrier 80 is 61 % but Barrier 80 S is 67 %;
Carbothane 134 / HP / HS / HG). Confirm each product against the supplier's current data sheet. Weaker points:

* Penguard Pro's 75 % solids is derived from a retailer's published spreading rates, not read from its data sheet.
* Pioner Topcoat's 34 % comes from an EPD listing.
* Several per-coat ranges (Barrier 80, Barrier, Penguard HSP ZP, Pilot II, Pioner, Penguard Pro GF) are the range
  Jotun's selector uses, because the data sheet range was not seen.
* The selector allows "Penguard HSP ZP or Penguard Express ZP"; only HSP ZP's solids (73 %) were found, so it is used.

**Hot-dip galvanizing (`data/galvanizing.js`).**
* ISO 1461:2009 Tables 3 and 4 (minimum local and mean thickness and mass) and the 7.2 g/cm³ coating density, read
  from the standard.
* The zinc rate bands are ISO 9223's first-year rates; they are the same as ISO 12944-2 Table 1.
* The life method is the one ISO 1461 Annex E refers to (ISO 14713-1). ISO 14713-1 itself was not available; the
  results agree with ArcelorMittal's guide *Corrosion protection of rolled steel sections using hot-dip
  galvanization* (85 µm in C3: at least 40 years). That guide also gives the duplex factor of 1.2–1.5.
* First-year rates are conservative (ISO 9224 gives lower long-term rates).
* Real coatings on reactive steel are often well above the minimum, so zinc pickup can be higher than calculated.
* SANS equivalents and HDGASA guidance are listed in the app's notes.

Not covered: galvanized or metal-sprayed steel in immersion, CX on galvanizing, the sealer coat on metal spray,
stripe coats, pack sizes, prices.

## Editing the database

Everything is data in `data/*.js`; the app and tests pick up edits to these files automatically (a new section file needs registering, see below).

* **Add or correct a product:** add an object to the supplier in `data/paints.js` (`type` is `ZN`, `EP`, `PUR`, `AK`
  or `AY`; keep the `source` note honest). Order within a type is the order of preference when products are
  substituted.
* **Add a supplier:** add a `{ id, name, short, products }` entry; it appears in the supplier list and is substituted
  into the library's builds by type.
* **Add a system:** add an entry to `data/systems.js` with the durability its maker rates it for. `npm test` fails if
  ISO 12944-5 Annex B would allow a different durability, if a product is missing, or if a DFT is outside the
  product's range.
* **Regenerate pipe and section tables:** `tools/build_data.py` (pipes and EN/BS sections; it needs the `fluids`
  and `steelsnakes` wheels unpacked), `tools/build_saisc.py sources/Saiscpro.xml data/sections-saisc.js` and
  `tools/build_aisc.py sources/aisc2001.stp <steelsnakes dir> data/sections-aisc.js` (the two section databases
  they read are in `sources/`, see its README). Each docstring says what it reads
  and why each family is computed the way it is.
* **Add a section catalogue:** write a `data/sections-*.js` file that pushes a catalogue (`id`, `rank`, `name`,
  `short`) and its families (`id`, `catalogue`, `prefix`, `name`, `group`, `std`, optional `variant`, `items`) onto
  `PaintDB.sections`. Load it with a `<script>` tag in `index.html` before `calc.js`, add it to the `require` list at
  the top of `test/calc.test.js`, and add its family ids to `FAMILY_ALIASES` in `calc.js` so family words such as
  `UB` or `L` find them (an exact id works without that). The member picker groups by catalogue rank, and the
  import picks the lowest rank that has the size.

## Tests

```
npm test        # node:test, no dependencies
```

They check the pipe tables against B36.10M values; section areas against published values, the geometry and the values
verified row by row for SAISC and AISC; the catalogue order, labels and the import's choice between catalogues;
every product's spreading rate against its data sheet; the Annex B tables (spot values, and that minimums never fall as
durability rises); every Jotun system against those tables; the compliance engine's columns, shortfalls and edge
cases; the recommender; the category helper; the import parser; and an end-to-end job recomputed independently.
