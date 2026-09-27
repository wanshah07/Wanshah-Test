import { newId, type Features, type Slide } from "@slidecraft/shared";
import { chatJson, type LlmAuth } from "./client.js";
import { SLIDE_SCHEMA } from "./schema.js";
import { VISUAL } from "./visualise.js";
import { houseDesign } from "./house.js";

// Two passes after the deck is written, for writers that answer in bullets:
// the writer itself is asked to redesign its text slides as charts, tables,
// diagrams and number tiles from the sources' own figures; and every uploaded
// picture the writer left unused is put on the slide it belongs to.

const STRUCTURAL = new Set(["title", "section", "closing"]);
const SOURCE_BUDGET = 14_000;

export const DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slides: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { index: { type: "integer" }, slide: SLIDE_SCHEMA }, required: ["index", "slide"] },
    },
  },
  required: ["slides"],
};

export function designSystem(f: Features, lang: "en" | "ms", designNotes?: string, houseRules?: string | null): string {
  const kinds = [
    f.charts && "chart (bar, column, line, area, pie or doughnut) when the sources give numbers for several items or several points in time: categories are the items or periods, each series a list of numbers taken exactly from the sources, unit and source set",
    f.tables && "table when the slide compares items across the same attributes: a header row and one row per item",
    f.diagrams && "diagram: flow for a process, method, pathway or sequence (3 to 6 steps, each label 2 to 5 words, detail one short line); timeline for dated events; matrix for a comparison map with rows, cols and a short word in each cell",
    f.diagrams && "diagram hub (a mechanism map: center, 4 to 8 nodes, optional pills) for what one product or ingredient does; funnel (stages of value and label) for a drop-off; equation (terms and a result) for parts adding to a claim",
    f.kpis && "kpi for 2 to 4 headline figures, each value the figure with its unit and label what it measures" + (f.gauges ? ", kpiStyle rings when every value is a percentage" : ""),
    f.facts && "facts for the profile of one study, product or rule: 4 to 8 label and value rows, the key row highlighted",
    f.maps && "map when the slide says how several countries treat the same thing: region asean, asia or world, one area per country with its code and a status of 1 to 3 words",
  ].filter(Boolean);
  return [
    "You are the designer of a slide deck that has already been written. Most of its slides are plain bullet lists; your job is to redraw them as visuals so the deck is looked at, not read.",
    `For each slide you are given, choose the one visual that carries its point best: ${kinds.join("; ")}; cards for 2 to 6 distinct points that each have a short heading and one line of detail.`,
    "Keep the slide's title and its facts. Use only figures, names and wording that appear in the slide or in the sources below; never invent a number, a category, a date or a study. If no visual fits a slide honestly, leave that slide out of your answer.",
    "Put what a presenter would say, but the slide cannot show, in notes. Keep citations.",
    [f.badges && "badge: a verdict pill where the slide judges", f.callouts && "callout: the one sentence to keep, on a few slides", f.asides && "aside: Reading and Watch-outs panels beside a chart, table or map"].filter(Boolean).join("; ") || "Leave badge, callout and aside empty.",
    houseDesign(houseRules),
    ...(designNotes?.trim() ? [`The deck's design, follow its devices: ${designNotes.trim()}`] : []),
    `Write in ${lang === "ms" ? "Bahasa Malaysia (Malaysia), never Bahasa Indonesia" : "English"}. No dashes as punctuation, no emoji.`,
    "Answer with JSON: {\"slides\": [{\"index\": <the slide's index as given>, \"slide\": <the redesigned slide in the schema>}]}.",
  ].join("\n");
}

export function designUser(slides: Slide[], indices: number[], sources: { name: string; kind: string; text: string }[]): string {
  const shown = indices.map((i) => {
    const s = slides[i];
    return { index: i, title: s.title, kicker: s.kicker, body: s.body, bullets: s.bullets, cards: s.cards, citations: s.citations, notes: s.notes };
  });
  let room = SOURCE_BUDGET;
  const src: string[] = [];
  for (const s of sources) {
    if (!s.text || s.text === "NONE" || room <= 0) continue;
    const t = s.text.slice(0, room);
    room -= t.length;
    src.push(`### ${s.name}\n${t}`);
  }
  return [`SLIDES TO REDESIGN (${shown.length}):`, JSON.stringify(shown, null, 1), src.length ? `SOURCES (the figures you may use):\n${src.join("\n\n")}` : "SOURCES: none beyond the slides."].join("\n\n");
}

/** Text slides worth redrawing, in deck order. */
export function textSlideIndices(slides: Slide[]): number[] {
  return slides.map((s, i) => (!STRUCTURAL.has(s.layout) && !VISUAL.has(s.layout) && s.layout !== "quote" ? i : -1)).filter((i) => i >= 0);
}

export function needsDesign(slides: Slide[]): boolean {
  const content = slides.filter((s) => !STRUCTURAL.has(s.layout));
  return content.length > 0 && content.filter((s) => VISUAL.has(s.layout)).length * 2 < content.length;
}

/**
 * Ask the writer to redesign the text slides. Returns how many were replaced.
 * `build` turns a raw slide into a checked one (the same path the deck used).
 */
export async function designPass(
  auth: LlmAuth,
  slides: Slide[],
  sources: { name: string; kind: string; text: string }[],
  f: Features,
  lang: "en" | "ms",
  build: (raw: Record<string, unknown>) => Slide,
  designNotes?: string,
  houseRules?: string | null,
): Promise<number> {
  const indices = textSlideIndices(slides).slice(0, 16);
  if (!indices.length) return 0;
  const json = await chatJson<{ slides?: { index?: unknown; slide?: Record<string, unknown> }[] }>({
    auth,
    system: designSystem(f, lang, designNotes, houseRules),
    user: designUser(slides, indices, sources),
    schemaName: "design",
    schema: DESIGN_SCHEMA,
    maxTokens: Math.min(24000, 1600 * indices.length + 1500),
  });
  let n = 0;
  for (const r of Array.isArray(json.slides) ? json.slides : []) {
    const i = Number(r?.index);
    if (!indices.includes(i) || !r.slide || typeof r.slide !== "object") continue;
    const old = slides[i];
    const next = build({ ...r.slide, title: (r.slide as { title?: unknown }).title || old.title });
    // Only a real visual replaces a slide; a redesign that came back as text changes nothing.
    if (!VISUAL.has(next.layout) && next.layout !== "cards") continue;
    next.id = old.id;
    if (!next.citations?.length && old.citations?.length) next.citations = old.citations;
    if (!next.notes && old.notes) next.notes = old.notes;
    slides[i] = next;
    n++;
  }
  return n;
}

export interface Picture {
  mediaId: string;
  name: string;
  text: string;
}

const tokens = (s: string) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3));

function slideText(s: Slide): string {
  return [s.title, s.kicker, s.body, ...(s.bullets ?? []), ...(s.cards ?? []).map((c) => `${c.heading} ${c.detail ?? ""}`), ...(s.citations ?? [])].filter(Boolean).join(" ");
}

/** A readable title from a file name: FACERINNA_B5_UKM_Poster_v4_preview.png → FACERINNA B5 UKM Poster. */
export function pictureTitle(name: string): string {
  const base = name.split("/").pop()!.replace(/\.[a-z0-9]+$/i, "");
  return base.replace(/[_-]+/g, " ").replace(/\b(v\d+|preview|final|copy|draft|img|image|scan)\b/gi, "").replace(/\s{2,}/g, " ").trim() || base;
}

/**
 * Every uploaded picture the writer did not use goes on the slide it belongs to:
 * the text slide whose words it shares most becomes an image slide with its points
 * beside the picture; failing that, a new picture slide goes after the slide that
 * matches best. At most `max` pictures. Returns how many were placed.
 */
export function placePictures(slides: Slide[], pics: Picture[], lang: "en" | "ms", max = 6, target = Infinity): number {
  const used = new Set(slides.map((s) => s.image?.mediaId).filter(Boolean));
  let placed = 0;
  for (const pic of pics) {
    if (placed >= max) break;
    if (used.has(pic.mediaId)) continue;
    const want = tokens(`${pic.text === "NONE" ? "" : pic.text} ${pictureTitle(pic.name)}`);
    let best = -1;
    let bestScore = 0;
    let bestAny = -1;
    let bestAnyScore = -1;
    slides.forEach((s, i) => {
      if (STRUCTURAL.has(s.layout) && s.layout !== "section") return;
      const have = tokens(slideText(s));
      let score = 0;
      for (const w of have) if (want.has(w)) score++;
      if (score > bestAnyScore) {
        bestAnyScore = score;
        bestAny = i;
      }
      // A bullet slide with a few points can hold the picture beside them.
      if (s.layout === "bullets" && (s.bullets?.length ?? 0) <= 5 && !s.image && score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    const caption = pictureTitle(pic.name);
    // A deck already at the length asked for keeps it: the picture goes beside the points of the closest slide.
    if (best < 0 && slides.length >= target) {
      let fewest = Infinity;
      slides.forEach((s, i) => {
        if (s.layout === "bullets" && !s.image && (s.bullets?.length ?? 0) <= 5 && (s.bullets?.length ?? 0) < fewest) {
          fewest = s.bullets?.length ?? 0;
          best = i;
        }
      });
      bestScore = best >= 0 ? 2 : 0;
    }
    if (best >= 0 && (bestScore >= 2 || slides.length >= target)) {
      const s = slides[best];
      // An image slide draws its points beside the picture, not a paragraph: keep the paragraph as a point.
      if (s.body && !s.bullets?.length) {
        s.bullets = [s.body];
        delete s.body;
      }
      s.layout = "image";
      s.image = { mediaId: pic.mediaId, caption, alt: caption };
    } else {
      const at = bestAny >= 0 ? bestAny + 1 : Math.max(1, slides.length - 1);
      const lastIsClosing = slides[slides.length - 1]?.layout === "closing";
      const pos = Math.min(at, lastIsClosing ? slides.length - 1 : slides.length);
      slides.splice(pos, 0, {
        id: newId(),
        layout: "image",
        kicker: lang === "ms" ? "DARIPADA SUMBER" : "FROM THE SOURCE",
        title: caption,
        image: { mediaId: pic.mediaId, caption, alt: caption },
      });
    }
    used.add(pic.mediaId);
    placed++;
  }
  return placed;
}
