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
    reply.type("text/html; charset=utf-8");
    // Shown full screen in the presenter: a page, not raw JSON.
    if (!d) return reply.code(404).send('<!doctype html><meta charset="utf-8"><title>Deck not found</title><body style="font:18px system-ui;background:#0b1620;color:#dce6f0;display:grid;place-items:center;height:100vh;margin:0"><div><h1 style="font-size:28px">This deck does not exist, or it was deleted.</h1><p><a href="/" target="_top" style="color:#8cc4ff">Back to decks</a></p></div>');
    return renderDeckHtml(d, (mid) => mediaDataUrl(req.user.id, mid));
  });
}
