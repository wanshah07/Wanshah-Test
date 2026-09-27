import type { FastifyInstance } from "fastify";
import { extractMany, type Extracted } from "../ingest/extract.js";
import { fetchGoogleLink, GoogleLinkError, type GoogleLink } from "../ingest/google.js";
import { fetchPrivateLink, gdriveStatus } from "../gdrive.js";
import type { SourceRef } from "@slidecraft/shared";
import { addMedia, addSource, listSourceRefs, loadDeck } from "../store.js";
import { getDb } from "../db.js";

/** A file name as sent: percent-decoded when it is valid, as it came when it is not ("100% sure.txt"). */
export function safeDecode(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** Files read from an upload or a link, saved as the deck's sources; what could not be read, with the reason. */
async function keep(userId: string, deckId: string, items: Extracted[], bytes: number, added: SourceRef[], skipped: string[]): Promise<void> {
  for (const it of items) {
    if (it.kind === "image" && it.image) {
      const m = addMedia(userId, deckId, it.name, it.image.mime, it.image.buf, "upload");
      added.push(addSource(userId, deckId, { name: it.name, relPath: it.relPath, kind: "image", bytes: it.image.buf.length, text: "", mediaId: m.id }));
    } else if (it.kind === "unknown") {
      skipped.push(`${it.relPath} (${it.error ?? "not a kind of file that can be read: use PDF, Word, PowerPoint, Excel, CSV, text or a picture"})`);
    } else {
      added.push(addSource(userId, deckId, { name: it.name, relPath: it.relPath, kind: it.kind, bytes, text: it.text }));
    }
  }
}

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/decks/:id/sources", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    return listSourceRefs(id);
  });

  // Multipart upload. Each part's filename may carry a relative path when the
  // browser uploaded a folder; the client sets it to webkitRelativePath.
  app.post("/api/decks/:id/sources", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    const added: SourceRef[] = [];
    const skipped: string[] = [];
    for await (const part of req.files()) {
      const buf = await part.toBuffer();
      const relPath = safeDecode(part.filename);
      const name = relPath.split("/").pop() || relPath;
      await keep(req.user.id, id, await extractMany(name, buf, relPath), buf.length, added, skipped);
    }
    return { added, skipped };
  });

  // A Google Drive, Docs, Sheets or Slides link, or a shared folder: read now, so the person sees what came through.
  app.post("/api/decks/:id/sources/link", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    const url = (req.body as { url?: unknown } | undefined)?.url;
    if (typeof url !== "string" || !url.trim() || url.length > 2000) return reply.code(400).send({ error: "invalid", message: "Paste a Google Drive, Docs, Sheets or Slides link." });
    try {
      // Private files go through the connected Google Drive account, when there is one.
      const reader = gdriveStatus(req.user.id).connected ? (l: GoogleLink) => fetchPrivateLink(req.user.id, l) : undefined;
      const { files, skipped } = await fetchGoogleLink(url, reader);
      const added: SourceRef[] = [];
      for (const f of files) await keep(req.user.id, id, await extractMany(f.name, f.buf, f.relPath), f.buf.length, added, skipped);
      return { added, skipped };
    } catch (e) {
      if (e instanceof GoogleLinkError) return reply.code(400).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.post("/api/decks/:id/sources/text", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    const body = (req.body ?? {}) as { name?: unknown; text?: unknown };
    if (typeof body.text !== "string" || (body.name !== undefined && typeof body.name !== "string")) return reply.code(400).send({ error: "invalid", message: "text and name must be text" });
    const text = body.text.trim().slice(0, 2_000_000);
    if (!text) return reply.code(400).send({ error: "empty" });
    return addSource(req.user.id, id, { name: (body.name as string | undefined)?.trim().slice(0, 200) || "Pasted text", kind: "text", bytes: Buffer.byteLength(text), text });
  });

  app.get("/api/sources/:sid", async (req, reply) => {
    const { sid } = req.params as { sid: string };
    const row = getDb().prepare("SELECT id, name, rel_path, kind, chars, text, media_id FROM sources WHERE id = ? AND user_id = ?").get(sid, req.user.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.delete("/api/sources/:sid", async (req, reply) => {
    const { sid } = req.params as { sid: string };
    const r = getDb().prepare("DELETE FROM sources WHERE id = ? AND user_id = ?").run(sid, req.user.id);
    if (!r.changes) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
}
