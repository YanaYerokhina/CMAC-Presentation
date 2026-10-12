-- CMAC Presentation Studio · SQL schema (SQLite dialect; plain SQL that ports to Postgres/MySQL with type tweaks)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'developer', 'client')),
  company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- Only invited email addresses can create an account. The invite decides the role (and company for clients).
CREATE TABLE IF NOT EXISTS invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL COLLATE NOCASE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'developer', 'client')),
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  invited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  accepted_at TEXT
);
CREATE INDEX IF NOT EXISTS invites_email ON invites(email);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

-- The main presentation theme (id = 1). tokens_json holds colors, fonts, type scale, logos, custom CSS.
CREATE TABLE IF NOT EXISTS themes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  tokens_json TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS presentations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  company_id      INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  meta            TEXT NOT NULL DEFAULT '',          -- footer line on every slide
  sections_html   TEXT NOT NULL DEFAULT '',          -- the <section class="slide"> markup
  custom_css      TEXT NOT NULL DEFAULT '',
  custom_js       TEXT NOT NULL DEFAULT '',          -- only set for imported interactive decks
  source_name     TEXT,
  source_type     TEXT,                              -- 'xlsx' | 'html' | 'blank'
  source_blob     BLOB,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS presentations_company ON presentations(company_id);

CREATE TABLE IF NOT EXISTS presentation_versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  presentation_id INTEGER NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  meta            TEXT NOT NULL DEFAULT '',
  sections_html   TEXT NOT NULL,
  custom_css      TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS versions_presentation ON presentation_versions(presentation_id, id);
