"use strict";
/* End-to-end API tests against an in-memory database: run with `npm test` */
const test = require("node:test");
const assert = require("node:assert/strict");
const { open } = require("../server/db");
const { createApp } = require("../server/app");
const { seed } = require("../server/seed");
const { templateWorkbook } = require("../server/excel");

let server, base;
const jars = {};
async function call(who, method, url, body, form) {
  const headers = {};
  if (jars[who]) headers.cookie = jars[who];
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload });
  const set = res.headers.get("set-cookie");
  if (set) jars[who] = set.split(";")[0];
  const type = res.headers.get("content-type") || "";
  return { status: res.status, body: type.includes("json") ? await res.json() : await res.text(), headers: res.headers };
}
const login = (who, email, password) => call(who, "POST", "/api/auth/login", { email, password });

test.before(async () => {
  process.env.ADMIN_EMAIL = "admin@test.local";
  process.env.ADMIN_PASSWORD = "admin-pass-1";
  const db = open(":memory:");
  await seed(db, { log: () => {} });
  server = createApp(db).listen(0);
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(() => server.close());

test("only invited emails can sign in or activate", async () => {
  assert.equal((await login("x", "stranger@x.com", "whatever12")).body.code, "NOT_INVITED");
  assert.equal((await call("x", "POST", "/api/auth/activate", { email: "stranger@x.com", name: "S", password: "whatever12" })).status, 403);
  assert.equal((await login("admin", "admin@test.local", "wrong-pass")).status, 401);
  assert.equal((await login("admin", "admin@test.local", "admin-pass-1")).status, 200);
});

test("admin invites a developer and a client; roles are enforced", async () => {
  const { body: { companies } } = await call("admin", "GET", "/api/companies");
  const walla = companies.find((c) => c.name === "Walla Walla Clinic");
  assert.equal((await call("admin", "POST", "/api/admin/invites", { email: "c@client.com", role: "client" })).status, 400, "client invite needs a company");
  const dev = await call("admin", "POST", "/api/admin/invites", { email: "dev@cmac.local", role: "developer" });
  const cli = await call("admin", "POST", "/api/admin/invites", { email: "c@client.com", role: "client", company_id: walla.id });
  assert.equal(dev.status, 201); assert.equal(cli.status, 201);

  /* invited but not activated: login points to activation */
  assert.equal((await login("dev", "dev@cmac.local", "devpass123")).body.code, "INVITE_PENDING");
  assert.equal((await call("dev", "POST", "/api/auth/activate", { token: dev.body.token, name: "Dev", password: "devpass123" })).body.user.role, "developer");
  assert.equal((await call("cli", "POST", "/api/auth/activate", { email: "c@client.com", name: "Client", password: "clientpass1" })).body.user.role, "client");
  assert.equal((await call("x", "POST", "/api/auth/activate", { token: dev.body.token, name: "Again", password: "devpass123" })).status, 404, "invite is single use");

  /* developer: presentations yes, theme and users no */
  assert.equal((await call("dev", "GET", "/api/theme")).status, 200);
  assert.equal((await call("dev", "PUT", "/api/theme", { theme: {} })).status, 403);
  assert.equal((await call("dev", "GET", "/api/admin/users")).status, 403);
  const list = (await call("dev", "GET", "/api/presentations")).body.presentations;
  assert.ok(list.length >= 2);

  /* client: only published presentations of their company, view only */
  const mine = (await call("cli", "GET", "/api/presentations")).body.presentations;
  assert.ok(mine.length >= 1 && mine.every((p) => p.status === "published" && p.company_id === walla.id));
  const draft = list.find((p) => p.status === "draft");
  assert.equal((await call("cli", "GET", "/api/presentations/" + draft.id)).status, 404);
  assert.equal((await call("cli", "GET", "/api/presentations/" + mine[0].id + "/download")).status, 403);
  assert.equal((await call("cli", "GET", "/api/theme")).status, 403);
  assert.equal((await call("cli", "PUT", "/api/presentations/" + mine[0].id, { title: "hacked" })).status, 403);
  const view = await call("cli", "GET", "/api/presentations/" + mine[0].id + "/render");
  assert.equal(view.status, 200);
  assert.match(view.headers.get("content-security-policy"), /sandbox allow-scripts/);
  assert.equal((await call("cli", "GET", "/api/presentations/" + mine[0].id)).body.presentation.sections_html, undefined, "clients don't get the source");
});

test("Excel upload builds slides; save, versions and export work", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([await templateWorkbook()]), "deck.xlsx");
  fd.append("company_name", "Acme Health");
  const r = await call("dev", "POST", "/api/presentations/from-excel", undefined, fd);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.slides, 11);
  const p = (await call("dev", "GET", "/api/presentations/" + r.body.id)).body.presentation;
  assert.equal(p.company_name, "Acme Health");
  assert.equal((p.sections_html.match(/<section/g) || []).length, 11);
  assert.match(p.sections_html, /class="dt"/); assert.match(p.sections_html, /cm-chart/);

  const edited = p.sections_html.replace("Confidential.", "Strictly confidential.").replace("<h2>", '<h2 data-eid="e9" style="color:var(--amber-3)">');
  const s = await call("dev", "PUT", "/api/presentations/" + p.id, { sections_html: edited, expected_updated_at: p.updated_at });
  assert.equal(s.status, 200);
  const after = (await call("dev", "GET", "/api/presentations/" + p.id)).body.presentation;
  assert.match(after.sections_html, /Strictly confidential/);
  assert.doesNotMatch(after.sections_html, /data-eid/, "editor ids are stripped");
  assert.equal((await call("dev", "PUT", "/api/presentations/" + p.id, { sections_html: edited, expected_updated_at: p.updated_at })).status, 409, "stale save conflicts");

  const versions = (await call("dev", "GET", `/api/presentations/${p.id}/versions`)).body.versions;
  assert.equal(versions.length, 2);
  await call("dev", "POST", `/api/presentations/${p.id}/versions/${versions[1].id}/restore`);
  assert.match((await call("dev", "GET", "/api/presentations/" + p.id)).body.presentation.sections_html, /<h2>Confidential\./);

  const dl = await call("dev", "GET", `/api/presentations/${p.id}/download`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get("content-disposition"), /attachment/);
  assert.doesNotMatch(dl.body, /<link rel="stylesheet" href="\/deck/, "export is self-contained");
  assert.match(dl.body, /var CMAC=/);
});

test("theme: admin saves, CSS reflects tokens, bad input rejected", async () => {
  const { body } = await call("admin", "GET", "/api/theme");
  const t = body.theme;
  t.colors.deep = "#123456"; t.fonts.serif = "Playfair Display"; t.type.h2 = 72;
  assert.equal((await call("admin", "PUT", "/api/theme", { theme: t })).status, 200);
  const all = (await call("admin", "GET", "/api/presentations")).body.presentations;
  const html = (await call("admin", "GET", "/api/presentations/" + all[0].id + "/render")).body;
  assert.match(html, /--deep:#123456/);
  assert.match(html, /fonts.googleapis.com\/css2\?family=Playfair\+Display/);
  assert.match(html, /h2\{font-size:72px\}/);
  t.colors.deep = "red;}</style><script>alert(1)</script>";
  assert.equal((await call("admin", "PUT", "/api/theme", { theme: t })).status, 400);
  assert.equal((await call("admin", "POST", "/api/theme/reset")).status, 200);
});

test("HTML deck import keeps slides and slide script", async () => {
  const fs = require("fs");
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(__dirname + "/../seed/walla-walla.html")]), "deck.html");
  const r = await call("admin", "POST", "/api/presentations/import-html", undefined, fd);
  assert.equal(r.status, 201);
  const p = (await call("admin", "GET", "/api/presentations/" + r.body.id)).body.presentation;
  assert.equal((p.sections_html.match(/<section/g) || []).length, 14);
  assert.match(p.custom_js, /SLIDE CODE/);
  assert.doesNotMatch(p.custom_js, /CMAC LIBRARY/);
});

test("cross-site writes are blocked", async () => {
  const res = await fetch(base + "/api/presentations", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", cookie: jars.admin }, body: "{}" });
  assert.equal(res.status, 403);
});
