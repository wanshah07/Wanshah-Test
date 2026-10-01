import type { FastifyInstance } from "fastify";
import { DEFAULT_THEME_ID, pickModel } from "@slidecraft/shared";
import { HOUSE_DEFAULT, HOUSE_MAX, houseFor, saveHouse } from "../llm/house.js";
import { config } from "../config.js";
import { maskKey } from "../crypto.js";
import { checkKey, hostOf, NOT_A_WRITER } from "../llm/client.js";
import { baseUrlFor, modelChoices, normaliseBase, PROVIDERS, readSettings, resolveAuth, userKey, writeSettings } from "../settings.js";
import { knownVision, visionFor } from "../llm/vision.js";
import { pictureAuth, readerSettings, saveReader } from "../reader.js";

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
      // About whoever reads pictures: the picture reader when set up, else the writer.
      vision: (() => {
        const auth = pictureAuth(req.user.id);
        return auth ? knownVision(req.user.id, auth) : "unknown";
      })(),
      reader: (() => {
        const r = readerSettings(req.user.id);
        return { baseUrl: r.baseUrl, model: r.model, key: maskKey(r.key), complete: r.complete };
      })(),
      appTheme: s.app_theme || "system",
      defaultTheme: s.default_theme || DEFAULT_THEME_ID,
    };
  });

  // The models a person can pick for a deck, a Studio output or a chat, and the one in effect.
  app.get("/api/models", async (req) => {
    const s = readSettings(req.user.id);
    const own = !!userKey(req.user.id);
    const listed = own ? [] : modelChoices();
    const current = pickModel(undefined, s.openai_model, config.openaiModel, listed);
    const models = listed.some((m) => m.id === current) ? listed : [{ id: current, label: current }, ...listed];
    return { current, models, fast: config.fastModel || null, open: !listed.length };
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

  // The instructions every deck follows: the person's own, or the built-in house rules.
  app.get("/api/settings/house", async (req) => {
    const own = houseFor(req.user.id);
    return { text: own ?? HOUSE_DEFAULT, custom: !!own, default: HOUSE_DEFAULT, max: HOUSE_MAX };
  });

  app.put("/api/settings/house", async (req, reply) => {
    const text = (req.body as { text?: unknown } | undefined)?.text;
    if (text !== null && typeof text !== "string") return reply.code(400).send({ error: "invalid", message: "text must be text, or null to go back to the built-in rules" });
    if (typeof text === "string" && text.length > HOUSE_MAX) return reply.code(400).send({ error: "too_long", message: `Keep the instructions under ${HOUSE_MAX.toLocaleString("en")} characters.` });
    saveHouse(req.user.id, text);
    const own = houseFor(req.user.id);
    return { text: own ?? HOUSE_DEFAULT, custom: !!own, default: HOUSE_DEFAULT, max: HOUSE_MAX };
  });

  // Tests the key typed in the box against the endpoint typed in the box, so
  // both can be tried before either is saved.
  app.post("/api/settings/test-key", async (req) => {
    const b = (req.body ?? {}) as { openaiKey?: string; baseUrl?: string; model?: string };
    let baseUrl: string;
    try {
      baseUrl = b.baseUrl ? normaliseBase(b.baseUrl) : baseUrlFor(req.user.id);
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
    const typed = (b.openaiKey ?? "").trim();
    // The saved key goes only to the endpoint it was saved with; a different endpoint is tested with the key typed for it.
    const saved = baseUrl === baseUrlFor(req.user.id) ? userKey(req.user.id) : "";
    const key = typed || saved || (baseUrl === config.openaiBase ? config.openaiKey : "");
    if (!key) return { ok: false, message: `No key to test against ${hostOf(baseUrl)}.` };
    const r = await checkKey(key, baseUrl);
    if (!r.ok) return r;
    // Also find out, and remember, whether the writer model can read pictures.
    const st = readSettings(req.user.id);
    const model = (b as { model?: string }).model?.trim() || st.openai_model || config.openaiModel;
    if (NOT_A_WRITER.test(model)) return { ...r, vision: "unknown", message: `${r.message} The writer model ${model} makes pictures or speech, not text, so it cannot write a deck: pick one of the writer models below, save it, and press Test again.` };
    if (r.models && r.models.length && !r.models.includes(model)) return { ...r, vision: "unknown", message: `${r.message} The writer model ${model} is not in this list: pick one below, save it, and press Test again.` };
    const vision = await visionFor(req.user.id, { apiKey: key, baseUrl, model, imageModel: st.openai_image_model || config.openaiImageModel }, true);
    const words = vision === "yes" ? `${model} reads pictures: uploaded pictures are read before a deck is written.` : vision === "no" ? `${model} cannot read pictures: uploaded pictures are used only as slide pictures, and you are warned before a deck is written.` : `Could not check whether ${model} reads pictures.`;
    return { ...r, vision, message: `${r.message} ${words}` };
  });

  // The picture reader: a second endpoint that only reads uploaded pictures.
  app.put("/api/settings/reader", async (req, reply) => {
    const b = (req.body ?? {}) as { key?: string | null; baseUrl?: string | null; model?: string | null };
    for (const [k, v] of Object.entries(b)) if (v !== undefined && v !== null && typeof v !== "string") return reply.code(400).send({ error: "invalid", message: `${k} must be text` });
    try {
      saveReader(req.user.id, { key: b.key, baseUrl: b.baseUrl, model: b.model });
    } catch (e) {
      return reply.code(400).send({ error: "invalid", message: (e as Error).message });
    }
    return { ok: true };
  });

  app.delete("/api/settings/reader", async (req) => {
    saveReader(req.user.id, { key: null, baseUrl: null, model: null });
    return { ok: true };
  });

  app.post("/api/settings/reader/test", async (req) => {
    const b = (req.body ?? {}) as { key?: string; baseUrl?: string; model?: string };
    const saved = readerSettings(req.user.id);
    let baseUrl: string;
    try {
      baseUrl = normaliseBase(b.baseUrl || saved.baseUrl || "");
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
    // The saved key only goes to the endpoint it was saved with.
    const key = (b.key ?? "").trim() || (baseUrl === saved.baseUrl ? saved.key : "");
    if (!key) return { ok: false, message: `No key to test against ${hostOf(baseUrl)}.` };
    const r = await checkKey(key, baseUrl);
    if (!r.ok) return r;
    const model = (b.model ?? "").trim() || saved.model;
    if (!model) return { ...r, vision: "unknown", message: `${r.message} Pick a model below, save it, and press Test again.` };
    if (NOT_A_WRITER.test(model)) return { ...r, vision: "unknown", message: `${r.message} ${model} makes pictures or speech; a picture reader must be a model that reads pictures and answers in text.` };
    const vision = await visionFor(req.user.id, { apiKey: key, baseUrl, model, imageModel: "" }, true);
    const words = vision === "yes" ? `${model} reads pictures: it will read uploaded pictures for the writer.` : vision === "no" ? `${model} cannot read pictures; pick another model.` : `Could not check whether ${model} reads pictures (the endpoint may be busy); try Test again.`;
    return { ...r, vision, message: `${r.message} ${words}` };
  });
}
