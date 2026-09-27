import type { FastifyInstance, FastifyReply } from "fastify";
import { listSourceRefs, loadDeck, saveDeck, updateDeck } from "../store.js";
import { saveGdrive } from "../gdrive.js";
import { browse, composioAccounts, composioKey, disconnect, importFolder, normaliseFolder, OneDriveError, pollLogin, saveOneDriveSettings, startLogin, status, summarise } from "../onedrive.js";

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof OneDriveError) return reply.code(e.code === "unreachable" || e.code === "composio_error" ? 502 : 400).send({ error: e.code, message: e.message });
  throw e;
}

export async function oneDriveRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/onedrive", async (req) => status(req.user.id));

  app.put("/api/onedrive", async (req, reply) => {
    const b = (req.body ?? {}) as { clientId?: string | null; defaultFolder?: string | null; provider?: string; composioKey?: string | null; composioAccount?: string | null; composioAccountLabel?: string | null };
    for (const [k, v] of Object.entries(b)) if (v !== undefined && v !== null && typeof v !== "string") return reply.code(400).send({ error: "invalid", message: `${k} must be text` });
    // A new Composio key is a new project: the Google Drive account is picked again too.
    if (b.composioKey !== undefined) saveGdrive(req.user.id, null);
    try {
      saveOneDriveSettings(req.user.id, {
        clientId: b.clientId,
        defaultFolder: b.defaultFolder === undefined || b.defaultFolder === null ? b.defaultFolder : normaliseFolder(b.defaultFolder),
        provider: b.provider,
        composioKey: b.composioKey,
        composioAccount: b.composioAccount,
        composioAccountLabel: b.composioAccountLabel,
      });
    } catch (e) {
      return fail(reply, e);
    }
    return status(req.user.id);
  });

  app.delete("/api/onedrive", async (req) => {
    // Removing the Composio key also ends the Google Drive account that used it.
    if (status(req.user.id).provider === "composio") saveGdrive(req.user.id, null);
    disconnect(req.user.id);
    return status(req.user.id);
  });

  // The OneDrive accounts a Composio key can use: the typed key, or the saved one.
  app.post("/api/onedrive/composio/accounts", async (req, reply) => {
    const typed = String((req.body as { key?: string } | undefined)?.key ?? "").trim();
    const key = typed || composioKey(req.user.id);
    if (!key) return reply.code(400).send({ error: "no_key", message: "Paste the Composio API key first." });
    try {
      const accounts = await composioAccounts(key);
      return { accounts };
    } catch (e) {
      return fail(reply, e);
    }
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
    const b = (req.body ?? {}) as { folder?: unknown; subfolders?: unknown };
    if ((b.folder !== undefined && typeof b.folder !== "string") || (b.subfolders !== undefined && typeof b.subfolders !== "boolean")) return reply.code(400).send({ error: "invalid", message: "folder must be text and subfolders true or false" });
    const folder = normaliseFolder((b.folder as string | undefined) ?? deck.onedrive?.folder ?? status(req.user.id).defaultFolder);
    const subfolders = (b.subfolders as boolean | undefined) ?? deck.onedrive?.subfolders ?? false;
    try {
      const report = await importFolder(req.user.id, id, folder, subfolders);
      // Linked on the deck as it is now: edits saved during the import are kept.
      const link = { folder, subfolders, lastSync: new Date().toISOString() };
      if (!updateDeck(req.user.id, id, (d) => void (d.onedrive = link))) return reply.code(404).send({ error: "not_found" });
      return { report, summary: summarise(report), link, sources: listSourceRefs(id) };
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
