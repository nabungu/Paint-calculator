"""Generate data/pipes.js and data/sections.js (the EN / BS section catalogue).

Run from the repository root with:

    python3 -I tools/build_data.py <fluids-extract-dir> <steelsnakes-extract-dir> <out-dir>

<fluids-extract-dir> holds the unpacked `fluids` package (fluids/piping.py) and
<steelsnakes-extract-dir> the unpacked `steelsnakes` package (steelsnakes/UK/data/*.json,
steelsnakes/EU/data/*.json). Both files are written to <out-dir>; copy them into data/.
Python 3 standard library only; the output is deterministic.

Pipes: ASME B36.10M OD + wall by schedule (tables from the `fluids` package, MIT).
Sections: nominal dimensions of the standard hot-rolled / hollow ranges (from the
`steelsnakes` package JSON) with the painted perimeter (m2 per metre) COMPUTED from the
geometry, then cross-checked against the published surface-area column where it exists.
sections.js follows the shared section data contract: it pushes the "EN" catalogue and its
families onto root.PaintDB.sections, which other catalogue files share.
"""
import ast
import json
import math
import re
import sys
from pathlib import Path

if len(sys.argv) != 4:
    sys.exit(__doc__)
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


def load(p, need=()):
    """Read one steelsnakes table; every row must carry the fields in `need` as positive numbers."""
    data = json.loads((snakes_dir / "steelsnakes" / p).read_text(encoding="utf-8"))
    for key, x in data.items():
        for f in need:
            v = x.get(f)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not v > 0:
                sys.exit(f"{p} {key}: field {f!r} missing or not a positive number ({v!r})")
    return data


def per_I(x):      # parallel-flange I / H section, root fillets only
    return (2 * x["h"] + 4 * x["b"] - 2 * x["tw"] + (2 * PI - 8) * x["r"]) / 1000


def per_PFC(x):    # parallel-flange channel, root fillets only
    return (2 * x["h"] + 4 * x["b"] - 2 * x["tw"] - (4 - PI) * x["r"]) / 1000


def upn_slope(x):
    """DIN 1026-1 inner flange slope: 8 % up to h = 300 mm, 5 % above (UPN 320-400)."""
    return 0.08 if x["h"] <= 300 else 0.05


def per_UPN(x):
    """DIN 1026-1 taper-flange channel with root radius r1 and toe radius r2.

    a = atan(slope), k = (1 - sin a) / cos a = tan(45 deg - a/2), theta = pi/2 - a:
        P = 2h + 2b + 2(b - tw) k - 2(r1 + r2)(2k - theta)
    (back, outer flange faces, sloped inner flange faces less the rise they take out of the web
    and toe faces, then four fillets that each turn through theta). UPN 100 -> 0.3720 m2/m.
    """
    a = math.atan(upn_slope(x))
    k = (1 - math.sin(a)) / math.cos(a)
    theta = PI / 2 - a
    p = 2 * x["h"] + 2 * x["b"] + 2 * (x["b"] - x["tw"]) * k - 2 * (x["r_1"] + x["r_2"]) * (2 * k - theta)
    return p / 1000


def per_angle(x, l1, l2):
    """Rolled angle (EN 10056-1): root radius r1 and ONE toe radius r2 per toe, on the inner toe corner.

    The heel and the outer toe corners are sharp.  t >= r2:  P = 2(L1 + L2) - (2 - pi/2)(r1 + 2 r2)
    (independent of t).  t < r2: each toe is a single r2 arc centred on the outer face:
        P = 2(L1 + L2) - 2t - (2 - pi/2) r1 + 2[r2 asin(t/r2) - r2 + sqrt(r2^2 - t^2)]
    (equal to the first form at t = r2).
    """
    t, r1, r2 = x["t"], x["r_1"], x["r_2"]
    if t >= r2:
        p = 2 * (l1 + l2) - (2 - PI / 2) * (r1 + 2 * r2)
    else:
        p = 2 * (l1 + l2) - 2 * t - (2 - PI / 2) * r1 \
            + 2 * (r2 * math.asin(t / r2) - r2 + math.sqrt(r2 * r2 - t * t))
    return p / 1000


def angle_area_cm2(x, l1, l2):
    """Cross-section area of the same outline (t >= r2), to check the toe-radius count against the published A."""
    t, r1, r2 = x["t"], x["r_1"], x["r_2"]
    return (t * (l1 + l2 - t) + (1 - PI / 4) * (r1 * r1 - 2 * r2 * r2)) / 100


def ro_cold(t):
    return 2 * t if t <= 6 else (2.5 * t if t <= 10 else 3 * t)


def per_rect(h, b, ro):
    return (2 * (h + b) - (8 - 2 * PI) * ro) / 1000


families = []
mismatch = []     # (family, designation, published, computed) where they differ by more than 3 %
pub_dev = {}      # family -> list of (computed - published) / published, for the summary


skipped = {}      # family -> source keys a family's filter did not take (other series in the same table)


def add_family(fid, prefix, name, group, std, items, variant=None):
    fam = {"id": fid, "catalogue": "EN", "prefix": prefix, "name": name, "group": group, "std": std}
    if variant:   # told apart in line labels when two families share a prefix and sizes (hot-finished / cold-formed)
        fam["variant"] = variant
    fam["items"] = items
    families.append(fam)


def check_published(fid, lab, a, x):
    """Compare a computed perimeter with the source's published surface area, when it has one."""
    pub = x.get("surface_area_per_metre")
    if not pub:
        return
    pub_dev.setdefault(fid, []).append((a - pub) / pub)
    if abs(a - pub) / pub > 0.03:
        mismatch.append((fid, lab, pub, round(a, 3)))


def row(lab, x, a, dims):
    return [lab, round(x["mass_per_metre"], 2), round(a, 4), dims]


def rows_I(fid, data, keep, dims, per=per_I):
    items = []
    for key, x in data.items():
        lab = keep(key, x)
        if lab is None:
            skipped.setdefault(fid, []).append(key)
            continue
        a = per(x)
        check_published(fid, lab, a, x)
        items.append(row(lab, x, a, dims(x)))
    return items


dims4 = lambda x: "×".join(fmt(v) for v in (x["h"], x["b"], x["tw"], x["tf"]))

# I-sections ---------------------------------------------------------------------------
add_family("UB", "UB", "Universal beams (UB)", "I-sections", "BS 4-1 / EN 10365",
           rows_I("UB", load("UK/data/UB.json"), lambda k, x: k, dims4))
add_family("UC", "UC", "Universal columns (UC)", "I-sections", "BS 4-1 / EN 10365",
           rows_I("UC", load("UK/data/UC.json"), lambda k, x: k, dims4))

ipe = load("EU/data/IPE.json")
add_family("IPE", "IPE", "IPE beams", "I-sections", "EN 10365 / DIN 1025-5",
           rows_I("IPE", ipe, lambda k, x: (f"IPE {m.group(1)}" if (m := re.fullmatch(r"IPE-(\d+)", k)) else None), dims4))
add_family("IPEA", "IPE A", "IPE A beams (light)", "I-sections", "EN 10365",
           rows_I("IPEA", ipe, lambda k, x: (f"IPE A {m.group(1)}" if (m := re.fullmatch(r"IPE-(\d+)-A", k)) else None), dims4))
add_family("IPEO", "IPE O", "IPE O beams (heavy)", "I-sections", "EN 10365",
           rows_I("IPEO", ipe, lambda k, x: (f"IPE O {m.group(1)}" if (m := re.fullmatch(r"IPE-(\d+)-O", k)) else None), dims4))

he = load("EU/data/HE.json")
for letter, nm in (("A", "HEA (light) H-sections"), ("B", "HEB H-sections"), ("M", "HEM (heavy) H-sections")):
    add_family("HE" + letter, "HE" + letter, nm, "I-sections", "EN 10365 / DIN 1025",
               rows_I("HE" + letter, he, lambda k, x, L=letter: (f"HE{L} {m.group(1)}" if (m := re.fullmatch(r"HE-(\d+)-" + L, k)) else None), dims4))

# Channels -----------------------------------------------------------------------------
add_family("PFC", "PFC", "Parallel flange channels (PFC)", "Channels", "BS EN 10365",
           rows_I("PFC", load("UK/data/PFC.json"), lambda k, x: k, dims4, per=per_PFC))
# The source's published UPN column is 7-13 % below the outline and is not used; it is only summarised below.
# Published DIN 1026 UNP surface areas (wermac.org table, read through web-search snippets) exist for UPN 100-300
# only and are used as a check, not as data. UPN 50/65/80 and 320-400 have no published value: geometry alone.
# Some ArcelorMittal-style tables give UPN 120 = 0.434 and UPN 180 = 0.611 instead; those disagree with the
# DIN dimensions and with the table below (0.434 is UPN 120's zero-taper perimeter), so they are not used.
UPN_PUBLISHED = {100: 0.372, 120: 0.429, 140: 0.487, 160: 0.545, 180: 0.603, 200: 0.660, 220: 0.718, 240: 0.776,
                 260: 0.833, 280: 0.891, 300: 0.949}
items = []
upn_dev = []      # (source column - outline) / outline
upn_pub_dev = {}  # h -> (outline - published) / published
upn_zero_taper = {}
for k, x in load("EU/data/UPN.json", need=("h", "b", "tw", "tf", "r_1", "r_2")).items():
    m = re.fullmatch(r"UPN-(\d+)", k)
    h = int(m.group(1))
    a = per_UPN(x)
    if x.get("surface_area_per_metre"):
        upn_dev.append((x["surface_area_per_metre"] - a) / a)
    if h in UPN_PUBLISHED:
        upn_pub_dev[h] = (round(a, 4) - UPN_PUBLISHED[h]) / UPN_PUBLISHED[h]
    upn_zero_taper[h] = (2 * x["h"] + 4 * x["b"] - 2 * x["tw"] - (4 - PI) * (x["r_1"] + x["r_2"])) / 1000
    items.append(row(f"UPN {h}", x, a, dims4(x)))
add_family("UPN", "UPN", "Taper flange channels (UPN)", "Channels", "DIN 1026-1", items)
# The header's UPN provenance sentences depend on these holding.
if set(upn_pub_dev) != set(UPN_PUBLISHED) or max(map(abs, upn_pub_dev.values())) > 0.0007:
    sys.exit(f"UPN outline vs published DIN 1026 UNP table: {upn_pub_dev}")
if round(upn_zero_taper[120], 3) != 0.434:
    sys.exit(f"UPN 120 zero-taper perimeter {upn_zero_taper[120]:.4f} no longer explains the published 0.434")

# Angles -------------------------------------------------------------------------------
angle_dev = []    # (outline area - published A) / published A
# The only published angle painting areas found: BlastOne (Australian sections), read through web-search snippets
# only. They give one value per leg size for every thickness, as this outline does; used as a check, not as data.
ANGLE_PUBLISHED = {(125.0, 75.0): 0.392, (150.0, 90.0): 0.471}
angle_pub_dev = {}  # designation -> (published - outline) / outline


def angle_row(x, l1, l2):
    if x["t"] >= x["r_2"]:
        angle_dev.append((angle_area_cm2(x, l1, l2) - x["A"]) / x["A"])
    lab = f"{fmt(l1)}x{fmt(l2)}x{fmt(x['t'])}"
    a = per_angle(x, l1, l2)
    if (l1, l2) in ANGLE_PUBLISHED:
        angle_pub_dev[lab] = (ANGLE_PUBLISHED[(l1, l2)] - round(a, 4)) / round(a, 4)
    return row(lab, x, a, lab.replace("x", "×"))


ANGLE_FIELDS = ("t", "r_1", "r_2", "A", "mass_per_metre")
items = []
for k, x in load("UK/data/L_EQUAL.json", need=ANGLE_FIELDS).items():
    l = float(k.split("x")[0])
    items.append(angle_row(x, l, l))
add_family("EA", "L", "Equal angles", "Angles", "EN 10056-1", items)
items = []
for k, x in load("UK/data/L_UNEQUAL.json", need=ANGLE_FIELDS).items():
    l1, l2, _ = k.split("x")
    items.append(angle_row(x, float(l1), float(l2)))
add_family("UA", "L", "Unequal angles", "Angles", "EN 10056-1", items)
# The header's BlastOne sentence depends on this holding.
if set(ANGLE_PUBLISHED) - {tuple(float(v) for v in d.split("x")[:2]) for d in angle_pub_dev} \
        or max(map(abs, angle_pub_dev.values())) > 0.004:
    sys.exit(f"angle outline vs published BlastOne painting areas: {angle_pub_dev}")

# Hollow sections ----------------------------------------------------------------------


def hollow(fid, fname, kind, ro_fn):
    items = []
    for k, x in load(fname).items():
        if kind == "CHS":
            d = x["d"]
            a = PI * d / 1000
            lab = f"{fmt(d)}x{fmt(x['t'])}"
        elif kind == "SHS":
            b = float(x["hxh"].split("x")[0])
            a = per_rect(b, b, ro_fn(x["t"]))
            lab = f"{fmt(b)}x{fmt(b)}x{fmt(x['t'])}"
        else:
            h, b = map(float, x["hxb"].split("x"))
            a = per_rect(h, b, ro_fn(x["t"]))
            lab = f"{fmt(h)}x{fmt(b)}x{fmt(x['t'])}"
        check_published(fid, lab, a, x)
        items.append(row(lab, x, a, lab.replace("x", "×")))
    return items


hf, cf = (lambda t: 1.5 * t), ro_cold
add_family("SHS-HF", "SHS", "Square hollow sections, hot-finished (SHS)", "Hollow sections", "EN 10210-2", hollow("SHS-HF", "UK/data/HFSHS.json", "SHS", hf), "hot-finished")
add_family("RHS-HF", "RHS", "Rectangular hollow sections, hot-finished (RHS)", "Hollow sections", "EN 10210-2", hollow("RHS-HF", "UK/data/HFRHS.json", "RHS", hf), "hot-finished")
add_family("CHS-HF", "CHS", "Circular hollow sections, hot-finished (CHS)", "Hollow sections", "EN 10210-2", hollow("CHS-HF", "UK/data/HFCHS.json", "CHS", hf), "hot-finished")
add_family("SHS-CF", "SHS", "Square hollow sections, cold-formed (SHS)", "Hollow sections", "EN 10219-2", hollow("SHS-CF", "UK/data/CFSHS.json", "SHS", cf), "cold-formed")
add_family("RHS-CF", "RHS", "Rectangular hollow sections, cold-formed (RHS)", "Hollow sections", "EN 10219-2", hollow("RHS-CF", "UK/data/CFRHS.json", "RHS", cf), "cold-formed")
add_family("CHS-CF", "CHS", "Circular hollow sections, cold-formed (CHS)", "Hollow sections", "EN 10219-2", hollow("CHS-CF", "UK/data/CFCHS.json", "CHS", cf), "cold-formed")

# Contract checks and natural size order -------------------------------------------------
_NUM = re.compile(r"\d+-\d+/\d+|\d+/\d+|\d+(?:\.\d+)?")


def _val(tok):
    if "-" in tok:
        whole, frac = tok.split("-")
        return int(whole) + _val(frac)
    if "/" in tok:
        a, b = tok.split("/")
        return int(a) / int(b)
    return float(tok)


def natural_key(item):
    """Numbers in the designation left to right (fractions by value), then mass."""
    return (tuple(_val(t) for t in _NUM.findall(item[0])), item[1])


for f in families:
    f["items"].sort(key=natural_key)
    seen = set()
    for it in f["items"]:
        d, mass, area = it[0], it[1], it[2]
        if d in seen:
            sys.exit(f"{f['id']}: duplicate designation {d}")
        seen.add(d)
        if re.search(r",|\.\d*0(x|$)", d):
            sys.exit(f"{f['id']} {d}: designation number format")
        if not (mass > 0 and area > 0 and 1.5 <= area / mass * 1000 <= 250):
            sys.exit(f"{f['id']} {d}: implausible mass {mass} / area {area}")
if len({f["id"] for f in families}) != len(families):
    sys.exit("duplicate family id")

header = """/* EN / BS structural steel sections: mass and painted surface area per metre.
 *
 * GENERATED FILE, do not edit by hand. Regenerate (with pipes.js) from the repository root with:
 *   python3 -I tools/build_data.py <fluids-extract-dir> <steelsnakes-extract-dir> <out-dir>
 * and copy <out-dir>/sections.js here.
 *
 * Catalogue "EN" (rank 2): UB/UC to BS 4-1 / EN 10365, IPE and HE to EN 10365 / DIN 1025, PFC, UPN to
 * DIN 1026-1, angles to EN 10056-1, hollow sections to EN 10210-2 (hot-finished) / EN 10219-2 (cold-formed).
 * It pushes onto root.PaintDB.sections, which the SAISC and AISC catalogue files share.
 *
 * Item: [designation, mass kg/m, painted area m2/m, main dimensions mm].
 * Painted area = the FULL outer perimeter of the cross-section per metre of length (every face, toe ends included).
 *
 * Source: nominal dimensions, root/toe radii and masses from the open-source `steelsnakes` Python package
 * (UK and EU tables); nothing was copied from the SAISC Red Book. Areas are COMPUTED from the dimensions
 * (mm, then / 1000 for m2/m), not taken from a published surface column:
 *   UB, UC, IPE, HE (4 root fillets r):  2h + 4b - 2tw - 4(2 - pi/2) r
 *   PFC (2 root fillets r):              2h + 4b - 2tw - (4 - pi) r
 *   UPN, DIN 1026-1 taper flanges (slope 8 % up to h = 300, 5 % above), root r1 and toe r2:
 *     a = atan(slope), k = (1 - sin a) / cos a, theta = pi/2 - a:  2h + 2b + 2(b - tw) k - 2(r1 + r2)(2k - theta)
 *   Angles, EN 10056-1 (root r1, one toe radius r2 on the inner corner of each toe; heel and outer toe corners
 *     sharp):  2(L1 + L2) - (2 - pi/2)(r1 + 2 r2);  if t < r2 (each toe one r2 arc):
 *     2(L1 + L2) - 2t - (2 - pi/2) r1 + 2[r2 asin(t/r2) - r2 + sqrt(r2^2 - t^2)]
 *   SHS / RHS:  2(h + b) - (8 - 2 pi) ro, outer corner radius ro = 1.5t hot-finished; cold-formed 2t (t <= 6),
 *     2.5t (t <= 10), 3t above;   CHS:  pi D
 *
 * Provenance and trust: the I, H, PFC and hollow areas agree with the source's published surface-area column
 * within 3 % (almost all within 1 %), except UB 1016x305x584 and 914x305x576, whose published 3.69 / 3.46 m2/m
 * do not fit their own dimensions. The source's UPN column is 7-13 % below the outline and is not used.
 * UPN 100-300 (11 sizes) agree with the published DIN 1026 UNP surface areas (wermac.org table, read through
 * web-search snippets) within 0.07 % (UPN 100 = 0.372); UPN 50, 65, 80 and 320-400 have no published check and
 * rest on the DIN 1026-1 dimensions and the outline formula alone. Some ArcelorMittal-style tables list
 * UPN 120 = 0.434 and UPN 180 = 0.611 m2/m; those disagree with the DIN dimensions and with the wermac table
 * (0.429 / 0.603), and 0.434 is the zero-taper (parallel-flange) perimeter of UPN 120, so the geometric
 * 0.429 / 0.6027 are kept. Angles have no published surface column; the two-toe-radius outline is confirmed by
 * the published section areas (within 0.5 %), by the outlines Autodesk Robot's SAISC drawing scripts give for
 * the same sizes (100x100x10 = 0.3897, 200x200x24 = 0.7845), and by published painting areas read through
 * web-search snippets only: 100x100x10 = 0.390 m2/m (Wermac), and BlastOne's Australian 125x75 = 0.392 and
 * 150x90 = 0.471 m2/m for every thickness, i.e. thickness-independent like this outline and within 0.4 % of it
 * (0.3906 / 0.4697). Hollow sections: EN 10210 hot-finished tubes use ro = 1.5t at every wall; EN 10219
 * cold-formed tubes 2t / 2.5t / 3t for t <= 6 / <= 10 / > 10 mm. A family with "variant" is labelled with it
 * ("SHS 100x100x8 (EN, hot-finished)"), because the hot-finished and cold-formed tables share sizes.
 * Availability varies by mill and year and designations/dimensions can differ slightly by edition: confirm any
 * section that matters against your supplier's current tables.
 */
"""
catalogue = {"id": "EN", "rank": 2, "name": "EN / BS (Europe and UK)", "short": "EN",
             "source": "Nominal dimensions and masses of the BS 4 / EN 10365 / DIN 1026 / EN 10056 / EN 10210 / "
                       "EN 10219 ranges from the open-source steelsnakes package, with painted areas computed from "
                       "the section geometry."}
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
lines = [header.rstrip("\n"),
         "(function (root) {",
         "  root.PaintDB = root.PaintDB || {};",
         "  const S = (root.PaintDB.sections = root.PaintDB.sections || {});",
         f"  (S.catalogues = S.catalogues || []).push({dump(catalogue)});",
         "  (S.families = S.families || []).push(",
         ",\n".join("    " + dump(f) for f in families),
         "  );",
         '})(typeof globalThis !== "undefined" ? globalThis : window);']
with open(out_dir / "sections.js", "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(lines) + "\n")

# a renamed source key would silently drop rows: hold every family to its known size
EXPECTED = {"UB": 107, "UC": 46, "IPE": 18, "IPEA": 18, "IPEO": 13, "HEA": 24, "HEB": 24, "HEM": 24, "PFC": 16,
            "UPN": 18, "EA": 42, "UA": 39, "SHS-HF": 123, "RHS-HF": 161, "CHS-HF": 103, "SHS-CF": 96, "RHS-CF": 137,
            "CHS-CF": 106}
got = {f["id"]: len(f["items"]) for f in families}
if got != EXPECTED:
    sys.exit(f"family sizes changed: {got}")
n = sum(len(f["items"]) for f in families)
print(f"sections: {len(families)} families, {n} items")
for fid, keys in skipped.items():
    print(f"  {fid:7s} skipped {len(keys)} source keys of other series, e.g. {', '.join(sorted(keys)[:4])}")
for f in families:
    print(f"  {f['id']:7s} {len(f['items']):4d}")
print("published-vs-computed (computed - published) / published:")
for fid, devs in pub_dev.items():
    print(f"  {fid:7s} n={len(devs):4d}  min {min(devs) * 100:+6.2f} %  max {max(devs) * 100:+6.2f} %  "
          f"within 1 %: {sum(abs(d) <= 0.01 for d in devs)}")
print(f"  UPN     n={len(upn_dev):4d}  source column vs outline {min(upn_dev) * 100:+.1f} to {max(upn_dev) * 100:+.1f} % "
      "(not used)")
print(f"  UPN     n={len(upn_pub_dev):4d}  outline vs published DIN 1026 UNP (UPN {min(upn_pub_dev)}-{max(upn_pub_dev)}) "
      f"max |dev| {max(map(abs, upn_pub_dev.values())) * 100:.3f} %; UPN 120 zero-taper {upn_zero_taper[120]:.4f}")
print(f"  UA      n={len(angle_pub_dev):4d}  published BlastOne vs outline "
      f"{min(angle_pub_dev.values()) * 100:+.2f} to {max(angle_pub_dev.values()) * 100:+.2f} % (thickness-independent)")
print(f"  angles  n={len(angle_dev):4d}  outline section area vs published A {min(angle_dev) * 100:+.2f} to "
      f"{max(angle_dev) * 100:+.2f} % (two toe radii)")
print("published-vs-computed mismatches >3%:", mismatch)
