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
  return t.length > RAW_KEEP ? `${t.slice(0, RAW_KEEP)}…` : t;
}

/** The JSON rules, written into the instructions for every call. */
export function jsonRules(schema: Record<string, unknown>): string {
  return `OUTPUT FORMAT: answer with one JSON object and nothing else: no prose, no code fences, no comments. It must match this JSON Schema exactly, every listed property present, null where a value is unknown:\n${JSON.stringify(schema)}`;
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
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
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

/** Pull a JSON object out of an answer that may carry code fences or prose around it. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
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
  // A reply that is not JSON gets one more turn, with the reply shown back and the rules restated.
  let followUp: { role: "assistant" | "user"; content: string }[] = [];
  for (let round = 0; round < 5; round++) {
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
    const choice = (json.choices as { message: { content?: string; refusal?: string }; finish_reason?: string }[] | undefined)?.[0];
    if (!choice) throw new LlmError("The model returned no choices");
    if (choice.message.refusal) throw new LlmError(`The model declined: ${choice.message.refusal}`, 0, "refusal");
    if (choice.finish_reason === "length") {
      const e = new LlmError("The answer was cut off by the token limit. Ask for fewer slides or fewer sources.", 0, "length");
      e.raw = rawSnippet(choice.message.content ?? "");
      throw e;
    }
    try {
      return extractJson(choice.message.content ?? "") as T;
    } catch {
      if (!followUp.length) {
        followUp = [
          { role: "assistant", content: (choice.message.content ?? "").slice(0, 4000) },
          { role: "user", content: "That answer is not JSON, so it cannot be used. Answer again with only the JSON object the OUTPUT FORMAT rules describe: start with { and end with }, no prose, no markdown fences." },
        ];
        continue;
      }
      const e = new LlmError("The model answered with something that is not JSON", 0, "parse");
      e.raw = rawSnippet(choice.message.content ?? "");
      throw e;
    }
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

export async function checkKey(apiKey: string, baseUrl: string, timeoutMs = 20000): Promise<{ ok: boolean; message: string; models?: string[] }> {
  const host = hostOf(baseUrl);
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { ok: false, message: `${host} answered ${res.status}: ${errorOf(await res.json().catch(() => ({}))).message || res.statusText}` };
    }
    const j = (await res.json()) as { data?: { id: string }[] };
    const all = (j.data ?? []).map((m) => m.id).sort();
    const isOpenAi = host === "api.openai.com";
    const ids = isOpenAi ? all.filter((id) => /^(gpt|o\d|chatgpt)/.test(id)) : all;
    return { ok: true, message: `Key accepted by ${host}. ${ids.length} models visible.`, models: ids };
  } catch (e) {
    const name = (e as Error).name;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, message: `${host} sent no answer within ${Math.round(timeoutMs / 1000)} s. The server running Slidecraft cannot use this endpoint.` };
    return { ok: false, message: `Could not reach ${host}: ${(e as Error).message}` };
  }
}
