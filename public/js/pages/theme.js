import { api } from "../api.js";
import { h, icon, toast, confirmDialog, fmtDate, readFileAsDataUrl, logo } from "../ui.js";
import { state, setLeaveGuard } from "../app.js";

const B = window.CMStudioBuilder;
const PREVIEW = ["cover", "story", "list", "kpis", "table", "chart", "columns", "divider", "close"];
const TYPE_KEYS = [["display", "Display", 80, 260], ["h1", "Title (H1)", 48, 160], ["h2", "Headline (H2)", 32, 110], ["h3", "Subhead (H3)", 18, 60],
  ["sub", "Subtitle", 16, 48], ["body", "Body", 14, 40], ["small", "Small", 12, 30], ["eyebrow", "Eyebrow", 11, 30], ["big", "Big number", 60, 220], ["kpi", "KPI value", 32, 110]];

function toHex(v) {
  v = String(v || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return "#" + v.slice(1).split("").map((c) => c + c).join("");
  return "#000000";
}

export async function themePage() {
  const data = await api.get("/api/theme");
  const editable = data.canEdit;
  let saved = JSON.stringify(data.theme);
  let t = JSON.parse(saved);
  let slideIdx = 0, timer = null;
  const dirty = () => JSON.stringify(t) !== saved;

  const frame = h("iframe", { class: "preview-frame", sandbox: "allow-scripts", title: "Theme preview" });
  const sampleCtx = () => ({ company: "Client Company", website: t.website, tagline: t.tagline });
  function renderPreview() {
    const sections = PREVIEW.map((k) => B.sampleSlide(k, sampleCtx())).join("\n");
    frame.srcdoc = B.buildDeck({ title: "Theme preview", meta: t.meta + " · Client Company", sectionsHtml: sections, theme: t, sprite: state.sprite, startSlide: slideIdx });
  }
  const changed = () => { clearTimeout(timer); timer = setTimeout(renderPreview, 200); stateLbl.textContent = dirty() ? "Unsaved changes" : ""; };

  function makeForm() {
    /* ---------- controls ---------- */
    const colorField = (key, label) => {
      const hex = h("input", { value: t.colors[key], "aria-label": label + " hex", spellcheck: "false" });
      const pick = h("input", { type: "color", value: toHex(t.colors[key]), "aria-label": label });
      pick.oninput = () => { t.colors[key] = pick.value.toUpperCase(); hex.value = t.colors[key]; changed(); };
      hex.onchange = () => { if (/^#[0-9a-f]{3,8}$/i.test(hex.value.trim())) { t.colors[key] = hex.value.trim(); pick.value = toHex(t.colors[key]); changed(); } else hex.value = t.colors[key]; };
      return h("div", { class: "cfield" }, pick, h("div", { class: "lbl" }, label.replace(/ \(.*\)/, ""), hex));
    };
    const range = (label, get, set, min, max, step = 1) => {
      const r = h("input", { type: "range", min, max, step, value: get() });
      const n = h("input", { class: "input", type: "number", min, max, step, value: get() });
      r.oninput = () => { n.value = r.value; set(Number(r.value)); changed(); };
      n.onchange = () => { r.value = n.value; set(Number(n.value)); changed(); };
      return h("div", { class: "range" }, h("span", null, label), r, n);
    };
    const fontOptions = (kind, current) => {
      const fams = B.FONT_LIBRARY.filter((f) => f.kind === kind).concat(B.FONT_LIBRARY.filter((f) => f.kind !== kind))
        .map((f) => f.family).concat((t.customFonts || []).map((f) => f.family));
      return [...new Set(fams)].map((f) => h("option", { value: f, selected: f === current }, f + (B.FONT_LIBRARY.find((x) => x.family === f && x.source === "embedded") ? " (brand)" : "")));
    };
    const fontSel = (key, label) => {
      const s = h("select", { class: "input" }, fontOptions(key, t.fonts[key]));
      s.onchange = () => { t.fonts[key] = s.value; changed(); };
      return h("label", { class: "f" }, label, s);
    };
    const fontsBox = h("div", { class: "db" });
    function drawFonts() {
      fontsBox.replaceChildren(...[
        fontSel("serif", "Headline font (serif)"), fontSel("sans", "Text font (sans)"),
        h("div", { class: "hint" }, "Hedvig Letters Serif and Manrope are the CMAC brand fonts. Others load from Google Fonts."),
        (t.customFonts || []).length ? h("div", { class: "stack", style: { gap: "6px" } }, t.customFonts.map((f, i) => h("div", { class: "row small" }, h("b", { class: "grow" }, f.family),
          editable ? h("button", { class: "btn sm danger", onclick: () => { t.customFonts.splice(i, 1); drawFonts(); changed(); } }, "Remove") : null))) : null,
        editable ? h("label", { class: "btn sm", style: { alignSelf: "flex-start" } }, icon("upload", 14), "Upload a font file",
          h("input", { type: "file", accept: ".woff2,.woff,.ttf,.otf", hidden: true, onchange: async (e) => {
            const f = e.target.files[0]; if (!f) return;
            if (f.size > 3e6) return toast("Font files must be under 3 MB.", "error");
            const ext = (f.name.split(".").pop() || "woff2").toLowerCase();
            const raw = await readFileAsDataUrl(f);
            const family = f.name.replace(/\.[^.]+$/, "").replace(/[-_](Regular|Variable|VF|Book)$/i, "").replace(/[-_]+/g, " ").trim();
            t.customFonts = (t.customFonts || []).filter((x) => x.family !== family);
            t.customFonts.push({ family, format: { ttf: "truetype", otf: "opentype" }[ext] || ext, dataUrl: "data:font/" + ext + ";base64," + raw.split(",")[1] });
            drawFonts(); changed(); toast(`Added “${family}”. Pick it in the font lists.`);
          } })) : null].filter(Boolean));
    }
    drawFonts();

    const logoRow = (key, label, symbolId) => {
      const prev = h("div", { class: "lp" });
      const draw = () => prev.replaceChildren(t.logos[key] ? h("img", { src: t.logos[key], alt: "" }) : logo(symbolId, ""));
      draw();
      return h("div", { class: "logo-up" }, h("span", null, label), prev, editable ? h("div", { class: "row" },
        h("label", { class: "btn sm" }, "Replace", h("input", { type: "file", accept: "image/svg+xml,image/png,image/jpeg,image/webp", hidden: true, onchange: async (e) => {
          const f = e.target.files[0]; if (!f) return;
          if (f.size > 2e6) return toast("Logos must be under 2 MB.", "error");
          t.logos[key] = await readFileAsDataUrl(f); draw(); changed();
        } })),
        t.logos[key] ? h("button", { class: "btn sm ghost", onclick: () => { t.logos[key] = ""; draw(); changed(); } }, "Reset") : null) : null);
    };
    const text = (label, key, hint) => {
      const i = h("input", { class: "input", value: t[key] || "" });
      i.oninput = () => { t[key] = i.value; changed(); };
      return h("label", { class: "f" }, label, i, hint ? h("span", { class: "hint" }, hint) : null);
    };
    const toggle = (label, key) => {
      const c = h("input", { type: "checkbox", checked: !!t[key] });
      c.onchange = () => { t[key] = c.checked; changed(); };
      return h("label", { class: "row small", style: { fontWeight: 600, color: "var(--slate)" } }, c, label);
    };
    const weightSel = (label, key, opts) => {
      const s = h("select", { class: "input sm" }, opts.map((w) => h("option", { value: w, selected: Number(t.weights[key]) === w }, w)));
      s.onchange = () => { t.weights[key] = Number(s.value); changed(); };
      return h("label", { class: "range", style: { gridTemplateColumns: "92px 1fr" } }, h("span", null, label), s);
    };
    const css = h("textarea", { class: "input code", rows: "8", spellcheck: "false", placeholder: "/* Extra CSS applied to every presentation */" }, t.customCss || "");
    css.oninput = () => { t.customCss = css.value; changed(); };

    const sec = (title, open, ...kids) => h("details", { open }, h("summary", null, title), h("div", { class: "db" }, kids));
    return h("fieldset", { disabled: !editable, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } }, h("div", { class: "theme-form" },
      sec("Colors", true, h("div", { class: "colors" }, B.COLOR_TOKENS.map((c) => colorField(c.key, c.label)))),
      h("details", { open: true }, h("summary", null, "Fonts"), fontsBox),
      sec("Type scale (px at 1920×1080)", false, TYPE_KEYS.map(([k, l, mn, mx]) => range(l, () => t.type[k], (v) => { t.type[k] = v; }, mn, mx))),
      sec("Weights & letter spacing", false,
        weightSel("Headlines", "heading", [300, 400, 500, 600, 700]), weightSel("Subtitles", "sub", [300, 400, 500, 600, 700]), weightSel("Eyebrows", "eyebrow", [400, 500, 600, 700, 800]),
        range("Headline track", () => t.tracking.heading, (v) => { t.tracking.heading = v; }, -0.06, 0.06, 0.005),
        range("Eyebrow track", () => t.tracking.eyebrow, (v) => { t.tracking.eyebrow = v; }, 0, 0.2, 0.01),
        toggle("Uppercase eyebrows and labels", "eyebrowUppercase"), toggle("Paper texture on colored slides", "texture")),
      sec("Logos", false, logoRow("logo", "Logo", "cmac-logo"), logoRow("symbol", "Symbol", "cmac-symbol"), logoRow("wordmark", "Wordmark", "cmac-wordmark"),
        h("div", { class: "hint" }, "SVG or PNG with a transparent background works best. Logos fill the same space as the CMAC artwork.")),
      sec("Brand text", false, text("Default footer", "meta", "Shown bottom-right on slides when a presentation has no footer of its own."), text("Website", "website"), text("Closing tagline", "tagline")),
      sec("Custom CSS (advanced)", false, css, h("div", { class: "hint" }, "Applied after the theme to every presentation."))));

  }
  const formHolder = h("div");
  const drawForm = () => formHolder.replaceChildren(makeForm());
  drawForm();

  /* ---------- header + actions ---------- */
  const stateLbl = h("span", { class: "small", style: { color: "var(--amber)" } });
  const save = async () => {
    try { const r = await api.put("/api/theme", { theme: t }); saved = JSON.stringify(r.theme); t = JSON.parse(saved); stateLbl.textContent = ""; toast("Theme saved — all presentations now use it"); }
    catch (e) { toast(e.message, "error"); }
  };
  const actions = editable ? h("div", { class: "row wrap" }, stateLbl,
    h("button", { class: "btn ghost", onclick: async () => { if (await confirmDialog("Reset every theme setting to the CMAC defaults? This affects all presentations once you save.", { ok: "Reset" })) { t = JSON.parse(JSON.stringify(data.defaults)); drawForm(); changed(); } } }, "Reset to CMAC default"),
    h("button", { class: "btn", onclick: () => { t = JSON.parse(saved); drawForm(); changed(); } }, "Discard"),
    h("button", { class: "btn primary", onclick: save }, "Save theme")) : null;

  if (editable) setLeaveGuard(() => !dirty() || confirm("You have unsaved theme changes. Leave without saving?"));

  const tabs = h("div", { class: "preview-tabs" }, PREVIEW.map((k, i) => h("button", { class: "btn sm" + (i === 0 ? " on" : ""), onclick: (e) => {
    slideIdx = i; [...tabs.children].forEach((b) => b.classList.toggle("on", b === e.currentTarget)); renderPreview();
  } }, B.LAYOUTS[k].label)));
  renderPreview();

  return h("div", null,
    h("div", { class: "page-head" }, h("div", { class: "grow" }, h("div", { class: "eyebrow" }, "Main presentation theme"), h("h1", null, "Theme")), actions),
    editable ? h("p", { class: "muted", style: { marginTop: "-12px" } }, "Changes apply to every presentation, including published ones, as soon as you save." + (data.updated_at ? " Last saved " + fmtDate(data.updated_at) + (data.updated_by_name ? " by " + data.updated_by_name : "") + "." : ""))
      : h("div", { class: "banner", style: { marginBottom: "18px" } }, icon("key", 18), "Only admins can change the theme. You can preview it here."),
    h("div", { class: "theme-wrap" }, formHolder, h("div", { class: "preview-pane" }, tabs, frame,
      h("p", { class: "small muted" }, "Sample slides rendered with the current settings."))));
}
