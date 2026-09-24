import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { maskKey } from "../crypto.js";
import { checkKey } from "../llm/client.js";
import { readSettings, userKey, writeSettings } from "../settings.js";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings", async (req) => {
    const s = readSettings(req.user.id);
    const own = userKey(req.user.id);
    return {
      user: req.user,
      authMode: config.authMode,
      mockLlm: config.mockLlm,
      key: { own: maskKey(own), server: config.openaiKey ? maskKey(config.openaiKey) : "", active: own ? "own" : config.openaiKey ? "server" : "none" },
      model: s.openai_model || config.openaiModel,
      imageModel: s.openai_image_model || config.openaiImageModel,
      defaults: { model: config.openaiModel, imageModel: config.openaiImageModel },
      appTheme: s.app_theme || "system",
      defaultTheme: s.default_theme || "facerinna",
    };
  });

  app.put("/api/settings", async (req) => {
    const b = (req.body ?? {}) as { openaiKey?: string | null; model?: string; imageModel?: string; appTheme?: string; defaultTheme?: string };
    const patch: Parameters<typeof writeSettings>[1] = {};
    if (b.openaiKey !== undefined) patch.openaiKey = b.openaiKey === null ? null : String(b.openaiKey).trim();
    if (b.model !== undefined) patch.model = String(b.model).trim();
    if (b.imageModel !== undefined) patch.imageModel = String(b.imageModel).trim();
    if (b.appTheme !== undefined) patch.appTheme = ["light", "dark", "system"].includes(String(b.appTheme)) ? String(b.appTheme) : "system";
    if (b.defaultTheme !== undefined) patch.defaultTheme = String(b.defaultTheme).trim();
    writeSettings(req.user.id, patch);
    return { ok: true };
  });

  app.post("/api/settings/test-key", async (req) => {
    const b = (req.body ?? {}) as { openaiKey?: string };
    const key = (b.openaiKey ?? "").trim() || userKey(req.user.id) || config.openaiKey;
    if (!key) return { ok: false, message: "No key to test." };
    return checkKey(key);
  });
}
