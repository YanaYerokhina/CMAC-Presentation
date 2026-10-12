"use strict";
const express = require("express");
const A = require("../auth");

/* Admin only: people and invitations */
module.exports = function userRoutes(db) {
  const r = express.Router();
  r.use(A.requireCap("users:manage"));

  r.get("/users", (_req, res) => {
    const users = db.prepare("SELECT u.*, c.name AS company_name FROM users u LEFT JOIN companies c ON c.id = u.company_id ORDER BY u.role, u.name").all();
    res.json({ users: users.map(A.publicUser) });
  });

  r.patch("/users/:id", (req, res) => {
    const id = Number(req.params.id);
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!u) return res.status(404).json({ error: "User not found." });
    const role = req.body.role != null ? String(req.body.role) : u.role;
    if (!A.ROLES.includes(role)) return res.status(400).json({ error: "Unknown role." });
    let company = req.body.company_id !== undefined ? (req.body.company_id ? Number(req.body.company_id) : null) : u.company_id;
    if (role === "client" && !company) return res.status(400).json({ error: "Clients must belong to a company." });
    if (role !== "client") company = null;
    const active = req.body.active != null ? (req.body.active ? 1 : 0) : u.active;
    if (id === req.user.id && (role !== "admin" || !active)) return res.status(400).json({ error: "You can't remove your own admin access." });
    if (u.role === "admin" && (role !== "admin" || !active)) {
      const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1").get().n;
      if (admins <= 1) return res.status(400).json({ error: "There must be at least one active admin." });
    }
    const name = req.body.name != null ? String(req.body.name).trim().slice(0, 120) : u.name;
    db.prepare("UPDATE users SET role = ?, company_id = ?, active = ?, name = ? WHERE id = ?").run(role, company, active, name, id);
    if (!active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    res.json({ ok: true });
  });

  r.delete("/users/:id", (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: "You can't delete your own account." });
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!u) return res.status(404).json({ error: "User not found." });
    if (u.role === "admin" && db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1").get().n <= 1)
      return res.status(400).json({ error: "There must be at least one active admin." });
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  r.get("/invites", (_req, res) => {
    const rows = db.prepare(`SELECT i.id, i.email, i.role, i.company_id, c.name AS company_name, i.token, i.created_at, i.expires_at, i.accepted_at, u.name AS invited_by_name
      FROM invites i LEFT JOIN companies c ON c.id = i.company_id LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.accepted_at IS NULL ORDER BY i.id DESC`).all();
    const now = new Date().toISOString();
    res.json({ invites: rows.map((i) => Object.assign(i, { expired: i.expires_at <= now })) });
  });

  r.post("/invites", (req, res) => {
    const email = A.normEmail(req.body.email), role = String(req.body.role || "");
    if (!A.validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!A.ROLES.includes(role)) return res.status(400).json({ error: "Choose a role." });
    const company = req.body.company_id ? Number(req.body.company_id) : null;
    if (role === "client" && !company) return res.status(400).json({ error: "Choose the client's company." });
    if (company && !db.prepare("SELECT 1 FROM companies WHERE id = ?").get(company)) return res.status(400).json({ error: "Company not found." });
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return res.status(409).json({ error: "This person already has an account." });
    const days = Math.min(90, Math.max(1, Number(req.body.days) || 14));
    const token = A.newToken();
    db.prepare("UPDATE invites SET expires_at = datetime('now') WHERE email = ? AND accepted_at IS NULL").run(email); /* newest invite wins */
    const info = db.prepare("INSERT INTO invites (email, role, company_id, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(email, role, role === "client" ? company : null, token, req.user.id, new Date(Date.now() + days * 864e5).toISOString());
    res.status(201).json({ id: info.lastInsertRowid, token });
  });

  r.delete("/invites/:id", (req, res) => {
    db.prepare("DELETE FROM invites WHERE id = ? AND accepted_at IS NULL").run(Number(req.params.id));
    res.json({ ok: true });
  });

  return r;
};
