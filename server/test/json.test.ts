import { describe, expect, it } from "vitest";
import { extractJson, rawSnippet, scanJson } from "../src/llm/client.js";

// What a writer model sends back is not always one clean JSON object: these are the shapes seen from
// gateways and smaller models, and what Slidecraft makes of each.
describe("reading JSON out of a model's reply", () => {
  it("takes the deck when a plan object comes first", () => {
    const reply = `{"title":"Budget review","purpose":"Secure funding","one_conclusion":"RM figure is low"}\n{"title":"Budget review","subtitle":null,"slides":[{"layout":"title","title":"Budget review"}]}`;
    const v = extractJson(reply, ["title", "subtitle", "slides"]) as Record<string, unknown>;
    expect(Array.isArray(v.slides)).toBe(true);
  });

  it("takes the deck from prose and code fences around it", () => {
    const reply = "Here is the plan:\n```json\n{\"purpose\":\"x\"}\n```\nAnd the deck:\n```json\n{\"title\":\"T\",\"subtitle\":null,\"slides\":[]}\n```";
    expect(extractJson(reply, ["title", "subtitle", "slides"])).toEqual({ title: "T", subtitle: null, slides: [] });
  });

  it("forgives trailing commas and whole-line comments", () => {
    const reply = `{\n  // the deck\n  "title": "T",\n  "slides": [{"title": "a"},],\n}`;
    expect(extractJson(reply, ["title", "slides"])).toEqual({ title: "T", slides: [{ title: "a" }] });
  });

  it("is not fooled by braces inside strings", () => {
    const reply = `{"title":"Use {x} and \\"}\\" here","slides":[]}`;
    expect(scanJson(reply)).toEqual({ objects: [reply], open: false });
    expect(extractJson(`note ${reply} end`, ["slides"])).toEqual({ title: 'Use {x} and "}" here', slides: [] });
  });

  it("knows a reply that was cut off from one that is not JSON at all", () => {
    expect(scanJson(`{"title":"T","slides":[{"title":"a"},{"title":"b`).open).toBe(true);
    expect(scanJson(`{"title":"T","slides":[{"title":"a"}`).open).toBe(true);
    expect(scanJson("Sorry, I cannot help with that.").open).toBe(false);
    expect(() => extractJson(`{"title":"T","slides":[{"title":"a"}`)).toThrow();
  });

  it("logs the start, the size and the end of a long reply", () => {
    const long = `{"title":"${"x".repeat(900)}END`;
    const s = rawSnippet(long);
    expect(s.startsWith(long.slice(0, 500))).toBe(true);
    expect(s).toContain(`[${long.length.toLocaleString("en-US")} characters in all; it ends: …`);
    expect(s.endsWith("END]")).toBe(true);
    expect(rawSnippet("short")).toBe("short");
  });
});
