import type { FastifyInstance } from "fastify";
import type { Theme } from "@slidecraft/shared";
import { config } from "../config.js";
import { resolveAuth } from "../settings.js";
import { analyseReference, DesignError, type RefFile } from "../design/extract.js";
import { createDesign, deleteDesign, deletePrompt, getDesign, listDesigns, listPrompts, savePrompt, updateDesign } from "../library.js";

function validTheme(t: unknown): t is Theme {
  const x = t as Theme;
  return !!x && typeof x === "object" && typeof x.fontDisplay === "string" && typeof x.fontBody === "string" && !!x.colors && typeof x.colors.bg === "string";
}

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/designs", async (req) => listDesigns(req.user.id));

  app.get("/api/designs/:did", async (req, reply) => {
    const d = getDesign(req.user.id, (req.params as { did: string }).did);
    return d ?? reply.code(404).send({ error: "not_found" });
  });

  // Reference files in, a saved design out. Fields: name (optional), files.
  app.post("/api/designs/analyse", async (req, reply) => {
    const files: RefFile[] = [];
    let name = "";
    for await (const part of req.parts()) {
      if (part.type === "file") files.push({ name: decodeURIComponent(part.filename), buf: await part.toBuffer() });
      else if (part.fieldname === "name") name = String(part.value ?? "").trim();
    }
    const label = name || files[0]?.name.replace(/\.[^.]+$/, "") || "Reference design";
    try {
      const auth = config.mockLlm ? null : resolveAuth(req.user.id);
      const draft = await analyseReference(files, label, auth);
      const d = createDesign(req.user.id, { name: draft.name, theme: draft.theme, notes: draft.notes, analysis: draft.analysis, preview: draft.preview, sourceName: draft.analysis.files.join(", ") });
      return d;
    } catch (e) {
      if (e instanceof DesignError) return reply.code(400).send({ error: "unreadable", message: e.message });
      throw e;
    }
  });

  // Save a deck's current theme as a design.
  app.post("/api/designs", async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; theme?: unknown; notes?: string };
    if (!b.name?.trim() || !validTheme(b.theme)) return reply.code(400).send({ error: "invalid", message: "A name and a theme are needed." });
    const { logoMediaId: _l, footer: _f, ...theme } = b.theme;
    return createDesign(req.user.id, { name: b.name.trim(), theme: theme as Theme, notes: (b.notes ?? "").slice(0, 4000) });
  });

  app.put("/api/designs/:did", async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; notes?: string; theme?: unknown };
    if (b.theme !== undefined && !validTheme(b.theme)) return reply.code(400).send({ error: "invalid_theme" });
    const d = updateDesign(req.user.id, (req.params as { did: string }).did, { name: b.name, notes: b.notes?.slice(0, 4000), theme: b.theme as Theme | undefined });
    return d ?? reply.code(404).send({ error: "not_found" });
  });

  app.delete("/api/designs/:did", async (req, reply) => {
    return deleteDesign(req.user.id, (req.params as { did: string }).did) ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });

  app.get("/api/prompts", async (req) => listPrompts(req.user.id));

  app.post("/api/prompts", async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; text?: string; isDefault?: boolean };
    const p = savePrompt(req.user.id, { name: String(b.name ?? ""), text: String(b.text ?? ""), isDefault: !!b.isDefault });
    return p ?? reply.code(400).send({ error: "invalid", message: "A prompt needs a name and some text." });
  });

  app.put("/api/prompts/:pid", async (req, reply) => {
    const b = (req.body ?? {}) as { name?: string; text?: string; isDefault?: boolean };
    const p = savePrompt(req.user.id, { id: (req.params as { pid: string }).pid, name: String(b.name ?? ""), text: String(b.text ?? ""), isDefault: !!b.isDefault });
    return p ?? reply.code(400).send({ error: "invalid", message: "A prompt needs a name and some text." });
  });

  app.delete("/api/prompts/:pid", async (req, reply) => {
    return deletePrompt(req.user.id, (req.params as { pid: string }).pid) ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });
}
