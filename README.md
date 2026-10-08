# Paint Quantity Calculator

Enter a list of pipes and steel members, pick an ISO 12944 corrosion category and a paint supplier, and get the
total surface area and the litres of **primer, mid coat and finish** (with the number of coats and film
thickness of each layer).

Open `index.html` in a browser. It is plain HTML, CSS and JavaScript with no build step and no network access, and
it keeps your list in the browser's `localStorage`.

## What it does

1. **Members.** Add pipe by NPS/schedule (ASME B36.10M), steel sections (UB, UC, IPE, HEA/HEB/HEM, PFC, UPN,
   equal and unequal angles, SHS/RHS/CHS), or a custom member (flat bar, plate, small tube: type the perimeter).
   You can also paste a list from a spreadsheet (`family, size, length, qty`) or load the example.
2. **System.** Pick the ISO 12944 category (C2–C5, CX), the durability class and the supplier (Jotun, Carboline,
   PPG). The primer / mid coat / finish plan, product, coats, dry film thickness (DFT) and volume solids fill in; every
   figure can be edited, layers can be added, and a *Custom system* option starts from scratch.
3. **Allowances.** Application loss (default 30 %) and extra area for flanges, cleats and fittings.
4. **Results.** Total, pipe and steel area, steel mass, and for each layer: coats × DFT, wet film, coverage,
   litres per coat, theoretical litres and litres with loss; plus whole litres to order per product. CSV download and
   print.

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

**Paint products (`data/paints.js`).** Volume solids and recommended DFT per coat come from Jotun, Carboline and PPG data
sheets. **The supplier websites could not be opened while building this**: the figures were collected from
search-engine extracts of the sheets and from distributor copies. Each product has a `source` note saying what was seen
(hover the product name in the app). The spreading rates in the sheets all reproduce from the solids (the tests check
this), which is a good consistency check on the transcription, but data sheets are revised and many products exist in variants
(Carbothane 134 / HP / HS / HG, Carboguard 893 / SG / MIO). Confirm each product against the supplier's current data sheet.
Not confirmed: Penguard Express's ISO 12944 system tables, Sigmadur 550 H's own recommended range (50–80 µm is taken
from PPG's selector rows), and Hardtop AS's current sheet.

**ISO 12944 (`data/iso12944.js`).** The standard is paid and was not read directly. Category and durability wording
follows ISO 12944-1/-2. Each category/durability has a *reference total film thickness* with a stated basis:

* C2–C4: minimum NDFT for epoxy/PUR/zinc-silicate systems, as reported in secondary summaries of ISO 12944-5 Annex B
  (Table B.2). Not verified against the standard. C4 High = 240 µm is consistent with supplier-tested systems from Jotun
  and International.
* C5: **indicative only** (240 / 320 / 360 µm for Medium / High / Very high). No verified Annex B figure was available;
  these come from supplier systems (260–360 µm) and Hempel's FAQ (C5 Very High = 320 µm), rounded up on purpose.
* CX: ISO 12944-9: ≥ 280 µm, ≥ 3 coats, zinc-rich primer ≥ 40 µm. CX has one durability class (High).

The layer plans (for example C4 High: zinc-rich epoxy 60 µm + epoxy 125 µm + polyurethane 60 µm) are **generic builds**
chosen to meet the reference thickness with each coat inside the products' recommended range. They are **not any
supplier's certified ISO 12944-6 system**. For a specification, use the supplier's certificate. Not covered: C1,
immersion (Im1–Im4), low durability for C2/C3, galvanized or metal-sprayed steel, stripe coats, pack sizes, prices.

## Editing the database

Everything is data in `data/*.js`; the app and tests pick up changes automatically.

* **Add or correct a product:** add an object to the supplier in `data/paints.js` (`type` is `ZN`, `EP` or `PUR`;
  keep the `source` note honest). Order within a type is the order of preference.
* **Add a supplier:** add a `{ id, name, products }` entry; `npm test` will fail if any ISO system has no product whose
  range contains the specified DFT.
* **Change a system:** edit `systems` in `data/iso12944.js` (`layers` are `[role, type, coats, dft]`).
* **Regenerate pipe and section tables:** `tools/build_data.py` (see its docstring; it needs the `fluids` and
  `steelsnakes` wheels unpacked).

## Tests

```
npm test        # node:test, no dependencies
```

They check the pipe tables against B36.10M values, section areas against published values and against the geometry,
every product's spreading rate against its data sheet, that every ISO system × supplier resolves to products that
accept the specified film thickness, the import parser, and an end-to-end job recomputed independently.
