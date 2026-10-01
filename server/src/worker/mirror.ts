import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb, openMemoryDb } from "../db.js";
import { ensureLocalUser, LOCAL_USER_ID } from "../auth.js";
import { mediaPath } from "../store.js";
import { eq, inList, type Supabase } from "./supabase.js";
import { mergeDoc } from "./merge.js";
import { deckMediaIds } from "@slidecraft/shared";
import { setCloudMember } from "../tenant.js";

// One job runs against a fresh in-memory copy of one person's data. The server
// code sees a single local user (AUTH_MODE=off), so it can only ever touch what
// was loaded here; afterwards every row that changed is written back under the
// person's real id, and every write filters by that id.

type Row = Record<string, unknown>;

const EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg" };
export const objectPathFor = (owner: string, id: string, mime: string) => `${owner}/${id}${EXT[mime] ?? ".bin"}`;

interface Table {
  remote: string;
  local: string;
  /** Local columns, in the order they are inserted. */
  cols: string[];
  toLocal(r: Row): Row;
  toRemote(r: Row, owner: string): Row;
}

const json = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v));
const parsed = (v: unknown, fallback: unknown) => {
  if (typeof v !== "string") return v ?? fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};
const pick = (r: Row, cols: string[]) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]));

const DECKS: Table = {
  remote: "sc_decks",
  local: "decks",
  cols: ["id", "user_id", "title", "doc", "created_at", "updated_at"],
  toLocal: (r) => ({ ...pick(r, ["id", "title", "created_at", "updated_at"]), user_id: LOCAL_USER_ID, doc: json(r.doc) }),
  toRemote: (r, owner) => ({ id: r.id, user_id: owner, title: r.title, doc: parsed(r.doc, {}), created_at: r.created_at }),
};

const SOURCE_COLS = ["id", "deck_id", "name", "rel_path", "kind", "bytes", "chars", "text", "media_id", "remote_id", "remote_etag", "created_at"];
const SOURCES: Table = {
  remote: "sc_sources",
  local: "sources",
  cols: ["user_id", ...SOURCE_COLS],
  toLocal: (r) => ({ ...pick(r, SOURCE_COLS), user_id: LOCAL_USER_ID }),
  toRemote: (r, owner) => ({ ...pick(r, SOURCE_COLS), user_id: owner }),
};

const MEDIA_COLS = ["id", "deck_id", "name", "mime", "bytes", "width", "height", "origin", "created_at"];
const MEDIA: Table = {
  remote: "sc_media",
  local: "media",
  cols: ["user_id", ...MEDIA_COLS],
  toLocal: (r) => ({ ...pick(r, MEDIA_COLS), user_id: LOCAL_USER_ID }),
  toRemote: (r, owner) => ({ ...pick(r, MEDIA_COLS), user_id: owner, object_path: objectPathFor(owner, String(r.id), String(r.mime)) }),
};

const DESIGN_COLS = ["id", "name", "notes", "preview_media_id", "source_name", "created_at", "updated_at"];
const DESIGNS: Table = {
  remote: "sc_designs",
  local: "designs",
  cols: ["user_id", ...DESIGN_COLS, "theme", "analysis"],
  toLocal: (r) => ({ ...pick(r, DESIGN_COLS), user_id: LOCAL_USER_ID, theme: json(r.theme) ?? "{}", analysis: json(r.analysis) ?? "{}" }),
  toRemote: (r, owner) => ({ ...pick(r, DESIGN_COLS.filter((c) => c !== "updated_at")), user_id: owner, theme: parsed(r.theme, {}), analysis: parsed(r.analysis, {}) }),
};

const PROMPT_COLS = ["id", "name", "text", "created_at", "updated_at"];
const PROMPTS: Table = {
  remote: "sc_prompts",
  local: "prompts",
  cols: ["user_id", ...PROMPT_COLS, "is_default"],
  toLocal: (r) => ({ ...pick(r, PROMPT_COLS), user_id: LOCAL_USER_ID, is_default: r.is_default ? 1 : 0 }),
  toRemote: (r, owner) => ({ ...pick(r, PROMPT_COLS.filter((c) => c !== "updated_at")), user_id: owner, is_default: !!r.is_default }),
};

const OUTPUT_COLS = ["id", "deck_id", "kind", "title", "model", "source_count", "created_at", "updated_at"];
const OUTPUTS: Table = {
  remote: "sc_outputs",
  local: "outputs",
  cols: ["user_id", ...OUTPUT_COLS, "data"],
  toLocal: (r) => ({ ...pick(r, OUTPUT_COLS), user_id: LOCAL_USER_ID, data: json(r.data) ?? "{}" }),
  toRemote: (r, owner) => ({ ...pick(r, OUTPUT_COLS.filter((c) => c !== "updated_at")), user_id: owner, data: parsed(r.data, {}) }),
};

// Settings: Supabase column -> local column. Keys are not here: the worker reads them from its environment.
const SETTINGS_MAP: [string, string][] = [
  ["model", "openai_model"],
  ["image_model", "openai_image_model"],
  ["app_theme", "app_theme"],
  ["default_theme", "default_theme"],
  ["onedrive_folder", "ms_folder"],
  ["cz_account", "cz_account"],
  ["cz_account_label", "cz_account_label"],
  ["cz_user", "cz_user"],
  ["gd_account", "gd_account"],
  ["gd_account_label", "gd_account_label"],
  ["gd_user", "gd_user"],
  ["house_prompt", "house_prompt"],
  ["vision_ok", "vision_ok"],
  ["vision_for", "vision_for"],
];

const TABLES = [DECKS, SOURCES, MEDIA, DESIGNS, PROMPTS, OUTPUTS];

export interface Loaded {
  owner: string;
  /** Rows as loaded, per local table, by id: what "changed" is measured against. */
  base: Map<string, Map<string, string>>;
  /** The deck docs as loaded and the updated_at Supabase held for them. */
  deckBase: Map<string, { doc: Row; updatedAt: string }>;
  /** A hash of each media file as loaded. */
  fileHash: Map<string, string>;
  settings: Row | null;
  counts: { decks: number; sources: number; media: number };
}

function localRows(t: Table): Row[] {
  return getDb().prepare(`SELECT ${t.cols.join(", ")} FROM ${t.local}`).all() as Row[];
}

function insertLocal(t: Table, rows: Row[]): void {
  const st = getDb().prepare(`INSERT INTO ${t.local} (${t.cols.join(", ")}) VALUES (${t.cols.map(() => "?").join(", ")})`);
  for (const r of rows) st.run(...(t.cols.map((c) => (r[c] === undefined ? null : r[c])) as (string | number | null)[]));
}

function localSettings(): Row | null {
  return (getDb().prepare(`SELECT ${SETTINGS_MAP.map(([, l]) => l).join(", ")} FROM settings WHERE user_id = ?`).get(LOCAL_USER_ID) as Row | undefined) ?? null;
}

const hashOf = (p: string) => (fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : "");

/**
 * Loads the person's rows into a fresh in-memory database. With a deck id, that
 * deck, its sources and its pictures come too; pictures not tied to a deck
 * (design previews, the library) always come, and designs and prompts always do.
 */
export async function load(sb: Supabase, owner: string, scope: { deck?: string; media?: string; source?: string; output?: string }): Promise<Loaded> {
  openMemoryDb();
  for (const d of [config.mediaDir, config.sourcesDir]) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
  }
  ensureLocalUser();
  const own = { user_id: eq(owner) };
  // No row, or no table in a stand-in, is a plain member: the narrower rule.
  const [member] = await sb.select("sc_members", own, { columns: "role" }).catch(() => []);
  setCloudMember({ userId: owner, role: String(member?.role ?? "member") });

  const [settings] = await sb.select("sc_settings", own);
  if (settings) {
    const cols = ["user_id", "od_provider", "updated_at", ...SETTINGS_MAP.map(([, l]) => l)];
    const vals = [LOCAL_USER_ID, "composio", new Date().toISOString(), ...SETTINGS_MAP.map(([r]) => (settings[r] ?? null) as string | null)];
    getDb().prepare(`INSERT INTO settings (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...vals);
  } else {
    getDb().prepare("INSERT INTO settings (user_id, od_provider, updated_at) VALUES (?, 'composio', ?)").run(LOCAL_USER_ID, new Date().toISOString());
  }

  // A request about one picture or one source loads it and the deck it belongs to.
  let deckId = scope.deck ?? null;
  let extraMedia: Row[] = [];
  let extraSources: Row[] = [];
  if (scope.media) {
    extraMedia = await sb.select("sc_media", { ...own, id: eq(scope.media) });
    deckId = (extraMedia[0]?.deck_id as string | null) ?? null;
  }
  if (scope.source) {
    extraSources = await sb.select("sc_sources", { ...own, id: eq(scope.source) });
    deckId = (extraSources[0]?.deck_id as string | null) ?? null;
  }
  if (scope.output) {
    const [o] = await sb.select("sc_outputs", { ...own, id: eq(scope.output) }, { columns: "deck_id" });
    deckId = (o?.deck_id as string | null) ?? null;
  }
  const deckBase = new Map<string, { doc: Row; updatedAt: string }>();
  let decks: Row[] = [];
  let sources: Row[] = [];
  let outputs: Row[] = [];
  if (deckId) {
    decks = await sb.select("sc_decks", { ...own, id: eq(deckId) });
    if (decks.length) sources = await sb.select("sc_sources", { ...own, deck_id: eq(deckId) }, { order: "created_at.asc" });
    if (decks.length) outputs = await sb.select("sc_outputs", { ...own, deck_id: eq(deckId) });
    for (const d of decks) deckBase.set(String(d.id), { doc: (d.doc ?? {}) as Row, updatedAt: String(d.updated_at) });
  }
  const byId = new Map<string, Row>();
  for (const r of [
    ...(await sb.select("sc_media", { ...own, deck_id: "is.null" })),
    ...(decks.length ? await sb.select("sc_media", { ...own, deck_id: eq(String(deckId)) }) : []),
    ...extraMedia,
    // Pictures the deck shows that belong to another deck: a duplicate shares its original's.
    ...(decks.length ? await (async () => {
      const ids = decks.flatMap((d) => deckMediaIds((d.doc ?? {}) as Row));
      return ids.length ? sb.select("sc_media", { ...own, id: inList(ids) }) : [];
    })() : []),
  ])
    byId.set(String(r.id), r);
  // A row's id and object_path are the person's own to write (RLS), so neither is trusted: a picture
  // whose path is not exactly where this owner's copy would be stored is someone else's, and an id that
  // is not a plain name would put a file outside the job's folder.
  const media = [...byId.values()].filter((r) => /^[A-Za-z0-9_-]{1,80}$/.test(String(r.id)) && r.object_path === objectPathFor(owner, String(r.id), String(r.mime)));
  const srcIds = new Set(sources.map((r) => String(r.id)));
  sources = [...sources, ...extraSources.filter((r) => !srcIds.has(String(r.id)))];
  const designs = await sb.select("sc_designs", own);
  const prompts = await sb.select("sc_prompts", own);

  insertLocal(DECKS, decks.map(DECKS.toLocal));
  insertLocal(SOURCES, sources.map(SOURCES.toLocal));
  insertLocal(MEDIA, media.map(MEDIA.toLocal));
  insertLocal(DESIGNS, designs.map(DESIGNS.toLocal));
  insertLocal(PROMPTS, prompts.map(PROMPTS.toLocal));
  insertLocal(OUTPUTS, outputs.map(OUTPUTS.toLocal));

  const fileHash = new Map<string, string>();
  for (const m of media) {
    const p = mediaPath(String(m.id), String(m.mime));
    try {
      fs.writeFileSync(p, await sb.download("sc-media", String(m.object_path)));
    } catch {
      // A missing picture is left missing; the code already copes with a file that is not there.
    }
    fileHash.set(String(m.id), hashOf(p));
  }

  const base = new Map<string, Map<string, string>>();
  for (const t of TABLES) base.set(t.local, new Map(localRows(t).map((r) => [String(r.id), JSON.stringify(r)])));
  return { owner, base, deckBase, fileHash, settings: localSettings(), counts: { decks: decks.length, sources: sources.length, media: media.length } };
}

export interface Flushed {
  added: number;
  changed: number;
  removed: number;
  files: number;
  merged: number;
}

/** Writes back every row and file the job changed, as the person who owns them. */
export async function flush(sb: Supabase, l: Loaded): Promise<Flushed> {
  const owner = l.owner;
  const out: Flushed = { added: 0, changed: 0, removed: 0, files: 0, merged: 0 };
  const byTable = new Map<string, { added: Row[]; changed: Row[]; removed: string[] }>();
  for (const t of TABLES) {
    const base = l.base.get(t.local)!;
    const now = localRows(t);
    const ids = new Set(now.map((r) => String(r.id)));
    byTable.set(t.local, {
      added: now.filter((r) => !base.has(String(r.id))),
      changed: now.filter((r) => base.has(String(r.id)) && base.get(String(r.id)) !== JSON.stringify(r)),
      removed: [...base.keys()].filter((id) => !ids.has(id)),
    });
  }
  const own = { user_id: eq(owner) };

  // Pictures first, so a row never points at a file that is not there yet.
  const media = byTable.get("media")!;
  const keptMedia = localRows(MEDIA).filter((r) => l.base.get("media")!.has(String(r.id)));
  for (const r of [...media.added, ...keptMedia]) {
    const p = mediaPath(String(r.id), String(r.mime));
    const isNew = !l.fileHash.has(String(r.id));
    if (!isNew && hashOf(p) === l.fileHash.get(String(r.id))) continue;
    if (!fs.existsSync(p)) continue;
    await sb.upload("sc-media", objectPathFor(owner, String(r.id), String(r.mime)), fs.readFileSync(p), String(r.mime));
    out.files++;
  }

  // Decks: a deck the person changed meanwhile is merged, never overwritten.
  const decks = byTable.get("decks")!;
  await sb.insert("sc_decks", decks.added.map((r) => DECKS.toRemote(r, owner)));
  for (const r of decks.changed) {
    const id = String(r.id);
    const seen = l.deckBase.get(id)!;
    let doc = parsed(r.doc, {}) as Row;
    let expect = seen.updatedAt;
    let settled = false;
    for (let attempt = 0; attempt < 3 && !settled; attempt++) {
      const done = await sb.update("sc_decks", { ...own, id: eq(id), updated_at: eq(expect) }, { title: r.title, doc });
      if (done.length) {
        settled = true;
        break;
      }
      const [cur] = await sb.select("sc_decks", { ...own, id: eq(id) });
      if (!cur) {
        settled = true; // deleted meanwhile: the person's delete stands
        break;
      }
      doc = mergeDoc(seen.doc, parsed(r.doc, {}) as Row, (cur.doc ?? {}) as Row);
      expect = String(cur.updated_at);
      out.merged++;
    }
    // Three edits in a row beat the write: the job fails rather than reporting work it did not save.
    if (!settled) throw new Error("deck_busy");
  }

  for (const t of [SOURCES, MEDIA, DESIGNS, PROMPTS, OUTPUTS]) {
    const d = byTable.get(t.local)!;
    await sb.insert(t.remote, d.added.map((r) => t.toRemote(r, owner)));
    for (const r of d.changed) {
      const { id: _id, user_id: _u, ...patch } = t.toRemote(r, owner);
      await sb.update(t.remote, { ...own, id: eq(String(r.id)) }, patch);
    }
  }

  // Removals, children first.
  for (const t of [OUTPUTS, SOURCES, PROMPTS, DESIGNS, MEDIA, DECKS]) {
    const ids = byTable.get(t.local)!.removed;
    if (!ids.length) continue;
    if (t === MEDIA) {
      const rows = (await sb.select("sc_media", { ...own, id: inList(ids) }, { columns: "id,object_path" })).map((r) => String(r.object_path));
      await sb.removeFiles("sc-media", rows.filter((p) => p.startsWith(owner + "/")));
    }
    await sb.remove(t.remote, { ...own, id: inList(ids) });
  }

  // Settings the job changed (a cached Composio user, the picture check).
  const s = localSettings();
  if (s && JSON.stringify(s) !== JSON.stringify(l.settings)) {
    // Only the columns the job changed: anything else the person saved while it ran stands.
    const before = l.settings ?? {};
    const patch = Object.fromEntries(SETTINGS_MAP.filter(([, lc]) => (s[lc] ?? null) !== (before[lc] ?? null)).map(([r, lc]) => [r, s[lc] ?? null]));
    const done = await sb.update("sc_settings", own, patch);
    if (!done.length) await sb.insert("sc_settings", [{ user_id: owner, ...patch }]);
    out.changed++;
  }

  for (const d of byTable.values()) {
    out.added += d.added.length;
    out.changed += d.changed.length;
    out.removed += d.removed.length;
  }
  return out;
}

/** Removes what a job left on disk. */
export function clearDisk(): void {
  setCloudMember(null);
  for (const d of [config.mediaDir, config.sourcesDir, path.join(config.dataDir, "writer-replies")]) fs.rmSync(d, { recursive: true, force: true });
}
