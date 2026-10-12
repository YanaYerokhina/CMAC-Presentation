"use strict";
const express = require("express");
const A = require("../auth");

module.exports = function authRoutes(db, { secureCookies }) {
  const r = express.Router();
  const limiter = A.rateLimit({ max: 25 });

  const pendingInvite = db.prepare(`SELECT i.*, c.name AS company_name FROM invites i LEFT JOIN companies c ON c.id = i.company_id
    WHERE i.email = ? AND i.accepted_at IS NULL AND i.expires_at > ? ORDER BY i.id DESC LIMIT 1`);
  const inviteByToken = db.prepare(`SELECT i.*, c.name AS company_name FROM invites i LEFT JOIN companies c ON c.id = i.company_id
    WHERE i.token = ? AND i.accepted_at IS NULL AND i.expires_at > ?`);
  const userByEmail = db.prepare("SELECT * FROM users WHERE email = ?");

  r.get("/me", (req, res) => res.json({ user: A.publicUser(req.user) }));

  /* Sign in. Accounts exist only for invited people, so an unknown email is told to ask for an invite,
   * and an invited email without an account is sent to the activation step. */
  r.post("/login", limiter, (req, res) => {
    const email = A.normEmail(req.body.email), password = String(req.body.password || "");
    if (!A.validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const u = userByEmail.get(email);
    if (!u) {
      const inv = pendingInvite.get(email, new Date().toISOString());
      const as = inv && { admin: "an admin", developer: "a team member", client: "a client" }[inv.role];
      if (inv) return res.status(409).json({ error: "You've been invited as " + as + ". Set your name and a password to activate your account.", code: "INVITE_PENDING", role: inv.role });
      return res.status(403).json({ error: "This email hasn't been invited. Ask an administrator for an invitation.", code: "NOT_INVITED" });
    }
    if (!A.checkPassword(password, u.password_hash)) return res.status(401).json({ error: "Email or password is incorrect." });
    if (!u.active) return res.status(403).json({ error: "This account has been deactivated. Contact an administrator." });
    A.createSession(db, res, u.id, secureCookies);
    res.json({ user: A.publicUser(Object.assign(u, { company_name: u.company_id ? (db.prepare("SELECT name FROM companies WHERE id = ?").get(u.company_id) || {}).name : null })) });
  });

  r.post("/logout", (req, res) => { A.destroySession(db, req, res); res.json({ ok: true }); });

  /* Look up an invite link before activation */
  r.get("/invite/:token", limiter, (req, res) => {
    const inv = inviteByToken.get(String(req.params.token), new Date().toISOString());
    if (!inv) return res.status(404).json({ error: "This invitation link is invalid, already used, or expired." });
    res.json({ email: inv.email, role: inv.role, company_name: inv.company_name });
  });

  /* Activate an invitation: by token (invite link) or by email (an invited email signing up). */
  r.post("/activate", limiter, (req, res) => {
    const now = new Date().toISOString();
    let inv = null;
    if (req.body.token) inv = inviteByToken.get(String(req.body.token), now);
    else {
      const email = A.normEmail(req.body.email);
      if (!A.validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
      inv = pendingInvite.get(email, now);
      if (!inv) return res.status(403).json({ error: "There's no open invitation for this email. Ask an administrator to invite you.", code: "NOT_INVITED" });
    }
    if (!inv) return res.status(404).json({ error: "This invitation link is invalid, already used, or expired." });
    if (userByEmail.get(inv.email)) return res.status(409).json({ error: "An account already exists for this email. Sign in instead." });
    const password = String(req.body.password || ""), name = String(req.body.name || "").trim().slice(0, 120);
    if (!A.validPassword(password)) return res.status(400).json({ error: "Choose a password of at least 8 characters." });
    if (!name) return res.status(400).json({ error: "Enter your name." });
    const tx = db.transaction(() => {
      const info = db.prepare("INSERT INTO users (email, name, password_hash, role, company_id) VALUES (?, ?, ?, ?, ?)")
        .run(inv.email, name, A.hashPassword(password), inv.role, inv.role === "client" ? inv.company_id : null);
      db.prepare("UPDATE invites SET accepted_at = datetime('now') WHERE email = ? AND accepted_at IS NULL").run(inv.email);
      return info.lastInsertRowid;
    });
    const id = tx();
    A.createSession(db, res, id, secureCookies);
    const u = db.prepare("SELECT u.*, c.name AS company_name FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = ?").get(id);
    res.json({ user: A.publicUser(u) });
  });

  r.post("/password", A.requireAuth, limiter, (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!A.checkPassword(String(req.body.current || ""), u.password_hash)) return res.status(400).json({ error: "Your current password is incorrect." });
    if (!A.validPassword(req.body.password)) return res.status(400).json({ error: "Choose a password of at least 8 characters." });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(A.hashPassword(req.body.password), u.id);
    res.json({ ok: true });
  });

  return r;
};
