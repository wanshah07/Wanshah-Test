import { angleById, autoFixSlide, DEFAULT_FEATURES, newId, normaliseSlide, themePreset, type Deck, type DiagramSpec, type Features, type Slide } from "@slidecraft/shared";
import { config } from "../config.js";
import { getDb, now } from "../db.js";
import { addMedia, getMedia, listSources, loadDeck, saveDeck, unreadPictures, type SourceRow } from "../store.js";
import { NOTHING, readPicture, visionFor } from "./vision.js";
import fs from "node:fs";
import { chatJson, chatText, generateImage, LlmError, RAW_KEEP, rawSnippet, type LlmAuth } from "./client.js";
import { mockDeckJson, mockRewrite } from "./mock.js";
import { condensePrompt, rewriteSystem, systemPrompt, userPrompt, type GenerateParams } from "./prompts.js";
import { DECK_SCHEMA, SLIDE_SCHEMA } from "./schema.js";
import { resolveAuth } from "../settings.js";
import { importFolder, summarise } from "../onedrive.js";
import { getDesign, promptTexts } from "../library.js";

export interface Job {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  progress: string[];
  error?: string;
  result?: unknown;
}

export function setJob(id: string, patch: Partial<Job>): void {
  const db = getDb();
  const row = db.prepare("SELECT status, progress, error, result FROM jobs WHERE id = ?").get(id) as { status: string; progress: string; error: string | null; result: string | null } | undefined;
  if (!row) return;
  const progress = patch.progress ?? (JSON.parse(row.progress) as string[]);
  db.prepare("UPDATE jobs SET status = ?, progress = ?, error = ?, result = ?, updated_at = ? WHERE id = ?").run(
    patch.status ?? row.status,
    JSON.stringify(progress),
    patch.error ?? row.error,
    patch.result !== undefined ? JSON.stringify(patch.result) : row.result,
    now(),
    id,
  );
}

export function log(jobId: string, line: string): void {
  const row = getDb().prepare("SELECT progress FROM jobs WHERE id = ?").get(jobId) as { progress: string } | undefined;
  const p = row ? (JSON.parse(row.progress) as string[]) : [];
  p.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  setJob(jobId, { progress: p });
}

export function normaliseParams(raw: Record<string, unknown>, fallbackAngle = "custom"): GenerateParams {
  const features: Features = { ...DEFAULT_FEATURES, ...((raw.features as Partial<Features>) ?? {}) };
  const slides = Math.max(3, Math.min(40, Number(raw.slides) || 10));
  const imageMode = (["none", "uploaded", "generate"].includes(String(raw.imageMode)) ? raw.imageMode : "none") as GenerateParams["imageMode"];
  return {
    prompt: String(raw.prompt ?? "").trim(),
    title: raw.title ? String(raw.title).trim() : undefined,
    lang: raw.lang === "ms" ? "ms" : "en",
    angle: angleById(String(raw.angle ?? fallbackAngle)).id,
    audience: raw.audience ? String(raw.audience).trim() : undefined,
    slides,
    features,
    imageMode: features.images ? imageMode : "none",
  };
}

/** Sources with their text, condensed when the total is over the budget. */
async function prepareSources(jobId: string, auth: LlmAuth | null, p: GenerateParams, rows: SourceRow[]): Promise<{ sources: { name: string; kind: string; text: string }[]; condensed: boolean }> {
  const named = rows.map((r) => ({ name: r.rel_path || r.name, kind: r.kind, text: r.text }));
  const total = named.reduce((a, s) => a + s.text.length, 0);
  if (total <= config.sourceBudget || !auth) return { sources: named, condensed: false };
  log(jobId, `Sources total ${total.toLocaleString()} characters, over the ${config.sourceBudget.toLocaleString()} budget: condensing each to the facts`);
  const out: { name: string; kind: string; text: string }[] = [];
  const sys = condensePrompt(p);
  for (const s of named) {
    if (s.kind === "image" || s.text.length < 6000) {
      out.push(s);
      continue;
    }
    const chunks: string[] = [];
    for (let i = 0; i < s.text.length && chunks.length < 8; i += 60000) chunks.push(s.text.slice(i, i + 60000));
    const notes: string[] = [];
    for (const [i, c] of chunks.entries()) {
      log(jobId, `Condensing ${s.name}${chunks.length > 1 ? ` (part ${i + 1}/${chunks.length})` : ""}`);
      notes.push(await chatText(auth, sys, `### ${s.name}\n${c}`));
    }
    out.push({ ...s, text: notes.join("\n\n") });
  }
  return { sources: out, condensed: true };
}

function coerceDiagram(raw: unknown): DiagramSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as { kind?: string; steps?: { label: string; detail?: string | null }[]; events?: { when: string; label: string }[]; rows?: string[]; cols?: string[]; cells?: string[][] };
  if (d.kind === "timeline" && d.events?.length) return { kind: "timeline", events: d.events };
  if (d.kind === "matrix" && d.rows?.length && d.cols?.length) return { kind: "matrix", rows: d.rows, cols: d.cols, cells: d.cells ?? [] };
  if (d.steps?.length) return { kind: "flow", steps: d.steps.map((s) => ({ label: s.label, detail: s.detail ?? undefined })) };
  return undefined;
}

/** A layout the person switched off becomes bullets that still carry its facts. */
export function demote(s: Slide): void {
  const items: string[] = [...(s.bullets ?? [])];
  if (s.layout === "kpi" && s.kpi) items.push(...s.kpi.map((k) => `${k.value} ${k.label}${k.note ? ` (${k.note})` : ""}`));
  if (s.layout === "chart" && s.chart) {
    for (const ser of s.chart.series) items.push(`${ser.name}: ${s.chart.categories.map((c, i) => `${c} ${ser.values[i] ?? ""}${s.chart!.unit ? " " + s.chart!.unit : ""}`).join(", ")}`);
    if (s.chart.source) s.citations = [...(s.citations ?? []), s.chart.source];
  }
  if (s.layout === "table" && s.table) {
    items.push(...s.table.rows.map((r) => r.map((v, i) => (s.table!.header[i] ? `${s.table!.header[i]}: ${v}` : v)).join("; ")));
    if (s.table.source) s.citations = [...(s.citations ?? []), s.table.source];
  }
  if (s.layout === "diagram" && s.diagram) {
    const d = s.diagram;
    if (d.kind === "flow") items.push(...d.steps.map((st, i) => `${i + 1}. ${st.label}${st.detail ? ": " + st.detail : ""}`));
    else if (d.kind === "timeline") items.push(...d.events.map((e) => `${e.when}: ${e.label}`));
    else items.push(...d.rows.map((r, i) => `${r}: ${d.cols.map((c, j) => `${c} ${d.cells[i]?.[j] ?? ""}`).join(", ")}`));
  }
  if (s.layout === "image" && s.image?.caption) items.push(s.image.caption);
  if (s.layout === "section") {
    if (s.subtitle) items.push(s.subtitle);
  }
  s.layout = "bullets";
  s.bullets = items.slice(0, 8);
  delete s.kpi;
  delete s.chart;
  delete s.table;
  delete s.diagram;
  delete s.image;
}

function toSlide(raw: Record<string, unknown>, features: Features, imageMode: string): Slide {
  const s = normaliseSlide(raw);
  s.diagram = coerceDiagram(raw.diagram);
  if (s.layout === "diagram" && !s.diagram) s.layout = "bullets";
  if (s.layout === "chart" && (!s.chart || !s.chart.series?.length)) s.layout = "bullets";
  if (s.layout === "table" && !s.table?.header?.length) s.layout = "bullets";
  if (s.layout === "kpi" && !s.kpi?.length) s.layout = "bullets";
  if (s.layout === "quote" && !s.quote?.text) s.layout = "bullets";
  const banned: Record<string, boolean> = { chart: !features.charts, table: !features.tables, diagram: !features.diagrams, kpi: !features.kpis, image: !features.images || imageMode === "none", section: !features.sections };
  if (banned[s.layout]) demote(s);
  if (!features.notes) delete s.notes;
  if (!features.citations) delete s.citations;
  return autoFixSlide(s);
}

export async function runGenerate(jobId: string, userId: string, deckId: string, p: GenerateParams): Promise<void> {
  try {
    setJob(jobId, { status: "running" });
    const deck = loadDeck(userId, deckId);
    if (!deck) throw new Error("deck not found");
    const auth = config.mockLlm ? null : resolveAuth(userId);
    if (!config.mockLlm && !auth) throw new LlmError("No OpenAI key. Add one in Settings.", 0, "no_key");
    p.house = promptTexts(userId, deck.brief?.prompts);
    p.designNotes = deck.designId ? getDesign(userId, deck.designId)?.notes : undefined;
    if (p.house.length) log(jobId, `Saved prompts: ${p.house.map((h) => h.name).join(", ")}`);
    if (deck.designId) log(jobId, p.designNotes !== undefined ? `Design: ${deck.theme.name}` : "The deck's design was deleted; writing without its notes");
    if (deck.onedrive && p.imageMode === "uploaded") {
      log(jobId, `Checking OneDrive folder "${deck.onedrive.folder || "(root)"}" for new pictures`);
      try {
        const r = await importFolder(userId, deckId, deck.onedrive.folder, deck.onedrive.subfolders, (l) => log(jobId, l));
        log(jobId, summarise(r));
        deck.onedrive.lastSync = now();
        saveDeck(userId, deck);
      } catch (e) {
        // A OneDrive outage costs the fresh pull, never the deck.
        log(jobId, `OneDrive not read (${(e as Error).message}). Using the pictures already pulled.`);
      }
    }
    if (auth) await readUploadedPictures(jobId, userId, deckId, auth);
    const rows = listSources(deckId);
    log(jobId, `${rows.length} source${rows.length === 1 ? "" : "s"}, ${p.slides} slides, angle ${angleById(p.angle).name}, ${p.lang === "ms" ? "Bahasa Malaysia" : "English"}`);
    const { sources, condensed } = await prepareSources(jobId, auth, p, rows);
    log(jobId, "Writing the deck");
    let json: { title: string; subtitle: string | null; slides: Record<string, unknown>[] };
    if (config.mockLlm || !auth) {
      if (config.mockDelayMs) await new Promise((r) => setTimeout(r, config.mockDelayMs));
      json = mockDeckJson(p, sources.map((s) => s.name));
    } else {
      json = await chatJson(
        { auth, system: systemPrompt(p), user: userPrompt(p, sources, condensed), schemaName: "deck", schema: DECK_SCHEMA, maxTokens: Math.min(32000, 1800 * p.slides + 2000) },
      );
    }
    const slides = (json.slides ?? []).map((r) => toSlide(r, p.features, p.imageMode));
    if (!slides.length) {
      const e = new LlmError("The writer returned no slides", 0, "no_slides");
      e.raw = rawSnippet(JSON.stringify(json));
      throw e;
    }
    // Pictures.
    const imageSlides = slides.filter((s) => s.layout === "image");
    if (imageSlides.length && p.imageMode === "uploaded") {
      const pics = rows.filter((r) => r.kind === "image" && r.media_id);
      let k = 0;
      for (const s of imageSlides) {
        const want = String((json.slides.find((r) => r.title === s.title) as { image?: { sourceName?: string } } | undefined)?.image?.sourceName ?? "").toLowerCase();
        const match = pics.find((r) => want && (r.name.toLowerCase() === want || (r.rel_path ?? "").toLowerCase() === want)) ?? pics[k++ % Math.max(pics.length, 1)];
        if (match?.media_id) s.image = { ...(s.image ?? {}), mediaId: match.media_id };
      }
    } else if (imageSlides.length && p.imageMode === "generate" && auth) {
      let n = 0;
      for (const s of imageSlides) {
        if (n >= 4) break;
        const prompt = s.image?.prompt;
        if (!prompt) continue;
        n++;
        log(jobId, `Generating picture ${n}: ${prompt.slice(0, 60)}`);
        try {
          const png = await generateImage(auth, `${prompt}. Clean, well lit, no text, no logos, no watermark.`);
          const m = addMedia(userId, deckId, `generated-${n}.png`, "image/png", png, "generated");
          s.image = { ...(s.image ?? {}), mediaId: m.id };
        } catch (e) {
          log(jobId, `Picture ${n} failed: ${(e as Error).message}`);
        }
      }
    }
    deck.title = json.title || deck.title;
    if (json.subtitle) deck.subtitle = json.subtitle;
    deck.lang = p.lang;
    deck.angle = p.angle;
    deck.audience = p.audience;
    deck.slides = slides;
    saveDeck(userId, deck);
    log(jobId, `Done: ${slides.length} slides`);
    setJob(jobId, { status: "done", result: { deckId } });
  } catch (e) {
    const msg = e instanceof LlmError ? `${e.message}` : (e as Error).message;
    // What the model actually sent, so a failure can be diagnosed from the log.
    if (e instanceof LlmError && e.raw !== undefined) {
      log(jobId, `Model reply (first ${RAW_KEEP} characters): ${e.raw || "(empty)"}`);
      console.warn(`[slidecraft] job ${jobId}: ${msg}. Reply began: ${e.raw}`);
    }
    log(jobId, `Failed: ${msg}`);
    setJob(jobId, { status: "failed", error: msg });
  }
}

export async function rewriteSlide(userId: string, deck: Deck, slide: Slide, instruction: string): Promise<Slide> {
  const raw = slide as unknown as Record<string, unknown>;
  if (config.mockLlm) {
    const { review: _r, ...content } = raw;
    const m = toSlide({ ...mockRewrite(content, instruction), id: slide.id }, DEFAULT_FEATURES, "uploaded");
    if (slide.review) m.review = slide.review;
    return m;
  }
  const auth = resolveAuth(userId);
  if (!auth) throw new LlmError("No OpenAI key. Add one in Settings.", 0, "no_key");
  // The review is the user's bookkeeping, not slide content: keep it away from the writer.
  const { id, review, ...rest } = slide;
  const user = `INSTRUCTION: ${instruction}\n\nDECK: ${deck.title}\n\nSLIDE (JSON):\n${JSON.stringify(rest)}`;
  const house = promptTexts(userId, deck.brief?.prompts);
  const designNotes = deck.designId ? getDesign(userId, deck.designId)?.notes : undefined;
  const out = await chatJson<Record<string, unknown>>({ auth, system: rewriteSystem({ lang: deck.lang, angle: deck.angle, house, designNotes }), user, schemaName: "slide", schema: SLIDE_SCHEMA, maxTokens: 4000 });
  const s = toSlide({ ...out, id }, DEFAULT_FEATURES, "uploaded");
  // Keep a picture the rewrite could not know about.
  if (slide.image?.mediaId && s.layout === "image") s.image = { ...(s.image ?? {}), mediaId: slide.image.mediaId };
  if (review) s.review = review;
  return s;
}

export function newDeck(userId: string, title: string, lang: "en" | "ms", angle: string, themeId: string, designId?: string): Deck {
  const t = now();
  const design = designId ? getDesign(userId, designId) : null;
  const deck: Deck = {
    id: newId("d"),
    title: title || (lang === "ms" ? "Deck baharu" : "New deck"),
    lang,
    angle: angleById(angle).id,
    theme: design ? (JSON.parse(JSON.stringify(design.theme)) as Deck["theme"]) : themePreset(themeId),
    ...(design ? { designId: design.id } : {}),
    slides: [],
    sources: [],
    createdAt: t,
    updatedAt: t,
  };
  return saveDeck(userId, deck);
}

/** The instruction the writer gets for a slide's saved feedback. */
export function feedbackInstruction(items: string[]): string {
  return `Apply this feedback from the presenter to the slide. Change what it asks; keep every other fact, citation and [SAHKAN] marker.\n${items.map((t) => `- ${t}`).join("\n")}`;
}

/** Applies every slide's waiting feedback, one slide at a time, as a job. */
export async function runApplyFeedback(jobId: string, userId: string, deckId: string): Promise<void> {
  setJob(jobId, { status: "running" });
  try {
    const deck = loadDeck(userId, deckId);
    if (!deck) throw new Error("deck not found");
    const todo = deck.slides.map((s, i) => ({ i, pending: (s.review?.feedback ?? []).filter((f) => !f.appliedAt) })).filter((x) => x.pending.length);
    log(jobId, `${todo.length} slide${todo.length === 1 ? "" : "s"} with feedback waiting`);
    let failed = 0;
    for (const { i, pending } of todo) {
      // Reload each time so edits saved while this runs are not overwritten.
      const cur = loadDeck(userId, deckId);
      if (!cur) throw new Error("deck not found");
      const slide = cur.slides.find((s) => s.id === deck.slides[i].id);
      if (!slide) continue;
      log(jobId, `Slide ${i + 1}: ${slide.title.slice(0, 60)}`);
      try {
        const s = await rewriteSlide(userId, cur, slide, feedbackInstruction(pending.map((f) => f.text)));
        const at = now();
        s.review = { ok: false, feedback: (slide.review?.feedback ?? []).map((f) => (f.appliedAt ? f : { ...f, appliedAt: at })) };
        cur.slides = cur.slides.map((x) => (x.id === s.id ? s : x));
        saveDeck(userId, cur);
      } catch (e) {
        failed++;
        log(jobId, `Slide ${i + 1} failed: ${(e as Error).message}`);
      }
    }
    log(jobId, failed ? `Done, ${failed} slide${failed === 1 ? "" : "s"} still waiting` : "Done");
    setJob(jobId, { status: "done", result: { deckId } });
  } catch (e) {
    log(jobId, `Failed: ${(e as Error).message}`);
    setJob(jobId, { status: "failed", error: (e as Error).message });
  }
}

const READ_LIMIT = 12;
const READ_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Pictures uploaded as sources are read by the writer model when it can see
 * pictures, and their content becomes source text. When it cannot, the log
 * says what that means; the route has already made the user choose.
 */
export async function readUploadedPictures(jobId: string, userId: string, deckId: string, auth: LlmAuth): Promise<void> {
  const pics = unreadPictures(listSources(deckId));
  if (!pics.length) return;
  const v = await visionFor(userId, auth);
  if (v !== "yes") {
    log(jobId, `${pics.length} picture source${pics.length === 1 ? "" : "s"} used only as slide pictures: ${v === "no" ? `${auth.model} cannot read pictures` : "could not check whether the writer model reads pictures"}, so text inside them does not reach the deck.`);
    return;
  }
  let n = 0;
  for (const r of pics.slice(0, READ_LIMIT)) {
    const m = r.media_id ? getMedia(userId, r.media_id) : null;
    if (!m || !fs.existsSync(m.path)) continue;
    if (m.bytes > READ_MAX_BYTES || m.mime === "image/svg+xml") {
      log(jobId, `Picture ${r.rel_path || r.name} not read: ${m.mime === "image/svg+xml" ? "SVG is not sent to the model" : "larger than 8 MB"}.`);
      continue;
    }
    n++;
    log(jobId, `Reading picture ${n}: ${r.rel_path || r.name}`);
    try {
      const text = await readPicture(auth, r.rel_path || r.name, fs.readFileSync(m.path), m.mime);
      getDb().prepare("UPDATE sources SET text = ?, chars = ? WHERE id = ?").run(text, text === NOTHING ? 0 : text.length, r.id);
    } catch (e) {
      log(jobId, `Picture ${r.rel_path || r.name} could not be read: ${(e as Error).message}`);
    }
  }
  if (pics.length > READ_LIMIT) log(jobId, `Read the first ${READ_LIMIT} pictures; the other ${pics.length - READ_LIMIT} are used as slide pictures only.`);
}
