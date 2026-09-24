import type { FastifyInstance } from "fastify";
import { extractMany } from "../ingest/extract.js";
import { addMedia, addSource, listSourceRefs, loadDeck } from "../store.js";
import { getDb } from "../db.js";

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
    const added = [];
    const skipped: string[] = [];
    for await (const part of req.files()) {
      const buf = await part.toBuffer();
      const relPath = decodeURIComponent(part.filename);
      const name = relPath.split("/").pop() || relPath;
      const items = await extractMany(name, buf, relPath);
      for (const it of items) {
        if (it.kind === "image" && it.image) {
          const m = addMedia(req.user.id, id, it.name, it.image.mime, it.image.buf, "upload");
          added.push(addSource(req.user.id, id, { name: it.name, relPath: it.relPath, kind: "image", bytes: it.image.buf.length, text: "", mediaId: m.id }));
        } else if (it.kind === "unknown" && !it.text) {
          skipped.push(it.relPath);
        } else {
          added.push(addSource(req.user.id, id, { name: it.name, relPath: it.relPath, kind: it.kind, bytes: buf.length, text: it.text }));
        }
      }
    }
    return { added, skipped };
  });

  app.post("/api/decks/:id/sources/text", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    const body = req.body as { name?: string; text?: string };
    const text = (body.text ?? "").trim();
    if (!text) return reply.code(400).send({ error: "empty" });
    return addSource(req.user.id, id, { name: body.name?.trim() || "Pasted text", kind: "text", bytes: Buffer.byteLength(text), text });
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
