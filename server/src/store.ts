import fs from "node:fs";
import path from "node:path";
import type { Deck, SourceRef } from "@slidecraft/shared";
import { getDb, now, uid } from "./db.js";
import { config } from "./config.js";

export function loadDeck(userId: string, id: string): Deck | null {
  const row = getDb().prepare("SELECT doc FROM decks WHERE id = ? AND user_id = ?").get(id, userId) as { doc: string } | undefined;
  if (!row) return null;
  const deck = JSON.parse(row.doc) as Deck;
  deck.sources = listSourceRefs(id);
  return deck;
}

export function saveDeck(userId: string, deck: Deck): Deck {
  deck.updatedAt = now();
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM decks WHERE id = ? AND user_id = ?").get(deck.id, userId);
  const { sources: _s, ...doc } = deck;
  if (exists) {
    db.prepare("UPDATE decks SET title = ?, doc = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(deck.title, JSON.stringify(doc), deck.updatedAt, deck.id, userId);
  } else {
    db.prepare("INSERT INTO decks (id, user_id, title, doc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(deck.id, userId, deck.title, JSON.stringify(doc), deck.createdAt, deck.updatedAt);
  }
  return deck;
}

export function listSourceRefs(deckId: string): SourceRef[] {
  return (getDb().prepare("SELECT id, name, kind, chars, rel_path FROM sources WHERE deck_id = ? ORDER BY created_at").all(deckId) as { id: string; name: string; kind: string; chars: number; rel_path: string | null }[]).map((r) => ({
    id: r.id,
    name: r.rel_path || r.name,
    kind: r.kind,
    chars: r.chars,
  }));
}

export interface SourceRow {
  id: string;
  name: string;
  rel_path: string | null;
  kind: string;
  chars: number;
  text: string;
  media_id: string | null;
  /** Set for a picture pulled from OneDrive: a slide picture, not a document. */
  remote_id: string | null;
}

export function listSources(deckId: string): SourceRow[] {
  return getDb().prepare("SELECT id, name, rel_path, kind, chars, text, media_id, remote_id FROM sources WHERE deck_id = ? ORDER BY created_at").all(deckId) as unknown as SourceRow[];
}

/** Pictures uploaded as sources whose content nobody has read yet. OneDrive pictures are slide pictures and are left out. */
export function unreadPictures(rows: SourceRow[]): SourceRow[] {
  return rows.filter((r) => r.kind === "image" && !r.remote_id && !r.text);
}

export function addSource(userId: string, deckId: string, s: { name: string; relPath?: string; kind: string; bytes: number; text: string; mediaId?: string }): SourceRef {
  const id = uid("src");
  getDb()
    .prepare("INSERT INTO sources (id, user_id, deck_id, name, rel_path, kind, bytes, chars, text, media_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, deckId, s.name, s.relPath ?? null, s.kind, s.bytes, s.text.length, s.text, s.mediaId ?? null, now());
  return { id, name: s.relPath ?? s.name, kind: s.kind, chars: s.text.length };
}

export interface MediaRow {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  origin: string;
  deck_id: string | null;
}

const EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg" };

export function mediaPath(id: string, mime: string): string {
  return path.join(config.mediaDir, id + (EXT[mime] ?? ".bin"));
}

export function addMedia(userId: string, deckId: string | null, name: string, mime: string, buf: Buffer, origin: string): MediaRow {
  const id = uid("m");
  fs.mkdirSync(config.mediaDir, { recursive: true });
  fs.writeFileSync(mediaPath(id, mime), buf);
  getDb().prepare("INSERT INTO media (id, user_id, deck_id, name, mime, bytes, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, userId, deckId, name, mime, buf.length, origin, now());
  return { id, name, mime, bytes: buf.length, origin, deck_id: deckId };
}

export function getMedia(userId: string, id: string): (MediaRow & { path: string }) | null {
  const row = getDb().prepare("SELECT id, name, mime, bytes, origin, deck_id FROM media WHERE id = ? AND user_id = ?").get(id, userId) as MediaRow | undefined;
  if (!row) return null;
  return { ...row, path: mediaPath(row.id, row.mime) };
}

export function listMedia(userId: string, deckId: string): MediaRow[] {
  return getDb().prepare("SELECT id, name, mime, bytes, origin, deck_id FROM media WHERE user_id = ? AND (deck_id = ? OR deck_id IS NULL) AND origin != 'design' ORDER BY created_at").all(userId, deckId) as unknown as MediaRow[];
}

export function deleteMedia(userId: string, id: string): void {
  const m = getMedia(userId, id);
  if (!m) return;
  getDb().prepare("DELETE FROM media WHERE id = ?").run(id);
  try {
    fs.unlinkSync(m.path);
  } catch {
    /* already gone */
  }
}

/** Data URI for exports, so a deck file carries its own pictures. */
export function mediaDataUrl(userId: string, id: string): string {
  const m = getMedia(userId, id);
  if (!m || !fs.existsSync(m.path)) return "";
  return `data:${m.mime};base64,${fs.readFileSync(m.path).toString("base64")}`;
}
