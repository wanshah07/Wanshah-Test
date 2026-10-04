import { ANGLES, angleById, autoFixSlide, cleanModelId, DEFAULT_FEATURES, newId, normaliseSlide, themeGuide, themePreset, VISUAL_FEATURES, type Deck, type DiagramSpec, type Features, type Slide } from "@slidecraft/shared";
import { config } from "../config.js";
import { getDb, now } from "../db.js";
import { addMedia, getMedia, listSources, loadDeck, saveCondensed, saveDeck, unreadPictures, updateDeck, updateSlide, type SourceRow } from "../store.js";
import { NOTHING, readPicture, visionFor } from "./vision.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chatJson, chatText, generateImage, LlmError, mapPool, RAW_KEEP, rawSnippet, type LlmAuth } from "./client.js";
import { mockDeckJson, mockRewrite } from "./mock.js";
import { condensePrompt, rewriteSystem, systemPrompt, userPrompt, type GenerateParams, type StoryBeat } from "./prompts.js";
import { DECK_SCHEMA, PLAN_SCHEMA, SLIDE_SCHEMA } from "./schema.js";
import { fastAuth, resolveAuth } from "../settings.js";
import { importFolder, summarise } from "../onedrive.js";
import { getDesign, promptTexts } from "../library.js";
import { pictureAuth } from "../reader.js";
import { visualise } from "./visualise.js";
import { designPass, needsDesign, placePictures } from "./design.js";
import { houseFor } from "./house.js";

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

/** The first array of slide-like objects anywhere in an answer, and where it was. */
export function findSlides(value: unknown, at = "", depth = 0): { at: string; slides: Record<string, unknown>[]; title?: string } | null {
  if (!value || typeof value !== "object" || depth > 4) return null;
  if (Array.isArray(value)) {
    const objs = value.filter((v) => v && typeof v === "object" && !Array.isArray(v)) as Record<string, unknown>[];
    const slideLike = objs.filter((o) => typeof o.title === "string" || typeof o.heading === "string" || typeof o.layout === "string");
    return value.length >= 2 && slideLike.length >= Math.ceil(value.length / 2) ? { at: at || "(top level)", slides: objs } : null;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort((a, b) => Number(/slide/i.test(b)) - Number(/slide/i.test(a)));
  for (const k of keys) {
    const hit = findSlides(o[k], at ? `${at}.${k}` : k, depth + 1);
    if (hit) return { ...hit, title: hit.title ?? (typeof o.title === "string" ? o.title : undefined) };
  }
  return null;
}

/** A rewrite may use any device: the person asked for this slide by name. */
const EVERY_FEATURE: Features = Object.fromEntries(Object.keys(DEFAULT_FEATURES).map((k) => [k, true])) as unknown as Features;

export function normaliseParams(raw: Record<string, unknown>, fallbackAngle = "custom"): GenerateParams {
  const given = raw.features && typeof raw.features === "object" ? (raw.features as Partial<Features>) : {};
  const features: Features = { ...DEFAULT_FEATURES, ...given };
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
    auto: raw.auto === true,
    off: VISUAL_FEATURES.filter((k) => given[k] === false),
    ...(cleanModelId(raw.model) ? { model: cleanModelId(raw.model) } : {}),
  };
}

/** What Auto writes when the user typed nothing at all. */
export const AUTO_PROMPT = "Build the strongest professional deck the sources support. Work out the purpose, the audience and the one conclusion from the material itself.";

export function planSystem(): string {
  return [
    "You plan a slide deck before it is written. Read the brief and the sources, then choose what a senior consultant would choose.",
    "ANGLES: " + ANGLES.map((a) => `${a.id} (${a.name}: ${a.summary})`).join("; ") + ".",
    "Choose: the angle that fits the material; the audience in a few words; the number of slides (6 to 30, about one slide per distinct point the sources can carry, never padding); a working title that states the conclusion; and which devices the material can fill: charts only if the sources carry numbers in series, tables if they carry comparisons, diagrams if they describe a process or dates, kpis if they carry headline figures, sections if the deck has more than 12 slides, summary and qa if the audience will decide or ask.",
    "reason: one sentence on why, for the user to read.",
    "Then plan the story, in this order. The blueprint: who the audience is and what they must decide or remember. The arc: one sentence, situation, the problem or change, what it means, what to do. The storyline: one entry per slide in reading order, exactly as many as the slides you chose, each with a title (the slide's conclusion in under 12 words, carrying its number where the sources give one), a point (the one idea the slide proves, one short sentence) and a layout (the visual that carries it best: " + STORY_LAYOUTS.join(", ") + "). One idea per entry; an entry that needs two titles is two entries. Open with the title slide and close with the closing slide; put the answer on slide 2.",
    "Answer only with the JSON the schema asks for.",
  ].join("\n");
}

export interface Plan {
  title: string | null;
  angle: string;
  audience: string;
  slides: number;
  features: Pick<Features, "charts" | "tables" | "diagrams" | "kpis" | "sections" | "summary" | "qa">;
  reason: string;
  arc?: string;
  storyline?: StoryBeat[];
}

/** The layouts a storyline entry may name. */
export const STORY_LAYOUTS = ["title", "section", "kpi", "chart", "table", "diagram", "cards", "two-column", "facts", "map", "image", "gallery", "quote", "bullets", "closing"];

/** A storyline as the model gave it, kept only where every field is text and the layout is one the writer knows. */
export function cleanStoryline(raw: unknown, max = 30): StoryBeat[] {
  if (!Array.isArray(raw)) return [];
  const flat = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  return raw
    .map((b) => (b && typeof b === "object" ? (b as Record<string, unknown>) : {}))
    .map((b) => ({ title: flat(b.title, 140), point: flat(b.point, 240), layout: flat(b.layout, 20).toLowerCase() }))
    .filter((b) => b.title)
    .map((b) => ({ ...b, layout: STORY_LAYOUTS.includes(b.layout) ? b.layout : "cards" }))
    .slice(0, max);
}

/** Folds a plan into the params. Notes and citations stay on; pictures follow what the deck holds. */
export function applyPlan(p: GenerateParams, plan: Plan, hasPictures: boolean): void {
  // Strings only: in plain-JSON mode a model may answer with a list or an object where text was asked for.
  p.angle = angleById(typeof plan.angle === "string" ? plan.angle : "custom").id;
  if (typeof plan.audience === "string" && plan.audience.trim()) p.audience = plan.audience.trim().slice(0, 120);
  p.slides = Math.max(6, Math.min(30, Math.round(Number(plan.slides) || 12)));
  if (!p.title && typeof plan.title === "string" && plan.title.trim()) p.title = plan.title.trim().slice(0, 140);
  const f = plan.features ?? ({} as Plan["features"]);
  // Every visual device stays available whatever the plan says: they are how a slide carries a point without a
  // paragraph, and the writer only uses one the sources can fill. A device the person unticked stays off.
  const off = new Set(p.off ?? []);
  const visual = Object.fromEntries(VISUAL_FEATURES.map((k) => [k, !off.has(k)])) as Partial<Features>;
  p.features = { ...p.features, ...visual, sections: !!f.sections, summary: !!f.summary, qa: !!f.qa, notes: true, citations: true, images: hasPictures && !off.has("images") };
  p.imageMode = p.features.images ? "uploaded" : "none";
  // The storyline sets the length when it is whole: the writer is told to follow it slide for slide.
  const story = cleanStoryline(plan.storyline);
  // Six is the deck's floor: a shorter storyline would contradict the slide count, so it is dropped.
  if (story.length >= 6) {
    p.storyline = story;
    p.slides = Math.min(30, story.length);
    if (typeof plan.arc === "string" && plan.arc.trim()) p.arc = plan.arc.replace(/\s+/g, " ").trim().slice(0, 300);
  }
}

/** The planner's own message: the brief and a short look at each source, and a clear instruction not to write the deck. */
export function planUser(p: GenerateParams, sources: { name: string; kind: string; text: string }[]): string {
  const parts = [
    "TASK: choose the settings for a slide deck and plan its storyline. Do NOT write the slides themselves: a title, a one-line point and a layout for each is the whole plan. Answer with the plan JSON only.",
    `BRIEF: ${p.prompt.trim()}`,
  ];
  if (p.title) parts.push(`DECK TITLE: ${p.title}`);
  if (sources.length) {
    parts.push(`SOURCES (${sources.length}; the start of each):`);
    for (const x of sources.slice(0, 30)) parts.push(x.kind === "image" ? `- Picture: ${x.name}` : `- ${x.name} (${x.kind}): ${x.text.slice(0, 1500).replace(/\s+/g, " ")}`);
  } else parts.push("SOURCES: none.");
  return parts.join("\n");
}

/** Settings used when the model will not plan: the form's angle, a length that fits the material, every visual it can fill. */
export function fallbackPlan(p: GenerateParams, hasNumbers: boolean, sourceCount: number): Plan {
  return {
    title: null,
    angle: p.angle,
    audience: p.audience || "professional readers",
    slides: sourceCount >= 4 ? 14 : 10,
    features: { charts: hasNumbers, tables: true, diagrams: true, kpis: true, sections: sourceCount >= 4, summary: true, qa: false },
    reason: "Standard settings, because the model did not return a plan.",
    arc: "",
    storyline: [],
  };
}

export function mockPlan(p: GenerateParams, hasNumbers: boolean): Plan {
  return { title: null, angle: "regulatory-briefing", audience: "management and product teams", slides: 12, features: { charts: hasNumbers, tables: true, diagrams: true, kpis: true, sections: true, summary: true, qa: false }, reason: `Stand-in plan for: ${p.prompt.slice(0, 60)}` };
}

/** A source as the condenser sees it: its text, and the notes a previous run cached for it. */
export interface NamedSource {
  /** The sources row, when there is one: where the cached notes are written back. */
  id?: string;
  name: string;
  kind: string;
  text: string;
  condensed_key?: string | null;
  condensed?: string | null;
}

/** What a cached set of notes is good for: this exact text under this exact instruction. */
export function condenseKey(text: string, sys: string): string {
  return crypto.createHash("sha256").update(text).update("\n\u0000\n").update(sys).digest("hex");
}

/** How many parts a long source is read in, and how long each is. */
const PART_CHARS = 60000;
const MAX_PARTS = 8;

/**
 * Every long source cut into parts and each part condensed to its facts, four calls at a time on the
 * quick model: a pile of sources is read in the time of its longest part, not the sum of them all.
 * A source whose notes were cached under the same text and the same instruction is not read again:
 * a regenerate on the same deck with the same brief condenses nothing.
 */
export async function condenseAll(named: NamedSource[], auth: LlmAuth, sys: string, say: (l: string) => void): Promise<{ name: string; kind: string; text: string }[]> {
  const tasks: { si: number; ci: number; text: string; name: string }[] = [];
  const cachedParts = new Map<number, string>();
  let partsFromCache = 0;
  let partsInAll = 0;
  named.forEach((s, si) => {
    if (s.kind === "image" || s.text.length < 6000) return;
    const parts = Math.min(MAX_PARTS, Math.ceil(s.text.length / PART_CHARS));
    partsInAll += parts;
    if (s.condensed_key && typeof s.condensed === "string" && s.condensed_key === condenseKey(s.text, sys)) {
      cachedParts.set(si, s.condensed);
      partsFromCache += parts;
      return;
    }
    if (s.text.length > MAX_PARTS * PART_CHARS) say(`${s.name}: only the first ${Math.round((MAX_PARTS * PART_CHARS) / 1000)}k characters of ${Math.round(s.text.length / 1000)}k are read`);
    for (let ci = 0; ci < parts; ci++) tasks.push({ si, ci, text: s.text.slice(ci * PART_CHARS, (ci + 1) * PART_CHARS), name: s.name });
  });
  if (partsInAll) say(`${partsFromCache} of ${partsInAll} part${partsInAll === 1 ? "" : "s"} from cache`);
  if (tasks.length) say(`Condensing ${tasks.length} part${tasks.length === 1 ? "" : "s"} of ${new Set(tasks.map((t) => t.si)).size} source${new Set(tasks.map((t) => t.si)).size === 1 ? "" : "s"}, 4 at a time`);
  const quick = fastAuth(auth);
  // One failed part fails the lot: the others stop taking parts rather than spend calls on a dead job.
  const answers = await mapPool(tasks, 4, (t) => chatText(quick, sys, `### ${t.name}\n${t.text}`));
  const results = new Map<string, string>();
  tasks.forEach((t, i) => results.set(`${t.si}:${t.ci}`, answers[i]));
  const out = named.map((s, si) => {
    const cached = cachedParts.get(si);
    if (cached !== undefined) return { name: s.name, kind: s.kind, text: cached };
    const parts = tasks.filter((t) => t.si === si).sort((a, b) => a.ci - b.ci);
    if (!parts.length) return { name: s.name, kind: s.kind, text: s.text };
    const text = parts.map((t) => results.get(`${t.si}:${t.ci}`) ?? "").join("\n\n");
    // Kept against the source for the next run that asks the same thing of the same text.
    if (s.id) saveCondensed(s.id, condenseKey(s.text, sys), text);
    return { name: s.name, kind: s.kind, text };
  });
  // Many small sources add up the same way one big one does: past the budget the pile is trimmed, and said so.
  let room = CONDENSED_TOTAL;
  let trimmed = 0;
  for (const s of out) {
    if (s.kind === "image") continue;
    if (s.text.length <= room) room -= s.text.length;
    else {
      trimmed += s.text.length - Math.max(0, room);
      s.text = room > 0 ? s.text.slice(0, room) : "";
      room = 0;
    }
  }
  if (trimmed) say(`The sources run past what the writer can read: ${Math.round(trimmed / 1000)}k characters at the end were left out`);
  return out;
}

/** The most text the writer is handed in one call, after condensing. */
const CONDENSED_TOTAL = 400_000;

/** The sources as the condenser and the writer read them, with the notes cached on each row. */
export function namedSources(rows: SourceRow[]): NamedSource[] {
  return rows.map((r) => ({ id: r.id, name: r.rel_path || r.name, kind: r.kind, text: r.text, condensed_key: r.condensed_key ?? null, condensed: r.condensed ?? null }));
}

async function prepareSources(jobId: string, auth: LlmAuth | null, p: GenerateParams, rows: SourceRow[]): Promise<{ sources: { name: string; kind: string; text: string }[]; condensed: boolean }> {
  const named = namedSources(rows);
  const total = named.reduce((a, s) => a + s.text.length, 0);
  if (total <= config.sourceBudget || !auth) return { sources: named.map((s) => ({ name: s.name, kind: s.kind, text: s.text })), condensed: false };
  log(jobId, `Sources total ${total.toLocaleString()} characters, over the ${config.sourceBudget.toLocaleString()} budget: condensing each to the facts`);
  const sys = condensePrompt(p);
  return { sources: await condenseAll(named, auth, sys, (l) => log(jobId, l)), condensed: true };
}

function coerceDiagram(raw: unknown): DiagramSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  // The newer kinds are read by the sanitizer, which knows their shapes.
  if (["hub", "funnel", "equation"].includes(String((raw as { kind?: unknown }).kind))) return undefined;
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
    else if (d.kind === "hub") items.push(...d.nodes.map((n) => `${n.label}${n.detail ? ": " + n.detail : ""}`), ...(d.pills ?? []));
    else if (d.kind === "funnel") items.push(...d.stages.map((st) => `${st.value} ${st.label}`));
    else if (d.kind === "equation") items.push(...d.terms.map((t) => `${t.value} ${t.label}`), ...(d.result ? [`= ${d.result.value} ${d.result.label}`] : []));
    else items.push(...d.rows.map((r, i) => `${r}: ${d.cols.map((c, j) => `${c} ${d.cells[i]?.[j] ?? ""}`).join(", ")}`));
  }
  if (s.layout === "image" && s.image?.caption) items.push(s.image.caption);
  if (s.layout === "facts" && s.facts) items.push(...s.facts.map((f) => `${f.label}: ${f.value}`));
  if (s.layout === "gallery" && s.gallery) items.push(...s.gallery.map((g) => g.caption).filter((x): x is string => !!x));
  if (s.layout === "map" && s.map) {
    items.push(...s.map.areas.map((a) => `${a.code}: ${a.status}${a.note ? ` (${a.note})` : ""}`));
    if (s.map.source) s.citations = [...(s.citations ?? []), s.map.source];
  }
  if (s.layout === "cards" && s.cards) items.push(...s.cards.map((k) => `${k.tag ? `${k.tag}: ` : ""}${k.heading}${k.detail ? ` (${k.detail})` : ""}`));
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
  delete s.facts;
  delete s.gallery;
  delete s.map;
}

const firstStr = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
  return undefined;
};
const asText = (v: unknown): string =>
  typeof v === "string" ? v : v && typeof v === "object" ? String(firstStr(v as Record<string, unknown>, ["text", "point", "label", "title", "heading", "value"]) ?? Object.values(v as object).filter((x) => typeof x === "string").join(": ")) : String(v ?? "");

/**
 * A model that ignored the schema still wrote slides, under names of its own
 * (heading, content, points, speakerNotes). Map those onto the schema's names,
 * never overwriting a field the model did fill correctly.
 */
/** Nothing there yet: a field the model filled in any shape is left for the sanitizer to read. */
const empty = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && !v.trim());

export function coerceSlideShape(raw: Record<string, unknown>): Record<string, unknown> {
  const inner = raw.content && typeof raw.content === "object" && !Array.isArray(raw.content) ? (raw.content as Record<string, unknown>) : {};
  const o: Record<string, unknown> = { ...inner, ...raw };
  const out: Record<string, unknown> = { ...raw };
  if (empty(out.title)) out.title = firstStr(o, ["title", "heading", "slideTitle", "slide_title", "headline", "name", "header"]) ?? "";
  if (empty(out.kicker)) out.kicker = firstStr(o, ["eyebrow", "label", "tag", "section"]) ?? null;
  if (empty(out.subtitle)) out.subtitle = firstStr(o, ["subheading", "sub_title", "subTitle", "tagline"]) ?? null;
  if (empty(out.body)) out.body = firstStr(o, ["body", "text", "content", "description", "summary", "message", "paragraph", "keyMessage", "key_message"]) ?? null;
  if (!Array.isArray(out.bullets) || !out.bullets.length) {
    const list = ["bullets", "points", "bullet_points", "bulletPoints", "keyPoints", "key_points", "items", "content", "list"].map((k) => o[k]).find((v) => Array.isArray(v) && v.length);
    out.bullets = list ? (list as unknown[]).map(asText).filter((x) => x.trim()) : [];
  } else out.bullets = (out.bullets as unknown[]).map(asText).filter((x) => x.trim());
  if (empty(out.notes)) out.notes = firstStr(o, ["speakerNotes", "speaker_notes", "presenterNotes", "narration", "script"]) ?? null;
  addVisuals(out, o);
  if (typeof out.layout !== "string") out.layout = firstStr(o, ["type", "slideType", "slide_type", "kind"]) ?? null;
  return out;
}

const VALUE_KEY = /^(value|figure|number|stat|amount|percent|percentage|count)$/i;
const LABEL_KEYS = ["label", "name", "metric", "title", "heading", "what"];
const DETAIL_KEYS = ["detail", "description", "text", "explanation", "body", "summary", "desc"];
const listOfObjects = (v: unknown): Record<string, unknown>[] | null =>
  Array.isArray(v) && v.length >= 2 && v.every((x) => x && typeof x === "object" && !Array.isArray(x)) ? (v as Record<string, unknown>[]) : null;

/**
 * A model that ignored the schema still often drew the visual, in words of its own: figures as
 * [{name, value}], a process as "stages", cards as [{title, description}]. Turn those into the
 * slide's real visual instead of flattening them into text.
 */
function addVisuals(out: Record<string, unknown>, o: Record<string, unknown>): void {
  const has = (k: string) => Array.isArray(out[k]) ? (out[k] as unknown[]).length > 0 : !!out[k] && typeof out[k] === "object";
  const entries = Object.entries(o);
  // Figures → number tiles.
  if (!has("kpi")) {
    for (const [, v] of entries) {
      const list = listOfObjects(v);
      if (!list || list.length > 6) continue;
      if (!list.every((x) => Object.keys(x).some((k) => VALUE_KEY.test(k)))) continue;
      out.kpi = list.map((x) => {
        const vk = Object.keys(x).find((k) => VALUE_KEY.test(k))!;
        return { label: firstStr(x, LABEL_KEYS) ?? "", value: String(x[vk] ?? ""), note: firstStr(x, ["note", ...DETAIL_KEYS]) ?? null };
      });
      if (out.layout !== "kpi" && !(Array.isArray(out.bullets) && out.bullets.length)) out.layout = "kpi";
      break;
    }
  }
  // A process or a timeline → a diagram.
  const d = out.diagram && typeof out.diagram === "object" ? (out.diagram as Record<string, unknown>) : null;
  const stepsIn = (src: Record<string, unknown>) => ["steps", "stages", "process", "flow", "phases", "procedure", "sequence"].map((k) => src[k]).find((v) => Array.isArray(v) && v.length >= 2) as unknown[] | undefined;
  const eventsIn = (src: Record<string, unknown>) => ["events", "timeline", "milestones"].map((k) => src[k]).find((v) => Array.isArray(v) && v.length >= 2) as unknown[] | undefined;
  const hasDiagram = d && ((Array.isArray(d.steps) && d.steps.length) || (Array.isArray(d.events) && d.events.length) || (Array.isArray(d.rows) && d.rows.length));
  if (!hasDiagram) {
    const events = (d && eventsIn(d)) || eventsIn(o);
    const steps = (d && stepsIn(d)) || stepsIn(o);
    if (events && events.every((e) => e && typeof e === "object" && firstStr(e as Record<string, unknown>, ["when", "date", "year", "time"]))) {
      out.diagram = { kind: "timeline", events: events.map((e) => ({ when: firstStr(e as Record<string, unknown>, ["when", "date", "year", "time"]) ?? "", label: firstStr(e as Record<string, unknown>, ["label", "event", ...LABEL_KEYS, ...DETAIL_KEYS]) ?? "" })) };
    } else if (steps) {
      out.diagram = { kind: "flow", steps: steps.map((x) => (typeof x === "string" ? { label: x } : x && typeof x === "object" ? { label: firstStr(x as Record<string, unknown>, ["label", "step", "stage", ...LABEL_KEYS]) ?? "", detail: firstStr(x as Record<string, unknown>, DETAIL_KEYS) ?? null } : { label: String(x) })) };
    }
    if (out.diagram && out.layout !== "diagram" && !(Array.isArray(out.bullets) && out.bullets.length)) out.layout = "diagram";
  }
  // Titled points → cards.
  if (!has("cards") && (out.layout === "cards" || !has("kpi"))) {
    for (const [k, v] of entries) {
      if (["kpi", "diagram", "citations", "sources", "chart", "table"].includes(k)) continue;
      const list = listOfObjects(v);
      if (!list || list.length > 6) continue;
      if (!list.every((x) => firstStr(x, ["heading", "title", "name", "point"]) && firstStr(x, DETAIL_KEYS))) continue;
      out.cards = list.map((x) => ({ heading: firstStr(x, ["heading", "title", "name", "point"])!, detail: firstStr(x, DETAIL_KEYS) ?? null, tag: firstStr(x, ["tag", "badge", "status"]) ?? null }));
      if (!(Array.isArray(out.bullets) && out.bullets.length) || out.layout === "cards") {
        out.layout = "cards";
        out.bullets = [];
      }
      break;
    }
  }
  // A table under other names.
  const t = out.table && typeof out.table === "object" ? (out.table as Record<string, unknown>) : null;
  if (t && !Array.isArray(t.header)) {
    const header = ["headers", "columns", "cols", "head"].map((k) => t[k]).find(Array.isArray);
    if (header) out.table = { ...t, header };
  }
}

/** A slide with nothing on its face: no title, no body, no bullets, nothing drawn. */
function isBlank(s: Slide): boolean {
  const r = s as unknown as Record<string, unknown>;
  return !String(s.title ?? "").trim() && !String(r.body ?? "").trim() && !(Array.isArray(r.bullets) && r.bullets.length) && !r.chart && !r.table && !r.diagram && !(Array.isArray(r.kpi) && r.kpi.length) && !(Array.isArray(r.cards) && r.cards.length) && !r.quote && !(Array.isArray(r.facts) && r.facts.length) && !(Array.isArray(r.gallery) && r.gallery.length) && !r.map;
}

const NOT_FACE = new Set(["title", "heading", "slidetitle", "slide_title", "headline", "kicker", "eyebrow", "subtitle", "layout", "type", "kind", "slidetype", "notes", "speakernotes", "speaker_notes", "presenternotes", "narration", "script", "citations", "sources", "source", "references", "id", "image", "prompt", "unit", "sourcename"]);

/**
 * Every piece of text a slide carries outside the fields that name or annotate it, as bullets:
 * what is left when the model put the content somewhere the schema has no name for, or in a
 * visual the slide could not draw. A pair like {label, value} becomes one line.
 */
const LABEL_KEY = /^(label|name|heading|metric|key|term|step|stage|item|when|date|year)$/i;

export function harvestText(raw: unknown, max = 6): string[] {
  const out: string[] = [];
  const walk = (v: unknown, depth: number): void => {
    if (out.length >= max || depth > 4 || v == null) return;
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length >= 3 && !out.includes(t)) out.push(t.length > 160 ? t.slice(0, 157).trimEnd() + "…" : t);
      return;
    }
    if (typeof v === "number") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const strEntries = Object.entries(o).filter(([k, x]) => typeof x === "string" && x.trim() && !NOT_FACE.has(k.toLowerCase()));
    const strs = strEntries.map(([, x]) => (x as string).trim());
    const rest = Object.entries(o).filter(([k, x]) => typeof x !== "string" && !NOT_FACE.has(k.toLowerCase()));
    const labelled = strEntries.some(([k]) => LABEL_KEY.test(k)) || Object.values(o).some((x) => typeof x === "number");
    if (depth > 0 && labelled && strs.length >= 1 && strs.length <= 3 && strs.join(" ").length <= 160) {
      // A small record ({label, value, note}) reads as one line.
      const line = strs.join(": ");
      const num = Object.values(o).find((x) => typeof x === "number");
      const full = num !== undefined && !line.includes(String(num)) ? `${line}: ${num}` : line;
      if (!out.includes(full)) out.push(full);
    } else strs.forEach((x) => walk(x, depth + 1));
    rest.forEach(([, x]) => walk(x, depth + 1));
  };
  walk(raw, 0);
  return out.slice(0, max);
}

const STRUCTURAL = new Set(["title", "section", "closing"]);

/** A content slide that says nothing below its title. */
export function hasNoFace(s: Slide): boolean {
  if (STRUCTURAL.has(s.layout)) return false;
  const r = s as unknown as Record<string, unknown>;
  return !String(r.body ?? "").trim() && !(Array.isArray(r.bullets) && r.bullets.length) && !(Array.isArray(r.bulletsRight) && r.bulletsRight.length) && !r.chart && !r.table && !r.diagram && !(Array.isArray(r.kpi) && r.kpi.length) && !(Array.isArray(r.cards) && r.cards.length) && !r.quote && !r.image && !(Array.isArray(r.facts) && r.facts.length) && !(Array.isArray(r.gallery) && r.gallery.length) && !r.map;
}

function toSlide(raw: Record<string, unknown>, features: Features, imageMode: string): Slide {
  const s = finishSlide(normaliseSlide(coerceSlideShape(raw)), raw, features, imageMode);
  if (hasNoFace(s)) {
    // The content is in the answer, just not where a field reads it: put it on the slide as points.
    const got = harvestText(raw);
    if (got.length) {
      s.layout = "bullets";
      (s as unknown as Record<string, unknown>).bullets = got;
    }
  }
  return s;
}

function finishSlide(s: Slide, raw: Record<string, unknown>, features: Features, imageMode: string): Slide {
  s.diagram = coerceDiagram(raw.diagram) ?? s.diagram;
  if (s.layout === "diagram" && !s.diagram) s.layout = "bullets";
  if (s.layout === "chart" && (!s.chart || !s.chart.series?.length)) s.layout = "bullets";
  if (s.layout === "table" && !s.table?.header?.length) s.layout = "bullets";
  if (s.layout === "kpi" && !s.kpi?.length) s.layout = "bullets";
  if (s.layout === "quote" && !s.quote?.text) s.layout = "bullets";
  if (s.layout === "cards" && !s.cards?.length) s.layout = "bullets";
  if (s.layout === "facts" && !s.facts?.length) s.layout = "bullets";
  if (s.layout === "map" && !s.map) s.layout = "bullets";
  // A gallery with nothing in it would draw empty frames; one picture is an image slide.
  if (s.layout === "gallery" && !s.gallery?.length) s.layout = "bullets";
  const pictures = features.images && imageMode !== "none";
  const banned: Record<string, boolean> = { chart: !features.charts, table: !features.tables, diagram: !features.diagrams, kpi: !features.kpis, image: !pictures, section: !features.sections, facts: !features.facts, map: !features.maps, gallery: !features.gallery || !pictures };
  if (banned[s.layout]) demote(s);
  // The hero row on a title slide is figures too.
  if (s.layout === "title" && !features.kpis) delete s.kpi;
  if (!features.notes) delete s.notes;
  if (!features.citations) delete s.citations;
  if (!features.callouts) delete s.callout;
  if (!features.asides) delete s.aside;
  if (!features.badges) delete s.badge;
  if (!features.gauges && s.kpiStyle === "rings") s.kpiStyle = "tiles";
  return autoFixSlide(s);
}

export async function runGenerate(jobId: string, userId: string, deckId: string, p: GenerateParams): Promise<void> {
  try {
    setJob(jobId, { status: "running" });
    const deck = loadDeck(userId, deckId);
    if (!deck) throw new Error("deck not found");
    const auth = config.mockLlm ? null : resolveAuth(userId, p.model);
    if (!config.mockLlm && !auth) throw new LlmError("No OpenAI key. Add one in Settings.", 0, "no_key");
    if (auth) log(jobId, `Writer model: ${auth.model}${fastAuth(auth).model !== auth.model ? `; reading and planning on ${fastAuth(auth).model}` : ""}`);
    p.house = promptTexts(userId, deck.brief?.prompts);
    p.houseRules = houseFor(userId);
    p.designNotes = deck.designId ? getDesign(userId, deck.designId)?.notes : themeGuide(deck.theme?.id);
    if (p.house.length) log(jobId, `Saved prompts: ${p.house.map((h) => h.name).join(", ")}`);
    if (deck.designId) log(jobId, p.designNotes !== undefined ? `Design: ${deck.theme.name}` : "The deck's design was deleted; writing without its notes");
    if (deck.onedrive && p.imageMode === "uploaded") {
      log(jobId, `Checking OneDrive folder "${deck.onedrive.folder || "(root)"}" for new pictures`);
      try {
        const r = await importFolder(userId, deckId, deck.onedrive.folder, deck.onedrive.subfolders, (l) => log(jobId, l));
        log(jobId, summarise(r));
        updateDeck(userId, deckId, (d) => {
          if (d.onedrive) d.onedrive.lastSync = now();
        });
      } catch (e) {
        // A OneDrive outage costs the fresh pull, never the deck.
        log(jobId, `OneDrive not read (${(e as Error).message}). Using the pictures already pulled.`);
      }
    }
    const reader = config.mockLlm ? null : pictureAuth(userId);
    if (reader) await readUploadedPictures(jobId, userId, deckId, reader);
    const rows = listSources(deckId);
    // The planner reads only the start of each source, so it runs while the long ones are being
    // condensed rather than after: the two calls are independent, and the plan is ready when the
    // notes are. A failure on either side ends the job without waiting for the other.
    let planning: Promise<Plan> | null = null;
    if (p.auto) {
      log(jobId, "Auto: reading the material to choose the angle, audience, length and layouts");
      const peek = namedSources(rows);
      const hasNumbers = peek.some((x) => /\d{2,}/.test(x.text));
      if (config.mockLlm || !auth) planning = Promise.resolve(mockPlan(p, hasNumbers));
      else {
        const quick = auth;
        planning = (async () => {
          try {
            // Room for a storyline of up to 30 entries as well as the settings.
            return await chatJson<Plan>({ auth: fastAuth(quick), system: planSystem(), user: planUser(p, peek), schemaName: "plan", schema: PLAN_SCHEMA, maxTokens: 4000, optional: ["arc", "storyline"] });
          } catch (e) {
            // The plan only picks settings; a model that will not give one still gets to write the deck.
            if (!(e instanceof LlmError) || !["parse", "length", "unsupported"].includes(String(e.code))) throw e;
            log(jobId, `Auto: the model did not return a plan (${e.message}), so standard settings are used`);
            if (e.raw !== undefined) log(jobId, `Model reply (first ${RAW_KEEP} characters): ${e.raw || "(empty)"}`);
            return fallbackPlan(p, hasNumbers, peek.length);
          }
        })();
        // If condensing fails first the job ends there; the plan's own failure must not go unobserved.
        planning.catch(() => undefined);
      }
    }
    const { sources, condensed } = await prepareSources(jobId, auth, p, rows);
    if (planning) {
      const hasPictures = rows.some((r) => r.kind === "image" && r.media_id);
      const plan = await planning;
      applyPlan(p, plan, hasPictures);
      const on = (["charts", "tables", "diagrams", "kpis", "sections"] as const).filter((k) => p.features[k]);
      log(jobId, `Auto: ${angleById(p.angle).name} for ${p.audience}, ${p.slides} slides, using ${on.length ? on.join(", ") : "text layouts only"}${hasPictures ? ", with the deck's pictures" : ""}.${plan.reason ? " " + plan.reason : ""}`);
      if (p.storyline?.length) log(jobId, `Auto: storyline planned, ${p.storyline.length} slides${p.arc ? `: ${p.arc}` : ""}`);
      const d = loadDeck(userId, deckId);
      if (d) {
        d.brief = { ...(d.brief ?? { text: "", purposes: [], include: [], audiences: [] }), slides: p.slides, imageMode: p.imageMode, features: { ...p.features }, auto: true };
        saveDeck(userId, d);
        deck.brief = d.brief;
      }
    }
    log(jobId, `${rows.length} source${rows.length === 1 ? "" : "s"}, ${p.slides} slides, angle ${angleById(p.angle).name}, ${p.lang === "ms" ? "Bahasa Malaysia" : "English"}`);
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
    if (!Array.isArray(json.slides)) {
      // A model that wrapped the deck in a shape of its own ({deck:{slides}}, {outline:[…]}) still wrote it.
      const found = findSlides(json);
      if (found) {
        log(jobId, `The writer put the slides under "${found.at}" instead of "slides"; using them`);
        json = { ...json, title: json.title ?? found.title ?? "", subtitle: json.subtitle ?? null, slides: found.slides };
      }
    }
    const rawSlides = (Array.isArray(json.slides) ? json.slides : []).filter((r) => r && typeof r === "object") as Record<string, unknown>[];
    const slides = rawSlides.map((r) => toSlide(r, p.features, p.imageMode));
    // Keep the writer's answer for this deck, so a deck that comes out wrong can be looked into.
    try {
      const dir = path.join(config.dataDir, "writer-replies");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${deckId}.json`), JSON.stringify(json, null, 2));
    } catch {
      /* diagnostics only */
    }
    const content = slides.filter((x) => !STRUCTURAL.has(x.layout));
    const faceless = content.filter(hasNoFace).length;
    const blank = slides.filter(isBlank).length;
    if (faceless) {
      const sample = rawSlides.find((r, i) => hasNoFace(slides[i]));
      log(jobId, `${faceless} slide${faceless === 1 ? "" : "s"} came back with a title and nothing under it. First one as the writer sent it: ${rawSnippet(JSON.stringify(sample ?? {}))}`);
    }
    if (slides.length && blank > slides.length / 2) {
      // Better a clear failure than a deck of empty frames that reads as done.
      const keys = [...new Set(rawSlides.flatMap((r) => Object.keys(r)))].slice(0, 20).join(", ");
      const e = new LlmError(`The writer returned ${slides.length} slides but ${blank} have nothing on them (it used the fields: ${keys || "none"})`, 0, "no_slides");
      e.raw = rawSnippet(JSON.stringify(json));
      throw e;
    }
    if (content.length && faceless > content.length / 2) {
      const keys = [...new Set(rawSlides.flatMap((r) => Object.keys(r)))].slice(0, 20).join(", ");
      const e = new LlmError(`The writer returned ${content.length} content slides but ${faceless} have a title and nothing on them (it used the fields: ${keys || "none"})`, 0, "no_slides");
      e.raw = rawSnippet(JSON.stringify(json));
      throw e;
    }
    if (!slides.length) {
      const e = new LlmError("The writer returned no slides", 0, "no_slides");
      e.raw = rawSnippet(JSON.stringify(json));
      throw e;
    }
    // Design: a writer that answered in bullets is asked to redraw its text slides from the sources' own figures.
    if (!config.mockLlm && auth && needsDesign(slides)) {
      log(jobId, "Designing: most slides are text, so the writer is asked to redraw them as charts, tables, diagrams and figures");
      try {
        const n = await designPass(auth, slides, sources, p.features, p.lang, (r) => toSlide(r, p.features, p.imageMode), p.designNotes, p.houseRules);
        log(jobId, n ? `Design: ${n} slide${n === 1 ? "" : "s"} redrawn as visuals` : "Design: the writer found no slide it could redraw honestly");
      } catch (e) {
        // The deck is already written; a design pass that fails costs the redesign, never the deck.
        log(jobId, `Design pass skipped: ${(e as Error).message}`);
      }
    }
    // Pictures.
    const imageSlides = slides.filter((s) => s.layout === "image");
    const pics = rows.filter((r) => r.kind === "image" && r.media_id);
    if (imageSlides.length && p.imageMode === "uploaded") {
      const taken = new Set<string>();
      for (const [i, s] of slides.entries()) {
        if (s.layout !== "image" || s.image?.mediaId) continue;
        // The file the writer named; slides still line up with the writer's answer here.
        const want = String((rawSlides[i]?.image as { sourceName?: unknown } | undefined)?.sourceName ?? "").toLowerCase().trim();
        const byName = (r: SourceRow) => !!want && (r.name.toLowerCase() === want || (r.rel_path ?? "").toLowerCase() === want);
        // The picture the writer named; else the next one not yet on a slide; never the same picture twice while others wait.
        const match = pics.find((r) => byName(r)) ?? pics.find((r) => !taken.has(r.media_id!)) ?? null;
        if (match?.media_id) {
          s.image = { ...(s.image ?? {}), mediaId: match.media_id };
          taken.add(match.media_id);
        }
      }
    }
    // Gallery pictures: the files the writer named, then pictures not yet on any slide.
    if (p.imageMode === "uploaded" && pics.length) {
      const onSlides = new Set(slides.flatMap((s) => [s.image?.mediaId, ...(s.gallery ?? []).map((g) => g.mediaId)]).filter(Boolean));
      for (const [i, s] of slides.entries()) {
        if (s.layout !== "gallery" || !s.gallery) continue;
        const named = Array.isArray(rawSlides[i]?.gallery) ? (rawSlides[i].gallery as { sourceName?: unknown }[]) : [];
        s.gallery.forEach((g, j) => {
          if (g.mediaId) return;
          const want = String(named[j]?.sourceName ?? "").toLowerCase().trim();
          const match = pics.find((r) => !!want && (r.name.toLowerCase() === want || (r.rel_path ?? "").toLowerCase() === want)) ?? pics.find((r) => !onSlides.has(r.media_id!));
          if (match?.media_id) {
            g.mediaId = match.media_id;
            onSlides.add(match.media_id);
          }
        });
        // Frames with no picture are dropped; a gallery left with one picture is an image slide.
        s.gallery = s.gallery.filter((g) => g.mediaId || g.url);
        if (s.gallery.length === 1) {
          s.layout = "image";
          s.image = s.gallery[0];
          delete s.gallery;
        } else if (!s.gallery.length) demote(s);
      }
    }
    if (p.imageMode === "uploaded" && p.features.images && pics.length) {
      const placed = placePictures(slides, pics.map((r) => ({ mediaId: r.media_id!, name: r.rel_path || r.name, text: r.text })), p.lang, 6, p.auto ? Infinity : p.slides);
      if (placed) log(jobId, `${placed} uploaded picture${placed === 1 ? "" : "s"} the writer did not use put on the slides they belong to`);
    } else if (p.imageMode === "generate" && auth) {
      // Every frame waiting for a picture: image slides first, then gallery frames. At most four in all.
      const frames = [...imageSlides.map((s) => (s.image ??= {})), ...slides.filter((s) => s.layout === "gallery").flatMap((s) => s.gallery ?? [])];
      const wanted = frames.filter((img) => img.prompt && !img.mediaId).slice(0, 4);
      wanted.forEach((img, i) => log(jobId, `Generating picture ${i + 1}: ${img.prompt!.slice(0, 60)}`));
      // The pictures do not depend on one another: all of them at once, and one that fails costs only itself.
      await mapPool(wanted, 4, async (img, i) => {
        const n = i + 1;
        try {
          const png = await generateImage(auth, `${img.prompt}. Clean, well lit, no text, no logos, no watermark.`);
          const m = addMedia(userId, deckId, `generated-${n}.png`, "image/png", png, "generated");
          img.mediaId = m.id;
        } catch (e) {
          log(jobId, `Picture ${n} failed: ${(e as Error).message}`);
        }
      });
    }
    // Whatever is still text-heavy is redrawn from its own words.
    const redrawn = visualise(slides, p.features);
    if (redrawn) log(jobId, `${redrawn} more text slide${redrawn === 1 ? "" : "s"} redrawn from their own words as figures, diagrams or cards`);
    // Written into the deck as it is now: a theme, design or brief changed while the writer worked is kept.
    const saved = updateDeck(userId, deckId, (d) => {
      // Only a string is a title: a number or an object from the writer would break every later save and export.
      const title = typeof json.title === "string" ? json.title.trim().slice(0, 300) : "";
      const subtitle = typeof json.subtitle === "string" ? json.subtitle.trim().slice(0, 300) : "";
      d.title = title || d.title;
      if (subtitle) d.subtitle = subtitle;
      d.lang = p.lang;
      d.angle = p.angle;
      d.audience = p.audience;
      d.slides = slides;
    });
    if (!saved) throw new Error("The deck was deleted while it was being written.");
    log(jobId, `Done: ${slides.length} slides`);
    setJob(jobId, { status: "done", result: { deckId } });
  } catch (e) {
    const msg = e instanceof LlmError ? `${e.message}` : (e as Error).message;
    // What the model actually sent, so a failure can be diagnosed from the log.
    if (e instanceof LlmError && e.raw !== undefined) {
      log(jobId, `Model reply (first ${RAW_KEEP} characters): ${e.raw || "(empty)"}`);
      // The console is an Actions log on the team link, and that log is public: only the size goes there.
      console.warn(`[slidecraft] job ${jobId}: ${e.code} (reply of ${e.raw.length} characters kept in the job log)`);
    }
    log(jobId, `Failed: ${msg}`);
    setJob(jobId, { status: "failed", error: msg });
  }
}

export async function rewriteSlide(userId: string, deck: Deck, slide: Slide, instruction: string): Promise<Slide> {
  const raw = slide as unknown as Record<string, unknown>;
  if (config.mockLlm) {
    const { review: _r, ...content } = raw;
    const m = toSlide({ ...mockRewrite(content, instruction), id: slide.id }, EVERY_FEATURE, "uploaded");
    if (slide.review) m.review = slide.review;
    return m;
  }
  const auth = resolveAuth(userId);
  if (!auth) throw new LlmError("No OpenAI key. Add one in Settings.", 0, "no_key");
  // The review is the user's bookkeeping, not slide content: keep it away from the writer.
  const { id, review, ...rest } = slide;
  const user = `INSTRUCTION: ${instruction}\n\nDECK: ${deck.title}\n\nSLIDE (JSON):\n${JSON.stringify(rest)}`;
  const house = promptTexts(userId, deck.brief?.prompts);
  const designNotes = deck.designId ? getDesign(userId, deck.designId)?.notes : themeGuide(deck.theme?.id);
  const out = await chatJson<Record<string, unknown>>({ auth, system: rewriteSystem({ lang: deck.lang, angle: deck.angle, house, designNotes, houseRules: houseFor(userId) }), user, schemaName: "slide", schema: SLIDE_SCHEMA, maxTokens: 4000 });
  const s = toSlide({ ...out, id }, EVERY_FEATURE, "uploaded");
  // A reply with nothing on the slide must never replace the user's slide.
  if (!String(s.title ?? "").trim() || hasNoFace(s)) {
    const e = new LlmError("The writer's rewrite came back empty, so the slide was left as it was. Try again, or rewrite with a clearer instruction.", 0, "no_slides");
    e.raw = rawSnippet(JSON.stringify(out));
    throw e;
  }
  // Keep a picture the rewrite could not know about.
  if (slide.image?.mediaId && s.layout === "image") s.image = { ...(s.image ?? {}), mediaId: slide.image.mediaId };
  // New content needs a new sign-off.
  if (review) s.review = { ...review, ok: false };
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
  return `Apply this feedback from the presenter to the slide. Change what it asks; keep every other fact and citation.\n${items.map((t) => `- ${t}`).join("\n")}`;
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
        const sent = (slide.review?.feedback ?? []).filter((f) => !f.appliedAt);
        const s = await rewriteSlide(userId, cur, slide, feedbackInstruction(sent.map((f) => f.text)));
        const at = now();
        // Saved against the slide as it is now: feedback added while the writer worked stays waiting.
        const done = updateSlide(userId, deckId, s.id, (now_) => ({ ...s, review: { ok: false, feedback: (now_.review?.feedback ?? []).map((f) => (!f.appliedAt && sent.some((x) => x.at === f.at && x.text === f.text) ? { ...f, appliedAt: at } : f)) } }));
        if (!done) log(jobId, `Slide ${i + 1} was deleted while it was being rewritten; nothing saved`);
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
  if (v === "no") {
    log(jobId, `${pics.length} picture source${pics.length === 1 ? "" : "s"} used only as slide pictures: ${auth.model} cannot read pictures, so text inside them does not reach the deck.`);
    return;
  }
  // Unconfirmed is not a no: try, and a picture the model refuses is logged and left as a slide picture.
  if (v === "unknown") log(jobId, `Could not confirm that ${auth.model} reads pictures; trying anyway.`);
  const todo: { r: SourceRow; path: string; mime: string }[] = [];
  for (const r of pics.slice(0, READ_LIMIT)) {
    const m = r.media_id ? getMedia(userId, r.media_id) : null;
    if (!m || !fs.existsSync(m.path)) continue;
    if (m.bytes > READ_MAX_BYTES || m.mime === "image/svg+xml") {
      log(jobId, `Picture ${r.rel_path || r.name} not read: ${m.mime === "image/svg+xml" ? "SVG is not sent to the model" : "larger than 8 MB"}.`);
      continue;
    }
    todo.push({ r, path: m.path, mime: m.mime });
  }
  todo.forEach(({ r }, i) => log(jobId, `Reading picture ${i + 1} with ${auth.model}: ${r.rel_path || r.name}`));
  // Each picture is its own call: four at a time, and one the model refuses is logged and left as a slide picture.
  await mapPool(todo, 4, async ({ r, path: file, mime }) => {
    try {
      const text = await readPicture(auth, r.rel_path || r.name, fs.readFileSync(file), mime);
      getDb().prepare("UPDATE sources SET text = ?, chars = ? WHERE id = ?").run(text, text === NOTHING ? 0 : text.length, r.id);
    } catch (e) {
      log(jobId, `Picture ${r.rel_path || r.name} could not be read: ${(e as Error).message}`);
    }
  });
  if (pics.length > READ_LIMIT) log(jobId, `Read the first ${READ_LIMIT} pictures; the other ${pics.length - READ_LIMIT} are used as slide pictures only.`);
}
