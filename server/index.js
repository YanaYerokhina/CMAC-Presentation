"use strict";
const { open, DB_PATH } = require("./db");
const { createApp } = require("./app");
const { seed } = require("./seed");

(async () => {
  const db = open();
  await seed(db);
  const port = Number(process.env.PORT) || 3000;
  createApp(db, { dev: process.env.NODE_ENV === "development" }).listen(port, () => {
    console.log(`CMAC Presentation Studio running at http://localhost:${port}  (database: ${DB_PATH})`);
  });
})().catch((e) => { console.error(e); process.exit(1); });
