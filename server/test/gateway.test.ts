import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { chatJson, checkKey, extractJson, LlmError, type LlmAuth } from "../src/llm/client.js";

// A local stand-in for an OpenAI-compatible gateway that is stricter than
// OpenAI in the ways real gateways are: it can refuse json_schema, refuse
// max_completion_tokens, answer in code fences, or accept and never reply.

interface Behaviour {
  refuseSchema?: boolean;
  refuseMaxCompletion?: boolean;
  fenced?: boolean;
  silent?: boolean;
}

let behaviour: Behaviour = {};
let hits = 0;
const seen: Record<string, unknown>[] = [];
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hits++;
      if (behaviour.silent) return; // accept, never answer
      if (req.url === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "claude-sonnet" }, { id: "gpt-4.1" }, { id: "llama-3" }] }));
        return;
      }
      const body = raw ? JSON.parse(raw) : {};
      seen.push(body);
      const fail = (msg: string) => {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: msg, type: "invalid_request_error" } }));
      };
      if (behaviour.refuseMaxCompletion && "max_completion_tokens" in body) return fail("Unrecognized request argument supplied: max_completion_tokens");
      if (behaviour.refuseSchema && body.response_format?.type === "json_schema") return fail("response_format json_schema is not supported by this model");
      const content = JSON.stringify({ title: "ok", n: 1 });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: behaviour.fenced ? "Here you go:\n```json\n" + content + "\n```" : content }, finish_reason: "stop" }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const auth = (): LlmAuth => ({ apiKey: "k", model: "claude-sonnet", imageModel: "x", baseUrl: base });
const args = () => ({ auth: auth(), system: "sys", user: "u", schemaName: "t", schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } });

describe("gateway compatibility", () => {
  it("uses strict json_schema when the endpoint accepts it", async () => {
    behaviour = {};
    seen.length = 0;
    const out = await chatJson<{ title: string }>(args());
    expect(out.title).toBe("ok");
    expect(seen).toHaveLength(1);
    expect((seen[0].response_format as { type: string }).type).toBe("json_schema");
  });

  it("falls back to json_object with the schema in the prompt when json_schema is refused", async () => {
    behaviour = { refuseSchema: true };
    seen.length = 0;
    const out = await chatJson<{ title: string }>(args());
    expect(out.title).toBe("ok");
    expect(seen).toHaveLength(2);
    expect((seen[1].response_format as { type: string }).type).toBe("json_object");
    const sys = (seen[1].messages as { content: string }[])[0].content;
    expect(sys).toContain('"required":["title"]');
  });

  it("switches to max_tokens when max_completion_tokens is refused, and keeps the schema", async () => {
    behaviour = { refuseMaxCompletion: true };
    seen.length = 0;
    await chatJson(args());
    expect(seen).toHaveLength(2);
    expect(seen[1]).toHaveProperty("max_tokens");
    expect(seen[1]).not.toHaveProperty("max_completion_tokens");
    expect((seen[1].response_format as { type: string }).type).toBe("json_schema");
  });

  it("survives both refusals in one request", async () => {
    behaviour = { refuseMaxCompletion: true, refuseSchema: true };
    seen.length = 0;
    const out = await chatJson<{ title: string }>(args());
    expect(out.title).toBe("ok");
    expect(seen).toHaveLength(3);
  });

  it("reads JSON out of code fences", async () => {
    behaviour = { fenced: true };
    const out = await chatJson<{ title: string }>(args());
    expect(out.title).toBe("ok");
    expect(extractJson('prose {"a":1} more')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow();
  });

  it("lists every model a non-OpenAI endpoint offers, not only gpt ones", async () => {
    behaviour = {};
    const r = await checkKey("k", base);
    expect(r.ok).toBe(true);
    expect(r.models).toEqual(["claude-sonnet", "gpt-4.1", "llama-3"]);
    expect(r.message).toContain("127.0.0.1");
  });

  it("says plainly when an endpoint accepts the connection and never answers", async () => {
    behaviour = { silent: true };
    const t0 = Date.now();
    const r = await checkKey("k", base, 300);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/sent no answer within 0 s|sent no answer within/);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("does not retry a silent endpoint on generation", async () => {
    behaviour = { silent: true };
    const before = hits;
    const e = await chatJson({ ...args(), timeoutMs: 300 }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmError);
    expect((e as LlmError).code).toBe("timeout");
    expect((e as LlmError).message).toContain("127.0.0.1");
    // Wait past any retry backoff: a retry would have landed by now.
    await new Promise((r) => setTimeout(r, 2000));
    expect(hits - before).toBe(1);
    behaviour = {};
  });
});
