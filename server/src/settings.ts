import { parseModelList, pickModel, type ModelChoice } from "@slidecraft/shared";
import { config } from "./config.js";
import { decrypt, encrypt } from "./crypto.js";
import { getDb, now } from "./db.js";
import type { LlmAuth } from "./llm/client.js";
import { AUTO_MODEL, authOf, envRoutes, routeServing, withFallbacks } from "./llm/routes.js";

export interface SettingsRow {
  openai_key_enc: string | null;
  openai_model: string | null;
  openai_image_model: string | null;
  app_theme: string | null;
  default_theme: string | null;
  openai_base: string | null;
}

/** Endpoints the Settings page offers by name. Any other OpenAI-compatible address works as "custom". */
export const PROVIDERS: { id: string; name: string; baseUrl: string }[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "mireld", name: "Mireld", baseUrl: "https://api.mireld.my/v1" },
  // Google's OpenAI-compatible endpoint: reads pictures, follows a JSON schema, has a free tier.
  { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
];

export function normaliseBase(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+/i.test(u)) throw new Error("The endpoint must be a full http(s) address");
  return u;
}

export function readSettings(userId: string): SettingsRow {
  const row = getDb().prepare("SELECT openai_key_enc, openai_model, openai_image_model, app_theme, default_theme, openai_base FROM settings WHERE user_id = ?").get(userId) as SettingsRow | undefined;
  return row ?? { openai_key_enc: null, openai_model: null, openai_image_model: null, app_theme: null, default_theme: null, openai_base: null };
}

export function writeSettings(userId: string, patch: Partial<{ openaiKey: string | null; model: string; imageModel: string; appTheme: string; defaultTheme: string; baseUrl: string }>): void {
  const cur = readSettings(userId);
  const next: SettingsRow = { ...cur };
  if (patch.openaiKey !== undefined) next.openai_key_enc = patch.openaiKey ? encrypt(patch.openaiKey) : null;
  if (patch.model !== undefined) next.openai_model = patch.model || null;
  if (patch.imageModel !== undefined) next.openai_image_model = patch.imageModel || null;
  if (patch.appTheme !== undefined) next.app_theme = patch.appTheme || null;
  if (patch.defaultTheme !== undefined) next.default_theme = patch.defaultTheme || null;
  if (patch.baseUrl !== undefined) {
    next.openai_base = patch.baseUrl ? normaliseBase(patch.baseUrl) : null;
    // A key saved against one endpoint is only ever sent to that endpoint: a new endpoint
    // without a new key forgets the old key rather than hand it to another host.
    const before = cur.openai_base ?? config.openaiBase;
    const after = next.openai_base ?? config.openaiBase;
    if (before !== after && patch.openaiKey === undefined) next.openai_key_enc = null;
  }
  getDb()
    .prepare(
      `INSERT INTO settings (user_id, openai_key_enc, openai_model, openai_image_model, app_theme, default_theme, openai_base, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET openai_key_enc = excluded.openai_key_enc, openai_model = excluded.openai_model, openai_image_model = excluded.openai_image_model, app_theme = excluded.app_theme, default_theme = excluded.default_theme, openai_base = excluded.openai_base, updated_at = excluded.updated_at`,
    )
    .run(userId, next.openai_key_enc, next.openai_model, next.openai_image_model, next.app_theme, next.default_theme, next.openai_base, now());
}

export function userKey(userId: string): string {
  const s = readSettings(userId);
  if (!s.openai_key_enc) return "";
  try {
    return decrypt(s.openai_key_enc);
  } catch {
    return "";
  }
}

export function baseUrlFor(userId: string): string {
  return readSettings(userId).openai_base || config.openaiBase;
}

/**
 * The key, endpoint and models this user's calls use: their own first, the
 * server's env second. A key saved against one endpoint is only ever sent to
 * the endpoint saved with it; the env key is only ever sent to the env endpoint.
 * The backups the server owner set up (Mireld, AfiqStore) follow as fallbacks, so a
 * call that fails on one endpoint is tried on the next. Asked for "auto", or for
 * nothing, the call starts on the default model; asked for a model a backup serves,
 * it starts on that backup.
 */
export function resolveAuth(userId: string, asked?: unknown): LlmAuth | null {
  const s = readSettings(userId);
  const own = userKey(userId);
  const routes = envRoutes();
  const want = asked === AUTO_MODEL ? undefined : asked;
  const saved = s.openai_model === AUTO_MODEL ? null : s.openai_model;
  const backups = routes.map((r) => authOf(r, config.openaiImageModel));
  // The person's own key, or else the server's, on a given model. A person's own key may run any
  // model; the server's key runs only the models the owner listed.
  const listed = modelChoices();
  const main = (m: unknown): LlmAuth | null =>
    own
      ? { apiKey: own, baseUrl: s.openai_base || config.openaiBase, model: pickModel(m, saved, config.openaiModel, []), imageModel: s.openai_image_model || config.openaiImageModel }
      : config.openaiKey
        // On the server's key the image model is the owner's too, whenever the owner has listed the models.
        ? { apiKey: config.openaiKey, baseUrl: config.openaiBase, model: pickModel(m, saved, config.openaiModel, listed), imageModel: listed.length ? config.openaiImageModel : s.openai_image_model || config.openaiImageModel }
        : null;
  // A model a backup serves (picked in the list, or saved as the default) starts on that backup with
  // its own key; the main endpoint, on its default model, is the first thing it falls back to.
  const served = routeServing(want, routes) ?? (want === undefined ? routeServing(saved, routes) : undefined);
  if (served) {
    const home = main(undefined);
    const usable = home && !routeServing(home.model, routes) ? [home] : [];
    return withFallbacks(authOf(served, home?.imageModel || config.openaiImageModel), [...usable, ...backups]);
  }
  const first = main(want);
  if (first) return withFallbacks(first, backups);
  return backups.length ? withFallbacks(backups[0], backups) : null;
}

/** The models the owner lets people pick, with the default first when it is not listed. */
export function modelChoices(): ModelChoice[] {
  return parseModelList(config.aiModels);
}

/** "Auto" first, then the listed models, then each backup model the list does not already hold. */
export function pickerChoices(listed: ModelChoice[]): ModelChoice[] {
  const out: ModelChoice[] = [{ id: AUTO_MODEL, label: "Auto (best available; switches model if one fails)" }, ...listed.filter((m) => m.id !== AUTO_MODEL)];
  for (const r of envRoutes()) if (!out.some((m) => m.id === r.model)) out.push({ id: r.model, label: `${r.model} (${r.label})` });
  return out;
}

/** The same key and endpoint on the quicker model, for planning and condensing. */
export function fastAuth(auth: LlmAuth): LlmAuth {
  return config.fastModel ? { ...auth, model: config.fastModel } : auth;
}
