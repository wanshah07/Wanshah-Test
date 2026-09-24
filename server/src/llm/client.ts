import { config } from "../config.js";

// Plain fetch against the OpenAI HTTP API. No SDK: the two calls this app makes
// are small, and a dependency that changes shape every quarter is not worth it.

export interface LlmAuth {
  apiKey: string;
  model: string;
  imageModel: string;
}

export class LlmError extends Error {
  constructor(message: string, public status = 0, public code = "llm_error") {
    super(message);
  }
}

async function call(path: string, apiKey: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  let last: LlmError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${config.openaiBase}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
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
      last = new LlmError(err.message || `OpenAI answered ${res.status}`, res.status, err.code || `http_${res.status}`);
      if (res.status === 401 || res.status === 403 || res.status === 400 || res.status === 404) throw last;
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw last;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      last = new LlmError((e as Error).name === "AbortError" ? "OpenAI did not answer in time" : (e as Error).message, 0, "network");
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw last ?? new LlmError("OpenAI call failed");
}

export interface ChatJsonArgs {
  auth: LlmAuth;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
}

export async function chatJson<T>(a: ChatJsonArgs): Promise<T> {
  const body: Record<string, unknown> = {
    model: a.auth.model,
    messages: [
      { role: "system", content: a.system },
      { role: "user", content: a.user },
    ],
    response_format: { type: "json_schema", json_schema: { name: a.schemaName, strict: true, schema: a.schema } },
    max_completion_tokens: a.maxTokens ?? 16000,
  };
  // Reasoning models refuse a temperature; everything else takes it.
  if (!/^(o\d|gpt-5)/.test(a.auth.model)) body.temperature = a.temperature ?? 0.4;
  const json = await call("/chat/completions", a.auth.apiKey, body, 240000);
  const choice = (json.choices as { message: { content?: string; refusal?: string }; finish_reason?: string }[] | undefined)?.[0];
  if (!choice) throw new LlmError("OpenAI returned no choices");
  if (choice.message.refusal) throw new LlmError(`The model declined: ${choice.message.refusal}`, 0, "refusal");
  if (choice.finish_reason === "length") throw new LlmError("The answer was cut off by the token limit. Ask for fewer slides or fewer sources.", 0, "length");
  try {
    return JSON.parse(choice.message.content ?? "") as T;
  } catch {
    throw new LlmError("The model answered with something that is not JSON", 0, "parse");
  }
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
  const json = await call("/chat/completions", auth.apiKey, body, 240000);
  const choice = (json.choices as { message: { content?: string } }[] | undefined)?.[0];
  return choice?.message.content ?? "";
}

/** Returns PNG bytes. */
export async function generateImage(auth: LlmAuth, prompt: string, size = "1536x1024"): Promise<Buffer> {
  const body: Record<string, unknown> = { model: auth.imageModel, prompt, n: 1, size };
  if (/^dall-e/.test(auth.imageModel)) body.response_format = "b64_json";
  const json = await call("/images/generations", auth.apiKey, body, 240000);
  const b64 = (json.data as { b64_json?: string }[] | undefined)?.[0]?.b64_json;
  if (!b64) throw new LlmError("The image model returned no picture");
  return Buffer.from(b64, "base64");
}

export async function checkKey(apiKey: string): Promise<{ ok: boolean; message: string; models?: string[] }> {
  try {
    const res = await fetch(`${config.openaiBase}/models`, { headers: { authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, message: j.error?.message || `OpenAI answered ${res.status}` };
    }
    const j = (await res.json()) as { data?: { id: string }[] };
    const ids = (j.data ?? []).map((m) => m.id).filter((id) => /^(gpt|o\d|chatgpt)/.test(id)).sort();
    return { ok: true, message: `Key accepted. ${ids.length} chat models visible.`, models: ids };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
