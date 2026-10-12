"use strict";
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const A = require("./auth");

function createApp(db, opts = {}) {
  const app = express();
  const secureCookies = opts.secureCookies != null ? opts.secureCookies : process.env.COOKIE_SECURE === "1";
  if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "40mb" }));
  app.use(cookieParser());
  app.use(A.sessionMiddleware(db));

  /* Cross-site request guard for state-changing API calls (cookies are also SameSite=Lax) */
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin) {
      let host;
      try { host = new URL(origin).host; } catch { host = null; }
      if (host !== req.get("host")) return res.status(403).json({ error: "Cross-site request blocked." });
    }
    next();
  });

  app.use("/api/auth", require("./routes/auth")(db, { secureCookies }));
  app.use("/api/admin", require("./routes/users")(db));
  app.use("/api/companies", require("./routes/companies")(db));
  app.use("/api/theme", require("./routes/theme").themeRoutes(db));
  app.use("/api/presentations", require("./routes/presentations")(db));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  const pub = path.join(__dirname, "..", "public");
  app.use(express.static(pub, { index: "index.html", maxAge: opts.dev ? 0 : "5m" }));

  app.use((err, _req, res, _next) => {
    if (err && err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "That file is too large (30 MB maximum)." });
    if (err && err.type === "entity.too.large") return res.status(413).json({ error: "That change is too large to save (40 MB maximum)." });
    const status = (err && err.status) || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? "Something went wrong on the server." : err.message });
  });
  return app;
}

module.exports = { createApp };
