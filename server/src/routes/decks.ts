import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { angleById, deckMediaIds, DEFAULT_THEME_ID, LAYOUTS, newId, sanitizeSlide, sanitizeTheme, scanDeck, themePreset, type Deck, type Slide } from "@slidecraft/shared";
import { config } from "../config.js";
import { getDb, now } from "../db.js";
import { deleteMedia, getMedia, loadDeck, saveDeck } from "../store.js";
import { newDeck } from "../llm/generate.js";
import { readSettings } from "../settings.js";
import { getDesign } from "../library.js";

function validDeck(raw: unknown): raw is Deck {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as Deck;
  if (typeof d.id !== "string" || typeof d.title !== "string") return false;
  if (!Array.isArray(d.slides)) return false;
  for (const s of d.slides as Slide[]) {
    if (!s || typeof s.id !== "string" || typeof s.title !== "string" || !LAYOUTS.includes(s.layout)) return false;
  }
  if (!d.theme || typeof d.theme !== "object" || !d.theme.colors) return false;
  return d.lang === "en" || d.lang === "ms";
}

export async function deckRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/decks", async (req) => {
    const rows = getDb().prepare("SELECT id, title, doc, created_at, updated_at FROM decks WHERE user_id = ? ORDER BY updated_at DESC").all(req.user.id) as { id: string; title: string; doc: string; created_at: string; updated_at: string }[];
    return rows.map((r) => {
      const d = JSON.parse(r.doc) as Deck;
      // The deck's own look and first slide, so the card shows the deck as it is.
      const first = Array.isArray(d.slides) && d.slides[0] ? sanitizeSlide(d.slides[0]) : undefined;
      return { id: r.id, title: r.title, lang: d.lang, angle: d.angle, slides: d.slides.length, themeId: d.theme?.id, theme: sanitizeTheme(d.theme), cover: first, createdAt: r.created_at, updatedAt: r.updated_at };
    });
  });

  app.post("/api/decks", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    for (const k of ["title", "lang", "angle", "themeId", "designId"]) if (b[k] !== undefined && b[k] !== null && typeof b[k] !== "string") return reply.code(400).send({ error: "invalid", message: `${k} must be text` });
    const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);
    const s = readSettings(req.user.id);
    return newDeck(req.user.id, (str("title") ?? "").slice(0, 300), str("lang") === "ms" ? "ms" : "en", angleById(str("angle") ?? "custom").id, str("themeId") ?? s.default_theme ?? DEFAULT_THEME_ID, str("designId"));
  });

  app.get("/api/decks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    return { deck: d, slop: scanDeck(d) };
  });

  app.put("/api/decks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const cur = loadDeck(req.user.id, id);
    if (!cur) return reply.code(404).send({ error: "not_found" });
    const body = req.body;
    if (!validDeck(body) || body.id !== id) return reply.code(400).send({ error: "invalid_deck" });
    // Sources, the OneDrive link, the stored brief and the notebook guide are the server's: an editor tab opened
    // before an import must not wipe the link when it autosaves.
    // Saved in the shapes the renderer and exporter trust: a colour is a colour, a table is square.
    const next: Deck = { ...body, title: String(body.title).slice(0, 300), slides: body.slides.map((x) => sanitizeSlide(x)), theme: sanitizeTheme(body.theme), createdAt: cur.createdAt, sources: cur.sources, onedrive: cur.onedrive, brief: cur.brief, guide: cur.guide };
    if (!next.onedrive) delete next.onedrive;
    if (!next.brief) delete next.brief;
    if (!next.guide) delete next.guide;
    saveDeck(req.user.id, next);
    return { deck: next, slop: scanDeck(next) };
  });

  app.delete("/api/decks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const gone = loadDeck(req.user.id, id);
    if (!gone) return reply.code(404).send({ error: "not_found" });
    // Its own pictures, and the ones it shows that came from a deck already deleted (a duplicate keeps its
    // original's pictures alive, and takes them along once it is the last deck showing them).
    const own = (db.prepare("SELECT id FROM media WHERE deck_id = ? AND user_id = ?").all(id, req.user.id) as { id: string }[]).map((m) => m.id);
    db.prepare("DELETE FROM decks WHERE id = ? AND user_id = ?").run(id, req.user.id);
    const rest = db.prepare("SELECT id, doc FROM decks WHERE user_id = ?").all(req.user.id) as { id: string; doc: string }[];
    const alive = new Set(rest.map((d) => d.id));
    const used = new Set(rest.flatMap((d) => {
      try {
        return deckMediaIds(JSON.parse(d.doc));
      } catch {
        return [];
      }
    }));
    for (const mid of new Set([...own, ...deckMediaIds(gone)])) {
      if (used.has(mid)) continue;
      const m = getMedia(req.user.id, mid);
      // A library picture (no deck) is kept for the next deck; one owned by a living deck is that deck's.
      if (!m || !m.deck_id || alive.has(m.deck_id)) continue;
      deleteMedia(req.user.id, mid);
    }
    try {
      fs.unlinkSync(path.join(config.dataDir, "writer-replies", `${id}.json`));
    } catch {
      /* none kept */
    }
    return { ok: true };
  });

  app.post("/api/decks/:id/duplicate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    const t = now();
    const copy: Deck = { ...d, id: newId("d"), title: `${d.title} (copy)`, createdAt: t, updatedAt: t, sources: [], slides: d.slides.map((s) => ({ ...s, id: newId() })) };
    saveDeck(req.user.id, copy);
    return copy;
  });

  app.post("/api/decks/:id/theme", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    const b = (req.body ?? {}) as { presetId?: string };
    const keep = { logoMediaId: d.theme.logoMediaId, footer: d.theme.footer };
    d.theme = { ...themePreset(b.presetId ?? DEFAULT_THEME_ID), ...keep };
    delete d.designId;
    saveDeck(req.user.id, d);
    return d;
  });

  // Use a saved design: its theme, and its notes for the writer from now on.
  app.post("/api/decks/:id/design", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    const design = getDesign(req.user.id, String((req.body as { designId?: string } | undefined)?.designId ?? ""));
    if (!design) return reply.code(404).send({ error: "design_not_found" });
    d.theme = { ...(JSON.parse(JSON.stringify(design.theme)) as Deck["theme"]), logoMediaId: d.theme.logoMediaId, footer: d.theme.footer };
    d.designId = design.id;
    saveDeck(req.user.id, d);
    return d;
  });
}
