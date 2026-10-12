"use strict";
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const COOKIE = "cmac_session";
const SESSION_DAYS = 14;
const ROLES = ["admin", "developer", "client"];

/* What each role may do. Routes check capabilities, never role names directly. */
const CAPS = {
  admin: ["theme:edit", "users:manage", "companies:manage", "companies:delete", "presentations:all", "presentations:edit", "presentations:delete", "presentations:download"],
  developer: ["companies:manage", "presentations:all", "presentations:edit", "presentations:delete", "presentations:download"],
  client: []
};
const can = (user, cap) => !!user && (CAPS[user.role] || []).includes(cap);

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
const hashPassword = (pw) => bcrypt.hashSync(pw, 11);
const checkPassword = (pw, hash) => { try { return bcrypt.compareSync(pw, hash); } catch { return false; } };

function validPassword(pw) {
  return typeof pw === "string" && pw.length >= 8 && pw.length <= 200;
}
function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}
function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, company_id: u.company_id, company_name: u.company_name || null,
    active: !!u.active, created_at: u.created_at, last_login_at: u.last_login_at, caps: CAPS[u.role] || [] };
}

function createSession(db, res, userId, secure) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires.toISOString());
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: !!secure, expires, path: "/" });
}

function destroySession(db, req, res) {
  const t = req.cookies && req.cookies[COOKIE];
  if (t) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(t));
  res.clearCookie(COOKIE, { path: "/" });
}

/* Attaches req.user when the session cookie is valid. */
function sessionMiddleware(db) {
  const find = db.prepare(`SELECT u.*, c.name AS company_name FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN companies c ON c.id = u.company_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`);
  let lastSweep = 0;
  return (req, _res, next) => {
    if (Date.now() - lastSweep > 36e5) { lastSweep = Date.now(); db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString()); }
    const t = req.cookies && req.cookies[COOKIE];
    req.user = t ? find.get(sha256(t), new Date().toISOString()) || null : null;
    next();
  };
}

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Please sign in." }));
const requireCap = (cap) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  if (!can(req.user, cap)) return res.status(403).json({ error: "You don't have permission to do that." });
  next();
};

/* Simple in-memory brute force guard for the login and activation endpoints */
function rateLimit({ windowMs = 15 * 60e3, max = 20 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip + "|" + req.path;
    const now = Date.now();
    const h = (hits.get(key) || []).filter((t) => now - t < windowMs);
    h.push(now);
    hits.set(key, h);
    if (hits.size > 5000) hits.clear();
    if (h.length > max) return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    next();
  };
}

module.exports = {
  COOKIE, ROLES, CAPS, can, sha256, newToken, hashPassword, checkPassword, validPassword, validEmail, normEmail, publicUser,
  createSession, destroySession, sessionMiddleware, requireAuth, requireCap, rateLimit
};
