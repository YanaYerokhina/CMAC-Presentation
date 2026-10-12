import { api } from "../api.js";
import { h, icon } from "../ui.js";
import { can, state } from "../app.js";

export async function viewerPage(id) {
  const { presentation: p } = await api.get("/api/presentations/" + id);
  const src = "/api/presentations/" + id + "/render";
  /* The deck runs in an opaque-origin sandbox: its scripts can't act as the signed-in user. */
  const frame = h("iframe", { src, title: p.title, sandbox: "allow-scripts allow-popups allow-modals", allow: "fullscreen" });
  const bar = h("div", { class: "vbar" },
    h("a", { class: "btn ghost icon", href: "#/", "aria-label": "Back to presentations", title: "Back" }, icon("back")),
    h("div", { class: "grow" }, h("h2", { style: { fontSize: "22px" } }, p.title), h("div", { class: "small muted" }, [p.company_name, state.user.role === "client" ? null : p.status].filter(Boolean).join(" · "))),
    h("span", { class: "small muted nowrap" }, "← → to move between slides"),
    h("button", { class: "btn", onclick: () => (frame.requestFullscreen ? frame.requestFullscreen() : null) }, icon("expand", 16), "Full screen"),
    h("a", { class: "btn", href: src, target: "_blank", rel: "noopener", title: "Open in a new tab (use your browser's Print › Save as PDF for a PDF)" }, icon("play", 16), "Open"),
    can("presentations:download") && p.source_type && p.source_type !== "blank" ? h("a", { class: "btn", href: "/api/presentations/" + id + "/source" }, icon("excel", 16), p.source_type === "xlsx" ? "Source Excel" : "Source file") : null,
    can("presentations:download") ? h("a", { class: "btn", href: "/api/presentations/" + id + "/download" }, icon("download", 16), "Download HTML") : null,
    can("presentations:edit") ? h("a", { class: "btn primary", href: "#/p/" + id + "/edit" }, icon("edit", 16), "Edit") : null);
  frame.addEventListener("load", () => { try { frame.focus(); } catch {} });
  return h("div", { class: "viewer" }, bar, frame);
}
