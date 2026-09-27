import type { FastifyInstance } from "fastify";
import { composioAccounts, composioKey, OneDriveError, saveOneDriveSettings } from "../onedrive.js";
import { gdriveStatus, saveGdrive } from "../gdrive.js";

// Settings for private Google Drive files: the Composio key (shared with OneDrive) and the Google Drive account.
export async function gdriveRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/gdrive", async (req) => gdriveStatus(req.user.id));

  app.put("/api/gdrive", async (req, reply) => {
    const b = (req.body ?? {}) as { composioKey?: unknown; account?: unknown; label?: unknown };
    for (const [k, v] of Object.entries(b)) if (v !== undefined && v !== null && typeof v !== "string") return reply.code(400).send({ error: "invalid", message: `${k} must be text` });
    if (b.composioKey !== undefined) {
      // One key serves OneDrive and Google Drive; a new key is a new project, so both accounts are picked again.
      saveOneDriveSettings(req.user.id, { composioKey: b.composioKey as string | null });
      saveGdrive(req.user.id, null);
    }
    if (b.account !== undefined) saveGdrive(req.user.id, b.account as string | null, b.label as string | undefined);
    return gdriveStatus(req.user.id);
  });

  app.delete("/api/gdrive", async (req) => {
    saveGdrive(req.user.id, null);
    return gdriveStatus(req.user.id);
  });

  // The Google Drive accounts connected in the key's Composio project: the typed key, or the saved one.
  app.post("/api/gdrive/accounts", async (req, reply) => {
    const typed = String((req.body as { key?: string } | undefined)?.key ?? "").trim();
    const key = typed || composioKey(req.user.id);
    if (!key) return reply.code(400).send({ error: "no_key", message: "Paste the Composio API key first." });
    try {
      return { accounts: await composioAccounts(key, "googledrive") };
    } catch (e) {
      if (e instanceof OneDriveError) return reply.code(e.code === "composio_key" ? 400 : 502).send({ error: e.code, message: e.message });
      throw e;
    }
  });
}
