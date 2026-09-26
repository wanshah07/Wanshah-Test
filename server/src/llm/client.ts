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
  constructor(message: string, public status = 0, public code = "llm_error") {
    super(message);
  }
}

export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
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
      const err = (json.error as { message?: string; code?: string } | undefined) ?? {};
      last = new LlmError(err.message || `${host} answered ${res.status}`, res.status, err.code || `http_${res.status}`);
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
const SCHEMA_REFUSED = /response_format|json_schema|strict|structured output|schema/i;
const MAX_COMPLETION_REFUSED = /max_completion_tokens/i;
const TEMPERATURE_REFUSED = /temperature/i;

export interface ChatJsonArgs {
  auth: LlmAuth;
  system: string;
  user: string;
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
  for (let round = 0; round < 4; round++) {
    const system =
      mode === "schema"
        ? a.system
        : `${a.system}\n\nAnswer with one JSON object and nothing else. It must match this JSON Schema exactly, every listed property present, null where a value is unknown:\n${JSON.stringify(a.schema)}`;
    const body: Record<string, unknown> = {
      model: a.auth.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: a.user },
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
      if (mode === "schema" && SCHEMA_REFUSED.test(e.message)) {
        mode = "object";
        continue;
      }
      throw e;
    }
    const choice = (json.choices as { message: { content?: string; refusal?: string }; finish_reason?: string }[] | undefined)?.[0];
    if (!choice) throw new LlmError("The model returned no choices");
    if (choice.message.refusal) throw new LlmError(`The model declined: ${choice.message.refusal}`, 0, "refusal");
    if (choice.finish_reason === "length") throw new LlmError("The answer was cut off by the token limit. Ask for fewer slides or fewer sources.", 0, "length");
    try {
      return extractJson(choice.message.content ?? "") as T;
    } catch {
      throw new LlmError("The model answered with something that is not JSON", 0, "parse");
    }
  }
  throw new LlmError("The endpoint refused every request shape tried", 400, "unsupported");
}

export async function chatText(auth: LlmAuth, system: string, user: string, maxTokens = 4000): Promise<string> {
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
    json = await call(auth, "/chat/completions", body, 240000);
  } catch (e) {
    if (!(e instanceof LlmError) || e.status !== 400) throw e;
    delete body.temperature;
    if (MAX_COMPLETION_REFUSED.test(e.message)) {
      body.max_tokens = body.max_completion_tokens;
      delete body.max_completion_tokens;
    }
    json = await call(auth, "/chat/completions", body, 240000);
  }
  const choice = (json.choices as { message: { content?: string } }[] | undefined)?.[0];
  return choice?.message.content ?? "";
}

/** Returns PNG bytes. */
export async function generateImage(auth: LlmAuth, prompt: string, size = "1536x1024"): Promise<Buffer> {
  const body: Record<string, unknown> = { model: auth.imageModel, prompt, n: 1, size };
  if (/^dall-e/.test(auth.imageModel)) body.response_format = "b64_json";
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
      const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, message: `${host} answered ${res.status}: ${j.error?.message || res.statusText}` };
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
