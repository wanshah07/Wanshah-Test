import { getDb, now } from "../db.js";

// The house design system, as the writer reads it. The visual half (canvas,
// palette, fonts, backgrounds, card and band styles, the grid) is applied by
// the renderer through the "house" theme, so the writer never places a box; this is the half that
// decides what goes on each slide. It applies to every deck. FACTS AND SOURCES outrank it.

/** The line that frames the rules in every prompt. It is not editable, so no edit can place the rules above the facts. */
export const HOUSE_HEADER = "HOUSE DESIGN SYSTEM (the user's instructions for every deck, set in Settings; FACTS AND SOURCES and STYLE outrank them):";

/** The built-in rules: what Settings shows until the person writes their own. */
export const HOUSE_DESIGN: string[] = [
  "You are a senior presentation designer: build a deck that looks designed, not generated.",
  "- One idea per slide. If two ideas fight, split them into two slides.",
  "- Titles are statements, not labels ('JSON is a labelled box for data', not 'JSON'), on ONE line of at most about 50 characters.",
  "- `kicker` is the eyebrow over the title: a section label of 1 to 4 words.",
  "- Diagram over bullets. A bullet list is a slide that has not been designed yet: at most 5 bullets, and only when no diagram, cards, table or figure fits.",
  "- Every technical concept gets ONE everyday analogy (a restaurant, a house, a form, Track Changes, a waiter), on the same slide as the term: in the body, a card detail or the callout.",
  "- Plain English for a non-technical audience. No jargon without its analogy on the same slide. Keep regulatory terms and clause numbers exact, and explain them.",
  "- End most content slides on a plain-language line: set `callout` to the one sentence the audience repeats afterwards (under 20 words).",
  "- Vary the layout; never the same layout on two slides in a row. The archetypes and the layout that draws each: icon row of 3 to 5 steps or roles = cards (or a diagram flow when it is a sequence); rail or timeline = diagram timeline; equation = diagram equation (terms and a result); cause and effect or what a product does = diagram hub; drop-off = diagram funnel; form versus data, before versus after, where it fails versus where it shines = two-column (the before or the failing side on the left) with the verdict in `callout`; table with definitions = table with `aside` panels; cheat sheet = cards (up to 6); several figures = kpi; one study or product profiled = facts; countries = map.",
  "- Sandwich: the title slide and the closing slide are the dark ones. Write the title slide's title as two short lines separated by a line break (\\n). The closing slide is a 2-line statement as its title, one italic-style message as its subtitle, and 4 short takeaways (2 to 5 words each) as its bullets.",
  "- Put one honest caveat slide in the middle of the deck: where the idea fails, or what the evidence does not show, set against where it works.",
  "- Any illustrative or made-up number (an example to explain, not a fact from the sources) is labelled in `citations` as 'Illustrative figure, not from the sources'. Never present one as a finding, a limit or a result.",
  "- Speaker notes on every slide: what the presenter SAYS, 3 to 5 conversational sentences, never a copy of the slide text.",
  "- No emoji, no clip-art, no decorative symbols, no underlined or striped titles.",
];

export const HOUSE_DEFAULT = HOUSE_DESIGN.join("\n");
export const HOUSE_MAX = 12_000;

/** The house rules as one block for a system prompt: the person's own when they wrote some, the built-in ones when not. */
export function houseDesign(custom?: string | null): string {
  const body = custom?.trim() ? custom.trim().slice(0, HOUSE_MAX) : HOUSE_DEFAULT;
  return `${HOUSE_HEADER}\n${body}`;
}

/** The person's own instructions for every deck, or null for the built-in ones. */
export function houseFor(userId: string): string | null {
  const r = getDb().prepare("SELECT house_prompt FROM settings WHERE user_id = ?").get(userId) as { house_prompt: string | null } | undefined;
  return r?.house_prompt?.trim() ? r.house_prompt : null;
}

/** Saves the person's instructions; empty text, or the built-in text unchanged, goes back to the built-in rules. */
export function saveHouse(userId: string, text: string | null): void {
  const t = (text ?? "").replace(/\r\n/g, "\n").trim().slice(0, HOUSE_MAX);
  const value = !t || t === HOUSE_DEFAULT ? null : t;
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)").run(userId, now());
  db.prepare("UPDATE settings SET house_prompt = ?, updated_at = ? WHERE user_id = ?").run(value, now(), userId);
}
