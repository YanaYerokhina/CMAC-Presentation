"use strict";
/* Excel -> presentation model.
 *
 * Workbook format (see the downloadable template):
 *   "Deck" sheet    key/value rows: Title, Company, Footer
 *   "Slides" sheet  one row per slide: Layout | Title | Eyebrow | Number | Subtitle | Body | Items | Data | Footnote | Background | Chart | Format
 *   any other sheet data referenced from the Data column (lists, KPI rows, tables, chart series)
 * A workbook without a "Slides" sheet becomes a cover, one table slide per sheet, and a closing slide.
 */
const ExcelJS = require("exceljs");
const B = require("../public/deck/builder.js");

/* ---------- cell helpers ---------- */
function rawValue(cell) {
  let v = cell ? cell.value : null;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return v.result instanceof Date ? v.result : v.result ?? null;
    if ("formula" in v || "sharedFormula" in v) return null;
    if ("text" in v) return typeof v.text === "object" && v.text.richText ? v.text.richText.map((r) => r.text).join("") : v.text;
    if ("error" in v) return null;
  }
  return v;
}

function formatNumber(v, fmt) {
  fmt = String(fmt || "");
  const decimals = (() => { const m = /\.(0+)/.exec(fmt); return m ? m[1].length : 0; })();
  const neg = v < 0, a = Math.abs(v);
  const minus = "−";
  if (fmt.includes("%")) return (neg ? minus : "") + (a * 100).toFixed(decimals) + "%";
  const grouped = a.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (fmt.includes("$")) {
    if (neg && fmt.includes("(")) return "($" + grouped + ")";
    return (neg ? minus : "") + "$" + grouped;
  }
  if (/[#0]/.test(fmt) && fmt !== "General") return (neg ? minus : "") + grouped;
  if (Number.isInteger(v)) return (neg ? minus : "") + a.toLocaleString("en-US");
  return (neg ? minus : "") + a.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function cellText(cell) {
  const v = rawValue(cell);
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  if (typeof v === "number") return formatNumber(v, cell.numFmt);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).trim();
}

function isHighlighted(cell) {
  const f = cell && cell.fill;
  if (!f || f.type !== "pattern" || f.pattern !== "solid" || !f.fgColor) return false;
  const argb = String(f.fgColor.argb || "").toUpperCase();
  if (argb === "FFFFFFFF" || argb === "00FFFFFF") return false;
  return !!(argb || f.fgColor.theme != null);
}

/* sheet -> { headers, rows (text), raw (values), cells } trimmed of empty rows/columns */
function readSheet(ws) {
  const grid = [];
  let width = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    for (let c = 1; c <= Math.max(row.cellCount, row.actualCellCount); c++) cells.push(row.getCell(c));
    while (cells.length && cellText(cells[cells.length - 1]) === "") cells.pop();
    if (!cells.length) return;
    width = Math.max(width, cells.length);
    grid.push(cells);
  });
  const rows = grid.map((cells) => { const r = []; for (let c = 0; c < width; c++) r.push(cells[c] || null); return r; });
  return { width, cells: rows };
}

function findSheet(wb, names) {
  const want = names.map((n) => n.toLowerCase());
  return wb.worksheets.find((ws) => want.includes(ws.name.trim().toLowerCase())) || null;
}

const HEADER_ALIASES = {
  layout: ["layout", "type", "template", "slide type"],
  title: ["title", "headline", "heading"],
  eyebrow: ["eyebrow", "section", "label", "kicker"],
  number: ["number", "no", "no.", "#", "section number"],
  subtitle: ["subtitle", "subheading", "sub"],
  body: ["body", "text", "content", "paragraph", "value"],
  items: ["items", "list", "bullets", "points"],
  data: ["data", "data sheet", "sheet", "source"],
  foot: ["footnote", "foot", "footer", "note", "notes", "source note"],
  background: ["background", "bg", "color", "style"],
  chart: ["chart", "chart type"],
  format: ["format", "number format"]
};
function headerMap(headerCells) {
  const map = {};
  headerCells.forEach((cell, i) => {
    const h = cellText(cell).toLowerCase();
    for (const [key, names] of Object.entries(HEADER_ALIASES)) if (names.includes(h) && map[key] == null) map[key] = i;
  });
  return map;
}

/* ---------- data sheet interpreters ---------- */
const ITEM_KEYS = {
  number: ["number", "no", "no.", "#", "step"],
  title: ["title", "name", "term", "item", "heading", "point", "text", "objective"],
  label: ["label", "metric", "kpi", "eyebrow", "category"],
  desc: ["description", "desc", "definition", "detail", "details", "note", "notes", "sub", "subtitle"],
  value: ["value", "amount", "figure", "number value", "big number"]
};
function sheetItems(sheet) {
  if (!sheet || !sheet.cells.length) return [];
  const head = sheet.cells[0].map((c) => cellText(c).toLowerCase());
  const col = {};
  for (const [k, names] of Object.entries(ITEM_KEYS)) { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) col[k] = i; }
  const known = Object.keys(col).length > 0;
  const body = known ? sheet.cells.slice(1) : sheet.cells;
  if (!known) { col.title = 0; col.desc = 1; col.value = 2; }
  return body.map((r) => {
    const g = (k) => (col[k] != null && r[col[k]] ? cellText(r[col[k]]) : "");
    const item = { number: g("number"), title: g("title"), label: g("label"), desc: g("desc"), value: g("value") };
    if (!item.title) item.title = item.label;
    if (!item.label) item.label = item.title;
    return item;
  }).filter((i) => i.title || i.desc || i.value);
}

function inlineItems(text) {
  return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.replace(/^[-•*]\s*/, "").split("|").map((x) => x.trim());
    return { title: p[0] || "", label: p[0] || "", desc: p[1] || "", value: p[2] || "" };
  });
}

function sheetTable(sheet) {
  if (!sheet || !sheet.cells.length) return { headers: [], rows: [], numeric: [], best: {} };
  const headers = sheet.cells[0].map(cellText);
  const body = sheet.cells.slice(1);
  const numeric = headers.map((_, j) => {
    const vals = body.map((r) => rawValue(r[j])).filter((v) => v != null && v !== "");
    return vals.length > 0 && vals.filter((v) => typeof v === "number").length / vals.length >= 0.6;
  });
  const best = {};
  body.forEach((r, i) => r.forEach((c, j) => { if (j > 0 && isHighlighted(c)) best[i + ":" + j] = 1; }));
  return { headers, rows: body.map((r) => r.map(cellText)), numeric, best };
}

function sheetChart(sheet, type, format) {
  if (!sheet || sheet.cells.length < 2) return { type, format: format || "num", labels: [], series: [] };
  const head = sheet.cells[0].map(cellText), body = sheet.cells.slice(1);
  const series = [];
  for (let j = 1; j < head.length; j++) {
    const values = body.map((r) => { const v = rawValue(r[j]); return typeof v === "number" ? v : parseFloat(String(v || "").replace(/[$,%\s]/g, "")) || 0; });
    series.push({ name: head[j] || "Series " + j, values });
  }
  if (!format) {
    const fmt = String((body[0] && body[0][1] && body[0][1].numFmt) || "");
    format = fmt.includes("%") ? (/\.00/.test(fmt) ? "pct2" : "pct") : fmt.includes("$") ? "usd" : "num";
  }
  return { type, format, labels: body.map((r) => cellText(r[0])), series };
}

const CHART_TYPES = { bar: "bar", bars: "bar", horizontal: "bar", column: "column", columns: "column", vertical: "column", donut: "donut", pie: "donut" };
const BACKGROUNDS = { paper: "paper", white: "paper", light: "paper", sand: "sand", beige: "sand", dark: "dark", deep: "dark", slate: "slate", sage: "sage", green: "sage" };

/* ---------- main entry ---------- */
async function parseWorkbook(buffer, { fallbackTitle = "Presentation" } = {}) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) { const err = new Error("That file could not be read as an Excel workbook (.xlsx)."); err.status = 400; throw err; }

  const deck = { title: "", company: "", meta: "" };
  const deckWs = findSheet(wb, ["deck", "settings", "presentation", "info"]);
  if (deckWs) {
    readSheet(deckWs).cells.forEach((r) => {
      const k = cellText(r[0]).toLowerCase(), v = cellText(r[1]);
      if (!v) return;
      if (["title", "presentation", "presentation title", "name"].includes(k)) deck.title = v;
      else if (["company", "client", "client company", "organization"].includes(k)) deck.company = v;
      else if (["footer", "meta", "footer text", "footer line"].includes(k)) deck.meta = v;
    });
  }
  const sheets = {};
  wb.worksheets.forEach((ws) => { sheets[ws.name.trim().toLowerCase()] = ws; });
  const getData = (name) => { const ws = name ? sheets[String(name).trim().toLowerCase()] : null; return ws ? readSheet(ws) : null; };

  const slides = [];
  const warnings = [];
  const slidesWs = findSheet(wb, ["slides", "deck slides", "outline"]);
  if (slidesWs) {
    const s = readSheet(slidesWs);
    const map = headerMap(s.cells[0] || []);
    if (map.layout == null && map.title == null) {
      const err = new Error('The "Slides" sheet needs a header row with at least "Layout" and "Title" columns.'); err.status = 400; throw err;
    }
    s.cells.slice(1).forEach((r, idx) => {
      const g = (k) => (map[k] != null && r[map[k]] ? cellText(r[map[k]]) : "");
      const layoutName = g("layout") || "text";
      const layout = B.layoutKey(layoutName);
      if (!B.LAYOUTS[layoutName.toLowerCase()] && layout === "text" && layoutName.toLowerCase() !== "text") warnings.push(`Row ${idx + 2}: unknown layout "${layoutName}", used "text".`);
      const slide = { layout, title: g("title"), eyebrow: g("eyebrow"), number: g("number"), subtitle: g("subtitle"), body: g("body"), foot: g("foot") };
      const bg = BACKGROUNDS[g("background").toLowerCase()];
      if (bg) slide.background = bg;
      const dataName = g("data"), data = getData(dataName);
      if (dataName && !data) warnings.push(`Row ${idx + 2}: data sheet "${dataName}" was not found.`);
      if (layout === "table") slide.table = sheetTable(data);
      else if (layout === "chart") {
        const lname = layoutName.toLowerCase();
        const type = CHART_TYPES[g("chart").toLowerCase()] || (/(donut|pie)/.test(lname) ? "donut" : /column/.test(lname) ? "column" : "bar");
        slide.chart = sheetChart(data, type, g("format"));
      } else {
        slide.items = data ? sheetItems(data) : inlineItems(g("items"));
      }
      if (layout === "table" && slide.table.rows.length && /^total/i.test(slide.table.rows[slide.table.rows.length - 1][0] || "")) slide.totalRow = true;
      if (Object.values(slide).some((v) => v && (typeof v !== "object" || Object.keys(v).length))) slides.push(slide);
    });
  } else {
    /* any workbook: cover + one table per sheet + close */
    slides.push({ layout: "cover", title: deck.title || fallbackTitle, eyebrow: deck.company || "", body: deck.company ? "Prepared for " + deck.company : "" });
    wb.worksheets.forEach((ws) => {
      if (ws === deckWs || ws.state === "hidden") return;
      const data = readSheet(ws);
      if (!data.cells.length) return;
      slides.push({ layout: "table", title: ws.name, eyebrow: ws.name, table: sheetTable(data) });
    });
    slides.push({ layout: "close" });
  }
  if (!slides.length) { const err = new Error("No slides were found in the workbook."); err.status = 400; throw err; }
  return { deck, slides, warnings };
}

/* ---------- template workbook ---------- */
async function templateWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CMAC Presentation Studio";
  const head = (ws) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFF9F7F3" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF22383A" } };
    r.alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const wrap = (ws) => ws.eachRow((row) => { row.alignment = { wrapText: true, vertical: "top" }; });

  const info = wb.addWorksheet("Instructions");
  info.columns = [{ width: 22 }, { width: 110 }];
  [
    ["How it works", "Each row of the Slides sheet becomes one slide. Pick a Layout, fill the text columns, and point the Data column at another sheet for lists, tables and charts."],
    ["", ""],
    ["Deck sheet", "Title (presentation name), Company (client the deck belongs to), Footer (line printed at the bottom of every slide)."],
    ["Slides columns", "Layout · Title · Eyebrow (small label at top) · Number (section number) · Subtitle · Body · Items · Data · Footnote · Background · Chart · Format"],
    ["Layouts", Object.entries(B.LAYOUTS).map(([k, l]) => k + " (" + l.desc.toLowerCase() + ")").join("; ")],
    ["Items", "Short lists can be typed straight into the Items cell, one per line: Title | Description | Value"],
    ["Data sheets", "Lists: columns Title, Description (and Number, Label, Value). Tables: the first row is the header; fill a cell with color to highlight it as the best term. Charts: first column = labels, each other column = a series."],
    ["Background", "paper (default), sand, dark, slate, sage"],
    ["Chart / Format", "Chart: bar, column, donut. Format: usd, usdM, pct, pct2, num (blank = taken from the cell format)."],
    ["Text styling", "**bold** makes text bold; ((word)) draws the hand-drawn ring highlight around a word. Line breaks in a cell are kept."],
    ["After upload", "Everything can be changed in the visual editor: hover an element, click it, and use the side panel."]
  ].forEach((r) => info.addRow(r));
  info.getColumn(1).font = { bold: true, color: { argb: "FF22383A" } };
  wrap(info);

  const deck = wb.addWorksheet("Deck");
  deck.columns = [{ header: "Field", width: 18 }, { header: "Value", width: 70 }];
  deck.addRows([["Title", "Walla Walla Clinic Bank Proposals"], ["Company", "Walla Walla Clinic"], ["Footer", "CMAC Partners · Walla Walla Clinic · October 2026"]]);
  head(deck);

  const slides = wb.addWorksheet("Slides");
  slides.columns = [
    { header: "Layout", width: 13 }, { header: "Title", width: 42 }, { header: "Eyebrow", width: 20 }, { header: "Number", width: 9 },
    { header: "Subtitle", width: 34 }, { header: "Body", width: 46 }, { header: "Items", width: 30 }, { header: "Data", width: 14 },
    { header: "Footnote", width: 44 }, { header: "Background", width: 12 }, { header: "Chart", width: 9 }, { header: "Format", width: 9 }
  ];
  slides.addRows([
    ["cover", "Walla Walla Clinic\nBank Proposals", "Cash-out refinance · Walla Walla medical campus", "", "", "Prepared for Walla Walla Clinic · October 2026", "", "", "CMACPARTNERS.COM", "", "", ""],
    ["statement", "Confidential.", "Confidentiality", "", "", "This presentation contains confidential competitive term sheets that are the property of CMAC Partners and its clients.\nWalla Walla Clinic has agreed not to disclose the data in this presentation to any third party.", "", "", "", "", "", ""],
    ["story", "Leverage equity in the real estate to help ((stabilize)) Walla Walla Clinic for years to come.", "Why we're here", "", "A cash-out refinance turns part of the campus's equity into cash for the clinic.", "", "", "Story", "", "dark", "", ""],
    ["list", "What we asked the banks for.", "Objectives", "01", "", "Refinance the existing debt on the medical campus with four objectives.", "", "Objectives", "Objectives as set out in CMAC's request for proposals.", "", "", ""],
    ["table", "FNBA and WaFd offer no personal guarantee at 65% LTV or below.", "The proposals", "02", "", "", "", "Terms", "Rates as of 10/01/2026.", "", "", ""],
    ["chart", "Annual payments under four scenarios.", "The money", "03", "", "", "", "Payments", "Payments at 25-year amortization.", "", "bar", "usd"],
    ["kpis", "FNBA's spread is 0.63% below the current loan's, worth **$324,544** today.", "The cost", "04", "Present value of interest savings", "$324,544", "", "Savings", "PV01 as of 10/01/2026 and subject to change.", "", "", ""],
    ["columns", "Three decisions, in order.", "Next steps", "05", "", "", "Meet First National Bank of Alaska | Share availability for a meeting to test terms and fit.\nDecide on the cash-out amount | Choose a point on the leverage scale.\nOrder appraisal bids | A bank-ordered appraisal sets collateral value.", "", "Indicative terms only; not a commitment to lend.", "", "", ""],
    ["divider", "Addenda", "Addenda", "", "", "", "", "", "", "sage", "", ""],
    ["glossary", "Terms used in this deck.", "Glossary", "A1", "", "", "", "Glossary", "Prepared by CMAC Partners.", "", "", ""],
    ["close", "Conclusions from data, not opinions.", "", "", "cmacpartners.com", "", "", "", "", "slate", "", ""]
  ]);
  head(slides); wrap(slides);

  const story = wb.addWorksheet("Story");
  story.columns = [{ header: "Label", width: 26 }, { header: "Value", width: 14 }, { header: "Title", width: 26 }, { header: "Description", width: 50 }];
  story.addRows([["Equity in the campus", "$9.70MM", "Estimated equity", "Estimated value less the current loan payoff."],
    ["Cash to the clinic at 65% LTV", "$4.62MM", "No personal guarantee", "After payoff, prepayment and closing costs."],
    ["Amortization", "25 years", "Lower monthly payments", "A new 25-year schedule on the full loan."]]);
  head(story); wrap(story);

  const obj = wb.addWorksheet("Objectives");
  obj.columns = [{ header: "Title", width: 30 }, { header: "Description", width: 70 }];
  obj.addRows([["Cash out", "Borrow against the campus's equity to provide cash to the clinic."], ["No personal guarantees", "Finance the campus without requiring the owners to personally guarantee the loan."],
    ["A competitive interest rate", "Price the loan against twenty-five lenders."], ["A 25-year amortization", "Keep monthly payments low."]]);
  head(obj); wrap(obj);

  const terms = wb.addWorksheet("Terms");
  terms.columns = [{ header: "Term", width: 24 }, { header: "FNBA", width: 16 }, { header: "BMO Harris", width: 16 }, { header: "Sound Community", width: 18 }, { header: "WaFd Bank", width: 16 }];
  terms.addRows([["Term × amortization", "7×25", "5×25", "10×25", "10×25"], ["Fixed rate", 0.0654, 0.0637, 0.076, 0.0728], ["Max LTV", 0.7, 0.65, 0.7, 0.75],
    ["Personal guarantee", "None ≤ 65% LTV", "Required", "Required", "None ≤ 65% LTV"], ["Prepayment", "1%", "3-2-1-0", "Make whole", "Swap unwind"]]);
  ["B", "C", "D", "E"].forEach((c) => { terms.getCell(c + "3").numFmt = "0.00%"; terms.getCell(c + "4").numFmt = "0%"; });
  terms.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4D39A" } };
  terms.getCell("B5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4D39A" } };
  head(terms);

  const pay = wb.addWorksheet("Payments");
  pay.columns = [{ header: "Scenario", width: 30 }, { header: "Annual payment", width: 18 }];
  pay.addRows([["Current loan", 405668], ["FNBA 65% LTV, fixed", 742110], ["FNBA 70% LTV, fixed", 799196], ["WaFd 65% LTV", 797466]]);
  pay.getColumn(2).numFmt = "$#,##0";
  head(pay);

  const sav = wb.addWorksheet("Savings");
  sav.columns = [{ header: "Label", width: 26 }, { header: "Value", width: 12 }, { header: "Note", width: 30 }];
  sav.addRows([["Current loan spread", "2.53%", "historical spread"], ["FNBA proposed spread", "1.90%", "fixed, 7-year term"], ["Differential", "0.63%", "in FNBA's favor"], ["Present value of 0.01%", "$5,114", "PV01 on $9.17MM"]]);
  head(sav);

  const glo = wb.addWorksheet("Glossary");
  glo.columns = [{ header: "Term", width: 32 }, { header: "Definition", width: 80 }];
  glo.addRows([["LTV", "Loan-to-value: the loan as a share of the property's appraised value."], ["Personal guarantee, 100% pro-rata", "Each owner personally guarantees their ownership share of the full loan."],
    ["DSCR", "Debt service coverage ratio: cash flow ÷ debt service."], ["3-2-1-0 prepayment", "A penalty of 3%, 2% and 1% of the balance in years one to three, then none."],
    ["Make whole / swap unwind", "A prepayment cost that compensates the bank for lost interest."], ["PV01", "The present value of 0.01% of rate over the life of the loan."]]);
  head(glo); wrap(glo);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { parseWorkbook, templateWorkbook, formatNumber };
