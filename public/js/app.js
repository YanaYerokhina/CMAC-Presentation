/* CMAC Presentation Studio · SPA entry: session, routing, app shell */
import { api } from "./api.js";
import { h, icon, logo, toast, modal, ROLE_LABEL } from "./ui.js";
import { loginPage, activatePage } from "./pages/auth.js";
import { homePage } from "./pages/home.js";
import { viewerPage } from "./pages/viewer.js";
import { editorPage } from "./pages/editor.js";
import { themePage } from "./pages/theme.js";
import { usersPage } from "./pages/users.js";
import { companiesPage } from "./pages/companies.js";

export const state = { user: null, sprite: "" };
export const can = (cap) => !!state.user && state.user.caps.includes(cap);
let leaveGuard = null; /* () => boolean: return false to keep the user on the page */
export function setLeaveGuard(fn) { leaveGuard = fn; }

const app = document.getElementById("app");

export function navigate(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function loadSprite() {
  if (state.sprite) return state.sprite;
  state.sprite = await fetch("/deck/sprite.svg").then((r) => r.text());
  document.getElementById("sprite-holder").innerHTML = state.sprite;
  return state.sprite;
}

function shell(active, content, opts = {}) {
  const u = state.user;
  const link = (hash, name, ic) => h("a", { href: hash, class: active === name ? "on" : "" }, icon(ic), name);
  const nav = [link("#/", "Presentations", "deck")];
  if (u.role !== "client") nav.push(link("#/theme", "Theme", "theme"), link("#/companies", "Companies", "company"));
  if (can("users:manage")) nav.push(link("#/users", "Users & invites", "users"));
  return h("div", { class: "shell" + (opts.full ? " full" : "") },
    h("aside", { class: "side" },
      h("div", { class: "brand" }, logo("cmac-logo"), h("span", null, "Presentation Studio")),
      h("nav", null, nav),
      h("div", { class: "me" }, h("b", null, u.name || u.email), h("div", { class: "small", style: { color: "var(--mist)" } }, u.company_name || u.email),
        h("span", { class: "role-pill" }, ROLE_LABEL[u.role]),
        h("div", { class: "row" }, h("button", { class: "btn sm", onclick: accountDialog }, "Account"), h("button", { class: "btn sm", onclick: logout }, "Sign out")))),
    h("main", { class: "main" }, content));
}

function accountDialog() {
  const cur = h("input", { class: "input", type: "password", autocomplete: "current-password" });
  const pw = h("input", { class: "input", type: "password", autocomplete: "new-password", minlength: "8" });
  const err = h("div", { class: "err" });
  modal({ title: "Change password", body: h("div", { class: "stack" }, h("label", { class: "f" }, "Current password", cur), h("label", { class: "f" }, "New password", pw, h("span", { class: "hint" }, "At least 8 characters.")), err),
    actions: [{ label: "Cancel" }, { label: "Update password", kind: "primary", onClick: async () => {
      try { await api.post("/api/auth/password", { current: cur.value, password: pw.value }); toast("Password updated"); }
      catch (e) { err.textContent = e.message; return false; }
    } }] });
}

async function logout() {
  if (leaveGuard && !leaveGuard()) return;
  await api.post("/api/auth/logout").catch(() => {});
  state.user = null; leaveGuard = null;
  navigate("#/login");
}

let lastHash = location.hash;
async function route() {
  if (leaveGuard && location.hash !== lastHash) {
    if (!leaveGuard()) { history.replaceState(null, "", lastHash); return; }
    leaveGuard = null;
  }
  lastHash = location.hash;
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("?")[0].split("/").filter(Boolean);
  window.scrollTo(0, 0);
  try {
    if (parts[0] === "activate") return mount(activatePage({ token: parts[1] || "", onDone: onSignedIn }));
    if (!state.user) {
      if (parts[0] !== "login") { sessionStorage.setItem("cm:after", location.hash); }
      return mount(loginPage({ onDone: onSignedIn }));
    }
    if (parts[0] === "login") return navigate("#/");
    if (parts[0] === "p" && parts[1]) {
      if (parts[2] === "edit") {
        if (!can("presentations:edit")) return navigate("#/p/" + parts[1]);
        return mount(await editorPage(Number(parts[1])));
      }
      return mount(shell("Presentations", await viewerPage(Number(parts[1])), { full: true }));
    }
    if (parts[0] === "theme" && state.user.role !== "client") return mount(shell("Theme", await themePage()));
    if (parts[0] === "companies" && state.user.role !== "client") return mount(shell("Companies", await companiesPage()));
    if (parts[0] === "users" && can("users:manage")) return mount(shell("Users & invites", await usersPage()));
    return mount(shell("Presentations", await homePage()));
  } catch (e) {
    if (e.status === 401) return;
    mount(shell("", h("div", { class: "empty" }, h("h2", null, e.status === 404 ? "Not found" : "Something went wrong"), h("p", null, e.message), h("a", { class: "btn", href: "#/" }, "Back to presentations"))));
  }
}
function mount(node) { app.innerHTML = ""; app.appendChild(node); }

function onSignedIn(user) {
  state.user = user;
  const after = sessionStorage.getItem("cm:after");
  sessionStorage.removeItem("cm:after");
  navigate(after && !/login|activate/.test(after) ? after : "#/");
}

window.addEventListener("hashchange", route);
window.addEventListener("cm:unauthorized", () => { state.user = null; leaveGuard = null; navigate("#/login"); });
window.addEventListener("beforeunload", (e) => { if (leaveGuard && !leaveGuard(true)) { e.preventDefault(); e.returnValue = ""; } });

(async () => {
  await loadSprite().catch(() => {});
  try { state.user = (await api.get("/api/auth/me")).user; } catch { state.user = null; }
  route();
})();
