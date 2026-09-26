import type { FastifyInstance, FastifyReply } from "fastify";
import { listSourceRefs, loadDeck, saveDeck } from "../store.js";
import { browse, disconnect, importFolder, normaliseFolder, OneDriveError, pollLogin, saveOneDriveSettings, startLogin, status, summarise } from "../onedrive.js";

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof OneDriveError) return reply.code(e.code === "unreachable" ? 502 : 400).send({ error: e.code, message: e.message });
  throw e;
}

export async function oneDriveRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/onedrive", async (req) => status(req.user.id));

  app.put("/api/onedrive", async (req, reply) => {
    const b = (req.body ?? {}) as { clientId?: string | null; defaultFolder?: string | null };
    try {
      saveOneDriveSettings(req.user.id, { clientId: b.clientId, defaultFolder: b.defaultFolder === undefined || b.defaultFolder === null ? b.defaultFolder : normaliseFolder(b.defaultFolder) });
    } catch (e) {
      return fail(reply, e);
    }
    return status(req.user.id);
  });

  app.delete("/api/onedrive", async (req) => {
    disconnect(req.user.id);
    return status(req.user.id);
  });

  app.post("/api/onedrive/login", async (req, reply) => {
    try {
      return await startLogin(req.user.id);
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post("/api/onedrive/login/poll", async (req, reply) => {
    try {
      return await pollLogin(req.user.id);
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get("/api/onedrive/browse", async (req, reply) => {
    const { folder = "" } = req.query as { folder?: string };
    try {
      return await browse(req.user.id, folder);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Pulls the folder's pictures into the deck now, and links the folder so
  // every later generation pulls again before writing.
  app.post("/api/decks/:id/onedrive", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    const b = (req.body ?? {}) as { folder?: string; subfolders?: boolean };
    const folder = normaliseFolder(b.folder ?? deck.onedrive?.folder ?? status(req.user.id).defaultFolder);
    const subfolders = b.subfolders ?? deck.onedrive?.subfolders ?? false;
    try {
      const report = await importFolder(req.user.id, id, folder, subfolders);
      deck.onedrive = { folder, subfolders, lastSync: new Date().toISOString() };
      saveDeck(req.user.id, deck);
      return { report, summary: summarise(report), link: deck.onedrive, sources: listSourceRefs(id) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Stops the automatic pull. The pictures already pulled stay.
  app.delete("/api/decks/:id/onedrive", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    delete deck.onedrive;
    saveDeck(req.user.id, deck);
    return { ok: true };
  });
}
