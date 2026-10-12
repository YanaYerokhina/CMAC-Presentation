"use strict";
const express = require("express");
const A = require("../auth");
const B = require("../../public/deck/builder.js");

function getTheme(db) {
  const row = db.prepare("SELECT * FROM themes WHERE id = 1").get();
  let tokens = {};
  try { tokens = row ? JSON.parse(row.tokens_json) : {}; } catch { tokens = {}; }
  return { theme: B.normalizeTheme(tokens), updated_at: row && row.updated_at, updated_by: row && row.updated_by };
}

function saveTheme(db, theme, userId) {
  const t = B.normalizeTheme(theme);
  db.prepare(`INSERT INTO themes (id, name, tokens_json, updated_by, updated_at) VALUES (1, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, tokens_json = excluded.tokens_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .run(String(t.name || "Theme").slice(0, 80), JSON.stringify(t), userId || null);
  return t;
}

function validate(t) {
  if (!t || typeof t !== "object") return "Theme must be an object.";
  for (const [k, v] of Object.entries(t.colors || {})) {
    if (!/^[#a-zA-Z0-9(),.%\s-]{1,40}$/.test(String(v))) return "Invalid color for " + k + ".";
  }
  const imgs = Object.values(t.logos || {}).filter(Boolean);
  if (imgs.some((u) => !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(u))) return "Logos must be PNG, JPG, GIF, WEBP or SVG images.";
  if ((t.customFonts || []).some((f) => !f || !/^data:(font|application)\/[\w.+-]+;base64,/.test(f.dataUrl || "") || !String(f.family || "").trim())) return "Custom fonts must be uploaded font files with a family name.";
  return null;
}

function themeRoutes(db) {
  const r = express.Router();
  r.get("/", A.requireAuth, (req, res) => {
    if (req.user.role === "client") return res.status(403).json({ error: "You don't have permission to do that." });
    const t = getTheme(db);
    const by = t.updated_by ? db.prepare("SELECT name FROM users WHERE id = ?").get(t.updated_by) : null;
    res.json({ theme: t.theme, defaults: B.DEFAULT_THEME, updated_at: t.updated_at, updated_by_name: by && by.name, canEdit: A.can(req.user, "theme:edit") });
  });
  r.put("/", A.requireCap("theme:edit"), (req, res) => {
    const err = validate(req.body.theme);
    if (err) return res.status(400).json({ error: err });
    res.json({ theme: saveTheme(db, req.body.theme, req.user.id) });
  });
  r.post("/reset", A.requireCap("theme:edit"), (req, res) => {
    res.json({ theme: saveTheme(db, B.DEFAULT_THEME, req.user.id) });
  });
  return r;
}

module.exports = { themeRoutes, getTheme, saveTheme };
