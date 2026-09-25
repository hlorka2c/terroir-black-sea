import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  widths TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS terroirs (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_id TEXT REFERENCES media(id),
  image_alt TEXT NOT NULL DEFAULT '',
  polygon TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER,
  style TEXT NOT NULL DEFAULT '',
  terroir_id INTEGER NOT NULL REFERENCES terroirs(id) ON DELETE RESTRICT,
  image_id TEXT REFERENCES media(id),
  image_position TEXT NOT NULL DEFAULT 'center',
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('film', 'research', 'interview')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  image_id TEXT REFERENCES media(id),
  image_alt TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
`;

let instance: DatabaseSync | undefined;

export function db(): DatabaseSync {
  if (!instance) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
    instance = new DatabaseSync(path.join(DATA_DIR, 'site.db'));
    instance.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    instance.exec(SCHEMA);
  }
  return instance;
}

export function transaction<T>(fn: () => T): T {
  db().exec('BEGIN');
  try {
    const result = fn();
    db().exec('COMMIT');
    return result;
  } catch (error) {
    db().exec('ROLLBACK');
    throw error;
  }
}
