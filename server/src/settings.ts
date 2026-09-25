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
}

export function readSettings(userId: string): SettingsRow {
  const row = getDb().prepare("SELECT openai_key_enc, openai_model, openai_image_model, app_theme, default_theme FROM settings WHERE user_id = ?").get(userId) as SettingsRow | undefined;
  return row ?? { openai_key_enc: null, openai_model: null, openai_image_model: null, app_theme: null, default_theme: null };
}

export function writeSettings(userId: string, patch: Partial<{ openaiKey: string | null; model: string; imageModel: string; appTheme: string; defaultTheme: string }>): void {
  const cur = readSettings(userId);
  const next: SettingsRow = { ...cur };
  if (patch.openaiKey !== undefined) next.openai_key_enc = patch.openaiKey ? encrypt(patch.openaiKey) : null;
  if (patch.model !== undefined) next.openai_model = patch.model || null;
  if (patch.imageModel !== undefined) next.openai_image_model = patch.imageModel || null;
  if (patch.appTheme !== undefined) next.app_theme = patch.appTheme || null;
  if (patch.defaultTheme !== undefined) next.default_theme = patch.defaultTheme || null;
  getDb()
    .prepare(
      `INSERT INTO settings (user_id, openai_key_enc, openai_model, openai_image_model, app_theme, default_theme, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET openai_key_enc = excluded.openai_key_enc, openai_model = excluded.openai_model, openai_image_model = excluded.openai_image_model, app_theme = excluded.app_theme, default_theme = excluded.default_theme, updated_at = excluded.updated_at`,
    )
    .run(userId, next.openai_key_enc, next.openai_model, next.openai_image_model, next.app_theme, next.default_theme, now());
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

/** The key and models this user's calls use: their own key first, the server's env key second. */
export function resolveAuth(userId: string): LlmAuth | null {
  const s = readSettings(userId);
  const apiKey = userKey(userId) || config.openaiKey;
  if (!apiKey) return null;
  return { apiKey, model: s.openai_model || config.openaiModel, imageModel: s.openai_image_model || config.openaiImageModel };
}
