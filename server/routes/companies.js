"use strict";
const express = require("express");
const A = require("../auth");

module.exports = function companyRoutes(db) {
  const r = express.Router();

  r.get("/", A.requireAuth, (req, res) => {
    if (req.user.role === "client") {
      return res.json({ companies: db.prepare("SELECT id, name FROM companies WHERE id = ?").all(req.user.company_id) });
    }
    const rows = db.prepare(`SELECT c.id, c.name, c.created_at,
        (SELECT COUNT(*) FROM presentations p WHERE p.company_id = c.id) AS presentations,
        (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS clients
      FROM companies c ORDER BY c.name`).all();
    res.json({ companies: rows });
  });

  r.post("/", A.requireCap("companies:manage"), (req, res) => {
    const name = String(req.body.name || "").trim().slice(0, 160);
    if (!name) return res.status(400).json({ error: "Enter a company name." });
    const existing = db.prepare("SELECT id, name FROM companies WHERE name = ?").get(name);
    if (existing) return res.json({ company: existing });
    const info = db.prepare("INSERT INTO companies (name) VALUES (?)").run(name);
    res.status(201).json({ company: { id: info.lastInsertRowid, name } });
  });

  r.patch("/:id", A.requireCap("companies:manage"), (req, res) => {
    const name = String(req.body.name || "").trim().slice(0, 160);
    if (!name) return res.status(400).json({ error: "Enter a company name." });
    try { db.prepare("UPDATE companies SET name = ? WHERE id = ?").run(name, Number(req.params.id)); }
    catch { return res.status(409).json({ error: "Another company already has that name." }); }
    res.json({ ok: true });
  });

  r.delete("/:id", A.requireCap("companies:delete"), (req, res) => {
    const id = Number(req.params.id);
    const users = db.prepare("SELECT COUNT(*) n FROM users WHERE company_id = ?").get(id).n;
    if (users) return res.status(400).json({ error: "Move or remove this company's client accounts first." });
    db.prepare("DELETE FROM companies WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  return r;
};
