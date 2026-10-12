/* Visual presentation editor.
 * The source of truth is a detached DOM ("src") holding the slide sections, each element tagged with a data-eid.
 * The deck renders in a sandboxed iframe; the editor agent inside it reports hover/click/text edits by postMessage,
 * and the side panel sends style changes back. Every change is written to src, which is what gets saved. */
import { api } from "../api.js";
import { h, icon, toast, modal, confirmDialog, fmtDate, readFileAsDataUrl, dropZone } from "../ui.js";
import { state, can, setLeaveGuard, navigate } from "../app.js";

const B = window.CMStudioBuilder;
const SKIP_EID = new Set(["B", "STRONG", "I", "EM", "BR", "U", "S", "SUB", "SUP", "WBR"]);
const BGS = [["paper", "Paper", ""], ["sand", "Sand", "sand"], ["dark", "Deep", "dark"], ["slate", "Slate", "slate"], ["sage", "Sage", "sage"]];
const THEME_SWATCHES = ["paper", "sand", "stone", "ink", "deep", "slate", "sage", "mist", "olive-1", "olive-2", "olive-3", "olive-4", "amber-1", "amber-2", "amber-3", "amber-4"];
const FRIENDLY = [["section.slide", "Slide"], ["h1", "Title"], ["h2", "Headline"], ["h3", "Subheading"], [".display", "Display title"], [".eyebrow", "Eyebrow label"],
  [".sub", "Subtitle"], [".body", "Paragraph"], [".foot", "Footnote"], [".big", "Big number"], [".kpi .v", "KPI value"], [".kpi .l", "KPI label"], [".kpi .s", "KPI note"],
  [".kpi", "KPI"], [".kpis", "KPI row"], [".li .t", "List title"], [".li .d", "List description"], [".li .n", "List number"], [".li", "List item"], [".list", "List"],
  [".cols", "Columns"], [".cm-chart", "Chart"], [".dt .h", "Table header"], [".dt>div", "Table cell"], [".dt", "Table"], [".gloss", "Glossary"], ["img", "Image"],
  ["svg", "Logo"], [".cobrand", "Logo lockup"], [".tabs", "Tabs"], [".chip", "Chip"], ["li", "Bullet"], ["ul", "Bullet list"], [".stage", "Content area"], [".split", "Two-column layout"],
  ["p", "Paragraph"], ["span", "Text"], ["b", "Bold text"], ["button", "Button"], ["div", "Box"]];

function rgbToHex(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || "");
  if (!m) return /^#/.test(c || "") ? c : "#000000";
  if (m[4] !== undefined && Number(m[4]) === 0) return "transparent";
  return "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("");
}
const px = (v) => Math.round(parseFloat(v) || 0);

export async function editorPage(id) {
  const { presentation: P, theme } = await api.get("/api/presentations/" + id);
  const { companies } = await api.get("/api/companies");
  const srcDoc = document.implementation.createHTMLDocument("");
  const root = srcDoc.createElement("div");
  srcDoc.body.appendChild(root);
  root.innerHTML = P.sections_html;
  let eidN = 0;
  let current = 0, sel = null, interact = false, dirty = false, saving = false, ready = false, lastSaved = P.updated_at;
  const undo = [], redo = [];
  let coalesce = { key: "", t: 0 };

  /* ---------- source document ---------- */
  function tagEids(scope) {
    const all = scope.querySelectorAll("*");
    for (const el of all) {
      if (SKIP_EID.has(el.tagName) || el.closest("svg") !== null && el.tagName.toLowerCase() !== "svg") continue;
      if (!el.hasAttribute("data-eid")) el.setAttribute("data-eid", "e" + (++eidN));
    }
  }
  function retag(scope) { for (const el of [scope, ...scope.querySelectorAll("[data-eid]")]) el.removeAttribute && el.removeAttribute("data-eid"); tagEids(scope.parentNode || root); }
  tagEids(root);
  const slides = () => [...root.children].filter((e) => e.matches("section.slide"));
  const byEid = (eid) => (eid ? root.querySelector('[data-eid="' + eid + '"]') : null);
  function serialize() {
    const c = root.cloneNode(true);
    c.querySelectorAll("[data-eid]").forEach((e) => e.removeAttribute("data-eid"));
    return c.innerHTML;
  }

  /* ---------- history ---------- */
  function snapshot() { return { html: root.innerHTML, css: P.custom_css, title: P.title, meta: P.meta }; }
  function pushUndo(key) {
    const now = Date.now();
    if (key && coalesce.key === key && now - coalesce.t < 1200) { coalesce.t = now; return; }
    coalesce = { key: key || "", t: now };
    undo.push(snapshot()); if (undo.length > 60) undo.shift();
    redo.length = 0; markDirty(); updateHistoryBtns();
  }
  function restore(s) { root.innerHTML = s.html; P.custom_css = s.css; P.title = s.title; P.meta = s.meta; titleIn.value = P.title; markDirty(); rerender(); }
  function doUndo() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); coalesce.key = ""; updateHistoryBtns(); }
  function doRedo() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); coalesce.key = ""; updateHistoryBtns(); }

  /* ---------- frame ---------- */
  const frame = h("iframe", { sandbox: "allow-scripts", title: "Slide editor" });
  const send = (msg) => { if (frame.contentWindow) frame.contentWindow.postMessage(msg, "*"); };
  function rerender() {
    ready = false;
    current = Math.min(current, Math.max(0, slides().length - 1));
    frame.srcdoc = B.buildDeck({ title: P.title, meta: P.meta, sectionsHtml: root.innerHTML, theme, presentationCss: P.custom_css, customJs: P.custom_js,
      sprite: state.sprite, mode: "edit", startSlide: current });
    drawSlides();
  }
  function onMessage(e) {
    if (e.source !== frame.contentWindow || !e.data || !e.data.cm) return;
    const m = e.data;
    if (m.type === "ready") {
      ready = true;
      send({ type: "mode", interact });
      if (sel && byEid(sel.eid)) send({ type: "select", eid: sel.eid });
      else { sel = null; drawPanel(); }
    } else if (m.type === "select") {
      sel = m.info;
      if (sel && sel.slideIndex >= 0 && sel.slideIndex !== current) { current = sel.slideIndex; drawSlides(); }
      if (!m.refresh || !panelBusy()) drawPanel();
    } else if (m.type === "slide") {
      if (m.index !== current) { current = m.index; drawSlides(); if (!sel || sel.slideIndex !== current) { sel = null; drawPanel(); } }
    } else if (m.type === "editing") {
      if (m.on) pushUndo("text:" + m.eid);
      hintEl.textContent = m.on ? "Typing… Enter for a new line, Esc to finish, Ctrl+B / Ctrl+I for bold / italic" : defaultHint;
    } else if (m.type === "html") {
      const el = byEid(m.eid);
      if (el) { el.innerHTML = m.html; tagEids(el); markDirty(); if (el.matches("section.slide") || el.closest("section.slide")) drawSlides(); }
    } else if (m.type === "key") onKey(m);
  }
  window.addEventListener("message", onMessage);
  const panelBusy = () => document.activeElement && panel.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);

  /* ---------- mutations ---------- */
  function setStyle(eid, props, coalesceKey) {
    const el = byEid(eid); if (!el) return;
    pushUndo(coalesceKey ? eid + "|" + coalesceKey : null);
    for (const [k, v] of Object.entries(props)) { if (v === "" || v == null) el.style.removeProperty(k); else el.style.setProperty(k, v); }
    if (!el.getAttribute("style")) el.removeAttribute("style");
    send({ type: "style", eid, props });
  }
  function setAttr(eid, name, value, { live = true, rerenderAfter = false } = {}) {
    const el = byEid(eid); if (!el) return;
    pushUndo(eid + "|attr|" + name);
    if (value == null) el.removeAttribute(name); else el.setAttribute(name, value);
    if (rerenderAfter) rerender(); else if (live) send({ type: "attr", eid, name, value });
  }
  function structural(fn, selectAfter) {
    pushUndo();
    const r = fn();
    if (selectAfter !== undefined) sel = selectAfter ? { eid: selectAfter } : null;
    rerender();
    return r;
  }
  function deleteSelected() {
    if (!sel) return;
    const el = byEid(sel.eid); if (!el) return;
    if (el.matches("section.slide")) return deleteSlide(slides().indexOf(el));
    const parent = el.parentElement && el.parentElement.closest("[data-eid]");
    structural(() => el.remove(), parent ? parent.getAttribute("data-eid") : null);
  }
  function duplicateSelected() {
    if (!sel) return;
    const el = byEid(sel.eid); if (!el) return;
    if (el.matches("section.slide")) return duplicateSlide(slides().indexOf(el));
    const c = el.cloneNode(true);
    structural(() => { el.after(c); retag(c); }, null);
    sel = { eid: c.getAttribute("data-eid") };
  }
  function moveSelected(dir) {
    const el = sel && byEid(sel.eid); if (!el) return;
    if (el.matches("section.slide")) return moveSlide(slides().indexOf(el), dir);
    const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!sib || sib.matches(".chrome,.chrome-b")) return;
    structural(() => (dir < 0 ? sib.before(el) : sib.after(el)), sel.eid);
  }
  function addSlides(html, at) {
    const tmp = srcDoc.createElement("div"); tmp.innerHTML = html;
    const list = [...tmp.children].filter((e) => e.matches("section.slide"));
    if (!list.length) return toast("No slides found to add.", "error");
    structural(() => {
      const ref = slides()[at];
      list.forEach((s) => (ref ? ref.before(s) : root.appendChild(s)));
      tagEids(root);
      current = at;
    }, null);
  }
  function deleteSlide(i) {
    if (slides().length <= 1) return toast("A presentation needs at least one slide.", "error");
    structural(() => { slides()[i].remove(); current = Math.max(0, Math.min(i, slides().length - 1)); }, null);
  }
  function duplicateSlide(i) {
    const s = slides()[i], c = s.cloneNode(true);
    structural(() => { s.after(c); retag(c); current = i + 1; }, null);
  }
  function moveSlide(i, dir) {
    const list = slides(), j = i + dir; if (j < 0 || j >= list.length) return;
    structural(() => { if (dir < 0) list[j].before(list[i]); else list[j].after(list[i]); current = j; });
  }
  function onKey(m) {
    const k = m.key;
    if (m.mod && k.toLowerCase() === "z") return m.shift ? doRedo() : doUndo();
    if (m.mod && k.toLowerCase() === "y") return doRedo();
    if (m.mod && k.toLowerCase() === "s") return save();
    if (m.mod && k.toLowerCase() === "d") return duplicateSelected();
    if (k === "Escape") { sel = null; send({ type: "deselect" }); drawPanel(); return; }
    if ((k === "Delete" || k === "Backspace") && sel && !sel.isSlide) return deleteSelected();
    if (k.startsWith("Arrow")) {
      if (sel && !sel.isSlide && sel.styles.position === "absolute") {
        const d = m.shift ? 10 : 1, dx = k === "ArrowLeft" ? -d : k === "ArrowRight" ? d : 0, dy = k === "ArrowUp" ? -d : k === "ArrowDown" ? d : 0;
        const el = byEid(sel.eid);
        const left = px(el.style.left || sel.styles.left) + dx, top = px(el.style.top || sel.styles.top) + dy;
        const props = {}; if (dx) props.left = left + "px"; if (dy) props.top = top + "px";
        if (dx && el.style.right) props.right = ""; if (dy && el.style.bottom) props.bottom = "";
        return setStyle(sel.eid, props, "nudge");
      }
      if (k === "ArrowRight" || k === "ArrowDown") goSlide(current + 1);
      if (k === "ArrowLeft" || k === "ArrowUp") goSlide(current - 1);
    }
  }
  function goSlide(i) { i = Math.max(0, Math.min(slides().length - 1, i)); current = i; send({ type: "goto", index: i }); drawSlides(); }

  /* ---------- top bar ---------- */
  const titleIn = h("input", { class: "title-in", value: P.title, "aria-label": "Presentation title" });
  titleIn.onchange = () => { pushUndo(); P.title = titleIn.value.trim() || P.title; titleIn.value = P.title; };
  const stateEl = h("span", { class: "state" }, "All changes saved");
  const undoBtn = h("button", { class: "btn icon", title: "Undo (Ctrl+Z)", "aria-label": "Undo", onclick: doUndo }, icon("undo", 16));
  const redoBtn = h("button", { class: "btn icon", title: "Redo (Ctrl+Shift+Z)", "aria-label": "Redo", onclick: doRedo }, icon("redo", 16));
  const interactBtn = h("button", { class: "btn", title: "Try tabs, sliders and charts without selecting", onclick: () => {
    interact = !interact; interactBtn.classList.toggle("on", interact); send({ type: "mode", interact });
    hintEl.textContent = interact ? "Preview mode: the slides are live. Turn it off to edit." : defaultHint;
    if (interact) { sel = null; drawPanel(); }
  } }, icon("hand", 16), "Preview");
  const saveBtn = h("button", { class: "btn primary", onclick: () => save() }, "Save");
  function updateHistoryBtns() { undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length; }
  function markDirty() { dirty = true; stateEl.textContent = "Unsaved changes"; stateEl.classList.add("dirty"); }
  async function save(force) {
    if (saving) return;
    saving = true; saveBtn.disabled = true; stateEl.textContent = "Saving…";
    try {
      const r = await api.put("/api/presentations/" + id, { title: P.title, meta: P.meta, status: P.status, company_id: P.company_id, sections_html: serialize(),
        custom_css: P.custom_css, expected_updated_at: lastSaved, force: !!force });
      lastSaved = r.updated_at; dirty = false; stateEl.textContent = "Saved"; stateEl.classList.remove("dirty");
    } catch (e) {
      stateEl.textContent = "Not saved";
      if (e.data && e.data.code === "CONFLICT") {
        saving = false; saveBtn.disabled = false;
        if (await confirmDialog("Someone else saved this presentation after you opened it. Overwrite their changes with yours? (Their version stays in the version history.)", { ok: "Overwrite", danger: true })) return save(true);
        return;
      }
      toast(e.message, "error");
    } finally { saving = false; saveBtn.disabled = false; }
  }
  setLeaveGuard((silent) => !dirty || (!silent && confirm("You have unsaved changes. Leave without saving?")));

  const bar = h("header", { class: "ebar" },
    h("button", { class: "btn icon", title: "Back", "aria-label": "Back to presentations", onclick: () => navigate("#/p/" + id) }, icon("back", 16)),
    titleIn, stateEl, h("div", { class: "spacer" }),
    undoBtn, redoBtn, h("span", { class: "sep" }), interactBtn,
    h("button", { class: "btn", title: "Version history", onclick: versionsDialog }, icon("history", 16), "Versions"),
    h("button", { class: "btn", title: "Custom CSS and slide HTML", onclick: codeDialog }, icon("code", 16), "Code"),
    can("presentations:download") ? h("button", { class: "btn", title: "Download the saved presentation as a single HTML file", onclick: async () => {
      if (dirty) { await save(); if (dirty) return; }
      location.href = "/api/presentations/" + id + "/download";
    } }, icon("download", 16), "Download") : null,
    h("button", { class: "btn", title: "Open the saved presentation", onclick: async () => { if (dirty) await save(); window.open("/api/presentations/" + id + "/render#s" + (current + 1), "_blank", "noopener"); } }, icon("play", 16), "Present"),
    saveBtn);
  updateHistoryBtns();

  /* ---------- slide list ---------- */
  const list = h("ol");
  let dragFrom = -1;
  function drawSlides() {
    const items = slides().map((s, i) => {
      const bg = BGS.find(([, , c]) => c && s.classList.contains(c));
      const color = bg ? `var(--c-${bg[0] === "dark" ? "deep" : bg[0]})` : "var(--c-paper)";
      const li = h("li", { class: i === current ? "on" : "", draggable: "true", onclick: () => { goSlide(i); sel = { eid: s.getAttribute("data-eid") }; send({ type: "select", eid: sel.eid }); } },
        h("span", { class: "n" }, i + 1), h("span", { class: "sw", style: { background: color } }),
        h("span", { class: "tt" }, s.getAttribute("data-title") || "Slide " + (i + 1), h("small", null, s.getAttribute("data-eyebrow") || (s.classList.contains("bare") ? "No header" : ""))),
        h("span", { class: "ops" },
          h("button", { title: "Move up", "aria-label": "Move slide up", onclick: (e) => { e.stopPropagation(); moveSlide(i, -1); } }, "↑"),
          h("button", { title: "Move down", "aria-label": "Move slide down", onclick: (e) => { e.stopPropagation(); moveSlide(i, 1); } }, "↓"),
          h("button", { title: "Duplicate", "aria-label": "Duplicate slide", onclick: (e) => { e.stopPropagation(); duplicateSlide(i); } }, "⧉"),
          h("button", { title: "Delete", "aria-label": "Delete slide", onclick: async (e) => { e.stopPropagation(); if (await confirmDialog("Delete slide " + (i + 1) + "?", { ok: "Delete", danger: true })) deleteSlide(i); } }, "✕")));
      li.addEventListener("dragstart", (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; });
      li.addEventListener("dragover", (e) => { e.preventDefault(); li.classList.add("drag-over"); });
      li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
      li.addEventListener("drop", (e) => {
        e.preventDefault(); li.classList.remove("drag-over");
        if (dragFrom < 0 || dragFrom === i) return;
        const all = slides(), moving = all[dragFrom];
        structural(() => { all[i].before(moving); current = slides().indexOf(moving); });
        dragFrom = -1;
      });
      return li;
    });
    list.replaceChildren(...items);
    const on = list.children[current]; if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }
  const slideCol = h("aside", { class: "slides", style: Object.fromEntries(Object.entries(theme.colors).map(([k, v]) => ["--c-" + k, v])) },
    h("div", { class: "sh" }, h("button", { class: "btn primary sm grow", onclick: addSlideDialog }, icon("plus", 14), "Add slide")), list);
  /* custom properties via style object need setProperty */
  Object.entries(theme.colors).forEach(([k, v]) => slideCol.style.setProperty("--c-" + k, v));

  /* ---------- add slide ---------- */
  function addSlideDialog() {
    const ctx = { company: P.company_name || "", website: theme.website, tagline: theme.tagline };
    const cards = Object.entries(B.LAYOUTS).map(([key, L]) => {
      const f = h("iframe", { sandbox: "allow-scripts", tabindex: "-1", "aria-hidden": "true", loading: "lazy" });
      f.srcdoc = B.buildDeck({ title: L.label, meta: P.meta, sectionsHtml: B.sampleSlide(key, ctx), theme, sprite: state.sprite })
        .replace("</head>", "<style>#navbar{display:none}#deck{transform:none!important;box-shadow:none;margin:0!important}#shell{display:block}html,body{overflow:hidden}</style></head>");
      const lp = h("div", { class: "lp" }, f);
      requestAnimationFrame(() => { f.style.transform = `scale(${(lp.clientWidth || 200) / 1920})`; });
      return h("button", { class: "layout-card", onclick: () => { m.close(); addSlides(B.sampleSlide(key, ctx), current + 1); toast(L.label + " slide added — click anything on it to edit"); } },
        lp, h("div", { class: "lt" }, h("b", null, L.label), h("span", null, L.desc)));
    });
    let file = null;
    const err = h("div", { class: "err" });
    const excel = h("div", { class: "stack", style: { marginTop: "22px" } }, h("h3", null, "Or add slides from an Excel workbook"),
      h("div", { class: "row wrap", style: { alignItems: "stretch" } }, h("div", { class: "grow" }, dropZone({ accept: ".xlsx", label: "Excel workbook (.xlsx)", onFile: (f) => { file = f; } })),
        h("button", { class: "btn primary", style: { alignSelf: "center" }, onclick: async () => {
          if (!file) { err.textContent = "Choose a workbook first."; return; }
          const fd = new FormData(); fd.append("file", file); if (P.company_id) fd.append("company_id", P.company_id);
          try { const r = await api.upload("/api/presentations/excel-slides", fd); m.close(); addSlides(r.sections_html, current + 1); toast(`Added ${r.slides} slides from Excel`); }
          catch (e) { err.textContent = e.message; }
        } }, "Add these slides")), err);
    const m = modal({ title: "Add a slide", size: "wide", body: h("div", null, h("div", { class: "layouts" }, cards), excel) });
  }

  /* ---------- property panel ---------- */
  const panel = h("aside", { class: "panel" });
  const swatchRow = (current, onPick, { allowNone = false, allowInherit = true } = {}) => {
    const cur = String(current || "").trim();
    const btns = THEME_SWATCHES.map((k) => h("button", { title: k, "aria-label": k, class: cur === `var(--${k})` ? "on" : "", style: { background: theme.colors[k] }, onclick: () => onPick(`var(--${k})`) }));
    if (allowNone) btns.unshift(h("button", { class: "none" + (cur === "transparent" ? " on" : ""), title: "None", "aria-label": "None", onclick: () => onPick("transparent") }));
    const custom = h("input", { type: "color", title: "Custom color", "aria-label": "Custom color", value: /^#/.test(cur) ? cur : "#22383a" });
    custom.oninput = () => onPick(custom.value, "custom");
    return h("div", { class: "swatches" }, btns, custom, allowInherit ? h("button", { class: "btn sm ghost", style: { width: "auto", height: "22px", borderRadius: "6px", padding: "0 6px", fontSize: "11px" }, onclick: () => onPick("") }, "Default") : null);
  };
  const prow = (label, ...ctl) => h("div", { class: "pr" }, h("span", null, label), h("div", { class: "ctl" }, ctl));
  const grp = (title, ...kids) => h("div", { class: "grp" }, title ? h("div", { class: "gt" }, title) : null, kids);
  const numRange = (eid, prop, value, min, max, step, unit, extra) => {
    const r = h("input", { type: "range", min, max, step, value });
    const n = h("input", { class: "input num", type: "number", min, max, step, value });
    const apply = (v, from) => { if (from !== r) r.value = v; if (from !== n) n.value = v; setStyle(eid, Object.assign({ [prop]: v === "" ? "" : v + unit }, extra ? extra(v) : null), prop); };
    r.oninput = () => apply(r.value, r); n.onchange = () => apply(n.value, n);
    return [r, n];
  };
  const seg = (options, value, onPick) => h("div", { class: "seg2" }, options.map(([v, label, title]) => h("button", { class: v === value ? "on" : "", title: title || label, onclick: () => onPick(v) }, label)));

  function friendlyName(info) {
    const el = byEid(info.eid);
    if (!el) return info.tag;
    for (const [s, n] of FRIENDLY) { try { if (el.matches(s)) return n; } catch {} }
    return info.tag;
  }

  function drawPanel() {
    const kids = [];
    if (!sel || !byEid(sel.eid)) kids.push(...presentationPanel());
    else if (sel.isSlide || byEid(sel.eid).matches("section.slide")) kids.push(...slidePanel(byEid(sel.eid)));
    else kids.push(...elementPanel(sel, byEid(sel.eid)));
    panel.replaceChildren(...kids);
  }

  function presentationPanel() {
    const meta = h("input", { class: "input", value: P.meta || "" });
    meta.onchange = () => { pushUndo(); P.meta = meta.value; rerender(); };
    const status = seg([["draft", "Draft"], ["published", "Published"]], P.status, (v) => { P.status = v; markDirty(); drawPanel(); });
    const comp = h("select", { class: "input" }, h("option", { value: "" }, "No company"), companies.map((c) => h("option", { value: c.id, selected: c.id === P.company_id }, c.name)));
    comp.onchange = () => { P.company_id = comp.value ? Number(comp.value) : null; P.company_name = comp.selectedOptions[0].textContent; markDirty(); };
    return [
      h("div", { class: "ph" }, h("div", { class: "k" }, "Presentation"), h("h3", null, "Settings"), h("p", { class: "note", style: { margin: 0 } }, "Hover over anything on the slide and click it to change it. Double-click text to type.")),
      grp("Sharing", prow("Status", status), h("p", { class: "note" }, P.status === "published" ? "Clients of the company can see this presentation." : "Only admins and team members can see drafts."),
        h("label", { class: "f" }, "Client company", comp)),
      grp("Footer", h("label", { class: "f" }, "Footer line on every slide", meta)),
      grp("Current slide", h("button", { class: "btn sm", onclick: () => { const s = slides()[current]; if (s) { sel = { eid: s.getAttribute("data-eid") }; send({ type: "select", eid: sel.eid }); } } }, "Edit slide " + (current + 1) + " settings")),
      grp("Shortcuts", h("p", { class: "note", html: "<b>Click</b> select · <b>Double-click</b> edit text · <b>Del</b> delete · <b>Ctrl+D</b> duplicate · <b>Ctrl+Z</b> undo · <b>Ctrl+S</b> save · <b>Arrows</b> nudge positioned elements or change slide · <b>Esc</b> deselect" }))
    ];
  }

  function slidePanel(s) {
    const eid = s.getAttribute("data-eid"), i = slides().indexOf(s);
    const field = (label, attr, ph) => {
      const inp = h("input", { class: "input", value: s.getAttribute(attr) || "", placeholder: ph || "" });
      inp.onchange = () => { setAttr(eid, attr, inp.value || null, { rerenderAfter: attr !== "data-title" }); if (attr === "data-title") drawSlides(); };
      return h("label", { class: "f" }, label, inp);
    };
    const bgNow = (BGS.find(([, , c]) => c && s.classList.contains(c)) || BGS[0])[0];
    const bgSeg = seg(BGS.map(([k, l]) => [k, l]), bgNow, (k) => structural(() => {
      BGS.forEach(([, , c]) => c && s.classList.remove(c));
      const c = BGS.find(([kk]) => kk === k)[2]; if (c) s.classList.add(c);
      if (["dark", "slate", "sage"].includes(k)) s.classList.add("tex");
    }, eid));
    const tex = h("input", { type: "checkbox", checked: s.classList.contains("tex") });
    tex.onchange = () => structural(() => s.classList.toggle("tex", tex.checked), eid);
    const chrome = h("input", { type: "checkbox", checked: !s.classList.contains("bare") });
    chrome.onchange = () => structural(() => s.classList.toggle("bare", !chrome.checked), eid);
    return [
      h("div", { class: "ph" }, h("div", { class: "k" }, "Slide " + (i + 1)), h("h3", null, s.getAttribute("data-title") || "Slide"),
        h("div", { class: "row wrap" },
          h("button", { class: "btn sm", onclick: () => moveSlide(i, -1) }, "↑ Up"), h("button", { class: "btn sm", onclick: () => moveSlide(i, 1) }, "↓ Down"),
          h("button", { class: "btn sm", onclick: () => duplicateSlide(i) }, "Duplicate"),
          h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog("Delete this slide?", { ok: "Delete", danger: true })) deleteSlide(i); } }, "Delete"))),
      grp("Background", bgSeg, h("label", { class: "row small", style: { fontWeight: 600, color: "var(--slate)" } }, tex, "Paper texture")),
      grp("Header & footer", h("label", { class: "row small", style: { fontWeight: 600, color: "var(--slate)" } }, chrome, "Show the eyebrow, section number and footer"),
        field("Eyebrow (top label)", "data-eyebrow", "e.g. The proposals"), field("Section number", "data-no", "e.g. 03")),
      grp("Navigation", field("Slide name (in the list and dots)", "data-title")),
      grp(null, h("p", { class: "note" }, "To change something on the slide, click it. To add a new slide, use “Add slide” on the left."))
    ];
  }

  function elementPanel(info, el) {
    const eid = info.eid, st = info.styles, out = [];
    const name = friendlyName(info);
    out.push(h("div", { class: "ph" }, h("div", { class: "k" }, "Selected"), h("h3", null, name),
      h("div", { class: "row wrap" },
        info.parentEid ? h("button", { class: "btn sm", title: "Select the element around this one", onclick: () => send({ type: "select", eid: info.parentEid }) }, icon("parent", 14), "Parent") : null,
        h("button", { class: "btn sm icon", title: "Move earlier", "aria-label": "Move earlier", onclick: () => moveSelected(-1) }, icon("up", 14)),
        h("button", { class: "btn sm icon", title: "Move later", "aria-label": "Move later", onclick: () => moveSelected(1) }, icon("down", 14)),
        h("button", { class: "btn sm icon", title: "Duplicate (Ctrl+D)", "aria-label": "Duplicate", onclick: duplicateSelected }, icon("copy", 14)),
        h("button", { class: "btn sm icon danger", title: "Delete (Del)", "aria-label": "Delete", onclick: deleteSelected }, icon("trash", 14)))));

    if (info.generated && P.custom_js) out.push(grp(null, h("p", { class: "note warn" }, "This element is filled in by the slide's script (live numbers or charts), so its content updates automatically. You can still change its style.")));

    /* text */
    if (info.textEditable) {
      out.push(grp("Text",
        h("button", { class: "btn sm", onclick: () => send({ type: "edit", eid }) }, icon("edit", 14), "Edit text"),
        h("div", { class: "row" }, h("button", { class: "btn sm", style: { fontWeight: 800 }, title: "Bold selected text", onclick: () => send({ type: "exec", command: "bold" }) }, "B"),
          h("button", { class: "btn sm", style: { fontStyle: "italic" }, title: "Italic selected text", onclick: () => send({ type: "exec", command: "italic" }) }, "I"),
          h("span", { class: "note" }, "while editing")),
        h("p", { class: "note" }, "Tip: double-click text on the slide to type directly.")));
    }

    /* typography */
    const hasText = info.textEditable || (info.text || "").trim().length > 0;
    if (hasText && !info.isImg) {
      const fam = h("select", { class: "input sm" });
      const curFam = el.style.fontFamily || "";
      const opts = [["", "Default (from theme)"], ["var(--serif)", "Theme headline font"], ["var(--sans)", "Theme text font"]]
        .concat(B.FONT_LIBRARY.map((f) => [`'${f.family}'`, f.family])).concat((theme.customFonts || []).map((f) => [`'${f.family}'`, f.family]));
      opts.forEach(([v, l]) => fam.appendChild(h("option", { value: v, selected: curFam.replace(/"/g, "'") === v }, l)));
      fam.onchange = () => { setStyle(eid, { "font-family": fam.value }); if (/^'/.test(fam.value) && !B.FONT_LIBRARY.find((f) => `'${f.family}'` === fam.value && f.source === "embedded")) setTimeout(rerender, 50); };
      const weight = h("select", { class: "input sm" }, [["", "Default"], ["300", "Light"], ["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Extra bold"]]
        .map(([v, l]) => h("option", { value: v, selected: el.style.fontWeight === v }, l)));
      weight.onchange = () => setStyle(eid, { "font-weight": weight.value });
      const align = el.style.textAlign || "";
      const tt = (st["text-transform"] || "none") === "uppercase";
      out.push(grp("Font",
        prow("Family", fam),
        prow("Size", ...numRange(eid, "font-size", px(st["font-size"]), 8, 260, 1, "px")),
        prow("Weight", weight),
        prow("Style", seg([["italic", "I", "Italic"], ["underline", "U", "Underline"], ["upper", "AA", "Uppercase"]], null, (v) => {
          if (v === "italic") setStyle(eid, { "font-style": st["font-style"] === "italic" ? "normal" : "italic" });
          if (v === "underline") setStyle(eid, { "text-decoration": /underline/.test(st["text-decoration-line"]) ? "none" : "underline" });
          if (v === "upper") setStyle(eid, { "text-transform": tt ? "none" : "uppercase" });
        })),
        prow("Align", seg([["left", "Left"], ["center", "Center"], ["right", "Right"]], align, (v) => setStyle(eid, { "text-align": v === align ? "" : v }))),
        prow("Line height", ...numRange(eid, "line-height", (parseFloat(st["line-height"]) / parseFloat(st["font-size"]) || 1.2).toFixed(2), 0.8, 2.4, 0.02, "")),
        prow("Spacing", ...numRange(eid, "letter-spacing", ((parseFloat(st["letter-spacing"]) || 0) / (parseFloat(st["font-size"]) || 16)).toFixed(3), -0.08, 0.3, 0.005, "em")),
        prow("Color", swatchRow(el.style.color, (v) => setStyle(eid, { color: v }, "color")))));
    }

    /* image */
    if (info.isImg) {
      out.push(grp("Image",
        h("label", { class: "btn sm", style: { alignSelf: "flex-start" } }, icon("upload", 14), "Replace image",
          h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            if (f.size > 5e6) return toast("Images must be under 5 MB.", "error");
            setAttr(eid, "src", await readFileAsDataUrl(f));
          } })),
        prow("Max height", ...numRange(eid, "max-height", px(st.height), 16, 1000, 1, "px")),
        prow("Fit", seg([["contain", "Contain"], ["cover", "Cover"]], el.style.objectFit || "", (v) => setStyle(eid, { "object-fit": v }))),
        (() => { const a = h("input", { class: "input sm", value: el.getAttribute("alt") || "" }); a.onchange = () => setAttr(eid, "alt", a.value); return prow("Alt text", a); })()));
    }
    if (info.isSvg) out.push(grp("Logo", prow("Color", swatchRow(el.style.color, (v) => setStyle(eid, { color: v }, "color")))));

    /* chart */
    if (info.chartEid) out.push(chartGroup(info.chartEid));
    /* table */
    if (info.tableEid) out.push(tableGroup(info.tableEid));

    /* box */
    out.push(grp("Box",
      prow("Fill", swatchRow(el.style.backgroundColor || el.style.background, (v) => setStyle(eid, { background: null, "background-color": v }, "bg"), { allowNone: true })),
      prow("Padding", ...numRange(eid, "padding", px(st["padding-top"]), 0, 200, 1, "px")),
      prow("Space above", ...numRange(eid, "margin-top", px(st["margin-top"]), -100, 400, 1, "px")),
      prow("Width", ...numRange(eid, "width", px(st.width), 20, 1920, 1, "px")),
      prow("Border", ...numRange(eid, "border-width", px(st["border-top-width"]), 0, 20, 1, "px", (v) => ({ "border-style": Number(v) > 0 ? "solid" : "" }))),
      prow("Border color", swatchRow(el.style.borderColor, (v) => setStyle(eid, { "border-color": v, "border-style": v ? "solid" : "" }, "bc"))),
      prow("Rounded", ...numRange(eid, "border-radius", px(st["border-radius"]), 0, 400, 1, "px")),
      prow("Opacity", ...numRange(eid, "opacity", Number(st.opacity).toFixed(2), 0, 1, 0.05, ""))));

    if (st.position === "absolute") {
      out.push(grp("Position", prow("Left", ...numRange(eid, "left", px(st.left), -400, 1920, 1, "px")), prow("Top", ...numRange(eid, "top", px(st.top), -400, 1080, 1, "px")),
        h("p", { class: "note" }, "Or select it and use the arrow keys (Shift for 10px).")));
    }

    /* advanced */
    const css = h("textarea", { class: "input code", rows: "4", spellcheck: "false" }, el.getAttribute("style") || "");
    const cls = h("input", { class: "input sm code", value: (el.getAttribute("class") || "").replace(/\bcm-\w+\b/g, "").trim() });
    out.push(h("details", { class: "grp" }, h("summary", { class: "gt", style: { cursor: "pointer" } }, "Advanced"),
      h("label", { class: "f" }, "Inline style", css), h("label", { class: "f" }, "Classes", cls),
      h("div", { class: "row" }, h("button", { class: "btn sm", onclick: () => {
        structural(() => { if (css.value.trim()) el.setAttribute("style", css.value.trim()); else el.removeAttribute("style"); if (cls.value.trim()) el.setAttribute("class", cls.value.trim()); else el.removeAttribute("class"); }, eid);
      } }, "Apply"), h("button", { class: "btn sm ghost", title: "Remove every inline style from this element", onclick: () => structural(() => el.removeAttribute("style"), eid) }, "Clear styles"))));
    return out;
  }

  function chartGroup(ceid) {
    const el = byEid(ceid);
    let cfg; try { cfg = JSON.parse(el.getAttribute("data-chart") || "{}"); } catch { cfg = {}; }
    cfg.labels = cfg.labels || []; cfg.series = cfg.series && cfg.series.length ? cfg.series : [{ name: "Value", values: [] }];
    const table = h("table", { class: "chart-grid" });
    function drawTable() {
      const head = h("tr", null, h("th", null, h("input", { value: "Label", disabled: true })), cfg.series.map((s, j) => h("th", null, h("input", { value: s.name, oninput: (e) => { s.name = e.target.value; } }))),
        h("th", null, h("button", { class: "x", title: "Add series", onclick: () => { cfg.series.push({ name: "Series " + (cfg.series.length + 1), values: cfg.labels.map(() => 0) }); drawTable(); } }, "+")));
      const rows = cfg.labels.map((l, i) => h("tr", null, h("td", null, h("input", { value: l, oninput: (e) => { cfg.labels[i] = e.target.value; } })),
        cfg.series.map((s) => h("td", null, h("input", { value: s.values[i] ?? "", inputmode: "decimal", oninput: (e) => { s.values[i] = parseFloat(e.target.value.replace(/[$,%\s]/g, "")) || 0; } }))),
        h("td", null, h("button", { class: "x", title: "Remove row", onclick: () => { cfg.labels.splice(i, 1); cfg.series.forEach((s) => s.values.splice(i, 1)); drawTable(); } }, "×"))));
      table.replaceChildren(head, ...rows);
    }
    drawTable();
    const type = h("select", { class: "input sm" }, [["bar", "Horizontal bars"], ["column", "Columns"], ["donut", "Donut"]].map(([v, l]) => h("option", { value: v, selected: cfg.type === v }, l)));
    const fmt = h("select", { class: "input sm" }, [["usd", "$1,234"], ["usdM", "$1.2MM"], ["pct", "12.3%"], ["pct2", "12.34%"], ["num", "1,234"], ["num1", "1,234.5"]].map(([v, l]) => h("option", { value: v, selected: cfg.format === v }, l)));
    const apply = () => {
      cfg.type = type.value; cfg.format = fmt.value;
      const cur = el.getAttribute("class") || "";
      const base = { bar: "hb", column: "colc", donut: "donut" }[cfg.type];
      pushUndo();
      el.setAttribute("class", cur.replace(/\b(hb|colc|donut)\b/g, "").trim() + " " + base);
      if (cfg.type === "column" && !el.style.height) el.style.height = "560px";
      el.setAttribute("data-chart", JSON.stringify(cfg));
      rerender();
    };
    return grp("Chart data",
      prow("Type", type), prow("Numbers", fmt),
      h("div", { style: { overflowX: "auto" } }, table),
      h("div", { class: "row" }, h("button", { class: "btn sm", onclick: () => { cfg.labels.push("New"); cfg.series.forEach((s) => s.values.push(0)); drawTable(); } }, "+ Row"),
        cfg.series.length > 1 ? h("button", { class: "btn sm", onclick: () => { cfg.series.pop(); drawTable(); } }, "− Last series") : null,
        h("span", { class: "spacer" }), h("button", { class: "btn sm primary", onclick: apply }, "Update chart")));
  }

  function tableGroup(teid) {
    const t = byEid(teid);
    const n = Number(t.getAttribute("data-cols")) || (t.style.gridTemplateColumns.match(/repeat\((\d+)/) ? 1 + Number(RegExp.$1) : 0) || t.querySelectorAll(":scope > .h").length;
    if (!n) return grp("Table", h("p", { class: "note" }, "Click a cell to edit it."));
    const cells = () => [...t.children];
    const addRow = () => structural(() => {
      const last = cells().slice(-n);
      last.forEach((c) => { const d = c.cloneNode(false); d.removeAttribute("data-eid"); d.classList.remove("best", "t", "h"); d.textContent = "—"; t.appendChild(d); });
      tagEids(t);
    }, teid);
    const delRow = () => { if (cells().length <= n * 2) return toast("Keep at least one row.", "error"); structural(() => cells().slice(-n).forEach((c) => c.remove()), teid); };
    const addCol = () => structural(() => {
      const all = cells(), rows = [];
      for (let i = 0; i < all.length; i += n) rows.push(all.slice(i, i + n));
      rows.forEach((r, ri) => { const d = r[r.length - 1].cloneNode(false); d.removeAttribute("data-eid"); d.classList.remove("best"); d.textContent = ri === 0 ? "New" : "—"; r[r.length - 1].after(d); });
      t.setAttribute("data-cols", n + 1);
      t.style.gridTemplateColumns = "minmax(0,1.4fr) repeat(" + n + ",minmax(0,1fr))";
      tagEids(t);
    }, teid);
    const delCol = () => {
      if (n <= 1) return;
      structural(() => {
        const all = cells();
        for (let i = all.length - 1; i >= 0; i--) if (i % n === n - 1) all[i].remove();
        t.setAttribute("data-cols", n - 1);
        t.style.gridTemplateColumns = "minmax(0,1.4fr)" + (n - 2 > 0 ? " repeat(" + (n - 2) + ",minmax(0,1fr))" : "");
      }, teid);
    };
    const cell = sel && byEid(sel.eid);
    const isCell = cell && cell.parentElement === t;
    return grp("Table",
      h("div", { class: "row wrap" }, h("button", { class: "btn sm", onclick: addRow }, "+ Row"), h("button", { class: "btn sm", onclick: delRow }, "− Last row"),
        h("button", { class: "btn sm", onclick: addCol }, "+ Column"), h("button", { class: "btn sm", onclick: delCol }, "− Last column")),
      isCell ? h("label", { class: "row small", style: { fontWeight: 600, color: "var(--slate)" } },
        h("input", { type: "checkbox", checked: cell.classList.contains("best"), onchange: (e) => structural(() => cell.classList.toggle("best", e.target.checked), sel.eid) }), "Highlight as best term") : null,
      isCell ? h("label", { class: "row small", style: { fontWeight: 600, color: "var(--slate)" } },
        h("input", { type: "checkbox", checked: cell.classList.contains("rt"), onchange: (e) => structural(() => cell.classList.toggle("rt", e.target.checked), sel.eid) }), "Right-align (numbers)") : null);
  }

  /* ---------- dialogs ---------- */
  async function versionsDialog() {
    const { versions } = await api.get("/api/presentations/" + id + "/versions");
    const m = modal({ title: "Version history", size: "mid", body: h("div", { class: "vlist" },
      h("p", { class: "note muted", style: { margin: "0 0 8px" } }, "A version is kept every time the presentation is saved (last 50)."),
      versions.map((v, i) => h("div", { class: "vrow" }, h("div", { class: "grow" }, h("b", null, v.note || "Saved"), h("span", { class: "small muted" }, fmtDate(v.created_at) + (v.created_by_name ? " · " + v.created_by_name : "") + " · " + v.slide_count + " slides")),
        i === 0 ? h("span", { class: "small muted" }, "Latest") : h("button", { class: "btn sm", onclick: async () => {
          if (dirty && !(await confirmDialog("Restoring discards your unsaved changes. Continue?", { ok: "Restore" }))) return;
          await api.post(`/api/presentations/${id}/versions/${v.id}/restore`); m.close(); dirty = false; setLeaveGuard(null); toast("Version restored"); navigate("#/p/" + id + "/edit");
        } }, "Restore")))) });
  }

  function codeDialog() {
    const s = slides()[current];
    const clone = s.cloneNode(true); clone.querySelectorAll("[data-eid]").forEach((e) => e.removeAttribute("data-eid")); clone.removeAttribute("data-eid");
    const slideHtml = h("textarea", { class: "input code", rows: "14", spellcheck: "false" }, clone.outerHTML);
    const css = h("textarea", { class: "input code", rows: "8", spellcheck: "false", placeholder: "/* CSS for this presentation only */" }, P.custom_css || "");
    modal({ title: "Code (advanced)", size: "wide", body: h("div", { class: "stack" },
      h("p", { class: "note muted", style: { margin: 0 } }, "Everything here can also be done visually. Use this for fine control."),
      h("label", { class: "f" }, `Slide ${current + 1} HTML`, slideHtml), h("label", { class: "f" }, "Presentation CSS", css)),
      actions: [{ label: "Cancel" }, { label: "Apply", kind: "primary", onClick: () => {
        const tmp = srcDoc.createElement("div"); tmp.innerHTML = slideHtml.value;
        const ns = tmp.querySelector("section.slide");
        if (!ns) { toast("The slide HTML must be one <section class=\"slide\"> element.", "error"); return false; }
        pushUndo(); s.replaceWith(ns); tagEids(root); P.custom_css = css.value; sel = null; rerender();
      } }] });
  }

  /* ---------- layout ---------- */
  const defaultHint = "Hover to highlight · click to select · double-click text to type";
  const hintEl = h("div", { class: "stage-hint" }, defaultHint);
  const page = h("div", { class: "editor" }, bar, h("div", { class: "ebody" }, slideCol, h("div", { class: "stagewrap" }, frame, hintEl), panel));
  /* clean up when the page is replaced */
  const obs = new MutationObserver(() => { if (!document.body.contains(page)) { window.removeEventListener("message", onMessage); document.removeEventListener("keydown", hostKeys); obs.disconnect(); } });
  setTimeout(() => obs.observe(document.getElementById("app"), { childList: true }), 0);
  function hostKeys(e) {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector(".overlay")) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && /^[zysd]$/i.test(e.key) || e.key === "Delete" || e.key === "Escape" || (e.key.startsWith("Arrow") && e.target === document.body)) {
      e.preventDefault(); onKey({ key: e.key, mod, shift: e.shiftKey });
    }
  }
  document.addEventListener("keydown", hostKeys);
  drawPanel();
  rerender();
  return page;
}
