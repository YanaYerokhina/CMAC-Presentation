"use strict";
const express = require("express");
const multer = require("multer");
const A = require("../auth");
const B = require("../../public/deck/builder.js");
const { parseWorkbook, templateWorkbook } = require("../excel");
const { parseDeckHtml } = require("../importHtml");
const { renderView, renderExport, sendSandboxed } = require("../render");
const { getTheme } = require("./theme");

const MAX_VERSIONS = 50;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });

const LIST_COLS = `p.id, p.title, p.company_id, c.name AS company_name, p.status, p.meta, p.source_type, p.source_name,
  p.created_at, p.updated_at, cu.name AS created_by_name, uu.name AS updated_by_name,
  (length(p.sections_html) - length(replace(p.sections_html, '<section', ''))) / 8 AS slide_count`;
const FROM = `FROM presentations p LEFT JOIN companies c ON c.id = p.company_id
  LEFT JOIN users cu ON cu.id = p.created_by LEFT JOIN users uu ON uu.id = p.updated_by`;

const stripEditorAttrs = (html) => String(html || "").replace(/\s(data-eid|contenteditable|spellcheck)="[^"]*"/g, "").replace(/\s?\bcm-(hover|sel)\b/g, "");
const fileSafe = (s) => String(s || "presentation").replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "presentation";

module.exports = function presentationRoutes(db) {
  const r = express.Router();
  r.use(A.requireAuth);

  const getP = db.prepare(`SELECT p.*, c.name AS company_name ${FROM.replace("FROM presentations p", "FROM presentations p")} WHERE p.id = ?`);
  function load(req, res, need) {
    const p = getP.get(Number(req.params.id));
    const ok = p && (A.can(req.user, "presentations:all") || (req.user.role === "client" && p.company_id === req.user.company_id && p.status === "published"));
    if (!ok) { res.status(404).json({ error: "Presentation not found." }); return null; }
    if (need && !A.can(req.user, need)) { res.status(403).json({ error: "You don't have permission to do that." }); return null; }
    return p;
  }
  function companyFor(body, fallbackName) {
    if (body.company_id) {
      const c = db.prepare("SELECT id FROM companies WHERE id = ?").get(Number(body.company_id));
      if (c) return c.id;
    }
    const name = String(body.company_name || fallbackName || "").trim().slice(0, 160);
    if (!name) return null;
    const c = db.prepare("SELECT id FROM companies WHERE name = ?").get(name);
    return c ? c.id : db.prepare("INSERT INTO companies (name) VALUES (?)").run(name).lastInsertRowid;
  }
  function snapshot(id, userId, note) {
    const p = db.prepare("SELECT * FROM presentations WHERE id = ?").get(id);
    db.prepare("INSERT INTO presentation_versions (presentation_id, title, meta, sections_html, custom_css, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, p.title, p.meta, p.sections_html, p.custom_css, String(note || "").slice(0, 200), userId);
    db.prepare(`DELETE FROM presentation_versions WHERE presentation_id = ? AND id NOT IN
      (SELECT id FROM presentation_versions WHERE presentation_id = ? ORDER BY id DESC LIMIT ?)`).run(id, id, MAX_VERSIONS);
  }
  function create(user, f) {
    const info = db.prepare(`INSERT INTO presentations (title, company_id, status, meta, sections_html, custom_css, custom_js, source_name, source_type, source_blob, created_by, updated_by)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(String(f.title || "Untitled presentation").slice(0, 200), f.company_id || null, f.meta || "", f.sections_html,
      f.custom_css || "", f.custom_js || "", f.source_name || null, f.source_type || "blank", f.source_blob || null, user.id, user.id);
    snapshot(info.lastInsertRowid, user.id, "Created" + (f.source_type === "xlsx" ? " from Excel" : f.source_type === "html" ? " from HTML import" : ""));
    return info.lastInsertRowid;
  }
  const ctx = (companyName) => { const t = getTheme(db).theme; return { company: companyName || "", website: t.website, tagline: t.tagline }; };
  const companyName = (id) => (id ? (db.prepare("SELECT name FROM companies WHERE id = ?").get(id) || {}).name : "") || "";

  /* ----- list ----- */
  r.get("/", (req, res) => {
    let rows;
    if (A.can(req.user, "presentations:all")) {
      rows = req.query.company_id ? db.prepare(`SELECT ${LIST_COLS} ${FROM} WHERE p.company_id = ? ORDER BY p.updated_at DESC`).all(Number(req.query.company_id))
        : db.prepare(`SELECT ${LIST_COLS} ${FROM} ORDER BY p.updated_at DESC`).all();
    } else {
      rows = db.prepare(`SELECT ${LIST_COLS} ${FROM} WHERE p.company_id = ? AND p.status = 'published' ORDER BY p.updated_at DESC`).all(req.user.company_id || -1);
    }
    res.json({ presentations: rows });
  });

  /* ----- create ----- */
  r.post("/from-excel", A.requireCap("presentations:edit"), upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Choose an Excel file (.xlsx) to upload." });
    if (!/\.xlsx$/i.test(req.file.originalname)) return res.status(400).json({ error: "Only .xlsx workbooks are supported. In Excel, use File › Save As › Excel Workbook." });
    const fallbackTitle = req.file.originalname.replace(/\.xlsx$/i, "");
    const parsed = await parseWorkbook(req.file.buffer, { fallbackTitle });
    const company_id = companyFor(req.body, parsed.deck.company);
    const cname = companyName(company_id);
    const title = String(req.body.title || "").trim() || parsed.deck.title || fallbackTitle;
    const meta = parsed.deck.meta || ["CMAC Partners", cname].filter(Boolean).join(" · ");
    const id = create(req.user, { title, company_id, meta, sections_html: B.renderSlides(parsed.slides, ctx(cname)), source_name: req.file.originalname, source_type: "xlsx", source_blob: req.file.buffer });
    res.status(201).json({ id, warnings: parsed.warnings, slides: parsed.slides.length });
  });

  r.post("/import-html", A.requireCap("presentations:edit"), upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Choose an HTML deck to import." });
    const d = parseDeckHtml(req.file.buffer.toString("utf8"));
    const company_id = companyFor(req.body);
    const id = create(req.user, { title: String(req.body.title || "").trim() || d.title || req.file.originalname.replace(/\.html?$/i, ""), company_id, meta: d.meta,
      sections_html: d.sectionsHtml, custom_css: d.customCss, custom_js: d.customJs, source_name: req.file.originalname, source_type: "html", source_blob: req.file.buffer });
    res.status(201).json({ id });
  });

  r.post("/", A.requireCap("presentations:edit"), (req, res) => {
    const company_id = companyFor(req.body);
    const cname = companyName(company_id);
    const sections = ["cover", "text", "close"].map((k) => B.sampleSlide(k, ctx(cname))).join("\n\n");
    const id = create(req.user, { title: String(req.body.title || "").trim() || "Untitled presentation", company_id, meta: ["CMAC Partners", cname].filter(Boolean).join(" · "), sections_html: sections });
    res.status(201).json({ id });
  });

  /* Slides from a workbook, returned as markup for the editor to insert (nothing saved) */
  r.post("/excel-slides", A.requireCap("presentations:edit"), upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Choose an Excel file (.xlsx) to upload." });
    const parsed = await parseWorkbook(req.file.buffer, { fallbackTitle: req.file.originalname.replace(/\.xlsx$/i, "") });
    res.json({ sections_html: B.renderSlides(parsed.slides, ctx(companyName(Number(req.body.company_id)))), warnings: parsed.warnings, slides: parsed.slides.length });
  });

  r.get("/excel-template", A.requireCap("presentations:edit"), async (_req, res) => {
    res.set("Content-Disposition", 'attachment; filename="CMAC-presentation-template.xlsx"');
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(await templateWorkbook());
  });

  /* ----- read / update / delete ----- */
  r.get("/:id", (req, res) => {
    const p = load(req, res);
    if (!p) return;
    const out = { id: p.id, title: p.title, company_id: p.company_id, company_name: p.company_name, status: p.status, meta: p.meta,
      source_type: p.source_type, source_name: p.source_name, created_at: p.created_at, updated_at: p.updated_at };
    if (A.can(req.user, "presentations:edit")) Object.assign(out, { sections_html: p.sections_html, custom_css: p.custom_css, custom_js: p.custom_js });
    res.json({ presentation: out, theme: req.user.role === "client" ? undefined : getTheme(db).theme });
  });

  r.put("/:id", A.requireCap("presentations:edit"), (req, res) => {
    const p = load(req, res);
    if (!p) return;
    const b = req.body || {};
    if (b.expected_updated_at && b.expected_updated_at !== p.updated_at && !b.force)
      return res.status(409).json({ error: "Someone else saved this presentation since you opened it.", code: "CONFLICT", updated_at: p.updated_at, updated_by: p.updated_by });
    const next = {
      title: b.title != null ? String(b.title).trim().slice(0, 200) || p.title : p.title,
      company_id: b.company_id !== undefined ? (b.company_id ? Number(b.company_id) : null) : p.company_id,
      status: b.status === "published" || b.status === "draft" ? b.status : p.status,
      meta: b.meta != null ? String(b.meta).slice(0, 300) : p.meta,
      sections_html: b.sections_html != null ? stripEditorAttrs(b.sections_html) : p.sections_html,
      custom_css: b.custom_css != null ? String(b.custom_css) : p.custom_css,
      custom_js: b.custom_js != null ? String(b.custom_js) : p.custom_js
    };
    if (b.sections_html != null && !/<section\b/i.test(next.sections_html)) return res.status(400).json({ error: "A presentation needs at least one slide." });
    db.prepare(`UPDATE presentations SET title = ?, company_id = ?, status = ?, meta = ?, sections_html = ?, custom_css = ?, custom_js = ?, updated_by = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?`)
      .run(next.title, next.company_id, next.status, next.meta, next.sections_html, next.custom_css, next.custom_js, req.user.id, p.id);
    if (b.sections_html != null || b.custom_css != null) snapshot(p.id, req.user.id, b.note || "Saved");
    res.json({ ok: true, updated_at: db.prepare("SELECT updated_at FROM presentations WHERE id = ?").get(p.id).updated_at });
  });

  r.delete("/:id", A.requireCap("presentations:delete"), (req, res) => {
    const p = load(req, res);
    if (!p) return;
    db.prepare("DELETE FROM presentations WHERE id = ?").run(p.id);
    res.json({ ok: true });
  });

  r.post("/:id/duplicate", A.requireCap("presentations:edit"), (req, res) => {
    const p = load(req, res);
    if (!p) return;
    const id = create(req.user, { title: p.title + " (copy)", company_id: p.company_id, meta: p.meta, sections_html: p.sections_html, custom_css: p.custom_css, custom_js: p.custom_js,
      source_name: p.source_name, source_type: p.source_type, source_blob: p.source_blob });
    res.status(201).json({ id });
  });

  /* ----- versions ----- */
  r.get("/:id/versions", A.requireCap("presentations:edit"), (req, res) => {
    const p = load(req, res);
    if (!p) return;
    res.json({ versions: db.prepare(`SELECT v.id, v.title, v.note, v.created_at, u.name AS created_by_name,
      (length(v.sections_html) - length(replace(v.sections_html, '<section', ''))) / 8 AS slide_count
      FROM presentation_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.presentation_id = ? ORDER BY v.id DESC`).all(p.id) });
  });

  r.post("/:id/versions/:vid/restore", A.requireCap("presentations:edit"), (req, res) => {
    const p = load(req, res);
    if (!p) return;
    const v = db.prepare("SELECT * FROM presentation_versions WHERE id = ? AND presentation_id = ?").get(Number(req.params.vid), p.id);
    if (!v) return res.status(404).json({ error: "Version not found." });
    db.prepare("UPDATE presentations SET title = ?, meta = ?, sections_html = ?, custom_css = ?, updated_by = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?")
      .run(v.title, v.meta, v.sections_html, v.custom_css, req.user.id, p.id);
    snapshot(p.id, req.user.id, "Restored version from " + v.created_at);
    res.json({ ok: true });
  });

  /* ----- output ----- */
  r.get("/:id/render", (req, res) => {
    const p = load(req, res);
    if (!p) return;
    sendSandboxed(res, renderView(p, getTheme(db).theme));
  });

  r.get("/:id/download", A.requireCap("presentations:download"), (req, res) => {
    const p = load(req, res);
    if (!p) return;
    res.set("Content-Disposition", `attachment; filename="${fileSafe(p.title)}.html"`);
    res.type("html").send(renderExport(p, getTheme(db).theme));
  });

  r.get("/:id/source", A.requireCap("presentations:download"), (req, res) => {
    const p = load(req, res);
    if (!p) return;
    if (!p.source_blob) return res.status(404).json({ error: "This presentation has no uploaded source file." });
    res.set("Content-Disposition", `attachment; filename="${fileSafe(p.source_name || p.title)}"`);
    res.type(p.source_type === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/octet-stream").send(p.source_blob);
  });

  return r;
};
