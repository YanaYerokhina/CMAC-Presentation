import { api } from "../api.js";
import { h, logo, ROLE_LABEL } from "../ui.js";

function frame(card) {
  return h("div", { class: "auth" },
    h("div", { class: "auth-art" }, h("div", { class: "ring" }), h("div", { class: "ring b" }),
      logo("cmac-logo"),
      h("div", null, h("h1", null, "Presentation Studio"), h("p", null, "Turn Excel workbooks into on-brand CMAC presentations, edit them visually, and share them with clients.")),
      h("p", { class: "small", style: { fontSize: "13px" } }, "Access is by invitation only.")),
    h("div", { class: "auth-form" }, h("div", { class: "auth-card" }, card)));
}

export function loginPage({ onDone }) {
  const email = h("input", { class: "input", type: "email", autocomplete: "username", required: true, placeholder: "you@company.com" });
  const pw = h("input", { class: "input", type: "password", autocomplete: "current-password", required: true });
  const err = h("div", { class: "err", role: "alert" });
  const btn = h("button", { class: "btn primary", type: "submit", style: { width: "100%", height: "44px" } }, "Sign in");
  const form = h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ""; btn.disabled = true;
    try { const r = await api.post("/api/auth/login", { email: email.value, password: pw.value }); onDone(r.user); }
    catch (ex) {
      if (ex.data && ex.data.code === "INVITE_PENDING") { location.hash = "#/activate?email=" + encodeURIComponent(email.value); return; }
      err.textContent = ex.message;
    } finally { btn.disabled = false; }
  } },
    h("h2", null, "Sign in"), h("p", { class: "muted", style: { margin: "0 0 8px" } }, "Use the email address your invitation was sent to."),
    h("label", { class: "f" }, "Email", email), h("label", { class: "f" }, "Password", pw), err, btn,
    h("p", { class: "small muted", style: { textAlign: "center" } }, "First time here? ", h("a", { href: "#/activate" }, "Activate your invitation")));
  return frame(form);
}

export function activatePage({ token, onDone }) {
  const qs = new URLSearchParams((location.hash.split("?")[1] || ""));
  const email = h("input", { class: "input", type: "email", autocomplete: "username", required: true, value: qs.get("email") || "" });
  const name = h("input", { class: "input", autocomplete: "name", required: true });
  const pw = h("input", { class: "input", type: "password", autocomplete: "new-password", required: true, minlength: "8" });
  const pw2 = h("input", { class: "input", type: "password", autocomplete: "new-password", required: true });
  const err = h("div", { class: "err", role: "alert" });
  const who = h("div");
  const btn = h("button", { class: "btn primary", type: "submit", style: { width: "100%", height: "44px" } }, "Activate account");
  const emailField = h("label", { class: "f" }, "Invited email", email);
  if (token) {
    emailField.hidden = true; email.required = false;
    api.get("/api/auth/invite/" + encodeURIComponent(token)).then((inv) => {
      who.replaceChildren(h("p", { style: { margin: "0 0 4px" } }, "Invitation for ", h("b", null, inv.email)),
        h("span", { class: "role-pill" }, ROLE_LABEL[inv.role] + (inv.company_name ? " · " + inv.company_name : "")));
    }).catch((e) => { err.textContent = e.message; btn.disabled = true; });
  }
  const form = h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    if (pw.value !== pw2.value) { err.textContent = "The passwords don't match."; return; }
    btn.disabled = true;
    try { const r = await api.post("/api/auth/activate", token ? { token, name: name.value, password: pw.value } : { email: email.value, name: name.value, password: pw.value }); onDone(r.user); }
    catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
  } },
    h("h2", null, "Activate your invitation"),
    h("p", { class: "muted", style: { margin: "0 0 8px" } }, "We'll check that your email has been invited as an admin, team member or client, then create your account."),
    who, emailField, h("label", { class: "f" }, "Your name", name),
    h("label", { class: "f" }, "Choose a password", pw, h("span", { class: "hint" }, "At least 8 characters.")), h("label", { class: "f" }, "Confirm password", pw2), err, btn,
    h("p", { class: "small muted", style: { textAlign: "center" } }, "Already activated? ", h("a", { href: "#/login" }, "Sign in")));
  return frame(form);
}
