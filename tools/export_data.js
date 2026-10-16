// Dump every data file the web page loads (in index.html order) to one JSON document on stdout.
// Used by tools/build_xlsx.py so the Excel workbook is built from exactly the same data as the page.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const m of html.matchAll(/<script src="(data\/[^"]+\.js)"><\/script>/g)) require(path.join(root, m[1]));
const C = require(path.join(root, "calc.js"));
const DB = globalThis.PaintDB;
// per system: what ISO 12944-5 Annex B allows for its own build (index 0-3, or -1)
const durs = DB.iso12944.durabilities;
const annex = DB.systems.map((s) => {
  const a = C.assess(C.systemLayers(s, s.supplier), s.substrate, s.env);
  return a.applicable && a.achieved ? durs.indexOf(a.achieved) : -1;
});
// per section line: element thickness and the inside area a galvanizing bath also coats
const thick = {};
for (const f of DB.sections.families) for (const it of f.items) {
  const t = C.elementThickness({ kind: "section", family: f.id, size: it[0] });
  const g = C.galvAreaPerM({ kind: "section", family: f.id, size: it[0], length: 1, qty: 1 }, true);
  thick[f.id + "|" + it[0]] = { tmin: t ? t.min : null, tmax: t ? t.max : null, inner: g ? g.inner : 0, name: C.sectionName(f, it) };
}
process.stdout.write(JSON.stringify({ db: DB, annex, thick, groups: C.sectionGroups().map((g) => ({ cat: g.catalogue.id, short: g.catalogue.short, group: g.group, fams: g.families.map((f) => f.id) })) }));
