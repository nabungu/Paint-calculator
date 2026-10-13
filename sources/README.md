# Section databases

The inputs that `data/sections-saisc.js` and `data/sections-aisc.js` are generated from. The app never reads these
files; only the generators in `tools/` do. They are stored byte for byte, with their original Windows (CRLF) line
endings (`.gitattributes` stops git from converting them).

| File | What it is | Read by |
| --- | --- | --- |
| `Saiscpro.xml` | The SAISC (Southern African) section database for Autodesk Robot Structural Analysis: 964 shapes in 23 Robot families, with dimensions in metres, mass (kg/m), Robot's "painting surface" (m²/m) and the drawing scripts for each shape type. Supplied by the project owner. | `tools/build_saisc.py` |
| `aisc2001.stp` | The CIMsteel STEP file "AISC2001.stp" (Steel Construction Institute, June 2001): the 1,923 AISC EDI Standard Nomenclature designations, names only. Its header carries "Copyright 2001 American Institute of Steel Construction". | `tools/build_aisc.py`, which takes dimensions and weights from the AISC Shapes Database v16 in the `steelsnakes` package |

Regenerate from the repository root:

```
python3 -I tools/build_saisc.py sources/Saiscpro.xml data/sections-saisc.js
python3 -I tools/build_aisc.py sources/aisc2001.stp <steelsnakes-extract-dir> data/sections-aisc.js
```

Both runs are deterministic and reproduce the committed data files exactly. Not every value in `Saiscpro.xml` is
used as it stands: where its surface figure is wrong, the generator uses the section outline instead, and the header
of `data/sections-saisc.js` lists every correction and why it was made.
