# Paint Quantity Calculator

Enter a list of pipes and steel members, pick an ISO 12944 environment and durability, and get the total surface
area, the paint systems that qualify (from Jotun's *ISO 12944 Coating Selector*), and the litres of **primer, mid coat
and finish** with the number of coats and film thickness of each layer. Every build, including one you edit, is
checked live against the minimum requirements of ISO 12944-5.

Open `index.html` in a browser. It is plain HTML, CSS and JavaScript with no build step and no network access, and
it keeps your list in the browser's `localStorage`.

## What it does

1. **Members.** Add pipe by NPS/schedule (ASME B36.10M), steel sections (UB, UC, IPE, HEA/HEB/HEM, PFC, UPN,
   equal and unequal angles, SHS/RHS/CHS), or a custom member (flat bar, plate, small tube: type the perimeter).
   You can also paste a list from a spreadsheet (`family, size, length, qty`) or load the example.
2. **Environment and system.**
   * Pick the substrate (blast-cleaned carbon steel, hot-dip galvanized, thermal-sprayed metal), the environment
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
3. **Allowances.** Application loss (default 30 %) and extra area for flanges, cleats and fittings.
4. **Results.** Total, pipe and steel area, steel mass, and for each layer: coats × DFT, wet film, coverage,
   litres per coat, theoretical litres and litres with loss; whole litres to order per product; and a
   **specification summary** (environment, preparation, system, NDFT, ISO compliance, inspection) to copy into a
   document. CSV download and print.

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

Check: 100 m² at 100 µm and 80 % solids is 12.5 L theoretical (8 m²/L, Jotamastic 90's published rate).

Section perimeters (mm, then ÷ 1000 for m²/m), from the nominal dimensions h, b, tw, tf and root radius r:

* I and H sections: `2h + 4b − 2tw + (2π − 8) r`
* Parallel flange channels: `2h + 4b − 2tw − (4 − π) r`
* Taper flange channels (UPN, 8 % flange slope): the channel formula with the flange taper correction, toe radii ignored
* Angles: `2 (L1 + L2) − (2 − π/2)(r1 + 4 r2)`
* Hollow sections: `2 (h + b) − (8 − 2π) ro`, outer corner radius `ro = 1.5 t` (hot-finished) or `2t / 2.5t / 3t` for
  `t ≤ 6 / ≤ 10 / > 10 mm` (cold-formed); circular `π × d`

## Where the data came from, and how far to trust it

The calculator is only as good as `data/`. Read this before relying on it for an order or a tender.

**Pipe (`data/pipes.js`).** ASME B36.10M outside diameters and wall thicknesses, taken from the tables in the
open-source [`fluids`](https://pypi.org/project/fluids/) package (MIT) and spot-checked (NPS 6: 168.3 mm, 7.11 mm
Sch 40, 21.95 mm XXS; mass 28.26 kg/m for 6" Sch 40). NPS 10 and 12 use the 2018 edition ODs (273.1 and 323.9 mm).

**Structural steel (`data/sections.js`).** The SAISC *Southern African Steel Construction Handbook* ("Red Book") is a
paid publication and was **not** used: nothing was copied from it. The database holds the standard rolled and
hollow-section ranges that its tables are built on (ArcelorMittal South Africa's own datasheets say its I-sections
follow BS 4 / DIN 1025 and its channels DIN 1026). Dimensions and mass come from the open-source
[`steelsnakes`](https://github.com/waynemaranga/steelsnakes) dataset (GPL-2.0 package; the values are the
standard-defined dimensions, which are facts, but note the licence if you redistribute). Areas were **computed** from
the dimensions with the formulas above and compared with the published surface-area column:

* of the 1,016 sections that have a published value, 99 % agree with the computed area within 0.5 % and all but two
  within 3 % (IPE 200: 0.768 m²/m and HEB 300: 1.73 m²/m match the published tables);
* two heavy UBs (1016×305×584 and 914×305×576) have published values of 3.69 and 3.46 m²/m in the source
  that disagree with their own dimensions (3.24 and 3.17 m²/m) and with the EU table's entry for the same
  section; the computed values are used;
* the source's UPN column is 10–15 % below the geometric perimeter and was not used.

Not every section here is stocked in Southern Africa, and the Red Book may carry sizes or designations that differ
slightly. Check any section that matters against the current Red Book or the mill catalogue. Missing sizes
(small tube below the EN range, tees, flats, plate, welded sections) go in as *Custom member*.

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

Not covered: galvanized or metal-sprayed steel in immersion, CX on galvanizing, the sealer coat on metal spray,
stripe coats, pack sizes, prices.

## Editing the database

Everything is data in `data/*.js`; the app and tests pick up changes automatically.

* **Add or correct a product:** add an object to the supplier in `data/paints.js` (`type` is `ZN`, `EP`, `PUR`, `AK`
  or `AY`; keep the `source` note honest). Order within a type is the order of preference when products are
  substituted.
* **Add a supplier:** add a `{ id, name, short, products }` entry; it appears in the supplier list and is substituted
  into the library's builds by type.
* **Add a system:** add an entry to `data/systems.js` with the durability its maker rates it for. `npm test` fails if
  ISO 12944-5 Annex B would allow a different durability, if a product is missing, or if a DFT is outside the
  product's range.
* **Regenerate pipe and section tables:** `tools/build_data.py` (see its docstring; it needs the `fluids` and
  `steelsnakes` wheels unpacked).

## Tests

```
npm test        # node:test, no dependencies
```

They check the pipe tables against B36.10M values; section areas against published values and against the geometry;
every product's spreading rate against its data sheet; the Annex B tables (spot values, and that minimums never fall as
durability rises); every Jotun system against those tables; the compliance engine's columns, shortfalls and edge
cases; the recommender; the category helper; the import parser; and an end-to-end job recomputed independently.
