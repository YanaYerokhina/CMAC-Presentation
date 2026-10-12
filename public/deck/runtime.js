/* CMAC Presentation Studio · deck runtime: draws data-driven charts, then starts the deck engine. */
var CMStudio = (function () {
  "use strict";
  var F = { usd: function (v) { return CMAC.fmt.usd(v); }, usdM: function (v) { return CMAC.fmt.usdM(v); },
    pct: function (v) { return CMAC.fmt.pct(v, 1); }, pct2: function (v) { return CMAC.fmt.pct(v, 2); },
    num: function (v) { return CMAC.fmt.num(v); }, num1: function (v) { return CMAC.fmt.num(v, 1); } };
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtFor(name) { return F[name] || F.num; }

  function drawChart(el) {
    var cfg;
    try { cfg = JSON.parse(el.getAttribute("data-chart") || "{}"); } catch (e) { return; }
    var C = CMAC.C, f = fmtFor(cfg.format), series = cfg.series || [];
    /* the CMAC helpers insert labels as HTML */
    var labels = (cfg.labels || []).map(function (l) { return String(l == null ? "" : l).replace(/&/g, "&amp;").replace(/</g, "&lt;"); });
    var val = function (s, i) { var v = parseFloat(s && s.values ? s.values[i] : 0); return isFinite(v) ? v : 0; };
    if (!labels.length || !series.length) { el.innerHTML = '<p class="small">No chart data yet.</p>'; return; }
    if (cfg.type === "column") {
      CMAC.columns(el, labels.map(function (l, i) { return { label: l, v: val(series[0], i) }; }), { fmt: f, height: parseFloat(el.style.height) || 560 });
    } else if (cfg.type === "donut") {
      var s0 = series[0];
      CMAC.donut(el, { data: labels.map(function (l, i) { return { label: l, v: val(s0, i), color: C.cat[i % C.cat.length] }; }),
        fmt: cfg.format && cfg.format !== "share" ? f : undefined, size: 440 });
    } else {
      var rows = labels.map(function (l, i) {
        var total = 0;
        var segs = series.map(function (s, j) { var v = val(s, i); total += v; return { v: Math.max(0, v), color: C.cat[j % C.cat.length], key: esc(s.name || l) }; });
        return { label: l, value: f(total), segs: segs };
      });
      CMAC.hbars(el, rows, { fmt: f });
      if (series.length > 1 && !el.nextElementSibling) {
        var lg = document.createElement("div"); lg.className = "legend cm-generated"; lg.style.marginTop = "22px";
        lg.innerHTML = series.map(function (s, j) { return '<span><i style="background:' + C.cat[j % C.cat.length] + '"></i>' + esc(s.name) + "</span>"; }).join("");
        el.parentNode.insertBefore(lg, el.nextSibling);
      }
    }
  }
  function drawCharts(root) { [].slice.call((root || document).querySelectorAll(".cm-chart[data-chart]")).forEach(drawChart); }
  function boot() { CMAC.syncColors(); drawCharts(); CMAC.init(); }
  return { boot: boot, drawChart: drawChart, drawCharts: drawCharts };
})();
