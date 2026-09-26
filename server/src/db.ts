import { DatabaseSync } from "node:sqlite";
import { config, ensureDirs } from "./config.js";

// node:sqlite (Node 22.13+): no native module to compile, one file on disk.
// Every table stores JSON documents where the shape is the shared schema's.

export type Row = Record<string, unknown>;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  ensureDirs();
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function openMemoryDb(): DatabaseSync {
  db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function migrate(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      pass_hash TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      openai_key_enc TEXT,
      openai_model TEXT,
      openai_image_model TEXT,
      app_theme TEXT,
      default_theme TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      doc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS decks_user ON decks(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id TEXT REFERENCES decks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rel_path TEXT,
      kind TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      chars INTEGER NOT NULL,
      text TEXT NOT NULL,
      media_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sources_deck ON sources(deck_id);
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id TEXT,
      name TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS media_deck ON media(deck_id);
    CREATE TABLE IF NOT EXISTS designs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      theme TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      analysis TEXT NOT NULL DEFAULT '{}',
      preview_media_id TEXT,
      source_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS designs_user ON designs(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS prompts_user ON prompts(user_id, name);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      deck_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      progress TEXT NOT NULL,
      error TEXT,
      result TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  // Columns added after the first release. SQLite has no ADD COLUMN IF NOT EXISTS.
  const cols = (d.prepare("PRAGMA table_info(settings)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("openai_base")) d.exec("ALTER TABLE settings ADD COLUMN openai_base TEXT");
  for (const c of ["ms_client_id", "ms_refresh_enc", "ms_account", "ms_folder", "od_provider", "cz_key_enc", "cz_account", "cz_account_label", "cz_user", "vision_ok", "vision_for", "rd_base", "rd_key_enc", "rd_model"]) if (!cols.includes(c)) d.exec(`ALTER TABLE settings ADD COLUMN ${c} TEXT`);
  const srcCols = (d.prepare("PRAGMA table_info(sources)").all() as { name: string }[]).map((c) => c.name);
  // A picture pulled from OneDrive keeps the item id and version, so a second pull skips what has not changed.
  for (const c of ["remote_id", "remote_etag"]) if (!srcCols.includes(c)) d.exec(`ALTER TABLE sources ADD COLUMN ${c} TEXT`);
}

export function now(): string {
  return new Date().toISOString();
}

export function uid(prefix: string): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}${r}`;
}
