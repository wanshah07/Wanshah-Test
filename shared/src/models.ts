// The writer models a person may pick from. On the team link the owner lists
// them once (the AI_MODELS repository variable); on a Node server, the
// AI_MODELS setting. Each entry is a model id, optionally with a label after
// "=": "claude-opus-5.5=Claude Opus 5.5 (best), gpt-6-luna=GPT-6 Luna (fast)".

export interface ModelChoice {
  id: string;
  label: string;
}

const ID = /^[A-Za-z0-9][\w.:/-]{0,79}$/;

/** A model id safe to send to an endpoint and to store, or "" when it is not one. */
export function cleanModelId(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return ID.test(s) ? s : "";
}

export function parseModelList(text: string | undefined | null): ModelChoice[] {
  const seen = new Set<string>();
  const out: ModelChoice[] = [];
  for (const part of String(text ?? "").split(/[,\n]/)) {
    const [rawId, ...rest] = part.split("=");
    const id = cleanModelId(rawId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = rest.join("=").trim().replace(/[<>]/g, "").slice(0, 80);
    out.push({ id, label: label || id });
  }
  return out.slice(0, 30);
}

/**
 * The model a request runs on: the one asked for when the list allows it, else the person's
 * own choice when the list allows that, else the default. An empty list allows anything.
 */
export function pickModel(asked: unknown, own: string | null | undefined, fallback: string, allowed: ModelChoice[]): string {
  const ok = (m: string) => !!m && (!allowed.length || allowed.some((x) => x.id === m));
  const a = cleanModelId(asked);
  if (ok(a)) return a;
  const o = cleanModelId(own);
  if (ok(o)) return o;
  return fallback;
}
