"""Generate data/sections-saisc.js (the SAISC catalogue) from a SAISC section database for Robot.

Run with:  python3 -I tools/build_saisc.py <Saiscpro.xml> <out.js>
e.g.       python3 -I tools/build_saisc.py sources/Saiscpro.xml data/sections-saisc.js

Input: "Saiscpro.xml", an Autodesk Robot section database of SAISC (Southern African) sections, supplied by the
project owner and kept in sources/Saiscpro.xml. Lengths in it are metres, MASS is kg/m and SURF
is Robot's "painting surface" in m2/m.

Every Robot family was checked row by row (perimeters recomputed from the Robot PDL outline scripts, closed-form
formulae and the file's own section areas). The rules below follow those verdicts: where the verdict says the
file's SURF is right it is used as it stands (and this script re-checks it against the closed form); where SURF is
wrong the closed-form full painted perimeter is used. Each family builder names the verdict reason. Duplicates
are dropped only where the verdict names them, and the drop counts are asserted. The SAISC Red Book was not used.

Output: one browser script that pushes the SAISC catalogue and its families onto root.PaintDB.sections (the
shared data contract; several data/sections-*.js files load in any order). Python 3 standard library only;
deterministic. Prints a per-family summary (rows kept, dropped, corrected) to stdout.
"""
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, OrderedDict

PI = math.pi
K_ANGLE = 2 - PI / 2  # length lost by rounding one 90 deg corner, per unit radius (2r - pi r / 2)


# ----------------------------------------------------------------------------- helpers
def fmt(x, nd=3):
    """Compact decimal: 2.0 -> '2', 6.30 -> '6.3', 152.4 -> '152.4' (nd decimals max, no trailing zeros)."""
    s = f"{x:.{nd}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def fnum(row, key):
    return float(row[key])


def mm(row, key):
    """Field in mm, rounded to 0.001 mm to strip binary noise (0.0762 m -> 76.2)."""
    return round(float(row[key]) * 1000, 3)


def dims(*vals):
    return "×".join(fmt(v) for v in vals)


def desig(*vals):
    return "x".join(fmt(v) for v in vals)


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


def rel(a, b):
    return abs(a - b) / b


class Family:
    """One output family plus the bookkeeping for the summary."""

    def __init__(self, fid, prefix, name, group, std, sources):
        self.meta = OrderedDict(id=fid, catalogue="SAISC", prefix=prefix, name=name, group=group, std=std)
        self.sources = sources  # Robot family codes read
        self.items = []
        self.source_rows = 0
        self.dropped = Counter()  # reason -> count
        self.area_changed = 0  # area differs from the file's SURF beyond 4-dp rounding
        self.area_changed_big = 0  # ... by more than 0.5 %
        self.mass_changed = 0
        self.mass_changes = []  # (designation, file MASS, mass used) for every row whose mass differs
        self.area_ratios = []  # area / SURF - 1 for every row whose area differs from SURF
        self.examples = []  # (designation, SURF, area, mass_file, mass) for the report

    def add(self, row, designation, mass, area, dim, note=None):
        surf = fnum(row, "SURF")
        mass_file = fnum(row, "MASS")
        item = [designation, round(mass, 2), round(area, 4), dim]
        if note:
            item.append(note)
        self.items.append(item)
        area_changed = round(area, 4) != round(surf, 4)
        mass_changed = round(mass, 2) != round(mass_file, 2)
        if area_changed:
            self.area_changed += 1
            self.area_ratios.append(round(area, 4) / surf - 1)
            if rel(area, surf) > 0.005:
                self.area_changed_big += 1
        if mass_changed:
            self.mass_changed += 1
            self.mass_changes.append((designation, mass_file, round(mass, 2)))
        if area_changed or mass_changed:
            self.examples.append((designation, surf, round(area, 4), mass_file, round(mass, 2)))

    def finish(self, expected):
        names = Counter(i[0] for i in self.items)
        clash = [n for n, c in names.items() if c > 1]
        if clash:
            sys.exit(f"{self.meta['id']}: duplicate designations {clash}; resolve from the verdict, do not drop silently")
        if len(self.items) != expected:
            sys.exit(f"{self.meta['id']}: {len(self.items)} rows, the verdict keeps {expected}")
        self.items.sort(key=natural_key)
        obj = OrderedDict(self.meta)
        obj["items"] = self.items
        return obj


# ----------------------------------------------------------------------------- read the XML
def load_shapes(path):
    root = ET.parse(path).getroot()
    data = root.find("body").find("data")
    tables = {t.get("name"): t.findall("row") for t in data.findall("table")}
    by_family = {}
    for r in tables["Shape"]:
        by_family.setdefault(r.get("NAME"), []).append(dict(r.attrib))
    return by_family


# ----------------------------------------------------------------------------- closed forms (lengths in mm)
def p_i_section(H, B, tw, r):
    """I/H outline with 4 root fillets, square toes (Robot PDL types 10/20): 2H + 4B - 2tw + (2 pi - 8) r."""
    return 2 * H + 4 * B - 2 * tw + (2 * PI - 8) * r


def p_tee(H, B, r):
    """Tee cut from an I/H (PDL 26/29), H = tee depth, includes the cut stem end: 2B + 2H - (4 - pi) r."""
    return 2 * B + 2 * H - (4 - PI) * r


def p_pfc(H, B, tw, r):
    """Parallel flange channel, root fillets only, square toes (PDL 37): 2H + 4B - 2tw - (4 - pi) r."""
    return 2 * H + 4 * B - 2 * tw - (4 - PI) * r


def p_taper_channel(H, B, tw, r1, r2, alpha):
    """Taper flange channel: P = 2H + 2B + 2(B - tw)k - 2(r1 + r2)(2k - theta), k = (1 - sin a)/cos a, theta = pi/2 - a."""
    k = (1 - math.sin(alpha)) / math.cos(alpha)
    theta = PI / 2 - alpha
    return 2 * H + 2 * B + 2 * (B - tw) * k - 2 * (r1 + r2) * (2 * k - theta)


def p_taper_joist(H, B, tw, r1, r2, alpha):
    """Taper flange I-beam: P = 2H + 2B + 4L(1 - sin a)/cos a + 4(r1 + r2)(pi/2 - a - cos a),
    L = (B - tw)/2 - (r1 + r2)(1 - sin a). The flange thickness cancels out."""
    L = (B - tw) / 2 - (r1 + r2) * (1 - math.sin(alpha))
    return 2 * H + 2 * B + 4 * L * (1 - math.sin(alpha)) / math.cos(alpha) + 4 * (r1 + r2) * (PI / 2 - alpha - math.cos(alpha))


def angle_toe(t, r2):
    """Change in perimeter at one toe against the sharp L. t >= r2: a quarter-round inner toe corner,
    -(2 - pi/2) r2. t < r2: the PDL draws one r2 arc centred on the outer face instead."""
    if t >= r2:
        return -K_ANGLE * r2
    return -t + r2 * math.asin(t / r2) - r2 + math.sqrt(r2 * r2 - t * t)


def p_angle(L1, L2, t1, t2, r1, r2):
    """Full angle outline incl. both toe end faces: 2(L1 + L2) - (2 - pi/2) r1 + one rounded inner corner per toe."""
    return 2 * (L1 + L2) - K_ANGLE * r1 + angle_toe(t1, r2) + angle_toe(t2, r2)


def hollow_radii(t):
    """Outer/inner corner radius: EN 10219 cold-formed 2t/t (t <= 6) and 2.5t/1.5t (t <= 10); EN 10210 hot-finished
    1.5t/t for the 12.5 and 16 mm walls."""
    if t <= 6:
        return 2.0 * t, 1.0 * t
    if t <= 10:
        return 2.5 * t, 1.5 * t
    return 1.5 * t, 1.0 * t


def p_hollow(H, B, t):
    ro, _ = hollow_radii(t)
    return 2 * (H + B) - (8 - 2 * PI) * ro


def mass_hollow(H, B, t):
    """kg/m = 7850 x [2t(H + B - 2t) - (4 - pi)(ro^2 - ri^2)] (mm2 -> m2)."""
    ro, ri = hollow_radii(t)
    return 7850e-6 * (2 * t * (H + B - 2 * t) - (4 - PI) * (ro * ro - ri * ri))


def p_lipped_c(H, B, L, t, ri):
    """Thin cold-formed lipped C (and Z): 2 x centre line + 2 lip edges, 4 bends each shortening by rc(2 - pi/2):
    2(H + 2B + 2L) - 6t - 8 rc K, rc = ri + t/2."""
    return 2 * (H + 2 * B + 2 * L) - 6 * t - 8 * (ri + t / 2) * K_ANGLE


def p_lipped_l(H, B, L, t, ri):
    """Thin cold-formed lipped angle, 3 bends: 2(H + B + 2L) - 4t - 6 rc K."""
    return 2 * (H + B + 2 * L) - 4 * t - 6 * (ri + t / 2) * K_ANGLE


def check_surf(fam, row, closed, tol):
    """Rows that keep SURF: confirm SURF is the closed-form outline the verdict verified."""
    surf_mm = fnum(row, "SURF") * 1000
    if rel(surf_mm, closed) > tol:
        sys.exit(f"{fam}: {row['NAME1']} SURF {surf_mm:.2f} mm vs closed form {closed:.2f} mm (> {tol:.4%}); the verdict assumed they agree")


# ----------------------------------------------------------------------------- the families
EXPECTED = OrderedDict([  # rows each verdict keeps
    ("SA-UB", 41), ("SA-UC", 20), ("SA-HP", 13), ("SA-IPE", 6), ("SA-IPEAA", 6), ("SA-ITF", 7),
    ("SA-PFC", 11), ("SA-UPN", 11), ("SA-CBS", 5), ("SA-EA", 51), ("SA-UA", 24), ("SA-STI", 35), ("SA-STH", 16),
    ("SA-SHS", 125), ("SA-RHS", 120), ("SA-CHS", 157), ("SA-CC", 90), ("SA-CZ", 35), ("SA-CL", 20),
])

# i-and-h verdict: SURF of these four IPF rows is the sharp 2H+4B-2tw (no fillet term) and RA = 12.7 mm is wrong;
# recompute with the BS 4 root radius (m).
IPF_BS4_RADIUS = {"762x267x147": 0.0165, "838x292x176": 0.0178, "914x305x201": 0.0191, "914x419x343": 0.0241}
# i-and-h verdict: flange width typo (246.0 for 256.0, 247.5 for 257.5; SX, Iy, Iz and mass all confirm). Metres.
HP_B_FIX = {"254x254x63": (0.2460, 0.2560), "254x254x71": (0.2475, 0.2575)}
# joists verdict: flange slope fitted to each row's own A, Iy, Iz.
ITF_SLOPE = {"127x76x13": math.radians(5), "152x89x17": math.radians(5), "178x102x22": math.radians(5),
             "203x102x25": math.radians(5), "203x152x52": math.atan(0.14), "254x152x59": math.atan(0.14),
             "305x152x66": math.atan(0.14)}
# channels-taper verdict + refutation: keep the DIN 1026-1 nominal masses. 5 of the 11 differ from the file
# (UPN 100 10.5, 120 13.3, 160 18.9, 280 41.9, 300 46.1); the header lists them from the data.
UPN_DIN_MASS = {100: 10.6, 120: 13.4, 140: 16.0, 160: 18.8, 180: 22.0, 200: 25.3, 220: 29.4, 240: 33.2,
                260: 37.9, 280: 41.8, 300: 46.2}
# channels-taper verdict: 5 deg BS 4 taper, except 178x54 (an SA section; its own properties fit a 3.4 % slope).
CBS_SLOPE = {"76x38": math.radians(5), "127x64": math.radians(5), "152x76": math.radians(5),
             "178x54": math.atan(0.034), "381x102": math.radians(5)}
# channels-taper verdict designation: h x b x true kg/m, the kg/m being the row's own mass to 0.1 kg/m, so the label
# always agrees with the mass column. 381x102 is therefore '381x102x55' (file MASS 55, 7850 x SX = 55.03); BS 4:1971
# names it 381x102x55.10 (A 70.19 cm2), but the verdict keeps the file's mass, so the label follows the file.
CBS_NOTE = {"381x102": "Obsolete BS 4:1971 size; check availability"}
# pfc-and-tees refutation: current SA 260x90 and 300x100 PFCs are different (lighter) sections.
PFC_NOTE = {"260x90": "Older SAISC section; current SA 260x90 is 34.8 kg/m",
            "300x100": "Older SAISC section; current SA 300x100 has tw 9, tf 16.5 mm"}
# pfc-and-tees verdict: these STI names carry an odd mass suffix; label with the standard parent UB.
STI_PARENT = {"305x102x29": "305x102x28", "305x165x41": "305x165x40", "406x178x75": "406x178x74",
              "457x191x75": "457x191x74", "457x191x90": "457x191x89", "533x210x93": "533x210x92"}
# tube-and-coldformed verdict: 48 rounded-OD CHS rows that duplicate an exact-OD row with the same wall.
CHS_ROUNDED_DUPES = {
    "63 -> 63.5": [1647, 1648, 1649, 1650],
    "76 -> 76.2": [1498, 1499, 1652, 1500, 1653],
    "89 -> 88.9": [1501, 1654, 1502, 1503, 1504],
    "102 -> 101.6": [1655, 1656, 1507, 1657, 1658],
    "114 -> 114.3": [1508, 1659, 1509, 1510, 1511],
    "140 -> 139.7": [1662, 1513, 1514, 1515],
    "152 -> 152.4": [1516, 1663, 1664],
    "165 -> 165.1": [1517, 1518, 1519, 1520],
    "177 -> 177.8": [1666, 1667],
    "194 -> 193.7": [1668, 1669, 1670],
    "219 -> 219.1": [1673, 1521, 1523, 1524, 1525],
    "355 -> 356": [1538, 1539, 1540],
}
# tube-and-coldformed verdict + refutation: 76.2x4 file mass 7.17 is high; 7850 pi (D - t) t = 7.12.
CHS_MASS_FIX = {"1951": ("76.2x4", 7.12)}


def ihdims(H, B, tw, tf):
    return dims(H, B, tw, tf)


def same_geometry(a, b, tol_mm=0.31):
    return all(abs(mm(a, k) - mm(b, k)) <= tol_mm for k in ("H", "B", "EA"))


def build_i_sections(F):
    fams = []

    # --- UB: i-and-h verdict. SURF (= closed form within 0.0054 %) for the UB rows. IPF is the old SAISC listing
    # of the same beams: 31 rows match a UB row (geometry within 0.3 mm) and are dropped; the 10 IPF-only sizes
    # are relabelled UB. The 4 large IPF rows get the BS 4 root radius (their SURF has no fillet deduction).
    ub = Family("SA-UB", "UB", "Universal beams (UB)", "I-sections", "BS 4-1 sizes (SAISC)", ["UB", "IPF"])
    ub_rows = F["UB"]
    for r in ub_rows:
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        check_surf("SA-UB", r, p_i_section(H, B, tw, ra), 1e-4)
        ub.add(r, desig(float(r["DIM1"]), float(r["DIM2"]), float(r["DIM3"])), fnum(r, "MASS"), fnum(r, "SURF"), ihdims(H, B, tw, tf))
    matched = set()
    for r in F["IPF"]:
        twins = [u for u in ub_rows if same_geometry(r, u)]
        if twins:
            if len(twins) != 1 or twins[0]["ID"] in matched:
                sys.exit(f"IPF {r['NAME1']}: ambiguous UB twin")
            matched.add(twins[0]["ID"])
            ub.dropped["IPF duplicate of a UB row (old SAISC 'I' listing)"] += 1
            continue
        d = desig(float(r["DIM1"]), float(r["DIM2"]), float(r["DIM3"]))
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        if d in IPF_BS4_RADIUS:
            area = p_i_section(H, B, tw, IPF_BS4_RADIUS[d] * 1000) / 1000
        else:
            check_surf("SA-UB", r, p_i_section(H, B, tw, ra), 1e-4)
            area = fnum(r, "SURF")
        ub.add(r, d, fnum(r, "MASS"), area, ihdims(H, B, tw, tf))
    ub.source_rows = len(ub_rows) + len(F["IPF"])
    if sum(ub.dropped.values()) != 31:
        sys.exit(f"SA-UB: {sum(ub.dropped.values())} IPF duplicates, the verdict names 31")
    fams.append(ub)

    # --- UC: i-and-h verdict. SURF. HPF is the old SAISC 'H' listing of the same columns (mislabelled
    # 'H-Bearing Piles'): 17 rows identical to UC are dropped, 305x305x198/240/283 are relabelled UC.
    uc = Family("SA-UC", "UC", "Universal columns (UC)", "I-sections", "BS 4-1 sizes (SAISC)", ["UC", "HPF"])
    uc_rows = F["UC"]
    for r in uc_rows:
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        check_surf("SA-UC", r, p_i_section(H, B, tw, ra), 1e-4)
        uc.add(r, desig(float(r["DIM1"]), float(r["DIM2"]), float(r["DIM3"])), fnum(r, "MASS"), fnum(r, "SURF"), ihdims(H, B, tw, tf))
    matched = set()
    for r in F["HPF"]:
        twins = [u for u in uc_rows if same_geometry(r, u, 0.001)]
        if twins:
            if len(twins) != 1 or twins[0]["ID"] in matched:
                sys.exit(f"HPF {r['NAME1']}: ambiguous UC twin")
            matched.add(twins[0]["ID"])
            uc.dropped["HPF duplicate of a UC row (old SAISC 'H' listing)"] += 1
            continue
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        check_surf("SA-UC", r, p_i_section(H, B, tw, ra), 1e-4)
        uc.add(r, desig(float(r["DIM1"]), float(r["DIM2"]), float(r["DIM3"])), fnum(r, "MASS"), fnum(r, "SURF"), ihdims(H, B, tw, tf))
    uc.source_rows = len(uc_rows) + len(F["HPF"])
    if sum(uc.dropped.values()) != 17:
        sys.exit(f"SA-UC: {sum(uc.dropped.values())} HPF duplicates, the verdict names 17")
    fams.append(uc)

    # --- HP bearing piles: i-and-h verdict. SURF, except 254x254x63/71 whose flange width B is a typo.
    hp = Family("SA-HP", "HP", "H-bearing piles (UBP)", "I-sections", "BS 4-1 UBP (SAISC)", ["HP"])
    for r in F["HP"]:
        d = desig(float(r["DIM1"]), float(r["DIM2"]), float(r["DIM3"]))
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        if d in HP_B_FIX:
            bad, good = HP_B_FIX[d]
            if abs(fnum(r, "B") - bad) > 1e-9:
                sys.exit(f"HP {d}: expected the typo B = {bad}, found {r['B']}")
            B = good * 1000
            area = p_i_section(H, B, tw, ra) / 1000
        else:
            check_surf("SA-HP", r, p_i_section(H, B, tw, ra), 1e-4)
            area = fnum(r, "SURF")
        hp.add(r, d, fnum(r, "MASS"), area, ihdims(H, B, tw, tf))
    hp.source_rows = len(F["HP"])
    fams.append(hp)

    # --- IPE: i-and-h verdict. SURF; size in DIM1 only.
    ipe = Family("SA-IPE", "IPE", "IPE beams", "I-sections", "EN 10365 / DIN 1025-5 (SAISC)", ["IPE"])
    for r in F["IPE"]:
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        check_surf("SA-IPE", r, p_i_section(H, B, tw, ra), 1e-4)
        ipe.add(r, "IPE " + fmt(float(r["DIM1"])), fnum(r, "MASS"), fnum(r, "SURF"), ihdims(H, B, tw, tf))
    ipe.source_rows = len(F["IPE"])
    fams.append(ipe)

    # --- IPEA rows are the IPE AA extra-light series (NAME2 'IPE-AA'), not EN IPE A: i-and-h verdict. SURF.
    ipeaa = Family("SA-IPEAA", "IPE AA", "IPE AA beams (light)", "I-sections", "IPE AA extra-light (SAISC)", ["IPEA"])
    for r in F["IPEA"]:
        if "IPE-AA" not in r["NAME2"]:
            sys.exit(f"IPEA {r['NAME1']}: NAME2 does not say IPE-AA")
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        check_surf("SA-IPEAA", r, p_i_section(H, B, tw, ra), 1e-4)
        ipeaa.add(r, "IPE AA " + fmt(float(r["DIM1"])), fnum(r, "MASS"), fnum(r, "SURF"), ihdims(H, B, tw, tf))
    ipeaa.source_rows = len(F["IPEA"])
    fams.append(ipeaa)

    # --- ITF joists: joists verdict. SURF is unusable on all 7 rows (one-row offset; 127x76x13 shows 3.44 m2/m)
    # and the PDL script hard-codes 14 %. Closed-form taper-flange perimeter at each row's fitted slope.
    itf = Family("SA-ITF", "ITF", "Taper flange I-beams (ITF, legacy)", "I-sections",
                 "BS 4 joists, legacy imperial (SAISC)", ["ITF"])
    for r in F["ITF"]:
        d = desig(float(r["DIM1"]), float(r["DIM2"]), float(r["DIM3"]))
        H, B, tw, tf, ra, rs = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA", "RS"))
        a = ITF_SLOPE[d]
        taper = "5\u00b0" if abs(a - math.radians(5)) < 1e-9 else "8\u00b0"
        itf.add(r, d, fnum(r, "MASS"), p_taper_joist(H, B, tw, ra, rs, a) / 1000, ihdims(H, B, tw, tf),
                f"Legacy RSJ ({taper} taper flanges); check availability")
    itf.source_rows = len(F["ITF"])
    fams.append(itf)
    return fams


def build_channels(F):
    fams = []

    # --- PFC: pfc-and-tees verdict. SURF = parallel-flange outline with root fillets, square toes (SA tables
    # show no toe radius).
    pfc = Family("SA-PFC", "PFC", "Parallel flange channels (PFC)", "Channels", "SA parallel flange channel (SAISC)", ["PFC"])
    for r in F["PFC"]:
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        check_surf("SA-PFC", r, p_pfc(H, B, tw, ra), 1e-4)
        d = desig(H, B)
        pfc.add(r, d, fnum(r, "MASS"), fnum(r, "SURF"), dims(H, B, tw, tf), PFC_NOTE.get(d))
    pfc.source_rows = len(F["PFC"])
    fams.append(pfc)

    # --- CDIN = DIN 1026-1 UPN: channels-taper verdict. SURF is wrong on every row (off by one row; UPN 100 shows
    # 0.96 m2/m). Closed-form taper channel at 8 %, equal to the PDL outline and to published UNP areas (0.06 %).
    upn = Family("SA-UPN", "UPN", "Taper flange channels (UPN, DIN 1026)", "Channels", "DIN 1026-1 (SAISC)", ["CDIN"])
    for r in F["CDIN"]:
        H, B, tw, tf, r1, r2 = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA", "RS"))
        h = int(round(H))
        upn.add(r, f"UPN {h}", UPN_DIN_MASS[h], p_taper_channel(H, B, tw, r1, r2, math.atan(0.08)) / 1000, dims(H, B, tw, tf))
    upn.source_rows = len(F["CDIN"])
    fams.append(upn)

    # --- CBS: channels-taper verdict. SURF is wrong (5 values are physically impossible). Closed-form taper channel
    # at the BS 4 5 deg taper (Robot's script wrongly applies the DIN 8 % rule); 178x54 at its fitted 3.4 %.
    cbs = Family("SA-CBS", "TFC", "Taper flange channels (BS 4 imperial)", "Channels", "BS 4:1971 / SA taper channel (SAISC)", ["CBS"])
    for r in F["CBS"]:
        H, B, tw, tf, r1, r2 = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA", "RS"))
        hb = desig(float(r["DIM1"]), float(r["DIM2"]))
        m = fnum(r, "MASS")
        d = f"{hb}x{fmt(round(m, 1), 1)}"
        cbs.add(r, d, m, p_taper_channel(H, B, tw, r1, r2, CBS_SLOPE[hb]) / 1000, dims(H, B, tw, tf), CBS_NOTE.get(hb))
    cbs.source_rows = len(F["CBS"])
    fams.append(cbs)
    return fams


def drop_principal_axis_twins(fam, own, twins, label):
    """AEP/AIP: the same angles referred to the principal u-v axes. Drop each one after checking it has an
    identical twin (dimensions, mass, SURF) in the leg-axis family."""
    keyf = lambda r: tuple(r[k] for k in ("H", "B", "EA", "ES", "RA", "RS", "MASS", "SURF"))
    keys = Counter(keyf(r) for r in own)
    for r in twins:
        if keys[keyf(r)] != 1:
            sys.exit(f"{label} {r['NAME1']}: no identical twin; the verdict says {label} is a pure duplicate")
        fam.dropped[f"{label} duplicate (same angle on principal axes)"] += 1


def build_angles(F):
    fams = []

    # --- AE: angles-equal verdict. The file's SURF leaves out both toe end faces (SURF = outline - 2(t - r2)),
    # so use the full PDL outline 2(H + B) - (2 - pi/2)(r1 + 2 r2), with the arc-toe variant where t < r2.
    ea = Family("SA-EA", "L", "Equal angles", "Angles", "EN 10056-1 (SAISC)", ["AE", "AEP"])
    for r in F["AE"]:
        H, B, t1, t2, r1, r2 = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA", "RS"))
        ea.add(r, desig(H, B, t1), fnum(r, "MASS"), p_angle(H, B, t1, t2, r1, r2) / 1000, dims(H, B, t1))
    drop_principal_axis_twins(ea, F["AE"], F["AEP"], "AEP")
    ea.source_rows = len(F["AE"]) + len(F["AEP"])
    fams.append(ea)

    # --- AI: angles-unequal verdict. Same SURF fault; P = 2(H + B) - (2 - pi/2)(RA + 2 RS). AIP dropped.
    ua = Family("SA-UA", "L", "Unequal angles", "Angles", "EN 10056-1 (SAISC)", ["AI", "AIP"])
    for r in F["AI"]:
        H, B, t1, t2, r1, r2 = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA", "RS"))
        if not H > B:
            sys.exit(f"AI {r['NAME1']}: long leg is not H")
        ua.add(r, desig(H, B, t1), fnum(r, "MASS"), p_angle(H, B, t1, t2, r1, r2) / 1000, dims(H, B, t1))
    drop_principal_axis_twins(ua, F["AI"], F["AIP"], "AIP")
    ua.source_rows = len(F["AI"]) + len(F["AIP"])
    fams.append(ua)
    return fams


def build_tees(F):
    fams = []
    # --- STI / STH: pfc-and-tees verdict. SURF = the tee's own outline (flange, both edges, underside, fillets,
    # both stem faces and the cut stem end) = 2B + 2H - (4 - pi) r. Labelled by the PARENT size; mass is the tee's.
    sti = Family("SA-STI", "Tee cut from UB", "Tees cut from UB (STI)", "Tees", "Cut from UB, depth = half the parent (SAISC)", ["STI"])
    for r in F["STI"]:
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        check_surf("SA-STI", r, p_tee(H, B, ra), 1e-4)
        name = desig(float(r["DIM1"]), float(r["DIM2"]), float(r["DIM3"]))
        sti.add(r, STI_PARENT.get(name, name), fnum(r, "MASS"), fnum(r, "SURF"), dims(H, B, tw, tf))
    sti.source_rows = len(F["STI"])
    fams.append(sti)

    sth = Family("SA-STH", "Tee cut from UC", "Tees cut from UC (STH)", "Tees", "Cut from UC, depth = half the parent (SAISC)", ["STH"])
    for r in F["STH"]:
        H, B, tw, tf, ra = (mm(r, k) for k in ("H", "B", "EA", "ES", "RA"))
        check_surf("SA-STH", r, p_tee(H, B, ra), 1e-4)
        sth.add(r, desig(float(r["DIM1"]), float(r["DIM2"]), float(r["DIM3"])), fnum(r, "MASS"), fnum(r, "SURF"), dims(H, B, tw, tf))
    sth.source_rows = len(F["STH"])
    fams.append(sth)
    return fams


def build_hollow(F):
    fams = []
    # --- SHS / RHS: hollow-rect verdict. The PDL draws a sharp rectangle and SURF uses three conventions (sharp
    # corners on 195 rows, 2t on the rest), MASS another three. Use the nominal rounded tube for both: area
    # 2(H + B) - (8 - 2 pi) ro, mass 7850 x [2t(H + B - 2t) - (4 - pi)(ro^2 - ri^2)]. 12.5/16 mm walls are hot-finished.
    for code, fid, name in (("SHS", "SA-SHS", "Square hollow sections (SHS)"), ("RHS", "SA-RHS", "Rectangular hollow sections (RHS)")):
        f = Family(fid, code, name, "Hollow sections", "EN 10219 / 10210 corner radii (SAISC sizes)", [code])
        for r in F[code]:
            H, B, t = mm(r, "H"), mm(r, "B"), mm(r, "EA")
            if code == "SHS" and H != B:
                sys.exit(f"SHS {r['NAME1']} is not square")
            f.add(r, desig(H, B, t), mass_hollow(H, B, t), p_hollow(H, B, t) / 1000, dims(H, B, t),
                  "Hot-finished" if t > 10 else None)
        f.source_rows = len(F[code])
        fams.append(f)
    return fams


def build_chs(F):
    # --- CHS: tube-and-coldformed verdict. SURF (= pi x OD within 0.05 %). Drop the 48 rounded-OD rows that
    # duplicate an exact-OD row with the same wall (keep the exact OD). 76.2x4 mass corrected to 7.12.
    f = Family("SA-CHS", "CHS", "Circular hollow sections (CHS)", "Hollow sections", "SAISC tube sizes", ["CHS"])
    rows = F["CHS"]
    drop_ids = {str(i) for ids in CHS_ROUNDED_DUPES.values() for i in ids}
    if len(drop_ids) != 48:
        sys.exit("CHS duplicate list must name 48 rows")
    kept = [r for r in rows if r["ID"] not in drop_ids]
    for r in rows:
        if r["ID"] not in drop_ids:
            continue
        D, t = mm(r, "H"), mm(r, "EA")
        twin = [k for k in kept if mm(k, "EA") == t and 0 < abs(mm(k, "H") - D) <= 1.0]
        if len(twin) != 1:
            sys.exit(f"CHS {r['NAME1']}: no single exact-OD twin to keep")
        f.dropped["CHS rounded-OD duplicate of an exact-OD row"] += 1
    for r in kept:
        D, t = mm(r, "H"), mm(r, "EA")
        check_surf("SA-CHS", r, PI * D, 6e-4)
        d = desig(D, t)
        m = fnum(r, "MASS")
        if r["ID"] in CHS_MASS_FIX:
            want, m = CHS_MASS_FIX[r["ID"]]
            if want != d:
                sys.exit(f"CHS mass fix: ID {r['ID']} is {d}, expected {want}")
        f.add(r, d, m, fnum(r, "SURF"), dims(D, t))
    f.source_rows = len(rows)
    return [f]


def build_cold_formed(F):
    fams = []
    # --- CC: tube-and-coldformed verdict. SURF = the Robot outline (both plate faces + 2 lip edges, ri = t),
    # rounded to 1 mm. h x b x lip x t (lip = P1_L).
    cc = Family("SA-CC", "Lipped channel", "Lipped channels (cold-formed)", "Cold-formed", "SA cold-formed (SAISC)", ["CC"])
    for r in F["CC"]:
        H, B, L, t, ri = (mm(r, k) for k in ("H", "B", "P1_L", "EA", "RA"))
        check_surf("SA-CC", r, p_lipped_c(H, B, L, t, ri), 1.5e-3)
        cc.add(r, desig(H, B, L, t), fnum(r, "MASS"), fnum(r, "SURF"), dims(H, B, L, t))
    cc.source_rows = len(F["CC"])
    fams.append(cc)

    # --- CZ: tube-and-coldformed verdict. Robot draws the Z with sharp inner bends (RA = 0), which conflicts with
    # its own SX and mass (identical to the same-size CC): SURF is 3.43t mm too high. Use the lipped-C perimeter
    # with ri = t. Field layout: flange = P1_L (= DIM2), lip = P2_L; B is the overall width 2 P1_L - t.
    cz = Family("SA-CZ", "Lipped Z", "Lipped Z sections (cold-formed)", "Cold-formed", "SA cold-formed (SAISC)", ["CZ"])
    for r in F["CZ"]:
        H, B, fl, L, t = (mm(r, k) for k in ("H", "B", "P1_L", "P2_L", "EA"))
        if abs(B - (2 * fl - t)) > 0.01:
            sys.exit(f"CZ {r['NAME1']}: B is not 2 P1_L - t; field layout changed")
        cz.add(r, desig(H, fl, L, t), fnum(r, "MASS"), p_lipped_c(H, fl, L, t, t) / 1000, dims(H, fl, L, t))
    cz.source_rows = len(F["CZ"])
    fams.append(cz)

    # --- CL: tube-and-coldformed verdict. SURF (Robot outline, ri = t, rounded to 1 mm). h x b x lip x t.
    cl = Family("SA-CL", "Lipped angle", "Lipped angles (cold-formed)", "Cold-formed", "SA cold-formed (SAISC)", ["CL"])
    for r in F["CL"]:
        H, B, L, t, ri = (mm(r, k) for k in ("H", "B", "P1_L", "EA", "RA"))
        check_surf("SA-CL", r, p_lipped_l(H, B, L, t, ri), 1.5e-3)
        cl.add(r, desig(H, B, L, t), fnum(r, "MASS"), fnum(r, "SURF"), dims(H, B, L, t))
    cl.source_rows = len(F["CL"])
    fams.append(cl)
    return fams


# ----------------------------------------------------------------------------- output
HEADER = """/* SAISC structural steel sections (Southern Africa): mass and painted surface area per metre.
 *
 * GENERATED FILE, do not edit by hand. Regenerate with:
 *   python3 -I tools/build_saisc.py sources/Saiscpro.xml data/sections-saisc.js
 *
 * Source: a SAISC section database for Autodesk Robot ("Saiscpro.xml") supplied by the project owner, kept in
 * sources/Saiscpro.xml. The SAISC Red Book (Southern African Steel Construction Handbook) was NOT used: nothing
 * here was copied from it.
 *
 * Item: [designation, mass kg/m, painted area m2/m, main dimensions mm (, note)].
 * Painted area = the FULL outer perimeter of the cross-section per metre of length: every face that takes paint,
 * including angle toe ends, tee stem cut faces and lip edges of cold-formed sections (both faces of the plate).
 *
 * Provenance and trust: every row of the database was checked against the Robot PDL outline scripts, closed-form
 * perimeters and the file's own section areas (SX) and masses. Where the file's SURF column is the true outline it
 * is used as it stands (and the build script re-checks it against the closed form); where it is wrong, the area is
 * the closed-form full perimeter from the file's dimensions. Duplicate Robot families are dropped. Corner radii
 * that the file does not record (hollow sections) use the EN 10219 / EN 10210 nominal radii. Confirm any section
 * that matters against your supplier's current tables; availability varies by mill and year.
 *
 * Corrections made (file value -> value used, and why):
%s */
"""

# One line per family that changed; "{rng}" is filled with the computed range of (area used / file SURF - 1),
# "{masses}" with every mass that differs from the file ("n of N rows: <designation> <file> -> <used>, ...").
CORRECTION_LINES = OrderedDict([
    ("SA-UB", "UB: 31 IPF rows dropped (old SAISC listing of the same beams); the 10 IPF-only sizes relabelled UB. "
              "IPF 762x267x147, 838x292x176, 914x305x201, 914x419x343: file SURF had no fillet deduction and RA 12.7 mm "
              "is wrong, area recomputed with the BS 4 root radius ({rng})."),
    ("SA-UC", "UC: 17 HPF rows dropped (old SAISC listing of the same columns); 305x305x198/240/283 relabelled UC. "
              "Values unchanged."),
    ("SA-HP", "HP: 254x254x63 / 254x254x71 flange width is a typo in the file (246.0 / 247.5 mm; SX, Iy and Iz give "
              "256.0 / 257.5): area recomputed ({rng})."),
    ("SA-IPEAA", "IPE AA: the file calls these 'IPE ... A'; they are the IPE AA extra-light series (NAME2 'IPE-AA', "
                 "2-4 % lighter than EN IPE A). Values unchanged."),
    ("SA-ITF", "ITF: file SURF unusable on all 7 rows (one-row offset; 127x76x13 showed 3.44 m2/m). Closed-form "
               "taper-flange perimeter at 5 deg (imperial RSJs) or 8 deg (152-wide joists), fitted to each row's A, Iy, Iz."),
    ("SA-UPN", "UPN (Robot CDIN): file SURF off by one row (UPN 100 showed 0.96 m2/m). Closed-form 8 % taper channel "
               "(equals published DIN 1026 UNP areas within 0.06 %). DIN 1026-1 nominal masses, kg/m ({masses})."),
    ("SA-CBS", "TFC (Robot CBS): file SURF wrong on all 5 rows (some physically impossible). Closed-form 5 deg taper "
               "channel (BS 4); 178x54 at its fitted 3.4 % slope. Designation h x b x kg/m from the row's own mass "
               "(381x102x55 is BS 4's 381x102x55.10; the file's mass 55 is kept)."),
    ("SA-EA", "Equal angles: file SURF leaves out both toe end faces. Full outline 2(L1 + L2) - (2 - pi/2)(r1 + 2 r2) "
              "({rng}); AEP (same angles on principal axes) dropped."),
    ("SA-UA", "Unequal angles: same SURF fault, same full outline ({rng}); AIP (principal-axis duplicate) dropped."),
    ("SA-PFC", "PFC: values unchanged; 260x90 and 300x100 flagged as older SAISC sections (current SA sections differ)."),
    ("SA-STI", "STI tees: file names 305x102x29, 305x165x41, 406x178x75, 457x191x75, 457x191x90, 533x210x93 "
               "relabelled with the standard parent UB size. Values unchanged."),
    ("SA-SHS", "SHS: file SURF has sharp corners (or 2t at 8/10 mm) and MASS mixes three conventions. Area and mass from "
               "the nominal rounded tube, ro = 2t (t <= 6), 2.5t (t <= 10), 1.5t hot-finished (12.5/16 mm) ({rng})."),
    ("SA-RHS", "RHS: as SHS ({rng})."),
    ("SA-CHS", "CHS: 48 rounded-OD duplicates of exact-OD rows dropped (e.g. 89x4 in favour of 88.9x4); 76.2x4 mass "
               "7.17 -> 7.12 kg/m (7850 pi (D - t) t)."),
    ("SA-CZ", "Lipped Z: Robot draws sharp inner bends, inconsistent with its own SX and mass. Perimeter recomputed with "
              "inner radius t, as for the lipped channel ({rng})."),
])


def correction_text(fams):
    import textwrap
    out = []
    for f in fams:
        line = CORRECTION_LINES.get(f.meta["id"])
        if line is None:
            continue
        if "{rng}" in line:
            r = f.area_ratios
            rng = f"{100 * min(r):+.1f} %" if round(min(r), 3) == round(max(r), 3) else f"{100 * min(r):+.1f} to {100 * max(r):+.1f} %"
            line = line.replace("{rng}", rng)
        if "{masses}" in line:
            ch = f.mass_changes
            if not ch:
                sys.exit(f"{f.meta['id']}: the header cites mass changes but no mass differs from the file")
            # \0 = a space that must not be broken by the wrapper
            pairs = ", ".join("\0".join((d.replace(" ", "\0"), fmt(a, 2), "->", fmt(b, 2))) for d, a, b in ch)
            line = line.replace("{masses}", f"{len(ch)} of {len(f.items)} rows differ from the file: {pairs}")
        # keep "6.6 %" and "UPN 100 / 120" style pairs on one line: protect those spaces while wrapping
        line = re.sub(r" (?=[%/])|(?<=/) ", "\0", line)
        out += textwrap.wrap(line, 112, initial_indent=" *   ", subsequent_indent=" *     ", break_on_hyphens=False)
    return "".join(l.replace("\0", " ") + "\n" for l in out)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    xml_path, out_path = sys.argv[1], sys.argv[2]
    F = load_shapes(xml_path)

    fams = build_i_sections(F) + build_channels(F) + build_angles(F) + build_tees(F) + build_hollow(F) + build_chs(F) + build_cold_formed(F)
    order = list(EXPECTED)
    fams.sort(key=lambda f: order.index(f.meta["id"]))
    if [f.meta["id"] for f in fams] != order:
        sys.exit("family set differs from the contract")
    used = {c for f in fams for c in f.sources}
    unused = sorted(set(F) - used)
    if unused:
        sys.exit(f"Robot families not handled: {unused}")

    objs = [f.finish(EXPECTED[f.meta["id"]]) for f in fams]

    # tees are labelled by their parent: every parent must be in the UB / UC family
    by_id = {o["id"]: {i[0] for i in o["items"]} for o in objs}
    for tee, parent in (("SA-STI", "SA-UB"), ("SA-STH", "SA-UC")):
        missing = sorted(by_id[tee] - by_id[parent])
        if missing:
            sys.exit(f"{tee}: parent sizes not in {parent}: {missing}")
    # sanity on every row
    for o in objs:
        for it in o["items"]:
            d, mass, area = it[0], it[1], it[2]
            if not (mass > 0 and area > 0 and 1.5 <= area / mass * 1000 <= 250):
                sys.exit(f"{o['id']} {d}: implausible mass {mass} / area {area}")

    corrections = correction_text(fams)
    catalogue = OrderedDict(id="SAISC", rank=1, name="SAISC (Southern Africa)", short="SAISC",
                            source="SAISC section database for Autodesk Robot (Saiscpro.xml), checked row by row, with painted areas recomputed where its surface column was wrong.")
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    lines = [HEADER % corrections,
             "(function (root) {",
             "  root.PaintDB = root.PaintDB || {};",
             "  const S = (root.PaintDB.sections = root.PaintDB.sections || {});",
             f"  (S.catalogues = S.catalogues || []).push({dump(catalogue)});",
             "  (S.families = S.families || []).push("]
    lines.append(",\n".join("    " + dump(o) for o in objs))
    lines.append("  );")
    lines.append('})(typeof globalThis !== "undefined" ? globalThis : window);')
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")

    # summary
    print(f"{'family':10} {'robot':10} {'read':>5} {'kept':>5} {'dropped':>8} {'area chg':>9} {'>0.5%':>6} {'mass chg':>9}")
    for f in fams:
        print(f"{f.meta['id']:10} {'+'.join(f.sources):10} {f.source_rows:5d} {len(f.items):5d} {sum(f.dropped.values()):8d} "
              f"{f.area_changed:9d} {f.area_changed_big:6d} {f.mass_changed:9d}")
        for why, n in f.dropped.items():
            print(f"{'':12}dropped {n}: {why}")
        for ex in f.examples[:2]:
            print(f"{'':12}e.g. {ex[0]}: area {ex[1]:.6g} -> {ex[2]:.4f} m2/m, mass {ex[3]:g} -> {ex[4]:g} kg/m")
    print(f"total rows written: {sum(len(f.items) for f in fams)} in {len(fams)} families -> {out_path}")


if __name__ == "__main__":
    main()
