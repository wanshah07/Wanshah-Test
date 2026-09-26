import { config } from "./config.js";
import { decrypt, encrypt } from "./crypto.js";
import { getDb, now } from "./db.js";
import type { LlmAuth } from "./llm/client.js";

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
  if (patch.baseUrl !== undefined) next.openai_base = patch.baseUrl ? normaliseBase(patch.baseUrl) : null;
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
 */
export function resolveAuth(userId: string): LlmAuth | null {
  const s = readSettings(userId);
  const own = userKey(userId);
  if (own) return { apiKey: own, baseUrl: s.openai_base || config.openaiBase, model: s.openai_model || config.openaiModel, imageModel: s.openai_image_model || config.openaiImageModel };
  if (!config.openaiKey) return null;
  return { apiKey: config.openaiKey, baseUrl: config.openaiBase, model: s.openai_model || config.openaiModel, imageModel: s.openai_image_model || config.openaiImageModel };
}
