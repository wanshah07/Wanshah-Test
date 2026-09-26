import type { Theme } from "@slidecraft/shared";
import { getDb, now, uid } from "./db.js";
import { addMedia, deleteMedia } from "./store.js";
import type { DesignAnalysis, DesignDraft } from "./design/extract.js";

// The user's own library: designs read from reference files, and saved
// prompts that can be ticked on any deck.

export interface Design {
  id: string;
  name: string;
  theme: Theme;
  notes: string;
  analysis: DesignAnalysis | Record<string, never>;
  previewMediaId: string | null;
  sourceName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DesignRow {
  id: string;
  name: string;
  theme: string;
  notes: string;
  analysis: string;
  preview_media_id: string | null;
  source_name: string | null;
  created_at: string;
  updated_at: string;
}

function toDesign(r: DesignRow): Design {
  return { id: r.id, name: r.name, theme: JSON.parse(r.theme), notes: r.notes, analysis: JSON.parse(r.analysis || "{}"), previewMediaId: r.preview_media_id, sourceName: r.source_name, createdAt: r.created_at, updatedAt: r.updated_at };
}

export function listDesigns(userId: string): Design[] {
  return (getDb().prepare("SELECT * FROM designs WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as unknown as DesignRow[]).map(toDesign);
}

export function getDesign(userId: string, id: string): Design | null {
  const r = getDb().prepare("SELECT * FROM designs WHERE id = ? AND user_id = ?").get(id, userId) as DesignRow | undefined;
  return r ? toDesign(r) : null;
}

export function createDesign(userId: string, d: { name: string; theme: Theme; notes: string; analysis?: DesignAnalysis; preview?: DesignDraft["preview"]; sourceName?: string }): Design {
  const id = uid("dz");
  const preview = d.preview ? addMedia(userId, null, `${d.name} preview`, d.preview.mime, d.preview.buf, "design") : null;
  const theme = { ...d.theme, id: `design:${id}`, name: d.name };
  getDb()
    .prepare("INSERT INTO designs (id, user_id, name, theme, notes, analysis, preview_media_id, source_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, d.name, JSON.stringify(theme), d.notes, JSON.stringify(d.analysis ?? {}), preview?.id ?? null, d.sourceName ?? null, now(), now());
  return getDesign(userId, id)!;
}

export function updateDesign(userId: string, id: string, patch: { name?: string; notes?: string; theme?: Theme }): Design | null {
  const cur = getDesign(userId, id);
  if (!cur) return null;
  const name = patch.name?.trim() || cur.name;
  const theme = { ...(patch.theme ?? cur.theme), id: `design:${id}`, name };
  getDb().prepare("UPDATE designs SET name = ?, notes = ?, theme = ?, updated_at = ? WHERE id = ?").run(name, patch.notes ?? cur.notes, JSON.stringify(theme), now(), id);
  return getDesign(userId, id);
}

export function deleteDesign(userId: string, id: string): boolean {
  const cur = getDesign(userId, id);
  if (!cur) return false;
  getDb().prepare("DELETE FROM designs WHERE id = ?").run(id);
  if (cur.previewMediaId) deleteMedia(userId, cur.previewMediaId);
  return true;
}

export interface SavedPrompt {
  id: string;
  name: string;
  text: string;
  isDefault: boolean;
  updatedAt: string;
}

export function listPrompts(userId: string): SavedPrompt[] {
  return (getDb().prepare("SELECT id, name, text, is_default, updated_at FROM prompts WHERE user_id = ? ORDER BY name COLLATE NOCASE").all(userId) as { id: string; name: string; text: string; is_default: number; updated_at: string }[]).map((r) => ({ id: r.id, name: r.name, text: r.text, isDefault: !!r.is_default, updatedAt: r.updated_at }));
}

export function savePrompt(userId: string, p: { id?: string; name: string; text: string; isDefault?: boolean }): SavedPrompt | null {
  const name = p.name.trim().slice(0, 120);
  const text = p.text.trim().slice(0, 8000);
  if (!name || !text) return null;
  const db = getDb();
  if (p.id) {
    const r = db.prepare("UPDATE prompts SET name = ?, text = ?, is_default = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(name, text, p.isDefault ? 1 : 0, now(), p.id, userId);
    if (!r.changes) return null;
    return listPrompts(userId).find((x) => x.id === p.id) ?? null;
  }
  const id = uid("p");
  db.prepare("INSERT INTO prompts (id, user_id, name, text, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, userId, name, text, p.isDefault ? 1 : 0, now(), now());
  return listPrompts(userId).find((x) => x.id === id) ?? null;
}

export function deletePrompt(userId: string, id: string): boolean {
  return !!getDb().prepare("DELETE FROM prompts WHERE id = ? AND user_id = ?").run(id, userId).changes;
}

/** The texts of the ticked prompts, or of the defaults when a request names none. */
export function promptTexts(userId: string, ids: string[] | undefined): { name: string; text: string }[] {
  const all = listPrompts(userId);
  const chosen = ids === undefined ? all.filter((p) => p.isDefault) : all.filter((p) => ids.includes(p.id));
  return chosen.map((p) => ({ name: p.name, text: p.text }));
}
