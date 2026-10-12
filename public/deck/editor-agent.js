/* CMAC Presentation Studio · editor agent. Runs inside the sandboxed deck frame and talks to the
 * editor page only through postMessage. Every editable element carries a data-eid that maps to the
 * same element in the editor's source document. */
(function () {
  "use strict";
  var doc = document, html = doc.documentElement, parentWin = window.parent;
  var hoverEl = null, selEl = null, editing = null, interact = false, inputTimer = null;
  html.classList.add("cm-editing");

  function post(msg) { msg.cm = 1; parentWin.postMessage(msg, "*"); }
  function byEid(eid) { return eid ? doc.querySelector('[data-eid="' + String(eid).replace(/"/g, "") + '"]') : null; }
  function slides() { return [].slice.call(doc.querySelectorAll("#deck > .slide")); }
  function target(node) {
    if (!node || node.nodeType !== 1) node = node && node.parentElement;
    if (!node || !node.closest) return null;
    if (node.closest("#navbar")) return null;
    return node.closest("[data-eid]");
  }
  function cleanHtml(el) {
    var c = el.cloneNode(true);
    [].slice.call(c.querySelectorAll(".chrome,.chrome-b,.cm-generated")).forEach(function (n) { n.remove(); });
    [c].concat([].slice.call(c.querySelectorAll("*"))).forEach(function (n) {
      n.classList && n.classList.remove("cm-hover", "cm-sel");
      if (n.classList && !n.classList.length) n.removeAttribute("class");
      n.removeAttribute("contenteditable"); n.removeAttribute("spellcheck");
    });
    return c.innerHTML;
  }
  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }
  function textEditable(el) {
    if (!el || el.matches("section.slide,svg,img,.cm-chart,.dt,.list,.cols,.kpis,.gloss,.bl,.split,.stage,.hb,.colc,.donut")) return false;
    if (el.querySelector("[data-eid]")) return hasOwnText(el);
    return !!el.textContent.trim() || /^(H\d|P|SPAN|DIV|LI|B|SMALL)$/.test(el.tagName);
  }
  var STYLE_KEYS = ["font-family", "font-size", "font-weight", "font-style", "text-decoration-line", "text-transform", "color", "background-color",
    "text-align", "line-height", "letter-spacing", "opacity", "width", "height", "max-width", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin-top", "margin-right", "margin-bottom", "margin-left", "border-top-width", "border-top-style", "border-top-color", "border-radius", "position", "left", "top", "display", "object-fit"];
  function info(el) {
    var cs = getComputedStyle(el), st = {};
    STYLE_KEYS.forEach(function (k) { st[k] = cs.getPropertyValue(k); });
    var slide = el.closest("section.slide"), chart = el.closest(".cm-chart[data-eid]"), table = el.closest(".dt[data-eid]");
    return {
      eid: el.getAttribute("data-eid"), tag: el.tagName.toLowerCase(), cls: (el.getAttribute("class") || "").replace(/\bcm-(hover|sel)\b/g, "").trim(),
      isSlide: el.matches("section.slide"), slideIndex: slides().indexOf(slide), slideEid: slide && slide.getAttribute("data-eid"),
      text: (el.innerText || "").slice(0, 300), textEditable: textEditable(el), generated: !!(el.getAttribute("id") && !el.textContent.trim()),
      isImg: el.tagName === "IMG", src: el.tagName === "IMG" ? (el.getAttribute("src") || "").slice(0, 120) : "",
      isSvg: el.tagName.toLowerCase() === "svg",
      chartEid: chart && chart.getAttribute("data-eid"), chart: chart ? chart.getAttribute("data-chart") : null,
      tableEid: table && table.getAttribute("data-eid"),
      parentEid: el.parentElement && el.parentElement.closest("[data-eid]") ? el.parentElement.closest("[data-eid]").getAttribute("data-eid") : null,
      styles: st, inline: el.getAttribute("style") || ""
    };
  }
  function setHover(el) {
    if (hoverEl === el) return;
    if (hoverEl) hoverEl.classList.remove("cm-hover");
    hoverEl = el && !el.matches("section.slide") ? el : null;
    if (hoverEl) hoverEl.classList.add("cm-hover");
  }
  function select(el, silent) {
    if (editing && editing !== el) stopEditing();
    if (selEl) selEl.classList.remove("cm-sel");
    selEl = el;
    if (el) {
      el.classList.add("cm-sel");
      var i = slides().indexOf(el.closest("section.slide"));
      if (i >= 0 && window.CMAC && CMAC.current() !== i) CMAC.go(i);
    }
    if (!silent) post({ type: "select", info: el ? info(el) : null });
  }
  function startEditing(el) {
    if (!textEditable(el)) return;
    editing = el;
    el.setAttribute("contenteditable", "true"); el.setAttribute("spellcheck", "true");
    el.focus();
    try { var r = doc.createRange(); r.selectNodeContents(el); r.collapse(false); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
    post({ type: "editing", eid: el.getAttribute("data-eid"), on: true });
  }
  function flushText() {
    if (!editing) return;
    clearTimeout(inputTimer);
    post({ type: "html", eid: editing.getAttribute("data-eid"), html: cleanHtml(editing) });
  }
  function stopEditing() {
    if (!editing) return;
    flushText();
    var el = editing; editing = null;
    el.removeAttribute("contenteditable"); el.removeAttribute("spellcheck");
    post({ type: "editing", eid: el.getAttribute("data-eid"), on: false });
  }

  doc.addEventListener("mouseover", function (e) { if (!interact) setHover(target(e.target)); }, true);
  doc.addEventListener("mouseleave", function () { setHover(null); });
  doc.addEventListener("click", function (e) {
    if (interact) return;
    var el = target(e.target);
    if (editing && el === editing) return; /* let the caret move */
    e.preventDefault(); e.stopPropagation();
    if (el) select(el); else select(null);
  }, true);
  doc.addEventListener("dblclick", function (e) {
    if (interact) return;
    var el = target(e.target);
    if (el && textEditable(el)) { e.preventDefault(); select(el, true); startEditing(el); post({ type: "select", info: info(el) }); }
  }, true);
  ["mousedown", "pointerdown", "touchstart"].forEach(function (t) {
    doc.addEventListener(t, function (e) { if (!interact && !(editing && editing.contains(e.target))) e.stopPropagation(); }, true);
  });
  doc.addEventListener("input", function (e) {
    if (!editing || !editing.contains(e.target)) return;
    clearTimeout(inputTimer); inputTimer = setTimeout(flushText, 250);
  }, true);
  doc.addEventListener("focusout", function (e) { if (editing && e.target === editing) stopEditing(); }, true);
  doc.addEventListener("paste", function (e) {
    if (!editing) return;
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData("text/plain");
    doc.execCommand("insertText", false, t);
  }, true);
  doc.addEventListener("keydown", function (e) {
    if (editing) {
      if (e.key === "Escape") { e.preventDefault(); stopEditing(); }
      else if (e.key === "Enter") { e.preventDefault(); doc.execCommand("insertLineBreak"); }
      else if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "i")) { e.preventDefault(); doc.execCommand(e.key === "b" ? "bold" : "italic"); }
      return;
    }
    if (interact) return;
    var k = e.key, mod = e.metaKey || e.ctrlKey;
    if (k === "Delete" || k === "Backspace" || k === "Escape" || k.indexOf("Arrow") === 0 || (mod && /^[zyd]$/i.test(k)) || (mod && k.toLowerCase() === "s")) {
      e.preventDefault();
      post({ type: "key", key: k, mod: mod, shift: e.shiftKey });
    }
  }, true);

  window.addEventListener("message", function (e) {
    if (e.source !== parentWin) return;
    var m = e.data || {}, el = m.eid ? byEid(m.eid) : null;
    switch (m.type) {
      case "style":
        if (!el) return;
        Object.keys(m.props || {}).forEach(function (k) { var v = m.props[k]; if (v === "" || v == null) el.style.removeProperty(k); else el.style.setProperty(k, v); });
        if (selEl === el) post({ type: "select", info: info(el), refresh: true });
        if (window.CMAC) CMAC.fit();
        break;
      case "attr":
        if (!el) return;
        if (m.value == null) el.removeAttribute(m.name); else el.setAttribute(m.name, m.value);
        if (m.name === "data-chart" && window.CMStudio) CMStudio.drawChart(el);
        if (selEl === el) post({ type: "select", info: info(el), refresh: true });
        break;
      case "html":
        if (el) el.innerHTML = m.html;
        break;
      case "select":
        select(el, !!m.silent);
        break;
      case "deselect":
        stopEditing(); select(null, true);
        break;
      case "edit":
        if (el) { select(el, true); startEditing(el); }
        break;
      case "goto":
        if (window.CMAC) CMAC.go(m.index);
        break;
      case "mode":
        interact = !!m.interact; html.classList.toggle("cm-interact", interact);
        if (interact) { stopEditing(); setHover(null); select(null, true); }
        break;
      case "exec":
        if (editing) doc.execCommand(m.command, false, m.value || null);
        break;
    }
  });

  /* report slide changes (dots, keyboard, deck scripts) */
  var last = -1;
  function reportSlide() { var i = window.CMAC ? CMAC.current() : 0; if (i !== last) { last = i; post({ type: "slide", index: i }); } }
  new MutationObserver(reportSlide).observe(doc.getElementById("deck"), { attributes: true, subtree: true, attributeFilter: ["class"] });
  post({ type: "ready", count: slides().length });
  reportSlide();
})();
