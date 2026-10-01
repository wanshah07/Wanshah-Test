import type { FastifyInstance } from "fastify";
import { cleanModelId, sanitizeOutputData, type ChatTurn, type NotebookGuide } from "@slidecraft/shared";
import { getDb, now, uid } from "../db.js";
import { addOutput, deleteOutput, getOutput, listOutputs, listSources, loadDeck, renameOutput, updateDeck } from "../store.js";
import { config } from "../config.js";
import { fastAuth, resolveAuth } from "../settings.js";
import { askSources, normaliseStudio, runStudio, sourcesBlock } from "../llm/studio.js";
import { chatJson, LlmError } from "../llm/client.js";
import { LANG_RULES } from "../llm/prompts.js";

const GUIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { summary: { type: "string" }, topics: { type: "array", items: { type: "string" } }, questions: { type: "array", items: { type: "string" } } },
  required: ["summary", "topics", "questions"],
};

/** Which sources a guide was written from. */
function sourceKey(deckId: string): string {
  return listSources(deckId).map((s) => `${s.id}:${s.chars}`).join(",");
}

function llmFailure(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  if (e instanceof LlmError) return reply.code(e.status === 404 ? 404 : 502).send({ error: e.code, message: e.message });
  throw e;
}

export async function studioRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/decks/:id/outputs", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    return listOutputs(req.user.id, id);
  });

  // A note the person saves: a chat answer, or their own text.
  app.post("/api/decks/:id/outputs", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    const b = (req.body ?? {}) as { title?: unknown; data?: unknown };
    const data = sanitizeOutputData("note", b.data);
    if (!("text" in data) || !data.text) return reply.code(400).send({ error: "invalid", message: "A note needs some text." });
    const title = typeof b.title === "string" && b.title.trim() ? b.title.trim() : data.text.slice(0, 60);
    return addOutput(req.user.id, { deckId: id, kind: "note", title, data });
  });

  app.get("/api/outputs/:oid", async (req, reply) => {
    const o = getOutput(req.user.id, (req.params as { oid: string }).oid);
    return o ?? reply.code(404).send({ error: "not_found" });
  });

  app.put("/api/outputs/:oid", async (req, reply) => {
    const { oid } = req.params as { oid: string };
    const title = String((req.body as { title?: unknown } | undefined)?.title ?? "").trim();
    if (!title) return reply.code(400).send({ error: "invalid", message: "A title is needed." });
    return renameOutput(req.user.id, oid, title) ?? reply.code(404).send({ error: "not_found" });
  });

  app.delete("/api/outputs/:oid", async (req, reply) => {
    return deleteOutput(req.user.id, (req.params as { oid: string }).oid) ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });

  app.post("/api/decks/:id/studio", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!loadDeck(req.user.id, id)) return reply.code(404).send({ error: "not_found" });
    const o = normaliseStudio((req.body ?? {}) as Record<string, unknown>);
    if (!o) return reply.code(400).send({ error: "invalid", message: "Pick what to make: report, flashcards, quiz, mind map, data table or infographic." });
    if (!listSources(id).length) return reply.code(409).send({ error: "no_sources", message: "This notebook has no sources yet. Add a file, a link or some text first." });
    if (!config.mockLlm && !resolveAuth(req.user.id)) return reply.code(409).send({ error: "no_key", message: "No AI key is set up. Add one in Settings." });
    const jobId = uid("job");
    getDb().prepare("INSERT INTO jobs (id, user_id, deck_id, kind, status, progress, created_at, updated_at) VALUES (?, ?, ?, 'studio', 'queued', '[]', ?, ?)").run(jobId, req.user.id, id, now(), now());
    void runStudio(jobId, req.user.id, id, o);
    return { jobId };
  });

  app.post("/api/decks/:id/ask", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { question?: unknown; history?: unknown; model?: unknown; sourceIds?: unknown };
    const question = typeof b.question === "string" ? b.question.trim().slice(0, 2000) : "";
    if (!question) return reply.code(400).send({ error: "invalid", message: "Ask a question." });
    const history: ChatTurn[] = (Array.isArray(b.history) ? b.history : [])
      .filter((t): t is { role: string; text: string } => !!t && typeof t === "object" && typeof (t as { text?: unknown }).text === "string")
      .map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", text: t.text.slice(0, 4000) }) as ChatTurn)
      .slice(-8);
    const sourceIds = Array.isArray(b.sourceIds) ? b.sourceIds.filter((x): x is string => typeof x === "string") : undefined;
    try {
      return await askSources(req.user.id, id, question, history, { model: cleanModelId(b.model) || undefined, sourceIds });
    } catch (e) {
      return llmFailure(reply, e);
    }
  });

  // The notebook guide: what the sources are about and what to ask them. Kept on the notebook until the sources change.
  app.post("/api/decks/:id/guide", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deck = loadDeck(req.user.id, id);
    if (!deck) return reply.code(404).send({ error: "not_found" });
    const key = sourceKey(id);
    const force = (req.body as { refresh?: unknown } | undefined)?.refresh === true;
    if (!force && deck.guide && deck.guide.sourceKey === key) return deck.guide;
    const sources = listSources(id).map((r) => ({ name: r.rel_path || r.name, kind: r.kind, text: r.text.slice(0, 12000) }));
    if (!sources.length) return reply.code(409).send({ error: "no_sources", message: "Add sources first." });
    let g: Omit<NotebookGuide, "sourceKey" | "at">;
    if (config.mockLlm) g = { summary: `${sources.length} source${sources.length === 1 ? "" : "s"} about ${deck.title}.`, topics: sources.slice(0, 5).map((s) => s.name), questions: ["What are the key limits?", "What do the sources disagree on?", "What should we do next?"] };
    else {
      const auth = resolveAuth(req.user.id);
      if (!auth) return reply.code(409).send({ error: "no_key", message: "No AI key is set up. Add one in Settings." });
      try {
        const raw = await chatJson<Record<string, unknown>>({
          auth: fastAuth(auth),
          system: [
            "You write the opening guide to a notebook of sources for a regulatory and scientific professional.",
            `LANGUAGE: ${LANG_RULES[deck.lang]}`,
            "`summary`: 3 to 5 sentences on what the sources cover and what they conclude, naming the key products, instruments and figures. Only what the sources say.",
            "`topics`: 4 to 8 topics, 1 to 4 words each.",
            "`questions`: 3 questions the sources can answer that a professional would ask first.",
            "No dashes (— or –), no emoji. Answer only with the JSON the schema asks for.",
          ].join("\n"),
          user: sourcesBlock(sources),
          schemaName: "guide",
          schema: GUIDE_SCHEMA,
          maxTokens: 1500,
          timeoutMs: 120000,
        });
        const list = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 300)).slice(0, n) : []);
        g = { summary: String(raw.summary ?? "").trim().slice(0, 3000), topics: list(raw.topics, 8), questions: list(raw.questions, 3) };
      } catch (e) {
        return llmFailure(reply, e);
      }
    }
    const guide: NotebookGuide = { ...g, sourceKey: key, at: now() };
    updateDeck(req.user.id, id, (d) => void (d.guide = guide));
    return guide;
  });
}
