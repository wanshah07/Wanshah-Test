import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { addMedia, deleteMedia, getMedia, listMedia, loadDeck } from "../store.js";
import { sniffPicture } from "../ingest/sniff.js";

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
      if (!OK_MIME.has(part.mimetype)) {
        // An unread part stalls the whole upload: drain it.
        part.file.resume();
        continue;
      }
      const buf = await part.toBuffer();
      // What the bytes are, not what the browser said they are.
      const mime = sniffPicture(buf);
      if (!mime) continue;
      out.push(addMedia(req.user.id, id, part.filename, mime, buf, "upload"));
    }
    return out;
  });

  app.get("/api/media/:mid", async (req, reply) => {
    const { mid } = req.params as { mid: string };
    const m = getMedia(req.user.id, mid);
    if (!m || !fs.existsSync(m.path)) return reply.code(404).send({ error: "not_found" });
    reply.header("Cache-Control", "private, max-age=86400");
    // A picture is served as a picture only: an SVG opened on its own can run no script on this origin.
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
    if (m.mime === "image/svg+xml") reply.header("Content-Disposition", "inline; filename=\"picture.svg\"");
    reply.type(m.mime);
    return reply.send(fs.createReadStream(m.path));
  });

  app.delete("/api/media/:mid", async (req, reply) => {
    const { mid } = req.params as { mid: string };
    if (!getMedia(req.user.id, mid)) return reply.code(404).send({ error: "not_found" });
    deleteMedia(req.user.id, mid);
    return { ok: true };
  });
}
