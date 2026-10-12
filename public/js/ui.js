/* Small DOM + UI helpers shared by every page */
export function h(tag, attrs, ...children) {
  const el = tag === "frag" ? document.createDocumentFragment() : document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden" || k === "multiple") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function icon(name, size = 18) {
  const P = {
    deck: "M3 5h18v12H3zM8 21h8M12 17v4",
    theme: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zM7.5 11.5h.01M10.5 7.5h.01M15.5 7.5h.01",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    company: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1",
    upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    plus: "M12 5v14M5 12h14",
    copy: "M9 9h11v11H9zM5 15H4V4h11v1",
    trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    undo: "M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8",
    redo: "M21 7v6h-6M21 13a9 9 0 1 1-3-7.7L21 8",
    play: "M6 4l14 8-14 8z",
    back: "M15 18l-6-6 6-6",
    code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
    history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2",
    hand: "M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15",
    excel: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13l4 5M12 13l-4 5",
    expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
    key: "M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
    up: "M18 15l-6-6-6 6", down: "M6 9l6 6 6-6", parent: "M17 11l-5-5-5 5M12 6v12"
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", P[name] || ""); svg.appendChild(p);
  return svg;
}
export function logo(id = "cmac-logo", cls = "logo") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#" + id); svg.appendChild(use);
  return svg;
}

export function toast(msg, kind = "") {
  const t = h("div", { class: "toast " + kind }, msg);
  document.getElementById("toasts").appendChild(t);
  setTimeout(() => t.remove(), kind === "error" ? 5200 : 2600);
}

export function modal({ title, body, actions = [], size = "", onClose }) {
  const close = () => { ov.remove(); document.removeEventListener("keydown", esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  const foot = actions.length ? h("footer", null, actions.map((a) => h("button", { class: "btn " + (a.kind || ""), type: a.type || "button", disabled: a.disabled,
    onclick: async (e) => { if (a.onClick) { const r = await a.onClick(e, close); if (r === false) return; } if (a.close !== false) close(); } }, a.label))) : null;
  const ov = h("div", { class: "overlay", onmousedown: (e) => { if (e.target === ov) close(); } },
    h("div", { class: "modal " + size, role: "dialog", "aria-modal": "true", "aria-label": title },
      h("header", null, h("h2", null, title), h("button", { class: "btn ghost icon", "aria-label": "Close", onclick: close }, "✕")),
      h("div", { class: "mb" }, body), foot));
  document.body.appendChild(ov);
  document.addEventListener("keydown", esc);
  const first = ov.querySelector("input,select,textarea");
  if (first) setTimeout(() => first.focus(), 30);
  return { close, el: ov };
}

export function confirmDialog(text, { title = "Are you sure?", ok = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({ title, body: h("p", { style: { margin: 0 } }, text), onClose: () => { if (!done) resolve(false); },
      actions: [{ label: "Cancel", onClick: () => { done = true; resolve(false); } }, { label: ok, kind: danger ? "danger" : "primary", onClick: () => { done = true; resolve(true); } }] });
  });
}

export function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function readFileAsDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

export function dropZone({ accept, label, onFile }) {
  const input = h("input", { type: "file", accept, hidden: true, onchange: () => input.files[0] && pick(input.files[0]) });
  const text = h("div", null, h("b", null, label), h("div", { class: "hint" }, "Drop a file here or click to browse"));
  const el = h("div", { class: "drop", tabindex: "0", role: "button", onclick: () => input.click(), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } },
    ondragover: (e) => { e.preventDefault(); el.classList.add("over"); }, ondragleave: () => el.classList.remove("over"),
    ondrop: (e) => { e.preventDefault(); el.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) pick(f); } }, icon("upload", 26), text, input);
  function pick(f) { text.innerHTML = ""; text.append(h("b", null, f.name), h("div", { class: "hint" }, (f.size / 1024).toFixed(0) + " KB · click to choose another")); onFile(f); }
  return el;
}

export const ROLE_LABEL = { admin: "Admin", developer: "Team member", client: "Client" };
