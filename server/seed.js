"use strict";
/* First-run setup: the first admin account, the main theme, and demo content. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const A = require("./auth");
const B = require("../public/deck/builder.js");
const { saveTheme } = require("./routes/theme");
const { parseWorkbook, templateWorkbook } = require("./excel");
const { parseDeckHtml } = require("./importHtml");

async function seed(db, { log = console.log, demo = process.env.SEED_DEMO !== "0" } = {}) {
  if (!db.prepare("SELECT 1 FROM themes WHERE id = 1").get()) saveTheme(db, B.DEFAULT_THEME, null);
  if (db.prepare("SELECT COUNT(*) n FROM users").get().n > 0) return null;

  const email = A.normEmail(process.env.ADMIN_EMAIL || "admin@cmac.local");
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const adminId = db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')")
    .run(email, process.env.ADMIN_NAME || "Administrator", A.hashPassword(password)).lastInsertRowid;
  log("\n  ┌─ First admin account created ─────────────────────────────");
  log("  │  email:    " + email);
  log("  │  password: " + (generated ? password + "   (generated, change it after signing in)" : "(from ADMIN_PASSWORD)"));
  log("  └───────────────────────────────────────────────────────────\n");

  if (demo) {
    const company = db.prepare("INSERT INTO companies (name) VALUES ('Walla Walla Clinic')").run().lastInsertRowid;
    const insert = db.prepare(`INSERT INTO presentations (title, company_id, status, meta, sections_html, custom_css, custom_js, source_name, source_type, source_blob, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const version = db.prepare("INSERT INTO presentation_versions (presentation_id, title, meta, sections_html, custom_css, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const seedFile = path.join(__dirname, "..", "seed", "walla-walla.html");
    if (fs.existsSync(seedFile)) {
      const buf = fs.readFileSync(seedFile);
      const d = parseDeckHtml(buf.toString("utf8"));
      const id = insert.run(d.title || "Walla Walla Clinic · Bank Proposals", company, "published", d.meta, d.sectionsHtml, d.customCss, d.customJs, "walla-walla.html", "html", buf, adminId, adminId).lastInsertRowid;
      version.run(id, d.title, d.meta, d.sectionsHtml, d.customCss, "Imported demo deck", adminId);
    }
    const xlsx = await templateWorkbook();
    const parsed = await parseWorkbook(xlsx);
    const t = B.DEFAULT_THEME;
    const html = B.renderSlides(parsed.slides, { company: "Walla Walla Clinic", website: t.website, tagline: t.tagline });
    const id2 = insert.run("Bank Proposals (from Excel template)", company, "draft", parsed.deck.meta, html, "", "", "CMAC-presentation-template.xlsx", "xlsx", xlsx, adminId, adminId).lastInsertRowid;
    version.run(id2, "Bank Proposals (from Excel template)", parsed.deck.meta, html, "", "Created from Excel", adminId);
    log("  Demo content: company \"Walla Walla Clinic\" with 2 presentations.\n");
  }
  return { email, password };
}

module.exports = { seed };
