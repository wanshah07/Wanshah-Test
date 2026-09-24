import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { addMedia, deleteMedia, getMedia, listMedia, loadDeck } from "../store.js";

const OK_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/decks/:id/media", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    return listMedia(req.user.id, id);
  });

  app.post("/api/decks/:id/media", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    const out = [];
    for await (const part of req.files()) {
      if (!OK_MIME.has(part.mimetype)) continue;
      const buf = await part.toBuffer();
      out.push(addMedia(req.user.id, id, part.filename, part.mimetype, buf, "upload"));
    }
    return out;
  });

  app.get("/api/media/:mid", async (req, reply) => {
    const { mid } = req.params as { mid: string };
    const m = getMedia(req.user.id, mid);
    if (!m || !fs.existsSync(m.path)) return reply.code(404).send({ error: "not_found" });
    reply.header("Cache-Control", "private, max-age=86400");
    reply.type(m.mime);
    return reply.send(fs.createReadStream(m.path));
  });

  app.delete("/api/media/:mid", async (req) => {
    const { mid } = req.params as { mid: string };
    deleteMedia(req.user.id, mid);
    return { ok: true };
  });
}
