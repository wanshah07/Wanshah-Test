import { angleById, autoFixSlide, DEFAULT_FEATURES, newId, normaliseSlide, themePreset, type Deck, type DiagramSpec, type Features, type Slide } from "@slidecraft/shared";
import { config } from "../config.js";
import { getDb, now } from "../db.js";
import { addMedia, listSources, loadDeck, saveDeck, type SourceRow } from "../store.js";
import { chatJson, chatText, generateImage, LlmError, type LlmAuth } from "./client.js";
import { mockDeckJson, mockRewrite } from "./mock.js";
import { condensePrompt, rewriteSystem, systemPrompt, userPrompt, type GenerateParams } from "./prompts.js";
import { DECK_SCHEMA, SLIDE_SCHEMA } from "./schema.js";
import { resolveAuth } from "../settings.js";
import { importFolder, summarise } from "../onedrive.js";

export interface Job {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  progress: string[];
  error?: string;
  result?: unknown;
}

function setJob(id: string, patch: Partial<Job>): void {
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

function log(jobId: string, line: string): void {
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
    if (!slides.length) throw new Error("The writer returned no slides");
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
    log(jobId, `Failed: ${msg}`);
    setJob(jobId, { status: "failed", error: msg });
  }
}

export async function rewriteSlide(userId: string, deck: Deck, slide: Slide, instruction: string): Promise<Slide> {
  const raw = slide as unknown as Record<string, unknown>;
  if (config.mockLlm) return toSlide({ ...mockRewrite(raw, instruction), id: slide.id }, DEFAULT_FEATURES, "uploaded");
  const auth = resolveAuth(userId);
  if (!auth) throw new LlmError("No OpenAI key. Add one in Settings.", 0, "no_key");
  const { id, ...rest } = slide;
  const user = `INSTRUCTION: ${instruction}\n\nDECK: ${deck.title}\n\nSLIDE (JSON):\n${JSON.stringify(rest)}`;
  const out = await chatJson<Record<string, unknown>>({ auth, system: rewriteSystem({ lang: deck.lang, angle: deck.angle }), user, schemaName: "slide", schema: SLIDE_SCHEMA, maxTokens: 4000 });
  const s = toSlide({ ...out, id }, DEFAULT_FEATURES, "uploaded");
  // Keep a picture the rewrite could not know about.
  if (slide.image?.mediaId && s.layout === "image") s.image = { ...(s.image ?? {}), mediaId: slide.image.mediaId };
  return s;
}

export function newDeck(userId: string, title: string, lang: "en" | "ms", angle: string, themeId: string): Deck {
  const t = now();
  const deck: Deck = {
    id: newId("d"),
    title: title || (lang === "ms" ? "Deck baharu" : "New deck"),
    lang,
    angle: angleById(angle).id,
    theme: themePreset(themeId),
    slides: [],
    sources: [],
    createdAt: t,
    updatedAt: t,
  };
  return saveDeck(userId, deck);
}
