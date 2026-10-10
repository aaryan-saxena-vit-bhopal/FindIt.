'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'findit.db');
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  verified      INTEGER NOT NULL DEFAULT 0,
  code_hash     TEXT,
  code_expires  INTEGER NOT NULL DEFAULT 0,
  code_attempts INTEGER NOT NULL DEFAULT 0,
  code_sent_at  INTEGER NOT NULL DEFAULT 0,
  reset_hash     TEXT,
  reset_expires  INTEGER NOT NULL DEFAULT 0,
  reset_attempts INTEGER NOT NULL DEFAULT 0,
  reset_sent_at  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  type               TEXT NOT NULL CHECK (type IN ('lost','found')),
  name               TEXT NOT NULL,
  category           TEXT NOT NULL,
  is_custom_category INTEGER NOT NULL DEFAULT 0,
  date               TEXT NOT NULL,
  location           TEXT NOT NULL,
  contact_info       TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_type_status ON items(type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('verified')) {
  // Database created before email verification existed: keep those accounts usable.
  db.exec(`
    ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN code_hash TEXT;
    ALTER TABLE users ADD COLUMN code_expires INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN code_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN code_sent_at INTEGER NOT NULL DEFAULT 0;
  `);
}

const hasReset = db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'reset_hash');
if (!hasReset) {
  // Database created before password reset existed.
  db.exec(`
    ALTER TABLE users ADD COLUMN reset_hash TEXT;
    ALTER TABLE users ADD COLUMN reset_expires INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN reset_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN reset_sent_at INTEGER NOT NULL DEFAULT 0;
  `);
}

module.exports = db;
