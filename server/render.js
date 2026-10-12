"use strict";
/* Deck documents for the viewer, the editor and the standalone download. */
const fs = require("fs");
const path = require("path");
const B = require("../public/deck/builder.js");

const DECK_DIR = path.join(__dirname, "..", "public", "deck");
const read = (f) => fs.readFileSync(path.join(DECK_DIR, f), "utf8");
let cache = null;
function assets() {
  if (!cache || process.env.NODE_ENV === "development") {
    cache = { sprite: read("sprite.svg"), fontsCss: read("fonts.css"), baseCss: read("base.css"), cmacJs: read("cmac.js"), runtimeJs: read("runtime.js") };
  }
  return cache;
}

function deckOptions(p, theme, extra = {}) {
  return Object.assign({
    title: p.title, meta: p.meta, sectionsHtml: p.sections_html, presentationCss: p.custom_css, customJs: p.custom_js,
    theme, sprite: assets().sprite, mode: "view"
  }, extra);
}

/* Linked assets: used inside the app (viewer iframe) */
function renderView(p, theme) {
  return B.buildDeck(deckOptions(p, theme));
}

/* Everything inlined: a single .html file that works offline (Google fonts aside) */
function renderExport(p, theme) {
  const a = assets();
  return B.buildDeck(deckOptions(p, theme, { mode: "export", inline: { fontsCss: a.fontsCss, baseCss: a.baseCss, cmacJs: a.cmacJs, runtimeJs: a.runtimeJs } }));
}

/* The viewer document runs presentation scripts, so it is served in an opaque-origin sandbox:
 * it cannot read the app's cookies or call the API as the signed-in user. */
function sendSandboxed(res, html) {
  res.set("Content-Security-Policy", "sandbox allow-scripts allow-popups allow-modals; frame-ancestors 'self'");
  res.set("X-Content-Type-Options", "nosniff");
  res.type("html").send(html);
}

module.exports = { assets, renderView, renderExport, sendSandboxed };
