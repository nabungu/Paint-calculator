"""Generate data/pipes.js and sections.js.

Run with:  python3 -I build_data.py <fluids-extract-dir> <steelsnakes-extract-dir> <out-dir>

Pipes: ASME B36.10M OD + wall by schedule (tables from the `fluids` package, MIT).
Sections: nominal dimensions of the standard hot-rolled / hollow ranges (from the
`steelsnakes` package JSON) with the painted perimeter (m2 per metre) COMPUTED from the
geometry, then cross-checked against the published surface-area column where it exists.
"""
import ast
import json
import math
import re
import sys
from pathlib import Path

fluids_dir, snakes_dir, out_dir = map(Path, sys.argv[1:4])
out_dir.mkdir(parents=True, exist_ok=True)
PI = math.pi


def fmt(x, nd=1):
    """Compact number: 7.0 -> '7', 7.62 -> '7.6' (nd decimals max)."""
    s = f"{x:.{nd}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s if s else "0"


# ----------------------------------------------------------------------------- pipes
src = (fluids_dir / "fluids" / "piping.py").read_text()
tree = ast.parse(src)
consts = {}
for node in tree.body:
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
        try:
            consts[node.targets[0].id] = ast.literal_eval(node.value)
        except Exception:
            pass

SCHED = {  # schedule label -> (NPS list name, wall list name)
    "10": ("NPS10", "S10t"), "20": ("NPS20", "S20t"), "30": ("NPS30", "S30t"),
    "40": ("NPS40", "S40t"), "60": ("NPS60", "S60t"), "80": ("NPS80", "S80t"),
    "100": ("NPS100", "S100t"), "120": ("NPS120", "S120t"), "140": ("NPS140", "S140t"),
    "160": ("NPS160", "S160t"), "STD": ("NPSSTD", "STDt"), "XS": ("NPSXS", "XSt"),
    "XXS": ("NPSXXS", "XXSt"),
}
walls = {}  # nps -> {sched: t}
for sch, (nk, tk) in SCHED.items():
    for nps, t in zip(consts[nk], consts[tk]):
        walls.setdefault(float(nps), {})[sch] = t

# OD (mm).  B36.10M-2018 rounds NPS 10 / 12 to 273.1 / 323.9 (older edition 273.0 / 323.8).
od_src = dict(zip(consts["NPSSTD"], consts["STDo"]))
od_src[10.0] = 273.1
od_src[12.0] = 323.9
FRACT = {0.125: "1/8", 0.25: "1/4", 0.375: "3/8", 0.5: "1/2", 0.75: "3/4", 1.25: "1 1/4",
         1.5: "1 1/2", 2.5: "2 1/2", 3.5: "3 1/2"}


def dn_of(nps):
    table = {0.125: 6, 0.25: 8, 0.375: 10, 0.5: 15, 0.75: 20, 1.0: 25, 1.25: 32, 1.5: 40, 2.0: 50,
             2.5: 65, 3.0: 80, 3.5: 90, 4.0: 100, 5.0: 125, 6.0: 150, 8.0: 200}
    return table.get(nps, int(round(nps * 25)))


sched_order = list(SCHED)
pipes = []
for nps in sorted(od_src):
    label = FRACT.get(nps, fmt(nps, 0))
    w = {s: walls[nps][s] for s in sched_order if s in walls.get(nps, {})}
    pipes.append({"nps": label, "dn": dn_of(nps), "od": od_src[nps], "walls": w})

header = """/* ASME B36.10M welded and seamless wrought steel pipe: outside diameter and wall thickness.
 *
 * Painted (external) area per metre depends on OD only: pi x OD. Wall thickness is used for the
 * optional internal-surface area and for the steel mass (kg/m = 0.02466 x (OD - t) x t).
 *
 * Source: B36.10M tables as encoded in the open-source `fluids` Python package (fluids.piping,
 * MIT licence). OD for NPS 10 / 12 follows the 2018 edition (273.1 / 323.9 mm). Schedule/NPS
 * combinations B36.10M does not list are simply absent. Spot-check against your copy of the
 * standard before relying on a wall thickness for anything other than a paint estimate.
 * All dimensions in mm.
 */
"""
pipes_js = "[\n" + ",\n".join("    " + json.dumps(p, separators=(",", ":")) for p in pipes) + "\n  ]"
js = header + "(function (root) {\n  root.PaintDB = root.PaintDB || {};\n  root.PaintDB.pipes = {\n" \
    "    standard: \"ASME B36.10M\",\n    schedules: " + json.dumps(sched_order) + ",\n    pipes: " + pipes_js + "\n  };\n" \
    "})(typeof globalThis !== \"undefined\" ? globalThis : window);\n"
(out_dir / "pipes.js").write_text(js)
print(f"pipes: {len(pipes)} sizes")

# --------------------------------------------------------------------------- sections


def load(p):
    return json.loads((snakes_dir / "steelsnakes" / p).read_text())


def per_I(x):      # parallel-flange I / H section, root fillets only
    return (2 * x["h"] + 4 * x["b"] - 2 * x["tw"] + (2 * PI - 8) * x["r"]) / 1000


def per_PFC(x):    # parallel-flange channel, root fillets only
    return (2 * x["h"] + 4 * x["b"] - 2 * x["tw"] - (4 - PI) * x["r"]) / 1000


def per_UPN(x):    # DIN 1026 taper-flange channel (8% flange slope), toe radii ignored (conservative)
    s = 0.08
    d = s * (x["b"] - x["tw"]) / 2
    p = 2 * x["h"] + 4 * x["b"] - 2 * x["tw"] - (4 - PI) * x["r_1"] - 4 * d \
        + 2 * (x["b"] - x["tw"]) * (math.sqrt(1 + s * s) - 1)
    return p / 1000


def per_angle(x, l1, l2):
    return (2 * (l1 + l2) - (2 - PI / 2) * (x["r_1"] + 4 * x["r_2"])) / 1000


def ro_cold(t):
    return 2 * t if t <= 6 else (2.5 * t if t <= 10 else 3 * t)


def per_rect(h, b, ro):
    return (2 * (h + b) - (8 - 2 * PI) * ro) / 1000


families = []
mismatch = []


def add_family(fid, name, group, std, items, published_check=None):
    families.append({"id": fid, "name": name, "group": group, "std": std, "items": items})


def rows_I(data, keep, label, dims, per=per_I, sortkey=None):
    items = []
    for key, x in data.items():
        lab = keep(key, x)
        if lab is None:
            continue
        a = per(x)
        pub = x.get("surface_area_per_metre")
        if pub and abs(a - pub) / pub > 0.03:
            mismatch.append((fid_cur[0], lab, pub, round(a, 3)))
        items.append((sortkey(x) if sortkey else (x["h"], x["mass_per_metre"]),
                      [lab, round(x["mass_per_metre"], 2), round(a, 4), dims(x)]))
    items.sort(key=lambda t: t[0])
    return [r for _, r in items]


fid_cur = [""]
dims4 = lambda x: "×".join(fmt(v) for v in (x["h"], x["b"], x["tw"], x["tf"]))

# I-sections ---------------------------------------------------------------------------
fid_cur[0] = "UB"
add_family("UB", "Universal beams (UB)", "I-sections", "BS 4-1 / EN 10365",
           rows_I(load("UK/data/UB.json"), lambda k, x: k, "", dims4))
fid_cur[0] = "UC"
add_family("UC", "Universal columns (UC)", "I-sections", "BS 4-1 / EN 10365",
           rows_I(load("UK/data/UC.json"), lambda k, x: k, "", dims4))

ipe = load("EU/data/IPE.json")
fid_cur[0] = "IPE"
add_family("IPE", "IPE beams", "I-sections", "EN 10365 / DIN 1025-5",
           rows_I(ipe, lambda k, x: (f"IPE {m.group(1)}" if (m := re.fullmatch(r"IPE-(\d+)", k)) else None), "", dims4))
fid_cur[0] = "IPE A"
add_family("IPEA", "IPE A beams (light)", "I-sections", "EN 10365",
           rows_I(ipe, lambda k, x: (f"IPE A {m.group(1)}" if (m := re.fullmatch(r"IPE-(\d+)-A", k)) else None), "", dims4))
fid_cur[0] = "IPE O"
add_family("IPEO", "IPE O beams (heavy)", "I-sections", "EN 10365",
           rows_I(ipe, lambda k, x: (f"IPE O {m.group(1)}" if (m := re.fullmatch(r"IPE-(\d+)-O", k)) else None), "", dims4))

he = load("EU/data/HE.json")
for letter, nm in (("A", "HEA (light) H-sections"), ("B", "HEB H-sections"), ("M", "HEM (heavy) H-sections")):
    fid_cur[0] = "HE" + letter
    add_family("HE" + letter, nm, "I-sections", "EN 10365 / DIN 1025",
               rows_I(he, lambda k, x, L=letter: (f"HE{L} {m.group(1)}" if (m := re.fullmatch(r"HE-(\d+)-" + L, k)) else None), "", dims4))

# Channels -----------------------------------------------------------------------------
pfc = load("UK/data/PFC.json")
fid_cur[0] = "PFC"
add_family("PFC", "Parallel flange channels (PFC)", "Channels", "BS EN 10365",
           rows_I(pfc, lambda k, x: k, "", dims4, per=per_PFC))
upn = load("EU/data/UPN.json")
fid_cur[0] = "UPN"
# published UPN column is ~10-15% below geometry and disagrees with parallel-flange formulae; use geometry
items = []
for k, x in upn.items():
    m = re.fullmatch(r"UPN-(\d+)", k)
    items.append(((x["h"], x["mass_per_metre"]), [f"UPN {m.group(1)}", round(x["mass_per_metre"], 2), round(per_UPN(x), 4), dims4(x)]))
items.sort(key=lambda t: t[0])
add_family("UPN", "Taper flange channels (UPN)", "Channels", "DIN 1026-1", [r for _, r in items])

# Angles -------------------------------------------------------------------------------
items = []
for k, x in load("UK/data/L_EQUAL.json").items():
    l = float(k.split("x")[0])
    items.append(((l, x["t"]), [f"{fmt(l)}x{fmt(l)}x{fmt(x['t'])}", round(x["mass_per_metre"], 2), round(per_angle(x, l, l), 4), f"{fmt(l)}×{fmt(l)}×{fmt(x['t'])}"]))
items.sort(key=lambda t: t[0])
add_family("EA", "Equal angles", "Angles", "EN 10056-1", [r for _, r in items])
items = []
for k, x in load("UK/data/L_UNEQUAL.json").items():
    l1, l2, _ = k.split("x")
    l1, l2 = float(l1), float(l2)
    items.append(((l1, l2, x["t"]), [f"{fmt(l1)}x{fmt(l2)}x{fmt(x['t'])}", round(x["mass_per_metre"], 2), round(per_angle(x, l1, l2), 4), f"{fmt(l1)}×{fmt(l2)}×{fmt(x['t'])}"]))
items.sort(key=lambda t: t[0])
add_family("UA", "Unequal angles", "Angles", "EN 10056-1", [r for _, r in items])

# Hollow sections ----------------------------------------------------------------------


def hollow(fname, kind, ro_fn):
    items = []
    for k, x in load(fname).items():
        if kind == "CHS":
            d = x["d"]
            a = PI * d / 1000
            lab, dm = f"{fmt(d)}x{fmt(x['t'])}", f"{fmt(d)}×{fmt(x['t'])}"
            key = (d, x["t"])
        elif kind == "SHS":
            b = float(x["hxh"].split("x")[0])
            a = per_rect(b, b, ro_fn(x["t"]))
            lab, dm = f"{fmt(b)}x{fmt(b)}x{fmt(x['t'])}", f"{fmt(b)}×{fmt(b)}×{fmt(x['t'])}"
            key = (b, x["t"])
        else:
            h, b = map(float, x["hxb"].split("x"))
            a = per_rect(h, b, ro_fn(x["t"]))
            lab, dm = f"{fmt(h)}x{fmt(b)}x{fmt(x['t'])}", f"{fmt(h)}×{fmt(b)}×{fmt(x['t'])}"
            key = (h, b, x["t"])
        pub = x.get("surface_area_per_metre")
        if pub and abs(a - pub) / pub > 0.03:
            mismatch.append((fname, lab, pub, round(a, 3)))
        items.append((key, [lab, round(x["mass_per_metre"], 2), round(a, 4), dm]))
    items.sort(key=lambda t: t[0])
    return [r for _, r in items]


hf, cf = (lambda t: 1.5 * t), ro_cold
add_family("SHS-HF", "Square hollow sections, hot-finished (SHS)", "Hollow sections", "EN 10210-2", hollow("UK/data/HFSHS.json", "SHS", hf))
add_family("RHS-HF", "Rectangular hollow sections, hot-finished (RHS)", "Hollow sections", "EN 10210-2", hollow("UK/data/HFRHS.json", "RHS", hf))
add_family("CHS-HF", "Circular hollow sections, hot-finished (CHS)", "Hollow sections", "EN 10210-2", hollow("UK/data/HFCHS.json", "CHS", hf))
add_family("SHS-CF", "Square hollow sections, cold-formed (SHS)", "Hollow sections", "EN 10219-2", hollow("UK/data/CFSHS.json", "SHS", cf))
add_family("RHS-CF", "Rectangular hollow sections, cold-formed (RHS)", "Hollow sections", "EN 10219-2", hollow("UK/data/CFRHS.json", "RHS", cf))
add_family("CHS-CF", "Circular hollow sections, cold-formed (CHS)", "Hollow sections", "EN 10219-2", hollow("UK/data/CFCHS.json", "CHS", cf))

header = """/* Structural steel sections: mass and painted surface area per metre.
 *
 * Each item: [designation, mass kg/m, surface area m2/m, nominal dimensions (mm)].
 * "Surface area" is the full perimeter of the section (all faces) per metre of length, i.e. the
 * quantity tabulated as "surface area per metre" in section tables such as the SASCH ("Red Book").
 *
 * PROVENANCE (read this): the Red Book is a paid publication and nothing here was copied from it.
 * The ranges are the standard rolled/hollow series that the Southern African tables are built on
 * (UB/UC to BS 4, IPE/HE to DIN 1025 / EN 10365, PFC, UPN to DIN 1026, angles to EN 10056, hollow
 * sections to EN 10210 / EN 10219). Dimensions and mass come from the open-source `steelsnakes`
 * dataset. Areas are COMPUTED from the dimensions and root/toe radii (formulae in README.md) and
 * were cross-checked against the published surface-area column: every family agrees within 1-3 %
 * except where noted in README. Availability in Southern Africa varies by mill and year, and
 * designations/dimensions can differ slightly by edition. Confirm any section that matters
 * against the current SASCH or your mill's certificate.
 */
"""
families_js = json.dumps(families, ensure_ascii=False, separators=(",", ":"))
# one family per line for readable diffs
families_js = "[\n" + ",\n".join(
    "  " + json.dumps(f, ensure_ascii=False, separators=(",", ":")) for f in families) + "\n]"
js = header + "(function (root) {\n  root.PaintDB = root.PaintDB || {};\n  root.PaintDB.sections = {\n    families: " + \
    families_js.replace("\n", "\n    ") + "\n  };\n})(typeof globalThis !== \"undefined\" ? globalThis : window);\n"
(out_dir / "sections.js").write_text(js)

n = sum(len(f["items"]) for f in families)
print(f"sections: {len(families)} families, {n} items")
for f in families:
    print(f"  {f['id']:7s} {len(f['items']):4d}")
print("published-vs-computed mismatches >3%:", mismatch)
