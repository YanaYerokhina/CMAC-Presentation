/* CMAC Presentation Studio · shared deck builder.
 * Runs in the browser (window.CMStudioBuilder) and in Node (require).
 * - DEFAULT_THEME / normalizeTheme / themeToCss: the editable theme tokens and the CSS they produce
 * - LAYOUTS / renderSlide: slide model -> <section class="slide"> markup in the CMAC deck language
 * - buildDeck: assembles a complete deck document (view, edit or standalone export)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CMStudioBuilder = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ======================= THEME ======================= */
  var COLOR_TOKENS = [
    { key: "paper", label: "Paper (slide background)" },
    { key: "sand", label: "Sand (panels)" },
    { key: "stone", label: "Stone (hairlines)" },
    { key: "ink", label: "Ink (body text)" },
    { key: "deep", label: "Deep (headings, dark slides)" },
    { key: "slate", label: "Slate" },
    { key: "sage", label: "Sage (labels, section slides)" },
    { key: "mist", label: "Mist" },
    { key: "olive-1", label: "Olive 1" },
    { key: "olive-2", label: "Olive 2" },
    { key: "olive-3", label: "Olive 3 (positive)" },
    { key: "olive-4", label: "Olive 4" },
    { key: "amber-1", label: "Amber 1" },
    { key: "amber-2", label: "Amber 2" },
    { key: "amber-3", label: "Amber 3 (negative)" },
    { key: "amber-4", label: "Amber 4" },
    { key: "shell", label: "Shell (around the deck)" }
  ];

  /* Fonts the theme and the element editor can choose from. "embedded" ship inside fonts.css. */
  var FONT_LIBRARY = [
    { family: "Hedvig Letters Serif", kind: "serif", source: "embedded" },
    { family: "Manrope", kind: "sans", source: "embedded" },
    { family: "Playfair Display", kind: "serif", source: "google", axes: "wght@400;500;600;700" },
    { family: "Lora", kind: "serif", source: "google", axes: "wght@400;500;600;700" },
    { family: "Merriweather", kind: "serif", source: "google", axes: "wght@300;400;700" },
    { family: "DM Serif Display", kind: "serif", source: "google", axes: "" },
    { family: "Libre Baskerville", kind: "serif", source: "google", axes: "wght@400;700" },
    { family: "Source Serif 4", kind: "serif", source: "google", axes: "wght@400;500;600;700" },
    { family: "Inter", kind: "sans", source: "google", axes: "wght@300;400;500;600;700;800" },
    { family: "Montserrat", kind: "sans", source: "google", axes: "wght@300;400;500;600;700;800" },
    { family: "Roboto", kind: "sans", source: "google", axes: "wght@300;400;500;700" },
    { family: "Open Sans", kind: "sans", source: "google", axes: "wght@300;400;500;600;700;800" },
    { family: "Poppins", kind: "sans", source: "google", axes: "wght@300;400;500;600;700;800" },
    { family: "Source Sans 3", kind: "sans", source: "google", axes: "wght@300;400;500;600;700;800" },
    { family: "Work Sans", kind: "sans", source: "google", axes: "wght@300;400;500;600;700;800" },
    { family: "IBM Plex Sans", kind: "sans", source: "google", axes: "wght@300;400;500;600;700" }
  ];

  var DEFAULT_THEME = {
    name: "CMAC",
    colors: {
      paper: "#F9F7F3", sand: "#F1EDE5", stone: "#D0CBC2", ink: "#171615",
      deep: "#22383A", slate: "#445B5D", sage: "#7C9194", mist: "#A5B9BE",
      "olive-1": "#D4D39A", "olive-2": "#AAAA6B", "olive-3": "#6F6E34", "olive-4": "#494812",
      "amber-1": "#FFCD83", "amber-2": "#F3A44A", "amber-3": "#9B5314", "amber-4": "#5A2E07",
      shell: "#101a1b"
    },
    fonts: { serif: "Hedvig Letters Serif", sans: "Manrope" },
    customFonts: [], /* [{family, dataUrl, format, kind}] */
    type: { display: 168, h1: 104, h2: 60, h3: 32, sub: 30, body: 24, small: 19, eyebrow: 18, big: 132, kpi: 64 },
    weights: { heading: 400, sub: 500, eyebrow: 600 },
    tracking: { heading: -0.02, eyebrow: 0.04 },
    eyebrowUppercase: true,
    texture: true,
    meta: "CMAC Partners",
    website: "CMACPARTNERS.COM",
    tagline: "Conclusions from data, not opinions.",
    logos: { logo: "", symbol: "", wordmark: "" }, /* data URLs; empty = the CMAC artwork */
    customCss: ""
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return o && typeof o === "object" && !Array.isArray(o); }
  function merge(base, over) {
    var out = clone(base);
    if (!isObj(over)) return out;
    Object.keys(over).forEach(function (k) {
      if (isObj(out[k]) && isObj(over[k])) out[k] = merge(out[k], over[k]);
      else if (over[k] !== undefined && over[k] !== null) out[k] = clone(over[k]);
    });
    return out;
  }
  function normalizeTheme(t) { return merge(DEFAULT_THEME, t || {}); }

  function cssString(s) { return "'" + String(s).replace(/[\\'"<>\n\r]/g, "") + "'"; }
  function safeColor(v) { v = String(v || "").trim(); return /^[#a-zA-Z0-9(),.%\s-]+$/.test(v) ? v : "transparent"; }
  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }

  function fontInfo(family) {
    for (var i = 0; i < FONT_LIBRARY.length; i++) if (FONT_LIBRARY[i].family === family) return FONT_LIBRARY[i];
    return null;
  }
  /* Google Fonts stylesheet URLs needed by a theme plus any families used inline in the slides */
  function googleFontLinks(theme, extraHtml) {
    var fams = {};
    [theme.fonts.serif, theme.fonts.sans].forEach(function (f) { fams[f] = 1; });
    if (extraHtml) FONT_LIBRARY.forEach(function (f) { if (extraHtml.indexOf(f.family) !== -1) fams[f.family] = 1; });
    var q = Object.keys(fams).map(fontInfo).filter(function (f) { return f && f.source === "google"; })
      .map(function (f) { return "family=" + encodeURIComponent(f.family).replace(/%20/g, "+") + (f.axes ? ":" + f.axes : ""); });
    return q.length ? ["https://fonts.googleapis.com/css2?" + q.join("&") + "&display=swap"] : [];
  }

  function themeToCss(t) {
    t = normalizeTheme(t);
    var D = DEFAULT_THEME, out = [];
    (t.customFonts || []).forEach(function (f) {
      if (!f || !f.family || !/^data:/.test(f.dataUrl || "")) return;
      out.push("@font-face{font-family:" + cssString(f.family) + ";src:url(" + JSON.stringify(f.dataUrl) + ")" +
        (f.format ? " format(" + cssString(f.format) + ")" : "") + ";font-display:swap;font-weight:100 900}");
    });
    var vars = COLOR_TOKENS.map(function (c) { return "--" + c.key + ":" + safeColor(t.colors[c.key]); });
    vars.push("--serif:" + cssString(t.fonts.serif) + ",'Hedvig Letters Serif',Georgia,serif");
    vars.push("--sans:" + cssString(t.fonts.sans) + ",'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif");
    out.push(":root{" + vars.join(";") + "}");
    var ty = t.type, w = t.weights, tr = t.tracking;
    var rules = [
      [".display", ty.display, D.type.display], ["h1", ty.h1, D.type.h1], ["h2", ty.h2, D.type.h2], ["h3", ty.h3, D.type.h3],
      [".sub", ty.sub, D.type.sub], [".body", ty.body, D.type.body], [".small", ty.small, D.type.small],
      [".eyebrow", ty.eyebrow, D.type.eyebrow], [".big", ty.big, D.type.big], [".kpi .v", ty.kpi, D.type.kpi]
    ];
    rules.forEach(function (r) { if (num(r[1], r[2]) !== r[2]) out.push(r[0] + "{font-size:" + num(r[1], r[2]) + "px}"); });
    if (num(ty.h2, D.type.h2) !== D.type.h2) out.push(".split h2{font-size:" + Math.round(num(ty.h2, 60) * 52 / 60) + "px}");
    if (num(w.heading, 400) !== 400) out.push(".display,h1,h2,.big,.kpi .v,.li .t,.cols .t,.cols .n{font-weight:" + num(w.heading, 400) + "}");
    if (num(w.sub, 500) !== 500) out.push(".sub,h3{font-weight:" + num(w.sub, 500) + "}");
    if (num(w.eyebrow, 600) !== 600) out.push(".eyebrow,.chrome,.kpi .l,.colk{font-weight:" + num(w.eyebrow, 600) + "}");
    if (num(tr.heading, -0.02) !== -0.02) out.push(".display,h1,h2,.big,.kpi .v{letter-spacing:" + num(tr.heading, -0.02) + "em}");
    if (num(tr.eyebrow, 0.04) !== 0.04) out.push(".eyebrow,.chrome,.kpi .l{letter-spacing:" + num(tr.eyebrow, 0.04) + "em}");
    if (!t.eyebrowUppercase) out.push(".eyebrow,.chrome,.chrome-b .meta,.kpi .l,.colk,.dt .h{text-transform:none}");
    if (!t.texture) out.push(".tex::before{display:none}");
    if (t.customCss) out.push(String(t.customCss).replace(/<\/style/gi, "<\\/style"));
    return out.join("\n");
  }

  /* Swap the CMAC sprite symbols for uploaded artwork while keeping the ids slides reference */
  function themedSprite(sprite, theme) {
    theme = normalizeTheme(theme);
    var boxes = { "cmac-logo": "0 0 553 81", "cmac-symbol": "0 0 99 129", "cmac-wordmark": "0 0 504 58" };
    var map = { logo: "cmac-logo", symbol: "cmac-symbol", wordmark: "cmac-wordmark" };
    Object.keys(map).forEach(function (k) {
      var url = theme.logos[k];
      if (!url || !/^data:image\//.test(url)) return;
      var id = map[k], vb = boxes[id].split(" ");
      var sym = '<symbol id="' + id + '" viewBox="' + boxes[id] + '"><image href="' + escAttr(url) + '" x="0" y="0" width="' + vb[2] +
        '" height="' + vb[3] + '" preserveAspectRatio="xMinYMid meet"/></symbol>';
      var re = new RegExp('<symbol id="' + id + '"[\\s\\S]*?</symbol>');
      sprite = sprite.replace(re, function () { return sym; });
    });
    return sprite;
  }

  /* ======================= TEXT HELPERS ======================= */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) { return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  /* plain text from Excel -> safe inline HTML: **bold**, *ring* highlight via ((word)), newlines -> <br> */
  function inline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\(\((.+?)\)\)/g, '<span class="ring">$1</span>').replace(/\r?\n/g, "<br>");
  }
  function paragraphs(s, cls, style) {
    if (s == null || String(s).trim() === "") return "";
    return String(s).split(/\r?\n\s*\r?\n|\r?\n/).filter(function (p) { return p.trim(); })
      .map(function (p) { return "<p class=\"" + cls + "\"" + (style ? ' style="' + style + '"' : "") + ">" + inline(p.trim()) + "</p>"; }).join("\n");
  }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  /* ======================= LAYOUTS ======================= */
  var BGS = { paper: "", sand: "sand", dark: "dark tex", slate: "slate tex", sage: "sage tex" };

  function sectionOpen(s, extraCls, opts) {
    opts = opts || {};
    var bg = s.background && BGS.hasOwnProperty(s.background) ? BGS[s.background] : (opts.bg || "");
    var cls = ["slide", bg, extraCls || "", opts.bare ? "bare" : ""].join(" ").replace(/\s+/g, " ").trim();
    var title = s.title || s.eyebrow || opts.fallbackTitle || "Slide";
    return '<section class="' + cls + '" data-title="' + escAttr(String(title).replace(/\*\*/g, "").replace(/\n/g, " ").slice(0, 60)) + '"' +
      (opts.bare ? "" : ' data-eyebrow="' + escAttr(s.eyebrow || "") + '"' + (s.number ? ' data-no="' + escAttr(s.number) + '"' : "")) + ">";
  }
  function foot(s) { return s.foot ? '<p class="foot">' + inline(s.foot) + "</p>" : ""; }
  function items(s) { return Array.isArray(s.items) ? s.items : []; }
  function it(i, keys) { for (var k = 0; k < keys.length; k++) { var v = i[keys[k]]; if (v != null && String(v) !== "") return v; } return ""; }

  var LAYOUTS = {
    cover: {
      label: "Cover", desc: "Co-branded title slide",
      sample: { title: "Client Name\nPresentation Title", eyebrow: "Project · Subject", body: "Prepared for Client · Month Year" },
      render: function (s, ctx) {
        var logo = s.image ? '<span class="div"></span><img src="' + escAttr(s.image) + '" alt="' + escAttr(ctx.company || "") + '" style="max-height:88px;max-width:none">'
          : (ctx.company ? '<span class="div"></span><span style="font-family:var(--serif);font-size:44px;letter-spacing:-.02em">' + esc(ctx.company) + "</span>" : "");
        return sectionOpen(s, "", { bare: true, fallbackTitle: "Cover" }) +
          '<div class="hline" style="top:212px"></div><div class="vline" style="left:640px"></div><div class="hline" style="bottom:212px"></div>' +
          '<div style="position:absolute;left:96px;top:92px;color:var(--deep)" class="cobrand"><svg class="logo" style="width:300px;height:44px"><use href="#cmac-logo"/></svg>' + logo + "</div>" +
          '<div style="position:absolute;left:688px;top:300px;width:1136px"><div class="eyebrow">' + inline(s.eyebrow || s.subtitle || "") + '</div><h1 style="margin-top:28px;color:var(--deep)">' + inline(s.title || "Presentation") + "</h1></div>" +
          '<div style="position:absolute;left:96px;bottom:110px;font-size:24px;color:var(--slate)">' + inline(s.body || "") + "</div>" +
          '<div style="position:absolute;right:96px;bottom:110px;font-size:20px;font-weight:600;letter-spacing:.05em;color:var(--sage)">' + inline(s.foot || ctx.website || "") + "</div></section>";
      }
    },
    statement: {
      label: "Statement", desc: "Headline on the left, paragraphs on the right",
      sample: { title: "Confidential.", eyebrow: "Confidentiality", body: "First paragraph of the statement.\nSecond paragraph of the statement." },
      render: function (s) {
        return sectionOpen(s) + '<div class="stage" style="justify-content:center"><div class="split" style="height:auto"><div class="side"><h2>' + inline(s.title) +
          '</h2></div><div class="main">' + paragraphs(s.body, "body", "font-size:28px") + "</div></div></div>" + foot(s) + "</section>";
      }
    },
    text: {
      label: "Headline + text", desc: "Headline, subtitle and body copy",
      sample: { title: "A clear headline for this slide.", subtitle: "A supporting sentence.", body: "Body copy goes here." },
      render: function (s) {
        return sectionOpen(s) + '<div class="stage"><h2>' + inline(s.title) + "</h2>" + (s.subtitle ? '<p class="sub">' + inline(s.subtitle) + "</p>" : "") +
          '<div style="margin-top:44px">' + paragraphs(s.body, "body") + "</div></div>" + foot(s) + "</section>";
      }
    },
    story: {
      label: "Story (big numbers)", desc: "Dark textured slide with three big figures",
      sample: { title: "Leverage equity to ((stabilize)) the business.", subtitle: "One sentence on why we are here.", background: "dark",
        items: [{ label: "Equity", value: "$9.7MM", title: "Estimated equity", desc: "Value less current debt." }, { label: "Cash out", value: "$4.6MM", title: "To the business", desc: "At 65% loan-to-value." }, { label: "Amortization", value: "25 years", title: "Lower payments", desc: "A new schedule." }] },
      render: function (s) {
        if (!s.background) s.background = "dark";
        var cols = items(s).map(function (i, k) {
          return '<div><div class="eyebrow">' + inline(it(i, ["label", "eyebrow"])) + '</div><div class="big num' + (k === 1 ? " hi" : "") + '" style="font-size:104px;margin-top:16px">' + inline(it(i, ["value", "number"])) +
            '</div><div class="t">' + inline(it(i, ["title"])) + '</div><div class="d">' + inline(it(i, ["desc", "description"])) + "</div></div>";
        }).join("");
        return sectionOpen(s) + '<div class="stage"><h2 style="max-width:none">' + inline(s.title) + "</h2>" + (s.subtitle ? '<p class="sub" style="max-width:60ch;color:var(--mist)">' + inline(s.subtitle) + "</p>" : "") +
          '<div class="cols story" style="margin-top:auto;margin-bottom:24px">' + cols + "</div></div>" + foot(s) + "</section>";
      }
    },
    list: {
      label: "Numbered list", desc: "Objectives: number, title, description",
      sample: { title: "What we asked for.", body: "Four objectives.", items: [{ title: "Cash out", desc: "Borrow against equity." }, { title: "No personal guarantees", desc: "Finance without guarantees." }, { title: "A competitive rate", desc: "Price against many lenders." }] },
      render: function (s) {
        var li = items(s).map(function (i, k) {
          return '<div class="li"><span class="n">' + esc(it(i, ["number"]) || pad2(k + 1)) + '</span><span class="t">' + inline(it(i, ["title", "label"])) + '</span><span class="d">' + inline(it(i, ["desc", "description", "value"])) + "</span></div>";
        }).join("");
        return sectionOpen(s) + '<div class="stage"><h2>' + inline(s.title) + "</h2>" + (s.body ? paragraphs(s.body, "body", "margin-top:20px") : "") +
          '<div class="list" style="margin-top:44px">' + li + "</div></div>" + foot(s) + "</section>";
      }
    },
    agenda: {
      label: "Agenda", desc: "Large numbered agenda",
      sample: { title: "Agenda", items: [{ title: "Objectives" }, { title: "The proposals" }, { title: "Next steps" }] },
      render: function (s) {
        var li = items(s).map(function (i, k) { return '<div class="li"><span class="n">' + esc(it(i, ["number"]) || pad2(k + 1)) + '</span><span class="t">' + inline(it(i, ["title", "label"])) + "</span></div>"; }).join("");
        return sectionOpen(s) + '<div class="stage"><h2>' + inline(s.title) + '</h2><div class="list agenda" style="margin-top:auto;margin-bottom:auto">' + li + "</div></div>" + foot(s) + "</section>";
      }
    },
    kpis: {
      label: "KPIs", desc: "Headline, hero number and a KPI row",
      sample: { title: "The spread is 0.63% lower, worth $324,544 today.", subtitle: "Present value of savings", body: "$324,544",
        items: [{ label: "Current spread", value: "2.53%", desc: "historical" }, { label: "Proposed spread", value: "1.90%", desc: "fixed, 7-year" }, { label: "Differential", value: "0.63%", desc: "in our favor" }] },
      render: function (s) {
        var k = items(s).map(function (i) {
          return '<div class="kpi"><div class="l">' + inline(it(i, ["label"])) + '</div><div class="v">' + inline(it(i, ["value"])) + '</div><div class="s">' + inline(it(i, ["desc", "description", "note"])) + "</div></div>";
        }).join("");
        var hero = s.body ? '<div style="margin-top:auto;margin-bottom:56px">' + (s.subtitle ? '<div class="eyebrow">' + inline(s.subtitle) + "</div>" : "") + '<div class="big num" style="margin-top:14px">' + inline(s.body) + "</div></div>" : "";
        return sectionOpen(s) + '<div class="stage"><h2 style="max-width:30ch">' + inline(s.title) + "</h2>" + hero + '<div class="kpis"' + (hero ? "" : ' style="margin-top:auto"') + ">" + k + "</div></div>" + foot(s) + "</section>";
      }
    },
    columns: {
      label: "Columns", desc: "Steps in numbered columns",
      sample: { title: "Three decisions, in order.", items: [{ title: "Meet the lender", desc: "Test terms and fit." }, { title: "Decide the amount", desc: "Choose a point on the scale." }, { title: "Order appraisals", desc: "Set the collateral value." }] },
      render: function (s) {
        var c = items(s).map(function (i, k) {
          return '<div><div class="n">' + esc(it(i, ["number"]) || pad2(k + 1)) + '</div><div class="t">' + inline(it(i, ["title", "label"])) + '</div><div class="d">' + inline(it(i, ["desc", "description", "value"])) + "</div></div>";
        }).join("");
        return sectionOpen(s) + '<div class="stage"><h2>' + inline(s.title) + "</h2>" + (s.subtitle ? '<p class="sub">' + inline(s.subtitle) + "</p>" : "") +
          '<div class="cols" style="margin-top:auto;margin-bottom:auto">' + c + "</div></div>" + foot(s) + "</section>";
      }
    },
    bullets: {
      label: "Bullets", desc: "Headline on the left, bullet list on the right",
      sample: { title: "Key points.", items: [{ title: "First point, with **emphasis**." }, { title: "Second point." }, { title: "Third point." }] },
      render: function (s) {
        var li = items(s).map(function (i) {
          var t = it(i, ["title", "label", "text"]), d = it(i, ["desc", "description"]);
          return "<li>" + inline(t) + (d ? " " + inline(d) : "") + "</li>";
        }).join("");
        return sectionOpen(s) + '<div class="stage"><div class="split"><div class="side"><h2>' + inline(s.title) + "</h2>" + (s.subtitle ? '<p class="sub" style="font-size:26px">' + inline(s.subtitle) + "</p>" : "") +
          '</div><div class="main" style="justify-content:center">' + (s.body ? '<div class="colk">' + inline(s.body) + "</div>" : "") + '<ul class="bl">' + li + "</ul></div></div></div>" + foot(s) + "</section>";
      }
    },
    glossary: {
      label: "Glossary", desc: "Terms and definitions in a grid",
      sample: { title: "Terms used in this deck.", items: [{ title: "LTV", desc: "Loan-to-value." }, { title: "DSCR", desc: "Debt service coverage ratio." }, { title: "PV01", desc: "Present value of one basis point." }] },
      render: function (s) {
        var g = items(s).map(function (i) { return '<div><div class="t">' + inline(it(i, ["title", "term", "label"])) + '</div><div class="d">' + inline(it(i, ["desc", "definition", "description", "value"])) + "</div></div>"; }).join("");
        return sectionOpen(s) + '<div class="stage"><h2>' + inline(s.title) + '</h2><div class="gloss" style="margin-top:48px">' + g + "</div></div>" + foot(s) + "</section>";
      }
    },
    table: {
      label: "Table", desc: "Data table from a sheet",
      sample: { title: "Proposals side by side.", table: { headers: ["Lender", "Term", "Rate", "Max LTV"], rows: [["Bank A", "7×25", "6.54%", "70%"], ["Bank B", "5×25", "6.37%", "65%"], ["Bank C", "10×25", "7.60%", "70%"]], numeric: [false, false, true, true] } },
      render: function (s) {
        var t = s.table || { headers: [], rows: [] }, n = Math.max(1, t.headers.length || (t.rows[0] || []).length);
        var numeric = t.numeric || [], best = t.best || {};
        var cols = "minmax(0,1.4fr)" + (n > 1 ? " repeat(" + (n - 1) + ",minmax(0,1fr))" : "");
        var h = t.headers.map(function (x, j) { return '<div class="h' + (numeric[j] ? " rt" : "") + '">' + inline(x) + "</div>"; }).join("");
        var body = t.rows.map(function (r, ri) {
          var cells = [];
          for (var j = 0; j < n; j++) {
            var cls = (j === 0 ? "k" : "") + (numeric[j] ? " rt" : "") + (best[ri + ":" + j] ? " best" : "") + (s.totalRow && ri === t.rows.length - 1 ? " t" : "");
            cells.push('<div class="' + cls.trim() + '">' + inline(r[j] == null ? "" : r[j]) + "</div>");
          }
          return cells.join("");
        }).join("");
        return sectionOpen(s) + '<div class="stage"><h2 style="max-width:none;font-size:52px">' + inline(s.title) + "</h2>" + (s.subtitle ? '<p class="body" style="margin-top:14px;max-width:none;color:var(--slate)">' + inline(s.subtitle) + "</p>" : "") +
          '<div class="dt" data-cols="' + n + '" style="margin-top:32px;grid-template-columns:' + cols + '">' + h + body + "</div></div>" + foot(s) + "</section>";
      }
    },
    chart: {
      label: "Chart", desc: "Bar, column or donut chart from a sheet",
      sample: { title: "Annual payments by scenario.", chart: { type: "bar", format: "usd", labels: ["Current loan", "Scenario A", "Scenario B"], series: [{ name: "Annual payment", values: [405668, 742000, 812000] }] } },
      render: function (s) {
        var c = s.chart || { type: "bar", labels: [], series: [] };
        var body = chartMarkup(c);
        return sectionOpen(s) + '<div class="stage"><h2 style="max-width:none;font-size:52px">' + inline(s.title) + "</h2>" + (s.subtitle ? '<p class="body" style="margin-top:14px;max-width:none;color:var(--slate)">' + inline(s.subtitle) + "</p>" : "") +
          '<div style="margin-top:auto;margin-bottom:auto">' + body + "</div>" + (s.body ? paragraphs(s.body, "readout") : "") + "</div>" + foot(s) + "</section>";
      }
    },
    divider: {
      label: "Section divider", desc: "Full-bleed textured section title",
      sample: { title: "Addenda", background: "sage" },
      render: function (s) {
        if (!s.background) s.background = "sage";
        return sectionOpen(s) + '<div style="position:absolute;left:96px;top:190px" class="display">' + inline(s.title) + "</div>" +
          (s.subtitle ? '<p class="sub" style="position:absolute;left:96px;top:420px;color:inherit;opacity:.85">' + inline(s.subtitle) + "</p>" : "") + "</section>";
      }
    },
    close: {
      label: "Closing", desc: "Tagline and full-width wordmark",
      sample: { title: "Conclusions from data, not opinions.", subtitle: "cmacpartners.com", background: "slate" },
      render: function (s, ctx) {
        if (!s.background) s.background = "slate";
        return sectionOpen(s, "", { bare: true, fallbackTitle: "Close" }) +
          '<div style="position:absolute;left:96px;top:96px;font-size:24px;color:var(--mist);line-height:1.5">' + inline(s.title || ctx.tagline || "") + '<br><span style="color:var(--paper)">' + inline(s.subtitle || "") + "</span></div>" +
          '<svg class="logo" style="position:absolute;left:96px;right:96px;bottom:64px;width:1728px;height:199px;color:var(--mist)"><use href="#cmac-wordmark"/></svg></section>';
      }
    }
  };
  /* Excel-friendly aliases */
  var ALIASES = { title: "cover", "title slide": "cover", confidential: "statement", paragraph: "text", objectives: "list", steps: "columns", "next steps": "columns",
    kpi: "kpis", metrics: "kpis", data: "table", grid: "table", "bar chart": "chart", bar: "chart", column: "chart", "column chart": "chart", donut: "chart", pie: "chart",
    section: "divider", end: "close", closing: "close", terms: "glossary", list: "list", bullet: "bullets" };
  function layoutKey(name) {
    var k = String(name || "").toLowerCase().trim();
    if (LAYOUTS[k]) return k;
    if (ALIASES[k]) return ALIASES[k];
    return "text";
  }

  function chartMarkup(c) {
    var cfg = { type: c.type || "bar", format: c.format || "num", labels: c.labels || [], series: c.series || [] };
    if (cfg.type === "bar") return '<div class="hb cm-chart" data-chart="' + escAttr(JSON.stringify(cfg)) + '"></div>';
    if (cfg.type === "column") return '<div class="colc cm-chart" style="height:560px" data-chart="' + escAttr(JSON.stringify(cfg)) + '"></div>';
    return '<div class="donut cm-chart" data-chart="' + escAttr(JSON.stringify(cfg)) + '"></div>';
  }

  function renderSlide(s, ctx) {
    ctx = ctx || {};
    var key = layoutKey(s.layout);
    s = Object.assign({}, s, { layout: key });
    return LAYOUTS[key].render(s, ctx);
  }
  function renderSlides(slides, ctx) { return (slides || []).map(function (s) { return renderSlide(s, ctx); }).join("\n\n"); }
  function sampleSlide(key, ctx) { var L = LAYOUTS[key] || LAYOUTS.text; return renderSlide(Object.assign({ layout: key }, clone(L.sample)), ctx || {}); }

  /* ======================= DECK DOCUMENT ======================= */
  function safeScript(s) { return String(s || "").replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--"); }

  /*
   * o: { title, meta, sectionsHtml, theme, presentationCss, customJs, sprite, mode: "view"|"edit"|"export",
   *      startSlide, base ("/deck/"), inline: {fontsCss, baseCss, cmacJs, runtimeJs} (export only) }
   */
  function buildDeck(o) {
    var theme = normalizeTheme(o.theme), base = o.base || "/deck/", inl = o.inline;
    var css = function (file, content) { return inl ? "<style>\n" + content + "\n</style>" : '<link rel="stylesheet" href="' + base + file + '">'; };
    var js = function (file, content) { return inl ? "<script>\n" + safeScript(content) + "\n</script>" : '<script src="' + base + file + '"></script>'; };
    var sections = o.sectionsHtml || "";
    var links = googleFontLinks(theme, sections + (o.presentationCss || "")).map(function (u) { return '<link rel="stylesheet" href="' + escAttr(u) + '">'; }).join("");
    var meta = o.meta || theme.meta || "";
    var h = [];
    h.push('<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
    h.push("<title>" + esc(o.title || "Presentation") + "</title>");
    if (links) h.push('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' + links);
    h.push(css("fonts.css", inl && inl.fontsCss));
    h.push(css("base.css", inl && inl.baseCss));
    h.push('<style id="cm-theme">\n' + themeToCss(theme) + "\n</style>");
    h.push('<style id="cm-pres">\n' + String(o.presentationCss || "").replace(/<\/style/gi, "<\\/style") + "\n</style>");
    if (o.mode === "edit") h.push('<link rel="stylesheet" href="' + base + 'editor-agent.css">');
    h.push('</head>\n<body data-meta="' + escAttr(meta) + '"' + (o.mode === "edit" ? ' class="cm-edit-mode"' : "") + ">");
    h.push(themedSprite(o.sprite || "", theme));
    h.push('<div id="shell"><div id="deck">\n' + sections + "\n</div>");
    h.push('<div id="navbar"><button class="arw2" id="prev" aria-label="Previous slide">&#8249;</button><div class="dots" id="dots"></div><button class="arw2" id="next" aria-label="Next slide">&#8250;</button><span class="counter" id="counter"></span></div></div>');
    if (o.startSlide != null) h.push("<script>window.CM_START=" + (parseInt(o.startSlide, 10) || 0) + "</script>");
    h.push(js("cmac.js", inl && inl.cmacJs));
    h.push(js("runtime.js", inl && inl.runtimeJs));
    if (o.customJs) h.push("<script>\n/* presentation script */\ntry{(function(){\n" + safeScript(o.customJs) + "\n})()}catch(e){console.error(e)}\n</script>");
    h.push("<script>CMStudio.boot()</script>");
    if (o.mode === "edit") h.push('<script src="' + base + 'editor-agent.js"></script>');
    h.push("</body></html>");
    return h.join("\n");
  }

  return {
    COLOR_TOKENS: COLOR_TOKENS, FONT_LIBRARY: FONT_LIBRARY, DEFAULT_THEME: DEFAULT_THEME,
    normalizeTheme: normalizeTheme, themeToCss: themeToCss, themedSprite: themedSprite, googleFontLinks: googleFontLinks,
    LAYOUTS: LAYOUTS, layoutKey: layoutKey, renderSlide: renderSlide, renderSlides: renderSlides, sampleSlide: sampleSlide, chartMarkup: chartMarkup,
    buildDeck: buildDeck, esc: esc, escAttr: escAttr, inline: inline
  };
});
