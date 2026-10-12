import { api } from "../api.js";
import { h, icon, toast, confirmDialog, fmtDate, modal, ROLE_LABEL } from "../ui.js";
import { state, navigate } from "../app.js";

const ROLE_HELP = {
  admin: "Full access: theme, users, presentations, downloads.",
  developer: "Upload Excel, create, edit and download presentations. Can't change the theme.",
  client: "Views their company's published presentations."
};
const inviteLink = (token) => location.origin + location.pathname + "#/activate/" + token;

export async function usersPage() {
  const [{ users }, { invites }, { companies }] = await Promise.all([api.get("/api/admin/users"), api.get("/api/admin/invites"), api.get("/api/companies")]);
  const refresh = () => navigate("#/users");

  /* ---- invite form ---- */
  const email = h("input", { class: "input", type: "email", required: true, placeholder: "name@company.com" });
  const role = h("select", { class: "input" }, ["developer", "client", "admin"].map((r) => h("option", { value: r }, ROLE_LABEL[r])));
  const company = h("select", { class: "input" }, h("option", { value: "" }, "Choose company…"), companies.map((c) => h("option", { value: c.id }, c.name)));
  const companyField = h("label", { class: "f", hidden: true }, "Company", company);
  const help = h("div", { class: "hint" }, ROLE_HELP.developer);
  role.onchange = () => { companyField.hidden = role.value !== "client"; help.textContent = ROLE_HELP[role.value]; };
  const form = h("form", { class: "card pad", style: { display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1.3fr) auto", gap: "12px", alignItems: "end" }, onsubmit: async (e) => {
    e.preventDefault();
    try {
      const r = await api.post("/api/admin/invites", { email: email.value, role: role.value, company_id: company.value || null });
      showLink(email.value, r.token);
    } catch (ex) { toast(ex.message, "error"); }
  } },
    h("label", { class: "f" }, "Email", email), h("label", { class: "f" }, "Role", role), companyField,
    h("button", { class: "btn primary", type: "submit", style: { gridColumn: "4" } }, icon("plus", 16), "Invite"), h("div", { style: { gridColumn: "1/-1" } }, help));

  function showLink(addr, token) {
    const inp = h("input", { class: "input", readonly: true, value: inviteLink(token) });
    modal({ title: "Invitation created", body: h("div", { class: "stack" },
      h("p", { style: { margin: 0 } }, "Send this link to ", h("b", null, addr), ". They can also go to the sign-in page and choose “Activate your invitation” with this email."),
      h("div", { class: "copy" }, inp, h("button", { class: "btn", onclick: () => { navigator.clipboard.writeText(inp.value).then(() => toast("Link copied")); } }, icon("copy", 15), "Copy"))),
      actions: [{ label: "Done", kind: "primary" }], onClose: refresh });
    setTimeout(() => inp.select(), 50);
  }

  /* ---- pending invites ---- */
  const invRows = invites.map((i) => h("tr", null,
    h("td", null, i.email), h("td", null, ROLE_LABEL[i.role] + (i.company_name ? " · " + i.company_name : "")),
    h("td", { class: "small muted" }, (i.expired ? "Expired " : "Expires ") + fmtDate(i.expires_at)),
    h("td", { style: { textAlign: "right" } }, h("div", { class: "row", style: { justifyContent: "flex-end" } },
      i.expired ? null : h("button", { class: "btn sm", onclick: () => navigator.clipboard.writeText(inviteLink(i.token)).then(() => toast("Link copied")) }, icon("copy", 14), "Copy link"),
      h("button", { class: "btn sm danger", onclick: async () => { await api.del("/api/admin/invites/" + i.id); toast("Invitation revoked"); refresh(); } }, "Revoke")))));

  /* ---- users ---- */
  const userRows = users.map((u) => {
    const rsel = h("select", { class: "input sm", style: { width: "140px" }, disabled: u.id === state.user.id }, ["admin", "developer", "client"].map((r) => h("option", { value: r, selected: u.role === r }, ROLE_LABEL[r])));
    const csel = h("select", { class: "input sm", style: { width: "180px" }, hidden: u.role !== "client" }, h("option", { value: "" }, "Choose company…"), companies.map((c) => h("option", { value: c.id, selected: c.id === u.company_id }, c.name)));
    const save = async (body) => { try { await api.patch("/api/admin/users/" + u.id, body); toast("Saved"); refresh(); } catch (ex) { toast(ex.message, "error"); refresh(); } };
    rsel.onchange = () => { csel.hidden = rsel.value !== "client"; if (rsel.value !== "client" || csel.value) save({ role: rsel.value, company_id: csel.value || null }); else csel.focus(); };
    csel.onchange = () => csel.value && save({ role: rsel.value, company_id: csel.value });
    return h("tr", { style: { opacity: u.active ? 1 : 0.55 } },
      h("td", null, h("b", null, u.name || "—"), h("div", { class: "small muted" }, u.email)),
      h("td", null, h("div", { class: "row" }, rsel, csel)),
      h("td", { class: "small muted" }, u.last_login_at ? fmtDate(u.last_login_at) : "Never"),
      h("td", { style: { textAlign: "right" } }, u.id === state.user.id ? h("span", { class: "small muted" }, "You") : h("div", { class: "row", style: { justifyContent: "flex-end" } },
        h("button", { class: "btn sm", onclick: () => save({ active: !u.active }) }, u.active ? "Deactivate" : "Reactivate"),
        h("button", { class: "btn sm danger", onclick: async () => {
          if (await confirmDialog(`Delete ${u.email}? They will lose access immediately.`, { ok: "Delete", danger: true })) { try { await api.del("/api/admin/users/" + u.id); refresh(); } catch (ex) { toast(ex.message, "error"); } }
        } }, "Delete"))));
  });

  return h("div", null,
    h("div", { class: "page-head" }, h("div", null, h("div", { class: "eyebrow" }, "Access"), h("h1", null, "Users & invites"))),
    h("p", { class: "muted", style: { marginTop: "-12px", maxWidth: "75ch" } }, "Only invited email addresses can create an account. The invitation decides whether someone is an admin, a team member or a client — and for clients, which company's presentations they can see."),
    form,
    h("div", { class: "section-title" }, h("h2", null, "Pending invitations"), h("span", { class: "muted small" }, invites.length)),
    h("div", { class: "card tbl-wrap" }, h("table", { class: "t" }, h("thead", null, h("tr", null, h("th", null, "Email"), h("th", null, "Role"), h("th", null, "Status"), h("th"))),
      h("tbody", null, invRows.length ? invRows : h("tr", null, h("td", { colspan: "4", class: "muted" }, "No pending invitations."))))),
    h("div", { class: "section-title" }, h("h2", null, "People"), h("span", { class: "muted small" }, users.length)),
    h("div", { class: "card tbl-wrap" }, h("table", { class: "t" }, h("thead", null, h("tr", null, h("th", null, "Name"), h("th", null, "Role"), h("th", null, "Last sign-in"), h("th"))), h("tbody", null, userRows))));
}
