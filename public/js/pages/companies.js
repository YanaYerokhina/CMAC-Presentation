import { api } from "../api.js";
import { h, icon, toast, confirmDialog, modal } from "../ui.js";
import { can, navigate } from "../app.js";

export async function companiesPage() {
  const { companies } = await api.get("/api/companies");
  const name = h("input", { class: "input", placeholder: "Company name", style: { maxWidth: "320px" } });
  const add = h("form", { class: "toolbar", onsubmit: async (e) => {
    e.preventDefault();
    if (!name.value.trim()) return;
    try { await api.post("/api/companies", { name: name.value }); toast("Company added"); navigate("#/companies"); } catch (ex) { toast(ex.message, "error"); }
  } }, name, h("button", { class: "btn primary", type: "submit" }, icon("plus", 16), "Add company"));

  const rows = companies.map((c) => h("tr", null,
    h("td", null, h("b", null, c.name)), h("td", null, c.presentations), h("td", null, c.clients),
    h("td", { style: { textAlign: "right" } }, h("div", { class: "row", style: { justifyContent: "flex-end" } },
      h("button", { class: "btn sm", onclick: () => rename(c) }, "Rename"),
      can("companies:delete") ? h("button", { class: "btn sm danger", onclick: async () => {
        if (!(await confirmDialog(`Delete ${c.name}? Its presentations stay but are no longer linked to a company.`, { ok: "Delete", danger: true }))) return;
        try { await api.del("/api/companies/" + c.id); toast("Deleted"); navigate("#/companies"); } catch (ex) { toast(ex.message, "error"); }
      } }, "Delete") : null))));
  function rename(c) {
    const inp = h("input", { class: "input", value: c.name });
    modal({ title: "Rename company", body: inp, actions: [{ label: "Cancel" }, { label: "Save", kind: "primary", onClick: async () => {
      try { await api.patch("/api/companies/" + c.id, { name: inp.value }); navigate("#/companies"); } catch (ex) { toast(ex.message, "error"); return false; }
    } }] });
  }
  return h("div", null,
    h("div", { class: "page-head" }, h("div", null, h("div", { class: "eyebrow" }, "Clients"), h("h1", null, "Companies"))),
    h("p", { class: "muted", style: { marginTop: "-12px", maxWidth: "70ch" } }, "Each presentation belongs to a company. Client accounts see only their own company's published presentations."),
    add,
    h("div", { class: "card tbl-wrap" }, h("table", { class: "t" }, h("thead", null, h("tr", null, h("th", null, "Company"), h("th", null, "Presentations"), h("th", null, "Client accounts"), h("th"))),
      h("tbody", null, rows.length ? rows : h("tr", null, h("td", { colspan: "4", class: "muted" }, "No companies yet.")))))
  );
}
