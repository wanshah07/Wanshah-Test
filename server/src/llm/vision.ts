import { PNG } from "pngjs";
import { getDb, now } from "../db.js";
import { chatText, LlmError, type ContentPart, type LlmAuth } from "./client.js";

// Whether the writer model can read pictures, found out once per endpoint and
// model with a tiny test picture and remembered. A model that can is given the
// pictures uploaded as sources to read; one that cannot is not allowed to
// write as if it had read them without the user saying so.

export type Vision = "yes" | "no" | "unknown";

const IMAGE_REFUSED = /image|vision|multimodal|multi-modal|image_url|content.*(type|part)|does not support|unsupported/i;

/** A 16x16 picture of one colour. */
function swatch(rgb: [number, number, number]): string {
  const png = new PNG({ width: 16, height: 16 });
  for (let i = 0; i < 256; i++) png.data.set([...rgb, 255], i * 4);
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

/**
 * Sends a red square and asks its colour. "no" when the endpoint refuses
 * pictures or the model answers without having seen it; throws when the
 * endpoint cannot be reached, which says nothing about pictures.
 */
export async function probeVision(auth: LlmAuth): Promise<"yes" | "no"> {
  const user: ContentPart[] = [
    { type: "text", text: "What colour fills this picture? Answer with one word." },
    { type: "image_url", image_url: { url: swatch([220, 30, 30]), detail: "low" } },
  ];
  try {
    const answer = await chatText(auth, "You answer questions about pictures in one word.", user, 20, 45000);
    return /\bred\b|merah/i.test(answer) ? "yes" : "no";
  } catch (e) {
    if (e instanceof LlmError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429 && IMAGE_REFUSED.test(e.message)) return "no";
    throw e;
  }
}

function key(auth: LlmAuth): string {
  return `${auth.baseUrl}|${auth.model}`;
}

export function knownVision(userId: string, auth: LlmAuth): Vision {
  const r = getDb().prepare("SELECT vision_ok, vision_for FROM settings WHERE user_id = ?").get(userId) as { vision_ok: string | null; vision_for: string | null } | undefined;
  if (!r || r.vision_for !== key(auth)) return "unknown";
  return r.vision_ok === "yes" ? "yes" : r.vision_ok === "no" ? "no" : "unknown";
}

function remember(userId: string, auth: LlmAuth, v: "yes" | "no"): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)").run(userId, now());
  db.prepare("UPDATE settings SET vision_ok = ?, vision_for = ? WHERE user_id = ?").run(v, key(auth), userId);
}

/** The remembered answer, or a fresh probe; "unknown" when the probe itself could not run. */
export async function visionFor(userId: string, auth: LlmAuth, fresh = false): Promise<Vision> {
  const known = fresh ? "unknown" : knownVision(userId, auth);
  if (known !== "unknown") return known;
  try {
    const v = await probeVision(auth);
    remember(userId, auth, v);
    return v;
  } catch {
    return "unknown";
  }
}

export const NOTHING = "NONE";

/** What a picture says, as notes a slide writer can cite; NONE for a picture with nothing to read. */
export async function readPicture(auth: LlmAuth, name: string, buf: Buffer, mime: string): Promise<string> {
  const user: ContentPart[] = [
    {
      type: "text",
      text: `This picture is a source for a slide deck, file "${name}". Transcribe everything in it a writer could cite: all text word for word in its own language, tables as rows with cells separated by " | ", chart titles, axes, values and units, labels and legends. Plain notes only; do not describe colours or layout and do not add anything that is not in the picture. If it carries no readable information (a photo of a place, object or person), answer exactly ${NOTHING}.`,
    },
    { type: "image_url", image_url: { url: `data:${mime};base64,${buf.toString("base64")}`, detail: "high" } },
  ];
  const out = (await chatText(auth, "You transcribe pictures exactly. You never invent content.", user, 3000, 120000)).trim();
  return out || NOTHING;
}
