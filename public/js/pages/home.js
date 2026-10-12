import { api } from "../api.js";
import { h, icon, logo, toast, modal, confirmDialog, fmtDate, dropZone } from "../ui.js";
import { state, can, navigate } from "../app.js";

export async function homePage() {
  const [{ presentations }, { companies }] = await Promise.all([api.get("/api/presentations"), api.get("/api/companies")]);
  const isClient = state.user.role === "client";
  let filter = "", companyId = "";

  const grid = h("div", { class: "grid-cards" });
  function draw() {
    const q = filter.toLowerCase();
    const list = presentations.filter((p) => (!companyId || String(p.company_id) === companyId) && (!q || (p.title + " " + (p.company_name || "")).toLowerCase().includes(q)));
    grid.replaceChildren(...(list.length ? list.map(card) : [h("div", { class: "empty card", style: { gridColumn: "1/-1" } },
      h("h2", null, presentations.length ? "No matches" : isClient ? "Nothing here yet" : "No presentations yet"),
      h("p", null, isClient ? "Presentations shared with " + (state.user.company_name || "your company") + " will appear here." : "Upload an Excel workbook to build your first presentation."))]));
  }
  function card(p) {
    const open = () => navigate("#/p/" + p.id);
    const acts = [h("button", { class: "btn sm", onclick: open }, icon("eye", 15), "View")];
    if (can("presentations:edit")) acts.push(h("a", { class: "btn sm", href: "#/p/" + p.id + "/edit" }, icon("edit", 15), "Edit"));
    if (can("presentations:download")) acts.push(h("a", { class: "btn sm ghost icon", href: "/api/presentations/" + p.id + "/download", title: "Download HTML", "aria-label": "Download HTML" }, icon("download", 15)));
    if (can("presentations:edit")) acts.push(h("button", { class: "btn sm ghost icon", title: "Duplicate", "aria-label": "Duplicate", onclick: async () => {
      const r = await api.post("/api/presentations/" + p.id + "/duplicate"); toast("Duplicated"); navigate("#/p/" + r.id + "/edit");
    } }, icon("copy", 15)));
    if (can("presentations:delete")) acts.push(h("button", { class: "btn sm ghost icon danger", title: "Delete", "aria-label": "Delete", onclick: async () => {
      if (!(await confirmDialog(`Delete "${p.title}"? This removes it for everyone, including clients.`, { ok: "Delete", danger: true }))) return;
      await api.del("/api/presentations/" + p.id); presentations.splice(presentations.indexOf(p), 1); draw(); toast("Deleted");
    } }, icon("trash", 15)));
    return h("div", { class: "card pcard" },
      h("div", { class: "cover", onclick: open }, h("div", { class: "lines" }), h("div", { class: "c" }, p.company_name || "No company"), h("div", { class: "t" }, p.title), logo("cmac-symbol", "")),
      h("div", { class: "body" },
        h("div", { class: "row" }, h("div", { class: "title grow", onclick: open }, p.title), isClient ? null : h("span", { class: "pill " + p.status }, h("i"), p.status)),
        h("div", { class: "meta" }, [p.company_name, p.slide_count + " slides", "Updated " + fmtDate(p.updated_at)].filter(Boolean).join(" · ")),
        h("div", { class: "acts" }, acts)));
  }

  const head = h("div", { class: "page-head" },
    h("div", { class: "grow" }, h("div", { class: "eyebrow" }, isClient ? state.user.company_name || "Your company" : "Workspace"), h("h1", null, "Presentations")),
    can("presentations:edit") ? h("div", { class: "row wrap" },
      h("a", { class: "btn", href: "/api/presentations/excel-template" }, icon("excel", 16), "Excel template"),
      h("button", { class: "btn", onclick: () => importHtmlDialog(companies) }, icon("code", 16), "Import HTML deck"),
      h("button", { class: "btn", onclick: () => blankDialog(companies) }, icon("plus", 16), "Blank"),
      h("button", { class: "btn primary", onclick: () => excelDialog(companies) }, icon("upload", 16), "New from Excel")) : null);

  const tools = isClient ? null : h("div", { class: "toolbar" },
    h("input", { class: "input", style: { maxWidth: "320px" }, type: "search", placeholder: "Search presentations", oninput: (e) => { filter = e.target.value; draw(); } }),
    h("select", { class: "input", style: { maxWidth: "260px" }, onchange: (e) => { companyId = e.target.value; draw(); } },
      h("option", { value: "" }, "All companies"), companies.map((c) => h("option", { value: c.id }, c.name))));
  draw();
  return h("div", null, head, tools, grid);
}

function companyPicker(companies, { allowNone = true } = {}) {
  const sel = h("select", { class: "input" }, allowNone ? h("option", { value: "" }, "— From the workbook / none —") : null,
    companies.map((c) => h("option", { value: c.id }, c.name)), h("option", { value: "__new" }, "+ New company…"));
  const name = h("input", { class: "input", placeholder: "New company name", hidden: true });
  sel.onchange = () => { name.hidden = sel.value !== "__new"; if (!name.hidden) name.focus(); };
  const el = h("label", { class: "f" }, "Client company", sel, name, h("span", { class: "hint" }, "Clients of this company can view the presentation once it's published."));
  const fill = (fd) => { if (sel.value === "__new") fd.append("company_name", name.value.trim()); else if (sel.value) fd.append("company_id", sel.value); };
  const json = () => (sel.value === "__new" ? { company_name: name.value.trim() } : sel.value ? { company_id: Number(sel.value) } : {});
  return { el, fill, json };
}

function excelDialog(companies) {
  let file = null;
  const title = h("input", { class: "input", placeholder: "Taken from the workbook if left blank" });
  const cp = companyPicker(companies);
  const err = h("div", { class: "err" });
  modal({ title: "New presentation from Excel", size: "mid",
    body: h("div", { class: "stack" },
      dropZone({ accept: ".xlsx", label: "Excel workbook (.xlsx)", onFile: (f) => { file = f; } }),
      h("div", { class: "banner info" }, icon("excel", 18), h("span", null, "Not sure how to lay out the workbook? ", h("a", { href: "/api/presentations/excel-template" }, "Download the template"), " — each row of its Slides sheet becomes a slide.")),
      h("label", { class: "f" }, "Title", title), cp.el, err),
    actions: [{ label: "Cancel" }, { label: "Create presentation", kind: "primary", onClick: async (e) => {
      if (!file) { err.textContent = "Choose an Excel file first."; return false; }
      const fd = new FormData(); fd.append("file", file); fd.append("title", title.value); cp.fill(fd);
      e.target.disabled = true; e.target.textContent = "Building…";
      try {
        const r = await api.upload("/api/presentations/from-excel", fd);
        toast(`Created ${r.slides} slides`);
        if (r.warnings && r.warnings.length) setTimeout(() => toast(r.warnings[0] + (r.warnings.length > 1 ? ` (+${r.warnings.length - 1} more)` : ""), "error"), 400);
        navigate("#/p/" + r.id + "/edit");
      } catch (ex) { err.textContent = ex.message; e.target.disabled = false; e.target.textContent = "Create presentation"; return false; }
    } }] });
}

function importHtmlDialog(companies) {
  let file = null;
  const cp = companyPicker(companies);
  const err = h("div", { class: "err" });
  modal({ title: "Import an HTML deck", size: "mid",
    body: h("div", { class: "stack" },
      h("p", { class: "muted", style: { margin: 0 } }, "Bring in an existing CMAC deck (like the Walla Walla Clinic proposal). Its slides become editable; interactive slide scripts keep working."),
      dropZone({ accept: ".html,.htm", label: "HTML deck (.html)", onFile: (f) => { file = f; } }), cp.el, err),
    actions: [{ label: "Cancel" }, { label: "Import", kind: "primary", onClick: async () => {
      if (!file) { err.textContent = "Choose an HTML file first."; return false; }
      const fd = new FormData(); fd.append("file", file); cp.fill(fd);
      try { const r = await api.upload("/api/presentations/import-html", fd); toast("Imported"); navigate("#/p/" + r.id + "/edit"); }
      catch (ex) { err.textContent = ex.message; return false; }
    } }] });
}

function blankDialog(companies) {
  const title = h("input", { class: "input", placeholder: "Presentation title" });
  const cp = companyPicker(companies);
  const err = h("div", { class: "err" });
  modal({ title: "Blank presentation", body: h("div", { class: "stack" }, h("label", { class: "f" }, "Title", title), cp.el, err),
    actions: [{ label: "Cancel" }, { label: "Create", kind: "primary", onClick: async () => {
      try { const r = await api.post("/api/presentations", Object.assign({ title: title.value }, cp.json())); navigate("#/p/" + r.id + "/edit"); }
      catch (ex) { err.textContent = ex.message; return false; }
    } }] });
}
