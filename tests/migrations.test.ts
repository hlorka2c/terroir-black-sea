import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { journalInput } from '../src/lib/content';
import { migrate } from '../src/lib/db';

/** A journal table as it was created before links existed, with one real row. */
function legacyDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE journal (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL);
    INSERT INTO journal (kind, title) VALUES ('film', 'Земля формирует');
  `);
  return database;
}

const columns = (database: DatabaseSync) =>
  (database.prepare('PRAGMA table_info(journal)').all() as { name: string }[]).map((column) => column.name);
const version = (database: DatabaseSync) =>
  (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

describe('migrations', () => {
  it('upgrades an existing database without losing rows', () => {
    const database = legacyDatabase();
    migrate(database);

    expect(columns(database)).toContain('url');
    expect(version(database)).toBeGreaterThanOrEqual(1);
    expect(database.prepare('SELECT title, url FROM journal').get()).toEqual({ title: 'Земля формирует', url: '' });
  });

  it('is safe to run on every start', () => {
    const database = legacyDatabase();
    migrate(database);
    expect(() => migrate(database)).not.toThrow();
  });
});

describe('journal link', () => {
  const item = { kind: 'film', title: 'Фильм', description: '', duration: '', imageAlt: '', sort: '1' };

  it('is optional', () => {
    expect(journalInput.parse({ ...item, url: '' }).url).toBe('');
    expect(journalInput.parse(item).url).toBe('');
  });

  it('accepts http(s) links only', () => {
    expect(journalInput.parse({ ...item, url: 'https://youtu.be/abc' }).url).toBe('https://youtu.be/abc');
    expect(journalInput.safeParse({ ...item, url: 'javascript:alert(1)' }).success).toBe(false);
  });
});
