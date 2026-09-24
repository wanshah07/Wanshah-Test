import type { FastifyInstance } from "fastify";
import { renderDeckHtml } from "@slidecraft/shared";
import { loadDeck, mediaDataUrl } from "../store.js";
import { deckToPptx } from "../export/pptx.js";

function safeName(s: string): string {
  return (s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "deck");
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/decks/:id/export.html", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    const html = renderDeckHtml(d, (mid) => mediaDataUrl(req.user.id, mid));
    reply.header("Content-Disposition", `attachment; filename="${safeName(d.title)}.html"`);
    reply.type("text/html; charset=utf-8");
    return html;
  });

  app.get("/api/decks/:id/export.pptx", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    const buf = await deckToPptx(d, req.user.id);
    reply.header("Content-Disposition", `attachment; filename="${safeName(d.title)}.pptx"`);
    reply.type("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    return buf;
  });

  app.get("/api/decks/:id/export.json", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    reply.header("Content-Disposition", `attachment; filename="${safeName(d.title)}.json"`);
    return d;
  });

  // The rendered slides for the in-app presenter, media as data URIs so the
  // presenter page needs no further requests.
  app.get("/api/decks/:id/present", async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = loadDeck(req.user.id, id);
    if (!d) return reply.code(404).send({ error: "not_found" });
    reply.type("text/html; charset=utf-8");
    return renderDeckHtml(d, (mid) => mediaDataUrl(req.user.id, mid));
  });
}
