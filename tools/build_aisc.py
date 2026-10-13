"""Generate data/sections-aisc.js: the AISC (US imperial) steel-section catalogue for the paint calculator.

Run with (Python 3 standard library only, deterministic):

    python3 -I tools/build_aisc.py <aisc2001.stp> <steelsnakes-extract-dir> <out.js>

    <aisc2001.stp>             the CIMsteel STEP file "AISC2001.stp" (SCI, June 2001) that lists the AISC EDI
                               Standard Nomenclature designations (names only, no dimensions); kept in
                               sources/aisc2001.stp.
    <steelsnakes-extract-dir>  an unpacked steelsnakes wheel (0.0.1a11); the AISC Shapes Database v16.0
                               is read from <dir>/steelsnakes/US/data/*.json (inches, lb/ft).
    <out.js>                   output, normally data/sections-aisc.js

What it does
  1. Reads the 1,923 designations of the 2001 list and fixes the five known naming slips explicitly
     (ALIAS_2001).
  2. Drops double angles (2L, 597 names; enter the single L with quantity 2) and PIPE (37 names; the
     same OD and wall as the ASME B36.10M pipes already in data/pipes.js).
  3. Matches every other name to its AISC v16 row. The 12 superseded 2001 W36 x 16.5 jumbos and their
     12 WT18 halves are not in v16 and use the 2001 dimensions in SUPERSEDED_W36 below. The 40
     discontinued HSS sizes are not in v16 and are computed from the dimensions in their names.
  4. Computes the painted perimeter of every row (formulae in perimeter_* below and in the header of
     the output file), m2/m = inches x 0.0254, kg/m = lb/ft x 0.45359237 / 0.3048 (= 1.488164).
  5. Checks counts, unique designations and m2 per tonne, prints a per-family summary and writes the
     browser script.

The method for each family is the reconciled AISC verdict of the section-data review (W/M/S/HP: AISC
PB; WT/MT/ST: PB(parent)/2 + tw; C/MC: sloped-flange geometry; L: root fillet subtracted from the
sharp outline; rectangular HSS: corner radius 2 x tdes; round HSS: pi x OD). The output was
cross-checked row by row against an independent per-row recomputation made during review (not in this repo):
same labels, area to 0.00005 m2/m and mass to 0.01 kg/m, except the area of 40 round HSS rows. Those
rows (OD 2.375 ... 12.750) use the exact OD of the designation, while that recomputation, like the
first version of this script, took the v16 OD column, which AISC rounds to 3 significant figures
(12.750 -> 12.8). AISC's own A and D/t use the exact OD.
"""
import json
import math
import os
import re
import sys
from collections import Counter, OrderedDict
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

IN = 0.0254                       # m per inch: perimeter (in) x 0.0254 = painted area (m2 per m)
MM = 25.4                         # mm per inch
LBFT = 0.45359237 / 0.3048        # kg/m per lb/ft = 1.488164
STEEL = 490.0 / 144.0             # lb/ft per in2 of steel (490 lb/ft3) = 3.4028
K8 = 8 - 2 * math.pi              # 4 rounded corners: 4 x (2 - pi/2)
KP = 2 - math.pi / 2              # one rounded 90-degree corner

# ----------------------------------------------------------------------------------------------- 2001-only data
# Naming slips in the 2001 file. Each one denotes the same section as the v16 name on the right.
ALIAS_2001 = {
    "HSS6X6X3125": "HSS6X6X.3125",              # decimal point missing in the wall (= HSS6x6x5/16)
    "HSS2-1/2X21/2X.125": "HSS2-1/2X2-1/2X.125",  # '21/2' typed for '2-1/2' (= HSS2-1/2x2-1/2x1/8)
    "HSS1-7/8X.145": "HSS1.900X.145",           # 2001 name rounds the 1.900 in OD to 1-7/8
    "HSS1-11/16X.140": "HSS1.660X.140",         # 2001 name rounds the 1.660 in OD to 1-11/16
    "ST3X8.63": "ST3X8.6",                      # v16 lists the same tee (cut from S6x17.25) as 8.6 lb/ft
}

# The 2001 W36 x 16.5 "jumbo" series. AISC replaced it from the 13th edition with sections about 0.6 in
# deeper (same bf, tw, tf); the 2001 shapes are therefore not in v16. Dimensions (in) and area (in2)
# are the 2001 values as transcribed in the OpeningDesign/BIM_Profiles Revit W-shape catalog (rows
# "W36X798 - Obsolete" ...). They agree within 0.05 in with the detailing fractions in
# denisgomes/psi wshapes.csv for all 12 rows, and with the successor's root fillet they reproduce the
# 2001 area within 0.4 in2 and the nominal weight within 1 lb/ft. These are the dimensions the
# section-data review used. The fillet radius is not tabulated for the
# 2001 shapes; r = kdes - tf of the v16 successor (same flanges and web) is used, read from v16.
#   name: (d, bf, tw, tf, A, k, v16 successor)
SUPERSEDED_W36 = OrderedDict([
    ("W36X798", (41.97, 17.990, 2.380, 4.290, 235.0, 5.563, "W36X802")),
    ("W36X650", (40.47, 17.575, 1.970, 3.540, 191.0, 4.813, "W36X652")),
    ("W36X527", (39.21, 17.220, 1.610, 2.910, 155.0, 4.188, "W36X529")),
    ("W36X439", (38.26, 16.965, 1.360, 2.440, 129.0, 3.688, "W36X441")),
    ("W36X393", (37.80, 16.830, 1.220, 2.200, 116.0, 3.438, "W36X395")),
    ("W36X359", (37.40, 16.730, 1.120, 2.010, 105.0, 3.250, "W36X361")),
    ("W36X328", (37.09, 16.630, 1.020, 1.850, 96.4, 3.125, "W36X330")),
    ("W36X300", (36.74, 16.655, 0.945, 1.680, 88.3, 2.938, "W36X302")),
    ("W36X280", (36.52, 16.595, 0.885, 1.570, 82.4, 2.813, "W36X282")),
    ("W36X260", (36.26, 16.550, 0.840, 1.440, 76.5, 2.688, "W36X262")),
    ("W36X245", (36.08, 16.510, 0.800, 1.350, 72.1, 2.625, "W36X247")),
    ("W36X230", (35.90, 16.470, 0.760, 1.260, 67.6, 2.500, "W36X231")),
])

EXPECTED = OrderedDict([  # rows per family, from the reconciled verdict
    ("W", 267), ("M", 12), ("S", 28), ("HP", 11), ("C", 31), ("MC", 34), ("L", 125),
    ("WT", 267), ("MT", 12), ("ST", 28), ("HSSR", 333), ("HSSC", 141)])
EXPECTED_EXCLUDED = {"2L": 597, "PIPE": 37}

FAMILIES = OrderedDict([  # key: (id, prefix, name, group)
    ("W", ("US-W", "W", "W shapes", "I-sections")),
    ("M", ("US-M", "M", "M shapes", "I-sections")),
    ("S", ("US-S", "S", "S shapes (American standard)", "I-sections")),
    ("HP", ("US-HP", "HP", "HP bearing piles", "I-sections")),
    ("C", ("US-C", "C", "C channels (American standard)", "Channels")),
    ("MC", ("US-MC", "MC", "MC channels (miscellaneous)", "Channels")),
    ("L", ("US-L", "L", "Angles (L)", "Angles")),
    ("WT", ("US-WT", "WT", "WT tees (cut from W)", "Tees")),
    ("MT", ("US-MT", "MT", "MT tees (cut from M)", "Tees")),
    ("ST", ("US-ST", "ST", "ST tees (cut from S)", "Tees")),
    ("HSSR", ("US-HSSR", "HSS", "Rectangular and square HSS", "Hollow sections")),
    ("HSSC", ("US-HSSC", "HSS", "Round HSS", "Hollow sections")),
])
V16 = "AISC Shapes Database v16"
STD = {
    "W": V16 + " (2001 list); 12 superseded 2001 W36 sizes from 2001 dimensions",
    "WT": V16 + " (2001 list); 12 superseded 2001 WT18 sizes from 2001 dimensions",
    "L": V16 + " (2001 list); root fillet deducted, toe radius not published",
    "C": V16 + " (2001 list); sloped-flange geometry",
    "MC": V16 + " (2001 list); sloped-flange geometry",
    "HSSR": V16 + " (2001 list); 13 discontinued 2001 sizes from nominal dimensions",
    "HSSC": V16 + " (2001 list); 27 discontinued 2001 sizes from nominal dimensions",
}
NOTE_DISCONTINUED = "2001 size; not in current AISC tables"
NOTE_C3 = "mass as designated (3.5 lb/ft); the AISC area (1.09 in2) implies about 6% more; paint area unaffected"


# ----------------------------------------------------------------------------------------------- helpers
def num(tok):
    """'3-1/2' -> 3.5, '5/16' -> 0.3125, '.3125' / '12.5' / '3' -> float."""
    m = re.fullmatch(r"(\d+)-(\d+)/(\d+)", tok)
    if m:
        return int(m.group(1)) + int(m.group(2)) / int(m.group(3))
    m = re.fullmatch(r"(\d+)/(\d+)", tok)
    if m:
        return int(m.group(1)) / int(m.group(2))
    return float(tok)


def fmt(x, nd=1):
    """Compact number: 7.0 -> '7', 7.62 -> '7.6' (nd decimals at most)."""
    s = "%.*f" % (nd, x)
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def dims_mm(*inches):
    """Inch values -> 'a×b×c' in mm to 0.1 mm, rounded half-up from the exact decimal product (1/4 in =
    6.35 -> 6.4, 12.750 in = 323.85 -> 323.9), as ASME B36.10M-2018 and data/pipes.js round. Rounding the
    binary float v * 25.4 would send such ties either way (6.35 -> 6.3 but 273.05 -> 273.1)."""
    return "×".join(fmt(float((Decimal(repr(v)) * Decimal(repr(MM))).quantize(Decimal("0.1"), ROUND_HALF_UP)))
                    for v in inches)


def frac(x):
    """Inch value as an AISC fraction: 0.3125 -> '5/16', 3.5 -> '3-1/2', 12 -> '12'."""
    f = Fraction(x).limit_denominator(16)
    if abs(float(f) - x) > 1e-3:
        return ("%.3f" % x).lstrip("0")
    w, r = divmod(f.numerator, f.denominator)
    if r == 0:
        return str(w)
    return ("%d-%d/%d" % (w, r, f.denominator)) if w else ("%d/%d" % (r, f.denominator))


def label(v16_key):
    return v16_key.replace("X", "x")


def sort_key(item):
    nums = [num(t) for t in re.sub(r"^[A-Z]+", "", item[0]).split("x")]
    return nums, item[1]


# ----------------------------------------------------------------------------------------------- perimeters (in)
def perimeter_w_closed(d, bf, tw, tf, r):
    """Rolled I with parallel flanges and 4 root fillets r (toes square): AISC PB in closed form."""
    return 2 * d + 4 * bf - 2 * tw - K8 * r


def perimeter_hss_rect(H, B, tdes):
    """Rectangular/square HSS, outside corner radius 2 x tdes (the AISC convention that reproduces A)."""
    return 2 * (H + B) - K8 * 2 * tdes


def perimeter_angle(d, b, t, kdes):
    """Angle: sharp outline 2(d + b) (= AISC PB) less the root fillet r1 = kdes - t, nearest 1/16 in."""
    r1 = round((kdes - t) * 16) / 16
    return 2 * (d + b) - KP * r1, r1


def _unit(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l = math.hypot(dx, dy)
    return dx / l, dy / l


def _fillet(C, u1, u2, r, n=24):
    """Points of a fillet of radius r at the corner C between the incoming direction u1 and the
    outgoing direction u2, traced as an n-segment polygon."""
    phi = math.acos(max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1])))   # turning angle
    if r <= 0 or phi < 1e-9:
        return [C]
    T = r * math.tan(phi / 2)
    P1 = (C[0] - u1[0] * T, C[1] - u1[1] * T)
    P2 = (C[0] + u2[0] * T, C[1] + u2[1] * T)
    bx, by = u2[0] - u1[0], u2[1] - u1[1]
    bl = math.hypot(bx, by)
    dist = r / math.cos(phi / 2)
    O = (C[0] + bx / bl * dist, C[1] + by / bl * dist)
    a1 = math.atan2(P1[1] - O[1], P1[0] - O[0])
    da = math.atan2(P2[1] - O[1], P2[0] - O[0]) - a1
    while da > math.pi:
        da -= 2 * math.pi
    while da < -math.pi:
        da += 2 * math.pi
    return [(O[0] + r * math.cos(a1 + da * i / n), O[1] + r * math.sin(a1 + da * i / n)) for i in range(n + 1)]


def channel_outline(s, tan):
    """C/MC outline: inner flange faces sloped at tan (tf = average thickness at mid free length), root
    fillets r = (kdes - t_root)/tan(b/2) with b = 90 deg - slope, toe radius ignored (not published).
    Returns (perimeter, centroid x from the back of the web) of the outline polygon."""
    d, bf, tw, tf, kd = s["d"], s["bf"], s["tw"], s["tf"], s["kdes"]
    Lf = bf - tw
    t_root = tf + Lf / 2 * tan
    t_toe = tf - Lf / 2 * tan
    phi = math.pi / 2 - math.atan(tan)
    r = max((kd - t_root) / math.tan(phi / 2), 0.0)
    h = d / 2
    toe_top, root_top, root_bot, toe_bot = (bf, h - t_toe), (tw, h - t_root), (tw, -h + t_root), (bf, -h + t_toe)
    pts = [(0, h), (bf, h), toe_top]
    pts += _fillet(root_top, _unit(toe_top, root_top), _unit(root_top, root_bot), r)
    pts += _fillet(root_bot, _unit(root_top, root_bot), _unit(root_bot, toe_bot), r)
    pts += [toe_bot, (bf, -h), (0, -h)]
    A = Sx = P = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        c = x0 * y1 - x1 * y0
        A += c
        Sx += (x0 + x1) * c
        P += math.hypot(x1 - x0, y1 - y0)
    A /= 2
    return P, abs(Sx / (6 * A))


def perimeter_channel(s):
    """Sloped-flange channel perimeter, = 2d + 2bf + 2(bf - tw)(1/cos a - tan a) - 2r[2 tan(b/2) - b].
    AISC does not tabulate the flange slope, so tan a is fitted to the shape's own centroid x (tan a from
    0 to 0.25 in steps of 0.000625, first best wins); for C it comes out close to the nominal 1:6. AISC's
    own PB for C/MC is not used: it is -1.5 to +5.7% from this geometry (above it on every row but C4x4.5) and
    for C10x30 and MC12x50 even above
    the sharp-cornered parallel-flange maximum.
    This is the section-data review's procedure reproduced exactly, including the fillets
    traced as 24-segment polygons. Integrating true arcs instead was tried on all 72 v16 C/MC shapes: at a
    given slope the perimeter rises by at most 0.0004 in, and the fitted slope moves one grid step on
    C3x3.5, C3x4.1 (a tie to 1e-7 in) and MC7x19.1. Four rows then change by 0.0001 m2/m after rounding
    (C3x4.1 and MC7x19.1 down, MC12x31 and MC13x35 up). The true-arc value is marginally more exact, but
    the difference is far below the resolution of the fit itself (x is tabulated to 0.001 in, which alone
    leaves the slope uncertain by 1-3 grid steps), so the reviewed values are kept."""
    best = None
    for i in range(401):
        tan = i * 0.25 / 400
        P, xbar = channel_outline(s, tan)
        e = abs(xbar - s["x"])
        if best is None or e < best[0]:
            best = (e, tan, P)
    return best[2], best[1]


# ----------------------------------------------------------------------------------------------- inputs
def read_names(stp_path):
    txt = open(stp_path, encoding="latin-1").read()
    names = re.findall(r"ITEM_REFERENCE_STANDARD\s*\(\s*'([^']*)'", txt)
    if not names:
        sys.exit("no ITEM_REFERENCE_STANDARD designations found in %s" % stp_path)
    return names


def load_v16(snakes_dir):
    d = os.path.join(snakes_dir, "steelsnakes", "US", "data")
    if not os.path.isdir(d):
        d = snakes_dir  # also accept the data directory itself
    db = {}
    for f in sorted(os.listdir(d)):
        if f.endswith(".json"):
            with open(os.path.join(d, f), encoding="utf-8") as fh:
                db[f[:-5]] = json.load(fh)
    for need in ("W", "M", "S", "HP", "C", "MC", "WT", "MT", "ST", "L_EQUAL", "L_UNEQUAL",
                 "HSS_RCT", "HSS_SQR", "HSS_RND"):
        if need not in db:
            sys.exit("missing %s.json in %s" % (need, d))
    return db


def classify(name):
    """2001 name (after ALIAS_2001) -> (family, numeric key) or (excluded group, None)."""
    n = name.upper()
    if n.startswith("2L"):
        return "2L", None
    if n.startswith("PIPE"):
        return "PIPE", None
    T = r"([\d./\-]+)"
    m = re.fullmatch(r"L%sX%sX%s" % (T, T, T), n)
    if m:
        return "L", tuple(num(g) for g in m.groups())
    m = re.fullmatch(r"HSS%sX%sX%s" % (T, T, T), n)
    if m:
        return "HSSR", tuple(num(g) for g in m.groups())
    m = re.fullmatch(r"HSS%sX%s" % (T, T), n)
    if m:
        return "HSSC", tuple(num(g) for g in m.groups())
    m = re.fullmatch(r"(W|M|S|HP|C|MC|WT|MT|ST)([\d.]+)X([\d.]+)", n)
    if m:
        return m.group(1), (float(m.group(2)), float(m.group(3)))
    sys.exit("cannot parse 2001 designation %r" % name)


def build_index(db):
    """family -> list of (numeric key, v16 key, v16 row)."""
    files = {"W": ["W"], "M": ["M"], "S": ["S"], "HP": ["HP"], "C": ["C"], "MC": ["MC"], "WT": ["WT"],
             "MT": ["MT"], "ST": ["ST"], "L": ["L_EQUAL", "L_UNEQUAL"], "HSSR": ["HSS_RCT", "HSS_SQR"],
             "HSSC": ["HSS_RND"]}
    idx = {}
    for fam, fl in files.items():
        lst = []
        for f in fl:
            for k, row in db[f].items():
                fam2, key = classify(k)
                assert fam2 == fam, (f, k, fam2)
                lst.append((key, k, row))
        idx[fam] = lst
    return idx


def find(idx, fam, key):
    tol = 0.0021 if fam in ("HSSR", "HSSC") else 1e-6   # 2001 walls are 3-decimal (.312 for 5/16)
    hits = [(k, row) for key2, k, row in idx[fam]
            if len(key2) == len(key) and all(abs(a - b) <= tol for a, b in zip(key, key2))]
    if len(hits) > 1:
        sys.exit("ambiguous v16 match for %s %r: %r" % (fam, key, [h[0] for h in hits]))
    return hits[0] if hits else (None, None)


def parent_of(db, fam, tee_key):
    """Parent I-section of a tee: depth x 2 and weight x 2 (nearest weight, within 1 lb/ft)."""
    m = re.fullmatch(r"[A-Z]+([\d.]+)X([\d.]+)", tee_key)
    d2, w2 = float(m.group(1)) * 2, float(m.group(2)) * 2
    cands = []
    for k, row in db[fam].items():
        m2 = re.fullmatch(r"[A-Z]+([\d.]+)X([\d.]+)", k)
        if abs(float(m2.group(1)) - d2) < 0.01:
            cands.append((abs(float(m2.group(2)) - w2), k, row))
    cands.sort(key=lambda c: (c[0], c[1]))
    if not cands or cands[0][0] > 1.0:
        sys.exit("no parent %s for %s" % (fam, tee_key))
    return cands[0][1], cands[0][2]


# ----------------------------------------------------------------------------------------------- build
def build(stp_path, snakes_dir):
    names = read_names(stp_path)
    db = load_v16(snakes_dir)
    idx = build_index(db)
    out = {f: [] for f in FAMILIES}
    excluded = Counter()
    stats = Counter()
    w2001 = {}  # superseded W36: name -> dict(d, bf, tw, tf, r, P)
    for n, (d, bf, tw, tf, A, k, succ) in SUPERSEDED_W36.items():
        s = db["W"][succ]
        assert abs(s["bf"] - bf) < 0.06 and abs(s["tw"] - tw) < 0.06 and abs(s["tf"] - tf) < 0.06, n
        r = s["kdes"] - s["tf"]
        w2001[n] = dict(d=d, bf=bf, tw=tw, tf=tf, r=r, P=perimeter_w_closed(d, bf, tw, tf, r), succ=succ,
                        dsucc=s["d"])

    seen = set()
    for raw in names:
        if raw in seen:
            sys.exit("duplicate 2001 designation %s" % raw)
        seen.add(raw)
        name = ALIAS_2001.get(raw, raw)
        fam, key = classify(name)
        if fam in ("2L", "PIPE"):
            excluded[fam] += 1
            continue
        if raw != name:
            stats["2001 name fixed"] += 1
        k16, s = find(idx, fam, key)
        note = None
        mass_lbft = s["W"] if s else None

        if fam in ("W", "M", "S", "HP"):
            if s is None:
                if fam != "W" or name not in w2001:
                    sys.exit("no v16 row for %s" % name)
                w = w2001[name]
                des, P = label(name), w["P"]
                mass_lbft = key[1]
                dims = dims_mm(w["d"], w["bf"], w["tw"], w["tf"])
                note = "2001 size; superseded by %s (d +%.1f in)" % (label(w["succ"]), w["dsucc"] - w["d"])
                stats["W superseded"] += 1
            else:
                des, P = label(k16), s["PB"]
                dims = dims_mm(s["d"], s["bf"], s["tw"], s["tf"])
        elif fam in ("C", "MC"):
            if s is None:
                sys.exit("no v16 row for %s" % name)
            P, tan = perimeter_channel(s)
            des, dims = label(k16), dims_mm(s["d"], s["bf"], s["tw"], s["tf"])
            if k16 == "C3X3.5":
                note = NOTE_C3
        elif fam == "WT":
            if s is None:
                pn = "W%gX%g" % (key[0] * 2, key[1] * 2)
                if pn not in w2001:
                    sys.exit("no v16 row for %s" % name)
                w = w2001[pn]
                P = w["P"] / 2 + w["tw"]
                des, mass_lbft = label(name), key[1]
                dims = dims_mm(w["d"] / 2, w["bf"], w["tw"], w["tf"])
                succ = "WT%gX%g" % (key[0], float(w["succ"].split("X")[1]) / 2)
                if succ not in db["WT"]:
                    sys.exit("successor %s of %s not in v16" % (succ, name))
                # tee depth is half the W depth, so the successor tee is (d_W successor - d_W 2001)/2 deeper
                note = "2001 size; superseded by %s (d +%.1f in)" % (label(succ), (w["dsucc"] - w["d"]) / 2)
                stats["WT superseded"] += 1
            else:
                pn, p = parent_of(db, "W", k16)
                assert (p["bf"], p["tw"], p["tf"]) == (s["bf"], s["tw"], s["tf"]), (k16, pn)
                P = p["PB"] / 2 + p["tw"]
                des, dims = label(k16), dims_mm(s["d"], s["bf"], s["tw"], s["tf"])
        elif fam in ("MT", "ST"):
            if s is None:
                sys.exit("no v16 row for %s" % name)
            pn, p = parent_of(db, "M" if fam == "MT" else "S", k16)
            P = p["PB"] / 2 + p["tw"]
            des, dims = label(k16), dims_mm(s["d"], s["bf"], s["tw"], s["tf"])
        elif fam == "L":
            if s is None:
                sys.exit("no v16 row for %s" % name)
            P, r1 = perimeter_angle(s["d"], s["b"], s["t"], s["kdes"])
            # v16 L_UNEQUAL stores d = short leg, b = long leg; show legs in name order (long first)
            des, dims = label(k16), dims_mm(max(s["d"], s["b"]), min(s["d"], s["b"]), s["t"])
        elif fam == "HSSR":
            H, B, tn = key
            if s is None:  # discontinued: geometry from the name, tdes = 0.93 tnom, nominal mass on tnom
                td = round(0.93 * tn, 3)
                ro, ri = 2 * tn, tn
                area_nom = (H * B - (4 - math.pi) * ro ** 2) - ((H - 2 * tn) * (B - 2 * tn) - (4 - math.pi) * ri ** 2)
                mass_lbft = round(STEEL * area_nom, 2)
                des, note = "HSS%sx%sx%s" % (frac(H), frac(B), frac(tn)), NOTE_DISCONTINUED
                stats["HSS rect discontinued"] += 1
            else:
                H, B, td = s["Ht"], s["B"], s["tdes"]
                des = label(k16)
            P = perimeter_hss_rect(H, B, td)
            dims = dims_mm(H, B, td)
        elif fam == "HSSC":
            OD, tn = key
            if s is None:
                td = round(0.93 * tn, 3)  # as v16 tabulates tdes (0.125 -> 0.116)
                mass_lbft = round(STEEL * math.pi * (OD - tn) * tn, 2)
                des, note = "HSS%.3fx%.3f" % (OD, tn), NOTE_DISCONTINUED
                stats["HSS round discontinued"] += 1
            else:
                # The exact OD is the one in the v16 designation (HSS12.750X0.500 -> 12.750). The v16 OD
                # column is rounded to 3 significant figures (12.8, 10.8, 9.63, 2.38 ...) and is not used;
                # AISC's own A and D/t are computed from the exact OD.
                OD, td = float(re.fullmatch(r"HSS([\d.]+)X[\d.]+", k16).group(1)), s["tdes"]
                assert abs(OD - s["OD"]) <= 0.05 + 1e-9, (k16, s["OD"])
                stats["HSS round exact OD from name"] += abs(OD - s["OD"]) > 1e-9
                des = label(k16)
            P = math.pi * OD
            dims = dims_mm(OD, td)
        else:
            raise AssertionError(fam)

        item = [des, round(mass_lbft * LBFT, 2), round(P * IN, 4), dims]
        if note:
            item.append(note)
        out[fam].append(item)

    for fam in out:
        out[fam].sort(key=sort_key)
    return out, excluded, stats, len(names)


def check(out, excluded):
    errors = []
    for fam, n in EXPECTED.items():
        if len(out[fam]) != n:
            errors.append("%s: %d rows, expected %d" % (fam, len(out[fam]), n))
    for g, n in EXPECTED_EXCLUDED.items():
        if excluded[g] != n:
            errors.append("excluded %s: %d, expected %d" % (g, excluded[g], n))
    for fam, items in out.items():
        prefix = FAMILIES[fam][1]
        des = [it[0] for it in items]
        dup = [d for d, c in Counter(des).items() if c > 1]
        if dup:
            errors.append("%s: duplicate designations %s" % (fam, dup))
        for it in items:
            d, kg, m2, dims = it[:4]
            if not d.startswith(prefix) or "X" in d or "," in d:
                errors.append("%s: bad designation %r" % (fam, d))
            if not (kg > 0 and m2 > 0):
                errors.append("%s: non-positive value %r" % (fam, it))
            elif not 1.5 <= m2 / kg * 1000 <= 250:
                errors.append("%s: %s m2 per tonne %.1f out of range" % (fam, d, m2 / kg * 1000))
            if not re.fullmatch(r"\d+(\.\d)?(×\d+(\.\d)?)+", dims):
                errors.append("%s: bad dims %r" % (fam, dims))
    if errors:
        sys.exit("CHECK FAILED:\n  " + "\n  ".join(errors))


HEADER = r"""/* AISC (US imperial) steel sections: mass and painted surface area per metre.
 *
 * GENERATED FILE - do not edit by hand. Regenerate with:
 *     python3 -I tools/build_aisc.py sources/aisc2001.stp <steelsnakes-extract-dir> data/sections-aisc.js
 *
 * Each item: [designation, mass kg/m, painted area m2/m, dimensions mm, note?]. The painted area is the
 * full outer perimeter of the cross-section (all faces) per metre of length. Dimensions are d x bf x tw x tf
 * (I-shapes, channels and tees, tee depth for tees), d x b x t (angles, long leg first), H x B x t
 * (rectangular HSS) and OD x t (round HSS); HSS walls are the AISC design wall tdes. Inches are converted
 * to mm and rounded half-up to 0.1 mm (1/4 in = 6.4, 12.750 in = 323.9).
 *
 * SOURCES
 *  - Which sizes: the AISC EDI Standard Nomenclature list, June 2001 edition, as distributed by the Steel
 *    Construction Institute in the CIMsteel STEP file "AISC2001.stp" (1,923 designations, names only;
 *    kept in sources/aisc2001.stp).
 *  - Dimensions, weights and AISC's own painted perimeter PB: the AISC Shapes Database v16.0 as packaged
 *    in the open-source `steelsnakes` Python package (0.0.1a11, US/data/*.json, inches and lb/ft).
 *  - 2001-only shapes (not in v16): see below.
 *  Designations are the AISC Manual names with a lower-case x (W8x31, L3-1/2x2-1/2x1/4, HSS6x6x5/16,
 *  HSS6.625x0.280). No metric names are invented.
 *
 * WHAT IS INCLUDED (1,289 rows)
 *  W 267, M 12, S 28, HP 11, C 31, MC 34, L 125, WT 267, MT 12, ST 28, rectangular/square HSS 333,
 *  round HSS 141.
 *  Excluded from the 2001 list: double angles 2L (597 names; enter the single L with quantity 2) and
 *  PIPE (37 names; the same OD and wall as the ASME B36.10M pipes already in data/pipes.js).
 *  Five 2001 names that differ from v16 are mapped to the section they denote: HSS6X6X3125 -> HSS6x6x5/16,
 *  HSS2-1/2X21/2X.125 -> HSS2-1/2x2-1/2x1/8, HSS1-7/8X.145 -> HSS1.900x0.145, HSS1-11/16X.140 ->
 *  HSS1.660x0.140 (the 2001 names round the OD), ST3X8.63 -> ST3x8.6.
 *
 * PAINTED PERIMETER P (inches; m2/m = P x 0.0254)
 *  W, M, S, HP  P = AISC PB, the database's shape perimeter (as used for fire protection in AISC Design
 *               Guide 19). For W it equals 2d + 4bf - 2tw - (8 - 2 pi)(kdes - tf) within 0.5%; W24x68 =
 *               2.0726 m2/m agrees with the calculator's own UB 610x229x101 (2.0728).
 *  WT, MT, ST   P = PB(parent W/M/S)/2 + tw. AISC's own WT PB is not used: it is up to 1.8% below the
 *               tee geometry (median -0.57%), an artefact of the AISC table.
 *  C, MC        Sloped-flange geometry: 2d + 2bf + 2(bf - tw)(1/cos a - tan a) - 2r[2 tan(b/2) - b] with
 *               b = 90 deg - a, root fillet r from kdes, the flange slope tan a fitted to the shape's own
 *               centroid x (about 1:6 for C), toe radius ignored. AISC PB is not used for C/MC: it is
 *               -1.5 to +5.7% from this geometry (above it on every row but C4x4.5) and internally
 *               inconsistent.
 *  L            P = 2(d + b) - (2 - pi/2) r1, r1 = kdes - t rounded to 1/16 in (AISC PB is the sharp
 *               2(d + b)). AISC publishes no toe radius; the true value may be a further 0.5-1.5% lower.
 *  HSS rect     P = 2(H + B) - (8 - 2 pi) x 2 tdes (outside corner radius 2 tdes, which reproduces the
 *               AISC area A).
 *  HSS round    P = pi x OD, with the exact OD of the designation (HSS12.750x0.500: 12.750 in). The
 *               v16 OD column is rounded to 3 significant figures (12.8, 10.8, 9.63, 2.38 ...) and is
 *               not used; AISC's own area A and D/t are computed from the exact OD.
 *
 * MASS (kg/m = lb/ft x 0.45359237/0.3048 = lb/ft x 1.488164)
 *  The AISC nominal weight W. For HSS this is the ASTM A500 nominal mass on the nominal wall tnom, while
 *  the AISC area uses tdes = 0.93 tnom, so HSS kg/m is about 5-8% above 7850 x A. C3x3.5 keeps its
 *  designated 3.5 lb/ft although its tabulated area (1.09 in2) implies about 6% more (flagged on the row).
 *
 * 2001-ONLY ROWS (64, each flagged with a note)
 *  - 12 W36 x 16.5 jumbos (W36x798 ... W36x230) and their 12 WT18 halves. AISC replaced them from the
 *    13th edition with sections about 0.6 in deeper (same bf, tw, tf), so they are kept under their 2001
 *    labels and computed from the 2001 dimensions: P = 2d + 4bf - 2tw - (8 - 2 pi) r with r = kdes - tf
 *    of the v16 successor, and P(WT18) = P(2001 W36)/2 + tw. The 2001 d, bf, tw, tf are those of the
 *    OpeningDesign/BIM_Profiles Revit W catalog, which agree within 0.05 in with denisgomes/psi
 *    wshapes.csv and reproduce the 2001 nominal weights within 1 lb/ft (table in tools/build_aisc.py).
 *    Mass is the 2001 nominal weight. The printed AISC Manual could not be consulted.
 *  - 40 HSS sizes not in current AISC tables (13 rectangular, 27 round), computed from the name:
 *    tdes = 0.93 tnom, mass on tnom with corner radius 2 tnom (rectangular) or pi (OD - t) t (round),
 *    x 3.4028 lb/ft per in2.
 *
 * TRUST: the methods above are the reconciled verdict of a two-sided review of this data set. All 1,289
 * rows agree with the per-row table the reviewers computed with their own scripts (same labels; area to
 * 0.00005 m2/m; mass to 0.01 kg/m), except the area of 40 round HSS rows (OD 2.375, 2.875, 5.563, 6.625,
 * 6.875, 8.625, 9.625, 10.750 and 12.750 in). That table used the rounded v16 OD column; this file uses
 * the exact OD, which changes those areas by -0.47% to +0.05%. Values rest on the AISC v16 database as
 * transcribed by steelsnakes (WT PB identical in a second transcription); aisc.org was not reachable.
 * Toe radii of L, C, MC and S are unpublished and ignored, so those areas may be up to ~1.5% high, which
 * over-estimates paint slightly. Confirm any section that matters against the current AISC Steel
 * Construction Manual or the mill certificate.
 */
"""


def write_js(out, path):
    cat = OrderedDict([("id", "AISC"), ("rank", 3), ("name", "AISC (US imperial)"), ("short", "AISC"),
                       ("source", "AISC Shapes Database v16 dimensions for the sizes in the AISC 2001 EDI "
                                  "designation list; painted perimeters computed per family (see header).")])
    fam_lines = []
    for fam, (fid, prefix, name, group) in FAMILIES.items():
        obj = OrderedDict([("id", fid), ("catalogue", "AISC"), ("prefix", prefix), ("name", name),
                           ("group", group), ("std", STD.get(fam, V16 + " (2001 list)")), ("items", out[fam])])
        fam_lines.append("    " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    body = HEADER
    assert body.count("*/") == 1 and body.rstrip().endswith("*/")
    body += "(function (root) {\n"
    body += "  root.PaintDB = root.PaintDB || {};\n"
    body += "  const S = (root.PaintDB.sections = root.PaintDB.sections || {});\n"
    cat_json = json.dumps(cat, ensure_ascii=False, separators=(",", ":"))
    body += "  (S.catalogues = S.catalogues || []).push(%s);\n" % cat_json
    body += "  (S.families = S.families || []).push(\n"
    body += ",\n".join(fam_lines) + "\n"
    body += "  );\n"
    body += '})(typeof globalThis !== "undefined" ? globalThis : window);\n'
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(body)


def main(argv):
    if len(argv) != 4:
        sys.exit(__doc__)
    stp, snakes, out_path = argv[1:4]
    out, excluded, stats, n_names = build(stp, snakes)
    check(out, excluded)
    write_js(out, out_path)
    total = 0
    print("AISC 2001 list: %d designations; excluded %s" % (n_names, dict(excluded)))
    print("%-8s %-31s %5s  %-15s %-15s %s" % ("id", "name", "rows", "kg/m", "m2/m", "notes"))
    for fam, (fid, prefix, name, group) in FAMILIES.items():
        items = out[fam]
        total += len(items)
        kg = [it[1] for it in items]
        m2 = [it[2] for it in items]
        print("%-8s %-31s %5d  %6.2f-%-8.2f %6.4f-%-8.4f %d" % (
            fid, name, len(items), min(kg), max(kg), min(m2), max(m2), sum(len(it) == 5 for it in items)))
    print("total rows %d; %s" % (total, dict(stats)))
    print("wrote %s" % out_path)


if __name__ == "__main__":
    main(sys.argv)
