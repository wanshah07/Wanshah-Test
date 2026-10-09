import { getDb, now } from "../db.js";
import { deckSkillBlock, HOUSE_DEFAULT, HOUSE_HEADER, HOUSE_MAX, houseValue } from "@slidecraft/shared";

// The rules themselves are in shared/src/house.ts, so the page can show them too.
export { HOUSE_DEFAULT, HOUSE_DESIGN, HOUSE_HEADER, HOUSE_MAX } from "@slidecraft/shared";

/**
 * The house rules as one block for a system prompt: the person's own when they wrote some, the
 * built-in ones when not, then the built-in deck skill, which every deck follows.
 */
export function houseDesign(custom?: string | null): string {
  const body = custom?.trim() ? custom.trim().slice(0, HOUSE_MAX) : HOUSE_DEFAULT;
  return `${HOUSE_HEADER}\n${body}\n\n${deckSkillBlock()}`;
}

/** The person's own instructions for every deck, or null for the built-in ones. */
export function houseFor(userId: string): string | null {
  const r = getDb().prepare("SELECT house_prompt FROM settings WHERE user_id = ?").get(userId) as { house_prompt: string | null } | undefined;
  return r?.house_prompt?.trim() ? r.house_prompt : null;
}

/** Saves the person's instructions; empty text, or the built-in text unchanged, goes back to the built-in rules. */
export function saveHouse(userId: string, text: string | null): void {
  const value = houseValue(text);
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)").run(userId, now());
  db.prepare("UPDATE settings SET house_prompt = ?, updated_at = ? WHERE user_id = ?").run(value, now(), userId);
}
