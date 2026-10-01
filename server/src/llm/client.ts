import { config } from "../config.js";

// Plain fetch against the OpenAI HTTP API. No SDK: the two calls this app makes
// are small, and a dependency that changes shape every quarter is not worth it.

export interface LlmAuth {
  apiKey: string;
  model: string;
  imageModel: string;
  /** OpenAI-compatible endpoint, ending in /v1. */
  baseUrl: string;
}

export class LlmError extends Error {
  /** The start of what the model actually sent, when that is why the call failed. */
  raw?: string;
  constructor(message: string, public status = 0, public code = "llm_error") {
    super(message);
  }
}

/** How much of a model's reply is kept for the log when it cannot be used. */
export const RAW_KEEP = 500;

export function rawSnippet(text: string): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= RAW_KEEP) return t;
  // The end says as much as the start: a reply cut off mid-slide and one with prose after the JSON look
  // the same at the front.
  return `${t.slice(0, RAW_KEEP)}… [${t.length.toLocaleString("en-US")} characters in all; it ends: …${t.slice(-160)}]`;
}

/**
 * Walks a reply as JSON text, outside strings: every complete top-level {...} it holds, and whether
 * it ends with a bracket or a string still open (the reply was cut off).
 */
export function scanJson(text: string): { objects: string[]; open: boolean } {
  const objects: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) inStr = true;
    } else if (ch === "{" || ch === "[") {
      if (depth === 0 && ch === "{") start = i;
      if (depth > 0 || ch === "{") depth++;
    } else if ((ch === "}" || ch === "]") && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return { objects, open: depth > 0 || inStr };
}

/** JSON.parse, and then again with the two slips models make most: trailing commas and // comments. */
function parseLoose(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    const fixed = t.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(fixed);
  }
}

/** The JSON rules, written into the instructions for every call. */
export function jsonRules(schema: Record<string, unknown>): string {
  return `OUTPUT FORMAT: answer with one JSON object and nothing else: no prose, no code fences, no comments. It must match this JSON Schema exactly, every listed property present, null where a value is unknown:\n${JSON.stringify(schema)}`;
}

/** For a list whose items came back in the wrong shape, the keys each item must use. */
function itemRule(schema: Record<string, unknown>, missing: string[]): string {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return [...new Set(missing.filter((m) => m.includes("[]")).map((m) => m.split("[]")[0]))]
    .map((k) => ` Each item of ${k} must use exactly these keys: ${Object.keys(((props[k]?.items as Record<string, unknown>)?.properties as object) ?? {}).join(", ")}.`)
    .join("");
}

/** Top-level keys the schema requires that the answer lacks. */
export function missingKeys(value: unknown, schema: Record<string, unknown>): string[] {
  const req = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return req;
  const v = value as Record<string, unknown>;
  const out = req.filter((k) => !(k in v));
  // One level down: a list whose items were written in a shape of the model's own (heading and
  // content where the schema says title and body) is as unusable as a missing list.
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const k of req) {
    const items = props[k]?.items as Record<string, unknown> | undefined;
    const itemReq = Array.isArray(items?.required) ? (items!.required as string[]) : [];
    const first = Array.isArray(v[k]) ? (v[k] as unknown[])[0] : undefined;
    if (!itemReq.length || !first || typeof first !== "object") continue;
    const lacking = itemReq.filter((x) => !(x in (first as object)));
    if (lacking.length > itemReq.length / 2 || lacking.includes("title")) out.push(`${k}[].${lacking.slice(0, 6).join(`, ${k}[].`)}`);
  }
  return out;
}

export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * The endpoint's own reason for refusing. OpenAI sends {error:{message}};
 * Gemini sends a list, [{error:{message, status}}]; some gateways send a
 * bare message or plain text.
 */
export function errorOf(json: unknown): { message: string; code: string } {
  const j = (Array.isArray(json) ? json[0] : json) as Record<string, unknown> | undefined;
  const e = j?.error;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; code?: unknown; status?: unknown };
    return { message: String(o.message ?? "").slice(0, 400), code: typeof o.code === "string" ? o.code : typeof o.status === "string" ? o.status : "" };
  }
  if (typeof e === "string") return { message: e.slice(0, 400), code: "" };
  if (typeof j?.message === "string") return { message: j.message.slice(0, 400), code: "" };
  if (typeof j?.raw === "string") return { message: j.raw.replace(/\s+/g, " ").trim().slice(0, 200), code: "" };
  return { message: "", code: "" };
}

/** Longest wait for a rate limit before giving up and saying so. */
export const MAX_RATE_WAIT_S = 90;

/** How long a 429 asks to wait, from Retry-After, Google's retryDelay or "retry in N s" in the message. */
export function retryAfterSeconds(header: string | null, body: string): number | null {
  if (header && /^\d+(\.\d+)?$/.test(header.trim())) return Number(header);
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body) ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(body);
  return m ? Number(m[1]) : null;
}

async function call(auth: LlmAuth, path: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const host = hostOf(auth.baseUrl);
  let last: LlmError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${auth.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${auth.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      if (res.ok) return json;
      const err = errorOf(json);
      last = new LlmError(err.message ? `${host} answered ${res.status}: ${err.message}` : `${host} answered ${res.status}`, res.status, err.code || `http_${res.status}`);
      if (res.status === 429) {
        // A rate limit says how long to wait. Wait that long when it is short (a per-minute limit);
        // a long wait means a daily limit, where retrying now only spends another request.
        const wait = retryAfterSeconds(res.headers.get("retry-after"), text);
        // Google names a daily quota in its quotaId ("…PerDay…") and still says "retry in 58 s";
        // waiting cannot help there, so stop before spending another request.
        if (/PerDay/.test(text) || (wait !== null && wait > MAX_RATE_WAIT_S)) throw last;
        if (attempt < 2) await new Promise((r) => setTimeout(r, wait !== null ? (wait + 1) * 1000 : 1500 * (attempt + 1)));
        continue;
      }
      if (res.status >= 500) {
        // A busy model ("high demand", 503) needs longer than a blip to clear. Any other 5xx is sent again
        // once: a gateway that answered 502 after the model finished would otherwise bill the deck three times.
        if (res.status !== 503 && attempt >= 1) throw last;
        await new Promise((r) => setTimeout(r, (res.status === 503 ? 5000 : 1500) * (attempt + 1)));
        continue;
      }
      throw last;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      // A silent endpoint is not retried: three more waits of the full timeout
      // would hang a generation for many minutes and change nothing.
      if ((e as Error).name === "AbortError") throw new LlmError(`${host} accepted the request but sent no answer within ${Math.round(timeoutMs / 1000)} s`, 0, "timeout");
      last = new LlmError(`Could not reach ${host}: ${(e as Error).message}`, 0, "network");
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw last ?? new LlmError(`Call to ${host} failed`);
}

/**
 * Pull a JSON object out of an answer that may carry code fences or prose around it, or several objects
 * one after another (a plan, then the deck). With `want`, the object holding most of those keys wins.
 */
export function extractJson(text: string, want: string[] = []): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fenced = [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const found: unknown[] = [];
  for (const chunk of [...fenced, ...scanJson(t).objects]) {
    try {
      const v = parseLoose(chunk);
      if (v && typeof v === "object" && !Array.isArray(v)) found.push(v);
    } catch {
      /* not this one */
    }
  }
  if (found.length) {
    const score = (v: unknown) => want.filter((k) => k in (v as object)).length;
    return found.reduce((best, v) => (score(v) > score(best) || (score(v) === score(best) && JSON.stringify(v).length > JSON.stringify(best).length) ? v : best));
  }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return parseLoose(t.slice(a, b + 1));
  throw new Error("no JSON object in the answer");
}

// Gateways that speak the OpenAI protocol differ in what they accept. These
// are the refusals worth one adjusted retry; anything else is a real error.
const MAX_COMPLETION_REFUSED = /max_completion_tokens/i;
const TEMPERATURE_REFUSED = /temperature/i;

/** OpenAI chat content parts, for a message that carries pictures. */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface ChatJsonArgs {
  auth: LlmAuth;
  system: string;
  user: string | ContentPart[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  /** Per-request wait before an endpoint counts as silent. */
  timeoutMs?: number;
}

export async function chatJson<T>(a: ChatJsonArgs): Promise<T> {
  let mode: "schema" | "object" = "schema";
  let tokenKey: "max_completion_tokens" | "max_tokens" = "max_completion_tokens";
  let sendTemperature = !/^(o\d|gpt-5)/.test(a.auth.model);
  // A reply that is not JSON, or JSON in the wrong shape, gets another turn with the reply shown back
  // and the rules restated; a reply that is still not JSON gets one more.
  let followUp: { role: "assistant" | "user"; content: string }[] = [];
  let corrections = 0;
  const keys = Object.keys((a.schema.properties as Record<string, unknown>) ?? {});
  for (let round = 0; round < 7; round++) {
    // The rules are written into the instructions on every call, not only set
    // as response_format: gateways and models that ignore the request setting
    // still read the instructions.
    const system = `${a.system}\n\n${jsonRules(a.schema)}`;
    const body: Record<string, unknown> = {
      model: a.auth.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: a.user },
        ...followUp,
      ],
      response_format: mode === "schema" ? { type: "json_schema", json_schema: { name: a.schemaName, strict: true, schema: a.schema } } : { type: "json_object" },
      [tokenKey]: a.maxTokens ?? 16000,
    };
    if (sendTemperature) body.temperature = a.temperature ?? 0.4;
    let json: Record<string, unknown>;
    try {
      json = await call(a.auth, "/chat/completions", body, a.timeoutMs ?? 240000);
    } catch (e) {
      if (!(e instanceof LlmError) || e.status !== 400) throw e;
      if (tokenKey === "max_completion_tokens" && MAX_COMPLETION_REFUSED.test(e.message)) {
        tokenKey = "max_tokens";
        continue;
      }
      if (sendTemperature && TEMPERATURE_REFUSED.test(e.message)) {
        sendTemperature = false;
        continue;
      }
      // Strict schemas are where gateways differ most (Gemini accepts only a subset of JSON Schema),
      // so any other 400 in schema mode earns one try in plain JSON mode; a real error fails there too.
      if (mode === "schema") {
        mode = "object";
        continue;
      }
      throw e;
    }
    const first = (json.choices as { message?: { content?: string; refusal?: string }; finish_reason?: string }[] | undefined)?.[0];
    if (!first) throw new LlmError("The model returned no choices");
    const choice = { ...first, message: first.message ?? {} };
    if (choice.message.refusal) throw new LlmError(`The model declined: ${choice.message.refusal}`, 0, "refusal");
    if (choice.finish_reason === "length") {
      const e = new LlmError("The answer was cut off by the token limit. Ask for fewer slides or fewer sources.", 0, "length");
      e.raw = rawSnippet(choice.message.content ?? "");
      throw e;
    }
    let parsed: unknown;
    try {
      parsed = extractJson(choice.message.content ?? "", keys);
    } catch {
      parsed = undefined;
    }
    if (parsed !== undefined) {
      // Valid JSON in a shape of the model's own (a brief, an outline) is as unusable as prose,
      // and it happens most in plain JSON mode, where the schema is only in the instructions.
      const missing = missingKeys(parsed, a.schema);
      if (!missing.length) return parsed as T;
      if (corrections >= 1) {
        // Still the wrong shape after being asked again: an object is handed on for the caller to
        // salvage, anything else (null, a list, a number) is a failure the caller can report.
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
        const e = new LlmError("The model answered with JSON that is not the object asked for", 0, "parse");
        e.raw = rawSnippet(choice.message.content ?? "");
        throw e;
      }
      corrections++;
      const had = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed as object) : [];
      followUp = [
        { role: "assistant", content: (choice.message.content ?? "").slice(0, 4000) },
        { role: "user", content: `That JSON is not in the shape the OUTPUT FORMAT rules ask for: it has ${had.length ? had.join(", ") : "no keys"} and is missing ${missing.join(", ")}. Answer again with one JSON object whose top-level keys are exactly ${keys.join(", ")}, with the content inside them as the schema describes.${itemRule(a.schema, missing)} Only the JSON.` },
      ];
      continue;
    }
    const content = choice.message.content ?? "";
    // A reply that opens JSON and never closes it was cut off, whatever finish_reason the gateway sent.
    const cut = scanJson(content).open;
    if (corrections < 2) {
      corrections++;
      followUp = [
        { role: "assistant", content: content.slice(0, 4000) },
        {
          role: "user",
          content: cut
            ? `That answer stopped before the JSON was finished, so it cannot be used. Answer again, shorter: one JSON object whose top-level keys are exactly ${keys.join(", ")}; no plan, outline or notes before it; keep every text field brief. Only the JSON.`
            : `That answer is not JSON, so it cannot be used. Answer again with only one JSON object whose top-level keys are exactly ${keys.join(", ")}: start with { and end with }, no plan or outline before it, no prose, no markdown fences.`,
        },
      ];
      continue;
    }
    const e = cut
      ? new LlmError(`The model's answer stopped part way (${content.length.toLocaleString("en-US")} characters), so the endpoint probably caps how long an answer can be. Ask for fewer slides, or pick a writer model that can answer at length.`, 0, "length")
      : new LlmError("The model answered with something that is not JSON", 0, "parse");
    e.raw = rawSnippet(content);
    throw e;
  }
  throw new LlmError("The endpoint refused every request shape tried", 400, "unsupported");
}

export async function chatText(auth: LlmAuth, system: string, user: string | ContentPart[], maxTokens = 4000, timeoutMs = 240000): Promise<string> {
  const body: Record<string, unknown> = {
    model: auth.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_completion_tokens: maxTokens,
  };
  if (!/^(o\d|gpt-5)/.test(auth.model)) body.temperature = 0.2;
  let json: Record<string, unknown>;
  try {
    json = await call(auth, "/chat/completions", body, timeoutMs);
  } catch (e) {
    if (!(e instanceof LlmError) || e.status !== 400) throw e;
    delete body.temperature;
    if (MAX_COMPLETION_REFUSED.test(e.message)) {
      body.max_tokens = body.max_completion_tokens;
      delete body.max_completion_tokens;
    }
    json = await call(auth, "/chat/completions", body, timeoutMs);
  }
  const choice = (json.choices as { message: { content?: string } }[] | undefined)?.[0];
  return choice?.message.content ?? "";
}

/** Returns PNG bytes. */
export async function generateImage(auth: LlmAuth, prompt: string, size = "1536x1024"): Promise<Buffer> {
  const body: Record<string, unknown> = { model: auth.imageModel, prompt, n: 1, size };
  // gpt-image always answers with bytes; DALL-E and Imagen (Gemini) send a link unless asked for bytes.
  if (/^(dall-e|imagen)/.test(auth.imageModel)) body.response_format = "b64_json";
  const json = await call(auth, "/images/generations", body, 240000);
  const b64 = (json.data as { b64_json?: string }[] | undefined)?.[0]?.b64_json;
  if (!b64) throw new LlmError("The image model returned no picture");
  return Buffer.from(b64, "base64");
}

/** Models that make pictures, speech or embeddings rather than text. */
export const NOT_A_WRITER = /image|imagen|dall-e|tts|embed|live|audio|veo|aqa|robotics|computer-use|lyria|whisper|moderation|transcribe/i;

export async function checkKey(apiKey: string, baseUrl: string, timeoutMs = 20000): Promise<{ ok: boolean; message: string; models?: string[]; imageModels?: string[] }> {
  const host = hostOf(baseUrl);
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { ok: false, message: `${host} answered ${res.status}: ${errorOf(await res.json().catch(() => ({}))).message || res.statusText}` };
    }
    const j = (await res.json()) as { data?: { id: string }[] };
    // Gemini lists "models/gemini-…"; the chat call takes the bare name.
    const all = [...new Set((j.data ?? []).map((m) => m.id.replace(/^models\//, "")))].sort();
    const isOpenAi = host === "api.openai.com";
    // Picture, speech and embedding models cannot write a deck; they are listed apart.
    const writers = (isOpenAi ? all.filter((id) => /^(gpt|o\d|chatgpt)/.test(id)) : all).filter((id) => !NOT_A_WRITER.test(id));
    const imageModels = all.filter((id) => /imagen|image|dall-e/i.test(id));
    return { ok: true, message: `Key accepted by ${host}. ${writers.length} writer models visible.`, models: writers, imageModels };
  } catch (e) {
    const name = (e as Error).name;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, message: `${host} sent no answer within ${Math.round(timeoutMs / 1000)} s. The server running Slidecraft cannot use this endpoint.` };
    return { ok: false, message: `Could not reach ${host}: ${(e as Error).message}` };
  }
}
