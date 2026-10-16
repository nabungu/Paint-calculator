"""Build excel/Paint-Galvanizing-Calculator.xlsx: the calculator as an Excel workbook (Microsoft 365), formulas only.

Run from the repository root:

    node tools/export_data.js > /tmp/paintdb.json
    python3 -I tools/build_xlsx.py /tmp/paintdb.json excel/Paint-Galvanizing-Calculator.xlsx

The data (sections, pipes, products, paint systems, ISO 12944-5 Annex B, ISO 1461, zinc rates) comes from the same
data/*.js files as the web page, through tools/export_data.js, so the workbook and the page always agree.

Everything the user changes is on three sheets: Members, Protection (with the paint layers) and Results. The other
sheets hold the data and the system ranking. Formulas use functions every Excel since 2010 has (INDEX, MATCH,
COUNTIFS, SUMPRODUCT, OFFSET), so the workbook needs no macros and no spilling array formulas. What does not depend
on the user's choices (each system's build text, litres per m2 and products for each supplier, what Annex B allows
for each library system, inside areas of tubes) is computed here, in Python, with the same rules as calc.js.
"""
import json
import math
import sys

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as COL
from openpyxl.worksheet.datavalidation import DataValidation

src, out = sys.argv[1:3]
D = json.load(open(src, encoding="utf-8"))
db = D["db"]
ISO = db["iso12944"]
GALV = db["galvanizing"]
DURS = ISO["durabilities"]                       # L M H VH
SUPPLIERS = db["paints"]["suppliers"]
SYSTEMS = db["systems"]

# ---------------------------------------------------------------------------------------------------------- styles
NAVY, TEAL, CYAN, GREEN = "0B1D35", "3FC593", "19B0CB", "67C549"
F = "Arial"
font = lambda **k: Font(name=F, size=k.pop("size", 10), **k)
HEAD = PatternFill("solid", fgColor=NAVY)
SUB = PatternFill("solid", fgColor="E2F5F3")
INPUT = PatternFill("solid", fgColor="FFF7D6")
GREY = PatternFill("solid", fgColor="F2F5F8")
thin = Side(style="thin", color="D5DDE6")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

wb = Workbook()


def sheet(title, tab=None, first=False):
    ws = wb.active if first else wb.create_sheet(title)
    ws.title = title
    if tab:
        ws.sheet_properties.tabColor = tab
    ws.sheet_view.showGridLines = False
    return ws


def title(ws, text, sub=None):
    ws["A1"] = text
    ws["A1"].font = font(size=16, bold=True, color=NAVY)
    if sub:
        ws["A2"] = sub
        ws["A2"].font = font(size=10, color="566579")
    ws.row_dimensions[1].height = 24


def header(ws, row, labels, col=1, widths=None):
    for i, lab in enumerate(labels):
        c = ws.cell(row=row, column=col + i, value=lab)
        c.font = font(bold=True, color="FFFFFF")
        c.fill = HEAD
        c.alignment = CENTER
        c.border = BOX
    ws.row_dimensions[row].height = 30
    if widths:
        for i, w in enumerate(widths):
            ws.column_dimensions[COL(col + i)].width = w


def put(ws, ref, value, fmt=None, bold=False, inp=False, color=None, wrap=False, align=None):
    c = ws[ref]
    c.value = value
    c.font = font(bold=bold, color=("1F3FBF" if inp else (color or "000000")))
    if inp:
        c.fill = INPUT
        c.border = BOX
    if fmt:
        c.number_format = fmt
    if wrap:
        c.alignment = WRAP
    if align:
        c.alignment = align
    return c


def section(ws, ref, text):
    c = ws[ref]
    c.value = text
    c.font = font(size=12, bold=True, color=NAVY)


def note(ws, ref, text, width_cols=None):
    c = ws[ref]
    c.value = text
    c.font = font(size=9, color="566579", italic=True)
    c.alignment = Alignment(wrap_text=False, vertical="top")


def dv(ws, rng, formula, prompt=None, allow_blank=True, error=True):
    v = DataValidation(type="list", formula1=formula, allow_blank=allow_blank, showErrorMessage=error)
    if prompt:
        v.promptTitle, v.prompt, v.showInputMessage = "Choose", prompt, True
    ws.add_data_validation(v)
    v.add(rng)
    return v


# ---------------------------------------------------------------------------------------------------- data sheets
read = sheet("Read me", tab=TEAL, first=True)
mem = sheet("Members", tab=CYAN)
pro = sheet("Protection", tab=CYAN)
res = sheet("Results", tab=CYAN)
lists = sheet("Lists", tab="9AA7B8")
secs = sheet("Sizes", tab="9AA7B8")
pipes = sheet("Pipes", tab="9AA7B8")
prods = sheet("Products", tab="9AA7B8")
syss = sheet("Systems", tab="9AA7B8")
annex = sheet("AnnexB", tab="9AA7B8")
envs = sheet("Env", tab="9AA7B8")

# ---- Sizes: one block of rows per member type (pipes first), the dependent size list reads a block with OFFSET
PIPE_FAM, CUSTOM_FAM = "Pipe (ASME B36.10M)", "Custom member (type the perimeter)"
fam_by_id = {f["id"]: f for f in db["sections"]["families"]}
cat_short = {c["id"]: c["short"] for c in db["sections"]["catalogues"]}
header(secs, 1, ["Key (type|size)", "Type id", "Size", "kg/m", "m2/m", "Dimensions (mm)", "Note", "Thinnest steel (mm)",
                 "Thickest steel (mm)", "Inside area m2/m (tubes)"], widths=[34, 10, 22, 9, 9, 22, 40, 10, 10, 12])
r = 2
fam_rows = []        # (display name, type id, first row, count)
first = r
for p in db["pipes"]["pipes"]:
    lab = f"NPS {p['nps']}"
    secs.append([f"PIPE|{lab}", "PIPE", lab])
    r += 1
fam_rows.append((PIPE_FAM, "PIPE", first, r - first))
for g in D["groups"]:
    for fid in g["fams"]:
        f = fam_by_id[fid]
        disp = f"{g['short']} · {f['name']}"
        first = r
        for it in f["items"]:
            t = D["thick"][f"{fid}|{it[0]}"]
            secs.append([f"{fid}|{it[0]}", fid, it[0], it[1], it[2], it[3], it[4] if len(it) > 4 else None,
                         t["tmin"], t["tmax"], t["inner"] or 0])
            r += 1
        fam_rows.append((disp, fid, first, r - first))
secs.append(["CUSTOM|-", "CUSTOM", "-"])
fam_rows.append((CUSTOM_FAM, "CUSTOM", r, 1))
r += 1
SIZES_LAST = r - 1
for row in secs.iter_rows(min_row=2, max_row=SIZES_LAST):
    for c in row:
        c.font = font(size=9)
        if c.column == 3:
            c.number_format = "@"

# ---- Lists
header(lists, 1, ["Member type", "Type id", "First row in Sizes", "Count"], widths=[46, 10, 10, 8])
for i, (disp, fid, fr, n) in enumerate(fam_rows, start=2):
    lists.append([disp, fid, fr, n])
FAM_LAST = 1 + len(fam_rows)
SCHEDS = ["Sch " + s if s[0].isdigit() else s for s in db["pipes"]["schedules"]]
lists["F1"], lists["G1"], lists["H1"], lists["I1"], lists["J1"] = "Schedule", "Pipe surfaces", "Protection", "Code", "Yes/No"
for c in "FGHIJ":
    lists[c + "1"].font = font(bold=True, color="FFFFFF")
    lists[c + "1"].fill = HEAD
for i, s in enumerate(SCHEDS, start=2):
    lists[f"F{i}"] = s
lists["G2"], lists["G3"] = "External", "External + internal"
PROTECTIONS = [("Painted steel (blast-cleaned)", "carbon"), ("Hot-dip galvanized only", "galv"),
               ("Duplex: galvanized + paint", "hdg"), ("Metal spray + paint", "tsm")]
for i, (n, c) in enumerate(PROTECTIONS, start=2):
    lists[f"H{i}"], lists[f"I{i}"] = n, c
lists["J2"], lists["J3"] = "Yes", "No"
# durability
lists["K1"], lists["L1"], lists["M1"], lists["N1"], lists["O1"], lists["P1"] = "Label", "Durability", "Code", "Index", "Years from", "Short"
for c in "KLMNOP":
    lists[c + "1"].font = font(bold=True, color="FFFFFF")
    lists[c + "1"].fill = HEAD
DUR_YEARS = {"L": 0, "M": 7, "H": 15, "VH": 25}
for i, d in enumerate(DURS):
    lists[f"L{i + 2}"] = f"{ISO['durability'][d]['label']} ({ISO['durability'][d]['years']})"
    lists[f"M{i + 2}"], lists[f"N{i + 2}"], lists[f"O{i + 2}"] = d, i, DUR_YEARS[d]
    lists[f"P{i + 2}"] = ISO["durability"][d]["label"].lower()
    lists[f"K{i + 2}"] = ISO["durability"][d]["label"]
# suppliers
lists["Q1"], lists["R1"], lists["S1"], lists["T1"], lists["U1"] = "Supplier", "Id", "First product row", "Products", "Systems from"
for c in "QRSTU":
    lists[c + "1"].font = font(bold=True, color="FFFFFF")
    lists[c + "1"].fill = HEAD
SOURCE = {"jotun": "Jotun's ISO 12944 Coating Selector (rev. 2)",
          "hempel": "Hempel's guide “How to select the right paint system” (ISO 12944, Oct 2023)",
          "ppg": "PPG's ISO 12944 global system selector (2023)"}
# ---- Products (sorted by supplier, in data order)
header(prods, 1, ["Key (supplier|name)", "Supplier", "Name", "Id", "Type", "Volume solids %", "DFT min (um)",
                  "DFT max (um)", "Chemistry", "Source"], widths=[40, 10, 28, 30, 6, 9, 9, 9, 40, 60])
pr = 2
prod_row = {}
for si, s in enumerate(SUPPLIERS):
    lists[f"Q{si + 2}"], lists[f"R{si + 2}"], lists[f"S{si + 2}"], lists[f"T{si + 2}"] = s["name"], s["id"], pr, len(s["products"])
    lists[f"U{si + 2}"] = SOURCE.get(s["id"], "")
    for p in s["products"]:
        prods.append([f"{s['id']}|{p['name']}", s["id"], p["name"], p["id"], p["type"], p["vs"], p["dftMin"], p["dftMax"],
                      p.get("chem"), p.get("source")])
        prod_row[p["id"]] = (s["id"], p)
        pr += 1
PROD_LAST = pr - 1
SUP_LAST = 1 + len(SUPPLIERS)
for row in prods.iter_rows(min_row=2, max_row=PROD_LAST):
    for c in row:
        c.font = font(size=9)
# layer type names
lists["W1"], lists["X1"] = "Layer type", "Name"
for c in "WX":
    lists[c + "1"].font = font(bold=True, color="FFFFFF")
    lists[c + "1"].fill = HEAD
for i, (k, v) in enumerate(db["paints"]["layerTypes"].items(), start=2):
    lists[f"W{i}"], lists[f"X{i}"] = k, v
TYPES_LAST = 1 + len(db["paints"]["layerTypes"])

# ---- Pipes
header(pipes, 1, ["Size", "DN", "OD (mm)"] + SCHEDS, widths=[12, 7, 9] + [8] * len(SCHEDS))
for p in db["pipes"]["pipes"]:
    pipes.append([f"NPS {p['nps']}", p["dn"], p["od"]] + [p["walls"].get(s) for s in db["pipes"]["schedules"]])
PIPES_LAST = 1 + len(db["pipes"]["pipes"])

# ---- Env: environments, zinc rates and ISO 1461 bands
header(envs, 1, ["Environment", "Id", "Kind", "Table env", "Zinc loss low (um/a)", "Zinc loss high (um/a)", "Name"],
       widths=[34, 6, 7, 8, 10, 10, 34])
ENV_NAMES = {"Im4": "Sea or brackish water with cathodic protection"}
for e in ISO["environments"]:
    z = e.get("zincUm")
    envs.append([f"{e['id']} – {e['name']}", e["id"], e["kind"], "C2" if e["id"] == "C1" else e["id"],
                 z[0] if z else None, z[1] if z else None, e["name"]])
ENV_LAST = 1 + len(ISO["environments"])
envs["I1"], envs["J1"], envs["K1"], envs["L1"], envs["M1"], envs["N1"], envs["O1"] = (
    "ISO 1461 band", "Id", "Table", "Local um", "Mean um", "Local g/m2", "Mean g/m2")
for c in "IJKLMNO":
    envs[c + "1"].font = font(bold=True, color="FFFFFF")
    envs[c + "1"].fill = HEAD
AUTO_BAND = "From the member list (thickest steel)"
envs["I2"] = AUTO_BAND
for i, b in enumerate(GALV["bands"], start=3):
    envs[f"I{i}"], envs[f"J{i}"], envs[f"K{i}"] = b["label"], b["id"], b["table"]
    envs[f"L{i}"], envs[f"M{i}"], envs[f"N{i}"], envs[f"O{i}"] = b["local"], b["mean"], b["massLocal"], b["massMean"]
BANDS_LAST = 2 + len(GALV["bands"])
envs.column_dimensions["I"].width = 40

# ---- AnnexB: one row per substrate | table env | durability | column (no row = no figure in that column)
header(annex, 1, ["Key", "Min. coats", "Min. NDFT (um)", "No minimum"], widths=[30, 10, 12, 10])
for sub in ("carbon", "hdg", "tsm"):
    for env, row in ISO["minimums"][sub].items():
        for d, cols in row.items():
            for col, req in cols.items():
                if req == ISO["NONE"]:
                    annex.append([f"{sub}|{env}|{d}|{col}", 0, 0, 1])
                elif req:
                    annex.append([f"{sub}|{env}|{d}|{col}", req["mnoc"], req["ndft"], 0])
for d, cols in ISO["minimums"]["immersion"].items():
    for col, req in cols.items():
        if req:
            annex.append([f"carbon|IMM|{d}|{col}", req["mnoc"], req["ndft"], 0])
ANNEX_LAST = annex.max_row


# ---- Systems: static per-supplier builds (the substitution rule of calc.js), then the live ranking columns
def pick_product(sup, typ, dft):
    s = next(x for x in SUPPLIERS if x["id"] == sup)
    of = [p for p in s["products"] if p["type"] == typ]
    return next((p for p in of if p["dftMin"] <= dft <= p["dftMax"]), of[0] if of else None)


def build_for(sys_, sup):
    layers = []
    for l in sys_["layers"]:
        if sup == sys_["supplier"]:
            p = prod_row[l["products"][0]][1]
        else:
            p = pick_product(sup, l["type"], l["dft"])
        layers.append((l, p))
    return layers


sys_name = lambda sid: sid[:-1] + " alternative" if sid.endswith("A") and sid[:-1][-1:].isdigit() else sid
NL = 4
cols = ["Key", "System", "Supplier", "Substrate", "Env", "Rated", "Rated index", "Basis", "Source table", "Note",
        "Annex B allows (index)", "Coats", "NDFT (um)"]
for i in range(1, NL + 1):
    cols += [f"L{i} type", f"L{i} coats", f"L{i} DFT"]
SUP_IDS = [s["id"] for s in SUPPLIERS]
for s in SUP_IDS:
    cols += [f"{s} L/m2", f"{s} missing", f"{s} range warn", f"{s} build"] + [f"{s} L{i} product" for i in range(1, NL + 1)]
static_n = len(cols)
cols += ["Qualifies", "Tested here", "Litres", "Score", "Rank"]
header(syss, 1, cols)
for s in SYSTEMS:
    used = [l for l in s["layers"]]
    row = [f"{s['id']}|{s['substrate']}|{s['env']}", sys_name(s["id"]) if s["supplier"] == "jotun" else s["id"], s["supplier"],
           s["substrate"], s["env"], s["dur"], DURS.index(s["dur"]), s.get("basis", "annexB"), s.get("table"), s.get("note"),
           D["annex"][SYSTEMS.index(s)], sum(l["coats"] for l in used), sum(l["coats"] * l["dft"] for l in used)]
    for i in range(NL):
        l = used[i] if i < len(used) else None
        row += [l["type"], l["coats"], l["dft"]] if l else [None, None, None]
    for sup in SUP_IDS:
        b = build_for(s, sup)
        missing = any(p is None for _, p in b)
        # a layer with no product counts at 100 % solids, as calc.js recommend() does (the row is flagged and sorted last)
        lpm2 = sum(l["coats"] * l["dft"] / (10 * (p["vs"] if p else 100)) for l, p in b)
        warn = any(p and not (p["dftMin"] <= l["dft"] <= p["dftMax"]) for l, p in b)
        text = " + ".join(f"{p['name'] if p else 'no product'} {str(l['coats']) + ' × ' if l['coats'] > 1 else ''}{l['dft']}" for l, p in b)
        row += [lpm2, int(missing), int(warn), text] + [(b[i][1]["id"] if i < len(b) and b[i][1] else None) for i in range(NL)]
    syss.append(row)
SYS_LAST = 1 + len(SYSTEMS)
SC = {name: COL(i + 1) for i, name in enumerate(cols)}       # column letter by header


def rng(ws_name, col, a=2, b=None):
    return f"{ws_name}!${col}${a}:${col}${b}"


# ---------------------------------------------------------------------------------------------------- Protection
title(pro, "Environment and protection system",
      "Yellow cells are yours to change. Everything else is worked out. Members are on the Members sheet; quantities on Results.")
for c, w in zip("ABCDEFGHIJKLMNOPQRSTUV", [46, 36, 13, 36, 14, 22, 13, 14, 13, 22, 24, 14, 13, 11, 12, 16, 8, 8, 8, 8, 8, 8]):
    pro.column_dimensions[c].width = w
section(pro, "A4", "Your choices")
labels = [("A5", "Protection"), ("A6", "Environment (ISO 12944-2 / ISO 9223)"), ("A7", "Durability required (ISO 12944-1)"),
          ("A8", "Paint supplier"), ("A9", "Application loss (% of paint used)"), ("A10", "Extra area for flanges, cleats, fittings (%)")]
for ref, t in labels:
    put(pro, ref, t, bold=True)
put(pro, "B5", PROTECTIONS[0][0], inp=True)
put(pro, "B6", next(f"{e['id']} – {e['name']}" for e in ISO["environments"] if e["id"] == "C4"), inp=True)
put(pro, "B7", f"{ISO['durability']['H']['label']} ({ISO['durability']['H']['years']})", inp=True)
put(pro, "B8", "Jotun", inp=True)
put(pro, "B9", 30, inp=True, fmt="0")
put(pro, "B10", 0, inp=True, fmt="0")
dv(pro, "B5", f"=Lists!$H$2:$H${1 + len(PROTECTIONS)}")
dv(pro, "B6", f"=Env!$A$2:$A${ENV_LAST}")
dv(pro, "B7", "=Lists!$L$2:$L$5")
dv(pro, "B8", f"=Lists!$Q$2:$Q${SUP_LAST}")
note(pro, "C9", "30 % is a common starting point for airless spray on steelwork; use your contractor's factor if you have one.")
note(pro, "C10", "Stripe coats on edges and welds are not included: add them here.")
# derived (column E..F, labelled)
section(pro, "D4", "Worked out")
derived = [
    ("D5", "Substrate code", "E5", f'=INDEX(Lists!$I$2:$I$5,MATCH(B5,Lists!$H$2:$H$5,0))'),
    ("D6", "Environment", "E6", f'=INDEX(Env!$B$2:$B${ENV_LAST},MATCH(B6,Env!$A$2:$A${ENV_LAST},0))'),
    ("D7", "Durability", "E7", '=INDEX(Lists!$M$2:$M$5,MATCH(B7,Lists!$L$2:$L$5,0))'),
    ("D8", "Supplier id", "E8", f'=INDEX(Lists!$R$2:$R${SUP_LAST},MATCH(B8,Lists!$Q$2:$Q${SUP_LAST},0))'),
    ("D9", "Environment kind", "E9", f'=INDEX(Env!$C$2:$C${ENV_LAST},MATCH(E6,Env!$B$2:$B${ENV_LAST},0))'),
    ("D10", "Table environment", "E10", f'=INDEX(Env!$D$2:$D${ENV_LAST},MATCH(E6,Env!$B$2:$B${ENV_LAST},0))'),
    ("D11", "Durability index", "E11", '=INDEX(Lists!$N$2:$N$5,MATCH(E7,Lists!$M$2:$M$5,0))'),
    ("D12", "Loss (fraction)", "E12", '=MIN(MAX(B9,0),90)/100'),
    ("D13", "Paint used", "E13", '=IF(E5="galv","no","yes")'),
    ("D14", "Zinc used", "E14", '=IF(OR(E5="galv",E5="hdg"),"yes","no")'),
    ("D15", "Own systems here", "E15", f'=COUNTIFS({rng("Systems", SC["Supplier"], 2, SYS_LAST)},E8,{rng("Systems", SC["Substrate"], 2, SYS_LAST)},E5,'
                                         f'{rng("Systems", SC["Env"], 2, SYS_LAST)},E10,{rng("Systems", SC["Rated index"], 2, SYS_LAST)},">="&E11)'),
    ("D16", "Systems listed from", "E16", '=IF(E15>0,E8,"jotun")'),
]
for lref, lt, vref, f in derived:
    put(pro, lref, lt, color="566579")
    put(pro, vref, f, color="000000")
for i in range(5, 17):
    pro[f"E{i}"].fill = GREY

# --- systems list
section(pro, "A18", "Systems that meet it (least paint first)")
put(pro, "A19", '=IF(E13="no","Galvanizing only: no paint system. See the galvanizing panel below and the Results sheet.",'
                 'IF(E16=E8,"From "&INDEX(Lists!$U$2:$U$' + str(SUP_LAST) + ',MATCH(E16,Lists!$R$2:$R$' + str(SUP_LAST) + ',0))&". ",'
                 '"Jotun\'s builds with "&B8&" products of the same type ("&B8&" has no systems of its own here in the library): these are not "&B8&"-certified systems. ")'
                 '&IF(E9="part9","CX and Im4 systems are ISO 12944-9 tested systems. ","")&"“Tested” = rated by the supplier from ISO 12944-6 performance testing, short of the ISO 12944-5 Annex B minimums for this durability.")',
    color="566579")
pro["A19"].alignment = Alignment(wrap_text=True, vertical="top")
pro.merge_cells("A19:L19")
pro.row_dimensions[19].height = 30
LIST_TOP, LIST_N = 21, 35
header(pro, 20, ["#", "System", "Build (product and µm per coat)", "", "", "", "NDFT (µm)", "Coats", "Rated up to", "Paint for this job (L)",
                 "Flags", "Source"])
pro.merge_cells(start_row=20, start_column=3, end_row=20, end_column=6)
rank_col = rng("Systems", SC["Rank"], 2, SYS_LAST)
for k in range(LIST_N):
    r = LIST_TOP + k
    put(pro, f"A{r}", k + 1, align=CENTER)
    put(pro, f"V{r}", f'=IFERROR(MATCH(A{r},{rank_col},0)+1,"")', color="9AA7B8")
    S = lambda col: f'INDEX(Systems!${SC[col]}$1:${SC[col]}${SYS_LAST},$V{r})'
    put(pro, f"B{r}", f'=IF($V{r}="","",{S("System")})', bold=True)
    pro.merge_cells(f"C{r}:F{r}")
    put(pro, f"C{r}", f'=IF($V{r}="","",INDEX(Systems!$A$1:${COL(static_n)}${SYS_LAST},$V{r},MATCH(Protection!$E$8&" build",Systems!$A$1:${COL(static_n)}$1,0)))')
    put(pro, f"G{r}", f'=IF($V{r}="","",{S("NDFT (um)")})', fmt="0")
    put(pro, f"H{r}", f'=IF($V{r}="","",{S("Coats")})', fmt="0")
    put(pro, f"I{r}", f'=IF($V{r}="","",INDEX(Lists!$K$2:$K$5,{S("Rated index")}+1))')
    put(pro, f"J{r}", f'=IF($V{r}="","",{S("Litres")})', fmt="#,##0")
    put(pro, f"K{r}", f'=IF($V{r}="","",IF(A{r}=1,"least paint ","")&IF({S("Tested here")}=1,"tested ","")'
                      f'&IF(INDEX(Systems!$A$1:${COL(static_n)}${SYS_LAST},$V{r},MATCH(Protection!$E$8&" missing",Systems!$A$1:${COL(static_n)}$1,0))=1,"no product for a layer ","")'
                      f'&IF(INDEX(Systems!$A$1:${COL(static_n)}${SYS_LAST},$V{r},MATCH(Protection!$E$8&" range warn",Systems!$A$1:${COL(static_n)}$1,0))=1,"check DFT ranges",""))',
        color="1D8A4A")
    put(pro, f"L{r}", f'=IF($V{r}="","",{S("Source table")})', color="566579")
    for c in "ABCGHIJKL":
        pro[f"{c}{r}"].border = BOX
LIST_BOT = LIST_TOP + LIST_N - 1
put(pro, f"A{LIST_BOT + 1}", f'=IF(AND(E13="yes",COUNT(V{LIST_TOP}:V{LIST_BOT})=0),"No system in the library for this combination. Type your own layers below; the ISO check still works.","")', color="B3261E")

# --- chosen system and layers
LY = LIST_BOT + 3
section(pro, f"A{LY}", "Selected system and layers")
put(pro, f"A{LY + 1}", "System to use (blank = the first above)", bold=True)
put(pro, f"B{LY + 1}", None, inp=True)
dv(pro, f"B{LY + 1}", f"=$B${LIST_TOP}:$B${LIST_BOT}")
SEL = f"B{LY + 1}"
put(pro, f"D{LY + 1}", "Systems row", color="566579")
put(pro, f"E{LY + 1}", f'=IF(E13="no","",IF({SEL}="",IF(V{LIST_TOP}="","",V{LIST_TOP}),IFERROR(INDEX(V{LIST_TOP}:V{LIST_BOT},MATCH({SEL},B{LIST_TOP}:B{LIST_BOT},0)),"")))')
SROW = f"$E${LY + 1}"
put(pro, f"F{LY + 1}", f'=IF({SROW}="","Own build",INDEX(Systems!$B$1:$B${SYS_LAST},{SROW}))', bold=True)
note(pro, f"G{LY + 1}", "To change a layer, type in the yellow “Your …” columns; blank keeps the system's value.")
LH = LY + 3
header(pro, LH, ["Layer", "Product (system)", "Type", "Coats", "DFT per coat (µm)", "Your product", "Your coats", "Your DFT (µm)",
                 "Your solids (%)", "Product used", "Type used", "Coats used", "DFT used (µm)", "Solids (%)", "Total DFT (µm)", "Range check"])
put(pro, f"Q{LH}", "Product key"); put(pro, f"R{LH}", "Used"); put(pro, f"S{LH}", "Coats counted")
prodkey = lambda ref: f'IFERROR(MATCH($E$8&"|"&{ref},Products!$A$2:$A${PROD_LAST},0)+1,"")'
L_ROWS = [LH + 1 + i for i in range(5)]
for i, r in enumerate(L_ROWS):
    li = i + 1
    if li <= NL:
        prodcol = f'MATCH($E$8&" L{li} product",Systems!$A$1:${COL(static_n)}$1,0)'
        sysprod = f'IF({SROW}="","",INDEX(Systems!$A$1:${COL(static_n)}${SYS_LAST},{SROW},{prodcol}))'
        put(pro, f"B{r}", f'=IFERROR(INDEX(Products!$C$1:$C${PROD_LAST},MATCH({sysprod},Products!$D$1:$D${PROD_LAST},0)),"")')
        put(pro, f"C{r}", f'=IF({SROW}="","",IFERROR(""&INDEX(Systems!${SC[f"L{li} type"]}$1:${SC[f"L{li} type"]}${SYS_LAST},{SROW}),""))')
        put(pro, f"D{r}", f'=IF({SROW}="","",IF(INDEX(Systems!${SC[f"L{li} coats"]}$1:${SC[f"L{li} coats"]}${SYS_LAST},{SROW})="","",INDEX(Systems!${SC[f"L{li} coats"]}$1:${SC[f"L{li} coats"]}${SYS_LAST},{SROW})))', fmt="0")
        put(pro, f"E{r}", f'=IF({SROW}="","",IF(INDEX(Systems!${SC[f"L{li} DFT"]}$1:${SC[f"L{li} DFT"]}${SYS_LAST},{SROW})="","",INDEX(Systems!${SC[f"L{li} DFT"]}$1:${SC[f"L{li} DFT"]}${SYS_LAST},{SROW})))', fmt="0")
    else:
        for c in "BCDE":
            put(pro, f"{c}{r}", '=""')
    for c in "FGHI":
        put(pro, f"{c}{r}", None, inp=True)
    dv(pro, f"F{r}", f'=OFFSET(Products!$C$1,INDEX(Lists!$S$2:$S${SUP_LAST},MATCH($E$8,Lists!$R$2:$R${SUP_LAST},0))-1,0,INDEX(Lists!$T$2:$T${SUP_LAST},MATCH($E$8,Lists!$R$2:$R${SUP_LAST},0)),1)')
    put(pro, f"J{r}", f'=IF(F{r}<>"",F{r},IF(B{r}="","",B{r}))', bold=True)
    put(pro, f"Q{r}", f'=IF(J{r}="","",{prodkey(f"J{r}")})', color="9AA7B8")
    put(pro, f"K{r}", f'=IF(Q{r}<>"",INDEX(Products!$E$1:$E${PROD_LAST},Q{r}),C{r})')
    put(pro, f"L{r}", f'=IF(G{r}<>"",G{r},D{r})', fmt="0")
    put(pro, f"M{r}", f'=IF(H{r}<>"",H{r},E{r})', fmt="0")
    put(pro, f"N{r}", f'=IF(I{r}<>"",I{r},IF(Q{r}<>"",INDEX(Products!$F$1:$F${PROD_LAST},Q{r}),""))', fmt="0")
    put(pro, f"O{r}", f'=IF(R{r}=1,S{r}*M{r},"")', fmt="0")
    put(pro, f"P{r}", f'=IF(OR(Q{r}="",NOT(ISNUMBER(M{r}))),"",IF(OR(M{r}<INDEX(Products!$G$1:$G${PROD_LAST},Q{r}),M{r}>INDEX(Products!$H$1:$H${PROD_LAST},Q{r})),'
                      f'"outside "&INDEX(Products!$G$1:$G${PROD_LAST},Q{r})&"–"&INDEX(Products!$H$1:$H${PROD_LAST},Q{r})&" µm","ok"))', color="7A4A00")
    put(pro, f"R{r}", f'=IF(AND(J{r}<>"",K{r}<>"",ISNUMBER(L{r}),ISNUMBER(M{r})),IF(AND(ROUND(L{r},0)>0,M{r}>0),1,0),0)', color="9AA7B8")
    put(pro, f"S{r}", f'=IF(R{r}=1,ROUND(L{r},0),0)', color="9AA7B8")
    put(pro, f"A{r}", f'=IF(R{r}<>1,"",IF(COUNTIF($R${L_ROWS[0]}:R{r},1)=1,"Primer",IF(COUNTIF(R{r + 1}:$R${L_ROWS[-1] + 1},1)=0,"Finish coat","Mid coat")))', bold=True)
    for c in "ABCDEJKLMNOP":
        pro[f"{c}{r}"].border = BOX
L1, L5 = L_ROWS[0], L_ROWS[-1]
LT = L5 + 1
put(pro, f"A{LT}", "Total", bold=True)
put(pro, f"L{LT}", f"=SUM(S{L1}:S{L5})", fmt="0", bold=True)
put(pro, f"O{LT}", f"=SUM(O{L1}:O{L5})", fmt="0", bold=True)

# --- ISO 12944-5 check
CK = LT + 2
section(pro, f"A{CK}", "ISO 12944-5 check (Annex B minimum coats and NDFT)")
put(pro, f"A{CK + 1}", "Primer type (first coat)", color="566579")
put(pro, f"B{CK + 1}", f'=IFERROR(INDEX(K{L1}:K{L5},MATCH(1,R{L1}:R{L5},0)),"")')
put(pro, f"A{CK + 2}", "Column", color="566579")
put(pro, f"B{CK + 2}", f'=IF(E9="imm",IF(B{CK + 1}="ZN","zn","misc"),IF(E5="carbon",IF(B{CK + 1}="ZN","zn",IF(OR(B{CK + 1}="AK",B{CK + 1}="AY"),"akay","misc")),'
                       f'IF(E5="hdg",IF(B{CK + 1}="AK","n/a",IF(B{CK + 1}="AY","ay","ep")),"all")))')
put(pro, f"A{CK + 3}", "Second column (immersion: one product throughout)", color="566579")
put(pro, f"B{CK + 3}", f'=IF(AND(E9="imm",B{CK + 2}="misc"),"single","")')
put(pro, f"A{CK + 4}", "Key prefix", color="566579")
put(pro, f"B{CK + 4}", f'=IF(E9="imm","carbon|IMM|",E5&"|"&E10&"|")')
put(pro, f"A{CK + 5}", "Applies", color="566579")
put(pro, f"B{CK + 5}", f'=IF(E13="no","no: galvanizing only",IF(E9="part9","no: ISO 12944-9 (tested systems only)",IF(AND(E9="imm",E5<>"carbon"),"no: ISO 12944-5 gives no immersion minimums for this substrate",'
                       f'IF(B{CK + 2}="n/a","no: Table B.3 has no alkyd column (alkyds are not used on galvanizing)",IF(O{LT}=0,"no: no coats entered","yes")))))')
for i in range(1, 6):
    pro[f"B{CK + i}"].fill = GREY
header(pro, CK + 7, ["Durability", "Requirement", "Met", "Min. coats", "Min. NDFT", "No minimum", "Alt. coats", "Alt. NDFT", "Alt. met"])
GR = [CK + 8 + i for i in range(4)]
for i, r in enumerate(GR):
    d = DURS[i]
    put(pro, f"A{r}", ISO["durability"][d]["label"], bold=True)
    put(pro, f"T{r}", f'=IFERROR(MATCH($B${CK + 4}&"{d}|"&$B${CK + 2},AnnexB!$A$1:$A${ANNEX_LAST},0),"")', color="9AA7B8")
    put(pro, f"U{r}", f'=IF($B${CK + 3}="","",IFERROR(MATCH($B${CK + 4}&"{d}|"&$B${CK + 3},AnnexB!$A$1:$A${ANNEX_LAST},0),""))', color="9AA7B8")
    put(pro, f"D{r}", f'=IF(T{r}="","",INDEX(AnnexB!$B$1:$B${ANNEX_LAST},T{r}))', fmt="0")
    put(pro, f"E{r}", f'=IF(T{r}="","",INDEX(AnnexB!$C$1:$C${ANNEX_LAST},T{r}))', fmt="0")
    put(pro, f"F{r}", f'=IF(T{r}="","",INDEX(AnnexB!$D$1:$D${ANNEX_LAST},T{r}))', fmt="0")
    put(pro, f"G{r}", f'=IF(U{r}="","",INDEX(AnnexB!$B$1:$B${ANNEX_LAST},U{r}))', fmt="0")
    put(pro, f"H{r}", f'=IF(U{r}="","",INDEX(AnnexB!$C$1:$C${ANNEX_LAST},U{r}))', fmt="0")
    put(pro, f"I{r}", f'=IF(U{r}="","",IF(AND($L${LT}>=G{r},$O${LT}>=H{r}),"yes","no"))')
    put(pro, f"C{r}", f'=IF($B${CK + 5}<>"yes","",IF(OR(IF(T{r}="",FALSE,OR(F{r}=1,AND($L${LT}>=D{r},$O${LT}>=E{r}))),I{r}="yes"),"✓","✗"))', bold=True)
    put(pro, f"B{r}", f'=IF(T{r}="","not in the table",IF(F{r}=1,"no minimum","≥ "&D{r}&" coat"&IF(D{r}>1,"s","")&", "&E{r}&" µm"))'
                      f'&IF(U{r}="",""," (or ≥ "&G{r}&" coat"&IF(G{r}>1,"s","")&", "&H{r}&" µm)")')
    for c in "ABCDEFGHI":
        pro[f"{c}{r}"].border = BOX
ACH = GR[-1] + 1
put(pro, f"A{ACH}", "Annex B allows up to", bold=True)
put(pro, f"T{ACH}", f'=IF($B${CK + 5}<>"yes",-1,IF(C{GR[3]}="✓",3,IF(C{GR[2]}="✓",2,IF(C{GR[1]}="✓",1,IF(C{GR[0]}="✓",0,-1)))))', color="9AA7B8")
put(pro, f"B{ACH}", f'=IF(T{ACH}<0,"–",INDEX(Lists!$L$2:$L$5,T{ACH}+1))', bold=True)
# unedited library system?
EDITED = ACH + 1
put(pro, f"A{EDITED}", "Layers changed from the system", color="566579")
put(pro, f"B{EDITED}", f'=IF({SROW}="","own build",IF(COUNTA(F{L1}:I{L5})>0,"yes","no"))')
VER = EDITED + 1
put(pro, f"A{VER}", "Verdict", bold=True, align=Alignment(vertical="top"))
basis = f'INDEX(Systems!${SC["Basis"]}$1:${SC["Basis"]}${SYS_LAST},{SROW})'
put(pro, f"B{VER}",
    f'=IF(E13="no","Galvanizing only: see the galvanizing panel.",'
    f'IF(E9="part9",IF(AND({SROW}<>"",B{EDITED}="no"),"✓ Tested system: "&F{LY + 1}&" is "&INDEX(Lists!$Q$2:$Q${SUP_LAST},MATCH(INDEX(Systems!$C$1:$C${SYS_LAST},{SROW}),Lists!$R$2:$R${SUP_LAST},0))&"\'s ISO 12944-9 system.",'
    f'"Not a tested system: CX and Im4 systems are qualified by ISO 12944-9 testing, so a changed build cannot be checked here."),'
    f'IF(B{CK + 5}<>"yes","ISO 12944-5 check: "&B{CK + 5},'
    f'IF(T{ACH}>=E11,"✓ Meets "&E6&" "&INDEX(Lists!$P$2:$P$5,E11+1)&": "&L{LT}&" coats and "&O{LT}&" µm allow up to "&INDEX(Lists!$P$2:$P$5,T{ACH}+1)&".",'
    f'IF(AND({SROW}<>"",B{EDITED}="no",{basis}="tested"),"Rated "&INDEX(Lists!$P$2:$P$5,E11+1)&" by the supplier from ISO 12944-6 performance testing; ISO 12944-5 Annex B alone allows "&IF(T{ACH}<0,"no class",INDEX(Lists!$P$2:$P$5,T{ACH}+1))&".",'
    f'"✗ Does not meet "&E6&" "&INDEX(Lists!$P$2:$P$5,E11+1)&": "&L{LT}&" coats and "&O{LT}&" µm allow "&IF(T{ACH}<0,"no class",INDEX(Lists!$P$2:$P$5,T{ACH}+1))&".")))))',
    bold=True)
pro.merge_cells(f"B{VER}:N{VER}")
pro[f"B{VER}"].alignment = Alignment(wrap_text=True, vertical="top")
pro.row_dimensions[VER].height = 30

# --- galvanizing panel
GP = VER + 3
section(pro, f"A{GP}", "Hot-dip galvanizing (ISO 1461 / SANS 121) — used for “Hot-dip galvanized only” and “Duplex”")
put(pro, f"A{GP + 1}", "Steel thickness (ISO 1461 minimums)", bold=True)
put(pro, f"B{GP + 1}", AUTO_BAND, inp=True)
dv(pro, f"B{GP + 1}", f"=Env!$I$2:$I${BANDS_LAST}")
put(pro, f"A{GP + 2}", "Zinc coating, mean thickness (µm)", bold=True)
put(pro, f"B{GP + 2}", None, inp=True, fmt="0")
note(pro, f"C{GP + 2}", "Blank = the ISO 1461 minimum for the steel thickness. Galvanizers usually exceed it.")
put(pro, f"A{GP + 3}", "Tubes and pipes galvanized inside as well", bold=True)
put(pro, f"B{GP + 3}", "Yes", inp=True)
dv(pro, f"B{GP + 3}", "=Lists!$J$2:$J$3")
G_BAND, G_UM, G_IN = f"$B${GP + 1}", f"$B${GP + 2}", f"$B${GP + 3}"
put(pro, f"D{GP + 1}", "Thickest steel in the list (mm)", color="566579")
put(pro, f"E{GP + 1}", "=MAX(Members!$U$9:$U$208)", fmt="0.0")
put(pro, f"D{GP + 2}", "Thinnest steel in the list (mm)", color="566579")
put(pro, f"E{GP + 2}", '=IF(COUNT(Members!$T$9:$T$208)=0,"",MIN(Members!$T$9:$T$208))', fmt="0.0")
put(pro, f"D{GP + 3}", "Band checked", color="566579")
auto_band = f'IF(E{GP + 1}>6,"s6",IF(E{GP + 1}>3,"s3",IF(E{GP + 1}>=1.5,"s15",IF(E{GP + 1}>0,"s0","s6"))))'
put(pro, f"E{GP + 3}", f'=IF({G_BAND}="{AUTO_BAND}",{auto_band},INDEX(Env!$J$3:$J${BANDS_LAST},MATCH({G_BAND},Env!$I$3:$I${BANDS_LAST},0)))')
BROW = f'MATCH($E${GP + 3},Env!$J$1:$J${BANDS_LAST},0)'
put(pro, f"D{GP + 4}", "Band", color="566579")
put(pro, f"E{GP + 4}", f'=INDEX(Env!$I$1:$I${BANDS_LAST},{BROW})')
put(pro, f"D{GP + 5}", "Mean / local minimum (µm)", color="566579")
put(pro, f"E{GP + 5}", f'=INDEX(Env!$M$1:$M${BANDS_LAST},{BROW})', fmt="0")
put(pro, f"F{GP + 5}", f'=INDEX(Env!$L$1:$L${BANDS_LAST},{BROW})', fmt="0")
put(pro, f"D{GP + 6}", "Coating used (µm)", color="566579")
put(pro, f"E{GP + 6}", f'=IF(AND(ISNUMBER({G_UM}),{G_UM}>0),{G_UM},E{GP + 5})', fmt="0")
put(pro, f"D{GP + 7}", "ISO 1461 check", color="566579")
put(pro, f"E{GP + 7}", f'=IF(E{GP + 6}>=E{GP + 5},"✓ Meets ISO 1461: "&E{GP + 6}&" µm mean against "&E{GP + 5}&" µm mean and "&F{GP + 5}&" µm local ("&LOWER(E{GP + 4})&").",'
                       f'"✗ Below the ISO 1461 minimum: "&E{GP + 6}&" µm mean against "&E{GP + 5}&" µm mean and "&F{GP + 5}&" µm local ("&LOWER(E{GP + 4})&")"&IF(E{GP + 6}>=F{GP + 5},": it reaches the local minimum but not the mean, so the article fails.","."))',
    bold=True)
pro.merge_cells(f"E{GP + 7}:N{GP + 7}")
put(pro, f"D{GP + 8}", "Zinc loss low / high (µm a year)", color="566579")
ENVROW = f'MATCH($E$6,Env!$B$1:$B${ENV_LAST},0)'
put(pro, f"E{GP + 8}", f'=INDEX(Env!$E$1:$E${ENV_LAST},{ENVROW})')
put(pro, f"F{GP + 8}", f'=INDEX(Env!$F$1:$F${ENV_LAST},{ENVROW})')
cap = GALV["lifeCap"]
put(pro, f"D{GP + 9}", "Life: shorter / longer (years)", color="566579")
put(pro, f"E{GP + 9}", f'=IF(E{GP + 8}="","",IF(F{GP + 8}>0,IF(INT(E{GP + 6}/F{GP + 8})>{cap},"> {cap}",INT(E{GP + 6}/F{GP + 8})),"> {cap}"))')
put(pro, f"F{GP + 9}", f'=IF(E{GP + 8}="","",IF(E{GP + 8}>0,IF(INT(E{GP + 6}/E{GP + 8})>{cap},"> {cap}",INT(E{GP + 6}/E{GP + 8})),"> {cap}"))')
put(pro, f"D{GP + 10}", "Life to first maintenance (ISO 14713-1)", color="566579")
put(pro, f"E{GP + 10}", f'=IF(E{GP + 8}="","No life figure: immersion and buried service do not map onto atmospheric zinc rates. Seek specialist advice (galvanizer or HDGASA) and consider a duplex system.",'
                        f'IF(E{GP + 9}=F{GP + 9},E{GP + 9}&" years",IF(F{GP + 9}="> {cap}",E{GP + 9}&" to > {cap} years",E{GP + 9}&"–"&F{GP + 9}&" years")))',
    bold=True)
pro.merge_cells(f"E{GP + 10}:N{GP + 10}")
put(pro, f"D{GP + 11}", "Against the durability asked", color="566579")
yrs = 'INDEX(Lists!$O$2:$O$5,$E$11+1)'
put(pro, f"E{GP + 11}", f'=IF(E{GP + 8}="","",IF($E$7="L","Low durability: any life meets it.",IF(OR(E{GP + 9}="> {cap}",N(E{GP + 9})>={yrs}),"✓ Reaches "&LOWER($B$7)&" even at the shorter life.",'
                        f'"✗ The shorter life ("&E{GP + 9}&" years) is under "&LOWER($B$7)&": it needs about "&ROUNDUP({yrs}*F{GP + 8},0)&" µm, or a duplex system.")))')
pro.merge_cells(f"E{GP + 11}:N{GP + 11}")
put(pro, f"D{GP + 12}", "Coating mass (g/m²)", color="566579")
put(pro, f"E{GP + 12}", f'=E{GP + 6}*{GALV["density"]}', fmt="0")
for i in range(1, 13):
    pro[f"E{GP + i}"].fill = GREY
note(pro, f"A{GP + 14}", "Life = coating thickness ÷ first-year zinc loss for the category (ISO 9223): the top of the rate band gives the shorter life, the bottom the longer. "
                         "Over 100 years is shown as > 100. These rates are conservative; the micro-climate matters more than the category.")
note(pro, f"A{GP + 15}", "SANS 121 = ISO 1461; SANS 14713-1/-2 = ISO 14713-1/-2; SANS 12944 = ISO 12944. HDGASA publishes guidance on Southern African environments. "
                         "Vent and drain every hollow section (ISO 1461 Annex B, ISO 14713-2).")
GZ = {"um": f"Protection!$E${GP + 6}", "gm2": f"Protection!$E${GP + 12}", "check": f"Protection!$E${GP + 7}", "life": f"Protection!$E${GP + 10}",
      "mean": f"Protection!$E${GP + 5}", "inside": f"Protection!{G_IN}", "durcheck": f"Protection!$E${GP + 11}", "band": f"Protection!$E${GP + 4}",
      "lo": f"Protection!$E${GP + 8}", "hi": f"Protection!$F${GP + 8}"}
for c in "QRSTUV":
    pro.column_dimensions[c].hidden = True
pro.freeze_panes = "A4"

# ---------------------------------------------------------------------------- Systems: live ranking columns
for r in range(2, SYS_LAST + 1):
    sup_lpm2 = f'INDEX(${COL(1)}{r}:${COL(static_n)}{r},MATCH(Protection!$E$8&" L/m2",$A$1:${COL(static_n)}$1,0))'
    miss = f'INDEX(${COL(1)}{r}:${COL(static_n)}{r},MATCH(Protection!$E$8&" missing",$A$1:${COL(static_n)}$1,0))'
    warn = f'INDEX(${COL(1)}{r}:${COL(static_n)}{r},MATCH(Protection!$E$8&" range warn",$A$1:${COL(static_n)}$1,0))'
    syss[f"{SC['Qualifies']}{r}"] = (f'=IF(AND(Protection!$E$13="yes",{SC["Supplier"]}{r}=Protection!$E$16,{SC["Substrate"]}{r}=Protection!$E$5,'
                                     f'{SC["Env"]}{r}=Protection!$E$10,{SC["Rated index"]}{r}>=Protection!$E$11),1,0)')
    syss[f"{SC['Tested here']}{r}"] = f'=IF(AND({SC["Basis"]}{r}="tested",{SC["Annex B allows (index)"]}{r}<Protection!$E$11),1,0)'
    syss[f"{SC['Litres']}{r}"] = f'={sup_lpm2}*Results!$C$5/(1-Protection!$E$12)'
    syss[f"{SC['Score']}{r}"] = (f'={miss}*1E9+{warn}*1E8+{SC["Tested here"]}{r}*1E7+ROUND({sup_lpm2}*10000,0)*10+{SC["Coats"]}{r}')
    q, sc = rng("Systems", SC["Qualifies"], 2, SYS_LAST).replace("Systems!", ""), rng("Systems", SC["Score"], 2, SYS_LAST).replace("Systems!", "")
    syss[f"{SC['Rank']}{r}"] = (f'=IF({SC["Qualifies"]}{r}=1,COUNTIFS({q},1,{sc},"<"&{SC["Score"]}{r})'
                                f'+COUNTIFS(${SC["Qualifies"]}$2:{SC["Qualifies"]}{r},1,${SC["Score"]}$2:{SC["Score"]}{r},{SC["Score"]}{r}),"")')
for row in syss.iter_rows(min_row=2, max_row=SYS_LAST):
    for c in row:
        c.font = font(size=9)
syss.freeze_panes = "C2"

# --------------------------------------------------------------------------------------------------------- Members
title(mem, "Pipes and members", "One member per row. Choose the type, then the size; type the quantity and the length of each piece. "
                                 "Grey columns are worked out.")
MH, M1, MN = 8, 9, 200
ML = M1 + MN - 1
widths = [5, 40, 22, 11, 18, 9, 7, 10, 22, 12, 9, 12, 10, 11, 11, 12, 34, 9, 9, 9, 9, 11, 11, 11, 12, 11]
heads = ["#", "Member type", "Size", "Schedule (pipe)", "Pipe surfaces", "Painted %", "Qty", "Length (m)", "Custom: description",
         "Custom: perimeter (mm)", "Custom: kg/m", "Area per m (m²/m)", "Total length (m)", "Area (m²)", "Mass per m (kg/m)", "Mass (kg)",
         "Note / check", "Sizes row", "Kind", "Thinnest steel (mm)", "Thickest steel (mm)", "Inside area (m²/m)", "Zinc per piece (kg)",
         "Galvanized piece (kg)", "All pieces galvanized (kg)", "Inside area (m²)"]
header(mem, MH, heads, widths=widths)
for c in range(12, 27):
    mem.cell(row=MH, column=c).fill = PatternFill("solid", fgColor="17345C")
# summary row
put(mem, "A4", "Pipe area (m²)", bold=True); put(mem, "C4", f'=SUMIF(S{M1}:S{ML},"pipe",N{M1}:N{ML})', fmt="#,##0.00")
put(mem, "A5", "Steel area (m²)", bold=True); put(mem, "C5", f'=SUMIF(S{M1}:S{ML},"section",N{M1}:N{ML})+SUMIF(S{M1}:S{ML},"custom",N{M1}:N{ML})', fmt="#,##0.00")
put(mem, "A6", "Steel mass (t)", bold=True); put(mem, "C6", f'=SUM(P{M1}:P{ML})/1000', fmt="#,##0.00")
put(mem, "E4", "Total length (m)", bold=True); put(mem, "F4", f'=SUM(M{M1}:M{ML})', fmt="#,##0.0")
put(mem, "E5", "Lines with a problem", bold=True); put(mem, "F5", f'=COUNTIF(Q{M1}:Q{ML},"✗*")', fmt="0")
put(mem, "E6", "Mass unknown (custom)", bold=True); put(mem, "F6", f'=COUNTIFS(S{M1}:S{ML},"custom",K{M1}:K{ML},"")', fmt="0")
note(mem, "H4", "Yellow cells are yours. Pipes: size and schedule (blank = STD). Sections: size, and painted % if not all faces get paint. "
                "Anything not in the lists (flat bar, plate, welded section): choose the custom type and type its perimeter.")
SZ = f"Sizes!$A$1:$J${SIZES_LAST}"
for i in range(MN):
    r = M1 + i
    put(mem, f"A{r}", i + 1, color="9AA7B8", align=CENTER)
    for c in "BCDEFGHIJK":
        put(mem, f"{c}{r}", None, inp=True)
    kind = f'S{r}'
    tid = f'INDEX(Lists!$B$2:$B${FAM_LAST},MATCH(B{r},Lists!$A$2:$A${FAM_LAST},0))'
    put(mem, f"S{r}", f'=IF(B{r}="","",IFERROR(IF({tid}="PIPE","pipe",IF({tid}="CUSTOM","custom","section")),""))', color="9AA7B8")
    tid = f'INDEX(Lists!$B$2:$B${FAM_LAST},MATCH(B{r},Lists!$A$2:$A${FAM_LAST},0))'
    put(mem, f"R{r}", f'=IF(OR(B{r}="",{kind}="custom",C{r}=""),"",IFERROR(MATCH({tid}&"|"&C{r},Sizes!$A$1:$A${SIZES_LAST},0),""))', color="9AA7B8")
    sched = f'IF(D{r}="","STD",D{r})'
    prow = f'MATCH(C{r},Pipes!$A$1:$A${PIPES_LAST},0)'
    od = f'INDEX(Pipes!$C$1:$C${PIPES_LAST},{prow})'
    wall = f'INDEX(Pipes!$A$1:${COL(3 + len(SCHEDS))}${PIPES_LAST},{prow},MATCH({sched},Pipes!$A$1:${COL(3 + len(SCHEDS))}$1,0))'
    wall_ok = f'AND(ISNUMBER({prow}),ISNUMBER(MATCH({sched},Pipes!$A$1:${COL(3 + len(SCHEDS))}$1,0)),ISNUMBER({wall}))'
    pct = f'IF(F{r}="",100,F{r})/100'
    put(mem, f"L{r}", f'=IF({kind}="","",IF({kind}="custom",IF(N(J{r})>0,J{r}/1000,""),IF(R{r}="","",IF({kind}="pipe",'
                      f'PI()*{od}/1000+IF(AND(E{r}="External + internal",{wall_ok}),PI()*({od}-2*{wall})/1000,0),'
                      f'INDEX(Sizes!$E$1:$E${SIZES_LAST},R{r})*{pct}))))', fmt="0.0000")
    put(mem, f"M{r}", f'=IF({kind}="","",N(G{r})*N(H{r}))', fmt="#,##0.0")
    put(mem, f"N{r}", f'=IF(OR(L{r}="",M{r}=""),"",L{r}*M{r})', fmt="#,##0.00")
    put(mem, f"O{r}", f'=IF({kind}="","",IF({kind}="custom",IF(K{r}="","",K{r}),IF(R{r}="","",IF({kind}="pipe",IF({wall_ok},PI()*7850*({od}-{wall})*{wall}/1000000,""),'
                      f'INDEX(Sizes!$D$1:$D${SIZES_LAST},R{r})))))', fmt="0.00")
    put(mem, f"P{r}", f'=IF(OR(O{r}="",M{r}=""),"",O{r}*M{r})', fmt="#,##0.0")
    put(mem, f"Q{r}", f'=IF({kind}="","",IF(AND({kind}<>"custom",R{r}=""),"✗ Choose a size from the list",IF(AND({kind}="custom",N(J{r})<=0),"✗ Type the perimeter in mm",'
                      f'IF(AND({kind}="pipe",NOT({wall_ok})),"✗ "&C{r}&" has no "&{sched}&" wall in B36.10M",IF(OR(N(G{r})<=0,N(H{r})<=0),"✗ Type the quantity and length",'
                      f'IF({kind}<>"section","",IF(INDEX(Sizes!$G$1:$G${SIZES_LAST},R{r})<>"","* "&INDEX(Sizes!$G$1:$G${SIZES_LAST},R{r}),"")))))))', color="7A4A00")
    put(mem, f"T{r}", f'=IF(R{r}="","",IF({kind}="pipe",IF({wall_ok},{wall},""),INDEX(Sizes!$H$1:$H${SIZES_LAST},R{r})))', fmt="0.0")
    put(mem, f"U{r}", f'=IF(R{r}="","",IF({kind}="pipe",IF({wall_ok},{wall},""),INDEX(Sizes!$I$1:$I${SIZES_LAST},R{r})))', fmt="0.0")
    put(mem, f"V{r}", f'=IF(OR(R{r}="",{GZ["inside"]}<>"Yes"),0,IF({kind}="pipe",IF(AND(E{r}<>"External + internal",{wall_ok}),PI()*({od}-2*{wall})/1000,0),INDEX(Sizes!$J$1:$J${SIZES_LAST},R{r})))', fmt="0.0000")
    put(mem, f"W{r}", f'=IF(OR(Protection!$E$14<>"yes",L{r}=""),"",(L{r}+V{r})*N(H{r})*{GZ["gm2"]}/1000)', fmt="0.00")
    put(mem, f"X{r}", f'=IF(OR(W{r}="",O{r}=""),"",O{r}*N(H{r})+W{r})', fmt="#,##0.0")
    put(mem, f"Y{r}", f'=IF(X{r}="","",X{r}*N(G{r}))', fmt="#,##0.0")
    put(mem, f"Z{r}", f'=IF(M{r}="",0,V{r}*M{r})', fmt="#,##0.00")
    for c in "LMNOPQRSTUVWXYZ":
        mem[f"{c}{r}"].fill = GREY
        mem[f"{c}{r}"].border = BOX
    dv_size = (f'=OFFSET(Sizes!$C$1,INDEX(Lists!$C$2:$C${FAM_LAST},MATCH($B{r},Lists!$A$2:$A${FAM_LAST},0))-1,0,'
               f'INDEX(Lists!$D$2:$D${FAM_LAST},MATCH($B{r},Lists!$A$2:$A${FAM_LAST},0)),1)')
    if i == 0:
        size_dv = DataValidation(type="list", formula1=dv_size, allow_blank=True, showErrorMessage=True)
        mem.add_data_validation(size_dv)
    size_dv.add(f"C{r}")
dv(mem, f"B{M1}:B{ML}", f"=Lists!$A$2:$A${FAM_LAST}", prompt="Pipe, a SAISC / EN / AISC section family, or a custom member")
dv(mem, f"D{M1}:D{ML}", f"=Lists!$F$2:$F${1 + len(SCHEDS)}")
dv(mem, f"E{M1}:E{ML}", "=Lists!$G$2:$G$3")
for col in ("R", "S"):
    mem.column_dimensions[col].hidden = True
mem.freeze_panes = f"C{M1}"
# example job (the web page's "Load example"): replace with your own
fam_disp = {fid: disp for disp, fid, _, _ in fam_rows}
EXAMPLE = [("PIPE", "NPS 6", "Sch 40", 20, 12), ("PIPE", "NPS 10", "STD", 12, 6), ("PIPE", "NPS 3", "Sch 80", 30, 6),
           ("SA-UB", "305x165x40", None, 8, 6), ("SA-UC", "203x203x46", None, 12, 4.5), ("SA-PFC", "200x75", None, 10, 6),
           ("SA-EA", "80x80x8", None, 24, 3), ("SA-SHS", "100x100x4", None, 12, 3)]
for i, (fid, size, sch, q, length) in enumerate(EXAMPLE):
    r = M1 + i
    mem[f"B{r}"] = PIPE_FAM if fid == "PIPE" else fam_disp[fid]
    mem[f"C{r}"] = size
    if sch:
        mem[f"D{r}"] = sch
        mem[f"E{r}"] = "External"
    mem[f"G{r}"], mem[f"H{r}"] = q, length
put(mem, "A7", "The first eight rows are an example job (the same as the web page's “Load example”): overwrite or clear them.", color="566579")
mem["A7"].font = font(size=9, italic=True, color="566579")

# --------------------------------------------------------------------------------------------------------- Results
title(res, "Results", "Worked out from the Members and Protection sheets. Nothing to type here.")
for c, w in zip("ABCDEFGHIJ", [30, 22, 16, 15, 15, 15, 15, 15, 15, 15]):
    res.column_dimensions[c].width = w
section(res, "A4", "Areas")
put(res, "A5", "Total surface area (m²)", bold=True); put(res, "C5", "=(Members!$C$4+Members!$C$5)*(1+N(Protection!$B$10)/100)", fmt="#,##0.00", bold=True)
put(res, "A6", "Pipe (m²)"); put(res, "C6", "=Members!$C$4", fmt="#,##0.00")
put(res, "A7", "Structural steel and custom (m²)"); put(res, "C7", "=Members!$C$5", fmt="#,##0.00")
put(res, "A8", "Allowance (m²)"); put(res, "C8", "=C5-C6-C7", fmt="#,##0.00")
put(res, "A9", "Steel mass (t)"); put(res, "C9", "=Members!$C$6", fmt="#,##0.00")
for i in range(5, 10):
    res[f"C{i}"].fill = SUB
# paint
section(res, "A11", "Paint")
put(res, "A12", '=IF(Protection!$E$13="no","Galvanizing only: no paint.","System: "&Protection!$F$' + str(LY + 1) + '&" · "&Protection!$B$8&" · "&Protection!$E$6&" "&LOWER(Protection!$B$7))', color="566579")
header(res, 13, ["Layer", "Product", "Coats × DFT (µm)", "Wet film per coat (µm)", "Coverage per coat (m²/L)", "Litres per coat", "Theoretical (L)", "With loss (L)", "To order (whole L)"])
PR = [14 + i for i in range(5)]
for i, r in enumerate(PR):
    lr = L_ROWS[i]
    on = f'AND(Protection!$E$13="yes",Protection!$J${lr}<>"",ISNUMBER(Protection!$N${lr}),ISNUMBER(Protection!$M${lr}),N(Protection!$L${lr})>0)'
    put(res, f"A{r}", f'=IF({on},Protection!$A${lr},"")', bold=True)
    put(res, f"B{r}", f'=IF({on},Protection!$J${lr},"")')
    put(res, f"C{r}", f'=IF({on},ROUND(Protection!$L${lr},0)&" × "&Protection!$M${lr}&" = "&Protection!$O${lr},"")')
    put(res, f"D{r}", f'=IF({on},Protection!$M${lr}/(Protection!$N${lr}/100),"")', fmt="0")
    put(res, f"E{r}", f'=IF({on},Protection!$N${lr}*10/Protection!$M${lr}*(1-Protection!$E$12),"")', fmt="0.00")
    put(res, f"F{r}", f'=IF({on},$C$5*Protection!$M${lr}/(10*Protection!$N${lr})/(1-Protection!$E$12),"")', fmt="#,##0.0")
    put(res, f"G{r}", f'=IF({on},$C$5*Protection!$M${lr}/(10*Protection!$N${lr})*ROUND(Protection!$L${lr},0),"")', fmt="#,##0.0")
    put(res, f"H{r}", f'=IF({on},G{r}/(1-Protection!$E$12),"")', fmt="#,##0.0", bold=True)
    for c in "ABCDEFGH":
        res[f"{c}{r}"].border = BOX
PT = PR[-1] + 1
put(res, f"A{PT}", "All layers", bold=True)
put(res, f"C{PT}", f'=IF(Protection!$E$13="no","",Protection!$L${LT}&" coats = "&Protection!$O${LT}&" µm")', bold=True)
put(res, f"G{PT}", f"=SUM(G{PR[0]}:G{PR[-1]})", fmt="#,##0.0", bold=True)
put(res, f"H{PT}", f"=SUM(H{PR[0]}:H{PR[-1]})", fmt="#,##0.0", bold=True)
# order by product (first occurrence of each product)
for i, r in enumerate(PR):
    put(res, f"I{r}", f'=IF(B{r}="","",IF(COUNTIF($B${PR[0]}:B{r},B{r})>1,"(see above)",ROUNDUP(SUMIF($B${PR[0]}:$B${PR[-1]},B{r},$H${PR[0]}:$H${PR[-1]})-0.000000001,0)))', fmt="#,##0", bold=True)
    res[f"I{r}"].border = BOX
put(res, f"I{PT}", f'=SUM(I{PR[0]}:I{PR[-1]})', fmt="#,##0", bold=True)
note(res, f"A{PT + 1}", "Litres = area × DFT ÷ (10 × volume solids %) per coat, × coats, divided by (1 − loss). Pack sizes are not modelled.")
# galvanizing
GR0 = PT + 3
section(res, f"A{GR0}", "Hot-dip galvanizing (ISO 1461)")
put(res, f"A{GR0 + 1}", f'=IF(Protection!$E$14="yes","","Not used: choose “Hot-dip galvanized only” or “Duplex” on the Protection sheet.")', color="566579")
header(res, GR0 + 2, ["Item", "Value", "Basis"])
res.merge_cells(start_row=GR0 + 2, start_column=3, end_row=GR0 + 2, end_column=8)
on = 'Protection!$E$14="yes"'
outer = f'(Members!$C$4+Members!$C$5)'
inner = f'SUM(Members!$Z${M1}:$Z${ML})'
grows = [
    ("Coating thickness (mean)", f'=IF({on},{GZ["um"]}&" µm","")', f'=IF({on},{GZ["check"]},"")'),
    ("Coating mass", f'=IF({on},ROUND({GZ["gm2"]},0)&" g/m²","")', f'=IF({on},"thickness × 7.2 (zinc coating density 7.2 g/cm³, ISO 1461)","")'),
    ("Galvanized area (m²)", f'=IF({on},({outer}+{inner})*(1+N(Protection!$B$10)/100),"")',
     f'=IF({on},"outside "&TEXT({outer},"#,##0.00")&" m²"&IF({inner}>0," + inside of tubes and pipes "&TEXT({inner},"#,##0.00")&" m²","")&IF(N(Protection!$B$10)>0," + "&Protection!$B$10&"% allowance",""),"")'),
    ("Zinc on the job (kg)", f'=IF({on},B{GR0 + 5}*{GZ["gm2"]}/1000,"")', f'=IF({on},"galvanized area × coating mass","")'),
    ("Zinc volume (L)", f'=IF({on},B{GR0 + 5}*{GZ["um"]}/1000,"")', f'=IF({on},"galvanized area × thickness","")'),
    ("Added weight (% of the steel)", f'=IF(AND({on},Members!$C$6>0),B{GR0 + 6}/(Members!$C$6*1000),"")',
     f'=IF(AND({on},Members!$C$6>0),"steel "&TEXT(Members!$C$6,"#,##0.00")&" t → galvanized "&TEXT(Members!$C$6+B{GR0 + 6}/1000,"#,##0.00")&" t (each piece: Members sheet, last columns)","")'),
    ("Life to first maintenance", f'=IF({on},IF({GZ["lo"]}="","specialist advice",{GZ["life"]}),"")',
     f'=IF({on},IF({GZ["lo"]}="",{GZ["life"]},Protection!$E$6&": thickness ÷ zinc loss "&{GZ["lo"]}&"–"&{GZ["hi"]}&" µm a year (ISO 9223, ISO 14713-1). "&{GZ["durcheck"]}),"")'),
]
for i, (lab, val, basis_) in enumerate(grows):
    r = GR0 + 3 + i
    put(res, f"A{r}", lab, bold=True)
    put(res, f"B{r}", val, fmt=("#,##0.00" if "m²)" in lab else "#,##0.0" if "(kg)" in lab or "(L)" in lab else "0.0%" if "%" in lab else None))
    put(res, f"C{r}", basis_, wrap=False)
    res.merge_cells(f"C{r}:H{r}")
    for c in "ABC":
        res[f"{c}{r}"].border = BOX
# specification
SP = GR0 + 3 + len(grows) + 2
section(res, f"A{SP}", "Specification summary (copy into your document)")
sel = f"Protection!$F${LY + 1}"
spec = [
    f'="Environment: "&Protection!$E$6&" "&LOWER(INDEX(Env!$G$1:$G${ENV_LAST},MATCH(Protection!$E$6,Env!$B$1:$B${ENV_LAST},0)))&" (ISO 12944-2 / ISO 9223). Durability: "&LOWER(Protection!$B$7)&"."',
    f'="Protection: "&Protection!$B$5&"."',
    f'=IF({on},"Hot-dip galvanize to ISO 1461 (SANS 121)"&IF(Protection!$E$5="galv",", no paint.",", then paint as below (duplex).")&" Zinc coating: mean "&{GZ["um"]}&" µm ("&ROUND({GZ["gm2"]},0)&" g/m²); ISO 1461 minimum for "&LOWER({GZ["band"]})&": "&{GZ["mean"]}&" µm mean.","")',
    f'=IF({on},IF({GZ["lo"]}="",{GZ["life"]},"Expected life to first maintenance in "&Protection!$E$6&": "&{GZ["life"]}&" (ISO 14713-1; zinc loss "&{GZ["lo"]}&"–"&{GZ["hi"]}&" µm a year, ISO 9223)."),"")',
    f'=IF({on},"Vent and drain hollow sections and enclosed spaces (ISO 1461 Annex B, ISO 14713-2 / SANS 14713-2). Zinc: about "&TEXT(B{GR0 + 6},"#,##0")&" kg on "&TEXT(B{GR0 + 5},"#,##0.0")&" m².","")',
    f'=IF(Protection!$E$13="no","","Paint system: "&IF(Protection!$E${LY + 1}="","",INDEX(Lists!$Q$2:$Q${SUP_LAST},MATCH(INDEX(Systems!$C$1:$C${SYS_LAST},Protection!$E${LY + 1}),Lists!$R$2:$R${SUP_LAST},0))&" ")&{sel}&IF(Protection!$E$16<>Protection!$E$8," (Jotun build, "&Protection!$B$8&" products substituted)","")&IF(Protection!$B${EDITED}="yes"," (edited)","")&".")',
] + [f'=IF(B{r}="","","  "&A{r}&": "&B{r}&", "&C{r}&" µm DFT")' for r in PR] + [
    f'=IF(Protection!$E$13="no","","Total NDFT "&Protection!$O${LT}&" µm in "&Protection!$L${LT}&" coats. "&Protection!$B${VER})',
    f'=IF(Protection!$E$13="no","","Inspection: DFT to ISO 19840; no individual reading above "&3*Protection!$O${LT}&" µm (3 × NDFT, ISO 12944-5 7.3) unless agreed.")',
    '="Estimate only: confirm products against the supplier\'s current data sheets and the system with the supplier."',
]
for i, f in enumerate(spec):
    r = SP + 1 + i
    put(res, f"A{r}", f)
    res[f"A{r}"].font = font(size=10, color=NAVY)
res.freeze_panes = "A4"
res.page_setup.orientation = "landscape"
res.page_setup.fitToWidth = 1
res.sheet_properties.pageSetUpPr.fitToPage = True
res.page_setup.fitToHeight = 0

# conditional formats: ✓ green, ✗ red
for ws, ref in ((pro, f"C{GR[0]}:C{GR[-1]}"), (pro, f"B{VER}"), (pro, f"E{GP + 7}"), (pro, f"E{GP + 11}"), (mem, f"Q{M1}:Q{ML}"),
                (res, f"C{GR0 + 3}")):
    first_cell = ref.split(":")[0]
    ws.conditional_formatting.add(ref, FormulaRule(formula=[f'LEFT({first_cell},1)="✓"'], font=Font(name=F, color="1D8A4A", bold=True)))
    ws.conditional_formatting.add(ref, FormulaRule(formula=[f'LEFT({first_cell},1)="✗"'], font=Font(name=F, color="B3261E", bold=True)))
pro.conditional_formatting.add(f"K{LIST_TOP}:K{LIST_BOT}", FormulaRule(formula=[f'ISNUMBER(SEARCH("tested",K{LIST_TOP}))'], fill=PatternFill("solid", fgColor="E2F5F3")))
pro.conditional_formatting.add(f"B{LIST_TOP}:L{LIST_BOT}", FormulaRule(formula=[f'AND($B{LIST_TOP}<>"",$B{LIST_TOP}=$F${LY + 1})'], fill=PatternFill("solid", fgColor="E2F5F3")))

# ------------------------------------------------------------------------------------------------------------ Read me
title(read, "Paint & Galvanizing Calculator", "EPCM Holdings · surface area · ISO 12944 paint systems · ISO 1461 hot-dip galvanizing")
read.column_dimensions["A"].width = 4
read.column_dimensions["B"].width = 120
rows = [
    ("How to use it", None),
    ("1", "Members: one row per member. Choose the member type (pipe, a SAISC / EN / AISC section family, or custom), then the size from the list, then the quantity and the length of each piece. Pipes take a schedule (blank = STD)."),
    ("2", "Protection: choose painted steel, hot-dip galvanized only, duplex (galvanized + paint) or metal spray + paint; the environment; the durability; the paint supplier. The systems that qualify list themselves, least paint first."),
    ("3", "Pick a system (blank = the first in the list). To change a layer, type in the yellow “Your …” columns; the ISO 12944-5 check updates as you type."),
    ("4", "Galvanizing (galvanized only or duplex): steel thickness band (or from the member list), coating thickness (blank = ISO 1461 minimum), and whether tubes and pipes are galvanized inside."),
    ("5", "Results: areas, paint per layer and to order, zinc quantities, life to first maintenance, and a specification summary to copy. Weight of each galvanized piece is in the last columns of the Members sheet."),
    ("Cells", None),
    ("", "Yellow cells with blue text are inputs: change only those. Grey cells are worked out. Grey tabs (Lists, Sizes, Pipes, Products, Systems, AnnexB, Env) are the data; leave them alone."),
    ("", "The first eight member rows are an example job; overwrite or clear them."),
    ("What it is built from", None),
    ("", "The same data as the web calculator (index.html), exported by tools/export_data.js and written by tools/build_xlsx.py: ASME B36.10M pipe; SAISC, EN / BS and AISC sections; Jotun, Hempel and PPG ISO 12944 systems; ISO 12944-5 Annex B minimums; ISO 1461 coating minimums; ISO 9223 zinc rates. The web page's README lists every source and limit."),
    ("", "Systems a supplier rates higher than ISO 12944-5 Annex B allows (from ISO 12944-6 testing) are flagged “tested”. Carboline has no systems of its own yet: with Carboline selected, Jotun's builds are shown with Carboline products of the same type (not certified by anyone)."),
    ("", "Excel 2010 or later (Microsoft 365 recommended). No macros."),
    ("Limits", None),
    ("", "Estimates only. Confirm every product against the supplier's current data sheet and the system with the supplier before ordering. Confirm the corrosivity category on site. Galvanizers usually exceed the ISO 1461 minimum, so real zinc pickup and weight can be higher."),
]
r = 4
for k, v in rows:
    if v is None:
        section(read, f"A{r}", k)
    else:
        read[f"A{r}"] = k
        read[f"A{r}"].font = font(bold=True, color=TEAL)
        read[f"B{r}"] = v
        read[f"B{r}"].font = font()
        read[f"B{r}"].alignment = Alignment(wrap_text=True, vertical="top")
        read.row_dimensions[r].height = 15 * max(1, math.ceil(len(v) / 135))
    r += 1

wb.active = 1
# openpyxl stores no calculated values: make Excel work every formula out when the file is opened
from openpyxl.workbook.properties import CalcProperties
wb.calculation = CalcProperties(fullCalcOnLoad=True)
wb.save(out)
print(f"wrote {out}: {SYS_LAST - 1} systems, {SIZES_LAST - 1} sizes, {PROD_LAST - 1} products")
