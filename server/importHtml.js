"use strict";
/* Import an existing CMAC HTML deck (for example the Walla Walla Clinic deck) so it can be edited visually.
 * Keeps: the <section class="slide"> markup, deck-specific CSS beyond the shared theme stylesheet,
 * and the deck's own slide script (interactive charts, sliders). The CMAC library and fonts come from the app. */
const { assets } = require("./render");

function commonRuleBoundary(a, b) {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (i === a.length) return i;
  const cut = a.lastIndexOf("}", i - 1);
  return cut < 0 ? 0 : cut + 1;
}

function decode(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function parseDeckHtml(html) {
  html = String(html || "");
  const first = html.search(/<section\b[^>]*class="[^"]*\bslide\b/i);
  const last = html.lastIndexOf("</section>");
  if (first < 0 || last < first) {
    const err = new Error('No slides found. The file must contain <section class="slide"> elements.');
    err.status = 400;
    throw err;
  }
  const sections = html.slice(first, last + "</section>".length);
  const title = decode((/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || "").trim();
  const meta = decode((/<body\b[^>]*\bdata-meta="([^"]*)"/i.exec(html) || [])[1] || "");

  const base = assets().baseCss.trim();
  const css = [];
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const s = m[1].trim();
    if (/@font-face/.test(s) && /Hedvig Letters Serif|Manrope/.test(s) && !/\.slide\b/.test(s)) continue; /* the brand fonts ship with the app */
    if (/CMAC BRAND TOKENS/.test(s)) { const rest = s.slice(commonRuleBoundary(s, base)).trim(); if (rest) css.push(rest); continue; }
    css.push(s);
  }
  const js = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=/.test(m[1])) continue;
    const s = m[2].trim();
    if (!s || /CMAC LIBRARY/.test(s) || /^var CMAC\s*=/.test(s)) continue;
    js.push(s);
  }
  return { title, meta, sectionsHtml: sections, customCss: css.join("\n\n"), customJs: js.join("\n\n") };
}

module.exports = { parseDeckHtml };
