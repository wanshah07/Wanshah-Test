import { decrypt, encrypt } from "./crypto.js";
import { getDb, now } from "./db.js";
import type { LlmAuth } from "./llm/client.js";
import { normaliseBase, resolveAuth } from "./settings.js";

// An optional second endpoint that only reads pictures, so a writer that
// cannot see (a text model on Mireld) still gets what the pictures say. Its
// key is only ever sent to the endpoint saved with it.

interface ReaderRow {
  rd_base: string | null;
  rd_key_enc: string | null;
  rd_model: string | null;
}

function row(userId: string): ReaderRow {
  const r = getDb().prepare("SELECT rd_base, rd_key_enc, rd_model FROM settings WHERE user_id = ?").get(userId) as ReaderRow | undefined;
  return r ?? { rd_base: null, rd_key_enc: null, rd_model: null };
}

function readerKey(r: ReaderRow): string {
  if (!r.rd_key_enc) return "";
  try {
    return decrypt(r.rd_key_enc);
  } catch {
    return "";
  }
}

/** The picture reader as saved; complete only with an endpoint, a key and a model. */
export function readerSettings(userId: string): { baseUrl: string; model: string; key: string; complete: boolean } {
  const r = row(userId);
  const key = readerKey(r);
  return { baseUrl: r.rd_base || "", model: r.rd_model || "", key, complete: !!(r.rd_base && key && r.rd_model) };
}

export function saveReader(userId: string, b: { key?: string | null; baseUrl?: string | null; model?: string | null }): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)").run(userId, now());
  const cur = row(userId);
  const next = { ...cur };
  if (b.baseUrl !== undefined) {
    const base = b.baseUrl ? normaliseBase(b.baseUrl) : null;
    // A key saved for one endpoint is never sent to another.
    if (base !== cur.rd_base && b.key === undefined) next.rd_key_enc = null;
    next.rd_base = base;
  }
  if (b.key !== undefined) next.rd_key_enc = b.key && b.key.trim() ? encrypt(b.key.trim()) : null;
  if (b.model !== undefined) next.rd_model = (b.model ?? "").trim() || null;
  db.prepare("UPDATE settings SET rd_base = ?, rd_key_enc = ?, rd_model = ?, updated_at = ? WHERE user_id = ?").run(next.rd_base, next.rd_key_enc, next.rd_model, now(), userId);
}

/** Who reads uploaded pictures: the picture reader when one is set up, otherwise the writer. */
export function pictureAuth(userId: string): LlmAuth | null {
  const r = readerSettings(userId);
  if (r.complete) return { apiKey: r.key, baseUrl: r.baseUrl, model: r.model, imageModel: "" };
  return resolveAuth(userId);
}
