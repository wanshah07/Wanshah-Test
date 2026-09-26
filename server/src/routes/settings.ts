import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { maskKey } from "../crypto.js";
import { checkKey, hostOf } from "../llm/client.js";
import { baseUrlFor, normaliseBase, PROVIDERS, readSettings, userKey, writeSettings } from "../settings.js";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings", async (req) => {
    const s = readSettings(req.user.id);
    const own = userKey(req.user.id);
    const baseUrl = baseUrlFor(req.user.id);
    return {
      user: req.user,
      authMode: config.authMode,
      mockLlm: config.mockLlm,
      key: { own: maskKey(own), server: config.openaiKey ? maskKey(config.openaiKey) : "", active: own ? "own" : config.openaiKey ? "server" : "none" },
      endpoint: {
        baseUrl,
        host: hostOf(baseUrl),
        provider: PROVIDERS.find((p) => p.baseUrl === baseUrl)?.id ?? "custom",
        serverBaseUrl: config.openaiBase,
      },
      providers: PROVIDERS,
      model: s.openai_model || config.openaiModel,
      imageModel: s.openai_image_model || config.openaiImageModel,
      defaults: { model: config.openaiModel, imageModel: config.openaiImageModel },
      appTheme: s.app_theme || "system",
      defaultTheme: s.default_theme || "facerinna",
    };
  });

  app.put("/api/settings", async (req, reply) => {
    const b = (req.body ?? {}) as { openaiKey?: string | null; model?: string; imageModel?: string; appTheme?: string; defaultTheme?: string; baseUrl?: string | null };
    const patch: Parameters<typeof writeSettings>[1] = {};
    if (b.openaiKey !== undefined) patch.openaiKey = b.openaiKey === null ? null : String(b.openaiKey).trim();
    if (b.model !== undefined) patch.model = String(b.model).trim();
    if (b.imageModel !== undefined) patch.imageModel = String(b.imageModel).trim();
    if (b.appTheme !== undefined) patch.appTheme = ["light", "dark", "system"].includes(String(b.appTheme)) ? String(b.appTheme) : "system";
    if (b.defaultTheme !== undefined) patch.defaultTheme = String(b.defaultTheme).trim();
    if (b.baseUrl !== undefined) patch.baseUrl = b.baseUrl === null ? "" : String(b.baseUrl);
    try {
      writeSettings(req.user.id, patch);
    } catch (e) {
      return reply.code(400).send({ error: "invalid", message: (e as Error).message });
    }
    return { ok: true };
  });

  // Tests the key typed in the box against the endpoint typed in the box, so
  // both can be tried before either is saved.
  app.post("/api/settings/test-key", async (req) => {
    const b = (req.body ?? {}) as { openaiKey?: string; baseUrl?: string };
    let baseUrl: string;
    try {
      baseUrl = b.baseUrl ? normaliseBase(b.baseUrl) : baseUrlFor(req.user.id);
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
    const typed = (b.openaiKey ?? "").trim();
    const key = typed || userKey(req.user.id) || (baseUrl === config.openaiBase ? config.openaiKey : "");
    if (!key) return { ok: false, message: `No key to test against ${hostOf(baseUrl)}.` };
    return checkKey(key, baseUrl);
  });
}
